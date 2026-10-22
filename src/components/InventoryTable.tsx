import type { Ref } from 'react';
import { ScanLine } from 'lucide-react';
import { helminthStatus, recommendationFor, recommendedActions, warframeRecommendedActions } from '../lib/recommendations';
import { normalizeName } from '../lib/model';
import { Tooltip } from './Tooltip';
import { TableNotes } from './TableNotes';
import { MarketPrice } from './MarketPrice';
import type { Equipment } from '../lib/model';
import { catalogFields, defaultWeaponFilters, filterEquipment } from '../lib/weaponCatalog';
import type { BooleanField, EquipmentRow } from '../lib/weaponCatalog';
import { COLUMNS_STORAGE_KEY, defaultColumns, defaultWarframeColumns, equipmentTableModel, inventoryColumns, retiredWarframeColumns, WARFRAME_COLUMNS_STORAGE_KEY, warframeColumns } from '../lib/inventoryColumns';
import { craftingHover, equipmentHover, HoverTip, incarnonHover, questHover, rankHover, slotHover, variantHover } from './HoverFacts';
import { t, useLanguage } from '../lib/i18n';
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
    ] : [choice('weaponType', 'Type', [['Warframe', 'Warframe'], ['Necramech', 'Necramech']])]),
    choice('variant', 'Variant filter', values(items.map(item => item.variant)), 'variant'),
    choice('mastery', 'Mastery', [['yes', 'Mastered'], ['no', 'Not mastered']], 'mastered'),
    choice('quest', 'Quest reward', [['yes', weapons ? 'Weapon or blueprint reward' : 'Reward or blueprint'], ['no', 'No recorded quest reward']], 'questWeapon'),
    ...(weapons ? [choice('ingredient', 'Used in crafting', [['yes', 'Crafting ingredient'], ['no', 'Not a crafting ingredient']], 'craftingIngredient')] : []),
    choice('recipe', 'Foundry recipe', [['yes', 'Recipe available'], ['no', 'No recorded recipe']]),
    choice('prime', 'Prime counterpart', [['yes', 'Has Prime variant'], ['no', 'No Prime counterpart']], 'hasPrimeVariant'),
    choice('vaulted', 'Prime vault status', [['yes', 'Vaulted'], ['no', 'Not vaulted']]),
    ...(!weapons ? [choice('helminth', 'Helminth ability unlocked', ['Unknown', 'Yes', 'No', 'Not applicable'].map(value => [value, value]), 'helminth')] : []),
    choice('keep', 'Recommended action filter', (weapons ? recommendedActions.filter(action => !['Check Helminth', 'Subsume'].includes(action)) : warframeRecommendedActions).map(action => [action, action]), 'keep'),
    ...(weapons ? [{ key: 'maxMr', label: 'Maximum required MR', kind: 'number' as const, min: 0, max: 30 }] : []),
  ];
}

