# Fixtures

User-supplied English 1920 × 1200 screenshots; artwork © Digital Extremes. Tests process them locally. JSON expectations are manually checked, independent of OCR:

- `inventory-screenshots.json`: 37 names/ranks across two Inventory images; Vasto is rank 0, all others rank 30.
- `codex-screenshot.json`: 32 names/mastery laurels; establishes neither ownership nor rank.
- `relic-screenshot.json`: 20 relic names/refinements/counts. `relic-ocr-lines.json` retains OCR text/positions; the user's original image was removed after validation.

Browser tests require exact variants and no extra matches; cover review, duplicate imports, persistence, and a resized/offset Codex image with obscured/false badges. Other capture conditions remain unverified. [Screenshot/mask provenance](../../public/images/import/SOURCES.md).

Relic browser tests generate local images and check review, overlaps, guests, and preserving merges. To recheck the original 20-stack example, set `RELIC_SCREENSHOT_PATH` when running `npm run test:browser -- tests/browser/relicScreenshots.spec.ts`.

`drop-tables.html` uses synthetic sources/rates to test parsing, rotations, refinements, conditional odds, duplicates, and inert text. Browser tests add synthetic rows for scrolling/exports; no live reward database is bundled.

`wfm.ts` supplies synthetic items, orders, and history for pricing, variant isolation, caching, charts, and exports. No live prices or WFM user data are retained.
