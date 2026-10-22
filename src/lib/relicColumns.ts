import { MAX_RELIC_QUANTITY, parseRelicName, refinements, relicEras } from './relics.ts';
import type { Relic } from './relics.ts';
import type { TableColumn, TableModel } from './tableView.ts';

export const relicColumns: TableColumn[] = [
  { key: 'name', title: 'Relic', required: true },
  { key: 'wfm', title: 'WFM', kind: 'number', number: { min: 0, max: 1000000, step: 'any', unknown: true } },
  { key: 'era', title: 'Era', choices: relicEras.map(value => ({ value, label: value })) },
  { key: 'vaulted', title: 'Vaulted', kind: 'boolean' },
  { key: 'refinement', title: 'Refinement', choices: refinements.map(value => ({ value, label: value })) },
  { key: 'quantity', title: 'Quantity', kind: 'number', number: { min: 0, max: MAX_RELIC_QUANTITY } },
  { key: 'notes', title: 'Notes', wrap: true },
];
export const defaultRelicColumns = relicColumns.map(column => column.key);
export const RELIC_COLUMNS_STORAGE_KEY = 'grakata.relic-columns';

export const relicTableModel: TableModel<Relic & { vaulted?: boolean | null }> = {
  value: (item, key) => key === 'era' ? parseRelicName(item.name)!.era : key === 'vaulted' ? item.vaulted ?? null : item[key as keyof Relic],
  compare(a, b, key) {
    if (key === 'era') return relicEras.indexOf(parseRelicName(a.name)!.era) - relicEras.indexOf(parseRelicName(b.name)!.era);
    if (key === 'refinement') return refinements.indexOf(a.refinement) - refinements.indexOf(b.refinement);
    return undefined;
  },
};
