# Grakata

Warframe catalogs, inventory, crafting plans, and official drop tables. React + TypeScript + Vite; no API key required. Screenshots stay in your browser.

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

- Guests can browse and edit temporarily. Sign in to save equipment, relics, views, and crafting plans. Accounts use a Warframe username and generated access key; keep the key or personal bookmark. No email recovery.
- Local accounts live in `.data/accounts.sqlite`; stop the server before backing it up. `ACCOUNTS_DATABASE` overrides the path. Public hosting needs HTTPS and `ACCOUNTS_ORIGIN` set to the exact origin. Static hosting supports browsing and temporary edits only.
- Legacy browser saves remain available for explicit migration. Accounts never merge automatically. Ownership, mastery, and current rank are separate; all 14 spreadsheet fields are preserved.
- Imports require review and preserve planning fields, notes, and absent equipment. Inventory supplies ownership/rank; Codex supplies mastery, not ownership/rank. Relic screenshots replace selected quantities by exact name/refinement, preserving notes and other stacks. Overlaps never add counts; missing counts suggest an unchecked 1.
- OCR checked against English 1920 × 1200 Inventory (37 names/ranks), Codex (32 names/laurels), and Relics (20 names/refinements/counts), plus modified/resized Codex images. Other languages, themes, layouts, UI scales, and actual lower-resolution captures remain unverified. No equipment recognition from artwork or arbitrary custom names. See [fixtures](tests/fixtures/README.md).
- [Official drops](https://warframe.com/droptables) update hourly through the server; failures retain the cache and retry after five minutes. Published sources may be unavailable or outdated. Odds assume independent attempts, without squad, booster, or pity modifiers.
- Crafting covers catalog equipment and nested ingredients, with batch quantities, build costs/times, and sources. Checkmarks cover a component’s ingredients without changing inventory. Gather skips optional recipes; quantity changes reset progress. Credits exclude blueprint purchases; modular recipes cover components only.
- WFM shows the median of up to five cheapest distinct online sellers, in platinum per item. Hover for statistics; click for history, platform/variant selection, and CSV. Prime equipment uses explicitly labeled sets/blueprints; relic refinements stay separate. Defaults to PC. [WFM API](https://docs.warframe.market/docs/api/overview/) requests share a paced cache: orders 5 minutes, history 1 hour. Failures retain dated, marked stale prices; missing prices remain unknown. Closed history is user-reported, not verified sales.

## Maintain

```sh
npm run catalog:update    # Equipment, crafting metadata, and images
npm run catalog:relics    # Official relics, rewards, sources, images; requires xz
npm run catalog:drop-art  # Reward/source artwork
```

Relics use [Public Export](https://content.warframe.com/PublicExport/index_en.txt.lzma) and official drops; equipment uses community exports. Snapshots record sources and dates. Missing chances stay unknown; inconsistent published totals are shown unchanged. `src/data/reference.ts` is manually transcribed. Refreshes never change saved inventory.

- `src/App.tsx`, `src/components/`: interface and collection tables.
- `src/lib/`: models, recommendations, OCR, filtering, accounts, and persistence.
- `server/`, `vite.config.ts`: local accounts, drops, and WFM cache.
- `cloudflare/`, `infra/cloudflare/`: hosted runtime and [deployment/recovery](infra/cloudflare/README.md).
- `tests/`: unit, browser, and Cloudflare checks.

[Equipment sources/licenses](public/images/SOURCES.md) · [Drop artwork](public/images/drops/SOURCES.md) · [Screenshots](public/images/import/SOURCES.md) · [Icons](src/assets/warframe/SOURCES.md)

Independent fan tool; not affiliated with Digital Extremes.
