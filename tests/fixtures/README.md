# Screenshot OCR fixtures

Both images are unmodified 1920 × 1200 English Warframe Inventory/Sell screenshots supplied by the user on 2026-10-10. Game artwork belongs to Digital Extremes. They are read locally during browser tests, never uploaded.

- `public/images/import/inventory-weapons.png` is shared with the illustrated import instructions. Its 17 fully readable labels all show rank 30. The next row has no visible names and must not produce matches.
- `inventory-weapons-bottom.png` has 20 readable labels. Vasto is rank 0; the other 19 are rank 30.

`inventory-screenshots.json` is the manually checked ground truth, independent of OCR output. Browser tests require every listed name, exact variant, and rank, with no extra matches; they also check review, mastery, repeated screenshots, and persistence.

`public/images/import/codex-weapons.png` is the user's unmodified 1920 × 1200 English Codex screenshot supplied on 2026-10-11, shared with the Codex chooser and instructions. `codex-screenshot.json` independently transcribes its 32 full names and 32 mastery laurels. Braton and Braton Prime both have badges; no current ranks or ownership are established by this screen. Browser tests check every name and badge, no extra matches, review edits across duplicate uploads, and preservation of saved ownership, current ranks, planning fields, and absent equipment. Another test obscures the Afuris laurel, replaces Akbolto's with a plain mint square, then resizes the image to 75% with an offset; neither changed card may be automatically marked mastered.

These samples do not establish accuracy for other themes, UI scales, languages, layouts, or actual lower-resolution captures. The resized test is derived from the original capture. The badge shape mask's provenance is recorded in `public/images/import/SOURCES.md`.
