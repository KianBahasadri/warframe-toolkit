import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readWeaponTables, buildArsenalStats } from './build-arsenal-stats.mjs';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('src/data/catalog.json', root), 'utf8'));
const titles = ['primary', 'secondary', 'melee'].map(slot => `Module:Weapons/data/${slot}`);
async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.text();
}
const revisions = JSON.parse(await fetchText(`https://wiki.warframe.com/api.php?${new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'ids', titles: titles.join('|'), format: 'json' })}`));
const sources = [], tables = [];
for (const title of titles) {
  const page = Object.values(revisions.query.pages).find(page => page.title === title);
  const revision = page?.revisions?.[0]?.revid;
  if (!Number.isInteger(revision)) throw new Error(`Missing revision for ${title}`);
  const url = `https://wiki.warframe.com/w/${title}?oldid=${revision}`;
  const lua = await fetchText(`${url}&action=raw`);
  tables.push(readWeaponTables(lua));
  sources.push({ url, sha256: createHash('sha256').update(lua).digest('hex') });
}
const weapons = buildArsenalStats(catalog.items, tables);
if (Object.keys(weapons).length < 400) throw new Error('Unexpectedly small weapon reference snapshot.');
const result = { retrievedAt: new Date().toISOString().slice(0, 10), catalogSources: catalog.sources, sources, license: 'CC BY-NC-SA 3.0; WARFRAME Wiki contributors. Supplemental reference fields only.', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/3.0/', weapons };
const destination = new URL('src/data/arsenalWeaponStats.json', root);
await writeFile(`${destination.pathname}.tmp`, JSON.stringify(result, null, 2) + '\n');
await rename(`${destination.pathname}.tmp`, destination);
console.log(`Saved reference attributes for ${Object.keys(weapons).length} exact equipment variants.`);
