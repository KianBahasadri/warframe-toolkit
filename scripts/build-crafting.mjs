import { createHash } from 'node:crypto';
import { createRecipeResolver } from './recipe-resolver.mjs';
import { craftingExclusion } from './crafting-exclusions.mjs';

const clean = text => (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const wiki = name => `https://wiki.warframe.com/w/${encodeURIComponent(name.replace(/ Blueprint$/, '').replaceAll(' ', '_'))}`;
function kindOf(item) {
  if (['Sentinels', 'Pets'].includes(item?.category)) return 'Companions';
  if (item?.category === 'Archwing' || item?.type === 'Orbiter' || item?.type === 'K-Drive Component') return 'Vehicles';
  if (item?.category === 'Skins') return 'Cosmetics';
  if (['Gear', 'Quests'].includes(item?.category) || ['Ship Segment', 'Equipment Adapter', 'Extractor', 'Focus Lens', 'Key', 'Pet Resource'].includes(item?.type)
    || ['Orokin Catalyst', 'Orokin Reactor', 'Gravimag', 'Eidolon Phylaxis', 'Infested Catalyst'].includes(item?.name)) return 'Gear';
  return 'Materials';
}
function modularOf(item) {
  if (item?.category === 'Pets') return 'Companion component: pet assembly is separate.';
  if (item?.type === 'K-Drive Component') return 'K-Drive component: board assembly is separate.';
  if (item?.type === 'Kitgun Component' || /\/(?:KitGun|SUModular)\//.test(item?.uniqueName || '')) return 'Kitgun component: weapon assembly is separate.';
  if (item?.type === 'Zaw Component') return 'Zaw component: weapon assembly is separate.';
  if (item?.type === 'Amp') return 'Amp component: Amp assembly is separate.';
}

/** Include standalone Foundry results, not only ingredients of inventory equipment. */
export function buildCraftingData(catalog, lists, game, sources) {
  const records = new Map(Object.values(lists).flat().map(item => [item.uniqueName, item]));
  const equipment = new Map(catalog.map(item => [item.id, item]));
  const names = new Map();
  const included = new Set();
  function visit(recipe) {
    if (included.has(recipe.id)) return;
    included.add(recipe.id);
    names.set(recipe.id, recipe.name);
    for (const part of recipe.ingredients) {
      names.set(part.id, part.name);
      part.recipes?.forEach(visit);
    }
  }
  catalog.forEach(item => item.recipes?.forEach(visit));
  const equipmentIds = new Set([...equipment.keys(), ...[...records.values()].filter(item => ['Sentinels', 'Archwing'].includes(item.category)).map(item => item.uniqueName)]);
  const excluded = new Map();
  const { nameOf, recipeMap, recipesFor, missingNames } = createRecipeResolver(lists, game, equipmentIds, (id, recipe) => !excluded.has(id) && !recipe.hidden && recipe.ingredients?.length);
  for (const [id, recipe] of Object.entries(game.recipes)) {
    if (included.has(id)) continue;
    const name = nameOf(recipe.resultType);
    const exclusion = recipe.hidden ? { reason: 'Hidden blueprint.' }
      : !recipe.ingredients?.length ? { reason: 'No crafting ingredients (claim or reward placeholder).' }
      : !name ? { reason: 'No published result name.' }
      : craftingExclusion(records.get(recipe.resultType), name);
    if (exclusion) excluded.set(id, { id, name, ...exclusion });
  }
  const standalone = new Map();
  for (const [id, recipes] of recipeMap) {
    if (equipment.has(id) || !recipes.some(([recipeId]) => !included.has(recipeId) && !excluded.has(recipeId))) continue;
    const resolved = recipesFor(id);
    if (!resolved.length) continue;
    names.set(id, nameOf(id));
    standalone.set(id, resolved);
    resolved.forEach(visit);
  }
  if (missingNames.size) throw new Error(`Unresolved crafting ingredients: ${[...missingNames].join(', ')}`);
  const materials = [...names].filter(([id]) => !equipment.has(id)).map(([id, name]) => {
    const item = records.get(id);
    const exported = game.resources[id] || game.recipes[id] || {};
    const description = clean(item?.description || game.dictionary[exported.description]);
    const location = /\bLocation: (.+)$/i.exec(description)?.[1] || '';
    const imageName = item?.imageName;
    const icon = exported.icon;
    const imageSource = imageName ? `${sources.wfcdRaw}/data/img/${encodeURIComponent(imageName)}`
      : icon && game.images[icon]?.contentHash ? `https://content.warframe.com/PublicExport${icon}!${game.images[icon].contentHash}` : undefined;
    const blueprint = game.recipes[id];
    const result = records.get(blueprint?.resultType || id);
    const parent = equipment.get(blueprint?.resultType) || (result?.category === 'Components'
      ? result.parentUniqueNames?.map(id => equipment.get(id) || records.get(id)).find(item => item && name.startsWith(`${item.name} `)) : undefined);
    const recipes = standalone.get(id);
    return {
      id, name, description, location,
      ...(imageSource ? { image: `/images/crafting/${createHash('sha256').update(imageName ? `wfcd:${imageName}` : `export:${icon}`).digest('hex').slice(0, 16)}.png`, imageSource } : {}),
      wikiUrl: parent?.wikiUrl || parent?.wikiaUrl || (parent ? wiki(parent.name) : item?.wikiaUrl) || wiki(name),
      blueprintCredits: blueprint && !blueprint.excludeFromMarket ? blueprint.creditsCost ?? null : null,
      tradable: item?.tradable === true,
      kind: kindOf(item),
      ...(modularOf(item) ? { modular: modularOf(item) } : {}),
      ...(recipes ? { equipment: equipmentIds.has(id), recipes } : {}),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const unaccounted = Object.keys(game.recipes).filter(id => !included.has(id) && !excluded.has(id));
  if (unaccounted.length) throw new Error(`Crafting recipe coverage is incomplete: ${unaccounted.join(', ')}`);
  return { materials, recipeCoverage: { exported: Object.keys(game.recipes).length, included: Object.keys(game.recipes).filter(id => included.has(id)).length, excluded: [...excluded.values()].sort((a, b) => a.id.localeCompare(b.id)) } };
}
