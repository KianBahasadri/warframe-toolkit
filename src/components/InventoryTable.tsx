import { useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { disposition } from '../lib/model';
import type { Equipment } from '../lib/model';
import { catalogFields, defaultWeaponFilters, filterEquipment } from '../lib/weaponCatalog';
import type { BooleanField, EquipmentRow } from '../lib/weaponCatalog';
import { COLUMNS_STORAGE_KEY, defaultColumns, inventoryColumns, loadColumns } from '../lib/inventoryColumns';
import type { Column } from '../lib/inventoryColumns';
import { filterLabel, filterRows, moveColumnSort, setColumnSort, sortRows } from '../lib/tableView';
import type { ColumnFilter, ColumnFilters, ColumnKey, ColumnSort } from '../lib/tableView';
import { ColumnPicker } from './ColumnPicker';
import { ColumnMenu } from './ColumnMenu';
import { WeaponFilters } from './WeaponFilters';

const weaponFilterColumns = { ownedOnly: 'owned', slot: 'slot', variant: 'variant', mastery: 'mastered', incarnon: 'incarnon', quest: 'questWeapon', ingredient: 'craftingIngredient', prime: 'hasPrimeVariant', keep: 'keep' } as const;

export function InventoryTable({ items, onEdit, onToggle, search, setSearch, weapons = false, ownedOnlyDefault = weapons, actions }: { items: EquipmentRow[]; onEdit: (item: EquipmentRow) => void; onToggle: (item: EquipmentRow, field: BooleanField) => void; search: string; setSearch: (query: string) => void; weapons?: boolean; ownedOnlyDefault?: boolean; actions?: ReactNode }) {
  const defaults = { ...defaultWeaponFilters, ownedOnly: ownedOnlyDefault };
  const [filters, setFilters] = useState(defaults);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(loadColumns);
  const [sorting, setSorting] = useState<ColumnSort[]>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [menu, setMenu] = useState<{ id: number; key: ColumnKey; anchor: HTMLElement; point?: { x: number; y: number }; initialView?: 'filter' } | null>(null);
  const menuSequence = useRef(0);
  const headerButtons = useRef(new Map<ColumnKey, HTMLButtonElement>());
  const [active, setActive] = useState('');
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const filterButton = useRef<HTMLButtonElement>(null);
  const availableColumns = inventoryColumns.map(column => weapons && column.key === 'name' ? { ...column, title: 'Weapon' } : column);
  const columns = availableColumns.filter(column => visibleColumns.includes(column.key));
  const openMenu = (key: ColumnKey, anchor: HTMLElement, point?: { x: number; y: number }, initialView?: 'filter') => setMenu({ id: ++menuSequence.current, key, anchor, point, initialView });
  const openHeaderMenu = (key: ColumnKey, event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    openMenu(key, headerButtons.current.get(key)!, event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : undefined);
  };
  const changeColumns = (next: Column['key'][]) => {
    setVisibleColumns(next);
    setSorting(current => current.filter(sort => next.includes(sort.key)));
    try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next)); }
    catch { /* Column changes still work for this view if preferences cannot be saved. */ }
  };
  const changeVisibility = (key: ColumnKey, visible: boolean) => changeColumns(availableColumns.filter(column => column.required || (column.key === key ? visible : visibleColumns.includes(column.key))).map(column => column.key));
  const changeWeaponFilters = (next: typeof filters) => {
    const updated = { ...columnFilters };
    for (const [key, column] of Object.entries(weaponFilterColumns)) if (next[key as keyof typeof next] !== filters[key as keyof typeof filters]) delete updated[column];
    setColumnFilters(updated); setFilters(next);
  };
  const changeColumnFilter = (key: ColumnKey, filter?: ColumnFilter) => {
    const next = { ...columnFilters };
    if (filter) next[key] = filter; else delete next[key];
    setColumnFilters(next);
    const matching = Object.entries(weaponFilterColumns).find(([, column]) => column === key)?.[0];
    if (matching) setFilters(current => ({ ...current, [matching]: matching === 'ownedOnly' ? false : '' }));
  };
  const filtered = filterRows(filterEquipment(items, search, filters), columnFilters);
  const clearFilters = () => { setSearch(''); setFilters(defaults); setColumnFilters({}); if (weapons) filterButton.current?.focus(); };
  const changed = Boolean(search || Object.keys(columnFilters).length || Object.entries(filters).some(([key, value]) => value !== defaults[key as keyof typeof filters]));
  const filterCount = Object.entries(filters).filter(([key, value]) => value !== defaults[key as keyof typeof filters]).length;
  const sorted = sortRows(filtered, sorting);
  const activeId = sorted.some(item => item.id === active) ? active : sorted[0]?.id;
  return <>
    <div className="inventory-toolbar">
      <div className="search-field inventory-search"><Search size={16} /><input id="inventory-search" aria-label={weapons ? 'Search weapons' : 'Search equipment'} placeholder={weapons ? 'Search weapons…' : 'Search equipment…'} value={search} onChange={event => setSearch(event.target.value)} /></div>
      {!weapons && <label className="owned-filter"><input type="checkbox" checked={filters.ownedOnly} onChange={event => changeWeaponFilters({ ...filters, ownedOnly: event.target.checked })} />Owned only</label>}
      {weapons && <button ref={filterButton} type="button" className={`button secondary ${filtersOpen ? 'selected' : ''}`} aria-label="Filters" aria-expanded={filtersOpen} aria-controls="weapon-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} />Filters{filterCount > 0 ? ` (${filterCount})` : ''}</button>}
      <ColumnPicker options={availableColumns} selected={visibleColumns} onChange={changeVisibility} onReset={() => changeColumns(defaultColumns)} />
      {changed && <button type="button" className="button quiet" onClick={clearFilters}>Reset filters</button>}
      <span className="filter-result" role="status">{filtered.length} of {items.length}</span>
      {actions && <div className="inventory-actions">{actions}</div>}
    </div>
    {weapons && (filtersOpen || filterCount > 0) && <WeaponFilters activeOnly={!filtersOpen} ownedOnlyDefault={ownedOnlyDefault} items={items} filters={filters} onChange={next => {
      const hidesControl = !filtersOpen && Object.entries(next).some(([key, value]) => value !== filters[key as keyof typeof filters] && value === defaults[key as keyof typeof filters]);
      changeWeaponFilters(next);
      if (hidesControl) requestAnimationFrame(() => filterButton.current?.focus());
    }} />}
    {Object.keys(columnFilters).length > 0 && <div className="column-filter-list" role="group" aria-label="Column filters">{availableColumns.filter(column => columnFilters[column.key]).map(column => <div className="column-filter-chip" key={column.key}>
      <button type="button" onClick={event => openMenu(column.key, event.currentTarget, undefined, 'filter')}><Filter size={14} aria-hidden="true" />{column.title}: {filterLabel(columnFilters[column.key]!)}</button>
      <button type="button" className="icon-button" aria-label={`Remove ${column.title} filter`} title={`Remove ${column.title} filter`} onClick={() => { changeColumnFilter(column.key); filterButton.current?.focus(); }}><X size={14} aria-hidden="true" /></button>
    </div>)}</div>}
    <div className="table-scroll inventory-grid" role="region" aria-label={weapons ? 'Weapon inventory' : 'Equipment inventory'} tabIndex={0}>
      <table className="inventory-table" style={{ minWidth: columns.reduce((width, column) => width + column.width, 0) }}>
        <caption className="sr-only">{weapons ? 'Weapon' : 'Equipment'} catalog and inventory. Changes save automatically when signed in. Select a name for game details and inventory settings. Click or right-click a header, or press Shift+F10, for column actions.</caption>
        <colgroup>{columns.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
        <thead><tr>{columns.map(column => {
          const sortIndex = sorting.findIndex(sort => sort.key === column.key);
          const sort = sorting[sortIndex];
          return <th scope="col" key={column.key} className={column.kind === 'boolean' ? 'check-cell' : column.kind === 'number' ? 'number-cell' : ''} aria-sort={sortIndex === 0 ? sort.direction === 1 ? 'ascending' : 'descending' : undefined}
            onClick={event => openHeaderMenu(column.key, event)} onContextMenu={event => openHeaderMenu(column.key, event)}
            onKeyDown={event => { if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); event.stopPropagation(); openMenu(column.key, event.target as HTMLElement); } }}>
            <div className="column-header"><button ref={node => { if (node) headerButtons.current.set(column.key, node); else headerButtons.current.delete(column.key); }} type="button" className="sort-button" aria-label={`${column.title} column options`} aria-haspopup="menu" aria-expanded={menu?.key === column.key} aria-description={sort ? `Sort priority ${sortIndex + 1} of ${sorting.length}, ${sort.direction === 1 ? 'ascending' : 'descending'}` : 'Unsorted'}>{column.title}<span className="sort-indicator" aria-hidden="true">{sort && <>{sort.direction === 1 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{sortIndex + 1}</>}</span></button>
            </div></th>;
        })}</tr></thead>
        <tbody>{sorted.map((item, index) => <tr key={item.id} onClick={event => { if (!(event.target as HTMLElement).closest('button, input, select, a, label') && !window.getSelection()?.toString()) onEdit(item); }}>
          {columns.map(column => <td key={column.key} className={column.kind === 'boolean' ? 'check-cell' : column.kind === 'number' ? 'number-cell' : column.key === 'name' ? 'equipment-cell' : column.key === 'craftingTarget' || column.key === 'notes' ? 'wrapping-cell' : ''}>
            {column.key === 'name' ? <button type="button" ref={node => { if (node) rowButtons.current.set(item.id, node); else rowButtons.current.delete(item.id); }} className="equipment-name" tabIndex={item.id === activeId ? 0 : -1} aria-label={`Edit ${item.name}`} onFocus={() => setActive(item.id)} onClick={() => onEdit(item)} onKeyDown={event => {
              if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              const next = sorted[Math.max(0, Math.min(sorted.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
              rowButtons.current.get(next.id)?.focus({ preventScroll: true }); rowButtons.current.get(next.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }}>{item.catalogItem?.image ? <img className="equipment-image" src={item.catalogItem.image} width="88" height="56" alt="" loading="lazy" /> : <span className="equipment-initial" aria-hidden="true">{item.name.replace('MK1-', '').slice(0, 2).toUpperCase()}</span>}<span className="equipment-identity"><span className="equipment-label">{item.name}</span>{!visibleColumns.includes('slot') && <span className="equipment-meta">{item.slot}</span>}</span></button>
              : column.key === 'incarnon' && item.catalogItem ? <span className="catalog-fact" aria-label={`Incarnon: ${item.name}: ${item.incarnon ? item.catalogItem.incarnon?.type === 'genesis' ? 'Genesis compatible' : 'Native' : 'No'}`}>{item.incarnon ? item.catalogItem.incarnon?.type === 'genesis' ? 'Genesis compatible' : 'Native' : 'No'}</span>
              : column.kind === 'boolean' ? item.catalogItem && catalogFields.some(key => key === column.key) ? <span className="catalog-fact" aria-label={`${column.title}: ${item.name}: ${item[column.key as keyof Equipment] ? 'Yes' : 'No'}`}>{item[column.key as keyof Equipment] ? 'Yes' : 'No'}</span> : <label className="table-checkbox"><input type="checkbox" aria-label={`${column.title}: ${item.name}`} checked={Boolean(item[column.key as keyof Equipment])} onChange={() => onToggle(item, column.key as BooleanField)} /></label>
              : column.key === 'keep' ? <span className="keep-value">{disposition(item)}{item.override !== 'None' && <span className="cell-note">Override</span>}</span>
              : column.key === 'rank' ? item.rank === null ? <span className="table-missing" aria-label="Rank unknown">—</span> : item.rank
              : column.key === 'craftingTarget' ? <span className="crafting-cell">{item.craftingTarget || <span className="table-missing">—</span>}</span>
              : column.key === 'notes' ? item.notes || <span className="table-missing">—</span>
              : <span className={column.key === 'upgraded' && item.upgraded === 'Unknown' ? 'table-secondary' : ''}>{String(item[column.key as keyof Equipment] ?? '—')}</span>}
          </td>)}
        </tr>)}</tbody>
      </table>
      {!sorted.length && <div className="empty-state"><Search size={28} /><h3>{items.length ? `No matching ${weapons ? 'weapons' : 'equipment'}` : 'Your collection starts here'}</h3><p>{items.length ? `Change your filters to see more ${weapons ? 'weapons' : 'equipment'}.` : `Add ${weapons ? 'a weapon' : 'an item'} or import an inventory screenshot.`}</p>{items.length > 0 && <button type="button" className="button secondary" onClick={clearFilters}>Reset filters</button>}</div>}
    </div>
    {menu && <ColumnMenu key={menu.id} anchor={menu.anchor} point={menu.point} initialView={menu.initialView} column={availableColumns.find(column => column.key === menu.key)!} columns={availableColumns} selected={visibleColumns} items={items} sorting={sorting} filter={columnFilters[menu.key]}
      onVisibility={changeVisibility} onReset={() => changeColumns(defaultColumns)} onSort={direction => setSorting(current => setColumnSort(current, menu.key, direction))} onPriority={index => setSorting(current => moveColumnSort(current, menu.key, index))} onFilter={filter => changeColumnFilter(menu.key, filter)} onClose={() => {
        setMenu(null);
        requestAnimationFrame(() => { if (!menu.anchor.isConnected && document.activeElement === document.body) headerButtons.current.get('name')?.focus({ preventScroll: true }); });
      }}
      onHide={() => { changeVisibility(menu.key, false); setMenu(null); headerButtons.current.get('name')?.focus({ preventScroll: true }); }} />}
  </>;
}
