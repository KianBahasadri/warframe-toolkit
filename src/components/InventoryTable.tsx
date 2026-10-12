import type { Ref } from 'react';
import { ScanLine } from 'lucide-react';
import { recommendationFor, recommendedActions } from '../lib/recommendations';
import type { Equipment } from '../lib/model';
import { catalogFields, defaultWeaponFilters, filterEquipment } from '../lib/weaponCatalog';
import type { BooleanField, EquipmentRow } from '../lib/weaponCatalog';
import { COLUMNS_STORAGE_KEY, defaultColumns, equipmentTableModel, inventoryColumns } from '../lib/inventoryColumns';
import { CollectionTable } from './CollectionTable';
import type { CollectionActions, CollectionDefinition, CollectionFilter } from './CollectionTable';

function equipmentFilters(items: EquipmentRow[], weapons: boolean, ownedOnlyDefault: boolean): CollectionFilter[] {
  const choice = (key: string, label: string, choices: [string, string][], column?: string, placeholder = 'Any'): CollectionFilter => ({ key, label, kind: 'select', column, placeholder, choices: choices.map(([value, label]) => ({ value, label })) });
  const values = (entries: string[]): [string, string][] => [...new Set(entries)].sort().map(value => [value, value]);
  return [
    { key: 'ownedOnly', label: 'Owned only', kind: 'checkbox', column: 'owned', defaultValue: ownedOnlyDefault },
    ...(weapons ? [
      choice('slot', 'Filter by slot', values(items.map(item => item.slot)), 'slot', 'All slots'),
      choice('incarnon', 'Incarnon filter', [['yes', 'All Incarnon weapons'], ['native', 'Native Incarnon'], ['genesis', 'Incarnon Genesis compatible'], ['none', 'No Incarnon']], 'incarnon', 'Any Incarnon status'),
      choice('weaponType', 'Weapon type', values(items.flatMap(item => item.catalogItem?.weaponType ? [item.catalogItem.weaponType] : []))),
    ] : []),
    choice('variant', 'Variant filter', values(items.map(item => item.variant)), 'variant'),
    choice('mastery', 'Mastery', [['yes', 'Mastered'], ['no', 'Not mastered']], 'mastered'),
    choice('quest', 'Quest reward', [['yes', weapons ? 'Weapon or blueprint reward' : 'Equipment or blueprint reward'], ['no', 'No recorded quest reward']], 'questWeapon'),
    ...(weapons ? [choice('ingredient', 'Used in crafting', [['yes', 'Crafting ingredient'], ['no', 'Not a crafting ingredient']], 'craftingIngredient')] : []),
    choice('recipe', 'Foundry recipe', [['yes', 'Recipe available'], ['no', 'No recorded recipe']]),
    choice('prime', 'Prime counterpart', [['yes', 'Has Prime variant'], ['no', 'No Prime counterpart']], 'hasPrimeVariant'),
    choice('vaulted', 'Prime vault status', [['yes', 'Vaulted'], ['no', 'Not vaulted']]),
    choice('keep', 'Recommended action filter', recommendedActions.map(action => [action, action]), 'keep'),
    { key: 'maxMr', label: 'Maximum required MR', kind: 'number', min: 0, max: 30 },
  ];
}

