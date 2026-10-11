# Screenshot examples

`inventory-weapons.png` is the user's unmodified 1920 × 1200 Warframe Inventory/Sell screenshot, supplied on 2026-10-10 for the Inventory import instructions. It is bundled locally and is never automatically imported into an inventory. Game artwork belongs to Digital Extremes.

`codex-weapons.png` is the user's unmodified 1920 × 1200 Warframe Codex screenshot, supplied on 2026-10-11 for the Codex source chooser, instructions, and recognition testing. It shows 32 named cards, all with mastery laurels. It is bundled locally and is never automatically imported. Game artwork belongs to Digital Extremes.

`src/data/codex-mastery-mask.json` records a 32 × 32 binary shape mask from the Afuris laurel in that Codex screenshot. Its metadata records the original 34 × 34 crop at (241, 206). The crop was resampled with Canvas 2D; mask pixels select green > 150, green > red × 1.15, and blue > red × 1.05. The reader compares both the laurel and its empty space at nearby card-relative positions and scales. It does not match the equipment artwork or hard-code the example's weapon names.
