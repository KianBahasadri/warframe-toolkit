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
npm test            # Catalog, filtering, matching, merging, storage and CSV tests
npm run test:browser
```

Browser tests use an installed Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` for another location. The production build can be served from the root of any static host. OCR assets are copied locally during `npm install` and included in `dist/`; screenshots never leave the browser. HTTPS or localhost is required for browser APIs such as `crypto.randomUUID`.

To run the same browser checks in Firefox, install its Playwright build with `npx playwright install firefox`, then run `WARFRAME_TEST_BROWSER=firefox npm run test:browser`.

## Inventory

The initial inventory transcribes **35 visible weapon rows** from the supplied reference image. It is a partial transcription, not the entire spreadsheet. Hidden rows are not available. It includes the visible ownership, mastery, and planning flags as supplied, not independently verified gameplay advice.

All 14 spreadsheet fields are stored: Owned, Weapon Name, Don't Keep, Crafting Ingredient, Crafting Target, Variant, Incarnon, Quest Weapon, Upgraded, Mastered, Meta / Powerful, Slot, Has Prime Variant, and Override. Rank, notes, source, and modification time are also retained. The same fields support Warframes, primary/secondary/melee weapons, Archguns, Archmelee, companion and exalted weapons, Kitguns, and Amps.

**Alt+1**, **Alt+2**, and **Alt+3** switch to Weapons, Warframes, and Relics, matching the tab order. **Alt+I** opens screenshot import. Shortcuts are paused while editing a field or using a dialog.

- Ownership and mastery checkboxes save immediately and remain independent of rank. Select a name for **Weapon details** or **My inventory**.
- Weapons starts with **Owned only** checked. Uncheck it to browse the entire catalog, including unowned weapons. Browsing never adds catalog entries to your save. Checking ownership or saving an inventory edit adds only that weapon.
- Search names, crafting targets, notes, weapon types, tags, and quest names. Combine slot and Incarnon filters with weapon type, variant, mastery, quest rewards, crafting use, Foundry recipes, Prime counterparts, vault status, keep preference, and maximum required MR. Reset filters restores the owned view.
- **All 14 fields** switches to the full spreadsheet view.
- Sort by multiple columns; repeated header clicks cycle ascending, descending, and unsorted.
- The override takes precedence over the Don't Keep checkbox. No item is automatically marked safe to sell.
- Known equipment gets its slot, variant, crafting targets, Incarnon eligibility, quest rewards, and Prime counterpart automatically. Those facts are read-only. Keep preferences, ownership, mastery, rank, upgrades, favorites, and notes remain personal.
- Catalog suggestions can be replaced with a custom item name when adding equipment. Custom items retain manual fields and an initials placeholder when no game image is known.

## Weapon database

The bundled snapshot contains **683 weapons** and **122 Warframe-category entries**, with **789 distinct local game images** shared by 805 entries. It includes weapon variants, Archguns/Archmelee, companion weapons, exalted weapons, seven modular Amp prisms plus Mote Amp and Sirocco, six Kitgun chambers, and Zaw strikes. Modular families represent their mastery-bearing part; arbitrary assembled combinations and custom names are not separate catalog entries.

Each weapon's details include its image and description, MR, unmodded stats and attack modes where exported, damage types, polarities, maximum rank, recipes, credit costs, materials and quantities, build times, and weapons that consume it. Expand a crafted material or weapon to inspect its component recipe. Recipe costs are per listed batch and do not include blueprint purchases or the cost of obtaining drops; ingredient recipes show their own costs. Identical required weapons are combined (for example, Aklex Prime consumes two Lex Primes), and base/Prime variants are not interchangeable.

Incarnon data distinguishes native transformations from Genesis compatibility and includes adapter installation materials and available attack-mode stats. Eligibility does **not** mean an adapter is installed. Evolution challenges and perk choices link to the corresponding wiki page. Quest data identifies weapon rewards separately from blueprint rewards. Acquisition includes exported drops, blueprint prices, market prices, and faction/vendor tags where available; it is not a complete live vendor inventory or event schedule.

