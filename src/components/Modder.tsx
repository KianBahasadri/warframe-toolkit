import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Copy, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { catalog } from '../data/catalog';
import type { CatalogItem } from '../lib/model';
import { arcanes, calculate, capacity, compatible, equipItem, fmt, frames, modderData, modFamily, mods, slotDrain, upgradeEffects, upgrades, validateEquipment, weaponSourceStats } from '../lib/modder';
import type { Calculation, CalculationStep, Upgrade, UpgradeKind } from '../lib/modder';
import { arsenalSlots, emptyUpgrade, newArsenal, polarities } from '../lib/modderModel';
import type { ArsenalBuild, ArsenalSlot, EquipmentBuild, ModderConditions, Polarity, UpgradeSlot } from '../lib/modderModel';
import { Dialog } from './Dialog';
import { Select } from './Select';
import './QuantitySlider.css';
import './Modder.css';

const items = new Map(catalog.map(item => [item.id, item]));
const valueText = (step: CalculationStep) => step.value === null ? 'Unavailable' : `${fmt(step.value)}${step.unit ? ` ${step.unit}` : ''}`;
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const rankText = (mod: Upgrade, rank: number) => [...new Set((mod.ranks[rank] ?? ['Rank unavailable']).flatMap(text => text.split('\n')).map(line => line.trim()).filter(Boolean))].join('\n');
const polarityOptions = polarities.map(value => ({ value, label: value ? titleCase(value) : 'No polarity' }));
function starter(): ArsenalBuild {
  const build = newArsenal();
  for (const [index, name] of ['Excalibur', 'Braton', 'Lato', 'Skana'].entries()) {
    const item = catalog.find(item => item.name === name);
    if (item) build.equipment[arsenalSlots[index]] = equipItem(item, arsenalSlots[index]);
  }
  return build;
}
function Numeric({ label, value, max, min = 0, step = 1, onChange, disabled = false }: { label: string; value: number; min?: number; max: number; step?: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <label className="modder-number"><span>{label}</span><input type="number" aria-label={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={event => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next) && next >= min && next <= max && (step !== 1 || Number.isInteger(next))) onChange(next); }} /></label>;
}

function ArsenalName({ name, onChange, disabled }: { name: string; onChange: (name: string) => void; disabled: boolean }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  return <label className="modder-name"><span>Arsenal name</span><input aria-label="Arsenal name" maxLength={100} value={draft} disabled={disabled} onChange={event => { setDraft(event.target.value); if (event.target.value.trim()) onChange(event.target.value); }} onBlur={() => { if (!draft.trim()) setDraft(name); }} /></label>;
}

