import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fetchLiveDropTables } from '../server/dropTables.ts';
import { buildRelics } from './build-relics.mjs';
import { checkedFetch, EXPORT_INDEX, fetchPublicExport } from './public-export.mjs';

const [{ exports, sources }, drops] = await Promise.all([
  fetchPublicExport(['ExportWeapons', 'ExportWarframes', 'ExportResources', 'ExportRecipes', 'ExportUpgrades', 'ExportSentinels', 'ExportCustoms', 'ExportRelicArcane', 'ExportManifest']),
  fetchLiveDropTables(),
]);
const items = buildRelics(exports, drops);
if (items.length < 3000 || !items.some(item => item.sources.length)) throw new Error('Relic catalog is incomplete; previous snapshot retained.');
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/images/relics/', root), { recursive: true });
const pending = [...new Map(items.map(item => [item.image, item])).values()];
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < pending.length) {
    const item = pending[cursor++];
    const path = new URL(`public${item.image}`, root);
    const valid = data => data.length > 32 && data.subarray(0, 8).equals(png);
    try { if (valid(await readFile(path))) continue; } catch { /* Download missing artwork. */ }
    const bytes = Buffer.from(await (await checkedFetch(item.imageSource)).arrayBuffer());
    if (!valid(bytes)) throw new Error(`Invalid image: ${item.imageSource}`);
    const temporary = new URL(`${path.href}.tmp`);
    await writeFile(temporary, bytes); await rename(temporary, path);
  }
}));
const snapshot = {
  source: EXPORT_INDEX, sources, retrievedAt: new Date().toISOString(),
  drops: { source: drops.sourceUrl, updated: drops.updated, retrievedAt: drops.fetchedAt },
  names: [...new Set(items.map(item => item.name))], items,
};
const target = new URL('src/data/relics.json', root), temporary = new URL(`${target.href}.tmp`);
await writeFile(temporary, JSON.stringify(snapshot) + '\n'); await rename(temporary, target);
console.log(`Saved ${snapshot.names.length} relics, ${items.length} refinements, and ${pending.length} images from official sources.`);
