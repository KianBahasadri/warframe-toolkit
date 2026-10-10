import { writeFile } from 'node:fs/promises';

const response = await fetch('https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Relics.json');
if (!response.ok) throw new Error(`Relic catalog download failed (${response.status})`);
const data = await response.json();
const suffix = / (Intact|Exceptional|Flawless|Radiant)$/;
const names = [...new Set(data.filter(item => suffix.test(item.name)).map(item => item.name.replace(suffix, '')))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
await writeFile(new URL('../src/data/relics.json', import.meta.url), JSON.stringify({
  source: 'https://github.com/WFCD/warframe-items', retrievedAt: new Date().toISOString(), names,
}, null, 2) + '\n');
console.log(`Saved ${names.length} relic names. Uses the existing CATALOG-LICENSE.txt attribution.`);
