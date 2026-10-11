import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDropTables } from '../src/lib/dropTableParser.ts';
import { attemptsForChance, compileDropQuery, defaultDropView, dropRowsCsv, dropViewHash, filterDropRows, formatChance, isDropView, moveDropSort, readDropView, setDropSort, sortDropRows, successChance } from '../src/lib/dropTables.ts';
import { fetchLiveDropTables } from '../server/dropTables.ts';

const html = readFileSync(new URL('./fixtures/drop-tables.html', import.meta.url), 'utf8');
const dataset = parseDropTables(html, '2026-01-02T00:00:00.000Z');
const rows = dataset.rows;

test('official-format parser preserves rotations, bounty stages, duplicate entries, relic refinements and all source indexes', () => {
  assert.equal(dataset.updated, '01 January, 2026');
  assert.equal(dataset.fetchedAt, '2026-01-02T00:00:00.000Z');
  assert.equal(dataset.skippedRows, 0);
  assert.equal(dataset.reverseIndexRows, 2);
  assert.equal(rows.length, 22);
  assert.equal(new Set(rows.map(row => row.section)).size, 12);
  assert.equal(rows.filter(row => row.reward === 'Fast Deflection').length, 2);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  const earth = rows.find(row => row.source.includes('Earth/'))!;
  assert.deepEqual([earth.location, earth.mission, earth.rotation, earth.stage], ['Earth', 'Defense', 'A', '']);
  assert.deepEqual(rows.filter(row => row.section === 'cetusRewards').map(row => [row.location, row.rotation, row.stage]), [['Cetus', 'A', 'Stage 1'], ['Cetus', 'A', 'Stage 2, Stage 3 of 4, and Stage 3 of 5'], ['Cetus', 'B', 'Final Stage']]);
  assert.deepEqual(rows.filter(row => row.section === 'relicRewards').map(row => [row.era, row.refinement]), [['Lith', 'Intact'], ['Lith', 'Radiant']]);
  assert.equal(rows.find(row => row.reward === 'Adaptation')!.anchor, 'arbitrations');
});

test('conditional chances are multiplied once; multi-roll rates remain unknown and source text stays inert', () => {
  const mod = rows.find(row => row.reward === 'Pressure Point')!;
  assert.equal(mod.sourceChance, 3);
  assert.equal(mod.tableChance, 37.94);
  assert.ok(Math.abs(mod.chance! - 1.1382) < 1e-10);
  assert.equal(mod.rarity, 'Common');
  assert.equal(rows.filter(row => row.reward === 'Pressure Point').length, 1);
  const resource = rows.find(row => row.reward === 'Sharrac Teeth')!;
  assert.equal(resource.sourceChance, 800);
  assert.equal(resource.chance, null);
  assert.ok(rows.some(row => row.reward === '<script>alert(1)</script> & "Reward"'));
  assert.equal(rows.find(row => row.reward === "Kavat's Grace")!.chance, 1);
});

test('parser supports future categories and standalone reverse indexes, and rejects unrecognizable pages', () => {
  assert.throws(() => parseDropTables('<html>Temporarily unavailable</html>'), /recognizable drop tables/);
  const reverse = parseDropTables('<h3 id="modByDrop">Mod Drops by Mod:</h3><table><tr><th>Example Mod</th></tr><tr><th>Source</th><th>Mod Drop Chance</th><th>Chance</th></tr><tr><td>Enemy</td><td>3%</td><td>Rare (10%)</td></tr></table>');
  assert.equal(reverse.rows[0].reward, 'Example Mod'); assert.equal(reverse.rows[0].source, 'Enemy'); assert.equal(reverse.rows[0].chance, .3);
  const future = parseDropTables('<h3 id="newRewards">New Rewards:</h3><table><tr><th>New Source</th></tr><tr><td>New Item</td><td>Common (50%)</td></tr><tr><td>Unreadable</td><td>?</td></tr></table>');
  assert.equal(future.rows[0].category, 'New Rewards'); assert.equal(future.skippedRows, 1);
});

test('field search, phrases, exclusions, numeric comparisons and combined filters match raw facts', () => {
  const search = (query: string) => filterDropRows(rows, compileDropQuery(query), {});
  assert.equal(search('"NOVA PRIME" -refinement:intact chance:>=10').length, 2);
  assert.equal(search('mission:survival rotation:c reward:forma')[0].chance, 90);
  assert.equal(search('source:"heavy gunner" chance:<2 within:>30')[0].reward, 'Pressure Point');
  assert.equal(search('roll:>100')[0].reward, 'Sharrac Teeth');
  assert.ok(compileDropQuery('chance:nope').error); assert.ok(compileDropQuery('wrong:value').error); assert.ok(compileDropQuery('constructor:value').error); assert.ok(compileDropQuery('"unfinished').error);
  assert.equal(filterDropRows(rows, compileDropQuery('forma'), { rotation: { kind: 'values', values: ['A'] }, chance: { kind: 'range', min: '21', max: '50' } })[0].location, 'Earth');
  assert.equal(filterDropRows(rows, compileDropQuery(''), { chance: { kind: 'range', min: '', max: '', unknown: true } })[0].reward, 'Sharrac Teeth');
  assert.equal(filterDropRows(rows, compileDropQuery(''), { reward: { kind: 'text', value: 'Forma Blueprint', operator: 'equals' } }).length, 3);
});

