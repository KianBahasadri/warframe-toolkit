import { createHash } from 'node:crypto';

const clean = text => (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Ingredient metadata shares the exact export revisions used for the recipes. */
export function buildCraftingMaterials(catalog, lists, game, sources) {
  const records = new Map(Object.values(lists).flat().map(item => [item.uniqueName, item]));
  const equipment = new Map(catalog.map(item => [item.id, item]));
  const names = new Map();
  function visit(recipe) {
    names.set(recipe.id, recipe.name);
    for (const part of recipe.ingredients) {
      names.set(part.id, part.name);
      part.recipes?.forEach(visit);
    }
  }
  catalog.forEach(item => item.recipes?.forEach(visit));
  return [...names].filter(([id]) => !equipment.has(id)).map(([id, name]) => {
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
      ? result.parentUniqueNames?.map(id => equipment.get(id)).find(item => item && name.startsWith(`${item.name} `)) : undefined);
    return {
      id, name, description, location,
      ...(imageSource ? { image: `/images/crafting/${createHash('sha256').update(imageName ? `wfcd:${imageName}` : `export:${icon}`).digest('hex').slice(0, 16)}.png`, imageSource } : {}),
      wikiUrl: parent?.wikiUrl || `https://wiki.warframe.com/w/${encodeURIComponent(name.replace(/ Blueprint$/, '').replaceAll(' ', '_'))}`,
      blueprintCredits: blueprint && !blueprint.excludeFromMarket ? blueprint.creditsCost ?? null : null,
      tradable: item?.tradable === true,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
