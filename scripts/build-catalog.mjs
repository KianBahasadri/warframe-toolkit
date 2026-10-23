import { questSupplements } from './catalog-supplements.mjs';
import { createRecipeResolver } from './recipe-resolver.mjs';

const canonicalName = name => name.replace(/^mk1-/i, 'MK1-');
const wiki = name => `https://wiki.warframe.com/w/${encodeURIComponent(name.replaceAll(' ', '_'))}`;
const cleanText = text => (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const baseSlots = { Primary: 'Primary', Secondary: 'Secondary', Melee: 'Melee', Warframes: 'Warframe', 'Arch-Gun': 'Archgun', 'Arch-Melee': 'Archmelee', SentinelWeapons: 'Companion' };
const variantWords = ['Prime', 'Umbra', 'Wraith', 'Vandal', 'Prisma', 'Kuva', 'Tenet', 'Dex', 'Coda', 'Sancti', 'Secura', 'Synoid', 'Rakta', 'Vaykor', 'Telos', 'Mara'];
export function weaponFamily(name) {
  if (name === 'Dex Furis') return 'Afuris';
  if (name === 'Dex Dakra') return 'Dex Dakra';
  return name.replace(/^MK1-/i, '').split(' ').filter(word => ![...variantWords, 'Sancti', 'Secura', 'Synoid', 'Rakta', 'Vaykor', 'Telos', 'Mara'].includes(word)).join(' ');
}
function variant(name) {
  if (/^MK1-/i.test(name)) return 'MK1';
  return variantWords.find(word => name.split(' ').includes(word)) || 'Base';
}
const round = value => Math.round(value * 10000) / 10000;

export function buildCatalog(lists, game, sources) {
  const all = Object.values(lists).flat();
  const byId = new Map(all.map(item => [item.uniqueName, item]));
  const translate = key => cleanText(game.dictionary[key] || (key?.startsWith('/') ? '' : key));
  const selected = all.filter(item => baseSlots[item.category] && item.masterable !== false || item.category === 'SentinelWeapons' || item.type === 'Exalted Weapon' || item.category === 'Misc' && (/\/Barrels?\//.test(item.uniqueName) && /(?:KitGun|SUModular)/.test(item.uniqueName) || item.type === 'Kitgun Component' && item.masterable || item.type === 'Amp' && /Prism$/.test(item.name) && item.components));
  for (const [id, item] of Object.entries(game.weapons)) {
    const name = translate(item.name);
    if (['Mote Amp', 'Sirocco'].includes(name) && !selected.some(x => x.name === name)) selected.push({ ...item, uniqueName: id, name, description: translate(item.description), category: 'Operator', type: 'Amp', imageName: null });
  }
  const unique = new Map();
  for (const item of selected) {
    // The export includes an enemy copy of Grimoire with the same display name.
    if (item.uniqueName.includes('Doppelganger')) continue;
    const name = canonicalName(item.name);
    if (!unique.has(name)) unique.set(name, { ...item, name });
  }
  // The export lists the Mote's prism rather than the assembled starter Amp.
  const mote = all.find(item => item.name === 'Mote Prism');
  if (mote) unique.set('Mote Amp', { uniqueName: mote.uniqueName, name: 'Mote Amp', type: 'Amp', category: 'Operator', masterable: true, icon: '/Lotus/Interface/Icons/StoreIcons/Operator/Amps/SentTrainingAmpAssembled.png', imageName: null, description: 'Starter Amp from the Quills. Its assembled stats are not available in this catalog source.' });
  const companionIds = new Set((lists.SentinelWeapons || []).map(item => item.uniqueName));
  const equipmentIds = new Set([...unique.values()].map(item => item.uniqueName));
  const { recipeMap, ingredient, groupedIngredients, recipeInfo, missingNames } = createRecipeResolver(lists, game, equipmentIds);
  const quests = new Map();
  const addReward = (path, quest) => {
    const id = path.replace('/Lotus/StoreItems/', '/Lotus/');
    const recipe = game.recipes[id];
    const result = recipe?.resultType || id;
    if (!equipmentIds.has(result)) return;
    const entries = quests.get(result) || [];
    const reward = { name: quest, kind: recipe ? 'Blueprint reward' : 'Weapon reward', url: wiki(quest) };
    if (!entries.some(x => x.name === reward.name && x.kind === reward.kind)) entries.push(reward);
    quests.set(result, entries);
  };
  const rewardPaths = object => {
    if (typeof object === 'string') return object.startsWith('/Lotus/') ? [object] : [];
    if (Array.isArray(object)) return object.flatMap(rewardPaths);
    if (object && typeof object === 'object') return Object.values(object).flatMap(rewardPaths);
    return [];
  };
  for (const quest of Object.values(game.keys)) {
    if (!quest.chainStages) continue;
    const title = translate(quest.name);
    if (!title) continue;
    for (const path of rewardPaths(quest.rewards)) addReward(path, title);
    for (const stage of quest.chainStages) {
      const paths = rewardPaths([stage.itemsToGiveWhenTriggered, stage.messageToSendWhenTriggered?.attachments, stage.messageToSendWhenTriggered?.countedAttachments, game.keys[stage.key]?.rewards]);
      for (const path of paths) addReward(path, title);
    }
  }
  const adapters = new Map(Object.entries(game.resources).filter(([id]) => id.includes('/IncarnonAdapters/') && id.endsWith('Unlocker')).map(([id, item]) => {
    const name = translate(item.name);
    return [name.replace(/ Incarnon Genesis$/, ''), { id, name, description: translate(item.description) }];
  }));
  const targets = new Map();
  for (const item of unique.values()) for (const [, recipe] of recipeMap.get(item.uniqueName) || []) for (const [id, count] of groupedIngredients(recipe)) {
    if (!equipmentIds.has(id) || id === item.uniqueName || recipe.hidden) continue;
    const current = targets.get(id) || [];
    if (!current.some(x => x.id === item.uniqueName)) current.push({ id: item.uniqueName, name: item.name, count });
    targets.set(id, current);
  }
  const primeFamilies = new Set([...unique.values()].filter(item => item.isPrime || item.name.split(' ').includes('Prime')).map(item => weaponFamily(item.name)));
  const items = [...unique.values()].map(item => {
    const id = item.uniqueName;
    const original = game.weapons[id] || {};
    const family = weaponFamily(item.name);
    const slot = companionIds.has(id) ? 'Companion' : item.productCategory === 'OperatorAmps' || item.type === 'Amp' || item.category === 'Operator' ? 'Amp' : item.type === 'Exalted Weapon' ? 'Exalted' : baseSlots[item.category] || 'Kitgun';
    const isZaw = item.type === 'Zaw Component';
    const modular = slot === 'Kitgun' ? 'Kitgun chamber: final stats and assembly costs depend on the grip and loader.' : isZaw ? 'Zaw strike: final stats and assembly costs depend on the grip and link.' : slot === 'Amp' && /Prism$/.test(item.name) ? 'Amp prism: final stats and assembly costs depend on the scaffold and brace.' : null;
    const recipes = (recipeMap.get(id) || []).filter(([, recipe]) => !recipe.hidden && recipe.ingredients?.length).map(([id, recipe]) => recipeInfo(id, recipe));
    if (!recipes.length && item.components?.length) recipes.push({ id: `${id}#recipe`, name: `${item.name} Blueprint`, credits: item.buildPrice ?? null, seconds: item.buildTime ?? null, quantity: item.buildQuantity || 1, ingredients: item.components.filter(x => game.recipes[x.uniqueName]?.resultType !== id && !/Blueprint$/.test(x.uniqueName)).map(x => ingredient(x.uniqueName, x.itemCount)) });
    // Exported claim placeholders (e.g. Lich rewards) are not craftable recipes.
    if (recipes.length === 1 && !recipes[0].ingredients.length) recipes.length = 0;
    const adapter = adapters.get(family);
    const native = item.tags?.includes('Incarnon') || false;
    const installation = adapter && recipeMap.get(adapter.id)?.[0];
    const incarnon = { type: native ? 'native' : adapter ? 'genesis' : 'none', name: native ? 'Native Incarnon' : adapter?.name || '', description: native ? 'Incarnon transformations and evolutions are built into this weapon.' : adapter?.description || '', installation: installation ? recipeInfo(...installation) : null, wikiUrl: wiki(native ? item.name : adapter?.name || 'Incarnon') };
    const craftingTargets = (targets.get(id) || []).sort((a,b) => a.name.localeCompare(b.name));
    const questRewards = [...(quests.get(id) || [])];
    for (const reward of questSupplements[item.name] || []) if (!questRewards.some(x => x.name === reward.name && x.kind === reward.kind)) questRewards.push(reward);
    const statKeys = ['totalDamage', 'criticalChance', 'criticalMultiplier', 'procChance', 'fireRate', 'accuracy', 'magazineSize', 'reloadTime', 'multishot', 'noise', 'trigger', 'range', 'blockingAngle', 'comboDuration', 'followThrough', 'slamAttack', 'slamRadialDamage', 'slamRadius', 'slideAttack', 'heavyAttackDamage', 'heavySlamAttack', 'heavySlamRadialDamage', 'heavySlamRadius', 'windUp'];
    const stats = Object.fromEntries(statKeys.filter(key => item[key] !== undefined).map(key => [key, typeof item[key] === 'number' ? round(item[key]) : item[key]]));
    const icon = item.icon || original.icon;
    const imageName = item.imageName || `${id.split('/').at(-1)}.png`;
    if (!/^[^/\\]+\.png$/i.test(imageName)) throw new Error(`Unexpected image filename: ${imageName}`);
    const imageSource = item.imageName ? `${sources.wfcdRaw}/data/img/${encodeURIComponent(item.imageName)}` : game.images[icon]?.contentHash ? `https://content.warframe.com/PublicExport${icon}!${game.images[icon].contentHash}` : `https://browse.wf${icon}`;
    const blueprints = (recipeMap.get(id) || []).map(([blueprint]) => byId.get(blueprint));
    const componentDrops = (item.components || []).flatMap(x => byId.get(x.uniqueName)?.drops || []);
    const acquisition = [...new Set([...(item.drops || []), ...componentDrops, ...blueprints.flatMap(x => x?.drops || [])].filter(drop => !drop.type || drop.type === item.name || drop.type.startsWith(`${item.name} `)).map(drop => `${drop.location}${drop.type ? ` · ${drop.type}` : ''}${Number.isFinite(drop.chance) ? ` · ${drop.chance}%` : ''}`))];
    const stance = original.compatibilityTags?.find(tag => tag.endsWith('_STANCE'))?.replace(/(?:_STANCE)+$/, '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    const blueprintPrices = (recipeMap.get(id) || []).map(([, recipe]) => recipe.excludeFromMarket ? null : recipe.creditsCost).filter(value => value != null);
    return {
      id, name: item.name, slot, variant: variant(item.name), masteryReq: item.masteryReq ?? 0,
      craftingTarget: craftingTargets.map(x => x.name).join(', '), craftingTargets,
      hasPrimeVariant: variant(item.name) !== 'Prime' && primeFamilies.has(family), wikiUrl: wiki(item.name),
      description: cleanText(item.description), image: `/images/equipment/${imageName}`, imageSource,
      weaponType: isZaw ? 'Zaw' : slot === 'Kitgun' ? 'Kitgun' : slot === 'Amp' ? 'Amp' : original.parentName?.endsWith('/LotusGrimoire') ? 'Tome' : stance || item.type || slot, family,
      tags: item.tags || [], maxRank: item.maxLevelCap || 30, masterable: item.masterable !== false,
      vaulted: item.vaulted ?? null, tradable: item.tradable || false, releaseDate: item.releaseDate || null,
      polarities: [...(item.polarities || []), ...(item.stancePolarity ? [`Stance: ${item.stancePolarity}`] : []), ...(item.exilusPolarity ? [`Exilus: ${item.exilusPolarity}`] : [])],
      recipes, incarnon, quests: questRewards, acquisition, modular,
      market: { credits: original.excludeFromMarket ? null : original.creditsCost ?? null, platinum: original.excludeFromMarket ? null : item.marketCost ?? original.platinumCost ?? null, blueprintCredits: blueprintPrices[0] ?? item.bpCost ?? null },
      stats: modular ? {} : stats, damage: modular ? {} : Object.fromEntries(Object.entries(item.damage || {}).filter(([key,value]) => key !== 'total' && value > 0).map(([key,value]) => [key,round(value)])),
      attacks: (modular ? [] : item.attacks || []).map(attack => ({ name: attack.name, stats: Object.fromEntries(Object.entries(attack).filter(([key,value]) => key !== 'name' && ['number','string'].includes(typeof value))), damage: attack.damage || {} })),
      sourceUrls: [sources.wfcd, sources.game, ...questRewards.filter(x => x.url.includes('support.warframe.com')).map(x => x.url)],
    };
  }).sort((a,b) => a.name.localeCompare(b.name));
  if (missingNames.size) throw new Error(`Unresolved recipe ingredients: ${[...missingNames].join(', ')}`);
  return items;
}
