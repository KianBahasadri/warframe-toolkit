// UI artwork only; never changes equipment statistics or saved builds.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('src/data/catalog.json', root), 'utf8'));
const modder = JSON.parse(await readFile(new URL('src/data/modder.json', root), 'utf8'));
const directory = new URL('public/images/arsenal/', root);
await mkdir(directory, { recursive: true });
let previousSources = {};
try { previousSources = JSON.parse(await readFile(new URL('sources.json', directory), 'utf8')).files; } catch { /* First import. */ }
const ui = {
  warframe: 'Icons/Categories/IconWarframe_256.png',
  primary: 'Icons/StarChartLoadoutSwap/PrimaryWeapon.png',
  secondary: 'Icons/StarChartLoadoutSwap/SecondaryWeapon.png',
  melee: 'Icons/StarChartLoadoutSwap/MeleeWeapon.png',
  aura: 'Icons/Categories/IconAura_256.png',
  stance: 'Icons/Categories/IconStance_256.png',
  exilus: 'Icons/Categories/ExilusIcon_d.png',
  all: 'Icons/Infinity_d.png',
  search: 'Icons/MagnifyingGlassIcon.png',
  copy: 'Icons/CopyIcon.png',
  edit: 'Icons/Edit.png',
  add: 'Icons/AddSlotIcon.png',
  back: 'Icons/BackArrow.png',
  forward: 'Icons/ContinueArrow.png',
  down: 'Icons/DecreaseArrow.png',
  close: 'Icons/ClearSearch.png',
  stats: 'Icons/StatsIcon.png',
  reactor: 'Graphics/Mods/ModActions/ModActionOrokin.png',
  polarize: 'Graphics/Mods/ModActions/ModActionPolarise.png',
  swap: 'Graphics/Mods/ModActions/ModActionSwap.png',
  ornament: 'Icons/StarChartLoadoutSwap/FadedLines.png',
  arcane: 'Icons/StarChartLoadoutSwap/NoArcane.png',
  arcaneBacker: 'Graphics/Arcanes/ArcaneBacker.png',
  arcaneSurround: 'Icons/CosmeticEnhancers/Arcanes/Progression/ArcaneProgressIcon1.png',
  arcaneRank: 'Icons/PipDiamond_d.png',
  'damage-true': 'Icons/Damage/Finisher_d.png',
  emptyMod: 'Graphics/Mods/AntiqueModDockBacker.png',
  modGlass: 'Graphics/Mods/ModGlassGlow.png',
  modMask: 'Graphics/Mods/ModGlassMask.png',
  emptyNotch: 'Graphics/Mods/EmptyNotch.png',
  filledNotch: 'Graphics/Mods/FilledNotch.png',
  ...Object.fromEntries(['Impact', 'Puncture', 'Slash', 'Heat', 'Cold', 'Electricity', 'Toxin', 'Blast', 'Radiation', 'Gas', 'Magnetic', 'Viral', 'Corrosive', 'Void', 'Sentient'].map(type => [`damage-${type.toLowerCase()}`, `Icons/StatSymbols/${type}Symbol.png`])),
};
const sources = {};
async function download(url, filename) {
  const file = new URL(filename, directory);
  try { await access(file); sources[filename] = previousSources[filename] ?? url; return `/images/arsenal/${filename}`; } catch { /* Fetch missing artwork. */ }
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Public Export serves PNGs without a Content-Type header.
  const signature = Buffer.from(bytes.subarray(0, 12));
  if (!signature.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71])) && signature.toString('ascii', 0, 4) !== 'RIFF') return null;
  await writeFile(file, bytes);
  sources[filename] = url;
  return `/images/arsenal/${filename}`;
}
async function pool(entries, callback) {
  const pending = entries.slice();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (pending.length) await callback(pending.shift());
  }));
}
await pool(Object.entries(ui), async ([name, path]) => {
  const url = `https://browse.wf/Lotus/Interface/${path}`;
  if (!await download(url, `${name}.png`)) throw new Error(`Missing UI texture: ${url}`);
});
const portraits = {}, abilities = {}, references = [];
await pool(catalog.items.filter(item => item.slot === 'Warframe' && item.weaponType === 'Warframe'), async item => {
  const filename = `${item.name.replace(/[^a-z0-9]/gi, '')}Full.png`;
  const hash = createHash('md5').update(filename).digest('hex');
  const url = `https://static.wikia.nocookie.net/warframe/images/${hash[0]}/${hash.slice(0, 2)}/${filename}`;
  try {
    const image = await download(`https://wiki.warframe.com/images/${filename}`, filename) ?? await download(url, filename);
    if (image) portraits[item.name] = image;
    else console.log(`No full portrait: ${item.name}; using catalog image.`);
  } catch { console.log(`Portrait unavailable: ${item.name}; using catalog image.`); }
});
console.log(`Downloaded ${Object.keys(portraits).length} full portraits.`);
const names = [...new Set(modder.frames.map(frame => frame.name.replace(/ (Prime|Umbra)$/, '')))];
await pool(names, async name => {
  const url = `https://www.warframe.com/en/game/warframes/${name.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) return;
    const html = await response.text();
    const matches = [...html.matchAll(/WarframeAbilityCard-icon[^>]*src="([^"]+)"[^>]*>[\s\S]*?WarframeAbilityCard-title[^>]*>([^<]+)/g), ...html.matchAll(/WarframeAbilityIcon[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/g)];
    for (const [, image, title] of matches) {
      const source = image;
      const path = await download(source, `ability-${source.split('/').at(-1).split('!')[0]}`);
      if (path) abilities[title.trim().replaceAll('&amp;', '&').replaceAll('&#039;', "'").replaceAll('&#39;', "'").toLowerCase()] = path;
    }
    if (matches.length) references.push(url);
  } catch { console.log(`Ability artwork unavailable: ${name}.`); }
});
const howl = await download('https://browse.wf/Lotus/Interface/Icons/Abilities/ExcaliburUmbraRoar.png', 'ability-ExcaliburUmbraRoar.png');
if (howl) abilities['radial howl'] = howl;
const crests = {};
await pool([...new Set(modder.mods.filter(mod => mod.set).map(mod => mod.id.match(/\/Sets\/([^/]+)\//)?.[1]).filter(Boolean))], async set => {
  const stem = set === 'Sacrifice' ? 'Umbra' : set;
  const url = `https://raw.githubusercontent.com/Reuzehagel/arsenyx/de051e179996b9b39459e86f55036ea7361319c0/apps/web/public/mod-set-icons/${stem}Header.png`;
  const path = await download(url, `${stem}Header.png`);
  if (path) crests[set] = path;
});
const sorted = values => Object.fromEntries(Object.keys(values).sort().map(key => [key, values[key]]));
await writeFile(new URL('src/data/arsenalArt.json', root), JSON.stringify({ portraits: sorted(portraits), abilities: sorted(abilities), crests: sorted(crests) }, null, 2) + '\n');
await writeFile(new URL('sources.json', directory), JSON.stringify({ retrievedAt: new Date().toISOString().slice(0, 10), references: references.sort(), files: Object.fromEntries(Object.entries(sources).sort()) }, null, 2) + '\n');
console.log(`Downloaded ${Object.keys(abilities).length} ability icons and ${Object.keys(ui).length} UI textures.`);
