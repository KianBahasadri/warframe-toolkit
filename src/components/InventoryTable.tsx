import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Search, SlidersHorizontal } from 'lucide-react';
import { disposition } from '../lib/model';
import type { Equipment } from '../lib/model';
import { catalogFields, defaultWeaponFilters, filterEquipment } from '../lib/weaponCatalog';
import type { BooleanField, EquipmentRow } from '../lib/weaponCatalog';
import { WeaponFilters } from './WeaponFilters';

type Column = { key: keyof Equipment | 'keep'; title: string; kind?: 'boolean' };
const compact: Column[] = [
  { key: 'name', title: 'Equipment' }, { key: 'slot', title: 'Slot' }, { key: 'owned', title: 'Owned', kind: 'boolean' },
  { key: 'mastered', title: 'Mastered', kind: 'boolean' }, { key: 'variant', title: 'Variant' },
  { key: 'keep', title: 'Keep preference' }, { key: 'craftingTarget', title: 'Crafting target' }, { key: 'upgraded', title: 'Upgraded' },
];
const full: Column[] = [
  { key: 'name', title: 'Equipment' }, { key: 'owned', title: 'Owned', kind: 'boolean' },
  { key: 'dontKeep', title: "Don't keep", kind: 'boolean' }, { key: 'craftingIngredient', title: 'Crafting ingredient', kind: 'boolean' },
  { key: 'craftingTarget', title: 'Crafting target' }, { key: 'variant', title: 'Variant' },
  { key: 'incarnon', title: 'Incarnon', kind: 'boolean' }, { key: 'questWeapon', title: 'Quest weapon', kind: 'boolean' },
  { key: 'upgraded', title: 'Upgraded' }, { key: 'mastered', title: 'Mastered', kind: 'boolean' },
  { key: 'powerful', title: 'Meta / powerful', kind: 'boolean' }, { key: 'slot', title: 'Slot' },
  { key: 'hasPrimeVariant', title: 'Has Prime variant', kind: 'boolean' }, { key: 'override', title: 'Override' },
];

