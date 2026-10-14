import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/catalog.json' with { type: 'json' };
import reference from '../src/data/arsenalWeaponStats.json' with { type: 'json' };
import type { CatalogItem } from '../src/lib/model.ts';
import { accuracyLabel, arsenalWeaponStats } from '../src/lib/arsenalStats.ts';
import { calculate, equipItem, mods } from '../src/lib/modder.ts';
import { newArsenal, emptyUpgrade } from '../src/lib/modderModel.ts';
import { readWeaponTables, buildArsenalStats } from '../scripts/build-arsenal-stats.mjs';

const catalog = data.items as unknown as CatalogItem[];
const items = new Map(catalog.map(item => [item.id, item]));
const item = (name: string) => catalog.find(item => item.name === name)!;

test('weapon references parse literal data without executing Lua and match exact variants and attacks', () => {
  const tables = readWeaponTables('return { Test = { InternalName = "exact", AmmoMax = 200, Attacks = { { AttackName = "Normal Attack", Range = 15, MinSpread = 8, FireRate = math.huge } } } }');
  const snapshot = buildArsenalStats([{ id: 'exact', name: 'Test', slot: 'Secondary', attacks: [{ name: 'Normal Attack' }, { name: 'Radial Attack' }] }, { id: 'variant', name: 'Test Prime', slot: 'Secondary' }], [tables]);
  assert.deepEqual(snapshot.exact.attacks, { 'Normal Attack': { minSpread: 8, range: 15 } });
  assert.equal(snapshot.exact.ammoMax, 200);
  assert.equal(snapshot.variant, undefined);
  assert.throws(() => readWeaponTables('return os.execute("anything")'), /Unsupported wiki value/);
  assert.throws(() => readWeaponTables('x = 1; return {}'), /Expected a returned/);
  assert.deepEqual(accuracyLabel(8), 'Low');
  assert.equal(accuracyLabel(undefined), null);
  assert.equal(accuracyLabel(0), 'Very High');
});

test('Atomos exposes live heat, viral and status alongside sourced utility rows and separate Incarnon attacks', () => {
  const build = newArsenal();
  build.equipment.Secondary = equipItem(item('Atomos'), 'Secondary');
  for (const [index, name] of ['Frostbite', 'Pistol Pestilence', 'Scorch', 'Hornet Strike'].entries()) {
    const mod = mods.find(mod => mod.name === name)!;
    build.equipment.Secondary.mods[index] = { ...emptyUpgrade(), id: mod.id, rank: mod.maxRank };
  }
  const groups = arsenalWeaponStats(build, 'Secondary', items, calculate(build, 'Secondary', items));
  const utility = groups[0].rows, damage = groups[1].rows;
  assert.equal(utility.find(row => row.key === 'Accuracy')?.value, 'Low');
  assert.equal(utility.find(row => row.key === 'Beam Range')?.value, 15);
  assert.equal(utility.find(row => row.key === 'Beam Range')?.base, true);
  assert.equal(utility.find(row => row.key === 'Riven disposition')?.disposition, 3);
  assert.equal(utility.find(row => row.key === 'Magazine')?.details?.find(row => row.key === 'Ammo Maximum')?.value, 350);
  assert.equal(utility.find(row => row.key === 'Trigger')?.details?.find(row => row.key === 'Noise')?.value, 'Alarming');
  assert.ok(Math.abs(Number(damage.find(row => row.key === 'Status / projectile')?.value) - 58.8) < .001);
  assert.ok(Math.abs(Number(damage.find(row => row.key === 'heat')?.value) - 148.48) < .001);
  assert.ok(Math.abs(Number(damage.find(row => row.key === 'viral')?.value) - 111.36) < .001);
  assert.equal(groups.find(group => group.title === 'Incarnon Form')?.note, 'Evolutions excluded');
  assert.ok(groups.find(group => group.title === 'Incarnon Form Radial Attack')?.rows.some(row => row.key === 'blast'));
  build.equipment.Secondary.mods[0].enabled = false;
  const changed = arsenalWeaponStats(build, 'Secondary', items, calculate(build, 'Secondary', items))[1].rows;
  assert.ok(changed.some(row => row.key === 'gas'));
  assert.ok(!changed.some(row => row.key === 'viral'));
});

test('attack-specific overrides do not leak into other attack sections and Incarnon uses charges', () => {
  const build = newArsenal();
  const atomos = item('Atomos');
  build.equipment.Secondary = equipItem(atomos, 'Secondary');
  const rows = () => arsenalWeaponStats(build, 'Secondary', items, calculate(build, 'Secondary', items));
  const normal = rows();
  build.equipment.Secondary.overrides = { criticalChance: .5, fireRate: 100 };
  const overridden = rows();
  assert.equal(overridden[1].rows.find(row => row.key === 'Critical chance')?.value, 50);
  assert.deepEqual(overridden.find(group => group.title === 'Incarnon Form'), normal.find(group => group.title === 'Incarnon Form'));
  build.equipment.Secondary.attack = atomos.attacks!.findIndex(attack => attack.name === 'Incarnon Form');
  build.equipment.Secondary.overrides = {};
  const incarnon = rows()[0].rows;
  assert.equal(incarnon.find(row => row.key === 'Incarnon Charges')?.value, 21);
  assert.ok(!incarnon.some(row => row.key === 'Magazine' || row.key === 'Reload time' || row.key === 'Beam Range'));
});

test('reference data never fills missing variant values and never changes calculated damage', () => {
  assert.deepEqual(reference.catalogSources, data.sources);
  const unknown = { ...item('Braton'), id: 'unknown', stats: {}, damage: {}, attacks: [] };
  const build = newArsenal();
  build.equipment.Primary = equipItem(unknown, 'Primary');
  const map = new Map([[unknown.id, unknown]]), result = calculate(build, 'Primary', map);
  const before = structuredClone(result);
  const rows = arsenalWeaponStats(build, 'Primary', map, result).flatMap(group => group.rows);
  assert.ok(!rows.some(row => row.key === 'Accuracy' || row.key === 'Riven disposition'));
  assert.equal(rows.find(row => row.key === 'Status / projectile')?.value, null);
  assert.deepEqual(result, before);
});
