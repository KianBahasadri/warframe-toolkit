import { mkdir, writeFile } from 'node:fs/promises';

const source = 'https://raw.githubusercontent.com/WFCD/warframe-items/master';
const categories = ['Primary', 'Secondary', 'Melee', 'Warframes', 'Arch-Gun', 'Arch-Melee'];
const lists = await Promise.all(categories.map(async category => {
  const response = await fetch(`${source}/data/json/${category}.json`);
  if (!response.ok) throw new Error(`Catalog download failed: ${category} (${response.status})`);
  return response.json();
}));
const all = lists.flat().filter(item => item.masterable !== false && item.uniqueName && item.name)
  .map(item => ({ ...item, name: item.name.replace(/^mk1-/i, 'MK1-') }));
const names = new Map(all.map(item => [item.uniqueName, item.name]));
const targets = new Map();
for (const item of all) for (const ingredient of item.components || []) {
  const name = names.get(ingredient.uniqueName);
  if (name && name !== item.name) targets.set(name, [...(targets.get(name) || []), item.name]);
}
function variant(name) {
  if (/^MK1-/i.test(name)) return 'MK1';
  return ['Prime', 'Umbra', 'Wraith', 'Vandal', 'Prisma', 'Kuva', 'Tenet', 'Dex', 'Coda'].find(v => name.split(' ').includes(v)) || 'Base';
}
const primeNames = new Set(all.filter(item => item.isPrime).map(item => item.name.replace(/ Prime$/, '')));
const unique = new Map();
for (const item of all) {
  if (unique.has(item.name)) continue;
  unique.set(item.name, {
    id: item.uniqueName, name: item.name,
    slot: item.category === 'Warframes' ? 'Warframe' : item.category === 'Arch-Gun' ? 'Archgun' : item.category === 'Arch-Melee' ? 'Archmelee' : item.category,
    variant: variant(item.name), masteryReq: item.masteryReq || 0,
    craftingTarget: [...new Set(targets.get(item.name) || [])].join(', '),
    hasPrimeVariant: !item.isPrime && primeNames.has(item.name),
    wikiUrl: `https://wiki.warframe.com/w/${encodeURIComponent(item.name.replaceAll(' ', '_'))}`,
  });
}
const items = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
const out = new URL('../src/data/', import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL('catalog.json', out), JSON.stringify({ source: 'https://github.com/WFCD/warframe-items', retrievedAt: new Date().toISOString(), items }, null, 2) + '\n');
const licenseResponse = await fetch(`${source}/LICENSE`);
if (!licenseResponse.ok) throw new Error('Catalog license download failed');
await writeFile(new URL('CATALOG-LICENSE.txt', out), await licenseResponse.text());
console.log(`Saved ${items.length} equipment names and their crafting relationships.`);
