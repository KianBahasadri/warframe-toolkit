import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { catalog } from '../data/catalog';
import { frames } from '../lib/modder';
import { maximumRank, normalizeName } from '../lib/model';
import type { CatalogItem, Recipe } from '../lib/model';
import type { RelicCatalogItem } from '../lib/relicCatalog';
import type { EquipmentRow } from '../lib/weaponCatalog';
import { Currency } from './Currency';
import { Tooltip } from './Tooltip';
import { formatDuration, formatStat, formatStatLabel } from './WeaponDetails';

const byName = new Map(catalog.map(item => [normalizeName(item.name), item]));
const weaponStatOrder = ['totalDamage', 'criticalChance', 'criticalMultiplier', 'procChance', 'fireRate', 'multishot', 'magazineSize', 'reloadTime', 'trigger'];

export function HoverTip({ children, content, className }: { children: ReactNode; content: ReactNode | null; className?: string }) {
  if (!content) return className ? <span className={className}>{children}</span> : children;
  return <Tooltip passive className={className ?? ''} content={content}>{children}</Tooltip>;
}

function chance(value: number | null) {
  return value === null ? 'Not published' : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}
function brief(value: string | undefined) {
  if (!value) return;
  const text = value.trim();
  return text.length <= 180 ? text : `${text.slice(0, 177).trimEnd()}…`;
}
function orderedStats(stats: Record<string, number | string> | undefined) {
  if (!stats) return [];
  return weaponStatOrder.filter(key => key in stats && stats[key] !== '');
}
function StatList({ stats, damage }: { stats?: Record<string, number | string>; damage?: Record<string, number> }) {
  const keys = orderedStats(stats);
  const damageEntries = Object.entries(damage ?? {}).filter(([, value]) => value);
  if (!keys.length && !damageEntries.length) return null;
  return <dl>
    {keys.map(key => <Fragment key={key}><dt>{formatStatLabel(key)}</dt><dd>{formatStat(key, stats![key])}</dd></Fragment>)}
    {damageEntries.map(([key, value]) => <Fragment key={key}><dt>{formatStatLabel(key)}</dt><dd>{formatStat(key, value)}</dd></Fragment>)}
  </dl>;
}
function RecipeFacts({ recipe }: { recipe: Recipe }) {
  return <dl>
    <dt>Blueprint</dt><dd>{recipe.name}</dd>
    {recipe.ingredients.map(part => <Fragment key={part.id}><dt>{part.name}</dt><dd>× {part.count.toLocaleString()}</dd></Fragment>)}
    <dt>Credits</dt><dd>{recipe.credits === null ? 'Unknown' : <Currency value={recipe.credits} currency="credits" />}</dd>
    <dt>Build time</dt><dd>{formatDuration(recipe.seconds)}</dd>
    {recipe.quantity !== 1 && <><dt>Produces</dt><dd>{recipe.quantity.toLocaleString()}</dd></>}
  </dl>;
}

export function craftingHover(item: EquipmentRow): ReactNode | null {
  const targets = item.catalogItem?.craftingTargets ?? [];
  if (!targets.length) return item.craftingTarget ? <span className="market-tooltip"><strong>Used to craft</strong><span>{item.craftingTarget}</span></span> : null;
  return <span className="market-tooltip">
    <strong>Used to craft</strong>
    {targets.map(target => {
      const recipes = byName.get(normalizeName(target.name))?.recipes ?? [];
      const matching = recipes.filter(recipe => recipe.ingredients.some(part => normalizeName(part.name) === normalizeName(item.name)));
      const shown = matching.length ? matching : recipes;
      return <Fragment key={target.id}>
        <strong>{target.name}</strong>
        <span>Consumes {target.count.toLocaleString()}× {item.name}</span>
        {shown.map(recipe => <RecipeFacts key={recipe.id} recipe={recipe} />)}
        {!shown.length && <span>Recipe not recorded</span>}
      </Fragment>;
    })}
  </span>;
}

export function incarnonHover(item: EquipmentRow): ReactNode | null {
  const incarnon = item.catalogItem?.incarnon;
  if (!incarnon || incarnon.type === 'none') return null;
  return <span className="market-tooltip">
    <strong>{incarnon.name}</strong>
    <span>{incarnon.type === 'genesis' ? 'Genesis adapter' : 'Native Incarnon'}</span>
    {incarnon.description && <span>{incarnon.description}</span>}
    {incarnon.installation && <><strong>Adapter installation</strong><RecipeFacts recipe={incarnon.installation} /></>}
  </span>;
}

export function questHover(item: EquipmentRow): ReactNode | null {
  const quests = item.catalogItem?.quests ?? [];
  if (!quests.length) return null;
  return <span className="market-tooltip"><strong>Quests</strong><dl>
    {quests.map(quest => <Fragment key={`${quest.name}-${quest.kind}`}><dt>{quest.name}</dt><dd>{quest.kind === 'Blueprint reward' ? 'Blueprint' : 'Reward'}</dd></Fragment>)}
  </dl></span>;
}

