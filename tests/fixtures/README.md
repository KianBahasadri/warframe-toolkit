# Fixtures

User-supplied English 1920 × 1200 screenshots; artwork © Digital Extremes. Tests process them locally. JSON expectations are manually checked, independent of OCR:

- `inventory-screenshots.json`: 37 names/ranks across two Inventory images; Vasto is rank 0, all others rank 30.
- `codex-screenshot.json`: 32 names/mastery laurels; establishes neither ownership nor rank.

Browser tests require exact variants and no extra matches; cover review, duplicate imports, persistence, and a resized/offset Codex image with obscured/false badges. Other capture conditions remain unverified. [Screenshot/mask provenance](../../public/images/import/SOURCES.md).

`drop-tables.html` uses synthetic sources/rates to test parsing, rotations, refinements, conditional odds, duplicates, and inert text. Browser tests add synthetic rows for scrolling/exports; no live reward database is bundled.