export function InventoryTable({ items, onEdit, onToggle, onNotesChange, onAdd, onExport, onImport, actionsRef, weapons = false, ownedOnlyDefault = weapons, readOnly = false }: {
  items: EquipmentRow[]; onEdit: (item: EquipmentRow) => void; onToggle: (item: EquipmentRow, field: BooleanField) => void;
  onNotesChange: (item: EquipmentRow, notes: string) => void;
  onAdd: () => void; onExport: () => void; onImport: () => void; actionsRef?: Ref<CollectionActions>;
  weapons?: boolean; ownedOnlyDefault?: boolean; readOnly?: boolean;
}) {
  useLanguage();
  const noun = weapons ? 'weapons' : 'Warframes';
  const definition: CollectionDefinition<EquipmentRow> = {
    label: weapons ? 'Weapons' : 'Warframes', itemLabel: weapons ? 'weapon' : 'Warframe', searchLabel: weapons ? 'Search weapons' : 'Search Warframes',
    regionLabel: weapons ? 'Weapon inventory' : 'Warframe inventory', filterLabel: weapons ? 'Weapon filters' : 'Warframe filters',
    columns: weapons ? inventoryColumns : warframeColumns,
    defaultColumns: weapons ? defaultColumns : defaultWarframeColumns,
    retiredColumns: weapons ? ['dontKeep', 'override'] : retiredWarframeColumns,
    storageKey: weapons ? COLUMNS_STORAGE_KEY : WARFRAME_COLUMNS_STORAGE_KEY, legacyStorageKey: weapons ? undefined : COLUMNS_STORAGE_KEY,
    model: equipmentTableModel, rowLabel: item => item.name, primaryTooltip: equipmentHover,
    marketSubject: item => ({ name: item.name, kind: 'equipment', gameRef: item.catalogItem?.id }),
    rowKey: item => normalizeName(item.name),
    filters: equipmentFilters(items, weapons, ownedOnlyDefault),
    applyFilters: (rows, search, filters) => filterEquipment(rows, search, { ...defaultWeaponFilters, ...filters }),
    emptyState: (rows, filters) => filters.ownedOnly && rows.length > 0 && !rows.some(item => item.owned)
      ? { title: `No owned ${noun} yet`, description: `Mark ${noun} as owned or import an inventory screenshot.`, resetLabel: `Browse all ${noun}`, resetValues: { ownedOnly: false } }
      : { title: rows.length ? `No matching ${noun}` : `No ${noun} added`, description: rows.length ? `Change your filters to see more ${noun}.` : `Add ${weapons ? 'a weapon' : 'a Warframe'} or import an inventory screenshot.` },
  };
  return <CollectionTable definition={definition} items={items} onEdit={onEdit} onAdd={readOnly ? undefined : onAdd} onExport={onExport} actionsRef={actionsRef}
    extraActions={readOnly ? undefined : <button type="button" className="button primary" onClick={onImport}><ScanLine size={16} />{t('Import screenshots')}</button>}
    renderCell={(item, column, visibleColumns) => column.key === 'name'
      ? <>{item.catalogItem?.image ? <img className="equipment-image" src={item.catalogItem.image} width="88" height="56" alt="" loading="lazy" /> : <span className="equipment-initial" aria-hidden="true">{item.name.replace('MK1-', '').slice(0, 2).toUpperCase()}</span>}<span className="equipment-identity"><span className="equipment-label">{item.name}</span>{weapons ? !visibleColumns.includes('slot') && <span className="equipment-meta">{t(item.slot)}</span> : <span className="equipment-meta">{item.catalogItem?.weaponType === 'Necramech' ? t('Necramech') : !visibleColumns.includes('variant') ? item.variant : null}</span>}</span></>
      : column.key === 'wfm' ? <MarketPrice subject={{ name: item.name, kind: 'equipment', gameRef: item.catalogItem?.id }} />
      : column.key === 'incarnon' && item.catalogItem ? <HoverTip content={incarnonHover(item)}><span className="catalog-fact" aria-label={`Incarnon: ${item.name}: ${item.incarnon ? item.catalogItem.incarnon?.type === 'genesis' ? 'Genesis compatible' : 'Native' : 'No'}`}>{t(item.incarnon ? item.catalogItem.incarnon?.type === 'genesis' ? 'Genesis compatible' : 'Native' : 'No')}</span></HoverTip>
      : column.key === 'questWeapon' && item.catalogItem ? <HoverTip content={questHover(item)}><span className="catalog-fact" aria-label={`${column.title}: ${item.name}: ${item.questWeapon ? 'Yes' : 'No'}`}>{t(item.questWeapon ? 'Yes' : 'No')}</span></HoverTip>
      : column.key === 'craftingIngredient' && item.catalogItem ? <HoverTip content={item.craftingIngredient ? craftingHover(item) : null}><span className="catalog-fact" aria-label={`${column.title}: ${item.name}: ${item.craftingIngredient ? 'Yes' : 'No'}`}>{t(item.craftingIngredient ? 'Yes' : 'No')}</span></HoverTip>
      : column.kind === 'boolean' ? item.catalogItem && catalogFields.some(key => key === column.key) ? <span className="catalog-fact" aria-label={`${column.title}: ${item.name}: ${item[column.key as keyof Equipment] ? 'Yes' : 'No'}`}>{t(item[column.key as keyof Equipment] ? 'Yes' : 'No')}</span> : <label className="table-checkbox"><input type="checkbox" aria-label={`${column.title}: ${item.name}`} checked={Boolean(item[column.key as keyof Equipment])} disabled={readOnly} onChange={() => { if (!readOnly) onToggle(item, column.key as BooleanField); }} /></label>
      : column.key === 'keep' ? <Tooltip className="recommended-action" content={recommendationFor(item).reason}>{t(recommendationFor(item).action)}</Tooltip>
      : column.key === 'helminth' ? <span className={['Unknown', 'Not applicable'].includes(helminthStatus(item)) ? 'table-secondary' : ''}>{t(helminthStatus(item))}</span>
      : column.key === 'rank' ? <HoverTip content={rankHover(item)}>{item.rank === null ? <span className="table-missing" aria-label="Rank unknown">—</span> : item.rank}</HoverTip>
      : column.key === 'craftingTarget' ? <HoverTip className="crafting-cell" content={craftingHover(item)}>{item.craftingTarget || <span className="table-missing">—</span>}</HoverTip>
      : column.key === 'variant' ? <HoverTip content={variantHover(item)}>{item.variant}</HoverTip>
      : column.key === 'slot' ? <HoverTip content={slotHover(item)}>{t(item.slot)}</HoverTip>
      : column.key === 'notes' ? (readOnly ? (item.notes || <span className="table-missing">—</span>) : <TableNotes name={item.name} value={item.notes} onChange={notes => onNotesChange(item, notes)} />)
      : <span className={column.key === 'upgraded' && item.upgraded === 'Unknown' ? 'table-secondary' : ''}>{t(String(item[column.key as keyof Equipment] ?? '—'))}</span>}
  />;
}