type PickerTarget = { kind: UpgradeKind | 'equipment'; index: number };
function Library({ target, item, slot, equipment, conditions, onChoose, onClose }: { target: PickerTarget; item?: CatalogItem; slot: ArsenalSlot; equipment: EquipmentBuild; conditions: ModderConditions; onChoose: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState(''), [calculated, setCalculated] = useState(false), [limit, setLimit] = useState(40);
  const terms = useDeferredValue(query.toLowerCase().trim()).split(/\s+/);
  const isEquipment = target.kind === 'equipment';
  const installed = target.kind === 'mod' ? equipment.mods[target.index] : target.kind === 'arcane' ? equipment.arcanes[target.index] : target.kind === 'exilus' ? equipment.exilus : equipment.special;
  const occupied = [...equipment.mods, equipment.exilus, equipment.special].filter(mod => mod !== installed).flatMap(mod => { const definition = upgrades.get(mod.id); return definition ? [modFamily(definition)] : []; });
  const candidates = isEquipment ? catalog.filter(entry => entry.slot === slot && (slot !== 'Warframe' || entry.weaponType === 'Warframe')) : (target.kind === 'arcane' ? arcanes : mods).filter(mod => item && compatible(mod, item, target.kind as UpgradeKind));
  const matches = candidates.filter(entry => {
    const mod = isEquipment ? undefined : entry as Upgrade;
    if (!terms.every(term => `${entry.name} ${mod?.ranks.at(-1)?.join(' ') ?? ''}`.toLowerCase().includes(term))) return false;
    return !calculated || !mod || upgradeEffects({ ...emptyUpgrade(), id: mod.id, rank: mod.maxRank }, conditions).omitted.length === 0;
  });
  const title = isEquipment ? `Choose ${slot.toLowerCase()}` : target.kind === 'arcane' ? 'Choose arcane' : target.kind === 'special' ? `Choose ${slot === 'Warframe' ? 'aura' : 'stance'}` : 'Choose mod';
  return <Dialog title={title} onClose={onClose} className="modder-library" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <label className="search-field"><Search size={16} aria-hidden="true" /><input type="search" aria-label={isEquipment ? 'Search equipment' : 'Search mods and effects'} placeholder={isEquipment ? 'Search exact equipment or variant…' : 'Search name or effect…'} value={query} onChange={event => { setQuery(event.target.value); setLimit(40); }} autoFocus /></label>
    <div className="modder-library-tools"><span className="small muted" role="status">{matches.length} results</span>{!isEquipment && <label><input type="checkbox" checked={calculated} onChange={event => setCalculated(event.target.checked)} />Fully calculated only</label>}</div>
    <div className="modder-library-list">{matches.slice(0, limit).map(entry => {
      const mod = isEquipment ? undefined : entry as Upgrade;
      const effects = mod ? upgradeEffects({ ...emptyUpgrade(), id: mod.id, rank: mod.maxRank }, conditions) : undefined;
      const conflict = mod && (target.kind === 'arcane' ? equipment.arcanes.some(arc => arc !== installed && arc.id === mod.id) : occupied.includes(modFamily(mod)));
      return <button type="button" key={entry.id} className="modder-library-result" aria-label={`Equip ${entry.name}`} disabled={Boolean(conflict)} onClick={() => onChoose(entry.id)}>
        {isEquipment && (entry as CatalogItem).image && <img src={(entry as CatalogItem).image} alt="" loading="lazy" />}
        <span><strong>{entry.name}</strong><small>{mod ? rankText(mod, mod.maxRank) : `${(entry as CatalogItem).weaponType} · ${(entry as CatalogItem).variant}`}</small></span>
        {mod && <span className="modder-library-meta"><span>{conflict ? target.kind === 'arcane' ? 'Already equipped' : 'Conflicts with equipped mod' : effects!.omitted.length ? effects!.effects.length ? 'Partly calculated' : 'Reference only' : 'Calculated'}</span><small>Rank {mod.maxRank}{target.kind !== 'arcane' && ` · ${Math.abs(mod.drain) + mod.maxRank} ${target.kind === 'special' ? 'bonus capacity' : 'drain'}`}</small></span>}
      </button>;
    })}</div>
    {!matches.length && <p className="small muted">No compatible results. Try another name or turn off the filter.</p>}
    {matches.length > limit && <button type="button" className="button secondary" onClick={() => setLimit(limit + 40)}>Show more</button>}
  </Dialog>;
}

function UpgradeEditor({ label, value, kind, conditions, onChange, onPick, disabled, onMove, index }: { label: string; value: UpgradeSlot; kind: UpgradeKind; conditions: ModderConditions; onChange: (value: UpgradeSlot) => void; onPick: () => void; disabled: boolean; onMove?: (direction: number) => void; index?: number }) {
  const mod = upgrades.get(value.id), effects = upgradeEffects(value, conditions);
  const arcane = kind === 'arcane';
  return <div className={`modder-upgrade${value.id ? ' is-filled' : ''}${!value.enabled ? ' is-muted' : ''}`}>
    <div className="modder-upgrade-top"><span>{label}</span>{value.id && <><span className="modder-drain">{arcane ? `R${value.rank}` : `${kind === 'special' ? '+' : ''}${slotDrain(value, kind === 'special')} capacity`}</span><button type="button" className="icon-button" aria-label={`Remove ${label.toLowerCase()}`} title={`Remove ${label.toLowerCase()}`} disabled={disabled} onClick={() => onChange(emptyUpgrade(value.polarity))}><X size={14} aria-hidden="true" /></button></>}</div>
    <button type="button" className="modder-upgrade-pick" aria-label={`${label}: ${mod?.name ?? (value.id ? 'Unavailable upgrade' : 'empty')}`} disabled={disabled} onClick={onPick}>{mod ? mod.name : value.id ? 'Unavailable upgrade' : <><Plus size={16} aria-hidden="true" />{arcane ? 'Add arcane' : kind === 'special' ? `Add ${label.toLowerCase()}` : 'Add mod'}</>}<ChevronDown size={14} aria-hidden="true" /></button>
    {mod && <>
      <div className="modder-effect-text">{rankText(mod, value.rank)}</div>
      <div className="modder-rank"><span>Rank</span><input className="quantity-range" type="range" aria-label={`${label} rank slider`} min={0} max={mod.maxRank} step={1} value={Math.min(value.rank, mod.maxRank)} disabled={disabled} style={{ '--range-progress': `${value.rank / (mod.maxRank || 1) * 100}%` } as CSSProperties} onChange={event => onChange({ ...value, rank: Number(event.target.value) })} /><input type="number" aria-label={`${label} rank`} min={0} max={mod.maxRank} value={value.rank} disabled={disabled} onChange={event => { const rank = event.currentTarget.valueAsNumber; if (Number.isInteger(rank) && rank >= 0 && rank <= mod.maxRank) onChange({ ...value, rank }); }} /><span>/ {mod.maxRank}</span></div>
      {effects.maxStacks > 0 && <Numeric label={`${label} active stacks`} value={value.stacks} max={effects.maxStacks} onChange={stacks => onChange({ ...value, stacks })} disabled={disabled} />}
      <div className="modder-upgrade-bottom"><label><input type="checkbox" checked={value.enabled} aria-label={`Include ${label.toLowerCase()}`} disabled={disabled} onChange={event => onChange({ ...value, enabled: event.target.checked })} />Include</label>{effects.omitted.length > 0 && <span className="modder-coverage">{effects.effects.length ? 'Partial' : 'Reference only'}</span>}{onMove && <span className="modder-move"><button type="button" className="icon-button" aria-label={`Move ${label.toLowerCase()} earlier`} title={`Move ${label.toLowerCase()} earlier`} disabled={disabled || index === 0} onClick={() => onMove(-1)}><ArrowLeft size={14} aria-hidden="true" /></button><button type="button" className="icon-button" aria-label={`Move ${label.toLowerCase()} later`} title={`Move ${label.toLowerCase()} later`} disabled={disabled || index === 7} onClick={() => onMove(1)}><ArrowRight size={14} aria-hidden="true" /></button></span>}</div>
    </>}
    {!arcane && <Select label={`${label} polarity`} value={value.polarity} options={polarityOptions.filter(option => option.value !== 'universal' || kind === 'special')} onChange={polarity => onChange({ ...value, polarity: polarity as Polarity })} disabled={disabled} />}
  </div>;
}

function Results({ result, compared, compareName }: { result: Calculation; compared?: Calculation; compareName?: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [allOpen, setAllOpen] = useState(false);
  const delta = (step: CalculationStep) => {
    const old = compared?.steps.find(previous => previous.label === step.label);
    return old?.value !== null && old?.value !== undefined && step.value !== null ? step.value - old.value : null;
  };
  return <aside id="modder-results" className="modder-results" aria-label="Calculated results" tabIndex={-1}>
    <div className="modder-section-title"><h2>Results</h2><span className="badge modder-modeled">Modeled</span></div>
    {compareName && <p className="small muted">Changes from {compareName}</p>}
    <div className="modder-metrics" role="status" aria-label="Build results">{result.headline.map(step => <div key={step.label}><span>{step.label}</span><strong>{valueText(step)}</strong></div>)}</div>
    {!!result.damage.length && <div className="modder-damage" aria-label="Damage distribution"><h3>Damage / projectile</h3>{result.damage.map(part => <div key={part.type}><span>{titleCase(part.type)}</span><meter min={0} max={result.damage.reduce((sum, value) => sum + value.value, 0)} value={part.value} aria-label={`${titleCase(part.type)} damage`} /><strong>{fmt(part.value)}</strong></div>)}</div>}
    <div className="modder-breakdown-heading"><h3 className="modder-breakdown-title">How it’s calculated</h3><button type="button" className="button quiet" onClick={() => { body.current?.querySelectorAll('details').forEach(details => { details.open = !allOpen; }); setAllOpen(!allOpen); }}>{allOpen ? 'Collapse all' : 'Expand all'}</button></div>
    <div ref={body} className="modder-calculations">{result.steps.map((step, index) => <details key={step.label} open={index === 0 ? true : undefined}>
      <summary><span>{step.label}</span><strong data-result={step.label}>{valueText(step)}</strong>{delta(step) !== null && <small className="modder-delta">{delta(step)! >= 0 ? '+' : ''}{fmt(delta(step)!)}{step.unit === '%' ? ' pp' : step.unit ? ` ${step.unit}` : ''}</small>}<ChevronDown size={14} aria-hidden="true" /></summary>
      <div className="modder-equation"><code>{step.formula}</code><p>{step.explanation}</p>{!!step.sources.length && <ul>{step.sources.map((source, i) => <li key={i}>{source}</li>)}</ul>}</div>
    </details>)}</div>
    {!!result.warnings.length && <details className="modder-limits"><summary>Calculation limits <span className="count">{result.warnings.length}</span></summary><ul>{result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    <p className="modder-results-note">Direct-hit model. Status damage, enemy special mechanics, and unmodeled effects are excluded.</p>
  </aside>;
}

function Conditions({ value, onChange, disabled, slot }: { value: ModderConditions; onChange: (next: ModderConditions) => void; disabled: boolean; slot: ArsenalSlot }) {
  const set = <K extends keyof ModderConditions>(key: K, next: ModderConditions[K]) => onChange({ ...value, [key]: next });
  return <details className="modder-settings"><summary><SlidersHorizontal size={16} aria-hidden="true" />Conditions <span>Target, buffs, combo</span><ChevronDown size={16} aria-hidden="true" /></summary><div className="modder-setting-body">
    <div className="modder-fields"><Numeric label="Target armor" value={value.armor} max={100000} onChange={next => set('armor', next)} disabled={disabled} /><Numeric label="Total armor strip %" value={value.strip} max={100} step={.1} onChange={next => set('strip', next)} disabled={disabled} /><div className="modder-field"><span>Target faction</span><Select label="Target faction" value={value.faction} options={['None', 'Grineer', 'Corpus', 'Infested', 'Corrupted', 'Sentient', 'Murmur'].map(value => ({ value, label: value === 'Corrupted' ? 'Orokin (Corrupted)' : value }))} onChange={next => set('faction', next)} disabled={disabled} /></div><Numeric label="Melee combo multiplier" value={value.combo} min={1} max={12} onChange={next => set('combo', next)} disabled={disabled} /></div>
    <div className="modder-buff"><label><input type="checkbox" checked={value.roar} disabled={disabled} onChange={event => set('roar', event.target.checked)} />Roar active</label><Numeric label="Roar base bonus %" value={value.roarBase} max={500} step={.1} onChange={next => set('roarBase', next)} disabled={disabled} /><span className="small muted">Scaled by this Warframe’s strength.</span></div>
    {slot === 'Warframe' && <div className="modder-fields"><Numeric label="Example base cast cost" value={value.abilityCost} max={10000} onChange={next => set('abilityCost', next)} disabled={disabled} /><Numeric label="Example base drain / s" value={value.abilityDrain} max={10000} step={.1} onChange={next => set('abilityDrain', next)} disabled={disabled} /></div>}
  </div></details>;
}

export function Modder({ builds, onSave, canSave, disabled, onSignIn }: { builds: ArsenalBuild[]; onSave: (builds: ArsenalBuild[]) => boolean; canSave: boolean; disabled: boolean; onSignIn: () => void }) {
  const [draft] = useState(starter), [selected, setSelected] = useState(builds[0]?.id ?? ''), [slot, setSlot] = useState<ArsenalSlot>('Warframe');
  const [picker, setPicker] = useState<PickerTarget | null>(null), [compareId, setCompareId] = useState('');
  const build = builds.find(build => build.id === selected) ?? builds[0] ?? draft;
  const equipment = build.equipment[slot], item = items.get(equipment.id), cap = capacity(equipment);
  const compareBuild = builds.find(build => build.id === compareId && build.id !== selected);
  const result = useMemo(() => calculate(build, slot, items), [build, slot]);
  const compared = useMemo(() => compareBuild ? calculate(compareBuild, slot, items) : undefined, [compareBuild, slot]);
  const problems = validateEquipment(equipment, item);
  const save = (next: ArsenalBuild) => { if (onSave(builds.some(build => build.id === next.id) ? builds.map(build => build.id === next.id ? next : build) : [...builds, next])) setSelected(next.id); };
  const updateEquipment = (next: EquipmentBuild) => save({ ...build, equipment: { ...build.equipment, [slot]: next } });
  const editUpgrade = (kind: UpgradeKind, index: number, value: UpgradeSlot) => updateEquipment(kind === 'mod' ? { ...equipment, mods: equipment.mods.map((mod, i) => i === index ? value : mod) } : kind === 'arcane' ? { ...equipment, arcanes: equipment.arcanes.map((arcane, i) => i === index ? value : arcane) } : { ...equipment, [kind]: value });
  const choose = (id: string) => {
    if (!picker) return;
    if (picker.kind === 'equipment') {
      const nextItem = items.get(id)!;
      const next = equipItem(nextItem, slot);
      const retain = (old: UpgradeSlot, fresh: UpgradeSlot, kind: UpgradeKind) => { const mod = upgrades.get(old.id); return mod && compatible(mod, nextItem, kind) ? { ...old, polarity: fresh.polarity } : fresh; };
      next.mods = next.mods.map((fresh, index) => retain(equipment.mods[index], fresh, 'mod'));
      next.exilus = retain(equipment.exilus, next.exilus, 'exilus'); next.special = retain(equipment.special, next.special, 'special');
      next.arcanes = next.arcanes.map((fresh, index) => retain(equipment.arcanes[index], fresh, 'arcane'));
      updateEquipment(next);
    } else {
      const old = picker.kind === 'mod' ? equipment.mods[picker.index] : picker.kind === 'arcane' ? equipment.arcanes[picker.index] : equipment[picker.kind];
      editUpgrade(picker.kind, picker.index, { ...emptyUpgrade(old.polarity), id, rank: upgrades.get(id)!.maxRank });
    }
    setPicker(null);
  };
  const editor = (kind: UpgradeKind, index: number, label: string, value: UpgradeSlot) => <UpgradeEditor key={`${kind}-${index}`} label={label} kind={kind} value={value} conditions={build.conditions} onChange={value => editUpgrade(kind, index, value)} onPick={() => setPicker({ kind, index })} disabled={disabled} index={index} onMove={kind === 'mod' ? direction => {
    const mods = [...equipment.mods], other = index + direction;
    [mods[index], mods[other]] = [{ ...mods[other], polarity: mods[index].polarity }, { ...mods[index], polarity: mods[other].polarity }];
    updateEquipment({ ...equipment, mods });
  } : undefined} />;
  const baseKeys = slot === 'Warframe' ? ['health', 'shield', 'armor', 'energy'] : ['criticalChance', 'criticalMultiplier', 'procChance', 'fireRate', 'multishot', 'magazineSize', 'reloadTime'];
  const baseLabels: Record<string, string> = { health: 'Health', shield: 'Shields', armor: 'Armor', energy: 'Energy', criticalChance: 'Critical chance (0–1)', criticalMultiplier: 'Critical multiplier', procChance: 'Status chance (0–1)', fireRate: 'Fire / attack rate', multishot: 'Base projectile count', magazineSize: 'Magazine', reloadTime: 'Reload seconds' };
  return <section className="modder-page" aria-label="Modder">
    <div className="modder-toolbar"><div className="modder-title"><h1>Modder</h1><span className="small muted">{canSave ? 'Account builds' : 'Temporary workshop'}</span></div><div className="modder-build-actions">
      {builds.length > 1 && <Select label="Arsenal build" value={build.id} options={builds.map(build => ({ value: build.id, label: build.name }))} onChange={id => { setSelected(id); setCompareId(''); }} />}
      <button type="button" className="button secondary" disabled={disabled || builds.length >= 100} onClick={() => { const next = starter(); next.name = `Arsenal ${builds.length + 1}`; save(next); }}><Plus size={16} aria-hidden="true" />New arsenal</button>
      <button type="button" className="button secondary" disabled={disabled || builds.length >= 100} onClick={() => { const next = structuredClone(build); next.id = crypto.randomUUID(); next.name = `${build.name.slice(0, 93)} (copy)`; if (!builds.some(saved => saved.id === build.id)) { if (onSave([build, next])) { setSelected(next.id); setCompareId(build.id); } } else { save(next); setCompareId(build.id); } }}><Copy size={16} aria-hidden="true" />Duplicate</button>
    </div></div>
    <div className="modder-name-row"><ArsenalName key={build.id} name={build.name} disabled={disabled} onChange={name => save({ ...build, name })} />{builds.length > 1 && <Select label="Compare with arsenal" value={compareBuild?.id ?? ''} options={[{ value: '', label: 'No comparison' }, ...builds.filter(entry => entry.id !== build.id).map(entry => ({ value: entry.id, label: `Compare: ${entry.name}` }))]} onChange={setCompareId} />}{builds.some(entry => entry.id === build.id) && <button type="button" className="button quiet" disabled={disabled} onClick={() => { const remaining = builds.filter(entry => entry.id !== build.id); if (onSave(remaining)) { setSelected(remaining[0]?.id ?? ''); setCompareId(''); } }}>Delete arsenal</button>}</div>
    <div className="modder-arsenal" role="group" aria-label="Arsenal equipment">{arsenalSlots.map((key, index) => {
      const selectedItem = items.get(build.equipment[key].id);
      return <button type="button" key={key} aria-label={`Edit ${key.toLowerCase()}`} aria-pressed={slot === key} onClick={() => setSlot(key)}><span className="modder-equipment-order">0{index + 1}</span>{selectedItem?.image && <img src={selectedItem.image} alt="" />}<span><small>{key}</small><strong>{selectedItem?.name ?? 'Choose equipment'}</strong><span>{build.equipment[key].mods.filter(mod => mod.id).length} / 8 mods</span></span></button>;
    })}</div>
    <div className="modder-workspace"><div className="modder-editor">
      <div className="modder-equipment-heading"><div><span className="small muted">{slot} · {item?.weaponType}</span><h2>{item?.name ?? 'Choose equipment'}</h2></div><button type="button" className="button secondary" disabled={disabled} onClick={() => setPicker({ kind: 'equipment', index: 0 })}>Change equipment</button></div>
      {item && <>
        <div className="modder-capacity"><div><span>Mod capacity</span><strong className={cap.used > cap.total ? 'error-text' : ''}>{cap.used} / {cap.total}</strong></div><progress aria-label="Mod capacity used" value={Math.min(cap.used, cap.total)} max={Math.max(1, cap.total)} /><span>{cap.total - cap.used < 0 ? `${cap.used - cap.total} over` : `${cap.total - cap.used} remaining`}</span></div>
        <div className="modder-capacity-options"><label><input type="checkbox" checked={equipment.doubled} disabled={disabled} onChange={event => updateEquipment({ ...equipment, doubled: event.target.checked })} />{slot === 'Warframe' ? 'Orokin Reactor' : 'Orokin Catalyst'}</label><Numeric label="Base capacity" value={equipment.capacity} max={40} onChange={capacity => updateEquipment({ ...equipment, capacity })} disabled={disabled} /><span className="small muted">{cap.bonus > 0 && `+${cap.bonus} from ${slot === 'Warframe' ? 'aura' : 'stance'}`}</span></div>
        {!!problems.length && <div className="callout caution"><strong>Build needs attention:</strong> {problems.join(' ')}</div>}
        <div className="modder-section-title"><h3>Mods</h3><span>{slot === 'Warframe' ? 'Change ranks or toggle effects.' : 'Elements combine in slot order.'}</span></div>
        <div className="modder-mod-grid">{equipment.mods.map((value, index) => editor('mod', index, `Mod ${index + 1}`, value))}</div>
        <div className="modder-extra-grid">{(slot === 'Warframe' || slot === 'Melee') && editor('special', 0, slot === 'Warframe' ? 'Aura' : 'Stance', equipment.special)}{editor('exilus', 0, 'Exilus', equipment.exilus)}</div>
        <div className="modder-section-title"><h3>Arcanes</h3><span>Set active stacks to include a trigger.</span></div><div className="modder-arcane-grid">{equipment.arcanes.map((value, index) => editor('arcane', index, `Arcane ${index + 1}`, value))}</div>
        <Conditions value={build.conditions} onChange={conditions => save({ ...build, conditions })} disabled={disabled} slot={slot} />
        <details className="modder-settings"><summary>Base stats & attack <span>{Object.keys(equipment.overrides).length ? 'Custom values' : slot === 'Warframe' ? 'Rank 30' : 'Catalog values'}</span><ChevronDown size={16} aria-hidden="true" /></summary><div className="modder-setting-body">
          {slot !== 'Warframe' && <Select label="Attack component" value={String(equipment.attack)} options={[{ value: '-1', label: 'Base attack (catalog)' }, ...(item.attacks ?? []).map((attack, index) => ({ value: String(index), label: attack.name }))]} onChange={attack => updateEquipment({ ...equipment, attack: Number(attack), overrides: {} })} disabled={disabled} />}
          <p className="small muted">{slot === 'Warframe' ? 'Unmodded stats at rank 30. Enter missing values from your Arsenal.' : 'Overrides are unmodded values. Critical and status chances use fractions: 0.25 = 25%.'}</p>
          <div className="modder-fields">{baseKeys.map(key => { const base = slot === 'Warframe' ? (frames.get(item.id)?.ranked as Record<string, number> | null)?.[key] : weaponSourceStats(item, equipment.attack)[key]; return <label className="modder-number" key={key}><span>{baseLabels[key]}</span><input type="number" aria-label={`Unmodded ${baseLabels[key]}`} min={0} max={100000} step="any" placeholder={typeof base === 'number' ? String(base) : 'Unknown'} value={equipment.overrides[key] ?? ''} disabled={disabled} onChange={event => { const overrides = { ...equipment.overrides }; if (!event.currentTarget.value) delete overrides[key]; else { const value = event.currentTarget.valueAsNumber; if (!Number.isFinite(value) || value < 0 || value > 100000) return; overrides[key] = value; } updateEquipment({ ...equipment, overrides }); }} /></label>; })}</div>
          <button type="button" className="button quiet" disabled={disabled || !Object.keys(equipment.overrides).length} onClick={() => updateEquipment({ ...equipment, overrides: {} })}>Restore source stats</button>
        </div></details>
      </>}
      <details className="modder-settings"><summary>Build notes<ChevronDown size={16} aria-hidden="true" /></summary><textarea aria-label="Build notes" rows={4} maxLength={10000} value={build.notes} disabled={disabled} onChange={event => save({ ...build, notes: event.target.value })} placeholder="Rotation, testing assumptions, or equipment to try…" /></details>
      <details className="modder-settings modder-sources"><summary>Sources & model coverage<ChevronDown size={16} aria-hidden="true" /></summary><div className="modder-setting-body"><p>{mods.length} mods and {arcanes.length} arcanes from the <a href={modderData.source} target="_blank" rel="noreferrer">equipment data snapshot</a>. Effects marked Partial or Reference only are listed under calculation limits. Rank values in descriptions are rounded; linear modifiers use the maximum value scaled by rank.</p><p>Warframe rank bonuses follow <a href={modderData.rankSource} target="_blank" rel="noreferrer">Update 34</a> where available, added to this snapshot’s unranked stats. Verify later balance changes with the editable base stats.</p><p><a href="https://support.warframe.com/hc/en-us/articles/200500194-Mod-Guide-Use-Fusion-Transmutation-Sale" target="_blank" rel="noreferrer">Mod capacity and polarity</a> · <a href="https://wiki.warframe.com/w/Damage/Calculation" target="_blank" rel="noreferrer">Damage mechanics</a></p><p>Companions, Exalted equipment, Rivens, shards, set bonuses, ability-specific simulations, and Incarnon evolutions are outside this model. Alternate attacks calculate one component at a time.</p></div></details>
      {!canSave && <button type="button" className="button quiet" onClick={onSignIn}>Sign in to save arsenals</button>}
    </div><Results key={slot} result={result} compared={compared} compareName={compareBuild?.name} /></div>
    {!!result.headline.length && <div className="modder-mobile-results"><span><small>{result.headline[0].label}</small><strong>{valueText(result.headline[0])}</strong></span><span><small>{result.headline[1].label}</small><strong>{valueText(result.headline[1])}</strong></span><button type="button" className="button secondary" onClick={() => { const results = document.getElementById('modder-results'); results?.scrollIntoView({ block: 'start' }); results?.focus({ preventScroll: true }); }}>Results<ArrowRight size={14} aria-hidden="true" /></button></div>}
    {picker && <Library key={`${slot}-${picker.kind}-${picker.index}`} target={picker} item={item} slot={slot} equipment={equipment} conditions={build.conditions} onChoose={choose} onClose={() => setPicker(null)} />}
  </section>;
}
