# Arsenal · Warframe Toolkit

A local browser app for tracking Warframe equipment using the fields from your spreadsheet, plus relic quantities. Built with React, TypeScript, and Vite. No account, backend, paid service, or API key is required.

## Run

Requires Node.js 22.18+ and npm.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Keep using the same hostname and port: browser storage belongs to that origin. `localhost` and `127.0.0.1` have separate inventories.

```sh
npm run build       # Production files in dist/
npm run preview     # Preview the production build on port 4173
npm test            # Matching, import merging, backup validation, CSV tests
npm run test:browser
```

Browser tests use an installed Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` for another location. The production build can be served from the root of any static host. OCR assets are copied locally during `npm install` and included in `dist/`; screenshots never leave the browser. HTTPS or localhost is required for browser APIs such as `crypto.randomUUID`.

## Inventory

The initial inventory transcribes **35 visible weapon rows** from the supplied reference image. It is a partial transcription, not the entire spreadsheet. Hidden rows are not available. It includes the visible ownership, mastery, and planning flags as supplied, not independently verified gameplay advice.

All 14 spreadsheet fields are stored: Owned, Weapon Name, Don't Keep, Crafting Ingredient, Crafting Target, Variant, Incarnon, Quest Weapon, Upgraded, Mastered, Meta / Powerful, Slot, Has Prime Variant, and Override. Rank, notes, source, and modification time are also retained. The same fields support Warframes, primary/secondary/melee weapons, Archguns, and Archmelee equipment.

- Ownership and mastery checkboxes save immediately. Select a name to edit every field.
- Search names, crafting targets, and notes; filter by slot or status.
- **All 14 fields** switches to the full spreadsheet view.
- Sort by multiple columns; repeated header clicks cycle ascending, descending, and unsorted.
- The override takes precedence over the Don't Keep checkbox. No item is automatically marked safe to sell.
- Catalog suggestions can be replaced with a custom item name when adding equipment.

## Relics

The **Relics** tab tracks each name and refinement as a separate stack, with a quantity and notes. It starts empty. Add names using the bundled catalog suggestions or enter an era and code manually. Use the quantity buttons for immediate changes, or select a name to edit or remove its stack. A quantity of zero keeps the entry and notes; **Owned only** hides zero quantities.

Search names and notes, filter by era or refinement, and sort columns. **Export CSV** on this tab exports the relic collection. The catalog contains 798 names from [WFCD/warframe-items](https://github.com/WFCD/warframe-items), refreshed with `npm run catalog:relics`. Relics are currently entered manually; screenshot import handles equipment only.

## Screenshot import

1. Open **Screenshot import** and choose Inventory or Arsenal.
2. Drop, paste, or browse for up to 10 English PNG, JPG, or WebP screenshots, each below 20 MB and 32 megapixels.
3. Text recognition starts automatically. Review matched names, ownership, mastery, and rank before importing.
4. Correct a matched name with its dropdown, deselect unwanted results, and save the selected rows.

The reader uses [Tesseract.js](https://github.com/naptha/tesseract.js) entirely in the browser with a bundled English model. It matches names against 731 bundled equipment names from [WFCD/warframe-items](https://github.com/WFCD/warframe-items). `npm run catalog:update` refreshes that snapshot and its license; it never modifies your saved inventory.

Recognition is a starting point for review. This version has been tested against a synthetic equipment screenshot; actual user inventory/Arsenal screenshots are still needed to tune it to the in-game layout. It does not recognize checkmark icons, equipment pictures, or arbitrary custom weapon names. Prime and other variants are matched separately. Blueprint/component lines are excluded; uncertain fuzzy matches are not selected automatically.

Inventory matches initially count as owned; Arsenal matches require ownership review. Rank and explicit “Mastered” text are read only when they appear on the same line as one matched item. Rank 30, “MAX,” or a nearby mastery icon does not imply full mastery. No absence in a screenshot clears prior ownership or mastery.

Repeated names merge into existing entries. Imports preserve keep preferences, crafting notes, Incarnon flags, upgrade status, and all other planning fields. A new observed rank may decrease after Forma. Screenshot files are kept only in the current import view, not in persistent storage. Import history stores filenames and counts.

## Backups and storage

Equipment, relics, and import history are stored in `localStorage` under `warframe-toolkit.inventory.v1`, with a versioned, validated JSON schema. Older saves and backups without relic data load with an empty relic collection and preserve all equipment fields. Browser clearing, changing origin, or switching devices will not carry inventory over automatically.

Open **Data & backups** through **Search and commands → Jump to… → Data & backups**, or press **Alt+3**, then choose **Download JSON** for a full backup, including relics. Restoration previews the equipment and relic stack counts and downloads the previous inventory before replacing it. Invalid backups are rejected. **Download CSV** exports the original equipment spreadsheet columns plus rank and notes; relic CSV is available on the Relics tab. User text is escaped and formula-like values are neutralized for spreadsheet use.

Unparseable existing storage is preserved instead of silently resetting it. The error panel can export the original data for recovery. Cross-tab updates are reflected in other open copies.

## Code map

- `src/App.tsx`: navigation, persistence, and inventory operations.
- `src/components/`: inventory table, equipment editor, import review, backups, command palette.
- `src/assets/warframe/`: bundled in-game tab icons; original asset links and attribution are in [SOURCES.md](src/assets/warframe/SOURCES.md).
- `src/lib/model.ts`: equipment schema and conservative import merging.
- `src/lib/relics.ts`: relic schema, name normalization, and validation.
- `src/lib/matching.ts`: exact/fuzzy name matching and same-line observations.
- `src/lib/ocr.ts`: local OCR worker lifecycle and image preparation.
- `src/lib/storage.ts`: backup validation and spreadsheet export.
- `src/data/reference.ts`: manually transcribed reference rows.
- `src/data/catalog.json`: generated equipment catalog; attribution in `CATALOG-LICENSE.txt`.
- `src/data/relics.json`: generated relic name catalog, using the same attribution.
- `scripts/`: catalog updates and local OCR asset preparation.

This is an independent fan tool, not affiliated with Digital Extremes.
