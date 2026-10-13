import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCraftingTree, checkCraftingNode, chooseCraftingRecipe, craftingIndex, craftingSources, craftingSummary, validateCraftingPlans } from '../src/lib/crafting.ts';
import type { CraftingItem, CraftingMaterial, CraftingPlan } from '../src/lib/crafting.ts';
import type { CatalogItem, Recipe } from '../src/lib/model.ts';
import type { DropRow } from '../src/lib/dropTables.ts';
import { emptyProfile, validateProfile } from '../src/lib/account.ts';

const catalog: CatalogItem[] = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8')).items;
const materials: CraftingMaterial[] = JSON.parse(readFileSync(new URL('../src/data/crafting.json', import.meta.url), 'utf8')).materials;
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

test('catalog recipes expand without cycles, invalid quantities, or unresolved ingredients', () => {
  for (const item of index.values()) if (item.recipes.length) {
    const tree = buildCraftingTree(index, { id: 'test', itemId: item.id, quantity: 3, completed: [], choices: {} })!;
    const visit = (node: typeof tree) => {
      assert.equal(node.problem, undefined, `${item.name}: ${node.item.name}: ${node.problem}`);
      assert.ok(Number.isSafeInteger(node.quantity) && node.quantity > 0);
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
