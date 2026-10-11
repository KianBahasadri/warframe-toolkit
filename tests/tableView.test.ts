import test from 'node:test';
import assert from 'node:assert/strict';
import { createEquipment } from '../src/lib/model.ts';
import { filterRows, moveColumnSort, setColumnSort, sortRows } from '../src/lib/tableView.ts';
import type { ColumnSort } from '../src/lib/tableView.ts';
import type { EquipmentRow } from '../src/lib/weaponCatalog.ts';

const rows: EquipmentRow[] = [
  createEquipment({ name: 'Anku', slot: 'Melee', variant: 'Base' }, { rank: 30, mastered: true, notes: 'Keep for crafting' }),
  createEquipment({ name: 'Arca Titron', slot: 'Melee', variant: 'Base' }, { rank: 30, mastered: false }),
  createEquipment({ name: 'Atomos', slot: 'Secondary', variant: 'Base' }, { rank: 20, mastered: false }),
  createEquipment({ name: 'Bo', slot: 'Melee', variant: 'Base' }, { rank: 20, mastered: true }),
  createEquipment({ name: 'Boltor', slot: 'Primary', variant: 'Base' }, { rank: null, mastered: true, owned: false }),
];

test('sort directions retain priority, priority changes reorder ties, and removing then adding appends', () => {
  let sorts: ColumnSort[] = [];
  sorts = setColumnSort(sorts, 'mastered', -1);
  sorts = setColumnSort(sorts, 'rank', -1);
  assert.deepEqual(sortRows(rows, sorts).map(item => item.name), ['Anku', 'Bo', 'Boltor', 'Arca Titron', 'Atomos']);
  sorts = moveColumnSort(sorts, 'rank', 0);
  assert.deepEqual(sortRows(rows, sorts).map(item => item.name), ['Anku', 'Arca Titron', 'Bo', 'Atomos', 'Boltor']);
  sorts = setColumnSort(sorts, 'mastered', 1);
  assert.deepEqual(sorts, [{ key: 'rank', direction: -1 }, { key: 'mastered', direction: 1 }]);
  assert.deepEqual(sortRows(rows, sorts).map(item => item.name), ['Arca Titron', 'Anku', 'Atomos', 'Bo', 'Boltor']);
  sorts = setColumnSort(sorts, 'rank', 0);
  sorts = setColumnSort(sorts, 'rank', 1);
  assert.deepEqual(sorts.map(sort => sort.key), ['mastered', 'rank']);
  assert.deepEqual(sortRows(rows, []).map(item => item.name), rows.map(item => item.name));
});

test('column filters combine text, booleans, categories, zero ranks, and unknown ranks without mutating rows', () => {
  const before = JSON.stringify(rows);
  assert.deepEqual(filterRows(rows, { mastered: { kind: 'choice', value: 'true' }, rank: { kind: 'rank', operator: 'atMost', value: 20 } }).map(item => item.name), ['Bo']);
  assert.deepEqual(filterRows(rows, { notes: { kind: 'text', value: ' CRAFTING ' }, slot: { kind: 'choice', value: 'Melee' } }).map(item => item.name), ['Anku']);
  assert.deepEqual(filterRows(rows, { owned: { kind: 'choice', value: 'false' }, rank: { kind: 'rank', operator: 'unknown', value: 0 } }).map(item => item.name), ['Boltor']);
  assert.deepEqual(filterRows(rows, { rank: { kind: 'rank', operator: 'atLeast', value: 30 } }).map(item => item.name), ['Anku', 'Arca Titron']);
  assert.equal(filterRows([{ ...rows[0], rank: 0 }, rows[4]], { rank: { kind: 'rank', operator: 'equals', value: 0 } }).length, 1);
  assert.equal(JSON.stringify(rows), before);
});

test('Incarnon filters distinguish Genesis, native, custom eligibility, and none', () => {
  const equipment: EquipmentRow[] = [
    { ...rows[0], incarnon: true, catalogItem: { ...rows[0], masteryReq: 0, wikiUrl: '', incarnon: { type: 'genesis', name: '', description: '', installation: null, wikiUrl: '' } } },
    { ...rows[1], incarnon: true, catalogItem: { ...rows[1], masteryReq: 0, wikiUrl: '', incarnon: { type: 'native', name: '', description: '', installation: null, wikiUrl: '' } } },
    { ...rows[2], incarnon: true },
    { ...rows[3], incarnon: false },
  ];
  assert.equal(filterRows(equipment, { incarnon: { kind: 'choice', value: 'yes' } }).length, 3);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', value: 'genesis' } }).map(item => item.name), ['Anku']);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', value: 'native' } }).map(item => item.name), ['Arca Titron']);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', value: 'none' } }).map(item => item.name), ['Bo']);
});
