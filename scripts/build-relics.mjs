import { createHash } from 'node:crypto';
import { PUBLIC_EXPORT } from './public-export.mjs';

const refinementNames = { Bronze: 'Intact', Silver: 'Exceptional', Gold: 'Flawless', Platinum: 'Radiant' };
const cleanName = value => value.replace(/<[^>]+>\s*/g, '').trim();
const rewardKey = value => cleanName(value).replace(/^[\d,]+\s*[xX]?\s+/, '').toLowerCase();
const rewardQuantity = value => Number(/^([\d,]+)\s*[xX]?\s+/.exec(value)?.[1].replaceAll(',', '') ?? 1);
const key = (name, refinement) => `${name.toLowerCase()}|${refinement}`;

export function buildRelics(exports, drops) {
  const names = new Map(Object.values(exports).flat().filter(item => item.name).map(item => [item.uniqueName, cleanName(item.name)]));
  const recipes = new Map(exports.ExportRecipes.map(item => [item.uniqueName, item]));
  const images = new Map(exports.ExportManifest.map(item => [item.uniqueName, item.textureLocation]));
  const rewardTables = new Map(), sources = new Map();
  for (const row of drops.rows) {
    if (row.section === 'relicRewards') {
      const match = /^(.*) Relic \(([^)]+)\)$/.exec(row.source);
      if (!match) throw new Error(`Unrecognized relic reward table: ${row.source}`);
      const id = key(match[1], match[2]);
      if (!rewardTables.has(id)) rewardTables.set(id, []);
      rewardTables.get(id).push(row);
    } else {
      const match = /^(.*) Relic(?: \(([^)]+)\))?$/.exec(row.reward);
      if (!match) continue;
      const id = key(match[1], match[2] || 'Intact');
      if (!sources.has(id)) sources.set(id, new Map());
      const source = { source: row.source, rotation: row.rotation, stage: row.stage, chance: row.chance, tableChance: row.tableChance, anchor: row.anchor };
      sources.get(id).set(JSON.stringify(source), source);
    }
  }
  const byKey = new Map();
  for (const raw of exports.ExportRelicArcane.filter(item => item.relicRewards?.length)) {
    const name = cleanName(raw.name).replace(/ Relic$/, '');
    const suffix = raw.uniqueName.match(/(Bronze|Silver|Gold|Platinum)$/)?.[1];
    const refinement = suffix ? refinementNames[suffix] : name === 'Requiem Eterna' ? 'Unrefined' : undefined;
    if (!refinement) throw new Error(`Unknown refinement: ${raw.uniqueName}`);
    const id = key(name, refinement);
    const dropKey = key(name, refinement === 'Unrefined' ? 'Intact' : refinement);
    const table = rewardTables.get(dropKey) ?? [];
    const rewards = raw.relicRewards.map((reward, index) => {
      const rewardId = reward.rewardName.replace('/StoreItems/', '/');
      const result = recipes.get(rewardId)?.resultType;
      const rewardName = names.get(rewardId) || (result && names.has(result) ? `${names.get(result)} Blueprint` : undefined);
      if (!rewardName) throw new Error(`Missing reward name: ${rewardId}`);
      if (!Number.isInteger(reward.itemCount) || reward.itemCount < 1 || !['COMMON', 'UNCOMMON', 'RARE'].includes(reward.rarity)) throw new Error(`Invalid reward slot: ${rewardId}`);
      const matches = table.filter(row => rewardKey(row.reward) === rewardKey(rewardName) && rewardQuantity(row.reward) === reward.itemCount);
      // Identical rewards can occupy multiple rarity slots. Both official feeds
      // retain slot order; only use it when every slot's identity agrees.
      const ordered = matches.length > 1 && raw.relicRewards.every((slot, slotIndex) => {
        const slotId = slot.rewardName.replace('/StoreItems/', '/');
        const result = recipes.get(slotId)?.resultType;
        const slotName = names.get(slotId) || (result && names.has(result) ? `${names.get(result)} Blueprint` : '');
        return table[slotIndex] && rewardKey(table[slotIndex].reward) === rewardKey(slotName) && rewardQuantity(table[slotIndex].reward) === slot.itemCount;
      });
      if (table.length && matches.length !== 1 && !ordered) throw new Error(`Cannot match reward ${rewardName} in ${name} ${refinement}`);
      const published = ordered ? table[index] : matches[0];
      if (published?.chance !== undefined && published.chance !== null && (!Number.isFinite(published.chance) || published.chance < 0 || published.chance > 100)) throw new Error(`Invalid chance: ${name} ${refinement}`);
      return { id: rewardId, name: rewardName, quantity: reward.itemCount, rarity: reward.rarity.toLowerCase(), chance: published?.chance ?? null };
    });
    if (table.length && table.length !== rewards.length) throw new Error(`Reward count mismatch: ${name} ${refinement}`);
    const texture = images.get(raw.uniqueName);
    if (!texture?.startsWith('/Lotus/') || !texture.includes('.png!')) throw new Error(`Missing relic image: ${raw.uniqueName}`);
    const imageSource = `${PUBLIC_EXPORT}${texture}`;
    const item = {
      name, refinement, uniqueNames: [raw.uniqueName], description: cleanName(raw.description),
      image: `/images/relics/${createHash('sha256').update(imageSource).digest('hex').slice(0, 20)}.png`, imageSource,
      rewards, sources: [...(sources.get(dropKey)?.values() ?? [])],
    };
    const previous = byKey.get(id);
    if (previous) {
      if (JSON.stringify(previous.rewards) !== JSON.stringify(rewards) || previous.image !== item.image) throw new Error(`Conflicting duplicate relic: ${name} ${refinement}`);
      previous.uniqueNames.push(raw.uniqueName);
    } else byKey.set(id, item);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || Object.values(refinementNames).indexOf(a.refinement) - Object.values(refinementNames).indexOf(b.refinement));
}