export function InventoryTable({ items, onEdit, onToggle, search, setSearch, weapons = false }: { items: EquipmentRow[]; onEdit: (item: EquipmentRow) => void; onToggle: (item: EquipmentRow, field: BooleanField) => void; search: string; setSearch: (query: string) => void; weapons?: boolean }) {
  const [filters, setFilters] = useState({ ...defaultWeaponFilters, ownedOnly: weapons });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [allFields, setAllFields] = useState(false);
  const [sorting, setSorting] = useState<{ key: Column['key']; direction: 1 | -1 }[]>([]);
  const [active, setActive] = useState('');
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const columns = allFields ? full : compact;
  const filtered = filterEquipment(items, search, filters);
  const clearFilters = () => { setSearch(''); setFilters({ ...defaultWeaponFilters, ownedOnly: weapons }); };
  const changed = Boolean(search || Object.entries(filters).some(([key, value]) => value !== (key === 'ownedOnly' ? weapons : defaultWeaponFilters[key as keyof typeof filters])));
  const advancedCount = Object.entries(filters).filter(([key, value]) => !['ownedOnly', 'slot', 'incarnon'].includes(key) && value !== '').length;
  const getValue = (item: Equipment, key: Column['key']) => key === 'keep' ? disposition(item) : item[key];
  const sorted = [...filtered].sort((a, b) => {
    for (const sort of sorting) {
      const av = getValue(a, sort.key); const bv = getValue(b, sort.key);
      const result = typeof av === 'boolean' && typeof bv === 'boolean' ? Number(av) - Number(bv) : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base', numeric: true });
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
      <div className="search-field inventory-search"><Search size={16} /><input id="inventory-search" aria-label="Search equipment" placeholder="Search equipment…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <label className="owned-filter"><input type="checkbox" checked={filters.ownedOnly} onChange={event => setFilters({ ...filters, ownedOnly: event.target.checked })} />Owned only</label>
      {weapons && <><select aria-label="Filter by slot" value={filters.slot} onChange={event => setFilters({ ...filters, slot: event.target.value })}><option value="">All slots</option>{[...new Set(items.map(item => item.slot))].sort().map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Incarnon filter" value={filters.incarnon} onChange={event => setFilters({ ...filters, incarnon: event.target.value })}><option value="">Any Incarnon status</option><option value="yes">All Incarnon weapons</option><option value="native">Native Incarnon</option><option value="genesis">Incarnon Genesis compatible</option><option value="none">No Incarnon</option></select>
      <button type="button" className={`button secondary ${filtersOpen ? 'selected' : ''}`} aria-expanded={filtersOpen} aria-controls="weapon-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} />Filters{advancedCount > 0 ? ` (${advancedCount})` : ''}</button></>}
      <button type="button" className={`button secondary fields-button ${allFields ? 'selected' : ''}`} onClick={() => setAllFields(!allFields)} aria-pressed={allFields}><SlidersHorizontal size={16} />{allFields ? 'Compact view' : 'All 14 fields'}</button>
      {changed && <button type="button" className="button quiet" onClick={clearFilters}>Reset filters</button>}
      <span className="filter-result" role="status">{filtered.length} of {items.length}</span>
    </div>
    {weapons && filtersOpen && <WeaponFilters items={items} filters={filters} onChange={setFilters} />}
    <div className="table-scroll" role="region" aria-label="Equipment inventory" tabIndex={0}>
      <table className={allFields ? 'full-table' : ''}>
        <caption className="sr-only">Equipment catalog and inventory. Ownership and planning checkboxes save automatically. Select a name for game details and inventory settings.</caption>
        <thead><tr>{columns.map(column => {
          const sortIndex = sorting.findIndex(sort => sort.key === column.key);
          const sort = sorting[sortIndex];
          return <th scope="col" key={column.key} className={column.kind === 'boolean' ? 'check-cell' : ''} aria-sort={sortIndex === 0 ? sort.direction === 1 ? 'ascending' : 'descending' : undefined}><button type="button" className="sort-button" onClick={() => sortBy(column.key)} aria-label={`Sort ${column.title}${sort ? `, priority ${sortIndex + 1}, ${sort.direction === 1 ? 'ascending' : 'descending'}` : ', unsorted'}`}>{column.title}<span className="sort-indicator" aria-hidden="true">{sort && <>{sort.direction === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{sortIndex + 1}</>}</span></button></th>;
        })}</tr></thead>
        <tbody>{sorted.map((item, index) => <tr key={item.id} onClick={event => { if (!(event.target as HTMLElement).closest('button, input, select, a, label') && !window.getSelection()?.toString()) onEdit(item); }}>
          {columns.map(column => <td key={column.key} className={column.kind === 'boolean' ? 'check-cell' : column.key === 'name' ? 'equipment-cell' : ''}>
            {column.key === 'name' ? <button type="button" ref={node => { if (node) rowButtons.current.set(item.id, node); else rowButtons.current.delete(item.id); }} className="equipment-name" tabIndex={item.id === activeId ? 0 : -1} aria-label={`Edit ${item.name}`} onFocus={() => setActive(item.id)} onClick={() => onEdit(item)} onKeyDown={event => {
              if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              const next = sorted[Math.max(0, Math.min(sorted.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
              rowButtons.current.get(next.id)?.focus({ preventScroll: true }); rowButtons.current.get(next.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }}>{item.catalogItem?.image ? <img className="equipment-image" src={item.catalogItem.image} width="64" height="44" alt="" loading="lazy" /> : <span className="equipment-initial" aria-hidden="true">{item.name.replace('MK1-', '').slice(0, 2).toUpperCase()}</span>}<span>{item.name}{item.incarnon && <small>{item.catalogItem?.incarnon?.type === 'genesis' ? 'Incarnon Genesis' : 'Incarnon'}</small>}</span></button>
              : column.kind === 'boolean' ? item.catalogItem && catalogFields.some(key => key === column.key) ? <span className={item[column.key as keyof Equipment] ? 'catalog-yes' : 'faint'} aria-label={`${column.title}: ${item.name}: ${item[column.key as keyof Equipment] ? 'Yes' : 'No'}`}>{item[column.key as keyof Equipment] ? 'Yes' : '—'}</span> : <label className="table-checkbox"><input type="checkbox" aria-label={`${column.title}: ${item.name}`} checked={Boolean(item[column.key as keyof Equipment])} onChange={() => onToggle(item, column.key as BooleanField)} /></label>
              : column.key === 'keep' ? <span className={`badge ${disposition(item) === "Don't keep" ? 'caution-badge' : ''}`}>{disposition(item)}{item.override !== 'None' ? ' · override' : ''}</span>
              : column.key === 'variant' ? <span className={`badge ${item.variant === 'Prime' ? 'prime-badge' : ''}`}>{item.variant}</span>
              : column.key === 'craftingTarget' ? <span className="crafting-cell">{item.craftingTarget || <span className="faint">—</span>}</span>
              : <span className={column.key === 'upgraded' && item.upgraded === 'Unknown' ? 'muted' : ''}>{String(item[column.key as keyof Equipment] ?? '—')}</span>}
          </td>)}
        </tr>)}</tbody>
      </table>
      {!sorted.length && <div className="empty-state"><Search size={28} /><h3>{items.length ? 'No matching equipment' : 'Your collection starts here'}</h3><p>{items.length ? 'Change your filters to see more equipment.' : 'Add an item or import an inventory screenshot.'}</p>{items.length > 0 && <button type="button" className="button secondary" onClick={clearFilters}>Reset filters</button>}</div>}
    </div>
  </>;
}
