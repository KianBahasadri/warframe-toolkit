# Grakata

Warframe catalogs, inventory, crafting plans, official drop tables, and an arsenal modding workshop. React + TypeScript + Vite; no API key required. Screenshots stay in your browser.

## Run

Requires Node.js 22.18+ and npm. Develop inside `node-dev`; see [AGENTS.md](AGENTS.md).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Catalog browsing and OCR work offline; drop updates and WFM prices need internet.

```sh
npm test
npm run build
npm run test:browser  # /usr/bin/chromium, or set CHROMIUM_PATH
npm run preview      # Production build at http://127.0.0.1:4173
```

## Data

- Guests can browse and edit temporarily. Sign in to save equipment, relics, views, crafting plans, and Modding Calculator arsenals. Accounts use a Warframe username and generated access key; keep the key or personal bookmark. No email recovery.
- Local accounts live in `.data/accounts.sqlite`; stop the server before backing it up. `ACCOUNTS_DATABASE` overrides the path. Public hosting needs HTTPS and `ACCOUNTS_ORIGIN` set to the exact origin. Static hosting supports browsing and temporary edits only.
- Legacy browser saves remain available for explicit migration. Accounts never merge automatically. Ownership, mastery, and current rank are separate; all 14 spreadsheet fields are preserved.
- Imports require review and preserve planning fields, notes, and absent equipment. Inventory supplies ownership/rank; Codex supplies mastery, not ownership/rank. Relic screenshots replace selected quantities by exact name/refinement, preserving notes and other stacks. Overlaps never add counts; missing counts suggest an unchecked 1.
- OCR checked against English 1920 × 1200 Inventory (37 names/ranks), Codex (32 names/laurels), and Relics (20 names/refinements/counts), plus modified/resized Codex images. Other languages, themes, layouts, UI scales, and actual lower-resolution captures remain unverified. No equipment recognition from artwork or arbitrary custom names. See [fixtures](tests/fixtures/README.md).
- [Official drops](https://warframe.com/droptables) update hourly through the server; failures retain the cache and retry after five minutes. Published sources may be unavailable or outdated. Odds assume independent attempts, without squad, booster, or pity modifiers.
- Hover Crafting for open plans; click it for the item picker. Each plan tab has a close ×. Sliders and typed entry track quantities; arrows add one Foundry batch or a rounded gather amount. Completed ingredients stay visible in compact groups. Remaining materials, source areas, batches, and costs follow progress without changing inventory. Areas preserve location alternatives; missing locations stay explicit. Recipe choices live in source details; valid quantity changes immediately scale the recipe tree and reset progress. Recipes producing multiple units still round up to whole Foundry batches. Credits exclude blueprint purchases; modular recipes cover components only. Mining popups show rarity and sourced cutter suggestions; `src/data/mining.ts` is manual guidance, not measured odds.
- Modding Calculator keeps Warframe, primary, secondary, and melee together, with eight mod slots each, aura/stance, Exilus, arcanes, ranks, polarity, capacity, notes, and build comparisons. Rank zero remains equipped. Disabling an effect keeps its capacity cost. Element order follows numbered slots; moving mods keeps slot polarities in place. Conditional arcanes start at zero active stacks. Frame auras and supported arcanes feed the corresponding weapons; Roar is an explicit scenario scaled by the selected frame’s strength. Edits never change inventory or spend resources.
- Its Arsenal layout places equipment and stats on the left, Aura/Exilus above the eight mod slots, arcanes on the right, and compatible upgrades below. Select a slot's adjustment control to edit its rank/polarity or equip from the library; click the slot itself to open the picker. Capacity shows remaining / total. Local mod artwork, rarity borders, polarity symbols, and visual references are documented in [Arsenal sources](public/images/modding/SOURCES.md).
- Modding Calculator exposes formulas and contributing upgrades for direct damage, elemental combinations, critical tiers, multishot, reload, ideal DPS, neutral target armor, survivability, and generic ability costs. Missing stats stay unavailable. Unmodeled effects are labeled Partial / Reference only and listed beside results; they are not silently treated as simulated. Companions, Exalted equipment, Rivens, shards, set bonuses, Warframe passives, ability-specific damage, status damage, special enemy mechanics, and Incarnon evolutions are not simulated. Alternate attacks are separate components; beam, charge, burst, and alternate attacks have no sustained-DPS estimate. Values do not represent exact mission damage.
- Modding Calculator’s pinned snapshot shares the equipment catalog’s WFCD revision. Canonical mod paths exclude flawed/intermediate/Conclave variants and duplicate prototypes. Linear percentages use maximum effect × (rank + 1) / (maximum rank + 1), while descriptions retain source rounding. Rank 30 frame stats add published Update 34 rank bonuses to snapshot base stats; frames absent from that table require manual values. Later rank-bonus changes and weapon-specific exceptions need verification in-game. Base stats can be overridden explicitly; see Sources & model coverage in the workshop.
- WFM shows the median of up to five cheapest distinct online sellers, in platinum per item. Hover for statistics; click for history, platform/variant selection, and CSV. Prime equipment uses explicitly labeled sets/blueprints; relic refinements stay separate. Defaults to PC. [WFM API](https://docs.warframe.market/docs/api/overview/) requests share a paced cache: orders 5 minutes, history 1 hour. Failures retain dated, marked stale prices; missing prices remain unknown. Closed history is user-reported, not verified sales.

## Maintain

```sh
npm run catalog:update    # Equipment, crafting metadata, and images
npm run catalog:relics    # Official relics, rewards, sources, images; requires xz
npm run catalog:drop-art  # Reward/source artwork
npm run catalog:modder    # Mods, arcanes, Warframe base stats; pinned to equipment revision
```

Relics use [Public Export](https://content.warframe.com/PublicExport/index_en.txt.lzma) and official drops; equipment uses community exports. Snapshots record sources and dates. Missing chances stay unknown; inconsistent published totals are shown unchanged. `src/data/reference.ts` is manually transcribed. Refreshes never change saved inventory.

- `src/App.tsx`, `src/components/`: interface and collection tables.
- `src/lib/`: models, recommendations, OCR, filtering, accounts, and persistence.
- `src/lib/modder.ts`, `src/lib/modderModel.ts`, `src/components/Modder.tsx`: calculation rules, bounded account saves, and the workshop. Older clients preserve saved arsenals when omitting the new field; malformed replacements are rejected on both runtimes.
- `server/`, `vite.config.ts`: local accounts, drops, and WFM cache.
- `cloudflare/`, `infra/cloudflare/`: hosted runtime and [deployment/recovery](infra/cloudflare/README.md).
- `tests/`: unit, browser, and Cloudflare checks.

[Equipment sources/licenses](public/images/SOURCES.md) · [Drop artwork](public/images/drops/SOURCES.md) · [Screenshots](public/images/import/SOURCES.md) · [Icons](src/assets/warframe/SOURCES.md)

Independent fan tool; not affiliated with Digital Extremes.
