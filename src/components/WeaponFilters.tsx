import type { EquipmentRow, WeaponFilters as Filters } from '../lib/weaponCatalog';
import { Select } from './Select';

export function WeaponFilters({ items, filters, onChange, activeOnly = false }: { items: EquipmentRow[]; filters: Filters; onChange: (value: Filters) => void; activeOnly?: boolean }) {
  const select = (key: keyof Filters, label: string, choices: [string, string][], emptyLabel = 'Any') => (!activeOnly || filters[key] !== '') && <label key={key}>{label}<Select label={label} value={String(filters[key])} onChange={value => onChange({ ...filters, [key]: value })} options={[{ value: '', label: emptyLabel }, ...choices.map(([value, title]) => ({ value, label: title }))]} /></label>;
  const types = [...new Set(items.map(item => item.catalogItem?.weaponType).filter((type): type is string => Boolean(type)))].sort();
  const variants = [...new Set(items.map(item => item.variant))].sort();
  return <div id="weapon-filters" className={activeOnly ? 'weapon-active-filters' : 'weapon-filters'} role="group" aria-label={activeOnly ? 'Active weapon filters' : 'Weapon filters'}>
    {(!activeOnly || !filters.ownedOnly) && <label className="owned-filter"><input type="checkbox" checked={filters.ownedOnly} onChange={event => onChange({ ...filters, ownedOnly: event.target.checked })} />Owned only</label>}
    {select('slot', 'Filter by slot', [...new Set(items.map(item => item.slot))].sort().map(slot => [slot, slot]), 'All slots')}
    {select('incarnon', 'Incarnon filter', [['yes', 'All Incarnon weapons'], ['native', 'Native Incarnon'], ['genesis', 'Incarnon Genesis compatible'], ['none', 'No Incarnon']], 'Any Incarnon status')}
    {select('weaponType', 'Weapon type', types.map(type => [type, type]))}
    {select('variant', 'Variant filter', variants.map(variant => [variant, variant]))}
    {select('mastery', 'Mastery', [['yes', 'Mastered'], ['no', 'Not mastered']])}
    {select('quest', 'Quest reward', [['yes', 'Weapon or blueprint reward'], ['no', 'No recorded quest reward']])}
    {select('ingredient', 'Used in crafting', [['yes', 'Crafting ingredient'], ['no', 'Not a crafting ingredient']])}
    {select('recipe', 'Foundry recipe', [['yes', 'Recipe available'], ['no', 'No recorded recipe']])}
    {select('prime', 'Prime counterpart', [['yes', 'Has Prime variant'], ['no', 'No Prime counterpart']])}
    {select('vaulted', 'Prime vault status', [['yes', 'Vaulted'], ['no', 'Not vaulted']])}
    {select('keep', 'Keep preference filter', [['Keep', 'Keep'], ["Don't keep", "Don't keep"]])}
    {(!activeOnly || filters.maxMr !== '') && <label>Maximum required MR<input type="number" min="0" max="30" step="1" placeholder="Any" value={filters.maxMr} onChange={event => onChange({ ...filters, maxMr: event.target.value })} /></label>}
  </div>;
}
