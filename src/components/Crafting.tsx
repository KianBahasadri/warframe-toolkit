import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clock3, Info, ListChecks, MapPin, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { craftingDataSources, craftingDate, craftingItems } from '../data/crafting';
import { buildCraftingTree, checkCraftingNode, chooseCraftingRecipe, craftingDuration, craftingSummary, MAX_CRAFTING_PLANS } from '../lib/crafting';
import type { CraftingItem, CraftingNode, CraftingPlan } from '../lib/crafting';
import { Dialog } from './Dialog';
import { Select } from './Select';
import { useToasts } from './Toasts';
import { CraftingArtwork } from './CraftingArtwork';
import { CraftingDetails } from './CraftingDetails';
import { Currency, CurrencySymbol } from './Currency';
import './Crafting.css';

const number = (value: number) => value.toLocaleString();
const craftable = [...craftingItems.values()].filter(item => item.recipes.length).sort((a, b) => a.name.localeCompare(b.name));
const featured = ['Rhino', 'Wisp Prime', 'Boltor', 'Akjagara', 'Forma', 'Fieldron', 'Dragon Nikana', 'Ignis Wraith'];

function ItemPicker({ onPick, disabled }: { onPick: (item: CraftingItem) => void; disabled: boolean }) {
  const [query, setQuery] = useState(''), [kind, setKind] = useState('All'), [limit, setLimit] = useState(24);
  const deferred = useDeferredValue(query);
  const matches = useMemo(() => {
    const terms = deferred.trim().toLowerCase().split(/\s+/);
    return craftable.filter(item => (kind === 'All' || item.kind === kind) && terms.every(term => item.name.toLowerCase().includes(term)));
  }, [deferred, kind]);
  const preview = !deferred.trim() && kind === 'All';
  const visible = preview ? featured.flatMap(name => { const item = craftable.find(item => item.name === name); return item ? [item] : []; }) : matches.slice(0, limit);
  return <div className="craft-picker">
    <div className="craft-picker-tools"><label className="search-field"><Search size={17} /><input type="search" aria-label="Search craftable items" placeholder="Search equipment or materials…" value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} /></label><Select label="Crafting category" value={kind} options={['All', 'Weapons', 'Warframes', 'Materials'].map(value => ({ value, label: value === 'All' ? 'All items' : value }))} onChange={value => { setKind(value); setLimit(24); }} /></div>
    <div className="craft-picker-heading"><h2>{preview ? 'Choose an item' : 'Results'}</h2><span className="small muted" role="status">{preview ? `${craftable.length.toLocaleString()} craftable items` : `${matches.length.toLocaleString()} items`}</span></div>
    <div className="craft-picker-grid">{visible.map(item => <button type="button" key={item.id} className="craft-pick" aria-label={`Craft ${item.name}`} disabled={disabled} onClick={() => onPick(item)}><CraftingArtwork item={item} /><span className="craft-pick-copy"><strong>{item.name}</strong><span>{item.kind === 'Materials' ? 'Material / component' : item.catalogItem?.weaponType || item.kind}<ChevronRight size={14} /></span></span></button>)}</div>
    {!matches.length && <p className="craft-empty muted">No craftable items match. Try another name or category.</p>}
    {!preview && matches.length > limit && <button type="button" className="button secondary craft-more" onClick={() => setLimit(value => value + 24)}>Show more</button>}
    {preview && <button type="button" className="button quiet craft-more" onClick={() => setKind('Weapons')}>Browse weapons</button>}
  </div>;
}

function RecipeCost({ node }: { node: CraftingNode }) {
  return node.recipe ? <div className="craft-cost"><span title="Time per build"><Clock3 size={13} />{craftingDuration(node.recipe.seconds)}</span><span title="Build credits for this quantity">{node.recipe.credits === null ? 'Cost unknown' : <Currency value={node.recipe.credits * node.batches} currency="credits" />}</span>{node.batches > 1 && <span>{number(node.batches)} builds</span>}{node.recipe.quantity > 1 && <span>{number(node.recipe.quantity)} / build</span>}</div> : null;
}

type NodeActions = { onCheck: (key: string, checked: boolean) => void; onChoice: (key: string, choice: string) => void; onDetails: (node: CraftingNode) => void; disabled: boolean };

