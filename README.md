# Grakata

Warframe equipment, relic inventory, and official drop-table browser. React + TypeScript + Vite; no API key required. Screenshots stay in your browser.

## Run

Requires Node.js 22.18+ and npm. Develop inside `node-dev`; see [AGENTS.md](AGENTS.md).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Catalog browsing and OCR work offline; drop-table updates need internet.

```sh
npm test
npm run build
npm run test:browser  # /usr/bin/chromium, or set CHROMIUM_PATH
npm run preview      # Production build at http://127.0.0.1:4173
```

## Data

- Guests can browse and edit temporarily. Sign in to save equipment, relics, and views. Accounts use a Warframe username and generated access key; keep the key or personal bookmark. No email recovery.
- Local accounts live in `.data/accounts.sqlite`; stop the server before backing it up. `ACCOUNTS_DATABASE` overrides the path. Public hosting needs HTTPS and `ACCOUNTS_ORIGIN` set to the exact origin. Static hosting supports browsing and temporary edits only.
- Legacy browser saves remain available for explicit migration. Accounts never merge automatically. Ownership, mastery, and current rank are separate; all 14 spreadsheet fields are preserved.
- Imports require review and preserve planning fields, notes, and absent equipment. Inventory supplies ownership/rank; Codex supplies mastery, not ownership/rank. Variants remain distinct. Relics are entered manually.
- OCR tests cover two English 1920 × 1200 Inventory screenshots (37 names/ranks), one Codex screenshot (32 names/laurels), and a modified/resized Codex image. Other languages, themes, layouts, UI scales, and actual lower-resolution captures remain unverified. No equipment recognition from artwork or arbitrary custom names. See [fixtures](tests/fixtures/README.md).
- [Official drops](https://warframe.com/droptables) update hourly through the server; failures retain the cache and retry after five minutes. Published sources may be unavailable or outdated. Odds assume independent attempts, without squad, booster, or pity modifiers.

## Maintain

```sh
npm run catalog:update    # Equipment and images
npm run catalog:relics    # Relic names
npm run catalog:drop-art  # Reward/source artwork
```

Generated snapshots record source revisions. `src/data/reference.ts` is manually transcribed. Refreshes never change saved inventory.

- `src/App.tsx`, `src/components/`: interface and collection tables.
- `src/lib/`: models, recommendations, OCR, filtering, accounts, and persistence.
- `server/`, `vite.config.ts`: local accounts and drop cache.
- `cloudflare/`, `infra/cloudflare/`: hosted runtime and [deployment/recovery](infra/cloudflare/README.md).
- `tests/`: unit, browser, and Cloudflare checks.

[Equipment sources/licenses](public/images/SOURCES.md) · [Drop artwork](public/images/drops/SOURCES.md) · [Screenshots](public/images/import/SOURCES.md) · [Icons](src/assets/warframe/SOURCES.md)

Independent fan tool; not affiliated with Digital Extremes.
