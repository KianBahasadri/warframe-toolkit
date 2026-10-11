import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDropTables } from '../src/lib/dropTableParser.ts';
import { dropBrowseCounts, groupDropRows } from '../src/lib/dropExplorer.ts';
import { defaultDropView, dropViewHash, isDropView, readDropView, sortDropRows } from '../src/lib/dropTables.ts';

const rows = parseDropTables(readFileSync(new URL('./fixtures/drop-tables.html', import.meta.url), 'utf8')).rows;

test('browsing scopes missions, locations, relics and bounties while items and sources include every entry', () => {
  const counts = dropBrowseCounts(rows);
  assert.equal(counts.mission, 2); assert.equal(counts.location, 3); assert.equal(counts.relic, 1); assert.equal(counts.bounty, 1);
  assert.equal(groupDropRows(rows, 'mission').find(group => group.title === 'Survival')!.rows.length, 4);
  assert.equal(groupDropRows(rows, 'location').find(group => group.title === 'Cetus')!.rows.length, 3);
  for (const mode of ['item', 'source'] as const) {
    const grouped = groupDropRows(rows, mode).flatMap(group => group.rows);
    assert.deepEqual(grouped.map(row => row.id).sort(), rows.map(row => row.id).sort());
  }
});

test('relic refinements and repeated rewards stay separate, variants never collapse, unknown rates are not ranked as zero', () => {
  const relic = groupDropRows(rows, 'relic')[0];
  assert.equal(relic.title, 'Lith N1 Relic');
  assert.deepEqual(relic.rows.map(row => [row.refinement, row.chance]), [['Intact', 2], ['Radiant', 10]]);
  const groups = groupDropRows(rows, 'item');
  const forma = groups.find(group => group.title === 'Forma Blueprint')!;
  assert.equal(forma.rows.length, 3); assert.equal(forma.sources.length, 2); assert.equal(forma.bestChance, 90);
  assert.equal(groups.find(group => group.title === 'Fast Deflection')!.rows.length, 2);
  assert.equal(groups.find(group => group.title === 'Sharrac Teeth')!.bestChance, null);
  const variants = groupDropRows([{ ...rows[0], reward: 'Braton' }, { ...rows[0], id: 'variant', reward: 'Braton Prime' }], 'item');
  assert.deepEqual(variants.map(group => group.title), ['Braton', 'Braton Prime']);
  const sorting = [{ key: 'chance' as const, direction: -1 as const }];
  assert.equal(groupDropRows(sortDropRows(rows, sorting), 'item', sorting).at(-1)!.title, 'Sharrac Teeth');
  const ascending = [{ key: 'chance' as const, direction: 1 as const }];
  const ordered = groupDropRows(sortDropRows(rows, ascending), 'item', ascending);
  assert.equal(ordered.at(-1)!.bestChance, null);
  const chances = ordered.flatMap(group => group.bestChance === null ? [] : [group.bestChance]);
  assert.deepEqual(chances, [...chances].sort((a, b) => a - b));
});

test('browse links roundtrip the selected group and validate malformed settings without rejecting legacy saves', () => {
  const view = { ...defaultDropView(), browse: { mode: 'bounty' as const, group: JSON.stringify(['Cetus', 'Level 5 - 15 Cetus Bounty']) } };
  assert.ok(isDropView(view)); assert.deepEqual(readDropView(dropViewHash(view)), view);
  assert.ok(isDropView({ ...defaultDropView(), pageSize: 50 }));
  for (const browse of [null, [], { mode: 'oops' }, { mode: 'item', group: 1 }]) assert.equal(isDropView({ ...view, browse }), false);
  const invalidLink = '#droptables?view=' + encodeURIComponent(JSON.stringify({ ...view, browse: { mode: 'oops' } }));
  assert.equal(readDropView(invalidLink).browse, undefined);
});

test('mission grouping uses the final published type when source names contain parentheses', () => {
  const parsed = parseDropTables('<h3 id="missionRewards">Missions:</h3><table><tr><th>Saturn/(Variant) Cephalon Capture (Conclave)</th></tr><tr><td>Reward</td><td>Common (50%)</td></tr><tr><th>Event: Neptune/The Index: Endurance (Low Risk) (Arena)</th></tr><tr><td>Reward</td><td>Common (50%)</td></tr></table>');
  assert.deepEqual(parsed.rows.map(row => row.mission), ['Conclave', 'Arena']);
  assert.equal(parsed.rows[1].source, 'Event: Neptune/The Index: Endurance (Low Risk) (Arena)');
});
