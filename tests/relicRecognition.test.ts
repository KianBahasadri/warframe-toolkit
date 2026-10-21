import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchRelicReadings, readRelicName } from '../src/lib/relicRecognition.ts';
import type { RelicReading, TextReading } from '../src/lib/relicRecognition.ts';
import { findRelicRegions } from '../src/lib/relicVision.ts';
import type { OcrLine } from '../src/lib/matching.ts';
import { appendRelicDetections } from '../src/lib/relicMatching.ts';

const names: string[] = JSON.parse(readFileSync(new URL('../src/data/relics.json', import.meta.url), 'utf8')).names;
const twice = (text: string): TextReading[] => [{ text, confidence: 91 }, { text, confidence: 87 }];
const reading = (patch: Partial<RelicReading> = {}): RelicReading => ({ region: { x: 40, y: 60, width: 160, height: 160 }, name: twice('Lith S18 Relic'), refinement: [], quantity: [], labelComplete: true, refinementAbsent: true, counter: 'empty', ...patch });
const detect = (patch: Partial<RelicReading> = {}) => matchRelicReadings([reading(patch)], names, 'screenshot.png')[0];

test('an inspected empty quantity corner establishes one; unread or cropped corners do not', () => {
  const single = detect();
  assert.equal(single.quantity, 1); assert.equal(single.selected, true); assert.deepEqual(single.issues, []);
  for (const counter of ['text', 'cropped'] as const) {
    const unknown = detect({ counter });
    assert.equal(unknown.quantity, null); assert.equal(unknown.selected, false);
  }
  assert.equal(detect({ counter: 'text', quantity: twice('x12') }).quantity, 12);
  assert.equal(detect({ counter: 'text', quantity: twice('x1,234') }).quantity, 1234);
  for (const text of ['12', 'x0', 'x12,34', 'x1000000', 'x?', 'COLLECTED 46/799']) {
    assert.equal(detect({ counter: 'text', quantity: twice(text) }).quantity, null, text);
  }
  const conflicting = detect({ counter: 'text', quantity: [...twice('x3'), ...twice('x8')] });
  assert.equal(conflicting.quantity, null); assert.ok(conflicting.issues.includes('Conflicting quantities'));
  for (const quantity of [[{ text: 'x24', confidence: 50 }, { text: 'x24', confidence: 42 }], [{ text: 'x24', confidence: 99 }], twice('x24').map(value => ({ ...value, view: 0 }))]) {
    const uncertain = detect({ counter: 'text', quantity });
    assert.equal(uncertain.quantity, null); assert.equal(uncertain.selected, false);
    assert.ok(uncertain.issues.includes('Check quantity'));
  }
  assert.equal(detect({ counter: 'text', quantity: twice('x24').map((value, view) => ({ ...value, view })) }).quantity, 24);
  const conflictingViews = detect({ counter: 'text', quantity: [
    { text: 'x24', confidence: 90, view: 0 }, { text: 'x24', confidence: 90, view: 1 }, { text: 'x29', confidence: 90, view: 0 },
  ] });
  assert.equal(conflictingViews.quantity, null); assert.ok(conflictingViews.issues.includes('Conflicting quantities'));
});

test('isolated name readings require agreement, catalog membership and an exact reading', () => {
  assert.equal(detect({ name: [{ text: 'Lith 518 Relic', confidence: 90 }, { text: 'Lith S18 Relic', confidence: 93 }] }).selected, true);
  assert.equal(detect({ name: twice('Lith 518 Relic') }).selected, false);
  assert.equal(detect({ name: [{ text: 'Lith S18 Relic', confidence: 99 }] }).selected, false);
  assert.equal(detect({ name: twice('Lith S99999 Relic') }).name, '');
  const conflicting = detect({ name: [...twice('Axi A21 Relic'), ...twice('Axi A22 Relic')] });
  assert.equal(conflicting.selected, false); assert.ok(conflicting.issues.includes('Check name'));
  const low = detect({ name: [{ text: 'Lith S18 Relic', confidence: 20 }, { text: 'Lith S18 Relic', confidence: 30 }] });
  assert.equal(low.selected, false);
  const catalog = new Map(names.map(name => [name.toLowerCase(), name]));
  assert.deepEqual(readRelicName('Lith BG Relic', catalog), { name: 'Lith B6', exact: false });
  assert.deepEqual(readRelicName('Axi A21 Relic', catalog), { name: 'Axi A21', exact: true });
  assert.equal(readRelicName('Requiem 1 Relic', catalog), null);
});

test('unreadable overlaps retain a known quantity in either order without clearing genuine conflicts', () => {
  const complete = detect({ counter: 'text', quantity: twice('x3') });
  const cropped = detect({ counter: 'cropped' });
  for (const batch of [[complete, cropped], [cropped, complete]]) {
    const result = appendRelicDetections([batch[0]], [batch[1]]);
    assert.equal(result.length, 1); assert.equal(result[0].quantity, 3); assert.equal(result[0].selected, true);
  }
  const different = detect({ counter: 'text', quantity: twice('x4') });
  const conflict = appendRelicDetections([complete], [different]);
  assert.equal(appendRelicDetections(conflict, [complete])[0].quantity, null);
  assert.equal(appendRelicDetections([complete], conflict)[0].selected, false);
  const suggestion = { ...cropped, quantity: 1, issues: ['Confirm quantity 1'] };
  assert.equal(appendRelicDetections([suggestion], [suggestion])[0].selected, false);
  assert.equal(appendRelicDetections([suggestion], [complete])[0].quantity, 3);
});

test('refinements require readable text or a complete single-line label, including Eterna', () => {
  assert.equal(detect({ refinement: twice('[Radiant]'), refinementAbsent: false }).refinement, 'Radiant');
  for (const patch of [{ refinementAbsent: false }, { labelComplete: false }, { refinement: twice('[Radian?]') }, { refinement: [...twice('[Radiant]'), ...twice('[Flawless]')] }]) {
    assert.equal(detect(patch).selected, false);
    assert.ok(detect(patch).issues.includes('Choose refinement'));
  }
  const eterna = detect({ name: twice('Requiem Eterna Relic') });
  assert.equal(eterna.refinement, 'Unrefined'); assert.equal(eterna.selected, true);
  assert.equal(detect({ refinement: twice('[Unrefined]') }).selected, false);
  assert.equal(detect({ name: [], refinementAbsent: false }).selected, false);
});

test('the grid retains unread positions, excludes screen instructions and detects a clipped last row', () => {
  const sample = JSON.parse(readFileSync(new URL('./fixtures/relic-ocr-lines.json', import.meta.url), 'utf8'));
  const lines: OcrLine[] = sample.lines.filter((line: OcrLine) => !/Axi (?:C4|cd)/i.test(line.text));
  lines.push({ text: 'Select a Relic to view its rewards', confidence: 99, bbox: { x0: 2200, x1: 2800, y0: 900, y1: 940 } });
  const regions = findRelicRegions(lines, sample.imageSize);
  assert.equal(regions.length, 20);
  assert.equal(regions[2].anchored, false);
  const clipped = findRelicRegions(lines.filter(line => line.bbox!.y1 < 1790), { width: 3200, height: 1790 });
  assert.equal(clipped.length, 20);
  assert.ok(clipped.slice(-5).every(region => region.y + region.height > 1790));
});
