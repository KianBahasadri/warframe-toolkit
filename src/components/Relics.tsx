import { useRef, useState } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUp, Minus, Plus, Search } from 'lucide-react';
import { Dialog } from './Dialog';
import relicCatalog from '../data/relics.json';
import { createRelic, MAX_RELIC_QUANTITY, parseRelicName, refinements, relicEras, relicKey } from '../lib/relics';
import type { Relic, Refinement } from '../lib/relics';

function RelicForm({ item, existing, onSave, onDelete, onClose }: { item?: Relic; existing: Relic[]; onSave: (item: Relic) => boolean; onDelete: (id: string) => boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Relic>(() => item ? { ...item } : createRelic());
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  return <Dialog title={item ? `Edit ${item.name}` : 'Add relic'} onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      const parsed = parseRelicName(draft.name);
      if (!parsed) { setError('Enter an era and relic code, such as Lith A1 or Requiem I.'); return; }
      if (!Number.isInteger(draft.quantity) || draft.quantity < 0 || draft.quantity > MAX_RELIC_QUANTITY) { setError(`Quantity must be a whole number from 0 to ${MAX_RELIC_QUANTITY}.`); return; }
      const next = { ...draft, name: parsed.name, updatedAt: new Date().toISOString() };
      if (existing.some(relic => relic.id !== draft.id && relicKey(relic) === relicKey(next))) { setError('This relic and refinement are already tracked. Edit that entry’s quantity instead.'); return; }
      if (!onSave(next)) { setError('Could not save to browser storage. Your previous data is unchanged.'); return; }
      onClose();
    }}>
      <div className="form-grid">
        <label className="span-2">Relic name<input autoFocus list="relic-names" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Lith A1" maxLength={40} required autoComplete="off" /></label>
        <datalist id="relic-names">{relicCatalog.names.map(name => <option key={name} value={name} />)}</datalist>
        <label>Refinement<select value={draft.refinement} onChange={event => setDraft({ ...draft, refinement: event.target.value as Refinement })}>{refinements.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Quantity<input type="number" min={0} max={MAX_RELIC_QUANTITY} step={1} required value={Number.isNaN(draft.quantity) ? '' : draft.quantity} onChange={event => setDraft({ ...draft, quantity: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
        <div className="form-field span-2"><label htmlFor="relic-notes">Notes</label><textarea id="relic-notes" rows={3} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} maxLength={5000} /></div>
      </div>
      {error && <p className="callout danger relic-form-error" role="alert"><strong>Couldn’t save:</strong> {error}</p>}
      {confirmDelete && <div className="callout caution relic-form-error"><strong>Remove {item?.name} · {item?.refinement}?</strong><div><button type="button" className="button danger-button" onClick={() => { if (item && onDelete(item.id)) onClose(); else setError('Could not remove this entry from browser storage.'); }}>Remove relic</button></div></div>}
      <div className="dialog-footer">{item && <button type="button" className="button quiet push-right" onClick={() => setConfirmDelete(!confirmDelete)}>{confirmDelete ? 'Keep entry' : 'Remove entry'}</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary">{item ? 'Save changes' : 'Add relic'}</button></div>
    </form>
  </Dialog>;
}

type SortKey = 'name' | 'era' | 'refinement' | 'quantity' | 'notes';
const columns: { key: SortKey; label: string }[] = [{ key: 'name', label: 'Relic' }, { key: 'era', label: 'Era' }, { key: 'refinement', label: 'Refinement' }, { key: 'quantity', label: 'Quantity' }, { key: 'notes', label: 'Notes' }];

export function Relics({ relics, onSave, onDelete, onQuantityChange, onExport }: { relics: Relic[]; onSave: (item: Relic) => boolean; onDelete: (id: string) => boolean; onQuantityChange: (id: string, change: number) => void; onExport: () => void }) {
  const [search, setSearch] = useState('');
  const [era, setEra] = useState('All eras');
  const [refinement, setRefinement] = useState('All refinements');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [editing, setEditing] = useState<Relic | 'new' | null>(null);
  const [sorting, setSorting] = useState<{ key: SortKey; direction: 1 | -1 }[]>([{ key: 'name', direction: 1 }]);
  const [active, setActive] = useState('');
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const total = relics.reduce((sum, relic) => sum + relic.quantity, 0);
  const filtered = relics.filter(relic => `${relic.name} ${relic.notes}`.toLowerCase().includes(search.toLowerCase()) && (era === 'All eras' || parseRelicName(relic.name)?.era === era) && (refinement === 'All refinements' || relic.refinement === refinement) && (!ownedOnly || relic.quantity > 0));
  const sorted = [...filtered].sort((a, b) => {
    for (const sort of sorting) {
      const compare = sort.key === 'era' ? relicEras.indexOf(parseRelicName(a.name)!.era) - relicEras.indexOf(parseRelicName(b.name)!.era)
        : sort.key === 'quantity' ? a.quantity - b.quantity
        : sort.key === 'refinement' ? refinements.indexOf(a.refinement) - refinements.indexOf(b.refinement)
        : a[sort.key].localeCompare(b[sort.key], undefined, { numeric: true, sensitivity: 'base' });
      if (compare) return compare * sort.direction;
    }
    return 0;
  });
  const activeId = sorted.some(relic => relic.id === active) ? active : sorted[0]?.id;
  const sortBy = (key: SortKey) => setSorting(current => {
    const existing = current.find(sort => sort.key === key);
    return !existing ? [...current, { key, direction: 1 }] : existing.direction === 1 ? current.map(sort => sort.key === key ? { key, direction: -1 } : sort) : current.filter(sort => sort.key !== key);
  });
  return <section className="inventory-section relics-section" aria-labelledby="relics-title">
    <div className="section-heading"><h1 id="relics-title">Relics <span className="count">{total}</span></h1><div className="heading-actions"><button type="button" className="button quiet" onClick={onExport}><ArrowDownToLine size={15} />Export CSV</button><button type="button" className="button primary" onClick={() => setEditing('new')}><Plus size={16} />Add relic</button></div></div>
    <div className="inventory-toolbar relic-toolbar">
      <div className="search-field inventory-search"><Search size={16} /><input aria-label="Search relics" placeholder="Search relics…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <select aria-label="Filter by era" value={era} onChange={event => setEra(event.target.value)}><option>All eras</option>{relicEras.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter by refinement" value={refinement} onChange={event => setRefinement(event.target.value)}><option>All refinements</option>{refinements.map(value => <option key={value}>{value}</option>)}</select>
      <label className="owned-relics"><input type="checkbox" checked={ownedOnly} onChange={event => setOwnedOnly(event.target.checked)} />Owned only</label>
    </div>
    <div className="table-scroll" role="region" aria-label="Relic inventory" tabIndex={0}>
      <table className="relic-table"><caption className="sr-only">Relics by refinement and quantity. Select a name to edit its entry.</caption><thead><tr>{columns.map(column => {
        const index = sorting.findIndex(sort => sort.key === column.key); const sort = sorting[index];
        return <th scope="col" key={column.key} className={column.key === 'quantity' ? 'quantity-cell' : ''} aria-sort={index === 0 ? sort.direction === 1 ? 'ascending' : 'descending' : undefined}><button type="button" className="sort-button" onClick={() => sortBy(column.key)} aria-label={`Sort ${column.label}${sort ? `, priority ${index + 1}, ${sort.direction === 1 ? 'ascending' : 'descending'}` : ', unsorted'}`}>{column.label}<span className="sort-indicator" aria-hidden="true">{sort && <>{sort.direction === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{index + 1}</>}</span></button></th>;
      })}</tr></thead><tbody>{sorted.map((relic, index) => <tr key={relic.id} onClick={event => { if (!(event.target as HTMLElement).closest('button, input, select, a, label') && !window.getSelection()?.toString()) setEditing(relic); }}>
        <td><button type="button" className="equipment-name" aria-label={`Edit ${relic.name} ${relic.refinement}`} tabIndex={relic.id === activeId ? 0 : -1} ref={node => { if (node) buttons.current.set(relic.id, node); else buttons.current.delete(relic.id); }} onFocus={() => setActive(relic.id)} onClick={() => setEditing(relic)} onKeyDown={event => {
          if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          const next = sorted[Math.max(0, Math.min(sorted.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
          buttons.current.get(next.id)?.focus({ preventScroll: true }); buttons.current.get(next.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }}>{relic.name}</button></td>
        <td>{parseRelicName(relic.name)?.era}</td><td><span className="badge">{relic.refinement}</span></td>
        <td className="quantity-cell"><div className="quantity-control"><button type="button" className="icon-button" aria-label={`Decrease ${relic.name} ${relic.refinement} quantity`} title="Decrease quantity" disabled={relic.quantity === 0} onClick={() => onQuantityChange(relic.id, -1)}><Minus size={14} /></button><span className="relic-quantity" aria-label={`${relic.name} ${relic.refinement} quantity`}>{relic.quantity}</span><button type="button" className="icon-button" aria-label={`Increase ${relic.name} ${relic.refinement} quantity`} title="Increase quantity" disabled={relic.quantity === MAX_RELIC_QUANTITY} onClick={() => onQuantityChange(relic.id, 1)}><Plus size={14} /></button></div></td>
        <td className="relic-notes">{relic.notes || <span className="faint">—</span>}</td>
      </tr>)}</tbody></table>
      {!sorted.length && <div className="empty-state"><p>{relics.length ? 'No matching relics.' : 'No relics added.'}</p>{relics.length > 0 && <button type="button" className="button secondary" onClick={() => { setSearch(''); setEra('All eras'); setRefinement('All refinements'); setOwnedOnly(false); }}>Clear filters</button>}</div>}
    </div>
    {editing && <RelicForm item={editing === 'new' ? undefined : editing} existing={relics} onSave={onSave} onDelete={onDelete} onClose={() => setEditing(null)} />}
  </section>;
}
