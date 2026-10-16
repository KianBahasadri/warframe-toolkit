const canonicalName = name => name.replace(/^mk1-/i, 'MK1-');
const clean = text => (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const genericParts = new Set(['Blueprint', 'Barrel', 'Receiver', 'Blade', 'Handle', 'Link', 'Stock', 'Chassis', 'Neuroptics', 'Systems', 'Harness', 'Wings', 'Avionics', 'Engines', 'Fuselage', 'Carapace', 'Cerebrum']);

/** Resolve names and nested recipes by game ID for both equipment and the Foundry. */
export function createRecipeResolver(lists, game, equipmentIds, allowRecipe = (_id, recipe) => !recipe.hidden && recipe.ingredients?.length) {
  const all = Object.values(lists).flat();
  const byId = new Map(all.map(item => [item.uniqueName, item]));
  const translate = key => clean(game.dictionary[key] || (key?.startsWith('/') ? '' : key));
  const nameOf = (id, seen = new Set()) => {
    if (seen.has(id)) return '';
    seen.add(id);
    const item = byId.get(id);
    if (item?.name && !genericParts.has(item.name)) return canonicalName(item.name);
    const named = translate(game.resources[id]?.name || game.weapons[id]?.name || game.keys[id]?.name);
    if (named && !genericParts.has(named)) return named;
    const recipe = game.recipes[id];
    if (recipe) { const result = nameOf(recipe.resultType, seen); if (result) return `${result} Blueprint`; }
    if (item?.name) {
      const parent = item.parentUniqueNames?.map(id => byId.get(id)).find(parent => parent?.name)
        || all.find(entry => entry.components?.some(component => component.uniqueName === id));
      return parent ? `${canonicalName(parent.name)} ${item.name}` : item.name;
    }
    return named;
  };
  const recipeMap = new Map();
  for (const [id, recipe] of Object.entries(game.recipes)) {
    const current = recipeMap.get(recipe.resultType) || [];
    current.push([id, recipe]);
    recipeMap.set(recipe.resultType, current);
  }
  const missingNames = new Set();
  const ingredient = (id, count, seen = new Set()) => {
    const name = nameOf(id);
    if (!name || genericParts.has(name)) missingNames.add(id);
    const parts = seen.size < 8 && !seen.has(id) ? recipesFor(id, new Set([...seen, id])) : [];
    return { id, name: name || 'Unknown material', count, equipment: equipmentIds.has(id), ...(parts.length ? { recipes: parts } : {}) };
  };
  const groupedIngredients = recipe => [...(recipe.ingredients || []).reduce((map, entry) => map.set(entry.ItemType, (map.get(entry.ItemType) || 0) + entry.ItemCount), new Map())];
  const recipeInfo = (id, recipe, seen = new Set([recipe.resultType])) => ({
    id, name: nameOf(id) || `${nameOf(recipe.resultType)} Blueprint`, credits: recipe.buildPrice ?? null,
    seconds: recipe.buildTime ?? null, quantity: recipe.num || 1,
    ingredients: groupedIngredients(recipe).map(([id, count]) => ingredient(id, count, seen)),
  });
  const recipesFor = (id, seen = new Set([id])) => (recipeMap.get(id) || []).filter(([recipeId, recipe]) => allowRecipe(recipeId, recipe)).map(([recipeId, recipe]) => recipeInfo(recipeId, recipe, seen));
  return { nameOf, recipeMap, recipesFor, ingredient, groupedIngredients, recipeInfo, missingNames };
}
