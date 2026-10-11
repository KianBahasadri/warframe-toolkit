import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Search, SlidersHorizontal } from 'lucide-react';
import { disposition } from '../lib/model';
import type { Equipment } from '../lib/model';
import { catalogFields, defaultWeaponFilters, filterEquipment } from '../lib/weaponCatalog';
import type { BooleanField, EquipmentRow } from '../lib/weaponCatalog';
import { COLUMNS_STORAGE_KEY, defaultColumns, inventoryColumns, loadColumns } from '../lib/inventoryColumns';
import type { Column } from '../lib/inventoryColumns';
import { ColumnPicker } from './ColumnPicker';
import { WeaponFilters } from './WeaponFilters';

export function InventoryTable({ items, onEdit, onToggle, search, setSearch, weapons = false, actions }: { items: EquipmentRow[]; onEdit: (item: EquipmentRow) => void; onToggle: (item: EquipmentRow, field: BooleanField) => void; search: string; setSearch: (query: string) => void; weapons?: boolean; actions?: ReactNode }) {
  const [filters, setFilters] = useState({ ...defaultWeaponFilters, ownedOnly: weapons });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(loadColumns);
  const [sorting, setSorting] = useState<{ key: Column['key']; direction: 1 | -1 }[]>([]);
  const [active, setActive] = useState('');
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const filterButton = useRef<HTMLButtonElement>(null);
  const availableColumns = inventoryColumns.map(column => weapons && column.key === 'name' ? { ...column, title: 'Weapon' } : column);
  const columns = availableColumns.filter(column => visibleColumns.includes(column.key));
  const changeColumns = (next: Column['key'][]) => {
    setVisibleColumns(next);
    setSorting(current => current.filter(sort => next.includes(sort.key)));
    try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next)); }
    catch { /* Column changes still work for this view if preferences cannot be saved. */ }
  };
  const filtered = filterEquipment(items, search, filters);
  const clearFilters = () => { setSearch(''); setFilters({ ...defaultWeaponFilters, ownedOnly: weapons }); if (weapons) filterButton.current?.focus(); };
  const changed = Boolean(search || Object.entries(filters).some(([key, value]) => value !== (key === 'ownedOnly' ? weapons : defaultWeaponFilters[key as keyof typeof filters])));
  const filterCount = Object.entries(filters).filter(([key, value]) => value !== defaultWeaponFilters[key as keyof typeof filters]).length;
  const getValue = (item: Equipment, key: Column['key']) => key === 'keep' ? disposition(item) : item[key];
  const sorted = [...filtered].sort((a, b) => {
    for (const sort of sorting) {
      const av = getValue(a, sort.key); const bv = getValue(b, sort.key);
      if (av === null || bv === null) {
        if (av !== bv) return av === null ? 1 : -1;
        continue;
      }
      const result = (typeof av === 'boolean' && typeof bv === 'boolean') || (typeof av === 'number' && typeof bv === 'number') ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true });
      if (result) return result * sort.direction;
    }
    return 0;
  });
  const activeId = sorted.some(item => item.id === active) ? active : sorted[0]?.id;
  const sortBy = (key: Column['key']) => setSorting(current => {
    const existing = current.find(sort => sort.key === key);
    return !existing ? [...current, { key, direction: 1 }] : existing.direction === 1 ? current.map(sort => sort.key === key ? { key, direction: -1 } : sort) : current.filter(sort => sort.key !== key);
  });
  return <>
    <div className="inventory-toolbar">
      <div className="search-field inventory-search"><Search size={16} /><input id="inventory-search" aria-label={weapons ? 'Search weapons' : 'Search equipment'} placeholder={weapons ? 'Search weapons…' : 'Search equipment…'} value={search} onChange={event => setSearch(event.target.value)} /></div>
      {!weapons && <label className="owned-filter"><input type="checkbox" checked={filters.ownedOnly} onChange={event => setFilters({ ...filters, ownedOnly: event.target.checked })} />Owned only</label>}
      {weapons && <button ref={filterButton} type="button" className={`button secondary ${filtersOpen ? 'selected' : ''}`} aria-label="Filters" aria-expanded={filtersOpen} aria-controls="weapon-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} />Filters{filterCount > 0 ? ` (${filterCount})` : ''}</button>}
      <ColumnPicker options={availableColumns} selected={visibleColumns} onChange={(key, visible) => changeColumns(availableColumns.filter(column => column.required || (column.key === key ? visible : visibleColumns.includes(column.key))).map(column => column.key))} onReset={() => changeColumns(defaultColumns)} />
      {changed && <button type="button" className="button quiet" onClick={clearFilters}>Reset filters</button>}
      <span className="filter-result" role="status">{filtered.length} of {items.length}</span>
      {actions && <div className="inventory-actions">{actions}</div>}
    </div>
    {weapons && (filtersOpen || filterCount > 0) && <WeaponFilters activeOnly={!filtersOpen} items={items} filters={filters} onChange={next => {
      const hidesControl = !filtersOpen && Object.entries(next).some(([key, value]) => value !== filters[key as keyof typeof filters] && value === defaultWeaponFilters[key as keyof typeof filters]);
      setFilters(next);
      if (hidesControl) requestAnimationFrame(() => filterButton.current?.focus());
    }} />}
    <div className="table-scroll inventory-grid" role="region" aria-label={weapons ? 'Weapon inventory' : 'Equipment inventory'} tabIndex={0}>
      <table className="inventory-table" style={{ minWidth: columns.reduce((width, column) => width + column.width, 0) }}>
        <caption className="sr-only">{weapons ? 'Weapon' : 'Equipment'} catalog and inventory. Ownership and planning checkboxes save automatically. Select a name for game details and inventory settings.</caption>
        <colgroup>{columns.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
        <thead><tr>{columns.map(column => {
          const sortIndex = sorting.findIndex(sort => sort.key === column.key);
          const sort = sorting[sortIndex];
          return <th scope="col" key={column.key} className={column.kind === 'boolean' ? 'check-cell' : column.kind === 'number' ? 'number-cell' : ''} aria-sort={sortIndex === 0 ? sort.direction === 1 ? 'ascending' : 'descending' : undefined}><button type="button" className="sort-button" onClick={() => sortBy(column.key)} aria-label={`Sort ${column.title}${sort ? `, priority ${sortIndex + 1}, ${sort.direction === 1 ? 'ascending' : 'descending'}` : ', unsorted'}`}>{column.title}<span className="sort-indicator" aria-hidden="true">{sort && <>{sort.direction === 1 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{sortIndex + 1}</>}</span></button></th>;
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
  </>;
}
