import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import manifest from '../src/data/drop-art.json' with { type: 'json' };
import { dropRarityTone, groupArtwork, rewardArtwork, sourceArtwork } from '../src/lib/dropArtwork.ts';
import { groupDropRows } from '../src/lib/dropExplorer.ts';
import { parseDropTables } from '../src/lib/dropTableParser.ts';

const rows = parseDropTables(readFileSync(new URL('./fixtures/drop-tables.html', import.meta.url), 'utf8')).rows;

test('artwork keeps exact equipment variants and recipe results, and unknown names stay unknown', () => {
  assert.equal(rewardArtwork('Braton Prime Blueprint')?.label, 'Braton Prime');
  assert.equal(rewardArtwork('Braton Vandal Blueprint')?.label, 'Braton Vandal');
  assert.notEqual(rewardArtwork('Braton Prime Blueprint')?.src, rewardArtwork('Braton Vandal Blueprint')?.src);
  assert.equal(rewardArtwork('  PRESSURE POINT  ')?.label, 'Pressure Point');
  assert.equal(rewardArtwork('Nova Prime Systems Blueprint')?.label, 'Nova Prime Systems');
  assert.equal(rewardArtwork('100 Endo')?.label, 'Endo');
  for (const name of ['Pressure Point Prime', 'Braton Unknown Blueprint', '<script>alert(1)</script>', 'constructor', '__proto__']) assert.equal(rewardArtwork(name), undefined);
});

test('artwork follows browse context, including event environments and relic eras across refinements', () => {
  const mission = groupDropRows(rows, 'mission').find(group => group.title === 'Survival')!;
  assert.equal(groupArtwork(mission, 'mission')?.label, 'Survival');
  assert.equal(sourceArtwork(mission.rows[0])?.label, 'Survival');
  assert.equal(groupArtwork(groupDropRows(rows, 'bounty')[0], 'bounty')?.label, 'Plains of Eidolon');
  const location = groupDropRows([{ ...rows[0], location: 'Event: Earth' }], 'location')[0];
  assert.equal(groupArtwork(location, 'location')?.label, 'Earth · Grineer Forest');
  for (const name of ['Lith N1 Relic', 'Requiem IV Relic', 'Vanguard A1 Relic']) {
    const intact = sourceArtwork({ ...rows[0], source: `${name} (Intact)`, mission: '', location: '' });
    const radiant = sourceArtwork({ ...rows[0], source: `${name} (Radiant)`, mission: '', location: '' });
    assert.ok(intact); assert.equal(intact.src, radiant?.src); assert.equal(intact.src, rewardArtwork(name)?.src);
  }
  assert.equal(sourceArtwork({ ...rows[0], source: 'Heavy Gunner', mission: '', location: '' })?.label, 'Heavy Gunner');
  assert.equal(sourceArtwork({ ...rows[0], source: 'Unknown Heavy Gunner', mission: '', location: '' }), undefined);
  assert.equal(dropRarityTone('Rare'), 'rare'); assert.equal(dropRarityTone('Future rarity'), 'neutral');
});

test('every bundled artwork path has a valid local image and a matching source fingerprint', () => {
  const sources = JSON.parse(readFileSync(new URL('../public/images/drops/sources.json', import.meta.url), 'utf8'));
  const paths = new Set<string>();
  for (const entries of Object.values(manifest)) for (const art of Object.values(entries)) {
    assert.match(art.src, /^\/images\/(drops|equipment)\/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg)$/);
    assert.ok(art.label); assert.ok(['contain', 'cover'].includes(art.fit)); paths.add(art.src);
  }
  assert.equal(Object.keys(manifest.modes).length, 6);
  for (const path of paths) {
    const bytes = readFileSync(new URL(`../public${path}`, import.meta.url));
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    assert.ok(png || jpeg, path);
    assert.match(sources.images[path].source, /^https:\/\/(browse\.wf|raw\.githubusercontent\.com)\//);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sources.images[path].sha256, path);
  }
});
