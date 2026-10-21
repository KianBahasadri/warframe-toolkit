import { PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import type { PixelImage } from './codex';
import type { OcrLine } from './matching';
import { findRelicRegions, regionVisible, relicTextBands, relicTextColor, relicTextMask } from './relicVision';
import type { ImageRegion } from './relicVision';
import type { RelicReading, TextReading } from './relicRecognition';
import { matchRelicReadings, readRelicName } from './relicRecognition';

function canvasFor(image: PixelImage) {
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare the relic labels.');
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas;
}

async function readBand(worker: Worker, mask: PixelImage, band: ImageRegion, pass: number, interrupted: Promise<never>): Promise<TextReading> {
  const source = canvasFor(mask), input = document.createElement('canvas');
  try {
    const scale = 36 / band.height, stretch = pass === 0 ? 1.2 : pass === 1 ? 1 : 1.1;
    const inset = 2;
    const x = Math.max(0, band.x - inset), y = Math.max(0, band.y - inset);
    const width = Math.min(mask.width, band.x + band.width + inset) - x, height = Math.min(mask.height, band.y + band.height + inset) - y;
    input.width = Math.ceil(width * scale * stretch) + 32;
    input.height = Math.ceil(height * scale) + 32;
    const context = input.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, input.width, input.height);
    context.drawImage(source, x, y, width, height, 16, 16, width * scale * stretch, height * scale);
    const result = await Promise.race([worker.recognize(input), interrupted]);
    return { text: result.data.text.trim(), confidence: result.data.confidence };
  } finally { source.width = source.height = input.width = input.height = 0; }
}

/** Whole-screen OCR finds the grid only. All importable values are reread from
 * isolated fields, in two independently prepared views of the original pixels. */
export async function recognizeRelics(worker: Worker, original: PixelImage, lines: OcrLine[], interrupted: Promise<never>, onProgress: (fraction: number) => void): Promise<RelicReading[] | undefined> {
  const regions = findRelicRegions(lines, original);
  if (!regions.length) return undefined;
  const { relicNames } = await import('../data/relicCatalog');
  const names = new Map(relicNames.map(name => [name.toLowerCase(), name]));
  const color = relicTextColor(original, lines);
  const readings: RelicReading[] = [];
  await Promise.race([worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, user_defined_dpi: '300' }), interrupted]);
  try {
    for (const [index, region] of regions.entries()) {
      const label = relicTextMask(original, region.label, color);
      const labelBands = relicTextBands(label, region.textHeight).filter(band => band.width > region.textHeight * 2.5);
      if (!labelBands.length) {
        if (region.anchored) readings.push({ region, name: [], refinement: [], quantity: [], labelComplete: false, refinementAbsent: false, counter: 'text' });
        onProgress((index + 1) / regions.length); continue;
      }
      const counter = relicTextMask(original, region.counter, color);
      const softCounter = relicTextMask(original, region.counter, color, 'soft');
      const counterBands = relicTextBands(counter, region.textHeight).filter(band => band.x < region.width * 0.2);
      if (!counterBands.length) counterBands.push(...relicTextBands(softCounter, region.textHeight).filter(band => band.x < region.width * 0.2));
      const labelComplete = regionVisible(original, region.label);
      const observation: RelicReading = { region, name: [], refinement: [], quantity: [], labelComplete,
        refinementAbsent: false,
        counter: !regionVisible(original, region.counter) ? 'cropped' : counterBands.length ? 'text' : 'empty' };
      // Visible but unreadable ink is never equivalent to an absent badge.
      // The badge begins at the left edge. Artwork farther right is not a badge.
      let ink = 0;
      for (let y = 0; y < softCounter.height; y++) for (let x = 0; x < region.width * 0.2; x++) if (!softCounter.data[(y * softCounter.width + x) * 4]) ink++;
      if (observation.counter === 'empty' && ink > region.textHeight * region.textHeight * 0.04) observation.counter = 'text';
      const fields = labelBands.map(band => ({ band, readings: [] as TextReading[] }));
      for (let pass = 0; pass < 2; pass++) {
        const labelMask = pass ? relicTextMask(original, region.label, color, 'soft') : label;
        await Promise.race([worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 []' }), interrupted]);
        for (const field of fields) field.readings.push(await readBand(worker, labelMask, field.band, pass, interrupted));
        if (observation.counter === 'text' && counterBands.length) {
          await Promise.race([worker.setParameters({ tessedit_char_whitelist: 'xX0123456789,' }), interrupted]);
          observation.quantity.push(await readBand(worker, pass ? softCounter : counter, counterBands[0], pass, interrupted));
        }
      }
      const score = (field: typeof fields[number]) => field.readings.reduce((total, reading) => total + (readRelicName(reading.text, names) ? reading.confidence + 100 : 0), 0);
      const nameField = [...fields].sort((a, b) => score(b) - score(a))[0];
      const refinementFields = fields.filter(field => field.band.y > nameField.band.y);
      observation.name = nameField.readings;
      observation.refinement = refinementFields.flatMap(field => field.readings);
      observation.refinementAbsent = labelComplete && !refinementFields.length && label.height - (nameField.band.y + nameField.band.height) < region.textHeight * 1.2;
      const issues = matchRelicReadings([observation], relicNames, '')[0].issues;
      if (issues.includes('Check name') || issues.includes('Choose refinement')) {
        await Promise.race([worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 []' }), interrupted]);
        const contrast = relicTextMask(original, region.label, color, 'contrast');
        if (issues.includes('Check name')) observation.name.push(await readBand(worker, contrast, nameField.band, 2, interrupted));
        if (issues.includes('Choose refinement')) for (const field of refinementFields) observation.refinement.push(await readBand(worker, contrast, field.band, 2, interrupted));
      }
      if (observation.counter === 'text' && counterBands.length && issues.some(issue => /quantit/i.test(issue))) {
        await Promise.race([worker.setParameters({ tessedit_char_whitelist: 'xX0123456789,' }), interrupted]);
        observation.quantity.push(await readBand(worker, relicTextMask(original, region.counter, color, 'contrast'), counterBands[0], 2, interrupted));
      }
      readings.push(observation);
      onProgress((index + 1) / regions.length);
    }
    return readings.length ? readings : undefined;
  } finally { await Promise.race([worker.setParameters({ tessedit_char_whitelist: '', user_defined_dpi: '0' }), interrupted]); }
}
