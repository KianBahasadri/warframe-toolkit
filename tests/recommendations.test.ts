import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEquipment, maximumRank, normalizeName } from '../src/lib/model.ts';
import type { CatalogItem, Equipment } from '../src/lib/model.ts';
import { calculateRecommendation, helminthStatus, recommendationFor } from '../src/lib/recommendations.ts';
import { defaultWeaponFilters, editableRecord, equipmentRows, filterEquipment } from '../src/lib/weaponCatalog.ts';
import { equipmentTableModel } from '../src/lib/inventoryColumns.ts';
import { filterRows, sortRows } from '../src/lib/tableView.ts';

const catalog: CatalogItem[] = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8')).items;
function equipment(name: string, changes: Partial<Equipment> = {}) {
  const catalogItem = catalog.find(entry => entry.name === name);
  assert.ok(catalogItem, name);
  return { ...createEquipment(catalogItem, { mastered: true, ...changes }), catalogItem };
}
const recommend = (name: string, changes: Partial<Equipment> = {}, inventory: Equipment[] = []) => calculateRecommendation(equipment(name, changes), new Map(inventory.map(item => [normalizeName(item.name), item])));

test('unfinished mastery outranks all preferences, crafting uses, variants and upgrades', () => {
  for (const entry of catalog.filter(item => item.slot !== 'Exalted')) {
    for (const override of ['None', 'Keep', "Don't keep"] as const) {
      const item = { ...createEquipment(entry, { mastered: false, rank: 30, override, dontKeep: true, upgraded: 'Yes', powerful: true, incarnonInstalled: 'Yes', helminth: 'No' }), catalogItem: entry };
      assert.equal(calculateRecommendation(item).action, 'Master', `${entry.name}: ${override}`);
      assert.equal(calculateRecommendation({ ...item, owned: false }).action, 'Acquire & master', entry.name);
    }
  }
});

test('a Prime counterpart always excludes Keep, including manual overrides and special variants', () => {
  for (const entry of catalog.filter(item => item.hasPrimeVariant)) {
    for (const override of ['None', 'Keep', "Don't keep"] as const) {
      for (const incarnonInstalled of ['Unknown', 'Yes', 'No'] as const) {
        for (const helminth of ['Unknown', 'Yes', 'No'] as const) {
          const item = { ...createEquipment(entry, { mastered: true, override, upgraded: 'Yes', powerful: true, incarnonInstalled, helminth }), catalogItem: entry };
          assert.notEqual(calculateRecommendation(item).action, 'Keep', `${entry.name}: ${override}`);
        }
      }
    }
  }
  assert.equal(recommend('Braton', { override: 'Keep', upgraded: 'Yes', powerful: true }).action, 'Sell');
  assert.equal(recommend('Strun Wraith', { override: 'Keep' }).action, 'Sell');
  assert.equal(recommend('Braton Prime').action, 'Add Incarnon');
});

test('mastery remains separate from rank, including Forma, rank-40 weapons and modular parts', () => {
  assert.equal(recommend('Anku', { rank: 0 }).action, 'Add Incarnon');
  assert.equal(recommend('Anku', { rank: 30, mastered: false }).action, 'Master');
  assert.match(recommend('Kuva Bramma', { rank: 30, mastered: false }).reason, /rank 40/);
  assert.equal(recommend('Kuva Bramma', { rank: 0 }).action, 'Keep');
  assert.equal(recommend('Raplak Prism', { mastered: false }).action, 'Master');
  assert.equal(recommend('Exalted Blade', { mastered: false }).action, 'Use');
});

test('crafting recommendations use exact remaining targets and required copy counts', () => {
  assert.equal(recommend('Boltor').action, 'Use for crafting');
  assert.match(recommend('Boltor').reason, /Boltace \(1× Boltor\)/);
  // A mastered but no-longer-owned target is complete for the collection plan.
  for (const target of [equipment('Boltace', { mastered: false }), equipment('Boltace', { owned: false })]) {
    assert.equal(recommend('Boltor', {}, [target]).action, 'Sell');
  }
  assert.equal(recommend('Boltor', {}, [equipment('Boltace', { owned: false, mastered: false })]).action, 'Use for crafting');
  assert.equal(recommend('Boltor Prime').action, 'Add Incarnon');
  assert.equal(recommend('Lex Prime', {}, [equipment('Aklex')]).action, 'Craft a spare');
  assert.match(recommend('Lex Prime').reason, /Aklex Prime \(2× Lex Prime\)/);
  assert.equal(recommend('Lex Prime', {}, [equipment('Aklex Prime')]).action, 'Add Incarnon');
  assert.equal(recommend('Vasto', {}, [equipment('Akvasto')]).action, 'Use for crafting');
  assert.match(recommend('Vasto', {}, [equipment('Akvasto')]).reason, /Redeemer/);
  assert.doesNotMatch(recommend('Vasto', {}, [equipment('Akvasto')]).reason, /Akvasto/);
});

