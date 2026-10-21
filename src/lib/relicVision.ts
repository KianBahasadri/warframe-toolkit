import type { OcrLine } from './matching.ts';
import type { PixelImage } from './codex.ts';

export interface ImageRegion { x: number; y: number; width: number; height: number }
export interface RelicRegion extends ImageRegion { textHeight: number; anchored: boolean; label: ImageRegion; counter: ImageRegion }
export type TextColor = readonly [number, number, number];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const center = (line: OcrLine) => (line.bbox!.x0 + line.bbox!.x1) / 2;
const light = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722;

/** Layout only: these readings locate entries, never establish their names. */
export function findRelicRegions(lines: OcrLine[], image: Pick<PixelImage, 'width' | 'height'>): RelicRegion[] {
  const anchors = lines.filter(line => line.bbox && /\bRel[iIl1]c\b/i.test(line.text) && /^(?:L[il1]th|Mes[o0]|Ne[o0]|Ax[il1]|Requ[il1]em|Vanguard)\s+/i.test(line.text)
    && line.bbox.x1 - line.bbox.x0 > (line.bbox.y1 - line.bbox.y0) * 1.8);
  if (anchors.length < 3) return [];
  const heights = anchors.map(line => line.bbox!.y1 - line.bbox!.y0).sort((a, b) => a - b);
  const textHeight = heights[Math.floor(heights.length * 0.25)];
  const rows: OcrLine[][] = [];
  for (const line of [...anchors].sort((a, b) => a.bbox!.y1 - b.bbox!.y1)) {
    const row = rows.find(row => Math.abs(median(row.map(item => item.bbox!.y1)) - line.bbox!.y1) < textHeight * 2.5);
    if (row) row.push(line); else rows.push([line]);
  }
  const centers: number[] = [];
  for (const x of anchors.map(center).sort((a, b) => a - b)) {
    if (!centers.some(other => Math.abs(other - x) < textHeight * 2)) centers.push(x);
  }
  const steps = centers.slice(1).map((x, index) => x - centers[index]).filter(step => step > textHeight * 5);
  if (!steps.length || (centers.length < 3 && rows.length < 2)) return [];
  const step = Math.min(...steps);
  // Reject unrelated text clusters. The crop scale follows the measured grid.
  if (step > image.width * 0.7 || steps.some(value => Math.abs(value / step - Math.round(value / step)) > 0.12)) return [];
  const measured = centers.map(x => median(anchors.filter(line => Math.abs(center(line) - x) < textHeight * 2).map(center)));
  const columns = Array.from({ length: Math.round((measured.at(-1)! - measured[0]) / step) + 1 }, (_, index) => {
    const x = measured[0] + index * step;
    return measured.find(value => Math.abs(value - x) < textHeight) ?? x;
  });
  const size = step * 0.78;
  const bottoms = rows.map(row => {
    const annotations = lines.filter(line => line.bbox && /\[|\b(?:Radiant|Flawless|Exceptional|Intact)\b/i.test(line.text)
      && row.some(name => Math.abs(center(name) - center(line)) < size * 0.25 && line.bbox!.y0 >= name.bbox!.y1 - textHeight * 0.3 && line.bbox!.y0 < name.bbox!.y1 + textHeight * 1.5));
    return Math.max(...row.map(line => line.bbox!.y1), ...annotations.map(line => line.bbox!.y1)) + textHeight * 0.3;
  });
  const rowStep = bottoms.length >= 3 ? median(bottoms.slice(1).map((bottom, index) => bottom - bottoms[index])) : null;
  const origin = rowStep ? median(bottoms.map((bottom, index) => bottom - index * rowStep)) : 0;
  return rows.flatMap((row, index) => {
    // A clipped final refinement must not move the entire entry upward and
    // turn its remaining name into an apparently complete Intact label.
    const predicted = rowStep ? origin + index * rowStep : bottoms[index];
    const bottom = Math.abs(predicted - bottoms[index]) < textHeight * 2 ? Math.max(predicted, bottoms[index]) : bottoms[index];
    const labelHeight = Math.max(textHeight * 2.9, bottom - Math.min(...row.map(line => line.bbox!.y0)) + textHeight * 0.3);
    return columns.map(x => ({ x: x - size / 2, y: bottom - size, width: size, height: size, textHeight, anchored: row.some(line => Math.abs(center(line) - x) < textHeight * 2),
      label: { x: x - size / 2, y: bottom - labelHeight, width: size, height: labelHeight },
      counter: { x: x - size / 2 + size * 0.025, y: bottom - size + size * 0.025, width: size * 0.61, height: size * 0.19 },
    }));
  });
}

/** Estimate the UI ink from repeated labels, rather than hardcoding gold. */
export function relicTextColor(image: PixelImage, lines: OcrLine[]): TextColor {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (const line of lines.filter(line => line.bbox && /\bRel[iIl1]c\b/i.test(line.text))) {
    const box = line.bbox!;
    for (let y = Math.max(0, Math.floor(box.y1 - (box.y1 - box.y0) * 0.6)); y < Math.min(image.height, box.y1); y++) {
      for (let x = Math.max(0, Math.floor(box.x0)); x < Math.min(image.width, box.x1); x++) {
        const p = (y * image.width + x) * 4;
        const [r, g, b] = image.data.subarray(p, p + 3);
        if (light(r, g, b) < 100) continue;
        const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
        const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
        bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b; buckets.set(key, bucket);
      }
    }
  }
  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  return best ? [best.r / best.count, best.g / best.count, best.b / best.count] : [220, 220, 220];
}

export function regionVisible(image: Pick<PixelImage, 'width' | 'height'>, region: ImageRegion): boolean {
  return region.x >= 0 && region.y >= 0 && region.x + region.width <= image.width && region.y + region.height <= image.height;
}

/** Isolate uniform UI text from relic artwork. The second view retains softer
 * edge pixels so resampling or compression doesn't depend on one threshold. */
export function relicTextMask(image: PixelImage, region: ImageRegion, color: TextColor, mode: 'ink' | 'soft' | 'contrast' = 'ink'): PixelImage {
  const width = Math.ceil(region.width), height = Math.ceil(region.height);
  const data = new Uint8ClampedArray(width * height * 4);
  const targetLight = light(...color);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ix = Math.floor(region.x + x), iy = Math.floor(region.y + y);
    const p = (y * width + x) * 4;
    let value = 255;
    if (ix >= 0 && iy >= 0 && ix < image.width && iy < image.height) {
      const s = (iy * image.width + ix) * 4;
      const r = image.data[s], g = image.data[s + 1], b = image.data[s + 2];
      const luminance = light(r, g, b);
      const chroma = Math.max(Math.abs((r - g) - (color[0] - color[1])), Math.abs((g - b) - (color[1] - color[2])));
      const soft = mode !== 'ink';
      const ink = luminance >= targetLight * (soft ? 0.64 : 0.8) && luminance <= targetLight * 1.2 && chroma < (soft ? 38 : 25);
      if (mode === 'contrast' && chroma < 45) value = 255 - Math.max(0, Math.min(255, (luminance / targetLight - 0.35) * 510));
      else value = ink ? 0 : 255;
    }
    data[p] = data[p + 1] = data[p + 2] = value; data[p + 3] = 255;
  }
  return { width, height, data };
}

