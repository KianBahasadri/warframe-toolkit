import { helminthStatus, recommendationFor } from './recommendations.ts';
import type { Equipment } from './model.ts';
import type { EquipmentRow } from './weaponCatalog.ts';
import type { TableColumn, TableModel } from './tableView.ts';

export type Column = TableColumn & { key: keyof Equipment | 'keep' | 'wfm' };

export const inventoryColumns: Column[] = [
  { key: 'name', title: 'Weapon', required: true },
  { key: 'wfm', title: 'WFM', kind: 'number', number: { min: 0, max: 1000000, step: 'any', unknown: true } },
  { key: 'owned', title: 'Owned', kind: 'boolean' },
  { key: 'rank', title: 'Rank', kind: 'number', number: { min: 0, max: 40, unknown: true } },
  { key: 'mastered', title: 'Mastered', kind: 'boolean' },
  { key: 'incarnon', title: 'Incarnon', kind: 'boolean', choices: [{ value: 'yes', label: 'All Incarnon' }, { value: 'native', label: 'Native' }, { value: 'genesis', label: 'Genesis compatible' }, { value: 'none', label: 'No Incarnon' }] },
  { key: 'upgraded', title: 'Upgraded', choices: 'values' },
  { key: 'keep', title: 'Recommended action', choices: 'values' },
  { key: 'craftingTarget', title: 'Crafting target', wrap: true },
  { key: 'craftingIngredient', title: 'Crafting ingredient', kind: 'boolean' },
  { key: 'variant', title: 'Variant', choices: 'values' },
  { key: 'questWeapon', title: 'Quest weapon', kind: 'boolean' },
  { key: 'powerful', title: 'Meta / powerful', kind: 'boolean' },
  { key: 'slot', title: 'Slot', choices: 'values' },
  { key: 'hasPrimeVariant', title: 'Has Prime variant', kind: 'boolean' },
  { key: 'notes', title: 'Notes', wrap: true },
];

export const defaultColumns: Column['key'][] = ['name', 'wfm', 'owned', 'rank', 'mastered', 'incarnon', 'upgraded', 'keep', 'craftingTarget'];
export const COLUMNS_STORAGE_KEY = 'arsenal.inventory-columns';
export const WARFRAME_COLUMNS_STORAGE_KEY = 'grakata.warframe-columns';
export const retiredWarframeColumns = ['dontKeep', 'override', 'incarnon', 'craftingTarget', 'craftingIngredient', 'slot'];
export const warframeColumns: Column[] = [
  ...inventoryColumns.filter(column => !retiredWarframeColumns.includes(column.key)).map(column => ({ ...column,
    title: column.key === 'name' ? 'Warframe' : column.key === 'questWeapon' ? 'Quest reward' : column.key === 'powerful' ? 'Favorite' : column.title,
  })),
  { key: 'helminth', title: 'Helminth unlocked', choices: ['Unknown', 'Yes', 'No', 'Not applicable'].map(value => ({ value, label: value })) },
];
export const defaultWarframeColumns: Column['key'][] = ['name', 'wfm', 'owned', 'rank', 'mastered', 'upgraded', 'keep', 'hasPrimeVariant', 'helminth'];

export const equipmentTableModel: TableModel<EquipmentRow> = {
  value(item, key) {
    if (key === 'keep') return recommendationFor(item).action;
    if (key === 'helminth') return helminthStatus(item);
    if (key === 'incarnon') return item.incarnon ? item.catalogItem?.incarnon?.type === 'genesis' ? 'genesis' : item.catalogItem?.incarnon?.type === 'native' ? 'native' : 'yes' : 'none';
    return item[key as keyof Equipment] ?? null;
  },
  matchesChoice: (item, key, choice) => key === 'incarnon' && choice === 'yes' ? item.incarnon : undefined,
};