test('crafting preserves invested copies, quest rewards and Incarnon candidates without a Prime', () => {
  assert.equal(recommend('Boltor', { upgraded: 'Yes' }).action, 'Craft a spare');
  assert.equal(recommend('Boltor', { incarnonInstalled: 'Yes' }).action, 'Craft a spare');
  assert.equal(recommend('Broken War').action, 'Craft a spare');
  assert.equal(recommend('Miter').action, 'Craft a spare');
  assert.equal(recommend('Boltor', { override: "Don't keep" }).action, 'Use for crafting');
});

test('Genesis eligibility, installed adapters and native Incarnon forms are distinct', () => {
  assert.equal(recommend('Anku').action, 'Add Incarnon');
  assert.match(recommend('Anku').reason, /if not already fitted/);
  assert.equal(recommend('Anku', { upgraded: 'Yes' }).action, 'Add Incarnon');
  assert.equal(recommend('Anku', { incarnonInstalled: 'No' }).action, 'Add Incarnon');
  assert.equal(recommend('Anku', { incarnonInstalled: 'Yes' }).action, 'Keep');
  assert.equal(recommend('Anku', { incarnonInstalled: 'Yes', dontKeep: true }).action, 'Remove Incarnon');
  assert.equal(recommend('Braton', { incarnonInstalled: 'Yes' }).action, 'Remove Incarnon');
  assert.equal(recommend('Braton', { incarnonInstalled: 'No' }).action, 'Sell');
  assert.equal(recommend('Phenmor').action, 'Keep');
  assert.match(recommend('Phenmor').reason, /Native/);
});

test('Warframes check Helminth before disposal and never subsume Prime or Umbra variants', () => {
  assert.equal(recommend('Wisp', { mastered: false, helminth: 'No' }).action, 'Master');
  assert.equal(recommend('Wisp').action, 'Check Helminth');
  assert.equal(recommend('Wisp', { helminth: 'No', override: 'Keep' }).action, 'Subsume');
  assert.equal(recommend('Wisp', { helminth: 'Yes', override: 'Keep' }).action, 'Sell');
  assert.equal(recommend('Wisp Prime', { helminth: 'No' }).action, 'Keep');
  assert.equal(recommend('Excalibur Umbra', { helminth: 'No', override: "Don't keep" }).action, 'Use');
  assert.equal(recommend('Dante', { helminth: 'No' }).action, 'Keep');
  assert.equal(recommend('Dante', { helminth: 'No', dontKeep: true }).action, 'Subsume');
  assert.equal(recommend('Voidrig', { helminth: 'No', dontKeep: true }).action, 'Review');
  assert.equal(recommend('Bonewidow', { helminth: 'No' }).action, 'Keep');
});

test('Warframes ignore legacy weapon-only facts without rewriting them', () => {
  const item = createEquipment({ name: 'Custom Warframe', slot: 'Warframe', variant: 'Base' }, {
    mastered: true, hasPrimeVariant: true, craftingIngredient: true, craftingTarget: 'Legacy weapon target',
    incarnon: true, incarnonInstalled: 'Yes', helminth: 'No',
  });
  const before = structuredClone(item);
  assert.equal(calculateRecommendation(item).action, 'Subsume');
  assert.equal(calculateRecommendation({ ...item, helminth: 'Yes' }).action, 'Sell');
  assert.equal(calculateRecommendation({ ...item, hasPrimeVariant: false }).action, 'Keep');
  assert.doesNotMatch(calculateRecommendation({ ...item, mastered: false }).reason, /crafting|Incarnon|weapon|equipment/i);
  assert.doesNotMatch(calculateRecommendation({ ...item, helminth: 'Yes', hasPrimeVariant: false, dontKeep: true }).reason, /crafting|Incarnon|weapon|equipment/i);
  assert.equal(filterEquipment([{ ...item }], 'Legacy weapon target', defaultWeaponFilters).length, 0);
  assert.deepEqual(item, before);
});

