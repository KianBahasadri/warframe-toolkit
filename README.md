# Arsenal · Warframe Toolkit

A local browser app for tracking Warframe equipment using the fields from your spreadsheet, relic quantities, and searching the official live drop tables. Built with React, TypeScript, and Vite. No account, paid service, or API key is required. Inventory, relics, and screenshot recognition work offline; the Drop Tables tab needs an internet connection.

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
npm test            # Catalog, drop-table parsing, filtering, OCR matching, storage and CSV tests
npm run test:browser
```

Browser tests use an installed Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` for another location. Both `npm run dev` and `npm run preview` provide the live `/api/droptables` endpoint automatically. The official website does not allow direct cross-origin browser requests, so this fixed-source endpoint retrieves and parses its public HTML on the local server. Static hosting alone supports the inventory, relics, and OCR features; deployed Drop Tables also needs the same-origin endpoint from `server/dropTables.ts`. OCR assets are copied locally during `npm install` and included in `dist/`; screenshots never leave the browser. HTTPS or localhost is required for browser APIs such as `crypto.randomUUID`.

To run the same browser checks in Firefox, install its Playwright build with `npx playwright install firefox`, then run `WARFRAME_TEST_BROWSER=firefox npm run test:browser`.

## Inventory

The initial inventory transcribes **35 visible weapon rows** from the supplied reference image. It is a partial transcription, not the entire spreadsheet. Hidden rows are not available. It includes the visible ownership, mastery, and planning flags as supplied, not independently verified gameplay advice.

All 14 spreadsheet fields are stored: Owned, Weapon Name, Don't Keep, Crafting Ingredient, Crafting Target, Variant, Incarnon, Quest Weapon, Upgraded, Mastered, Meta / Powerful, Slot, Has Prime Variant, and Override. Rank, notes, source, and modification time are also retained. The same fields support Warframes, primary/secondary/melee weapons, Archguns, Archmelee, companion and exalted weapons, Kitguns, and Amps.

**Alt+1**, **Alt+2**, **Alt+3**, and **Alt+4** switch to Weapons, Warframes, Relics, and Drop Tables, matching the tab order. **Alt+I** opens screenshot import. Shortcuts are paused while editing a field or using a dialog.

- Ownership and mastery checkboxes save immediately and remain independent of rank. Select a name for **Weapon details** or **My inventory**.
- Weapons starts with **Owned only** checked under **Filters**. Uncheck it to browse the entire catalog, including unowned weapons. Browsing never adds catalog entries to your save. Checking ownership or saving an inventory edit adds only that weapon.
- Search names, crafting targets, notes, weapon types, tags, and quest names. Open **Filters** to choose slot, Incarnon status, weapon type, variant, mastery, quest rewards, crafting use, Foundry recipes, Prime counterparts, vault status, keep preference, and maximum required MR. With the panel closed, only controls changed from their defaults remain visible. Returning a filter to its default hides it again; **Reset filters** restores the owned view.
- The default table shows the name and image, ownership, current rank, mastery, Incarnon status, upgrades, keep preference, and crafting target. Incarnon distinguishes native forms from Genesis compatibility. **Columns** adds or removes individual columns, including all 14 spreadsheet fields and notes; the name stays visible. **Reset to default** restores the starting columns. Column choices are remembered locally across Weapons and Warframes, separately from saved inventory. Slot appears under the name unless its own column is shown. Routine values and checkboxes use neutral colors.
- Left-click or right-click a column header to open its menu for sorting, sort priorities, filters, and adding/removing columns. **Enter**, **Space**, and **Shift+F10** also open the menu while the header is focused. Choose **Sort ascending**, **Sort descending**, or **Remove sort** in the menu. Sort by any number of columns; numbered arrows show their priorities. Changing direction keeps a column's priority, and **Sort priority** moves it earlier or later. Unknown ranks sort last in either direction.
- Column filters support text matching, yes/no and category choices, and rank comparisons or unknown ranks. Active filters appear above the table and remain visible if their column is hidden; select one to edit it or use its **×** to remove it. Matching controls in **Filters** replace the corresponding column filter, and **Reset filters** clears both kinds.
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

