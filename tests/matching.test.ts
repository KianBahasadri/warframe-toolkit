import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchOcrLines, reviewDetection } from '../src/lib/matching.ts';
import type { OcrLine } from '../src/lib/matching.ts';
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
test('rank below the equipment cap does not clear or imply full mastery', () => {
  const results = match('PARACESIS RANK 30\nBOLTOR MASTERED\nWISP PRIME UNRANKED');
  assert.equal(results.find(result => result.item.name === 'Paracesis')?.rank, 30);
  assert.equal(results.find(result => result.item.name === 'Paracesis')?.mastered, false);
  assert.equal(results.find(result => result.item.name === 'Boltor')?.mastered, true);
  assert.equal(results.find(result => result.item.name === 'Wisp Prime')?.rank, 0);
  assert.equal(match('BOLTOR NOT MASTERED')[0]?.mastered, false);
});
test('reads bracketed ranks and establishes mastery at each catalog rank cap', () => {
  for (const name of ['Boltor', 'Vasto', 'MK1-Furax', 'Wisp Prime']) {
    assert.equal(match(`${name} [30]`)[0]?.mastered, true, name);
    assert.equal(match(`${name} [29]`)[0]?.mastered, false, name);
  }
  for (const name of ['Paracesis', 'Kuva Bramma', 'Tenet Arca Plasmor', 'Coda Hema']) {
    for (const rank of [0, 30, 38, 40]) {
      const detection = match(`${name} [${rank}]`)[0];
      assert.equal(detection?.rank, rank, name);
      assert.equal(detection?.mastered, rank === 40, name);
    }
  }
  assert.equal(match('Vasto [0]')[0]?.rank, 0);
  assert.equal(match('Boltor RANK: 30')[0]?.mastered, true);
  assert.equal(match('Boltor MAX')[0]?.mastered, false);
  for (const text of ['Boltor [99]', 'Boltor [40]', 'Boltor [30] RANK 0']) {
    assert.equal(match(text)[0]?.rank, null, text);
    assert.equal(match(text)[0]?.mastered, false, text);
  }
});
test('gilding-dependent and non-masterable equipment need separate mastery evidence', () => {
  for (const name of ['Balla', 'Catchmoon', 'Mote Amp', 'Artemis Bow']) {
    assert.equal(match(`${name} [30]`)[0]?.mastered, false, name);
  }
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
  assert.deepEqual(match('Lato\'V andal [30]').map(entry => entry.item.name), ['Lato Vandal']);
  assert.deepEqual(match('MK l-Furax [30]').map(entry => entry.item.name), ['MK1-Furax']);
  assert.deepEqual(match('Déra [30]').map(entry => entry.item.name), ['Dera']);
  const damaged = match('Probotcis Cernos [30]');
  assert.deepEqual(damaged.map(entry => entry.item.name), ['Proboscis Cernos']);
  assert.equal(damaged[0]?.selected, false);
  assert.deepEqual(match('Unknown Cernos [30]'), []);
  assert.deepEqual(match('Wisp Pri me [30]').map(entry => entry.item.name), ['Wisp Prime']);
  assert.equal(match('Bo', 53).length, 0);
  assert.equal(match('Bo [30]', 95)[0]?.item.name, 'Bo');
});

const label = (text: string, x0: number, y0: number, x1: number, y1: number, pass = 0): OcrLine => ({ text, confidence: 95, bbox: { x0, y0, x1, y1 }, pass });
test('pairs a wrapped inventory rank only with a uniquely aligned name in the same OCR pass', () => {
  const name = label('Proboscis Cernos', 100, 100, 300, 140);
  const rank = label('[30]', 180, 146, 220, 178);
  const detect = (lines: OcrLine[], source: 'inventory' | 'arsenal' = 'inventory') => matchOcrLines(lines, catalog, 'wrapped.png', source).find(entry => entry.item.name === 'Proboscis Cernos');
  assert.equal(detect([name, rank])?.rank, 30);
  assert.equal(detect([name, rank])?.mastered, true);
  assert.equal(detect([name, rank], 'arsenal')?.rank, null);
  assert.equal(detect([name, { ...rank, pass: 1 }])?.rank, null);
  assert.equal(detect([name, { ...rank, confidence: 40 }])?.rank, null);
  assert.equal(detect([name, label('[30]', 320, 146, 360, 178)])?.rank, null);
  assert.equal(detect([name, label('[30]', 180, 210, 220, 242)])?.rank, null);
  assert.equal(detect([name, rank, label('Cernos', 120, 100, 280, 140)])?.rank, null);
  assert.equal(detect([name, rank, label('[0]', 180, 144, 220, 176)])?.rank, null);
});
test('bare wrapped digits need supporting bracketed card labels on the same row', () => {
  const lines = [label('Proboscis Cernos', 100, 100, 300, 140), label('30', 180, 146, 220, 178)];
  assert.equal(matchOcrLines(lines, catalog, 'rank.png', 'inventory')[0]?.rank, null);
  const neighbors = [label('Phantasma [0]', -180, 146, 80, 178), label('Rubico [12]', 350, 146, 550, 178)];
  const results = matchOcrLines([...lines, ...neighbors], catalog, 'rank.png', 'inventory');
  assert.equal(results.find(entry => entry.item.name === 'Proboscis Cernos')?.rank, 30);
  assert.equal(results.find(entry => entry.item.name === 'Phantasma')?.rank, 0);
  assert.equal(results.find(entry => entry.item.name === 'Rubico')?.rank, 12);
});
test('review corrections recompute automatic mastery and preserve deliberate checkbox choices', () => {
  const boltor = match('Boltor [30]')[0];
  const paracesis = catalog.find(item => item.name === 'Paracesis')!;
  assert.equal(reviewDetection(boltor, { item: paracesis }).mastered, false);
  assert.equal(reviewDetection(boltor, { rank: 0 }).mastered, false);
  assert.equal(reviewDetection(match('Paracesis [30]')[0], { rank: 40 }).mastered, true);
  const manuallyCleared = reviewDetection(boltor, { mastered: false });
  assert.equal(reviewDetection(manuallyCleared, { rank: 30 }).mastered, false);
  const manuallyMastered = reviewDetection(match('Boltor [0]')[0], { mastered: true });
  assert.equal(reviewDetection(manuallyMastered, { rank: 0 }).mastered, true);
  assert.equal(reviewDetection(match('Boltor MASTERED')[0], { rank: 0 }).mastered, true);
});
