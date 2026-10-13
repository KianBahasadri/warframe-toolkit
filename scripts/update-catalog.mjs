import { mkdir, writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { buildCatalog } from './build-catalog.mjs';
import { buildCraftingMaterials } from './build-crafting.mjs';

async function fetchChecked(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return response;
}
async function revision(repo, branch) {
  const response = await fetchChecked(`https://api.github.com/repos/${repo}/commits/${branch}`);
  const { sha } = await response.json();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`Invalid revision for ${repo}`);
  return sha;
}
const wfcdRepo = 'WFCD/warframe-items';
const gameRepo = 'calamity-inc/warframe-public-export-plus';
const [wfcdRevision, gameRevision] = await Promise.all([revision(wfcdRepo, 'master'), revision(gameRepo, 'senpai')]);
const wfcdRaw = `https://raw.githubusercontent.com/${wfcdRepo}/${wfcdRevision}`;
const gameRaw = `https://raw.githubusercontent.com/${gameRepo}/${gameRevision}`;
const categories = ['Primary', 'Secondary', 'Melee', 'Warframes', 'Arch-Gun', 'Arch-Melee', 'SentinelWeapons', 'Misc', 'Components', 'Resources'];
const gameFiles = { weapons: 'ExportWeapons', recipes: 'ExportRecipes', resources: 'ExportResources', keys: 'ExportKeys', dictionary: 'dict.en', images: 'ExportImages' };
const [lists, game, wfcdLicense, gameLicense] = await Promise.all([
  Promise.all(categories.map(async category => [category, await (await fetchChecked(`${wfcdRaw}/data/json/${category}.json`)).json()])).then(Object.fromEntries),
  Promise.all(Object.entries(gameFiles).map(async ([key, name]) => [key, await (await fetchChecked(`${gameRaw}/${name}.json`)).json()])).then(Object.fromEntries),
  fetchChecked(`${wfcdRaw}/LICENSE`).then(r => r.text()), fetchChecked(`${gameRaw}/LICENSE`).then(r => r.text()),
]);
const sources = { wfcd: `https://github.com/${wfcdRepo}/tree/${wfcdRevision}`, game: `https://github.com/${gameRepo}/tree/${gameRevision}`, wfcdRaw };
const items = buildCatalog(lists, game, sources);
if (items.length < 700) throw new Error(`Unexpectedly small catalog: ${items.length}`);
const materials = buildCraftingMaterials(items, lists, game, sources);
const images = [...new Map([...items, ...materials].filter(item => item.image).map(item => [item.image, item.imageSource])).entries()];
const previous = await readFile(new URL('../src/data/catalog.json', import.meta.url), 'utf8').then(text => new Map(JSON.parse(text).items.map(item => [item.image, item.imageSource]))).catch(() => new Map());
const previousMaterials = await readFile(new URL('../src/data/crafting.json', import.meta.url), 'utf8').then(text => JSON.parse(text).materials).catch(() => []);
for (const item of previousMaterials) if (item.image) previous.set(item.image, item.imageSource);
await mkdir(new URL('../public/images/equipment/', import.meta.url), { recursive: true });
await mkdir(new URL('../public/images/crafting/', import.meta.url), { recursive: true });
let next = 0;
let done = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < images.length) {
    const [path, url] = images[next++];
    const destination = new URL(`../public${path}`, import.meta.url);
    const signature = Buffer.from([137,80,78,71,13,10,26,10]);
    if (previous.get(path) === url && await readFile(destination).then(bytes => bytes.subarray(0, 8).equals(signature)).catch(() => false)) { done++; continue; }
    const response = await fetchChecked(url);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.subarray(0, 8).equals(signature)) throw new Error(`Not a PNG: ${url}`);
    const temp = new URL(`${destination.href}.tmp`);
    await writeFile(temp, bytes); await rename(temp, destination);
    if (++done % 100 === 0) console.log(`Downloaded ${done}/${images.length} equipment images.`);
  }
}));
const out = new URL('../src/data/', import.meta.url);
await mkdir(out, { recursive: true });
const data = { source: `https://github.com/${wfcdRepo}`, sources: [sources.wfcd, sources.game], retrievedAt: new Date().toISOString(), items };
await writeFile(new URL('crafting.json.tmp', out), JSON.stringify({ sources: data.sources, retrievedAt: data.retrievedAt, materials }, null, 2) + '\n');
await rename(new URL('crafting.json.tmp', out), new URL('crafting.json', out));
await writeFile(new URL('catalog.json.tmp', out), JSON.stringify(data, null, 2) + '\n');
await rename(new URL('catalog.json.tmp', out), new URL('catalog.json', out));
const currentImages = new Set(images.map(([path]) => path));
for (const { image } of previousMaterials) if (/^\/images\/crafting\/[a-f0-9]{16}\.png$/.test(image) && !currentImages.has(image)) {
  await unlink(new URL(`../public${image}`, import.meta.url)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
await writeFile(new URL('CATALOG-LICENSE.txt', out), wfcdLicense);
await writeFile(new URL('GAME-EXPORT-LICENSE.txt', out), gameLicense);
console.log(`Saved ${items.filter(x => x.slot !== 'Warframe').length} weapons, ${items.filter(x => x.slot === 'Warframe').length} Warframes, and ${images.length} local images.`);