test('sorting honors independent priorities, stable ties and unknown values last in either direction', () => {
  const sourceSort = setDropSort([], 'source', 1), sorts = setDropSort(sourceSort, 'chance', -1);
  const missions = rows.filter(row => row.section === 'missionRewards');
  assert.deepEqual(sortDropRows(missions, sorts).map(row => row.chance), [25, 90, 80, 20, 10]);
  assert.deepEqual(sortDropRows(missions, moveDropSort(sorts, 'chance', 0)).map(row => row.chance), [90, 80, 25, 20, 10]);
  assert.deepEqual(setDropSort(sorts, 'source', -1).map(sort => sort.key), ['source', 'chance']);
  assert.deepEqual(setDropSort(sorts, 'source', 0), [{ key: 'chance', direction: -1 }]);
  for (const direction of [1, -1] as const) assert.equal(sortDropRows(rows, [{ key: 'chance', direction }]).at(-1)?.chance, null);
  const duplicates = rows.filter(row => row.reward === 'Fast Deflection');
  assert.deepEqual(sortDropRows(duplicates, [{ key: 'chance', direction: -1 }]), duplicates);
});

test('view links validate settings and roundtrip filters, hidden sorts and column order without storing drops', () => {
  const view = defaultDropView(); view.query = 'reward:"nova prime"'; view.columns = ['reward', 'chance']; view.sorting = [{ key: 'source', direction: -1 }]; view.filters.refinement = { kind: 'values', values: ['Radiant', 'Intact'] }; view.pageSize = 100;
  assert.deepEqual(readDropView(dropViewHash(view)), view);
  assert.deepEqual(readDropView('#droptables?view=%7Bbroken'), defaultDropView());
  const unsafe = readDropView('#droptables?view=' + encodeURIComponent(JSON.stringify({ columns: ['oops', 'chance', 'chance'], sorting: [{ key: 'reward', direction: 7 }], pageSize: 100000, filters: { chance: { kind: 'range', min: 'NaN', max: '' } } })));
  assert.deepEqual(unsafe.columns, ['reward', 'chance']); assert.equal(unsafe.pageSize, undefined); assert.deepEqual(unsafe.filters, {}); assert.deepEqual(unsafe.sorting, []);
});

test('odds calculator handles zero, certainty, tiny probabilities and rounds attempts upward', () => {
  assert.equal(successChance(50, 2), 75); assert.equal(successChance(100, 0), 0); assert.equal(successChance(100, 1), 100); assert.equal(successChance(0, 1000), 0);
  assert.equal(attemptsForChance(10, 90), 22); assert.equal(attemptsForChance(0, 90), null); assert.equal(attemptsForChance(10, 100), null); assert.equal(attemptsForChance(100, 100), 1);
  const required = attemptsForChance(.0001, 99)!; assert.ok(successChance(.0001, required) >= 99); assert.ok(successChance(.0001, required - 1) < 99);
  assert.equal(formatChance(.000001), '<0.0001%'); assert.equal(formatChance(0), '0.00%');
});

test('malformed saved view objects are rejected instead of being silently repaired', () => {
  const view = defaultDropView();
  assert.ok(isDropView(view));
  for (const value of [null, [], {}, { ...view, query: 10 }, { ...view, columns: ['chance'] }, { ...view, sorting: [{ key: 'unknown', direction: 1 }] }, { ...view, filters: { chance: { kind: 'range', min: 'NaN', max: '' } } }, { ...view, filters: { reward: { kind: 'text', value: 'x', operator: 'typo' } } }]) assert.equal(isDropView(value), false);
  view.filters.category = { kind: 'values', values: [] };
  assert.ok(isDropView(view));
  assert.deepEqual(readDropView(dropViewHash(view)), view);
});

test('CSV exports selected columns and raw percentages, quotes text, and blocks spreadsheet formulas', () => {
  const csv = dropRowsCsv([{ ...rows[0], reward: '=HYPERLINK("https://example.com")', chance: 1.1382 }, { ...rows[1], reward: 'A, B\nC', chance: null }], ['reward', 'chance']);
  assert.match(csv, /^\uFEFF"Reward","Drop chance"/);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")","1.1382"'));
  assert.ok(csv.includes('"A, B\nC",""')); assert.ok(!csv.includes('Mercury'));
});

test('live fetch follows only official redirects, retrieves anew, and reports upstream failure or format changes', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async input => {
    calls++;
    if (String(input) === 'https://warframe.com/droptables') return new Response(null, { status: 302, headers: { location: 'https://www.warframe.com/droptables' } });
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  };
  assert.equal((await fetchLiveDropTables(fetcher)).rows.length, 22);
  await fetchLiveDropTables(fetcher); assert.equal(calls, 4);
  await assert.rejects(fetchLiveDropTables(async () => new Response(null, { status: 302, headers: { location: 'http://localhost/private' } })), /unsupported host/);
  await assert.rejects(fetchLiveDropTables(async () => new Response(null, { status: 503 })), /HTTP 503/);
  await assert.rejects(fetchLiveDropTables(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })), /unexpected format/);
  await assert.rejects(fetchLiveDropTables(async () => new Response('maintenance', { headers: { 'content-type': 'text/html' } })), /recognizable/);
  await assert.rejects(fetchLiveDropTables(async () => new Response('x'.repeat(12 * 1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } })), /download size/);
});