/** Horizontal bands with text-sized ink. Blank counters are distinct from
 * counters with unreadable ink; only the former can establish quantity one. */
export function relicTextBands(mask: PixelImage, textHeight: number): ImageRegion[] {
  const rows: number[] = [];
  for (let y = 0; y < mask.height; y++) {
    let count = 0;
    for (let x = 0; x < mask.width; x++) if (!mask.data[(y * mask.width + x) * 4]) count++;
    if (count >= Math.max(2, textHeight * 0.09)) rows.push(y);
  }
  const groups: number[][] = [];
  for (const y of rows) {
    const group = groups.at(-1);
    if (group && y - group.at(-1)! <= Math.max(2, textHeight * 0.18)) group.push(y); else groups.push([y]);
  }
  return groups.flatMap(group => {
    const y = group[0], height = group.at(-1)! - y + 1;
    let left = mask.width, right = 0, ink = 0;
    for (let row = y; row < y + height; row++) for (let x = 0; x < mask.width; x++) if (!mask.data[(row * mask.width + x) * 4]) { left = Math.min(left, x); right = Math.max(right, x + 1); ink++; }
    return height >= textHeight * 0.4 && ink > textHeight * textHeight * 0.12 ? [{ x: left, y, width: right - left, height }] : [];
  });
}
