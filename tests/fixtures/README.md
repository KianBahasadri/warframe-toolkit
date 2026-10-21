# Fixtures

User-supplied English 1920 × 1200 screenshots; artwork © Digital Extremes. Tests process them locally. JSON expectations are manually checked, independent of OCR:

- `inventory-screenshots.json`: 37 names/ranks across two Inventory images; Vasto is rank 0, all others rank 30.
- `codex-screenshot.json`: 32 names/mastery laurels; establishes neither ownership nor rank.
- `relic-screenshot.json`: 20 manually checked relic names/refinements/counts. `relic-grid.png` is the 1050 × 918 crop at (90, 190) of the user-supplied 1920 × 1200 capture from 2026-10-21; only the relic grid is retained, excluding the header/currencies. Artwork © Digital Extremes. Browser tests read the pixels without OCR mocks and require every field and selection to be correct, including quantity 1 with no badge.
- `relic-radiant-screen.png`: the second user-supplied 1920 × 1200 capture from 2026-10-21, with the same 20 expected stacks. Artwork polluted the whole-screen OCR boxes and inflated the estimated font height, merging all six Radiant name/refinement pairs. The full image is retained because cropping it changes OCR segmentation and hides this failure. Tests require correct names, refinements, quantities, and selections for every stack.
- `relic-ocr-lines.json` and `relic-ocr-browser-lines.json` retain earlier whole-screen OCR text/positions for fallback/geometry tests, including `Axi $21` / `Axi 521` misreadings and artwork noise. The new pipeline uses full-screen text for layout, then rereads individual regions from pixels.

Browser tests require exact variants and no extra matches; cover review, duplicate imports, persistence, and a resized/offset Codex image with obscured/false badges. Other capture conditions remain unverified. [Screenshot/mask provenance](../../public/images/import/SOURCES.md).

Relic browser tests also cover a 75% resized grid with an offset and JPEG quality 85, cropped quantity/refinement regions, synthetic gold/white text, a grid containing only singles, review, overlaps, guests, and preserving merges. To recheck the uncropped original 20-stack example, set `RELIC_SCREENSHOT_PATH` when running `npm run test:browser -- tests/browser/relicScreenshots.spec.ts`; the bundled pixel fixture runs by default.

`drop-tables.html` uses synthetic sources/rates to test parsing, rotations, refinements, conditional odds, duplicates, and inert text. Browser tests add synthetic rows for scrolling/exports; no live reward database is bundled.

`wfm.ts` supplies synthetic items, orders, and history for pricing, variant isolation, caching, charts, and exports. No live prices or WFM user data are retained.
