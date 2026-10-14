import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/catalog.json' with { type: 'json' };
import type { CatalogItem } from '../src/lib/model.ts';
import { arcanes, calculate, capacity, compatible, elementalDamage, equipItem, frames, modFamily, mods, slotDrain, upgradeEffects } from '../src/lib/modder.ts';
import { emptyUpgrade, newArsenal, validateArsenals } from '../src/lib/modderModel.ts';
import { placeUpgrade } from '../src/lib/modderUpgrades.ts';
import { emptyProfile, validateProfile } from '../src/lib/account.ts';

const catalog = data.items as unknown as CatalogItem[];
const items = new Map(catalog.map(item => [item.id, item]));
const item = (name: string) => catalog.find(item => item.name === name)!;
const mod = (name: string, rank?: number, stacks = 0) => { const definition = [...mods, ...arcanes].find(mod => mod.name === name)!; assert.ok(definition, name); return { ...emptyUpgrade(), id: definition.id, rank: rank ?? definition.maxRank, stacks }; };
const arsenal = () => { const b = newArsenal(); b.equipment.Warframe = equipItem(item('Excalibur'), 'Warframe'); b.equipment.Primary = equipItem(item('Braton'), 'Primary'); b.equipment.Secondary = equipItem(item('Lato'), 'Secondary'); b.equipment.Melee = equipItem(item('Skana'), 'Melee'); return b; };
const value = (build: ReturnType<typeof arsenal>, label: string, slot: 'Primary' | 'Warframe' | 'Melee' = 'Primary') => calculate(build, slot, items).steps.find(step => step.label === label)!.value!;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} != ${expected}`);

test('weapon rank zero is an equipped mod, relative bonuses add, and reload speed divides time', () => {
  const build = arsenal();
  close(value(build, 'Average trigger'), 24 * (1 + .12 * .6));
  build.equipment.Primary.mods[0] = mod('Serration', 0);
  close(value(build, 'Damage / projectile'), 24 * 1.15);
  build.equipment.Primary.mods[0] = mod('Serration');
  build.equipment.Primary.mods[1] = mod('Heavy Caliber');
  close(value(build, 'Damage / projectile'), 24 * (1 + 1.65 + 1.65));
  build.equipment.Primary.mods[2] = mod('Fast Hands');
  close(value(build, 'Reload time'), 2 / 1.3);
  build.equipment.Primary.mods[0].enabled = false;
  close(value(build, 'Damage / projectile'), 24 * 2.65);
});

test('element order, innate elements and physical mods follow independent damage rules', () => {
  const base = { impact: 20, puncture: 30, slash: 50 };
  const effects = [{ stat: 'toxin', value: .9 }, { stat: 'cold', value: .9 }, { stat: 'heat', value: .9 }, { stat: 'damage', value: 1.65 }, { stat: 'slash', value: 1.2 }];
  let result = elementalDamage(base, effects);
  close(result.find(x => x.type === 'viral')!.value, 180 * 2.65);
  close(result.find(x => x.type === 'heat')!.value, 90 * 2.65);
  close(result.find(x => x.type === 'slash')!.value, 110 * 2.65);
  result = elementalDamage(base, [effects[2], ...effects.slice(0, 2)]);
  assert.ok(result.some(x => x.type === 'gas'));
  assert.ok(result.some(x => x.type === 'cold'));
  result = elementalDamage({ heat: 100 }, [{ stat: 'toxin', value: .9 }, { stat: 'cold', value: .9 }]);
  assert.deepEqual(result, [{ type: 'viral', value: 180 }, { type: 'heat', value: 100 }]);
  result = elementalDamage({ radiation: 100 }, [{ stat: 'heat', value: .9 }, { stat: 'electricity', value: .9 }]);
  assert.deepEqual(result, [{ type: 'radiation', value: 280 }]);
});

test('shotguns count base pellets once and fractional multishot is an expectation', () => {
  const build = arsenal(); build.equipment.Primary = equipItem(item('Hek'), 'Primary');
  close(value(build, 'Damage / projectile'), 75);
  close(value(build, 'Average trigger'), 75 * 7 * 1.1);
  build.equipment.Primary.mods[0] = mod("Hell's Chamber");
  close(value(build, 'Projectiles / trigger'), 7 * 2.2);
  close(value(build, 'Average trigger'), 75 * 7 * 2.2 * 1.1);
});

test('arcanes require explicit stacks and flat crit crosses tiers after mod scaling', () => {
  const build = arsenal();
  build.equipment.Primary.mods[0] = mod('Serration');
  build.equipment.Primary.arcanes[0] = mod('Primary Merciless');
  close(value(build, 'Damage / projectile'), 24 * 2.65);
  close(value(build, 'Reload time'), 2 / 1.3); // Passive at rank five, even with zero kills.
  build.equipment.Primary.arcanes[0].stacks = 12;
  close(value(build, 'Damage / projectile'), 24 * (1 + 1.65 + 3.6));
  build.equipment.Primary.overrides.criticalChance = .5;
  build.equipment.Primary.mods[1] = mod('Point Strike');
  build.equipment.Warframe.arcanes[0] = mod('Arcane Avenger', 5, 1);
  close(value(build, 'Critical chance'), 170);
  close(value(build, 'Average critical factor'), 1 + 1.7 * .6);
  build.equipment.Warframe.arcanes[0].enabled = false;
  close(value(build, 'Critical chance'), 125);
});

test('frame auras affect only their weapon type and Roar uses frame strength', () => {
  const build = arsenal(); const before = value(build, 'Average trigger');
  build.equipment.Warframe.special = mod('Steel Charge');
  close(value(build, 'Average trigger'), before);
  close(value(build, 'Damage / projectile', 'Melee'), 120 * 1.6);
  build.equipment.Warframe.mods[0] = mod('Intensify');
  build.conditions.roar = true; build.conditions.roarBase = 30;
  close(value(build, 'Average trigger'), before * 1.39);
  build.conditions.armor = 300;
  close(value(build, 'After target armor'), before * 1.39 / 2);
  build.conditions.strip = 100;
  close(value(build, 'After target armor'), before * 1.39);
  build.equipment.Primary.mods[0] = mod('Bane Of Grineer');
  build.conditions.faction = 'Corpus';
  close(value(build, 'Average trigger'), before * 1.39);
  build.conditions.faction = 'Grineer';
  close(value(build, 'Average trigger'), before * (1 + .39 + .3));
  build.equipment.Primary.mods[0] = mod('Bane Of Orokin');
  build.conditions.faction = 'Corrupted';
  close(value(build, 'Average trigger'), before * (1 + .39 + .3));
  assert.deepEqual(upgradeEffects(build.equipment.Primary.mods[0], build.conditions).omitted, []);
});

test('rank 30 survivability and uncapped channel efficiency retain exact arithmetic', () => {
  const build = arsenal(); assert.equal(frames.get(item('Excalibur').id)!.ranked!.health, 370);
  build.equipment.Warframe.mods[0] = mod('Vitality', 0);
  close(value(build, 'Health', 'Warframe'), 370 * (1 + 1 / 11));
  build.equipment.Warframe.mods[0] = mod('Vitality');
  close(value(build, 'Health', 'Warframe'), 740);
  build.equipment.Warframe.mods[1] = mod('Fleeting Expertise');
  build.equipment.Warframe.mods[2] = mod('Streamline');
  close(value(build, 'Ability efficiency', 'Warframe'), 175);
  close(value(build, 'Example cast cost', 'Warframe'), 25 * .25);
  close(value(build, 'Example channel / s', 'Warframe'), 5 * .25);
  build.equipment.Warframe.mods[2] = mod('Streamline', 3);
  close(value(build, 'Example channel / s', 'Warframe'), 5 * .5);
});

test('capacity uses integer drain, aura bonuses, and keeps disabled mods equipped', () => {
  const s = mod('Serration');
  assert.equal(slotDrain(s), 14);
  s.polarity = 'madurai'; assert.equal(slotDrain(s), 7);
  s.polarity = 'vazarin'; assert.equal(slotDrain(s), 18);
  const aura = mod('Steel Charge'); aura.polarity = 'madurai'; assert.equal(slotDrain(aura, true), 18);
  aura.polarity = 'naramon'; assert.equal(slotDrain(aura, true), 7);
  const build = arsenal().equipment.Primary; build.mods[0] = { ...s, enabled: false };
  assert.equal(capacity(build).used, 18);
});

test('compatibility and variants exclude conflicting mod families and preserve reference effects', () => {
  const get = (name: string) => mods.find(mod => mod.name === name)!;
  assert.equal(compatible(get('Serration'), item('Hek'), 'mod'), false);
  assert.equal(compatible(get('Serration'), item('Braton'), 'mod'), true);
  assert.equal(compatible(get('Intensify'), item('Excalibur'), 'exilus'), false);
  assert.equal(compatible(get('Power Drift'), item('Excalibur'), 'exilus'), true);
  assert.equal(compatible(get('Scattered Justice'), item('Vaykor Hek'), 'mod'), false);
  assert.equal(modFamily(get('Flow')), modFamily(get('Primed Flow')));
  assert.equal(modFamily(get('Critical Delay')), modFamily(get('Point Strike')));
  assert.ok(upgradeEffects(mod('Hunter Munitions'), arsenal().conditions).omitted.length);
  assert.equal(upgradeEffects(mod('Umbral Intensify'), arsenal().conditions).effects.length, 0);
});

test('placing and swapping upgrades preserves mod settings and each slot polarity without mutating the original', () => {
  const frame = item('Excalibur'), build = equipItem(frame, 'Warframe');
  build.mods[0] = { ...mod('Intensify', 0, 2), enabled: false, polarity: 'madurai' };
  build.mods[4] = { ...mod('Vitality', 6), polarity: 'vazarin' };
  const before = structuredClone(build);
  const swapped = placeUpgrade(build, frame, { id: build.mods[0].id, from: { kind: 'mod', index: 0 } }, { kind: 'mod', index: 4 })!;
  assert.deepEqual(swapped.mods[0], { ...build.mods[4], polarity: 'madurai' });
  assert.deepEqual(swapped.mods[4], { ...build.mods[0], polarity: 'vazarin' });
  assert.deepEqual(build, before);
  const moved = placeUpgrade(swapped, frame, { id: swapped.mods[4].id, from: { kind: 'mod', index: 4 } }, { kind: 'mod', index: 7 })!;
  assert.deepEqual(moved.mods[4], emptyUpgrade('vazarin'));
  assert.deepEqual(moved.mods[7], { ...build.mods[0], polarity: '' });
  const installed = placeUpgrade(moved, frame, { id: mod('Streamline').id }, { kind: 'mod', index: 4 })!;
  assert.deepEqual(installed.mods[4], { ...mod('Streamline'), polarity: 'vazarin' });
  assert.equal(installed.mods[7].rank, 0);
  assert.equal(installed.mods[7].enabled, false);
});

test('placements reject duplicates, stale sources and incompatible swaps but allow replacing the same mod family', () => {
  const frame = item('Excalibur'), build = equipItem(frame, 'Warframe');
  build.mods[0] = mod('Flow');
  build.exilus = mod('Power Drift');
  const before = structuredClone(build);
  const flow = { id: build.mods[0].id, from: { kind: 'mod' as const, index: 0 } };
  assert.equal(placeUpgrade(build, frame, flow, { kind: 'exilus', index: 0 }), null);
  assert.equal(placeUpgrade(build, frame, { id: build.exilus.id, from: { kind: 'exilus', index: 0 } }, { kind: 'mod', index: 0 }), null);
  assert.equal(placeUpgrade(build, frame, { id: mod('Primed Flow').id }, { kind: 'mod', index: 1 }), null);
  assert.equal(placeUpgrade(build, frame, flow, { kind: 'mod', index: 0 }), null);
  assert.equal(placeUpgrade(build, frame, flow, { kind: 'mod', index: 8 }), null);
  assert.equal(placeUpgrade(build, frame, flow, { kind: 'mod', index: -1 }), null);
  assert.equal(placeUpgrade(build, frame, flow, { kind: 'mod', index: .5 }), null);
  assert.equal(placeUpgrade(build, frame, { ...flow, id: mod('Vitality').id }, { kind: 'mod', index: 1 }), null);
  assert.equal(placeUpgrade(build, frame, { id: '/future/mod' }, { kind: 'mod', index: 1 }), null);
  assert.equal(placeUpgrade(build, item('Braton'), flow, { kind: 'mod', index: 1 }), null);
  const replaced = placeUpgrade(build, frame, { id: mod('Primed Flow').id }, { kind: 'mod', index: 0 })!;
  assert.deepEqual(replaced.mods[0], { ...mod('Primed Flow'), polarity: build.mods[0].polarity });
  const moved = placeUpgrade(build, frame, { id: build.exilus.id, from: { kind: 'exilus', index: 0 } }, { kind: 'mod', index: 1 })!;
  assert.equal(moved.mods[1].id, build.exilus.id);
  assert.equal(moved.exilus.id, '');
  assert.deepEqual(build, before);
});

test('aura and arcane drops respect slot types, duplicate rules and active stacks', () => {
  const frame = item('Excalibur'), build = equipItem(frame, 'Warframe');
  build.special = { ...mod('Steel Charge'), polarity: 'madurai' };
  build.arcanes[0] = { ...mod('Arcane Avenger', 0, 1), enabled: false };
  build.arcanes[1] = mod('Arcane Guardian', 3, 1);
  const source = { id: build.arcanes[0].id, from: { kind: 'arcane' as const, index: 0 } };
  const swapped = placeUpgrade(build, frame, source, { kind: 'arcane', index: 1 })!;
  assert.deepEqual(swapped.arcanes, [build.arcanes[1], build.arcanes[0]]);
  assert.equal(placeUpgrade(build, frame, { id: source.id }, { kind: 'arcane', index: 1 }), null);
  assert.equal(placeUpgrade(build, frame, source, { kind: 'mod', index: 0 }), null);
  assert.equal(placeUpgrade(build, frame, { id: build.special.id }, { kind: 'mod', index: 0 }), null);
  const aura = placeUpgrade(build, frame, { id: mod('Infested Impedance').id }, { kind: 'special', index: 0 })!;
  assert.equal(aura.special.polarity, 'madurai');
  assert.equal(capacity(aura).bonus, slotDrain(aura.special, true));
});

test('unknown cycle values stay unknown and unsupported effects stay visible', () => {
  const build = arsenal(); build.equipment.Primary = equipItem(item('Ignis'), 'Primary');
  assert.equal(value(build, 'Sustained DPS'), null);
  build.equipment.Primary.mods[0] = mod('Hunter Munitions');
  assert.match(calculate(build, 'Primary', items).warnings.join(' '), /Hunter Munitions.*not calculated/);
  build.equipment.Primary = equipItem(item('Braton'), 'Primary'); build.equipment.Primary.attack = 1;
  assert.equal(value(build, 'Sustained DPS'), null);
});

test('saved arsenals roundtrip, unknown IDs survive, and malformed builds never reset silently', () => {
  const build = arsenal(); build.equipment.Primary.mods[0] = { ...mod('Serration'), id: '/future/mod' };
  assert.deepEqual(validateArsenals([build]), [build]);
  assert.throws(() => validateArsenals(null), /original data/);
  assert.throws(() => validateArsenals([build, build]), /original data/);
  for (const corrupt of [(b: typeof build) => { b.conditions.armor = Infinity; }, (b: typeof build) => { b.equipment.Primary.mods.pop(); }, (b: typeof build) => { b.equipment.Primary.mods[0].rank = -1; }, (b: typeof build) => { b.equipment.Primary.overrides.damage = 1; }]) {
    const broken = structuredClone(build); corrupt(broken); assert.throws(() => validateArsenals([broken]), /original data/);
  }
  const profile = emptyProfile(); profile.arsenals = [build];
  assert.deepEqual(validateProfile(profile), profile);
  const { arsenals: unused, ...legacy } = profile; void unused;
  assert.deepEqual(validateProfile(legacy).arsenals, []);
  assert.throws(() => validateProfile({ ...legacy, arsenals: null }), /original data/);
});