export function rankHover(item: EquipmentRow): ReactNode | null {
  const catalogItem = item.catalogItem;
  if (!catalogItem) return null;
  return <span className="market-tooltip"><dl>
    <dt>Current rank</dt><dd>{item.rank ?? 'Unknown'}</dd>
    <dt>Maximum rank</dt><dd>{maximumRank(catalogItem) ?? 'Unknown'}</dd>
    <dt>Mastery rank</dt><dd>{catalogItem.masteryReq}</dd>
  </dl></span>;
}

export function variantHover(item: EquipmentRow): ReactNode | null {
  const catalogItem = item.catalogItem;
  if (!catalogItem) return null;
  const rows: [string, string][] = [];
  if (catalogItem.family && catalogItem.family !== item.name) rows.push(['Family', catalogItem.family]);
  if (typeof catalogItem.vaulted === 'boolean') rows.push(['Vaulted', catalogItem.vaulted ? 'Yes' : 'No']);
  if (catalogItem.releaseDate) rows.push(['Released', catalogItem.releaseDate]);
  if (typeof catalogItem.tradable === 'boolean') rows.push(['Tradable', catalogItem.tradable ? 'Yes' : 'No']);
  if (catalogItem.polarities?.length) rows.push(['Polarities', catalogItem.polarities.join(', ')]);
  if (!rows.length) return null;
  return <span className="market-tooltip"><dl>{rows.map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd>{value}</dd></Fragment>)}</dl></span>;
}

export function slotHover(item: EquipmentRow): ReactNode | null {
  const type = item.catalogItem?.weaponType;
  if (!type || type === item.slot) return null;
  return <span className="market-tooltip"><dl><dt>Type</dt><dd>{type}</dd></dl></span>;
}

function weaponHover(item: CatalogItem) {
  const listed = Object.keys(item.stats ?? {}).length ? { name: '', stats: item.stats, damage: item.damage } : item.attacks?.[0];
  const other = (item.attacks ?? []).map(attack => attack.name).filter(name => name !== 'Normal Attack' && name !== listed?.name);
  const cap = maximumRank(item);
  const stats = listed ? <StatList stats={listed.stats} damage={listed.damage} /> : null;
  return <span className="market-tooltip">
    <strong>{item.name}</strong>
    <span>{[item.weaponType, item.slot, 'Unmodded', `MR ${item.masteryReq}`, cap !== undefined ? `Max rank ${cap}` : ''].filter(Boolean).join(' · ')}</span>
    {listed?.name && <strong>{listed.name}</strong>}
    {stats ?? <span>{item.modular ? 'Stats depend on assembled parts.' : 'Stats unavailable.'}</span>}
    {other.length > 0 && <span>Other attacks: {other.join(', ')}</span>}
  </span>;
}

function frameHover(item: CatalogItem) {
  const frame = frames.get(item.id);
  const ranked = frame?.ranked;
  const cap = maximumRank(item);
  return <span className="market-tooltip">
    <strong>{item.name}</strong>
    <span>{[item.weaponType === 'Necramech' ? 'Necramech' : 'Warframe', cap !== undefined ? `Rank ${cap}` : '', `MR ${item.masteryReq}`].filter(Boolean).join(' · ')}</span>
    {ranked ? <dl>
      <dt>Health</dt><dd>{ranked.health.toLocaleString()}</dd>
      <dt>Shield</dt><dd>{ranked.shield.toLocaleString()}</dd>
      <dt>Armor</dt><dd>{ranked.armor.toLocaleString()}</dd>
      <dt>Energy</dt><dd>{ranked.energy.toLocaleString()}</dd>
      {frame.aura && <><dt>Aura</dt><dd>{frame.aura.replace(/^./, char => char.toUpperCase())}</dd></>}
    </dl> : <span>Survivability stats unavailable.</span>}
    {frame?.verified === false && <span>Ranked stats are unverified.</span>}
    {!!frame?.abilities.length && <><strong>Abilities</strong>{frame.abilities.map(ability => <span className="hover-line" key={ability.name}><strong>{ability.name}.</strong> {ability.description}</span>)}</>}
    {!frame && brief(item.description) && <span>{brief(item.description)}</span>}
  </span>;
}

export function equipmentHover(item: EquipmentRow): ReactNode | null {
  const catalogItem = item.catalogItem;
  if (!catalogItem) return null;
  return catalogItem.slot === 'Warframe' ? frameHover(catalogItem) : weaponHover(catalogItem);
}

export function relicHover(relic: { name: string; refinement: string; catalogItem?: RelicCatalogItem }): ReactNode | null {
  const rewards = relic.catalogItem?.rewards ?? [];
  if (!rewards.length) return null;
  return <span className="market-tooltip">
    <strong>{relic.name}</strong>
    <span>{relic.refinement} rewards</span>
    <dl>{rewards.map((reward, index) => <Fragment key={`${reward.id}:${index}`}>
      <dt>{reward.quantity > 1 ? `${reward.quantity.toLocaleString()}× ${reward.name}` : reward.name}</dt>
      <dd>{reward.rarity.replace(/^./, char => char.toUpperCase())} · {chance(reward.chance)}</dd>
    </Fragment>)}</dl>
  </span>;
}
