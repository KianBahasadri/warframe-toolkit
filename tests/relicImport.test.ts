import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRelics } from '../scripts/build-relics.mjs';
import { parseExport } from '../scripts/public-export.mjs';

const fixture = () => ({
  ExportResources: [{ uniqueName: '/Lotus/Parts/PrimeReceiver', name: 'Test Prime Receiver' }],
  ExportRecipes: [],
  ExportManifest: [{ uniqueName: '/Lotus/Types/Game/Projections/TestBronze', textureLocation: '/Lotus/Icons/Relic.png!hash' }],
  ExportRelicArcane: [{ uniqueName: '/Lotus/Types/Game/Projections/TestBronze', name: 'Lith T1 Relic', description: 'Test', relicRewards: [{ rewardName: '/Lotus/StoreItems/Parts/PrimeReceiver', rarity: 'COMMON', itemCount: 1 }] }],
});
const published = { section: 'relicRewards', source: 'Lith T1 Relic (Intact)', reward: 'Test Prime Receiver', chance: 25.33 };

test('Public Export parser preserves control characters and escaped quotes in descriptions', () => {
  assert.deepEqual(parseExport('\uFEFF{\n"text":"first\nsecond\tline", "escaped":"a\\\"b"\n}'), { text: 'first\nsecond\tline', escaped: 'a"b' });
  assert.throws(() => parseExport('{broken}'));
});

test('import keeps unknown chances unknown and rejects mismatched reward identities', () => {
  assert.equal(buildRelics(fixture(), { rows: [] })[0].rewards[0].chance, null);
  assert.equal(buildRelics(fixture(), { rows: [published] })[0].rewards[0].chance, 25.33);
  assert.throws(() => buildRelics(fixture(), { rows: [{ ...published, reward: 'Test Receiver' }] }), /Cannot match/);
  assert.throws(() => buildRelics(fixture(), { rows: [{ ...published, reward: '2X Test Prime Receiver' }] }), /Cannot match/);
  const broken = fixture(); broken.ExportResources = [];
  assert.throws(() => buildRelics(broken, { rows: [] }), /Missing reward name/);
});

test('duplicate relic identities merge only when their rewards and artwork agree', () => {
  const data = fixture();
  const second = { ...structuredClone(data.ExportRelicArcane[0]), uniqueName: '/Lotus/Types/Game/Projections/DuplicateBronze' };
  data.ExportRelicArcane.push(second);
  data.ExportManifest.push({ ...data.ExportManifest[0], uniqueName: second.uniqueName });
  assert.equal(buildRelics(data, { rows: [] })[0].uniqueNames.length, 2);
  second.relicRewards[0].itemCount = 2;
  assert.throws(() => buildRelics(data, { rows: [] }), /Conflicting duplicate/);
});

test('repeated rewards retain separate rarity slots and source rotations remain separate', () => {
  const data = fixture();
  data.ExportRelicArcane[0].relicRewards.push({ ...data.ExportRelicArcane[0].relicRewards[0], rarity: 'UNCOMMON' });
  const source = { section: 'missionRewards', reward: 'Lith T1 Relic', source: 'Test mission', rotation: 'A', stage: '', chance: 10, tableChance: 10, anchor: 'missions' };
  const result = buildRelics(data, { rows: [published, { ...published, chance: 11 }, source, source, { ...source, rotation: 'C', chance: 20 }] })[0];
  assert.deepEqual(result.rewards.map(reward => [reward.rarity, reward.chance]), [['common', 25.33], ['uncommon', 11]]);
  assert.deepEqual(result.sources.map(source => [source.rotation, source.chance]), [['A', 10], ['C', 20]]);
});
