import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import type { OcrLine } from './matching';

export interface OcrResult { text: string; lines: OcrLine[] }

export async function recognizeScreenshots(files: File[], onProgress: (message: string, progress: number) => void, onResult: (file: File, result: OcrResult) => void, signal: AbortSignal): Promise<void> {
  let fileIndex = 0;
  let pass = 0;
  const passes = 2;
  let worker: Worker | undefined;
  let stopped = false;
  let rejectStop: (reason: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => { rejectStop = reject; });
  const abort = () => { stopped = true; rejectStop(new DOMException('Import canceled', 'AbortError')); void worker?.terminate(); };
  if (signal.aborted) throw new DOMException('Import canceled', 'AbortError');
  signal.addEventListener('abort', abort, { once: true });
  const loading = createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr',
    logger: event => {
      if (!signal.aborted && event.status === 'recognizing text') onProgress(`Reading ${files[fileIndex]?.name || 'screenshot'}`, (fileIndex + (pass + (event.progress || 0)) / passes) / files.length);
    },
    errorHandler: error => rejectStop(new Error(String(error))),
  }).then(ready => {
    if (stopped) { void ready.terminate(); throw new DOMException('Import canceled', 'AbortError'); }
    worker = ready;
    return ready;
  });
  try {
    const ready = await Promise.race([loading, interrupted]);
    await Promise.race([ready.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' }), interrupted]);
    for (fileIndex = 0; fileIndex < files.length; fileIndex++) {
      if (signal.aborted) throw new DOMException('Import canceled', 'AbortError');
      const file = files[fileIndex];
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 32_000_000) { bitmap.close(); throw new Error(`${file.name} is too large. Use an image below 32 megapixels.`); }
      const scale = Math.min(2, 3200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) { bitmap.close(); throw new Error('Your browser could not prepare this screenshot.'); }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      try {
        const original = context.getImageData(0, 0, canvas.width, canvas.height);
        const prepared = context.createImageData(canvas.width, canvas.height);
        const lines: OcrLine[] = [];
        const texts: string[] = [];
        // Two luminance passes separate text from the game's textured backdrop.
        // Each starts from the original pixels and works without theme colors or
        // fixed inventory coordinates. Keep pass IDs for wrapped-rank pairing.
        for (pass = 0; pass < passes; pass++) {
          if (signal.aborted) throw new DOMException('Import canceled', 'AbortError');
          for (let i = 0; i < original.data.length; i += 4) {
            const luminance = original.data[i] * 0.2126 + original.data[i + 1] * 0.7152 + original.data[i + 2] * 0.0722;
            const value = pass === 0 ? 255 - Math.max(0, Math.min(255, (luminance - 45) * 2.5)) : luminance > 135 ? 0 : 255;
            prepared.data[i] = prepared.data[i + 1] = prepared.data[i + 2] = value;
            prepared.data[i + 3] = 255;
          }
          context.putImageData(prepared, 0, 0);
          const result = await Promise.race([ready.recognize(canvas, {}, { text: true, blocks: true }), interrupted]);
          const recognized = result.data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.map(line => ({ text: line.text.trim(), confidence: line.confidence, bbox: line.bbox, pass })))) || [];
          texts.push(result.data.text);
          lines.push(...(recognized.length ? recognized : result.data.text.split('\n').filter(Boolean).map(text => ({ text, confidence: result.data.confidence, pass }))));
        }
        if (!signal.aborted) onResult(file, { text: texts.join('\n'), lines });
      } finally {
        canvas.width = 0; canvas.height = 0;
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
    stopped = true;
    await worker?.terminate();
  }
}
