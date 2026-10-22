import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRelic, parseRelicName, relicKey, validateRelics } from '../src/lib/relics.ts';
import { editableRelic, relicRows, updateRelic, vaultStatus } from '../src/lib/relicCatalog.ts';
import type { RelicCatalogItem } from '../src/lib/relicCatalog.ts';

const data = JSON.parse(readFileSync(new URL('../src/data/relics.json', import.meta.url), 'utf8'));
const catalog: RelicCatalogItem[] = data.items;
const entry = (name: string, refinement = 'Intact') => {
  const found = catalog.find(item => item.name === name && item.refinement === refinement);
  assert.ok(found, `${name} ${refinement}`); return found;
};

test('official relic snapshot has distinct refinements, valid rewards and local artwork', () => {
  assert.ok(data.names.length > 790);
  assert.equal(new Set(catalog.map(relicKey)).size, catalog.length);
  assert.ok(Object.values(data.sources).every(url => String(url).startsWith('https://content.warframe.com/PublicExport/Manifest/')));
  const checked = new Set<string>();
  for (const item of catalog) {
    assert.equal(parseRelicName(item.name)?.name, item.name);
    assert.ok(item.rewards.length >= 6);
    assert.ok(item.uniqueNames.every(id => id.startsWith('/Lotus/Types/Game/Projections/')));
    for (const reward of item.rewards) {
      assert.ok(reward.name && !reward.name.startsWith('/Lotus/'));
      assert.ok(Number.isInteger(reward.quantity) && reward.quantity > 0);
      assert.ok(reward.chance === null || Number.isFinite(reward.chance) && reward.chance >= 0 && reward.chance <= 100);
    }
    if (!checked.has(item.image)) {
      checked.add(item.image);
      const bytes = readFileSync(new URL(`../public${item.image}`, import.meta.url));
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    }
  }
  assert.equal(entry('Lith A1').rewards.find(reward => reward.name === 'Akstiletto Prime Blueprint')?.chance, 2);
  assert.equal(entry('Lith A1', 'Radiant').rewards.find(reward => reward.name === 'Akstiletto Prime Blueprint')?.chance, 10);
  assert.equal(entry('Lith G12').uniqueNames.length, 2);
});

test('Eterna has no invented refinements or normalized published chances', () => {
  const eterna = entry('Requiem Eterna', 'Unrefined');
  assert.equal(catalog.filter(item => item.name === eterna.name).length, 1);
  assert.equal(eterna.rewards.length, 8);
  assert.equal(eterna.rewards.reduce((sum, reward) => sum + reward.chance!, 0), 76);
  assert.ok(eterna.sources.some(source => source.source === 'Kuva Flood' && source.chance === 100));
  const saved = { ...createRelic(), name: 'requiem ETERNA', refinement: 'Unrefined' as const };
  assert.equal(validateRelics([saved])[0].name, 'Requiem Eterna');
});

test('vault status follows published drop sources for the relic, not each refinement', () => {
  const status = vaultStatus(catalog);
  assert.equal(status('Lith A1'), true);
  assert.equal(status('Meso A12'), false);
  assert.equal(status('Requiem Eterna'), false);
  assert.equal(status('Vanguard Z999'), null);
  const rows = relicRows([], catalog);
  assert.equal(rows.find(item => item.name === 'Meso A12' && item.refinement === 'Exceptional')?.vaulted, false);
  assert.equal(rows.find(item => item.name === 'Lith A1' && item.refinement === 'Radiant')?.vaulted, true);
});

test('catalog projection preserves custom stacks, notes and zero quantities without creating saves', () => {
  const saved = [
    { ...createRelic(), name: 'Lith A1', quantity: 0, notes: 'Keep this plan' },
    { ...createRelic(), name: 'Lith A1', refinement: 'Radiant' as const, quantity: 4 },
    { ...createRelic(), name: 'Vanguard Z999', notes: 'Custom' },
  ];
  const before = structuredClone(saved);
  const rows = relicRows(saved, catalog);
  assert.deepEqual(saved, before);
  assert.equal(rows.length, catalog.length + 1);
  assert.equal(rows.filter(item => item.saved).length, 3);
  assert.equal(rows.find(item => relicKey(item) === 'lith a1|Intact')?.notes, 'Keep this plan');
  assert.equal(rows.find(item => item.name === 'Vanguard Z999')?.catalogItem, undefined);
  assert.deepEqual(editableRelic(rows[0]), saved[0]);
  const fresh = editableRelic(rows.find(item => !item.saved)!);
  assert.ok(!fresh.id.startsWith('catalog:'));
  assert.equal(fresh.quantity, 0);
  assert.ok(!('catalogItem' in fresh));
});

test('rapid catalog edits create one exact stack and retain intervening notes and quantity', () => {
  const row = relicRows([], [entry('Lith A1')])[0];
  const empty: ReturnType<typeof createRelic>[] = [];
  assert.equal(updateRelic(empty, row, { quantityChange: -1 }), empty);
  let saved = updateRelic(empty, row, { quantityChange: 1 });
  const id = saved[0].id;
  saved = updateRelic(saved, row, { notes: 'For a group' });
  saved = updateRelic(saved, row, { quantityChange: 1 });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, id);
  assert.equal(saved[0].quantity, 2);
  assert.equal(saved[0].notes, 'For a group');
  assert.deepEqual(Object.keys(saved[0]).sort(), Object.keys(createRelic()).sort());
  const radiant = relicRows(saved, [entry('Lith A1', 'Radiant')]).find(item => item.refinement === 'Radiant')!;
  saved = updateRelic(saved, radiant, { quantityChange: 1 });
  assert.equal(saved.length, 2);
  assert.equal(saved[0].notes, 'For a group');
  assert.equal(saved[1].quantity, 1);
});
