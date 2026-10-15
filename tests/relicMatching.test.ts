import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendRelicDetections, matchRelicOcrLines, mergeRelicObservations, relicImportError, reviewRelicDetection } from '../src/lib/relicMatching.ts';
import type { RelicDetection } from '../src/lib/relicMatching.ts';
import { createRelic, relicKey } from '../src/lib/relics.ts';
import type { Relic } from '../src/lib/relics.ts';
import type { OcrLine } from '../src/lib/matching.ts';

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const sample: { lines: OcrLine[]; imageSize: { width: number; height: number } } = read('./fixtures/relic-ocr-lines.json');
const expected: Pick<Relic, 'name' | 'refinement' | 'quantity'>[] = read('./fixtures/relic-screenshot.json').stacks;
const names: string[] = read('../src/data/relics.json').names;
const detect = (lines = sample.lines, imageSize = sample.imageSize) => matchRelicOcrLines(lines, names, 'relics.png', imageSize);
const fields = (detections: RelicDetection[]) => detections.map(({ name, refinement, quantity }) => ({ name, refinement, quantity }));

test('actual relic OCR text resolves all twenty stacks with quantities tied to the correct refinement', () => {
  const result = detect();
  assert.deepEqual(fields(result), expected);
  assert.ok(result.filter(item => item.quantity === 1).every(item => !item.selected && item.issues.includes('Confirm quantity 1')));
  assert.ok(result.find(item => item.name === 'Lith S18')?.issues.includes('Check name'));
  assert.ok(result.find(item => item.name === 'Lith L8' && item.refinement === 'Intact')?.selected);
  assert.equal(new Set(result.map(item => relicKey({ name: item.name, refinement: item.refinement! }))).size, 20);
});

test('browser OCR of the supplied screenshot suggests S for a misread dollar sign and requires review', () => {
  const browserSample = read('./fixtures/relic-ocr-browser-lines.json');
  const result = detect(browserSample.lines, browserSample.imageSize);
  assert.deepEqual(fields(result), expected);
  const corrected = result.find(item => item.name === 'Axi S21')!;
  assert.match(corrected.rawText, /Axi \$21 Relic/);
  assert.ok(corrected.issues.includes('Check name'));
  assert.equal(corrected.selected, false);
  assert.ok(result.filter(item => item.quantity === 1).every(item => !item.selected && item.issues.includes('Confirm quantity 1')));
});

test('relic glyph suggestions preserve exact variants, catalog membership and conflicting readings', () => {
  const label = sample.lines.find(line => line.text === 'Axi S21 Relic')!;
  const match = (...text: string[]) => detect(text.map((text, index) => ({ ...label, text, confidence: 99 - index, pass: index })));
  assert.equal(match('Axi $21 Relic')[0].name, 'Axi S21');
  assert.equal(match('Axi $ 2 1 Relic')[0].name, 'Axi S21');
  for (const text of ['Axi $99999 Relic', 'Axi 521 Relic', 'Axi S2I Relic', 'Axi $2I Relic', 'Requiem $21 Relic']) {
    const result = match(text)[0];
    assert.equal(result.name, '', text);
    assert.ok(result.issues.includes('Check name'), text);
    assert.equal(result.selected, false, text);
  }
  assert.deepEqual(match('Axi $21 Rellc'), []);
  const exact = match('Axi $21 Relic', 'Axi S21 Relic')[0];
  assert.equal(exact.name, 'Axi S21');
  assert.equal(exact.rawText, 'Axi S21 Relic');
  assert.ok(!exact.issues.includes('Check name'));
  const conflict = match('Axi $21 Relic', 'Axi S2 Relic')[0];
  assert.equal(conflict.name, 'Axi S2');
  assert.ok(conflict.issues.includes('Check name'));
  assert.equal(conflict.selected, false);
});

test('geometry tolerates scaled and offset OCR coordinates without using screen totals as counts', () => {
  const lines = sample.lines.map(line => ({ ...line, bbox: line.bbox && { x0: line.bbox.x0 * 0.7 + 40, x1: line.bbox.x1 * 0.7 + 40, y0: line.bbox.y0 * 0.7 + 25, y1: line.bbox.y1 * 0.7 + 25 } }));
  lines.push({ text: 'COLLECTED 46/799 RADIANT 17/799', confidence: 99, bbox: { x0: 500, y0: 90, x1: 950, y1: 115 } });
  assert.deepEqual(fields(detect(lines, { width: 2280, height: 1450 })), expected);
});