1. Open **Import screenshots**. **Inventory** and **Codex** have separate sections, supplied game examples, and **Instructions** buttons. Inventory shows equipment ownership and current ranks; Codex shows collection mastery. Select either example or its upload prompt to choose files. Both guides also link to their example at full size.
2. Drop or browse for English PNG, JPG, or WebP screenshots in the appropriate section, each below 20 MB and 32 megapixels. Before adding images, move the mouse over the left or right side of the page to highlight **Inventory** or **Codex**, then paste into the highlighted side. The highlight fills that side and partially slides the other side away. The first image finishes the slide, hides the other section, and expands the selected section to the full width. On narrow screens the sections stack and the highlight follows the pointer vertically. Keyboard focus on either upload area also selects it; Inventory is selected initially. Reduced-motion preferences disable the slide animation. Use **Add screenshots** to keep choosing, dropping, or pasting images into that batch, up to 10 images total. Images added while recognition is running are queued.
3. Text recognition runs in the background. The review list stays visible and editable, and new matches appear as each image finishes. Review matched names, ownership, mastery, and rank; finish or cancel reading before importing.
4. Correct a matched name with its dropdown, deselect unwanted results, and import the selected rows. The screenshot gallery stays visible and shows every image in the batch, including images still being read. Select a thumbnail to open the **Screenshot gallery** modal. Flip through all images using its previous/next buttons or the left/right arrow keys; Home and End jump to the first and last images. Escape or the close button returns to the review list.

Adding images preserves earlier matches, name corrections, ranks, and checkbox choices. Canceling recognition keeps completed matches and discards unread images so you can add them again. **Clear** restores both source choices; after importing, **Import more** also restores them for a fresh batch. Help dialogs never import their example image or change the source of an active batch. The examples are bundled in `public/images/import/`; provenance is recorded alongside them in `SOURCES.md`.

