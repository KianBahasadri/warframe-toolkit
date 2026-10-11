import { disposition } from './model.ts';
import type { Column } from './inventoryColumns.ts';
import type { EquipmentRow } from './weaponCatalog.ts';

export type ColumnKey = Column['key'];
export type ColumnSort = { key: ColumnKey; direction: 1 | -1 };
export type ColumnFilter = { kind: 'text'; value: string } | { kind: 'choice'; value: string } | { kind: 'rank'; operator: 'equals' | 'atLeast' | 'atMost' | 'unknown'; value: number };
export type ColumnFilters = Partial<Record<ColumnKey, ColumnFilter>>;

export function columnValue(item: EquipmentRow, key: ColumnKey) {
  if (key === 'keep') return disposition(item);
  if (key === 'incarnon') return item.incarnon ? item.catalogItem?.incarnon?.type === 'genesis' ? 'genesis' : item.catalogItem?.incarnon?.type === 'native' ? 'native' : 'yes' : 'none';
  return item[key];
}

export function sortRows(items: EquipmentRow[], sorting: ColumnSort[]): EquipmentRow[] {
  return [...items].sort((a, b) => {
    for (const sort of sorting) {
      const av = columnValue(a, sort.key), bv = columnValue(b, sort.key);
      if (av === null || bv === null) {
        if (av !== bv) return av === null ? 1 : -1;
        continue;
      }
      const result = (typeof av === 'boolean' && typeof bv === 'boolean') || (typeof av === 'number' && typeof bv === 'number')
        ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true });
      if (result) return result * sort.direction;
    }
    return 0;
  });
}

export function filterRows(items: EquipmentRow[], filters: ColumnFilters): EquipmentRow[] {
  return items.filter(item => Object.entries(filters).every(([key, filter]) => {
    const value = columnValue(item, key as ColumnKey);
    if (filter.kind === 'text') return String(value ?? '').toLocaleLowerCase().includes(filter.value.trim().toLocaleLowerCase());
    if (filter.kind === 'choice') return key === 'incarnon' && filter.value === 'yes' ? value !== 'none' : String(value) === filter.value;
    if (filter.operator === 'unknown') return value === null;
    if (typeof value !== 'number') return false;
    return filter.operator === 'atLeast' ? value >= filter.value : filter.operator === 'atMost' ? value <= filter.value : value === filter.value;
  }));
}

export function setColumnSort(sorting: ColumnSort[], key: ColumnKey, direction: 1 | -1 | 0): ColumnSort[] {
  if (!direction) return sorting.filter(sort => sort.key !== key);
  return sorting.some(sort => sort.key === key) ? sorting.map(sort => sort.key === key ? { key, direction } : sort) : [...sorting, { key, direction }];
}

export function moveColumnSort(sorting: ColumnSort[], key: ColumnKey, priority: number): ColumnSort[] {
  const selected = sorting.find(sort => sort.key === key);
  if (!selected) return sorting;
  const remaining = sorting.filter(sort => sort.key !== key);
  remaining.splice(Math.max(0, Math.min(remaining.length, priority)), 0, selected);
  return remaining;
}

const choiceLabels: Record<string, string> = { true: 'Yes', false: 'No', genesis: 'Genesis compatible', native: 'Native', none: 'No Incarnon', yes: 'All Incarnon' };
export function filterLabel(filter: ColumnFilter): string {
  if (filter.kind === 'text') return `Contains “${filter.value}”`;
  if (filter.kind === 'choice') return choiceLabels[filter.value] ?? filter.value;
  return filter.operator === 'unknown' ? 'Unknown' : `${filter.operator === 'atLeast' ? 'At least' : filter.operator === 'atMost' ? 'At most' : 'Equals'} ${filter.value}`;
}

export function filterChoices(column: Column, items: EquipmentRow[]) {
  if (column.key === 'incarnon') return ['yes', 'native', 'genesis', 'none'].map(value => ({ value, label: choiceLabels[value] }));
  if (column.kind === 'boolean') return ['true', 'false'].map(value => ({ value, label: choiceLabels[value] }));
  if (['upgraded', 'keep', 'variant', 'slot', 'override'].includes(column.key)) return [...new Set(items.map(item => String(columnValue(item, column.key))))].sort().map(value => ({ value, label: value }));
  return undefined;
}
