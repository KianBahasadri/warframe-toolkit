import test from 'node:test';
import assert from 'node:assert/strict';
import { createEquipment, mergeObservations } from '../src/lib/model.ts';
import { inventoryCsv, parseBackup } from '../src/lib/storage.ts';

const item = () => createEquipment({ name: 'Boltor', slot: 'Primary', variant: 'Base' });

test('screenshot imports preserve planning fields and previous mastery', () => {
  const before = { ...item(), mastered: true, dontKeep: true, notes: 'Keep for Boltace', upgraded: 'Yes' as const, override: 'Keep' as const, incarnon: true, rank: 30 };
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
test('CSV includes spreadsheet columns, quoted cells and formula-safe notes', () => {
  const output = inventoryCsv([{ ...item(), notes: '=HYPERLINK("bad")\nsecond line', craftingTarget: 'A, B' }]);
  assert.ok(output.includes('"Has Prime Variant"'));
  assert.ok(output.includes('"A, B"'));
  assert.ok(output.includes('"\'=HYPERLINK(""bad"")\nsecond line"'));
  assert.ok(output.includes('"TRUE"'));
});