export function InventoryTable({ items, onEdit, onToggle, onAdd, onExport, onImport, actionsRef, weapons = false, ownedOnlyDefault = weapons }: {
  items: EquipmentRow[]; onEdit: (item: EquipmentRow) => void; onToggle: (item: EquipmentRow, field: BooleanField) => void;
  onAdd: () => void; onExport: () => void; onImport: () => void; actionsRef?: Ref<CollectionActions>;
  weapons?: boolean; ownedOnlyDefault?: boolean;
}) {
  const noun = weapons ? 'weapons' : 'equipment';
  const definition: CollectionDefinition<EquipmentRow> = {
    label: weapons ? 'Weapons' : 'Warframes', itemLabel: weapons ? 'weapon' : 'equipment', searchLabel: weapons ? 'Search weapons' : 'Search equipment',
    regionLabel: weapons ? 'Weapon inventory' : 'Equipment inventory', filterLabel: weapons ? 'Weapon filters' : 'Warframe filters',
    columns: inventoryColumns.map(column => weapons && column.key === 'name' ? { ...column, title: 'Weapon' } : column),
    defaultColumns, storageKey: COLUMNS_STORAGE_KEY, model: equipmentTableModel, rowLabel: item => item.name,
    filters: equipmentFilters(items, weapons, ownedOnlyDefault),
    applyFilters: (rows, search, filters) => filterEquipment(rows, search, { ...defaultWeaponFilters, ...filters }),
    emptyState: (rows, filters) => filters.ownedOnly && rows.length > 0 && !rows.some(item => item.owned)
      ? { title: `No owned ${noun} yet`, description: 'Mark equipment as owned or import an inventory screenshot.', resetLabel: `Browse all ${noun}`, resetValues: { ownedOnly: false } }
      : { title: rows.length ? `No matching ${noun}` : 'No equipment added', description: rows.length ? `Change your filters to see more ${noun}.` : `Add ${weapons ? 'a weapon' : 'an item'} or import an inventory screenshot.` },
  };
  return <CollectionTable definition={definition} items={items} onEdit={onEdit} onAdd={onAdd} onExport={onExport} actionsRef={actionsRef}
    extraActions={<button type="button" className="button primary" onClick={onImport}><ScanLine size={16} />Import screenshots</button>}
    renderCell={(item, column, visibleColumns) => column.key === 'name'
      ? <>{item.catalogItem?.image ? <img className="equipment-image" src={item.catalogItem.image} width="88" height="56" alt="" loading="lazy" /> : <span className="equipment-initial" aria-hidden="true">{item.name.replace('MK1-', '').slice(0, 2).toUpperCase()}</span>}<span className="equipment-identity"><span className="equipment-label">{item.name}</span>{!visibleColumns.includes('slot') && <span className="equipment-meta">{item.slot}</span>}</span></>
      : column.key === 'incarnon' && item.catalogItem ? <span className="catalog-fact" aria-label={`Incarnon: ${item.name}: ${item.incarnon ? item.catalogItem.incarnon?.type === 'genesis' ? 'Genesis compatible' : 'Native' : 'No'}`}>{item.incarnon ? item.catalogItem.incarnon?.type === 'genesis' ? 'Genesis compatible' : 'Native' : 'No'}</span>
      : column.kind === 'boolean' ? item.catalogItem && catalogFields.some(key => key === column.key) ? <span className="catalog-fact" aria-label={`${column.title}: ${item.name}: ${item[column.key as keyof Equipment] ? 'Yes' : 'No'}`}>{item[column.key as keyof Equipment] ? 'Yes' : 'No'}</span> : <label className="table-checkbox"><input type="checkbox" aria-label={`${column.title}: ${item.name}`} checked={Boolean(item[column.key as keyof Equipment])} onChange={() => onToggle(item, column.key as BooleanField)} /></label>
      : column.key === 'keep' ? <span className="recommended-action" title={recommendationFor(item).reason}>{recommendationFor(item).action}</span>
      : column.key === 'rank' ? item.rank === null ? <span className="table-missing" aria-label="Rank unknown">—</span> : item.rank
      : column.key === 'craftingTarget' ? <span className="crafting-cell">{item.craftingTarget || <span className="table-missing">—</span>}</span>
      : column.key === 'notes' ? item.notes || <span className="table-missing">—</span>
      : <span className={column.key === 'upgraded' && item.upgraded === 'Unknown' ? 'table-secondary' : ''}>{String(item[column.key as keyof Equipment] ?? '—')}</span>}
  />;
}
