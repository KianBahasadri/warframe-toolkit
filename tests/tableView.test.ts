import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentTableModel } from '../src/lib/inventoryColumns.ts';
import { relicTableModel } from '../src/lib/relicColumns.ts';
import { createRelic } from '../src/lib/relics.ts';
import { createEquipment } from '../src/lib/model.ts';
import { filterLabel, filterRows, moveColumn, moveColumnSort, parseColumnPreferences, setColumnSort, sortRows } from '../src/lib/tableView.ts';
import type { ColumnFilters, ColumnSort } from '../src/lib/tableView.ts';
import type { EquipmentRow } from '../src/lib/weaponCatalog.ts';

const rows: EquipmentRow[] = [
  createEquipment({ name: 'Anku', slot: 'Melee', variant: 'Base' }, { rank: 30, mastered: true, notes: 'Keep for crafting' }),
  createEquipment({ name: 'Arca Titron', slot: 'Melee', variant: 'Base' }, { rank: 30, mastered: false }),
  createEquipment({ name: 'Atomos', slot: 'Secondary', variant: 'Base' }, { rank: 20, mastered: false }),
  createEquipment({ name: 'Bo', slot: 'Melee', variant: 'Base' }, { rank: 20, mastered: true }),
  createEquipment({ name: 'Boltor', slot: 'Primary', variant: 'Base' }, { rank: null, mastered: true, owned: false }),
];

test('column preferences migrate visibility, preserve custom order, and retain required and newly added columns', () => {
  const columns = [
    { key: 'name', title: 'Name', required: true },
    { key: 'owned', title: 'Owned' },
    { key: 'rank', title: 'Rank' },
    { key: 'notes', title: 'Notes' },
  ];
  const defaults = ['name', 'owned', 'rank'];
  assert.deepEqual(parseColumnPreferences(['rank', 'rank'], columns, defaults), { order: ['name', 'owned', 'rank', 'notes'], visible: ['name', 'rank'] });
  const saved = { order: ['rank', 'name', 'owned', 'rank'], visible: ['rank', 'owned'] };
  assert.deepEqual(parseColumnPreferences(saved, columns, defaults), { order: ['rank', 'name', 'owned', 'notes'], visible: ['rank', 'name', 'owned'] });
  const retired = ['dontKeep', 'override'];
  assert.deepEqual(parseColumnPreferences(['name', 'override', 'notes'], columns, defaults, retired), { order: ['name', 'owned', 'rank', 'notes'], visible: ['name', 'notes'] });
  assert.deepEqual(parseColumnPreferences({ order: ['notes', 'override', 'name', 'dontKeep', 'rank'], visible: ['name', 'notes', 'dontKeep'] }, columns, defaults, retired), { order: ['notes', 'name', 'rank', 'owned'], visible: ['notes', 'name'] });
  for (const malformed of [{ order: ['missing'], visible: ['name'] }, { order: ['rank'], visible: null }, 'broken', null]) {
    assert.deepEqual(parseColumnPreferences(malformed, columns, defaults), { order: ['name', 'owned', 'rank', 'notes'], visible: defaults });
  }
  assert.deepEqual(saved, { order: ['rank', 'name', 'owned', 'rank'], visible: ['rank', 'owned'] });
});

test('moving a column supports either end and retains hidden columns without changing the original order', () => {
  const order = ['name', 'owned', 'rank', 'notes'];
  assert.deepEqual(moveColumn(order, 'name', { key: 'notes', edge: 'after' }), ['owned', 'rank', 'notes', 'name']);
  assert.deepEqual(moveColumn(order, 'rank', { key: 'name', edge: 'before' }), ['rank', 'name', 'owned', 'notes']);
  assert.deepEqual(moveColumn(order, 'rank', { key: 'name', edge: 'after' }), ['name', 'rank', 'owned', 'notes']);
  assert.deepEqual(moveColumn(order, 'owned', { key: 'rank', edge: 'after' }), ['name', 'rank', 'owned', 'notes']);
  assert.deepEqual(moveColumn(order, 'rank', { key: 'rank', edge: 'before' }), order);
  assert.deepEqual(moveColumn(order, 'rank', { key: 'missing', edge: 'before' }), order);
  assert.deepEqual(moveColumn(order, 'missing', { key: 'name', edge: 'before' }), order);
  assert.deepEqual(order, ['name', 'owned', 'rank', 'notes']);
});

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
  assert.deepEqual(filterRows(rows, { mastered: { kind: 'choice', values: ['true'] }, rank: { kind: 'number', operator: 'atMost', value: 20 } }, equipmentTableModel).map(item => item.name), ['Bo']);
  assert.deepEqual(filterRows(rows, { notes: { kind: 'text', value: ' CRAFTING ' }, slot: { kind: 'choice', values: ['Melee'] } }, equipmentTableModel).map(item => item.name), ['Anku']);
  assert.deepEqual(filterRows(rows, { owned: { kind: 'choice', values: ['false'] }, rank: { kind: 'number', operator: 'unknown', value: 0 } }, equipmentTableModel).map(item => item.name), ['Boltor']);
  assert.deepEqual(filterRows(rows, { rank: { kind: 'number', operator: 'atLeast', value: 30 } }, equipmentTableModel).map(item => item.name), ['Anku', 'Arca Titron']);
  assert.equal(filterRows([{ ...rows[0], rank: 0 }, rows[4]], { rank: { kind: 'number', operator: 'equals', value: 0 } }, equipmentTableModel).length, 1);
  assert.equal(JSON.stringify(rows), before);
});

