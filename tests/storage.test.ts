import test from 'node:test';
import assert from 'node:assert/strict';
import { createEquipment, mergeObservations } from '../src/lib/model.ts';
import { inventoryCsv, parseBackup, warframesCsv } from '../src/lib/storage.ts';

const item = () => createEquipment({ name: 'Boltor', slot: 'Primary', variant: 'Base' });

test('screenshot imports preserve planning fields and previous mastery', () => {
  const before = { ...item(), mastered: true, dontKeep: true, notes: 'Keep for Boltace', upgraded: 'Yes' as const, override: 'Keep' as const, incarnon: true, incarnonInstalled: 'Yes' as const, helminth: 'No' as const, rank: 30 };
  const incoming = { ...item(), owned: false, mastered: false, rank: 0, notes: '' };
  const result = mergeObservations([before], [incoming]);
  assert.equal(result.items.length, 1);
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.deepEqual(result.items[0], { ...before, rank: 0, source: incoming.source, updatedAt: incoming.updatedAt });
});
test('repeated detections cannot create duplicate inventory records', () => {
  const first = item();
  const result = mergeObservations([], [first, { ...item(), name: 'BOLTOR' }]);
  assert.equal(result.items.length, 1);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.items[0].id, first.id);
});
test('backup roundtrip retains every spreadsheet field', () => {
  const inventory = { version: 1, items: [item()], relics: [], imports: [], referenceNotice: false };
  assert.deepEqual(parseBackup(JSON.stringify(inventory)), inventory);
});
test('malformed or duplicate backups are rejected before replacing data', () => {
  const entry = item();
  assert.throws(() => parseBackup('not json'), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ version: 2, items: [] })), /format/);
  assert.throws(() => parseBackup(JSON.stringify({ version: 1, items: [{ ...entry, owned: 'false' }], imports: [] })), /checkbox/);
  assert.throws(() => parseBackup(JSON.stringify({ version: 1, items: [entry, entry], imports: [] })), /duplicate/);
  assert.throws(() => parseBackup(JSON.stringify({ version: 1, items: [{ ...entry, rank: 41 }], imports: [] })), /rank/);
});
test('recommendation facts roundtrip without changing older saves or accepting malformed states', () => {
  const legacy = { version: 1, items: [item()], imports: [], relics: [], referenceNotice: false };
  assert.deepEqual(parseBackup(JSON.stringify(legacy)), legacy);
  assert.equal('incarnonInstalled' in parseBackup(JSON.stringify(legacy)).items[0], false);
  for (const state of ['Unknown', 'Yes', 'No']) {
    const inventory = { ...legacy, items: [{ ...legacy.items[0], incarnonInstalled: state, helminth: state }] };
    assert.deepEqual(parseBackup(JSON.stringify(inventory)), inventory);
  }
  for (const field of ['incarnonInstalled', 'helminth']) {
    for (const invalid of [true, null, 1, 'yes', {}]) {
      assert.throws(() => parseBackup(JSON.stringify({ ...legacy, items: [{ ...legacy.items[0], [field]: invalid }] })), new RegExp(field));
    }
  }
});
test('CSV includes spreadsheet columns, quoted cells and formula-safe notes', () => {
  const output = inventoryCsv([{ ...item(), notes: '=HYPERLINK("bad")\nsecond line', craftingTarget: 'A, B', incarnonInstalled: 'Yes', helminth: 'No' }]);
  assert.ok(output.includes('"Has Prime Variant"'));
  assert.ok(output.includes('"A, B"'));
  assert.ok(output.includes('"\'=HYPERLINK(""bad"")\nsecond line"'));
  assert.ok(output.includes('"TRUE"'));
  assert.ok(output.includes('"Incarnon Installed","Helminth Ability Unlocked"'));
  assert.ok(output.endsWith(',"Yes","No"'));
});

test('Warframes CSV exports only Warframes with relevant facts and safe notes', () => {
  const frame = createEquipment({ name: 'Wisp', slot: 'Warframe', variant: 'Base' }, {
    mastered: true, hasPrimeVariant: true, helminth: 'No', notes: '=1+1\nKeep this note',
    craftingIngredient: true, craftingTarget: 'Legacy value', incarnon: true,
  });
  const prime = createEquipment({ name: 'Wisp Prime', slot: 'Warframe', variant: 'Prime' }, { owned: false });
  const items = [item(), frame, prime];
  const before = structuredClone(items);
  const output = warframesCsv(items);
  assert.equal(output.split('\r\n')[0], '\uFEFF"Warframe","Type","Owned","Rank","Mastered","Variant","Upgraded","Helminth Ability Unlocked","Recommended Action","Favorite","Quest Reward","Has Prime Variant","Notes"');
  assert.match(output, /"Wisp","Warframe","TRUE","","TRUE","Base","Unknown","No","Subsume"/);
  assert.match(output, /"Wisp Prime","Warframe","FALSE","","FALSE","Prime","Unknown","Not applicable","Acquire & master"/);
  assert.ok(output.includes('"\'=1+1\nKeep this note"'));
  assert.doesNotMatch(output, /Boltor|Legacy value|Incarnon|Crafting/);
  assert.deepEqual(items, before);
});