function IngredientNode({ node, actions }: { node: CraftingNode; actions: NodeActions }) {
  const [collapsed, setCollapsed] = useState(false);
  const childrenId = useId();
  const expanded = !collapsed && !node.completed;
  const choices = [{ value: 'gather', label: 'Gather / already built' }, ...node.item.recipes.map((recipe, i) => ({ value: recipe.id, label: node.item.recipes.length > 1 ? `Craft · recipe ${i + 1}` : 'Craft' }))];
  if (!choices.some(choice => choice.value === node.choice)) choices.push({ value: node.choice, label: 'Recipe unavailable' });
  return <li className={`craft-branch${node.completed ? ' is-complete' : ''}`} data-item={node.item.name}>
    <div className={`craft-node ${node.recipe ? 'is-build' : 'is-material'}`}>
      <div className="craft-node-main"><label className="craft-check"><input type="checkbox" aria-label={`Completed: ${node.item.name}`} checked={node.completed} disabled={actions.disabled} onChange={event => actions.onCheck(node.key, event.target.checked)} /></label><CraftingArtwork item={node.item} /><div className="craft-node-copy"><span className="craft-node-name">{node.item.name}</span><span className="craft-quantity">× {number(node.quantity)}{node.completed && <span className="craft-done"><Check size={12} />Done</span>}</span></div></div>
      {!node.completed && <RecipeCost node={node} />}
      {node.item.equipment && <span className="craft-consumed">Consumes equipment</span>}
      {node.problem && <p className="small error-text">{node.problem}</p>}
      <div className="craft-node-actions"><button type="button" className="button quiet" aria-label={`Sources for ${node.item.name}`} onClick={() => actions.onDetails(node)}><MapPin size={14} />Sources</button>
        {!!node.item.recipes.length && !node.completed && <Select label={`Method for ${node.item.name}`} value={node.choice} options={choices} onChange={value => actions.onChoice(node.key, value)} disabled={actions.disabled} />}
        {!!node.children.length && !node.completed && <button type="button" className="icon-button craft-expand" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.item.name} ingredients`} aria-expanded={expanded} aria-controls={childrenId} title={`${expanded ? 'Collapse' : 'Expand'} ${node.item.name} ingredients`} onClick={() => setCollapsed(value => !value)}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>}
      </div>
    </div>
    {!!node.children.length && <ul id={childrenId} className="craft-children" hidden={!expanded}>{node.children.map(child => <IngredientNode key={child.key} node={child} actions={actions} />)}</ul>}
  </li>;
}

export function Crafting({ plans, selected, onSelect, onSave, canSave, onSignIn, disabled }: { plans: CraftingPlan[]; selected: string; onSelect: (id: string) => void; onSave: (plans: CraftingPlan[]) => boolean; canSave: boolean; onSignIn: () => void; disabled: boolean }) {
  const [picker, setPicker] = useState(false), [info, setInfo] = useState(false);
  const [details, setDetails] = useState<{ item: CraftingItem; node?: CraftingNode }>();
  const [confirm, setConfirm] = useState<'reset' | 'remove'>();
  const [quantity, setQuantity] = useState('1');
  const heading = useRef<HTMLHeadingElement>(null);
  const focusPlan = useRef(false);
  const notify = useToasts();
  const plan = plans.find(plan => plan.id === selected) ?? plans[0];
  const root = useMemo(() => plan ? buildCraftingTree(craftingItems, plan) : null, [plan]);
  const summary = useMemo(() => root ? craftingSummary(root) : null, [root]);
  useEffect(() => { setQuantity(String(plan?.quantity ?? 1)); }, [plan?.id, plan?.quantity]);
  useEffect(() => { if (focusPlan.current && root) { focusPlan.current = false; heading.current?.focus({ preventScroll: true }); } }, [root]);
  const savePlan = (next: CraftingPlan) => onSave(plans.map(entry => entry.id === next.id ? next : entry));
  const addPlan = (item: CraftingItem) => {
    if (plans.length >= MAX_CRAFTING_PLANS) { notify(`Remove a plan before adding more (${MAX_CRAFTING_PLANS} maximum).`, 'caution'); return; }
    const next: CraftingPlan = { id: crypto.randomUUID(), itemId: item.id, quantity: 1, completed: [], choices: {} };
    if (!onSave([...plans, next])) return;
    focusPlan.current = true; onSelect(next.id); setPicker(false);
  };
  const updateQuantity = () => {
    if (!plan) return;
    const next = Number(quantity);
    if (!Number.isSafeInteger(next) || next < 1 || next > 100) { setQuantity(String(plan.quantity)); notify('Choose a quantity from 1 to 100.', 'caution'); return; }
    if (next !== plan.quantity && savePlan({ ...plan, quantity: next, completed: [] })) notify('Quantity updated. Progress reset for this plan.', 'neutral');
  };
  const actions: NodeActions = {
    onCheck: (key, checked) => { if (plan) savePlan(checkCraftingNode(plan, key, checked)); },
    onChoice: (key, choice) => { if (plan) savePlan(chooseCraftingRecipe(plan, key, choice)); },
    onDetails: node => setDetails({ item: node.item, node }), disabled,
  };
  return <section className="crafting-page" aria-label="Crafting">
    <header className="craft-heading"><div className="craft-title"><h1>Crafting</h1><button type="button" className="icon-button" aria-label="About Crafting" title="About Crafting" aria-haspopup="dialog" onClick={() => setInfo(true)}><Info size={16} /></button></div><div className="craft-heading-actions">{!canSave && <button type="button" className="button quiet" onClick={onSignIn}>Sign in to save plans</button>}{!!plans.length && <button type="button" className="button secondary" aria-haspopup="dialog" onClick={() => setPicker(true)} disabled={disabled || plans.length >= MAX_CRAFTING_PLANS}><Plus size={16} />New plan</button>}</div></header>
    {!plans.length ? <ItemPicker onPick={addPlan} disabled={disabled} /> : <>
      <div className="craft-plan-toolbar"><Select label="Crafting plan" value={plan.id} options={plans.map((entry, index) => ({ value: entry.id, label: `${craftingItems.get(entry.itemId)?.name ?? 'Unavailable item'}${entry.quantity > 1 ? ` × ${entry.quantity}` : ''}${plans.some((other, otherIndex) => otherIndex !== index && other.itemId === entry.itemId) ? ` · Plan ${index + 1}` : ''}` }))} onChange={onSelect} /><div className="craft-plan-tools"><button type="button" className="button quiet" disabled={disabled || !plan.completed.length} onClick={() => setConfirm('reset')}><RotateCcw size={14} />Reset progress</button><button type="button" className="icon-button" aria-label="Remove plan" title="Remove plan" disabled={disabled} onClick={() => setConfirm('remove')}><Trash2 size={16} /></button></div></div>
      {!root || !summary ? <p className="callout caution">This item is no longer in the catalog. Your plan has been kept.</p> : <>
        <div className={`craft-root${root.completed ? ' is-complete' : ''}`}><CraftingArtwork item={root.item} /><div className="craft-root-copy"><span className="craft-eyebrow">{root.item.catalogItem?.weaponType || 'Material / component'}</span><h2 ref={heading} tabIndex={-1}>{root.item.name}</h2><RecipeCost node={root} />{root.problem && <p className="small error-text">{root.problem}</p>}<button type="button" className="button quiet" onClick={() => actions.onDetails(root)}><MapPin size={14} />Blueprint & sources</button></div>
          <div className="craft-root-controls"><label className="craft-amount">Quantity<input type="number" aria-label="Craft quantity" min={1} max={100} value={quantity} disabled={disabled} onChange={event => setQuantity(event.target.value)} onBlur={updateQuantity} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} title="Changing quantity resets this plan’s progress." /></label>{(root.item.recipes.length > 1 || root.problem && !root.recipe) && <Select label="Recipe" value={root.recipe?.id || 'Recipe unavailable'} options={root.item.recipes.map((recipe, index) => ({ value: recipe.id, label: `Recipe ${index + 1} · ${recipe.credits === null ? 'Unknown cost' : `${number(recipe.credits)} credits`}`, content: <>Recipe {index + 1} · {recipe.credits === null ? 'Unknown cost' : <Currency value={recipe.credits} currency="credits" />}</> }))} onChange={value => actions.onChoice(root.key, value)} disabled={disabled} />}<label className="craft-root-check"><input type="checkbox" aria-label={`Completed: ${root.item.name}`} checked={root.completed} disabled={disabled} onChange={event => actions.onCheck(root.key, event.target.checked)} />{root.completed ? 'Completed' : 'Mark complete'}</label></div>
        </div>
        <div className="craft-progress"><span><ListChecks size={16} /><strong>{summary.completed} / {summary.total}</strong> steps complete</span><progress max={summary.total} value={summary.completed} aria-label="Crafting progress" /><span><CurrencySymbol currency="credits" decorative /><strong>{number(summary.credits)}{summary.unknownCredits ? '+' : ''}</strong> build credits left</span></div>
        <div className="craft-workspace"><section className="craft-tree" aria-label="Ingredient tree"><div className="craft-section-heading"><h3>Ingredients</h3><span className="small muted">{root.completed ? 'Complete' : `${root.children.length} branches`}</span></div>
          {root.completed ? <div className="craft-completed"><Check size={24} /><p>{root.item.name} completed.</p><span className="small muted">Uncheck the item to return to its ingredients.</span></div> : <ul className="craft-branches">{root.children.map(child => <IngredientNode key={child.key} node={child} actions={actions} />)}</ul>}
        </section><aside className="craft-remaining" aria-label="Remaining materials"><div className="craft-section-heading"><h3>Remaining materials</h3><span className="count">{summary.materials.length}</span></div>{summary.materials.length ? <ul>{summary.materials.map(({ item, quantity }) => <li key={item.id}><button type="button" aria-label={`Sources for remaining ${item.name}`} onClick={() => setDetails({ item })}><CraftingArtwork item={item} /><span>{item.name}</span><strong>{number(quantity)}</strong></button></li>)}</ul> : <p className="small muted">{root.completed ? 'Nothing left to gather.' : 'Materials gathered. Finish the remaining builds.'}</p>}</aside></div>
        <p className="craft-footnote">Checking a component covers its ingredients. Equipment ownership stays unchanged.</p>
      </>}
    </>}
    {picker && <Dialog title="New crafting plan" onClose={() => setPicker(false)} className="craft-picker-dialog" initialFocus="input[type=search]"><ItemPicker onPick={addPlan} disabled={disabled} /></Dialog>}
    {details && <CraftingDetails key={details.item.id} item={details.item} node={details.node} onClose={() => setDetails(undefined)} />}
    {confirm && <Dialog title={confirm === 'reset' ? 'Reset progress?' : 'Remove plan?'} onClose={() => setConfirm(undefined)} className="craft-confirm"><p className="small muted">{confirm === 'reset' ? 'Clear the checkmarks for this plan. Recipe choices stay the same.' : 'Remove this plan and its progress.'}</p><div className="craft-detail-links"><button type="button" className="button secondary" onClick={() => setConfirm(undefined)}>Cancel</button><button type="button" className="button primary" onClick={() => { const saved = confirm === 'reset' ? savePlan({ ...plan, completed: [] }) : onSave(plans.filter(entry => entry.id !== plan.id)); if (saved) setConfirm(undefined); }}>{confirm === 'reset' ? 'Reset progress' : 'Remove plan'}</button></div></Dialog>}
    {info && <Dialog title="About Crafting" onClose={() => setInfo(false)} className="craft-detail"><p>Choose an item, then gather its ingredients and complete each build.</p><p className="small muted">Batches are counted per branch; surplus is not shared. Build credits exclude blueprint purchases. Times are per build. Gather skips a component’s recipe; checking it off covers its ingredients. Neither changes your equipment inventory.</p><p className="small muted">Plans save to your account. Guest plans last until the page is reloaded. Changing quantity resets progress.</p><p className="small muted">Recipes cover catalog equipment and their craftable ingredients. Modular equipment lists component costs, not a complete assembled loadout. Missing recipes or sources are not inferred.</p><p className="small muted">Catalog: {craftingDate.slice(0, 10)} · Sources update with the official drop tables.</p><div className="craft-detail-links">{craftingDataSources.map((url, index) => <a href={url} key={url} target="_blank" rel="noreferrer">{index ? 'Game export' : 'Item data'} ↗</a>)}</div></Dialog>}
  </section>;
}