The reader uses [Tesseract.js](https://github.com/naptha/tesseract.js) entirely in the browser with a bundled English model. It matches names against the 805 bundled equipment names in the weapon database. `npm run catalog:update` refreshes that snapshot and its licenses; it never modifies your saved inventory.

Recognition is a starting point for review. Browser tests cover both supplied 1920 × 1200 Inventory/Sell screenshots: all 37 readable names, exact variants, and ranks (36 at rank 30, Vasto at rank 0). The supplied Codex screenshot is also tested against all 32 names and mastery laurels, including Braton and Braton Prime as separate entries. Tests cover a resized, offset Codex image with obscured and false badges, synthetic text, repeated images, review edits, and saving without losing planning fields or prior mastery. The original images and manually checked expectations are documented in `tests/fixtures/README.md`. Other game themes, UI scales, layouts, and actual lower-resolution captures still need testing. The reader does not identify equipment from its picture or recognize arbitrary custom names. Prime and other variants are matched separately. Blueprint/component lines are excluded; uncertain fuzzy matches are not selected automatically.

Inventory matches initially count as owned; Codex matches start with ownership unchecked. Codex card grids establish neither current rank nor ownership, so their ranks remain blank and existing saved ranks and ownership are preserved. The Codex reader locates aligned pale name strips and reads them apart from the artwork. It checks for the mint laurel's shape in each card's upper-right corner, relative to that card's size. A full progress bar or green patch alone does not establish mastery. This badge detector is limited to the supplied light-label/mint-badge appearance; other themes and uncertain or cut-off badges require manual review. Images without a recognized card layout fall back to text recognition, without badge inference.

Rank labels such as `[30]`, `[0]`, `RANK 30`, and `UNRANKED` are read alongside a single matched item. A wrapped Inventory rank must sit directly below one uniquely aligned name; bare digits also require neighboring bracketed card labels in the same row. Ambiguous associations are left blank. Two grayscale contrast passes improve generic text recognition over textured backgrounds without fixed card coordinates.

Reaching the catalog's maximum rank checks **Mastered**: normally 30, or 40 for weapons such as Paracesis, Kuva, Tenet, and Coda weapons. Modular equipment and Amps need separate mastery evidence because a rank label does not establish gilding; non-masterable entries are not marked mastered from rank or badges. Explicit same-line “Mastered” text and recognized Codex laurels also establish mastery. “MAX” or an unidentified icon alone is insufficient. Correcting a name recalculates automatic mastery unless you have set the checkbox yourself; changing rank retains mastery established by a Codex badge or explicit text. No absence, missing badge, or lower rank in a screenshot clears prior ownership or mastery.

Repeated names merge into existing entries. Imports preserve keep preferences, crafting notes, Incarnon flags, upgrade status, and all other planning fields. A new observed rank may decrease after Forma. Screenshot files are kept only in the current import view, not in persistent storage. Import history stores filenames and counts.

## Live drop tables

**Drop Tables** fetches [Warframe's official PC drop tables](https://warframe.com/droptables) when opened and on **Refresh** (**Alt+R**). There is no bundled drop-table snapshot, persistent response cache, or external proxy service. The server follows the official redirect chain, imposes a timeout and download limit, parses text without executing upstream HTML, and compresses the response. Concurrent requests share one retrieval. The browser keeps the most recent successful response only in memory so a failed refresh can retain it with a visible error and fetch timestamp. The publisher's update date and the retrieval time are shown separately. Other app features remain usable if the endpoint is offline.

- Start with **Mission type**, **Item**, **Location**, **Relic**, **Bounty**, or **Enemy / source**. Choose a group card to see its individual drops, then use the back button or browse choices to switch groups. Mission types group mission rewards; locations include missions and bounties with a published location. Item and source views include all categories. Relics group their refinements under one name, while each refinement, rotation, stage, and repeated reward keeps its own entry and chance.
- Search across rewards, sources, locations, rotations, and other text fields in the current browse view or group. Quoted phrases, exclusions, and field queries combine: `"nova prime" -refinement:intact chance:>=10`, `mission:survival rotation:c`, or `source:"heavy gunner" within:>30`. **Search help** lists all fields and numeric operators. Switching browse choices retains the search and filters.
- **Filters** offers searchable multiple selections for category, location, mission type, rotation, stage, relic era, refinement, and rarity, plus drop-chance ranges. Different fields combine with AND; selected values within a field combine with OR. Active filter chips remain visible when the panel closes.
- Group cards show counts and short previews; item cards show the highest individual published chance among their matching entries. **Sort by** switches between name order and drop chance in either direction. Group chance ordering follows the first matching entry in that sort order; rates are never added together. Individual cards emphasize the drop chance and show rotation, stage, refinement, and rarity where available.
- **Saved views** stores the browse mode, selected group, query, filters, sorting, and page size in `warframe-toolkit.drop-views.v1`. Existing table-era views and links still open their filters in the item browser, and their stored settings are retained. Unreadable saved views are preserved. **Copy view link** shares the current settings in the URL and retrieves fresh data when opened; it includes no inventory or drop-table rows.
- Open a reward card for the published rates, an independent-attempt odds calculator, source links, and buttons to browse the same reward or source. Up/Down and Home/End move between cards; Enter/Space opens details. New views offer 12, 24, 48, or 96 results per page; older saved page sizes remain supported. **Export CSV** (**Alt+E**) exports every matching entry in the current group or browse view, across all pages, with all fields. Percentages are raw numbers and unknown rates are empty.

The parser preserves mission rotations, bounty stages, relic refinements, and enemy/container table roll rates. Enemy reverse indexes repeat source indexes and are excluded when the corresponding source index exists; identical entries within a table remain separate. Drop chance is the within-table percentage multiplied by the source table's roll rate when separately specified. Rates above 100% indicate multiple rolls; their overall chance and calculator are left unavailable rather than assuming independence or a roll count. Unknown chances sort last in either direction. The official rarity label refers to the within-table rate.

Published PC tables may omit rewards or lag hotfixes, and a listed relic or source may be vaulted or inaccessible. Refresh retrieves the published document, not the game's current bounty/event rotation. The calculator assumes independent opportunities at the displayed source, rotation, and stage, with no squad, booster, or pity modifiers. Repeated entries are not automatically combined.

The full live page was tested during implementation on 2026-10-11: 43,367 source-index entries across 17 categories, no skipped reward rows, and 10,005 repeated reverse-index rows excluded. Counts will change with the upstream page. Automated tests use a small synthetic HTML fixture and mocked HTTP responses; no official dataset is checked into the repository.

## Storage and exports

Equipment, relics, and import history are stored in `localStorage` under `warframe-toolkit.inventory.v1`, with a versioned, validated JSON schema. Older saves without relic data load with an empty relic collection and preserve all equipment fields. Browser clearing, changing origin, or switching devices will not carry inventory over automatically.

**Export CSV** on Weapons or Warframes exports the original equipment spreadsheet columns plus rank and notes; the same action on Relics exports the relic collection. User text is escaped and formula-like values are neutralized for spreadsheet use.

Unparseable existing storage is preserved instead of silently resetting it. The error panel can export the original data for recovery. Cross-tab updates are reflected in other open copies.

## Code map

- `src/App.tsx`: navigation, persistence, and inventory operations.
- `src/components/`: inventory table, weapon filters and details, equipment editor, import review, relics, command palette.
- `src/components/ColumnPicker.tsx` and `src/lib/inventoryColumns.ts`: table column selection, default layout, and local display preferences.
- `src/components/ColumnMenu.tsx`, `src/components/TablePopover.tsx`, and `src/lib/tableView.ts`: column actions, bounded keyboard-accessible popovers, filter matching, and sorting priorities.
- `src/components/Select.tsx`: shared custom dropdowns with keyboard navigation, type-to-select, and viewport positioning; no native select popup or experimental picker CSS.
- `src/components/DropTables.tsx`, `DropBrowser.tsx`, `DropTableControls.tsx`, and `DropDetails.tsx`: live drop browsing, mode choices, group/reward cards, filters, saved/shared views, and odds calculator.
- `src/lib/dropExplorer.ts`: grouping and counts for the six browse modes, without merging entries or combining rates.
- `src/lib/dropTables.ts`: drop schema, query grammar, filtering, sorting, view validation, odds calculations, and CSV export.
- `src/lib/dropTableParser.ts`: streaming HTML parser for official reward hierarchies and conditional rates; used only on the server and in tests.
- `server/dropTables.ts` and `vite.config.ts`: fixed-source live fetch endpoint shared by development and production preview, with bounded downloads and concurrent-request sharing.
- `src/components/ScreenshotHelp.tsx`: source-specific screenshot instructions and local Inventory/Codex examples.
- `src/components/ScreenshotGallery.tsx`: screenshot modal with previous/next controls and keyboard navigation.
- `src/lib/weaponCatalog.ts`: catalog/inventory projection, combined filters, and safe catalog-entry ownership updates.
- `src/assets/warframe/`: bundled in-game tab icons; original asset links and attribution are in [SOURCES.md](src/assets/warframe/SOURCES.md).
- `src/lib/model.ts`: equipment schema and conservative import merging.
- `src/lib/relics.ts`: relic schema, name normalization, and validation.
- `src/lib/matching.ts`: full-label exact/fuzzy matching, rank association, and reviewable mastery observations.
- `src/lib/ocr.ts`: local OCR worker lifecycle and image preparation.
- `src/lib/codex.ts`: Codex name-strip location and conservative mastery-laurel matching, using the source-documented mask in `src/data/codex-mastery-mask.json`.
- `src/lib/storage.ts`: saved inventory validation and spreadsheet export.
- `src/data/reference.ts`: manually transcribed reference rows.
- `src/data/catalog.json`: generated equipment catalog; attribution in `CATALOG-LICENSE.txt`.
- `src/data/relics.json`: generated relic name catalog, using the same attribution.
- `scripts/build-catalog.mjs`: source normalization, recipes and reverse crafting dependencies, variant families, Incarnon and quest mapping.
- `scripts/update-catalog.mjs`: pinned source downloads and local image refresh; `catalog-supplements.mjs` holds sourced script-granted quest rewards.
- `scripts/`: also relic updates and local OCR asset preparation.

This is an independent fan tool, not affiliated with Digital Extremes.