test('unread, conflicting and cropped refinement labels never become Intact', () => {
  const noRadiant = sample.lines.filter(line => !/radiant/i.test(line.text));
  const missing = detect(noRadiant);
  assert.equal(missing.length, expected.length);
  expected.forEach((stack, index) => {
    if (stack.refinement === 'Radiant') {
      assert.equal(missing[index].refinement, null, stack.name);
      assert.equal(missing[index].selected, false);
    }
  });
  const corrupted = sample.lines.map(line => /radiant/i.test(line.text) ? { ...line, text: '[Radian?]' } : line);
  assert.ok(detect(corrupted).filter(item => item.refinement === null).length >= 6);
  const cropped = detect(sample.lines.filter(line => line.bbox && line.bbox.y0 < 1780), { width: 3200, height: 1780 });
  assert.equal(cropped.find(item => item.name === 'Lith S18')?.refinement, null);
  const conflict = [...sample.lines, { text: '[Flawless]', confidence: 99, bbox: { x0: 607, y0: 976, x1: 718, y1: 1004 } }];
  assert.equal(detect(conflict).find(item => item.name === 'Axi H4' && item.recognizedKey.includes('unknown:'))?.refinement, null);
});

test('overlapping screenshots never sum counts, and conflicts require a quantity decision', () => {
  const first = detect();
  assert.deepEqual(fields(appendRelicDetections(first, detect())), expected);
  const changed = first.map(item => item.name === 'Axi C12' ? { ...item, quantity: 4 } : item);
  const merged = appendRelicDetections(first, changed);
  const conflict = merged.find(item => item.name === 'Axi C12')!;
  assert.equal(conflict.quantity, null);
  assert.equal(conflict.selected, false);
  assert.ok(conflict.issues.includes('Conflicting quantities'));
  const selected = merged.map(item => ({ ...item, selected: true }));
  assert.match(relicImportError(selected)!, /quantity/);
  const reviewed = merged.map(item => item.id === conflict.id ? reviewRelicDetection(item, { quantity: 2, selected: true }) : item);
  assert.equal(appendRelicDetections(reviewed, changed).find(item => item.id === conflict.id)?.quantity, 2);
});

test('name corrections and deselections survive later screenshots; duplicate choices cannot import', () => {
  const first = detect();
  const corrected = first.map((item, index) => index === 0 ? reviewRelicDetection(item, { name: 'Meso B1', quantity: 7, selected: false }) : item);
  assert.equal(appendRelicDetections(corrected, detect()).length, first.length);
  assert.deepEqual(appendRelicDetections(corrected, detect())[0], corrected[0]);
  const duplicate = first.map((item, index) => ({ ...item, selected: true, ...(index === 1 ? { name: first[0].name, refinement: first[0].refinement } : {}) }));
  assert.match(relicImportError(duplicate)!, /only one row/);
  assert.match(relicImportError([{ ...first[0], selected: true, quantity: -1 }])!, /quantity/);
  assert.match(relicImportError([{ ...first[0], selected: true, name: 'Requiem Eterna' }])!, /unrefined/);
});

test('snapshot merge replaces only reviewed quantities, preserving notes, ids and absent stacks', () => {
  const saved = [{ ...createRelic(), name: 'Axi C12', quantity: 8, notes: 'Keep for squad' }, { ...createRelic(), name: 'Neo N1', quantity: 7, notes: 'Not on screen' }];
  const before = structuredClone(saved);
  const result = mergeRelicObservations(saved, expected);
  assert.deepEqual(saved, before);
  assert.equal(result.added, 19);
  assert.equal(result.updated, 1);
  assert.deepEqual(result.relics[0], { ...saved[0], quantity: 3, updatedAt: result.relics[0].updatedAt });
  assert.deepEqual(result.relics[1], saved[1]);
  const again = mergeRelicObservations(result.relics, expected);
  assert.equal(again.updated, 0);
  assert.equal(again.added, 0);
  assert.deepEqual(again.relics, result.relics);
  assert.throws(() => mergeRelicObservations(saved, [expected[0], expected[0]]), /duplicate/);
  assert.throws(() => mergeRelicObservations(saved, [{ ...expected[0], quantity: NaN }]), /Invalid/);
  assert.throws(() => mergeRelicObservations(saved, [{ ...expected[0], name: 'Requiem Eterna' }]), /Invalid/);
});
