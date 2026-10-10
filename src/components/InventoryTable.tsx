import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Search, SlidersHorizontal } from 'lucide-react';
import { disposition, slots } from '../lib/model';
import type { Equipment } from '../lib/model';

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

export function InventoryTable({ items, onEdit, onToggle, search, setSearch }: { items: Equipment[]; onEdit: (item: Equipment) => void; onToggle: (item: Equipment, field: keyof Equipment) => void; search: string; setSearch: (query: string) => void }) {
  const [slot, setSlot] = useState('All slots');
  const [status, setStatus] = useState('All equipment');
  const [allFields, setAllFields] = useState(false);
  const [sorting, setSorting] = useState<{ key: Column['key']; direction: 1 | -1 }[]>([]);
  const [active, setActive] = useState('');
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const columns = allFields ? full : compact;
  const filtered = items.filter(item => `${item.name} ${item.craftingTarget} ${item.notes}`.toLowerCase().includes(search.toLowerCase()) && (slot === 'All slots' || item.slot === slot) && (status === 'All equipment' || status === 'Owned' && item.owned || status === 'Not owned' && !item.owned || status === 'Not mastered' && !item.mastered || status === "Don't keep" && disposition(item) === "Don't keep" || status === 'Crafting ingredients' && item.craftingIngredient));
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
      <select aria-label="Filter by slot" value={slot} onChange={event => setSlot(event.target.value)}><option>All slots</option>{slots.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}>{['All equipment', 'Owned', 'Not owned', 'Not mastered', "Don't keep", 'Crafting ingredients'].map(value => <option key={value}>{value}</option>)}</select>
      <button type="button" className={`button secondary fields-button ${allFields ? 'selected' : ''}`} onClick={() => setAllFields(!allFields)} aria-pressed={allFields}><SlidersHorizontal size={16} />{allFields ? 'Compact view' : 'All 14 fields'}</button>
    </div>
    <div className="table-scroll" role="region" aria-label="Equipment inventory" tabIndex={0}>
      <table className={allFields ? 'full-table' : ''}>
        <caption className="sr-only">Your Warframe equipment. Checkboxes save automatically. Select an equipment name to edit all fields.</caption>
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
            }}><span className="equipment-initial" aria-hidden="true">{item.name.replace('MK1-', '').slice(0, 2).toUpperCase()}</span><span>{item.name}{item.incarnon && <small>Incarnon</small>}</span></button>
              : column.kind === 'boolean' ? <label className="table-checkbox"><input type="checkbox" aria-label={`${column.title}: ${item.name}`} checked={Boolean(item[column.key as keyof Equipment])} onChange={() => onToggle(item, column.key as keyof Equipment)} /></label>
              : column.key === 'keep' ? <span className={`badge ${disposition(item) === "Don't keep" ? 'caution-badge' : ''}`}>{disposition(item)}{item.override !== 'None' ? ' · override' : ''}</span>
              : column.key === 'variant' ? <span className={`badge ${item.variant === 'Prime' ? 'prime-badge' : ''}`}>{item.variant}</span>
              : column.key === 'craftingTarget' ? <span className="crafting-cell">{item.craftingTarget || <span className="faint">—</span>}</span>
              : <span className={column.key === 'upgraded' && item.upgraded === 'Unknown' ? 'muted' : ''}>{String(item[column.key as keyof Equipment] ?? '—')}</span>}
          </td>)}
        </tr>)}</tbody>
      </table>
      {!sorted.length && <div className="empty-state"><Search size={28} /><h3>{items.length ? 'No matching equipment' : 'Your collection starts here'}</h3><p>{items.length ? 'Try another name or clear your filters.' : 'Add an item or import an inventory screenshot.'}</p>{items.length > 0 && <button type="button" className="button secondary" onClick={() => { setSearch(''); setSlot('All slots'); setStatus('All equipment'); }}>Clear filters</button>}</div>}
    </div>
  </>;
}
