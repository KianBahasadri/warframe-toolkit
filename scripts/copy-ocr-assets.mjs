import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = resolve(root, 'public/ocr');
await mkdir(target, { recursive: true });
await cp(resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'), resolve(target, 'worker.min.js'));
const core = resolve(root, 'node_modules/tesseract.js-core');
for (const file of await readdir(core)) {
  if (/\.wasm(\.js)?$/.test(file)) await cp(resolve(core, file), resolve(target, file));
}
await cp(resolve(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), resolve(target, 'eng.traineddata.gz'));
console.log('Local OCR worker, WebAssembly, and English model ready.');
