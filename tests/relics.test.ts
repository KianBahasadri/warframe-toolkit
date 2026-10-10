import test from 'node:test';
import assert from 'node:assert/strict';
import { createEquipment } from '../src/lib/model.ts';
import { createRelic, MAX_RELIC_QUANTITY, parseRelicName, validateRelics } from '../src/lib/relics.ts';
import { parseBackup, relicsCsv } from '../src/lib/storage.ts';

const relic = () => ({ ...createRelic(), name: 'Lith A1', quantity: 3, notes: 'Save for a group' });

test('older backups gain an empty relic collection and retain all equipment data', () => {
  const legacy = {
    version: 1,
    items: [{ ...createEquipment({ name: 'Boltor', slot: 'Primary', variant: 'Base' }), mastered: true, rank: 0, notes: 'Keep for Boltace', incarnon: true }],
    imports: [], referenceNotice: false,
  };
  assert.deepEqual(parseBackup(JSON.stringify(legacy)), { ...legacy, relics: [] });
});

test('backups preserve separate refinements, quantities, and notes for the same relic', () => {
  const inventory = { version: 1, items: [], relics: [relic(), { ...relic(), refinement: 'Radiant', quantity: 0 }], imports: [], referenceNotice: false };
  assert.deepEqual(parseBackup(JSON.stringify(inventory)), inventory);
});

test('relic names normalize case, whitespace, and optional suffix without losing the era', () => {
  assert.deepEqual(parseRelicName('  lith   a1 relic  '), { name: 'Lith A1', era: 'Lith' });
  assert.deepEqual(parseRelicName('requiem iv'), { name: 'Requiem IV', era: 'Requiem' });
  assert.deepEqual(parseRelicName('Vanguard A1'), { name: 'Vanguard A1', era: 'Vanguard' });
  assert.equal(parseRelicName('Lith'), null);
  assert.equal(parseRelicName('Not A1'), null);
  assert.equal(parseRelicName('Lith A1 Radiant'), null);
});

test('duplicate relic stacks and ids are rejected before restoration', () => {
  const first = relic();
  assert.throws(() => validateRelics([first, { ...relic(), name: ' lith a1 relic ' }]), /duplicate/);
  assert.throws(() => validateRelics([first, { ...first, refinement: 'Radiant' }]), /duplicate/);
});

test('invalid relic fields and quantities cannot replace saved data', () => {
  for (const quantity of [-1, 0.5, MAX_RELIC_QUANTITY + 1, '3', null]) {
    assert.throws(() => parseBackup(JSON.stringify({ version: 1, items: [], relics: [{ ...relic(), quantity }], imports: [] })), /quantity/);
  }
  for (const overrides of [{ name: 'Unknown A1' }, { refinement: 'Shiny' }, { notes: null }, { updatedAt: 'invalid' }]) {
    assert.throws(() => validateRelics([{ ...relic(), ...overrides }]), /invalid/);
  }
  assert.throws(() => validateRelics(null), /invalid/);
});

test('relic CSV includes refinement and quantity and escapes spreadsheet formulas', () => {
  const output = relicsCsv([{ ...relic(), notes: '=SUM(1,2)\n"group"' }]);
  assert.ok(output.startsWith('\uFEFF"Relic","Era","Refinement","Quantity","Notes"\r\n'));
  assert.ok(output.includes('"Lith A1","Lith","Intact","3","\'=SUM(1,2)\n""group"""'));
});