Sources are [WFCD/warframe-items](https://github.com/WFCD/warframe-items) and the community-maintained [Warframe Public Export Plus](https://github.com/calamity-inc/warframe-public-export-plus), supplemented by sourced quest rewards in `scripts/catalog-supplements.mjs`. Every snapshot records pinned upstream revisions and its retrieval date. Images are served locally; attribution and download provenance are in [public/images/SOURCES.md](public/images/SOURCES.md). Browsing and filtering make no external requests. Wiki/source links open only when selected.

Run `npm run catalog:update` to regenerate the snapshot and images. It validates ingredient names and downloads all new or changed images before replacing the catalog; it never touches browser saves. Tests cover local image integrity, exact variant matching, recipes, Incarnon eligibility, quest rewards, filtering, and preservation of saved fields. Sources can lag game updates or omit details: absent recipes and drop locations are labeled as unrecorded, not free or unobtainable. Modular assembly stats depend on the chosen parts, and the assembled Mote Amp's stats are unavailable in these sources.

Existing saves retain all 14 original fields and historical planning values in browser storage. The UI and CSV exports overlay current catalog facts without rewriting those historical values in the saved JSON. New saved entries receive current catalog facts. Database updates never change ownership, mastery, current rank, keep decisions, upgrades, or notes.

## Relics

The **Relics** tab tracks each name and refinement as a separate stack, with a quantity and notes. It starts empty. Add names using the bundled catalog suggestions or enter an era and code manually. Use the quantity buttons for immediate changes, or select a name to edit or remove its stack. A quantity of zero keeps the entry and notes; **Owned only** hides zero quantities.

Search names and notes, filter by era or refinement, and sort columns. **Export CSV** on this tab exports the relic collection. The catalog contains 798 names from [WFCD/warframe-items](https://github.com/WFCD/warframe-items), refreshed with `npm run catalog:relics`. Relics are currently entered manually; screenshot import handles equipment only.

## Screenshot import

1. Open **Import screenshots**. **Inventory** and **Arsenal** have separate sections and **Instructions** buttons. The Inventory guide shows the supplied game screenshot, with a link to open it at full size.
2. Drop or browse for up to 10 English PNG, JPG, or WebP screenshots in the appropriate section, each below 20 MB and 32 megapixels. To paste, focus that section’s upload area first; pasting before choosing a section defaults to Inventory.
3. Text recognition starts automatically. Review matched names, ownership, mastery, and rank before importing.
4. Correct a matched name with its dropdown, deselect unwanted results, and import the selected rows. Expand **Screenshot preview** to compare them with the source image.

Finish or clear the current batch before starting another source. Help dialogs never import their example image or change the source of an active batch. The Inventory example is bundled at `public/images/import/inventory-weapons.png`; provenance is recorded alongside it in `SOURCES.md`.

The reader uses [Tesseract.js](https://github.com/naptha/tesseract.js) entirely in the browser with a bundled English model. It matches names against the 805 bundled equipment names in the weapon database. `npm run catalog:update` refreshes that snapshot and its licenses; it never modifies your saved inventory.

Recognition is a starting point for review. Tests cover synthetic equipment screenshots and the supplied real Inventory/Sell screenshot. That example still misses some fully visible names, and bracket-only rank labels such as `[30]` are not read as ranks. Real Arsenal screenshots and more Inventory layouts still need testing. The reader does not recognize checkmark icons, equipment pictures, or arbitrary custom weapon names. Prime and other variants are matched separately. Blueprint/component lines are excluded; uncertain fuzzy matches are not selected automatically.

Inventory matches initially count as owned; Arsenal matches require ownership review. Rank and explicit “Mastered” text are read only when they appear on the same line as one matched item. Rank 30, “MAX,” or a nearby mastery icon does not imply full mastery. No absence in a screenshot clears prior ownership or mastery.

Repeated names merge into existing entries. Imports preserve keep preferences, crafting notes, Incarnon flags, upgrade status, and all other planning fields. A new observed rank may decrease after Forma. Screenshot files are kept only in the current import view, not in persistent storage. Import history stores filenames and counts.

## Storage and exports

Equipment, relics, and import history are stored in `localStorage` under `warframe-toolkit.inventory.v1`, with a versioned, validated JSON schema. Older saves without relic data load with an empty relic collection and preserve all equipment fields. Browser clearing, changing origin, or switching devices will not carry inventory over automatically.

**Export CSV** on Weapons or Warframes exports the original equipment spreadsheet columns plus rank and notes; the same action on Relics exports the relic collection. User text is escaped and formula-like values are neutralized for spreadsheet use.

Unparseable existing storage is preserved instead of silently resetting it. The error panel can export the original data for recovery. Cross-tab updates are reflected in other open copies.

## Code map

- `src/App.tsx`: navigation, persistence, and inventory operations.
- `src/components/`: inventory table, weapon filters and details, equipment editor, import review, relics, command palette.
- `src/components/Select.tsx`: shared custom dropdowns with keyboard navigation, type-to-select, and viewport positioning; no native select popup or experimental picker CSS.
- `src/components/ScreenshotHelp.tsx`: source-specific screenshot instructions and the local Inventory example.
- `src/lib/weaponCatalog.ts`: catalog/inventory projection, combined filters, and safe catalog-entry ownership updates.
- `src/assets/warframe/`: bundled in-game tab icons; original asset links and attribution are in [SOURCES.md](src/assets/warframe/SOURCES.md).
- `src/lib/model.ts`: equipment schema and conservative import merging.
- `src/lib/relics.ts`: relic schema, name normalization, and validation.
- `src/lib/matching.ts`: exact/fuzzy name matching and same-line observations.
- `src/lib/ocr.ts`: local OCR worker lifecycle and image preparation.
- `src/lib/storage.ts`: saved inventory validation and spreadsheet export.
- `src/data/reference.ts`: manually transcribed reference rows.
- `src/data/catalog.json`: generated equipment catalog; attribution in `CATALOG-LICENSE.txt`.
- `src/data/relics.json`: generated relic name catalog, using the same attribution.
- `scripts/build-catalog.mjs`: source normalization, recipes and reverse crafting dependencies, variant families, Incarnon and quest mapping.
- `scripts/update-catalog.mjs`: pinned source downloads and local image refresh; `catalog-supplements.mjs` holds sourced script-granted quest rewards.
- `scripts/`: also relic updates and local OCR asset preparation.

This is an independent fan tool, not affiliated with Digital Extremes.
