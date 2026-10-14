import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseDocument } from 'htmlparser2';

// Reuse the equipment snapshot's revisions so a refresh cannot mix game versions.
const catalog = JSON.parse(await readFile(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
const source = catalog.sources.find(url => url.includes('WFCD/warframe-items'));
const raw = source.replace('github.com', 'raw.githubusercontent.com').replace('/tree/', '/');
const rankSource = 'https://www.warframe.com/en/patch-notes/pc/34-0-0';
async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.text();
}
const [mods, arcanes, frames, rankHtml] = await Promise.all([
  ...['Mods', 'Arcanes', 'Warframes'].map(category => fetchText(`${raw}/data/json/${category}.json`).then(JSON.parse)),
  fetchText(rankSource),
]);
const plain = node => node.type === 'text' ? node.data : (node.children ?? []).map(plain).join(' ');
const rankText = plain(parseDocument(rankHtml)).replace(/\s+/g, ' ');
const clean = text => text.replace(/<[^>]*>/g, '').replace(/\\n/g, '\n').trim();
const types = new Set(['Warframe Mod', 'Primary Mod', 'Secondary Mod', 'Shotgun Mod', 'Melee Mod', 'Stance Mod', 'Mod Set Mod']);
const byName = new Map();
for (const item of mods) {
  if (!types.has(item.type) || (!item.levelStats?.length && item.type !== 'Stance Mod') || /Beginner|Intermediate|PvP|PVP|Conclave/.test(item.uniqueName)) continue;
  // The export includes obsolete prototypes with the same name. The canonical,
  // non-prototype path is shorter; never relabel these as playable variants.
  const previous = byName.get(item.name);
  if (!previous || item.uniqueName.length < previous.uniqueName.length) byName.set(item.name, item);
}
const imagePath = name => `/images/mods/${createHash('sha256').update(name).digest('hex').slice(0, 16)}.${name.split('.').at(-1).toLowerCase()}`;
const upgrade = item => ({
  id: item.uniqueName, name: item.name, type: item.type, compat: item.compatName ?? '',
  rarity: item.rarity ?? '', image: item.imageName ? imagePath(item.imageName) : '',
  polarity: item.polarity ?? '', drain: item.baseDrain ?? 0,
  maxRank: item.fusionLimit ?? item.levelStats.length - 1,
  exilus: Boolean(item.isExilus || item.isUtility), set: Boolean(item.modSet),
  ranks: item.levelStats?.map(level => level.stats.map(clean)) ?? Array.from({ length: item.fusionLimit + 1 }, () => [clean(item.description ?? '')]),
  url: item.wikiaUrl ?? `https://wiki.warframe.com/w/${encodeURIComponent(item.name.replaceAll(' ', '_'))}`,
});
const frameData = frames.filter(item => item.type === 'Warframe').map(item => {
  const name = item.name.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = rankText.match(new RegExp(`(?:^| )${name} Health: (.*?)(?= [A-Z][A-Z ]{2,} Health: |$)`));
  const bonuses = {};
  if (match) for (const [label, key] of [['Health', 'health'], ['Shields', 'shield'], ['Armor', 'armor'], ['Energy', 'power']]) {
    const stat = (`Health: ${match[1]}`).match(new RegExp(`${label}: Base Rank - ([\\d.]+).*?(?:/ Max Rank - ([\\d.]+)|(?= (?:Shields|Armor|Energy):)|$)`));
    if (stat) bonuses[key] = stat[2] ? Number(stat[2]) - Number(stat[1]) : 0;
  }
  const verified = ['health', 'shield', 'armor', 'power'].every(key => key in bonuses);
  return { id: item.uniqueName, name: item.name, aura: typeof item.aura === 'string' ? item.aura : '', verified,
    base: { health: item.health, shield: item.shield, armor: item.armor, energy: item.power },
    ranked: verified ? { health: item.health + bonuses.health, shield: item.shield + bonuses.shield, armor: item.armor + bonuses.armor, energy: item.power + bonuses.power } : null,
    abilities: (item.abilities ?? []).map(ability => ({ name: ability.name, description: clean(ability.description) })),
  };
});
const data = { source, rankSource, retrievedAt: new Date().toISOString(),
  mods: [...byName.values()].map(upgrade).sort((a, b) => a.name.localeCompare(b.name)),
  arcanes: arcanes.filter(item => /^(Warframe|Primary|Secondary|Melee|Shotgun|Bow) Arcane$/.test(item.type) && item.levelStats?.length).map(upgrade).sort((a, b) => a.name.localeCompare(b.name)),
  frames: frameData,
};
if (data.mods.length < 600 || data.arcanes.length < 60 || frameData.filter(frame => frame.verified).length < 80) throw new Error('Incomplete Modding Calculator source data; snapshot kept.');
// Keep artwork local so opening the workshop never contacts an image service.
await mkdir(new URL('../public/images/mods/', import.meta.url), { recursive: true });
const wanted = new Set([...data.mods, ...data.arcanes].map(item => item.id));
const images = [...new Set([...mods, ...arcanes].filter(item => wanted.has(item.uniqueName)).map(item => item.imageName).filter(Boolean))];
let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < images.length) {
    const name = images[cursor++], file = new URL(`../public${imagePath(name)}`, import.meta.url);
    try { await access(file); continue; } catch { /* Download uncached artwork. */ }
    const response = await fetch(`${raw}/data/img/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Missing mod artwork: ${name}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
}));
await writeFile(new URL('../src/data/modder.json', import.meta.url), JSON.stringify(data) + '\n');
console.log(`Saved ${data.mods.length} mods, ${data.arcanes.length} arcanes, ${frameData.length} Warframes (${frameData.filter(frame => frame.verified).length} with sourced rank bonuses).`);