test('choice filters match any selected value and combine with other columns', () => {
  const filters: ColumnFilters = { slot: { kind: 'choice', values: ['Melee', 'Secondary'] }, mastered: { kind: 'choice', values: ['false'] } };
  const before = structuredClone(filters);
  assert.deepEqual(filterRows(rows, filters, equipmentTableModel).map(item => item.name), ['Arca Titron', 'Atomos']);
  assert.deepEqual(filterRows(rows, { owned: { kind: 'choice', values: ['true', 'false'] } }, equipmentTableModel), rows);
  assert.deepEqual(filterRows(rows, { slot: { kind: 'choice', values: [] } }, equipmentTableModel), rows);
  assert.deepEqual(filterRows(rows, { slot: { kind: 'choice', values: ['Missing'] } }, equipmentTableModel), []);
  assert.equal(filterLabel(filters.slot!), 'Melee or Secondary');
  assert.equal(filterLabel(filters.mastered!, [{ value: 'false', label: 'No' }]), 'No');
  assert.equal(filterLabel({ kind: 'choice', values: ['true', 'false'] }, [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]), 'Yes or No');
  assert.equal(filterLabel({ kind: 'choice', values: [] }), 'Any');
  assert.deepEqual(filters, before);
});

test('choice exclusions work alone, override included values, and combine with other columns', () => {
  const before = structuredClone(rows);
  const filters: ColumnFilters = { slot: { kind: 'choice', values: [], excludedValues: ['Melee'] } };
  const savedFilters = structuredClone(filters);
  assert.deepEqual(filterRows(rows, filters, equipmentTableModel).map(item => item.name), ['Atomos', 'Boltor']);
  assert.deepEqual(filterRows(rows, { slot: { kind: 'choice', values: ['Melee', 'Secondary'], excludedValues: ['Melee'] } }, equipmentTableModel).map(item => item.name), ['Atomos']);
  assert.deepEqual(filterRows(rows, { ...filters, mastered: { kind: 'choice', values: [], excludedValues: ['false'] } }, equipmentTableModel).map(item => item.name), ['Boltor']);
  assert.deepEqual(filterRows(rows, { slot: { kind: 'choice', values: [], excludedValues: ['Primary', 'Secondary', 'Melee'] } }, equipmentTableModel), []);
  assert.deepEqual(filterRows(rows, { slot: { kind: 'choice', values: [], excludedValues: ['Missing'] } }, equipmentTableModel), rows);
  assert.deepEqual(filterRows(rows, { slot: { kind: 'choice', values: [], excludedValues: [] } }, equipmentTableModel), rows);
  assert.equal(filterLabel(filters.slot!), 'Any except Melee');
  assert.equal(filterLabel({ kind: 'choice', values: ['Primary', 'Secondary'], excludedValues: ['Melee'] }), 'Primary or Secondary except Melee');
  assert.equal(filterLabel({ kind: 'choice', values: [], excludedValues: ['true', 'false'] }, [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]), 'Any except Yes or No');
  assert.deepEqual(filters, savedFilters);
  assert.deepEqual(rows, before);
});

test('Incarnon filters distinguish Genesis, native, custom eligibility, and none', () => {
  const equipment: EquipmentRow[] = [
    { ...rows[0], incarnon: true, catalogItem: { ...rows[0], masteryReq: 0, wikiUrl: '', incarnon: { type: 'genesis', name: '', description: '', installation: null, wikiUrl: '' } } },
    { ...rows[1], incarnon: true, catalogItem: { ...rows[1], masteryReq: 0, wikiUrl: '', incarnon: { type: 'native', name: '', description: '', installation: null, wikiUrl: '' } } },
    { ...rows[2], incarnon: true },
    { ...rows[3], incarnon: false },
  ];
  assert.equal(filterRows(equipment, { incarnon: { kind: 'choice', values: ['yes'] } }, equipmentTableModel).length, 3);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', values: ['genesis'] } }, equipmentTableModel).map(item => item.name), ['Anku']);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', values: ['native'] } }, equipmentTableModel).map(item => item.name), ['Arca Titron']);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', values: ['none'] } }, equipmentTableModel).map(item => item.name), ['Bo']);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', values: ['genesis', 'native'] } }, equipmentTableModel).map(item => item.name), ['Anku', 'Arca Titron']);
  assert.equal(filterRows(equipment, { incarnon: { kind: 'choice', values: ['yes', 'native'] } }, equipmentTableModel).length, 3);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', values: ['yes'], excludedValues: ['genesis'] } }, equipmentTableModel).map(item => item.name), ['Arca Titron', 'Atomos']);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', values: [], excludedValues: ['yes'] } }, equipmentTableModel).map(item => item.name), ['Bo']);
  assert.deepEqual(filterRows(equipment, { incarnon: { kind: 'choice', values: ['genesis', 'native'], excludedValues: ['yes'] } }, equipmentTableModel), []);
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
  assert.deepEqual(filterRows(relics, { quantity: { kind: 'number', operator: 'atLeast', value: 40 }, refinement: { kind: 'choice', values: ['Radiant', 'Flawless'] } }, relicTableModel).map(row => row.name), ['Lith A2', 'Neo N1']);
  assert.deepEqual(filterRows(relics, { quantity: { kind: 'number', operator: 'equals', value: 0 } }, relicTableModel).map(row => row.name), ['Axi A1']);
  assert.equal(JSON.stringify(relics), before);
});
