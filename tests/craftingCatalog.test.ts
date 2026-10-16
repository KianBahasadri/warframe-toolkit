import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCraftingData } from '../scripts/build-crafting.mjs';
import { craftingIndex, buildCraftingTree } from '../src/lib/crafting.ts';

function fixture() {
  const lists = {
    Sentinels: [{ uniqueName: '/sentinel', name: 'Test Sentinel', category: 'Sentinels' }, { uniqueName: '/prime', name: 'Test Sentinel Prime', category: 'Sentinels' }],
    Components: [{ uniqueName: '/systems', name: 'Systems', category: 'Components', parentUniqueNames: ['/prime'] }],
    Resources: [{ uniqueName: '/alloy', name: 'Alloy', category: 'Resources' }, { uniqueName: '/ore', name: 'Ore', category: 'Resources' }],
    Gear: [{ uniqueName: '/gear', name: 'Test Gear', category: 'Gear' }, { uniqueName: '/drill', name: 'Sunpoint Plasma Drill', category: 'Gear' }],
  };
  const recipe = (resultType: string, parts: [string, number][], extra = {}) => ({ resultType, buildPrice: 100, buildTime: 60, num: 1, ingredients: parts.map(([ItemType, ItemCount]) => ({ ItemType, ItemCount })), ...extra });
  const game = { dictionary: {}, resources: {}, weapons: {}, keys: {}, images: {}, recipes: {
    '/sentinel-bp': recipe('/sentinel', [['/alloy', 7], ['/alloy', 8]]),
    '/prime-bp': recipe('/prime', [['/systems', 1]]),
    '/systems-bp': recipe('/systems', [['/alloy', 5]]),
    '/alloy-bp': recipe('/alloy', [['/ore', 10]], { num: 10 }),
    '/gear-bp': recipe('/gear', [['/ore', 2]]),
    '/gear-ten-bp': recipe('/gear', [['/ore', 15]], { num: 10 }),
    '/hidden-bp': recipe('/gear', [['/ore', 1]], { hidden: true }),
    '/claim-bp': recipe('/gear', []),
    '/drill-bp': recipe('/drill', [['/ore', 100]]),
  } };
  return { lists, game };
}

test('standalone recipes survive an empty inventory catalog with shared parts, variants, and batch alternatives', () => {
  const { lists, game } = fixture();
  const data = buildCraftingData([], lists, game, { wfcdRaw: 'https://example.test' });
  const index = craftingIndex([], data.materials);
  assert.equal(index.get('/sentinel')?.kind, 'Companions');
  assert.equal(index.get('/sentinel')?.equipment, true);
  assert.equal(index.get('/prime')?.name, 'Test Sentinel Prime');
  assert.equal(index.get('/systems')?.name, 'Test Sentinel Prime Systems');
  assert.equal(index.get('/systems')?.wikiUrl, 'https://wiki.warframe.com/w/Test_Sentinel_Prime');
  assert.equal(index.get('/gear')?.kind, 'Gear');
  assert.deepEqual(index.get('/gear')?.recipes.map(recipe => recipe.quantity), [1, 10]);
  const tree = buildCraftingTree(index, { id: 'plan', itemId: '/sentinel', quantity: 1, completed: [], choices: {} })!;
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].quantity, 15);
  assert.equal(tree.children[0].batches, 2);
  assert.equal(tree.children[0].children[0].quantity, 20);
  assert.equal(index.get('/alloy')?.recipes.length, 1, 'Shared recipes must not be duplicated.');
  assert.equal(index.has('/drill'), false, 'An unused exported blueprint is not a craftable tool.');
  assert.equal(data.recipeCoverage.exported, 9);
  assert.equal(data.recipeCoverage.included, 6);
  assert.deepEqual(data.recipeCoverage.excluded.map(entry => entry.id), ['/claim-bp', '/drill-bp', '/hidden-bp']);
  assert.ok(data.recipeCoverage.excluded.every(entry => entry.reason));
});

test('an unresolved standalone ingredient fails generation instead of publishing an incomplete recipe', () => {
  const { lists, game } = fixture();
  game.recipes['/sentinel-bp'].ingredients.push({ ItemType: '/untranslated', ItemCount: 1 });
  assert.throws(() => buildCraftingData([], lists, game, {}), /Unresolved crafting ingredients: \/untranslated/);
});
