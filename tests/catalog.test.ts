import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEquipment, normalizeName, slots, variants } from '../src/lib/model.ts';
import type { CatalogItem, Recipe } from '../src/lib/model.ts';
import { defaultWeaponFilters, editableRecord, equipmentRows, filterEquipment, toggleEquipment } from '../src/lib/weaponCatalog.ts';

const catalog: CatalogItem[] = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8')).items;
const weapon = (name: string) => { const item = catalog.find(entry => entry.name === name); assert.ok(item, `Missing ${name}`); return item; };

test('catalog has distinct equipment, local game images, valid stats, and resolved recipes', () => {
  assert.ok(catalog.filter(item => item.slot !== 'Warframe').length > 650);
  assert.equal(new Set(catalog.map(item => normalizeName(item.name))).size, catalog.length);
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length);
  const verifyRecipe = (recipe: Recipe, ancestors: string[] = []) => {
    assert.ok(!ancestors.includes(recipe.id), `Recipe cycle: ${recipe.id}`);
    assert.ok(recipe.quantity > 0);
    assert.ok(recipe.credits === null || recipe.credits >= 0);
    assert.ok(recipe.seconds === null || recipe.seconds >= 0);
    assert.ok(recipe.ingredients.length > 0);
    assert.equal(new Set(recipe.ingredients.map(part => part.id)).size, recipe.ingredients.length);
    for (const part of recipe.ingredients) {
      assert.ok(part.name && !['Unknown material', 'Barrel', 'Receiver', 'Blueprint'].includes(part.name), part.id);
      assert.ok(part.count > 0);
      for (const subrecipe of part.recipes || []) verifyRecipe(subrecipe, [...ancestors, recipe.id]);
    }
  };
  for (const item of catalog) {
    assert.ok(slots.includes(item.slot));
    assert.ok(variants.includes(item.variant));
    assert.ok(item.image?.startsWith('/images/equipment/'), item.name);
    const bytes = readFileSync(new URL(`../public${item.image}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], item.name);
    for (const value of Object.values(item.stats || {})) assert.ok(typeof value === 'string' || Number.isFinite(value));
    for (const recipe of item.recipes || []) verifyRecipe(recipe);
    if (item.incarnon?.installation) verifyRecipe(item.incarnon.installation);
  }
});

test('Incarnon variants do not cross into dual weapons or unrelated names', () => {
  for (const name of ['Boltor', 'Boltor Prime', 'Telos Boltor', 'MK1-Furis', 'Dex Sybaris', 'Lex Prime']) assert.equal(weapon(name).incarnon?.type, 'genesis', name);
  for (const name of ['Dex Furis', 'Afuris', 'Afuris Prime', 'Aklex Prime', 'Dual Skana']) assert.equal(weapon(name).incarnon?.type, 'none', name);
  assert.equal(weapon('Phenmor').incarnon?.type, 'native');
  const installation = weapon('Boltor').incarnon!.installation!;
  assert.ok(installation.ingredients.some(part => part.name === 'Pathos Clamp' && part.count === 20));
  assert.ok(installation.ingredients.some(part => part.name === 'Boltor Incarnon Genesis' && part.count === 1));
});

test('crafting relationships use exact variants and aggregate repeated weapons', () => {
  assert.deepEqual(weapon('Lex Prime').craftingTargets?.map(target => [target.name, target.count]), [['Aklex Prime', 2]]);
  assert.equal(weapon('Aklex Prime').recipes?.[0].ingredients.find(part => part.name === 'Lex Prime')?.count, 2);
  assert.equal(weapon('Lex Prime').recipes?.[0].ingredients[0].name, 'Lex Prime Barrel');
  assert.ok(weapon('Boltor').craftingTargets?.some(target => target.name === 'Boltace'));
  assert.ok(!weapon('Boltor Prime').craftingTargets?.some(target => target.name === 'Boltace'));
  assert.ok(weapon('Mutalist Cernos').craftingTargets?.some(target => target.name === 'Proboscis Cernos'));
  assert.equal(weapon('Braton').recipes?.length, 0);
  assert.equal(weapon('Kuva Bramma').recipes?.length, 0);
  assert.ok(weapon('Ogris').recipes?.[0].ingredients.find(part => part.name === 'Detonite Injector')?.recipes?.length);
});

test('special equipment and quest rewards are represented without fabricated assembly stats', () => {
  assert.equal(weapon('Artax').slot, 'Companion');
  assert.equal(weapon('Sirocco').slot, 'Amp');
  assert.equal(weapon('Mote Amp').slot, 'Amp');
  assert.equal(weapon('Catchmoon').slot, 'Kitgun');
  assert.deepEqual(weapon('Catchmoon').stats, {});
  assert.ok(weapon('Balla').modular);
  assert.equal(weapon('Exalted Blade').slot, 'Exalted');
  assert.ok(weapon('Nataruk').quests?.some(quest => quest.name === 'The New War' && quest.kind === 'Weapon reward'));
  assert.ok(weapon('Grimoire').id.endsWith('/TnGrimoire'));
  assert.ok(weapon('Grimoire').quests?.some(quest => quest.name === 'Whispers in the Walls'));
  assert.ok(weapon('Paracesis').quests?.some(quest => quest.name === 'Chimera Prologue' && quest.kind === 'Blueprint reward'));
  assert.ok(weapon('Broken War').quests?.some(quest => quest.name === 'The Second Dream'));
  assert.ok(weapon('Skiajati').quests?.some(quest => quest.name === 'The Sacrifice'));
});

test('browsing and catalog projection preserve saved planning facts and separate mastery from ownership', () => {
  const saved = createEquipment(weapon('Boltor'), { owned: false, mastered: true, rank: 0, craftingTarget: 'My original plan', incarnon: false, notes: 'Keep for Boltace', override: 'Keep' });
  const snapshot = structuredClone(saved);
  const rows = equipmentRows([saved], [weapon('Boltor'), weapon('Boltor Prime')], true);
  const boltor = rows.find(row => row.name === 'Boltor')!;
  assert.equal(boltor.incarnon, true);
  assert.equal(boltor.craftingTarget, 'Boltace');
  assert.equal(boltor.owned, false);
  assert.equal(boltor.mastered, true);
  assert.equal(boltor.rank, 0);
  assert.deepEqual(editableRecord(boltor), snapshot);
  assert.deepEqual(saved, snapshot);
  assert.deepEqual(filterEquipment(rows, '', defaultWeaponFilters), []);
  assert.equal(filterEquipment(rows, '', { ...defaultWeaponFilters, ownedOnly: false }).length, 2);
  const changed = toggleEquipment([saved], boltor, 'owned');
  assert.deepEqual(changed[0], { ...snapshot, owned: true, updatedAt: changed[0].updatedAt });
  assert.deepEqual(toggleEquipment([saved], boltor, 'incarnon'), [snapshot]);
});

test('catalog-only rows can be owned or mastered independently without storing the whole catalog', () => {
  const rows = equipmentRows([], [weapon('Lex'), weapon('Lex Prime')], true);
  const prime = rows.find(row => row.name === 'Lex Prime')!;
  const items = toggleEquipment([], prime, 'mastered');
  assert.equal(items.length, 1);
  assert.equal(items[0].owned, false);
  assert.equal(items[0].mastered, true);
  assert.ok(!items[0].id.startsWith('catalog:'));
  assert.equal('catalogItem' in items[0], false);
  assert.equal('saved' in items[0], false);
  // A stale row (e.g. changed in another tab) must update the existing record.
  const owned = toggleEquipment(items, prime, 'owned');
  assert.equal(owned.length, 1);
  assert.equal(owned[0].id, items[0].id);
  assert.equal(owned[0].mastered, true);
  assert.equal(owned[0].owned, true);
});

test('weapon filters combine ownership, mastery, variant, MR, Incarnon, quests and recipe facts', () => {
  const entries = ['Boltor', 'Boltor Prime', 'Lex Prime', 'Nataruk', 'Phenmor'].map(weapon);
  const rows = equipmentRows([createEquipment(weapon('Boltor'), { mastered: true })], entries, true);
  assert.deepEqual(filterEquipment(rows, '', defaultWeaponFilters).map(row => row.name), ['Boltor']);
  const filters = { ...defaultWeaponFilters, ownedOnly: false, variant: 'Prime', incarnon: 'genesis', mastery: 'no', maxMr: '8', ingredient: 'yes' };
  assert.deepEqual(filterEquipment(rows, '', filters).map(row => row.name), ['Lex Prime']);
  assert.deepEqual(filterEquipment(rows, 'new war', { ...defaultWeaponFilters, ownedOnly: false, quest: 'yes', recipe: 'no' }).map(row => row.name), ['Nataruk']);
  assert.deepEqual(filterEquipment(rows, '', { ...defaultWeaponFilters, ownedOnly: false, incarnon: 'native' }).map(row => row.name), ['Phenmor']);
  assert.deepEqual(filterEquipment(rows, 'boltor prime', { ...defaultWeaponFilters, ownedOnly: false }).map(row => row.name), ['Boltor Prime']);
});
