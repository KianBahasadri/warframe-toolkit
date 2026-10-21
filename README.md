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
- Weapon, Warframe, and relic columns automatically fit the displayed contents. Long names, crafting targets, and notes wrap within bounded widths.
- Imports require review and preserve planning fields, notes, and absent equipment. Inventory supplies ownership/rank; Codex supplies mastery, not ownership/rank. Relic screenshots replace selected quantities by exact name/refinement, preserving notes and other stacks. Overlaps never add counts; missing counts suggest an unchecked 1.
- OCR checked against English 1920 × 1200 Inventory (37 names/ranks), Codex (32 names/laurels), and Relics (20 names/refinements/counts), plus modified/resized Codex images. A relic code misread with `$` in place of `S` can suggest an existing catalog name, left unchecked for name review. Other languages, themes, layouts, UI scales, and actual lower-resolution captures remain unverified. No equipment recognition from artwork or arbitrary custom names. See [fixtures](tests/fixtures/README.md).
- [Official drops](https://warframe.com/droptables) update hourly through the server; failures retain the cache and retry after five minutes. Published sources may be unavailable or outdated. Odds assume independent attempts, without squad, booster, or pity modifiers.
- Hover Crafting for open plans; click it for the item picker. Each plan tab has a close ×. Sliders and typed entry track quantities; arrows add one Foundry batch or a rounded gather amount. Completed ingredients stay visible in compact groups. Remaining materials, source areas, batches, and costs follow progress without changing inventory. Areas preserve location alternatives; missing locations stay explicit. Recipe choices live in source details; valid quantity changes immediately scale the recipe tree and reset progress. Recipes producing multiple units still round up to whole Foundry batches. Credits exclude blueprint purchases; modular recipes cover components only. Mining popups show rarity and sourced cutter suggestions; `src/data/mining.ts` is manual guidance, not measured odds. Community guides appear only as footnotes in source popups, including Revalopod’s Steam fishing guide for Orb Vallis fish, fish parts, and Scrap.
- Crafting includes standalone companion, Archwing, landing-craft, gear, cosmetic, and modular-part recipes independently of the weapon/Warframe inventory. Search accepts item and blueprint names; batch alternatives show their output. The generator accounts for every exported recipe in `src/data/crafting.json` → `recipeCoverage`, including explicit exclusion reasons for hidden, empty, unnamed, and known unused/retired blueprints. Exceptions live in `scripts/crafting-exclusions.mjs`. Published recipes can still require legacy, event, quest, or vendor blueprints; inclusion does not guarantee current availability. Modular assembly and Dojo research/construction costs are outside these recipes.
- Modding Calculator keeps Warframe, primary, secondary, and melee together, with eight mod slots each, aura/stance, Exilus, arcanes, ranks, polarity, capacity, notes, and build comparisons. Rank zero remains equipped. Disabling an effect keeps its capacity cost. Element order follows numbered slots; moving mods keeps slot polarities in place. Conditional arcanes start at zero active stacks. Frame auras and supported arcanes feed the corresponding weapons; Roar is an explicit scenario scaled by the selected frame’s strength. Edits never change inventory or spend resources.
- Modding Calculator opens in Arsenal: hover over or select equipment on the left to switch its artwork, description, stats, and calculations, Swap it, or open Upgrade. Back (or Escape outside a field/picker) returns to Arsenal without discarding edits. Warframe abilities show reference descriptions, not simulated effects. Artwork uses local wiki portraits where available, with the exact equipment's catalog image as fallback; previews are static renders. The Upgrade screen has no equipment background image. Its compact workspace puts capacity/stats on the left, Aura/Stance and Exilus above eight mod slots, arcanes beside them, and a two-row compatible-upgrade tray below (a scrollable grid on phones). Firearm Exilus is full size beneath the arcane, beside the mod grid. Equipped arcanes use the original metallic surround and diamond rank texture. Both Arsenal and Upgrade keep live calculations in a scrollable right sidebar on desktop; smaller screens stack them below and phones provide a Results shortcut.
- The scrollable weapon stats panel shows live Status, individual damage types with original game symbols, Total damage per projectile, utility stats, five-dot Riven disposition, and separate attack sections. Magazine, Accuracy, and Trigger expand for available ammo, spread, and noise details. Dotted values are base references, not simulated mod effects. Supplemental ammo/range/spread/falloff attributes match exact equipment IDs and attack names from a separately dated WARFRAME Wiki snapshot; they never replace the calculation catalog. Accuracy categories use aimed minimum spread. Riven disposition is the catalog snapshot; Incarnon evolution bonuses, beam ramp-up/chaining, and modifiers to the reference attributes remain unmodeled. Overrides apply only to the selected attack component.
- Drag from the tray to equip, drag between compatible slots to move or swap, and right-click an occupied slot to remove its upgrade. Slot polarities stay put; ranks, active stacks, and included/excluded settings move with the upgrade. Invalid drops leave the build unchanged. A slot's adjustment control edits its rank/polarity below the tray; clicking the slot opens the picker. Touch and keyboard users can use the picker, move, and remove controls. Actions jumps to capacity/build settings, Calculations to formulas, and Remove all clears this equipment's upgrades while preserving slot polarities. Configuration tabs select whole-arsenal builds; the plus duplicates the current build, and names remain editable. They do not represent in-game per-equipment configs or synchronization. Capacity shows remaining / total. The compact renderer adapts MIT-licensed Arsenyx code and uses local game textures and symbols; provenance and license are in [Arsenal sources](public/images/modding/SOURCES.md).
- Modding Calculator exposes formulas and contributing upgrades for direct damage, elemental combinations, critical tiers, multishot, reload, ideal DPS, neutral target armor, survivability, and generic ability costs. Missing stats stay unavailable. Unmodeled effects are labeled Partial / Reference only and listed beside results; they are not silently treated as simulated. Companions, Exalted equipment, Rivens, shards, set bonuses, Warframe passives, ability-specific damage, status damage, special enemy mechanics, and Incarnon evolutions are not simulated. Alternate attacks are separate components; beam, charge, burst, and alternate attacks have no sustained-DPS estimate. Values do not represent exact mission damage.
- Modding Calculator’s pinned snapshot shares the equipment catalog’s WFCD revision. Canonical mod paths exclude flawed/intermediate/Conclave variants and duplicate prototypes. Linear percentages use maximum effect × (rank + 1) / (maximum rank + 1), while descriptions retain source rounding. Rank 30 frame stats add published Update 34 rank bonuses to snapshot base stats; frames absent from that table require manual values. Later rank-bonus changes and weapon-specific exceptions need verification in-game. Base stats can be overridden explicitly; see Sources & model coverage in the workshop.
- WFM shows the median of up to five cheapest distinct online sellers, in platinum per item. Hover for statistics; click for history, platform/variant selection, and CSV. Prime equipment uses explicitly labeled sets/blueprints; relic refinements stay separate. Defaults to PC. [WFM API](https://docs.warframe.market/docs/api/overview/) requests share one queue, spaced at least one second apart, and a cache: catalog 24 hours, orders 5 minutes, history 1 hour. Production keeps that cache in Cloudflare and sends upstream reads through an authenticated Azure Function. Failures retain dated, marked stale prices; missing prices remain unknown. Closed history is user-reported, not verified sales.

## Maintain

```sh
npm run catalog:update    # Equipment, crafting metadata, and images
npm run catalog:update -- --pinned # Rebuild at the checked-in equipment revisions
npm run catalog:relics    # Official relics, rewards, sources, images; requires xz
npm run catalog:drop-art  # Reward/source artwork
npm run catalog:modder    # Mods, arcanes, Warframe base stats; pinned to equipment revision
npm run catalog:arsenal-art # Wiki portraits, official ability icons, UI textures; no stat changes
npm run catalog:arsenal-stats # Supplemental wiki weapon attributes; exact variants/attacks only
```

Relics use [Public Export](https://content.warframe.com/PublicExport/index_en.txt.lzma) and official drops; equipment uses community exports. Snapshots record sources and dates. Missing chances stay unknown; inconsistent published totals are shown unchanged. `src/data/reference.ts` is manually transcribed. Refreshes never change saved inventory.

- `src/App.tsx`, `src/components/`: interface and collection tables.
- `src/lib/`: models, recommendations, OCR, filtering, accounts, and persistence.
- `src/lib/modder.ts`, `src/lib/modderModel.ts`, `src/lib/modderUpgrades.ts`, `src/components/Modder.tsx`: calculation rules, bounded account saves, upgrade placement, and the workshop. Older clients preserve saved arsenals when omitting the new field; malformed replacements are rejected on both runtimes.
- `src/lib/arsenalStats.ts`, `src/components/ArsenalWeaponStats.tsx`: game-style weapon attribute presentation. `scripts/update-arsenal-stats.mjs` parses wiki data literals without executing Lua and generates `src/data/arsenalWeaponStats.json`, with pinned wiki revisions, source hashes, the matching catalog sources, and attribution under CC BY-NC-SA 3.0. Unknown variants/attacks do not borrow attributes from similar equipment.
- `server/`, `vite.config.ts`: local accounts, drops, and WFM cache.
- `cloudflare/`, `azure/`, `infra/cloudflare/`: hosted runtime, WFM relay, and [deployment/recovery](infra/cloudflare/README.md).
- `tests/`: unit, browser, and Cloudflare checks.

[Equipment sources/licenses](public/images/SOURCES.md) · [Drop artwork](public/images/drops/SOURCES.md) · [Screenshots](public/images/import/SOURCES.md) · [Icons](src/assets/warframe/SOURCES.md)

Independent fan tool; not affiliated with Digital Extremes.
