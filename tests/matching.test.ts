import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchOcrLines } from '../src/lib/matching.ts';
import type { CatalogItem } from '../src/lib/model.ts';

const catalog: CatalogItem[] = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8')).items;
const match = (text: string, confidence = 95, source: 'inventory' | 'arsenal' = 'inventory') => matchOcrLines(text.split('\n').map(text => ({ text, confidence })), catalog, 'inventory.png', source);

test('matches distinct variants without also adding the base equipment', () => {
  assert.deepEqual(match('BRATON PRIME\nMK1-PARIS\nLATO VANDAL').map(result => result.item.name), ['Braton Prime', 'MK1-Paris', 'Lato Vandal']);
});
test('reads several names on one OCR line without assigning a shared rank', () => {
  const results = match('BOLTOR   BRATON PRIME   RANK 30');
  assert.equal(results.length, 2);
  assert.ok(results.every(result => result.rank === null));
});
test('rank is distinct from full mastery; only explicit same-line mastery is read', () => {
  const results = match('PARACESIS RANK 30\nBOLTOR MASTERED\nWISP PRIME UNRANKED');
  assert.equal(results.find(result => result.item.name === 'Paracesis')?.rank, 30);
  assert.equal(results.find(result => result.item.name === 'Paracesis')?.mastered, false);
  assert.equal(results.find(result => result.item.name === 'Boltor')?.mastered, true);
  assert.equal(results.find(result => result.item.name === 'Wisp Prime')?.rank, 0);
  assert.equal(match('BOLTOR NOT MASTERED')[0]?.mastered, false);
});
test('does not import blueprints or equipment parts as complete owned items', () => {
  assert.deepEqual(match('BRATON PRIME BLUEPRINT\nWISP PRIME CHASSIS\nLEX PRIME RECEIVER'), []);
});
test('Arsenal recognition leaves ownership for user review', () => {
  assert.equal(match('BOLTOR', 95, 'arsenal')[0].owned, false);
  assert.equal(match('BOLTOR NOT OWNED')[0].owned, false);
  assert.equal(match('BOLTOR')[0].owned, true);
});
test('fuzzy or low confidence matches require selection by the user', () => {
  const fuzzy = match('B0LTOR');
  assert.equal(fuzzy[0]?.item.name, 'Boltor');
  assert.equal(fuzzy[0]?.selected, false);
  assert.equal(match('BOLTOR', 35)[0].selected, false);
  assert.deepEqual(match('RANK 30\nINVENTORY\nCAPACITY\nSORT BY NAME'), []);
});
test('duplicate names produce one candidate, preserving the best recognition', () => {
  const result = matchOcrLines([{ text: 'B0LTOR', confidence: 83 }, { text: 'BOLTOR', confidence: 98 }], catalog, 'test.png', 'inventory');
  assert.equal(result.length, 1);
  assert.equal(result[0].exact, true);
});
test('does not silently substitute a base item for an unrecognized variant', () => {
  const result = match('BOLTOR PRIME');
  assert.deepEqual(result.map(entry => entry.item.name), ['Boltor Prime']);
  assert.deepEqual(match('WISP VANDAL'), []);
});