test('Helminth filters distinguish unknown ability status from ineligible variants and Necramechs', () => {
  const items = [equipment('Wisp'), equipment('Dante', { helminth: 'No' }), equipment('Wisp Prime'), equipment('Excalibur Umbra'), equipment('Voidrig')];
  const rows = equipmentRows(items, catalog);
  assert.equal(helminthStatus(equipment('Wisp', { helminth: 'Yes' })), 'Yes');
  for (const [value, expected] of [['Unknown', ['Wisp']], ['No', ['Dante']], ['Not applicable', ['Excalibur Umbra', 'Voidrig', 'Wisp Prime']]] as const) {
    assert.deepEqual(filterEquipment(rows, '', { ...defaultWeaponFilters, helminth: value }).map(item => item.name), expected);
    assert.deepEqual(filterRows(rows, { helminth: { kind: 'choice', values: [value] } }, equipmentTableModel).map(item => item.name), expected);
  }
  assert.deepEqual(filterEquipment(rows, '', { ...defaultWeaponFilters, weaponType: 'Necramech' }).map(item => item.name), ['Voidrig']);
  assert.deepEqual(filterEquipment([{ ...createEquipment({ name: 'Custom Warframe', slot: 'Warframe', variant: 'Base' }) }], '', { ...defaultWeaponFilters, weaponType: 'Warframe' }).map(item => item.name), ['Custom Warframe']);
});

test('Warframe and Necramech rank limits guide mastery without changing the catalog snapshot', () => {
  assert.equal(maximumRank(equipment('Wisp').catalogItem), 30);
  for (const name of ['Voidrig', 'Bonewidow']) {
    const entry = equipment(name).catalogItem;
    const before = structuredClone(entry);
    assert.equal(maximumRank(entry), 40);
    assert.match(recommend(name, { mastered: false, rank: 30 }).reason, /rank 40/);
    assert.deepEqual(entry, before);
  }
});

test('personal preferences, investments, quests and special variants guide completed equipment', () => {
  assert.equal(recommend('Arca Titron').action, 'Sell');
  for (const changes of [{ override: 'Keep' as const, dontKeep: true }, { upgraded: 'Yes' as const }, { powerful: true }]) {
    assert.equal(recommend('Arca Titron', changes).action, 'Keep');
  }
  assert.equal(recommend('Arca Titron', { upgraded: 'Yes', override: "Don't keep" }).action, 'Sell');
  assert.equal(recommend('Nataruk').action, 'Keep');
  assert.equal(recommend('Paracesis', { dontKeep: true }).action, 'Review');
  assert.equal(recommend('Skiajati', { override: "Don't keep" }).action, 'Use');
  assert.equal(recommend('Kuva Bramma').action, 'Keep');
  assert.equal(recommend('Arca Titron', { owned: false }).action, 'No action');
});

test('unknown equipment retains manual crafting facts and does not invent catalog advice', () => {
  const item = createEquipment({ name: 'Custom weapon', slot: 'Primary', variant: 'Base' }, { mastered: true });
  assert.equal(calculateRecommendation(item).action, 'Review');
  assert.equal(calculateRecommendation({ ...item, incarnon: true }).action, 'Review');
  assert.equal(calculateRecommendation({ ...item, craftingIngredient: true, craftingTarget: 'Custom target' }).action, 'Use for crafting');
  assert.equal(calculateRecommendation({ ...item, hasPrimeVariant: true, override: 'Keep' }).action, 'Sell');
});

test('derived actions drive both filters and sorting without changing saved inventory', () => {
  const items = [equipment('Boltor'), equipment('Boltace'), equipment('Anku'), equipment('Arca Titron', { mastered: false }), equipment('Phenmor')];
  const before = structuredClone(items);
  const rows = equipmentRows(items, catalog);
  const boltor = rows.find(row => row.name === 'Boltor')!;
  assert.equal(recommendationFor(boltor).action, 'Sell');
  assert.deepEqual(filterEquipment(rows, '', { ...defaultWeaponFilters, keep: 'Sell' }).map(item => item.name), ['Boltace', 'Boltor']);
  assert.deepEqual(filterRows(rows, { keep: { kind: 'choice', values: ['Master'] } }, equipmentTableModel).map(item => item.name), ['Arca Titron']);
  const sorted = sortRows(rows, [{ key: 'keep', direction: 1 }], equipmentTableModel).map(item => recommendationFor(item).action);
  assert.deepEqual(sorted, ['Add Incarnon', 'Keep', 'Master', 'Sell', 'Sell']);
  assert.deepEqual(editableRecord(boltor), items[0]);
  assert.deepEqual(items, before);
});
