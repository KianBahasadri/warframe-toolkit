import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCraftingTree, checkCraftingNode, chooseCraftingRecipe, craftingAreas, craftingIndex, craftingSources, craftingSummary, preserveCraftingProgress, setCraftingProgress, validateCraftingPlans } from '../src/lib/crafting.ts';
import type { CraftingItem, CraftingMaterial, CraftingPlan } from '../src/lib/crafting.ts';
import type { CatalogItem, Recipe } from '../src/lib/model.ts';
import type { DropRow } from '../src/lib/dropTables.ts';
import { emptyProfile, validateProfile } from '../src/lib/account.ts';

const catalog: CatalogItem[] = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8')).items;
const craftingData = JSON.parse(readFileSync(new URL('../src/data/crafting.json', import.meta.url), 'utf8'));
const materials: CraftingMaterial[] = craftingData.materials;
const index = craftingIndex(catalog, materials);
const item = (name: string) => { const item = [...index.values()].find(item => item.name === name); assert.ok(item, name); return item; };
const planFor = (name: string, quantity = 1): CraftingPlan => ({ id: 'plan', itemId: item(name).id, quantity, completed: [], choices: {} });

test('generated ingredient metadata has local artwork, locations, and exact variants', () => {
  assert.ok(materials.length > 1000);
  for (const material of materials) {
    assert.ok(material.name && material.wikiUrl.startsWith('https://wiki.warframe.com/w/'));
    if (material.image) assert.deepEqual([...readFileSync(new URL(`../public${material.image}`, import.meta.url)).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  assert.match(item('Ferrite').location, /Mercury/);
  assert.match(item('Orokin Cell').location, /Ceres/);
  assert.notEqual(item('Rhino').id, item('Rhino Prime').id);
  assert.ok(item('Rhino Neuroptics').recipes.length);
  assert.equal(item('Rhino Neuroptics').wikiUrl, item('Rhino').wikiUrl);
  assert.equal(item('Lex Prime Barrel').wikiUrl, item('Lex Prime').wikiUrl);
  assert.ok(item('Forma').recipes.length);
});

test('Rhino expands components but gathers optional rare resources by default', () => {
  const tree = buildCraftingTree(index, planFor('Rhino'))!;
  assert.deepEqual(tree.children.map(node => node.item.name), ['Rhino Neuroptics', 'Rhino Chassis', 'Rhino Systems', 'Neurodes']);
  assert.equal(tree.children[0].recipe?.credits, 15000);
  const neurodes = tree.children[0].children.find(node => node.item.name === 'Neurodes')!;
  assert.ok(neurodes.item.recipes.length);
  assert.equal(neurodes.recipe, undefined);
  const summary = craftingSummary(tree);
  assert.equal(summary.credits, 70000);
  assert.equal(summary.materials.find(part => part.item.name === 'Ferrite')?.quantity, 1500);
  assert.equal(buildCraftingTree(index, planFor('Morphics'))!.recipe?.credits, 15000);
});

test('Oxylus has its exact Foundry recipe and rounds nested gem and alloy batches', () => {
  const tree = buildCraftingTree(index, planFor('Oxylus'))!;
  assert.equal(tree.item.kind, 'Companions');
  assert.equal(tree.item.id, '/Lotus/Types/Sentinels/SentinelPowersuits/RadarPowerSuit');
  assert.equal(tree.recipe?.name, 'Oxylus Blueprint');
  assert.equal(tree.recipe?.credits, 15000);
  assert.equal(tree.recipe?.seconds, 86400);
  assert.deepEqual(tree.children.map(node => [node.item.name, node.quantity]), [['Goblite Tears', 15], ['Axidrol Alloy', 45], ['Scrap', 40], ['Longwinder Lathe Coagulant', 10]]);
  assert.deepEqual(tree.children.slice(0, 2).map(node => [node.recipe?.quantity, node.batches]), [[10, 2], [20, 3]]);
  const summary = craftingSummary(tree);
  assert.equal(summary.credits, 23000);
  assert.deepEqual(Object.fromEntries(summary.materials.map(part => [part.item.name, part.quantity])), { Axidite: 60, Ferrite: 1500, Goblite: 20, 'Longwinder Lathe Coagulant': 10, Rubedo: 300, Scrap: 40 });
  assert.equal(item('Oxylus Blueprint').blueprintCredits, null, 'Standing purchases are not credit prices.');
});

test('Foundry categories cover standalone equipment, gear, cosmetics, and modular parts', () => {
  for (const [name, kind] of [['Taxon', 'Companions'], ['Carrier Prime', 'Companions'], ['Lambeo Moa', 'Companions'], ['Itzal', 'Vehicles'], ['Mantis', 'Vehicles'], ['Flatbelly', 'Vehicles'], ['Cipher', 'Gear'], ['Orokin Catalyst', 'Gear'], ['Helminth Segment', 'Gear'], ['Ash Locust Helmet', 'Cosmetics'], ['Loid Sentinel Skin', 'Cosmetics'], ['Anspatha Brace', 'Materials'], ['Peye', 'Materials']]) {
    assert.equal(item(name).kind, kind, name);
    assert.ok(item(name).recipes.length, name);
  }
  assert.notEqual(item('Carrier').id, item('Carrier Prime').id);
  assert.match(item('Lambeo Moa').modular!, /component.*assembly/);
  assert.match(item('Flatbelly').modular!, /component.*assembly/);
  assert.deepEqual(item('Cipher').recipes.map(recipe => recipe.quantity).sort((a, b) => a - b), [1, 10, 100]);
  for (const name of ['Sunpoint Plasma Drill', 'Test Forma', 'Pax Charge', 'The Silver Grove']) assert.ok(![...index.values()].some(item => item.name === name && item.recipes.length), name);
  assert.ok(!catalog.some(item => item.name === 'Oxylus'), 'Foundry coverage must not change inventory categories.');
});

test('the generated audit accounts for every exported recipe without including excluded IDs', () => {
  const recipes = new Set([...index.values()].flatMap(item => item.recipes.map(recipe => recipe.id)));
  const coverage = craftingData.recipeCoverage;
  assert.ok(coverage.exported > 1900);
  assert.ok(coverage.included > 1700);
  assert.equal(coverage.included + coverage.excluded.length, coverage.exported);
  assert.equal(new Set(coverage.excluded.map((entry: { id: string }) => entry.id)).size, coverage.excluded.length);
  for (const entry of coverage.excluded) {
    assert.ok(entry.reason, entry.id);
    assert.ok(!recipes.has(entry.id), entry.id);
  }
  // The inventory catalog also has a few sourced recipes without a Public Export ID.
  assert.equal([...recipes].filter(id => !id.endsWith('#recipe')).length, coverage.included);
});

test('areas follow unfinished materials, including independent occurrences and recipe choices', () => {
  let plan = planFor('Rhino');
  const tree = buildCraftingTree(index, plan)!;
  const locations = () => craftingAreas(craftingSummary(buildCraftingTree(index, plan)!).materials);
  const polymerArea = () => locations().find(area => area.items.some(item => item.name === 'Polymer Bundle'));
  assert.equal(polymerArea()?.location, 'Mercury, Venus, and Uranus');
  plan = checkCraftingNode(plan, tree.children[0].key, true);
  assert.ok(polymerArea(), 'The systems still need Polymer Bundle.');
  plan = checkCraftingNode(plan, tree.children[2].key, true);
  assert.equal(polymerArea(), undefined);
  plan = checkCraftingNode(plan, tree.children[0].key, false);
  assert.ok(polymerArea());
  plan = checkCraftingNode(plan, 'root', true);
  assert.deepEqual(locations(), []);

  const forma = planFor('Forma'), cell = buildCraftingTree(index, forma)!.children.find(node => node.item.name === 'Orokin Cell')!;
  const changed = chooseCraftingRecipe(forma, cell.key, cell.item.recipes[0].id);
  const names = craftingAreas(craftingSummary(buildCraftingTree(index, changed)!).materials).flatMap(area => area.items.map(item => item.name));
  assert.ok(names.includes('Nano Spores'));
  assert.ok(!names.includes('Orokin Cell'));
});

test('areas group shared locations, retain source restrictions, and leave unknown locations explicit', () => {
  const areas = craftingAreas([
    { item: item('Neurodes'), quantity: 1 }, { item: item('Neurodes Blueprint'), quantity: 1 },
    { item: item('Tellurium'), quantity: 2 }, { item: item('Lex Prime Barrel'), quantity: 1 },
    { item: item('Zodian'), quantity: 1 }, { item: item('Ferrite'), quantity: 0 },
  ]);
  assert.deepEqual(areas.find(area => area.location === 'Earth, Lua, Eris, and Deimos')?.items.map(item => item.name), ['Neurodes', 'Neurodes Blueprint']);
  assert.ok(areas.some(area => area.location === 'Archwing Missions on Uranus'));
  assert.equal(areas.find(area => area.items.some(item => item.name === 'Zodian'))?.location, 'Orb Vallis (Venus) from Blue Mining Veins and the Exploiter Orb');
  assert.equal(areas.at(-1)?.location, '');
  assert.equal(areas.at(-1)?.items[0].name, 'Lex Prime Barrel');
  assert.ok(!areas.some(area => area.items.some(item => item.name === 'Ferrite')));
});

test('batch output rounds each build up and multiplies nested ingredients and credits', () => {
  const recipe = (id: string, quantity: number, ingredients: Recipe['ingredients']): Recipe => ({ id, name: `${id} Blueprint`, credits: 100, seconds: 60, quantity, ingredients });
  const makeItem = (id: string, recipes: Recipe[] = []): CraftingItem => ({ id, name: id, recipes, kind: 'Materials', equipment: false, description: '', location: '', blueprintCredits: null, wikiUrl: '' });
  const fixture = new Map([makeItem('root', [recipe('root-bp', 1, [{ id: 'alloy', name: 'alloy', count: 7, equipment: false }])]), makeItem('alloy', [recipe('alloy-bp', 10, [{ id: 'ore', name: 'ore', count: 5, equipment: false }])]), makeItem('ore')].map(item => [item.id, item]));
  const tree = buildCraftingTree(fixture, { id: 'test', itemId: 'root', quantity: 3, completed: [], choices: {} })!;
  assert.equal(tree.batches, 3);
  assert.equal(tree.children[0].quantity, 21);
  assert.equal(tree.children[0].batches, 3);
  assert.equal(tree.children[0].children[0].quantity, 15);
  assert.equal(craftingSummary(tree).credits, 600);
});

test('completion covers a branch without erasing child progress or another occurrence', () => {
  let plan = planFor('Rhino');
  let tree = buildCraftingTree(index, plan)!;
  const neuroptics = tree.children[0], systems = tree.children[2];
  const polymer = neuroptics.children.find(node => node.item.name === 'Polymer Bundle')!;
  const otherPolymer = systems.children.find(node => node.item.name === 'Polymer Bundle')!;
  assert.notEqual(polymer.key, otherPolymer.key);
  plan = checkCraftingNode(plan, polymer.key, true);
  tree = buildCraftingTree(index, plan)!;
  assert.equal(craftingSummary(tree).materials.find(part => part.item.name === 'Polymer Bundle')?.quantity, 100);
  plan = checkCraftingNode(plan, neuroptics.key, true);
  assert.equal(craftingSummary(buildCraftingTree(index, plan)!).credits, 55000);
  plan = checkCraftingNode(plan, neuroptics.key, false);
  assert.deepEqual(plan.completed, [polymer.key]);
  tree = buildCraftingTree(index, checkCraftingNode(plan, 'root', true))!;
  const summary = craftingSummary(tree);
  assert.equal(summary.completed, summary.total); assert.equal(summary.credits, 0); assert.equal(summary.materials.length, 0);
});

test('partial materials remain independent and survive covering and restoring a branch', () => {
  let plan = planFor('Rhino');
  const tree = buildCraftingTree(index, plan)!;
  const component = tree.children[0], polymer = component.children.find(node => node.item.name === 'Polymer Bundle')!;
  plan = setCraftingProgress(plan, polymer.key, 50, polymer.quantity);
  assert.equal(craftingSummary(buildCraftingTree(index, plan)!).materials.find(part => part.item.name === 'Polymer Bundle')?.quantity, 200);
  plan = checkCraftingNode(plan, component.key, true, component.quantity);
  assert.equal(craftingSummary(buildCraftingTree(index, plan)!).materials.find(part => part.item.name === 'Polymer Bundle')?.quantity, 100);
  plan = checkCraftingNode(plan, component.key, false, component.quantity);
  assert.equal(craftingSummary(buildCraftingTree(index, plan)!).materials.find(part => part.item.name === 'Polymer Bundle')?.quantity, 200);
  assert.equal(plan.progress![polymer.key], 50);
});

test('partial equipment reduces recipe batches and restores exact child counts when requirements grow', () => {
  let plan = planFor('Aklex Prime');
  const original = buildCraftingTree(index, plan)!, lex = original.children.find(node => node.item.name === 'Lex Prime')!;
  plan = setCraftingProgress(plan, lex.key, 1, 2);
  let tree = buildCraftingTree(index, plan)!, part = tree.children.find(node => node.key === lex.key)!;
  assert.equal(part.remaining, 1); assert.equal(part.batches, 1);
  assert.equal(craftingSummary(tree).credits, craftingSummary(original).credits - lex.recipe!.credits!);
  const barrel = part.children.find(node => node.item.name === 'Lex Prime Barrel')!;
  assert.equal(barrel.quantity, 1);
  plan = setCraftingProgress(plan, barrel.key, 1, 1);
  plan = setCraftingProgress(plan, lex.key, 0, 2);
  tree = buildCraftingTree(index, plan)!; part = tree.children.find(node => node.key === lex.key)!;
  const restored = part.children.find(node => node.key === barrel.key)!;
  assert.equal(restored.quantity, 2); assert.equal(restored.acquired, 1); assert.equal(restored.remaining, 1); assert.equal(restored.completed, false);
  plan = chooseCraftingRecipe(plan, lex.key, 'gather');
  assert.deepEqual(plan.progress, {});
});

test('root progress scales whole branches and batch output rounds the remaining quantity', () => {
  const plan = planFor('Rhino', 3);
  const partial = buildCraftingTree(index, setCraftingProgress(plan, 'root', 1, 3))!;
  assert.equal(partial.batches, 2); assert.equal(partial.children[0].quantity, 2);
  assert.equal(craftingSummary(partial).credits, 140000);
  const alloy = { ...item('Forma'), recipes: [{ id: 'batch', name: 'Batch', quantity: 10, credits: 100, seconds: 60, ingredients: [] }] };
  const fixture = new Map([[alloy.id, alloy]]), batchPlan = { ...planFor('Forma', 21), progress: { root: 2 } };
  assert.equal(buildCraftingTree(fixture, batchPlan)!.batches, 2);
  assert.equal(craftingSummary(buildCraftingTree(fixture, batchPlan)!).credits, 200);
});

test('partial saves round-trip, reject malformed quantities, and protect older client updates', () => {
  const plan = { ...planFor('Rhino'), progress: { 'root/part': 50, 'root/other': 2 } };
  assert.deepEqual(validateCraftingPlans([plan]), [plan]);
  for (const progress of [null, [], { root: -1 }, { root: 1.5 }, { root: '2' }, { root: NaN }, { root: Infinity }]) {
    assert.throws(() => validateCraftingPlans([{ ...plan, progress }]), /original data has been kept/);
  }
  for (const amount of [-1, 1.5, 151, NaN]) assert.throws(() => setCraftingProgress(plan, 'root/part', amount, 150));
  const { progress, ...legacy } = plan;
  assert.deepEqual(preserveCraftingProgress([legacy], [plan])[0].progress, progress);
  assert.deepEqual(preserveCraftingProgress([{ ...legacy, completed: ['root/part'] }], [plan])[0].progress, { 'root/other': 2 });
  assert.deepEqual(preserveCraftingProgress([{ ...legacy, choices: { 'root/part': 'gather' } }], [plan])[0].progress, { 'root/other': 2 });
  assert.deepEqual(preserveCraftingProgress([{ ...legacy, progress: {} }], [plan])[0].progress, {});
  assert.equal(preserveCraftingProgress([{ ...legacy, quantity: 2 }], [plan])[0].progress, undefined);
});

test('gather and alternate recipe choices preserve independent branches and exact weapon consumption', () => {
  let plan = planFor('Aklex Prime');
  const tree = buildCraftingTree(index, plan)!;
  const lex = tree.children.find(node => node.item.name === 'Lex Prime')!;
  assert.equal(lex.quantity, 2); assert.equal(lex.batches, 2);
  assert.equal(lex.children.find(node => node.item.name === 'Lex Prime Barrel')?.quantity, 2);
  const other = tree.children.find(node => node !== lex)!;
  plan = checkCraftingNode(checkCraftingNode(plan, other.key, true), lex.children[0].key, true);
  plan = chooseCraftingRecipe(plan, lex.key, 'gather');
  assert.deepEqual(plan.completed, [other.key]);
  assert.equal(buildCraftingTree(index, plan)!.children.find(node => node.item.name === 'Lex Prime')!.children.length, 0);
  assert.equal(craftingSummary(buildCraftingTree(index, plan)!).materials.find(part => part.item.name === 'Lex Prime')?.quantity, 2);
});

test('all recipe alternatives expand without cycles, invalid quantities, or unresolved ingredients', () => {
  for (const item of index.values()) for (const recipe of item.recipes) {
    const tree = buildCraftingTree(index, { id: 'test', itemId: item.id, quantity: 3, completed: [], choices: { root: recipe.id } })!;
    const visit = (node: typeof tree) => {
      assert.equal(node.problem, undefined, `${item.name}: ${node.item.name}: ${node.problem}`);
      assert.ok(Number.isSafeInteger(node.quantity) && node.quantity > 0);
      assert.ok(node.item.name && !['Unknown material', 'Blueprint', 'Systems', 'Chassis', 'Avionics'].includes(node.item.name), node.item.id);
      node.children.forEach(visit);
    };
    visit(tree);
  }
});

test('removed recipes and unknown items remain explicit instead of resetting saved choices', () => {
  const plan = { ...planFor('Rhino'), choices: { root: '/removed-recipe' } };
  assert.match(buildCraftingTree(index, plan)!.problem!, /no longer available/);
  assert.deepEqual(plan.choices, { root: '/removed-recipe' });
  assert.equal(buildCraftingTree(index, { ...plan, itemId: '/removed-item' }), null);
  const loop = { ...item('Rhino'), recipes: [{ id: 'loop', name: 'Loop', quantity: 1, credits: 0, seconds: 0, ingredients: [{ id: item('Rhino').id, name: 'Rhino', count: 1, equipment: true }] }] };
  const tree = buildCraftingTree(new Map([[loop.id, loop]]), planFor('Rhino'))!;
  assert.match(tree.children[0].problem!, /chain unavailable/);
});

test('legacy profiles gain empty plans, while malformed plans are rejected intact', () => {
  const { craftingPlans, ...legacy } = emptyProfile();
  assert.deepEqual(validateProfile(legacy).craftingPlans, []);
  const valid = planFor('Rhino');
  assert.deepEqual(validateProfile({ ...legacy, craftingPlans: [valid] }).craftingPlans, [valid]);
  for (const value of [null, {}, [{ ...valid, quantity: 0 }], [{ ...valid, quantity: 1.5 }], [{ ...valid, completed: ['root', 'root'] }], [{ ...valid, choices: [] }], [{ ...valid, choices: { root: null } }], [valid, valid]]) {
    const original = JSON.stringify(value);
    assert.throws(() => validateProfile({ ...legacy, craftingPlans: value }), /original data has been kept/);
    assert.equal(JSON.stringify(value), original);
  }
  assert.deepEqual(validateCraftingPlans(craftingPlans), []);
});

test('sources match exact variants and resource bundles, keeping blueprint rewards and unknown rates distinct', () => {
  const rows = ['Rhino Neuroptics Blueprint', 'Rhino Prime Neuroptics Blueprint', '500X Ferrite', '100x Ferrite', 'Ferrite Dust'].map((reward, index) => ({ id: String(index), reward, source: `Source ${index}`, chance: index === 3 ? null : index }) as DropRow);
  assert.deepEqual(craftingSources(rows, 'Rhino Neuroptics', 'Rhino Neuroptics Blueprint').map(row => row.id), ['0']);
  assert.deepEqual(craftingSources(rows, 'Ferrite').map(row => row.id), ['2', '3']);
  assert.equal(craftingSources(rows, 'Ferrite')[1].chance, null);
});
