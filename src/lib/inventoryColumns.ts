import type { Equipment } from './model';

export type Column = { key: keyof Equipment | 'keep'; title: string; width: number; kind?: 'boolean' | 'number'; required?: boolean };

export const inventoryColumns: Column[] = [
  { key: 'name', title: 'Equipment', width: 360, required: true },
  { key: 'owned', title: 'Owned', width: 96, kind: 'boolean' },
  { key: 'rank', title: 'Rank', width: 84, kind: 'number' },
  { key: 'mastered', title: 'Mastered', width: 124, kind: 'boolean' },
  { key: 'incarnon', title: 'Incarnon', width: 176, kind: 'boolean' },
  { key: 'upgraded', title: 'Upgraded', width: 112 },
  { key: 'keep', title: 'Keep preference', width: 164 },
  { key: 'craftingTarget', title: 'Crafting target', width: 240 },
  { key: 'dontKeep', title: "Don't keep", width: 112, kind: 'boolean' },
  { key: 'craftingIngredient', title: 'Crafting ingredient', width: 176, kind: 'boolean' },
  { key: 'variant', title: 'Variant', width: 144 },
  { key: 'questWeapon', title: 'Quest weapon', width: 152, kind: 'boolean' },
  { key: 'powerful', title: 'Meta / powerful', width: 168, kind: 'boolean' },
  { key: 'slot', title: 'Slot', width: 160 },
  { key: 'hasPrimeVariant', title: 'Has Prime variant', width: 180, kind: 'boolean' },
  { key: 'override', title: 'Override', width: 144 },
  { key: 'notes', title: 'Notes', width: 280 },
];

export const defaultColumns: Column['key'][] = ['name', 'owned', 'rank', 'mastered', 'incarnon', 'upgraded', 'keep', 'craftingTarget'];
export const COLUMNS_STORAGE_KEY = 'arsenal.inventory-columns';

export function loadColumns(): Column['key'][] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.every(key => inventoryColumns.some(column => column.key === key))) {
      return inventoryColumns.filter(column => column.required || saved.includes(column.key)).map(column => column.key);
    }
  } catch { /* Unavailable or unreadable preferences leave the default view usable. */ }
  return defaultColumns;
}
