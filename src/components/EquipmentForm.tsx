import { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { Dialog } from './Dialog';
import { catalog } from '../data/catalog';
import { createEquipment, normalizeName, slots, variants } from '../lib/model';
import type { Equipment, Slot, Variant, Upgrade, Override } from '../lib/model';

export function EquipmentForm({ item, existing, onSave, onClose, onDelete }: { item?: Equipment; existing: Equipment[]; onSave: (item: Equipment) => boolean; onClose: () => void; onDelete: (id: string) => boolean }) {
  const [draft, setDraft] = useState<Equipment>(() => item ? { ...item } : createEquipment({ name: '', slot: 'Primary', variant: 'Base' }));
  const [query, setQuery] = useState('');
  const [catalogVisible, setCatalogVisible] = useState(!item);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const update = <K extends keyof Equipment>(key: K, value: Equipment[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const matches = catalog.filter(entry => entry.name.toLowerCase().includes(query.toLowerCase())).slice(0, 7);
  const fields: [keyof Pick<Equipment, 'owned' | 'mastered' | 'dontKeep' | 'craftingIngredient' | 'incarnon' | 'questWeapon' | 'powerful' | 'hasPrimeVariant'>, string, string][] = [
    ['owned', 'Owned', 'Currently in your inventory'], ['mastered', 'Mastered', 'All mastery earned for this item'],
    ['dontKeep', "Don't keep", 'Your own discard preference'], ['craftingIngredient', 'Crafting ingredient', 'Used to build another item'],
    ['incarnon', 'Incarnon', 'Track Incarnon eligibility or plans'], ['questWeapon', 'Quest weapon', 'Keep track of quest rewards'],
    ['powerful', 'Meta / powerful', 'A personal favorite or useful build'], ['hasPrimeVariant', 'Has Prime variant', 'A Prime counterpart exists'],
  ];
  return <Dialog title={item ? item.name : 'Add equipment'} onClose={onClose} className="equipment-dialog">
    <form onSubmit={event => {
      event.preventDefault();
      if (!draft.name.trim()) { setError('Give this equipment a name.'); return; }
      if (existing.some(entry => entry.id !== draft.id && normalizeName(entry.name) === normalizeName(draft.name))) { setError('This item is already in your inventory. Edit its existing row instead.'); return; }
      if (!onSave({ ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() })) setError('Browser storage is unavailable. Your last saved inventory is unchanged; close this editor to see recovery options.');
    }}>
      {!item && <div className="catalog-picker">
        <label htmlFor="catalog-search">Find in the equipment catalog</label>
        <div className="search-field"><Search size={16} /><input id="catalog-search" value={query} onFocus={() => setCatalogVisible(true)} onChange={event => { setQuery(event.target.value); setCatalogVisible(true); }} placeholder="Try Wisp Prime, Boltor, Nataruk…" autoComplete="off" /></div>
        {catalogVisible && <div className="catalog-results">{matches.map(entry => <button type="button" key={entry.id} onClick={() => { setDraft(createEquipment(entry)); setQuery(entry.name); setCatalogVisible(false); }}><span>{entry.name}</span><span className="muted">{entry.slot}</span></button>)}{!matches.length && <p className="muted">No catalog match. You can add a custom item below.</p>}</div>}
      </div>}
      <div className="form-grid">
        <label className="span-2">Equipment name<input value={draft.name} onChange={event => update('name', event.target.value)} maxLength={100} required /></label>
        <label>Slot<select value={draft.slot} onChange={event => update('slot', event.target.value as Slot)}>{slots.map(slot => <option key={slot}>{slot}</option>)}</select></label>
        <label>Variant<select value={draft.variant} onChange={event => update('variant', event.target.value as Variant)}>{variants.map(variant => <option key={variant}>{variant}</option>)}</select></label>
        <label>Upgraded<select value={draft.upgraded} onChange={event => update('upgraded', event.target.value as Upgrade)}>{['Unknown', 'Yes', 'No'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Current rank<input type="number" min="0" max="40" step="1" placeholder="Unknown" value={draft.rank ?? ''} onChange={event => update('rank', event.target.value === '' ? null : Number(event.target.value))} /></label>
      </div>
      <fieldset className="checkbox-grid"><legend>Inventory & planning</legend>{fields.map(([key, label, description]) => <label className="check-row" key={key}><input type="checkbox" checked={draft[key]} onChange={event => update(key, event.target.checked)} /><span>{label}<small>{description}</small></span></label>)}</fieldset>
      <div className="form-grid">
        <label className="span-2">Crafting target<input value={draft.craftingTarget} onChange={event => update('craftingTarget', event.target.value)} placeholder="e.g. Proboscis Cernos" maxLength={500} /></label>
        <label className="span-2">Keep preference override<select value={draft.override} onChange={event => update('override', event.target.value as Override)}><option>None</option><option>Keep</option><option>Don't keep</option></select></label>
        <div className="form-field span-2"><label htmlFor="equipment-notes">Notes</label><textarea id="equipment-notes" rows={3} value={draft.notes} onChange={event => update('notes', event.target.value)} placeholder="Build ideas, Forma investment, things to remember…" maxLength={5000} /></div>
      </div>
      {item && <div className="record-meta"><span>{item.source}</span><a href={`https://wiki.warframe.com/w/${encodeURIComponent(draft.name.replaceAll(' ', '_'))}`} target="_blank" rel="noreferrer">Warframe Wiki<ArrowUpRight size={14} /></a></div>}
      {error && <p className="callout danger" role="alert"><strong>Couldn’t save:</strong> {error}</p>}
      {deleteConfirm && <div className="callout caution"><strong>Remove {item?.name}?</strong> This only removes its tracker entry. <button type="button" className="button danger-button" onClick={() => { if (item && !onDelete(item.id)) setError('Browser storage is unavailable. The entry has not been removed.'); }}>Remove entry</button></div>}
      <div className="dialog-footer">{item && <button type="button" className="button quiet push-right" onClick={() => setDeleteConfirm(!deleteConfirm)}>{deleteConfirm ? 'Keep entry' : 'Remove entry'}</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary">{item ? 'Save changes' : 'Add equipment'}</button></div>
    </form>
  </Dialog>;
}
