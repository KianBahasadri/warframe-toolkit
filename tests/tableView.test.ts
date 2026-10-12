import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentTableModel } from '../src/lib/inventoryColumns.ts';
import { relicTableModel } from '../src/lib/relicColumns.ts';
import { createRelic } from '../src/lib/relics.ts';
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
  assert.deepEqual(sortRows(rows, sorts, equipmentTableModel).map(item => item.name), ['Anku', 'Bo', 'Boltor', 'Arca Titron', 'Atomos']);
  sorts = moveColumnSort(sorts, 'rank', 0);
  assert.deepEqual(sortRows(rows, sorts, equipmentTableModel).map(item => item.name), ['Anku', 'Arca Titron', 'Bo', 'Atomos', 'Boltor']);
  sorts = setColumnSort(sorts, 'mastered', 1);
  assert.deepEqual(sorts, [{ key: 'rank', direction: -1 }, { key: 'mastered', direction: 1 }]);
  assert.deepEqual(sortRows(rows, sorts, equipmentTableModel).map(item => item.name), ['Arca Titron', 'Anku', 'Atomos', 'Bo', 'Boltor']);
  sorts = setColumnSort(sorts, 'rank', 0);
  sorts = setColumnSort(sorts, 'rank', 1);
  assert.deepEqual(sorts.map(sort => sort.key), ['mastered', 'rank']);
  assert.deepEqual(sortRows(rows, [], equipmentTableModel).map(item => item.name), rows.map(item => item.name));
});

test('column filters combine text, booleans, categories, zero ranks, and unknown ranks without mutating rows', () => {
  const before = JSON.stringify(rows);
  assert.deepEqual(filterRows(rows, { mastered: { kind: 'choice', value: 'true' }, rank: { kind: 'number', operator: 'atMost', value: 20 } }, equipmentTableModel).map(item => item.name), ['Bo']);
  assert.deepEqual(filterRows(rows, { notes: { kind: 'text', value: ' CRAFTING ' }, slot: { kind: 'choice', value: 'Melee' } }, equipmentTableModel).map(item => item.name), ['Anku']);
  assert.deepEqual(filterRows(rows, { owned: { kind: 'choice', value: 'false' }, rank: { kind: 'number', operator: 'unknown', value: 0 } }, equipmentTableModel).map(item => item.name), ['Boltor']);
  assert.deepEqual(filterRows(rows, { rank: { kind: 'number', operator: 'atLeast', value: 30 } }, equipmentTableModel).map(item => item.name), ['Anku', 'Arca Titron']);
  assert.equal(filterRows([{ ...rows[0], rank: 0 }, rows[4]], { rank: { kind: 'number', operator: 'equals', value: 0 } }, equipmentTableModel).length, 1);
  assert.equal(JSON.stringify(rows), before);
});

test('Incarnon filters distinguish Genesis, native, custom eligibility, and none', () => {
  const equipment: EquipmentRow[] = [
    { ...rows[0], incarnon: true, catalogItem: { ...rows[0], masteryReq: 0, wikiUrl: '', incarnon: { type: 'genesis', name: '', description: '', installation: null, wikiUrl: '' } } },
    { ...rows[1], incarnon: true, catalogItem: { ...rows[1], masteryReq: 0, wikiUrl: '', incarnon: { type: 'native', name: '', description: '', installation: null, wikiUrl: '' } } },
    { ...rows[2], incarnon: true },
    { ...rows[3], incarnon: false },
  ];
  assert.equal(filterRows(equipment, { incarnon: { kind: 'choice', value: 'yes' } }, equipmentTableModel).length, 3);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', value: 'genesis' } }, equipmentTableModel).map(item => item.name), ['Anku']);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', value: 'native' } }, equipmentTableModel).map(item => item.name), ['Arca Titron']);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', value: 'none' } }, equipmentTableModel).map(item => item.name), ['Bo']);
});


test('shared sorting and filters use relic quantities and the published era and refinement order', () => {
  const relics = [
    { ...createRelic(), name: 'Axi A1', refinement: 'Intact' as const, quantity: 0 },
    { ...createRelic(), name: 'Lith A2', refinement: 'Radiant' as const, quantity: 100 },
    { ...createRelic(), name: 'Lith A10', refinement: 'Exceptional' as const, quantity: 2 },
    { ...createRelic(), name: 'Neo N1', refinement: 'Flawless' as const, quantity: 100 },
  ];
  const before = JSON.stringify(relics);
  assert.deepEqual(sortRows(relics, [{ key: 'era', direction: 1 }, { key: 'refinement', direction: 1 }], relicTableModel).map(row => row.name), ['Lith A10', 'Lith A2', 'Neo N1', 'Axi A1']);
  assert.deepEqual(sortRows(relics, [{ key: 'quantity', direction: -1 }, { key: 'name', direction: 1 }], relicTableModel).map(row => row.name), ['Lith A2', 'Neo N1', 'Lith A10', 'Axi A1']);
  assert.deepEqual(filterRows(relics, { quantity: { kind: 'number', operator: 'atLeast', value: 40 }, refinement: { kind: 'choice', value: 'Radiant' } }, relicTableModel).map(row => row.name), ['Lith A2']);
  assert.deepEqual(filterRows(relics, { quantity: { kind: 'number', operator: 'equals', value: 0 } }, relicTableModel).map(row => row.name), ['Axi A1']);
  assert.equal(JSON.stringify(relics), before);
});
