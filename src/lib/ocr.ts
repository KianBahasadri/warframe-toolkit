import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import type { OcrLine } from './matching';

export interface OcrResult { text: string; lines: OcrLine[] }

export async function recognizeScreenshots(files: File[], onProgress: (message: string, progress: number) => void, onResult: (file: File, result: OcrResult) => void, signal: AbortSignal): Promise<void> {
  let fileIndex = 0;
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
      if (!signal.aborted) onProgress(event.status === 'recognizing text' ? `Reading ${files[fileIndex]?.name || 'screenshot'}` : 'Preparing the screenshot reader', (fileIndex + (event.progress || 0)) / files.length);
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
      const context = canvas.getContext('2d');
      if (!context) { bitmap.close(); throw new Error('Your browser could not prepare this screenshot.'); }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const result = await Promise.race([ready.recognize(canvas, {}, { text: true, blocks: true }), interrupted]);
      const lines: OcrLine[] = result.data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.map(line => ({ text: line.text.trim(), confidence: line.confidence, bbox: line.bbox })))) || [];
      if (!signal.aborted) onResult(file, { text: result.data.text, lines: lines.length ? lines : result.data.text.split('\n').filter(Boolean).map(text => ({ text, confidence: result.data.confidence })) });
      canvas.width = 0; canvas.height = 0;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    stopped = true;
    await worker?.terminate();
  }
}
