import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile, rename } from 'node:fs/promises';
import { fetchLiveDropTables } from '../server/dropTables.ts';
import { currencyArt, locationScenes, missionScenes } from './drop-art-scenes.mjs';

const catalog = JSON.parse(await readFile(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
const [wfcd, game] = catalog.sources.map(source => source.replace('github.com', 'raw.githubusercontent.com').replace('/tree/', '/'));
async function checked(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
const categories = ['Mods', 'Resources', 'Relics', 'Misc', 'Arcanes', 'Warframes', 'Primary', 'Secondary', 'Melee', 'Gear', 'Fish', 'Sigils', 'Components', 'Archwing', 'Sentinels', 'Pets'];
const [lists, resources, recipes, enemies, dictionary, drops] = await Promise.all([
  Promise.all(categories.map(async name => (await checked(`${wfcd}/data/json/${name}.json`)).json())),
  checked(`${game}/ExportResources.json`).then(r => r.json()),
  checked(`${game}/ExportRecipes.json`).then(r => r.json()),
  checked(`${game}/ExportEnemies.json`).then(r => r.json()),
  checked(`${game}/dict.en.json`).then(r => r.json()),
  fetchLiveDropTables(),
]);
const normalize = name => name.trim().toLocaleLowerCase();
const itemArt = new Map(), byId = new Map(), enemyArt = new Map();
for (const item of lists.flat()) {
  if (!byId.has(item.uniqueName) || item.imageName) byId.set(item.uniqueName, item);
  if (item.name && item.imageName && !['Blueprint', 'Chassis', 'Systems', 'Neuroptics'].includes(item.name)) itemArt.set(normalize(item.name), { url: `${wfcd}/data/img/${item.imageName}`, label: item.name, fit: item.imageName.endsWith('.jpg') ? 'cover' : 'contain' });
}
const gameArt = (icon, label) => ({ url: `https://browse.wf${icon}`, label, fit: /\.jpe?g$/i.test(icon) ? 'cover' : 'contain' });
for (const resource of Object.values(resources)) {
  const name = dictionary[resource.name];
  if (name && resource.icon) itemArt.set(normalize(name), gameArt(resource.icon, name));
}
// Blueprints depict their exact recipe result, never a guessed base or alternate variant.
for (const recipe of Object.values(recipes)) {
  const resource = resources[recipe.resultType], item = byId.get(recipe.resultType);
  const name = dictionary[resource?.name] || item?.name;
  if (!name) continue;
  const art = itemArt.get(normalize(name));
  if (art) itemArt.set(normalize(`${name} Blueprint`), art);
}
for (const item of catalog.items) itemArt.set(normalize(item.name), { url: item.imageSource, local: item.image, label: item.name, fit: 'contain' });
for (const enemy of Object.values(enemies.avatars)) {
  const name = dictionary[enemy.name];
  if (name && enemy.icon) enemyArt.set(normalize(name), gameArt(enemy.icon, name));
}
for (const [name, art] of Object.entries(currencyArt)) itemArt.set(normalize(name), art);
const relics = {};
for (const item of lists.flat().filter(item => item.category === 'Relics' && / Intact$/.test(item.name))) {
  const era = item.name.split(' ')[0];
  if (!relics[era]) relics[era] = { url: `${wfcd}/data/img/${item.imageName}`, label: `${era} relic`, fit: 'contain' };
}
function rewardArt(name) {
  const exact = itemArt.get(normalize(name));
  if (exact) return exact;
  const withoutQuantity = name.replace(/^[\d,]+\s*[xX]?\s+/, '').replace(/^Credits Cache$/, 'Credits');
  const resource = itemArt.get(normalize(withoutQuantity));
  if (resource) return resource;
  const relic = /^([A-Za-z]+)\s+[A-Za-z0-9]{1,10}\s+Relic$/.exec(name);
  return relic ? relics[relic[1]] : undefined;
}
const items = {}, sources = {};
for (const name of new Set(drops.rows.map(row => row.reward))) {
  const art = rewardArt(name);
  if (art) items[normalize(name)] = art;
}
for (const name of new Set(drops.rows.map(row => row.source))) {
  const art = enemyArt.get(normalize(name));
  if (art) sources[normalize(name)] = art;
}
const modes = {
  mission: missionScenes.Survival,
  item: itemArt.get('serration'),
  location: locationScenes.Earth,
  relic: relics.Lith,
  bounty: locationScenes.Cetus,
  source: enemyArt.get('heavy gunner'),
};
const sections = { items, sources, relics, missions: missionScenes, locations: locationScenes, modes };
const images = new Map(Object.values(sections).flatMap(section => Object.values(section)).filter(Boolean).map(art => [art.url, art]));
const out = new URL('../public/images/drops/', import.meta.url);
await mkdir(out, { recursive: true });
let next = 0, complete = 0;
const pending = [...images.values()], local = new Map(), provenance = {}, missing = [];
const validImage = bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < pending.length) {
    const art = pending[next++];
    const file = `${createHash('sha256').update(art.url).digest('hex').slice(0, 16)}${new URL(art.url).pathname.match(/\.(png|jpg|jpeg)$/i)?.[0] ?? '.png'}`;
    const path = art.local || `/images/drops/${file}`;
    const destination = new URL(`../public${path}`, import.meta.url);
    try {
      let bytes = await readFile(destination).catch(() => null);
      if (!bytes || !validImage(bytes)) {
        bytes = Buffer.from(await (await checked(art.url)).arrayBuffer());
        if (!validImage(bytes)) throw new Error(`Not an image: ${art.url}`);
        await writeFile(`${destination.pathname}.tmp`, bytes); await rename(`${destination.pathname}.tmp`, destination);
      }
      local.set(art.url, path);
      provenance[path] = { source: art.url, sha256: createHash('sha256').update(bytes).digest('hex') };
    } catch (error) { missing.push({ url: art.url, reason: String(error) }); }
    if (++complete % 200 === 0) console.log(`Checked ${complete}/${pending.length} images`);
  }
}));
const manifest = Object.fromEntries(Object.entries(sections).map(([section, entries]) => [section, Object.fromEntries(Object.entries(entries).filter(([, art]) => art && local.has(art.url)).sort(([a], [b]) => a.localeCompare(b)).map(([name, art]) => [name, { src: local.get(art.url), label: art.label, fit: art.fit }]))]));
if (Object.keys(manifest.items).length < 2000 || Object.keys(manifest.modes).length !== 6) throw new Error('Artwork coverage is unexpectedly incomplete; the previous manifest has been kept.');
await writeFile(new URL('../src/data/drop-art.json.tmp', import.meta.url), JSON.stringify(manifest) + '\n');
await rename(new URL('../src/data/drop-art.json.tmp', import.meta.url), new URL('../src/data/drop-art.json', import.meta.url));
await writeFile(new URL('sources.json', out), JSON.stringify({ retrievedAt: new Date().toISOString(), catalogs: catalog.sources, images: provenance, unavailable: missing }, null, 2) + '\n');
for (const file of await readdir(out)) if (/^[a-f0-9]{16}\.(png|jpg|jpeg)$/.test(file) && !provenance[`/images/drops/${file}`]) await unlink(new URL(file, out));
console.log(`Saved ${Object.keys(manifest.items).length} reward names, ${Object.keys(manifest.sources).length} enemy names, and ${local.size} images. ${missing.length} downloads unavailable. Unmatched names use the explicit artwork fallback.`);
