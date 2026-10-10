import type { EquipmentRow, WeaponFilters as Filters } from '../lib/weaponCatalog';
import { Select } from './Select';

export function WeaponFilters({ items, filters, onChange }: { items: EquipmentRow[]; filters: Filters; onChange: (value: Filters) => void }) {
  const select = (key: keyof Filters, label: string, choices: [string, string][]) => <label key={key}>{label}<Select label={label} value={String(filters[key])} onChange={value => onChange({ ...filters, [key]: value })} options={[{ value: '', label: 'Any' }, ...choices.map(([value, title]) => ({ value, label: title }))]} /></label>;
  const types = [...new Set(items.map(item => item.catalogItem?.weaponType).filter((type): type is string => Boolean(type)))].sort();
  const variants = [...new Set(items.map(item => item.variant))].sort();
  return <div id="weapon-filters" className="weapon-filters" role="group" aria-label="Weapon filters">
    {select('weaponType', 'Weapon type', types.map(type => [type, type]))}
    {select('variant', 'Variant filter', variants.map(variant => [variant, variant]))}
    {select('mastery', 'Mastery', [['yes', 'Mastered'], ['no', 'Not mastered']])}
    {select('quest', 'Quest reward', [['yes', 'Weapon or blueprint reward'], ['no', 'No recorded quest reward']])}
    {select('ingredient', 'Used in crafting', [['yes', 'Crafting ingredient'], ['no', 'Not a crafting ingredient']])}
    {select('recipe', 'Foundry recipe', [['yes', 'Recipe available'], ['no', 'No recorded recipe']])}
    {select('prime', 'Prime counterpart', [['yes', 'Has Prime variant'], ['no', 'No Prime counterpart']])}
    {select('vaulted', 'Prime vault status', [['yes', 'Vaulted'], ['no', 'Not vaulted']])}
    {select('keep', 'Keep preference filter', [['Keep', 'Keep'], ["Don't keep", "Don't keep"]])}
    <label>Maximum required MR<input type="number" min="0" max="30" step="1" placeholder="Any" value={filters.maxMr} onChange={event => onChange({ ...filters, maxMr: event.target.value })} /></label>
  </div>;
}
