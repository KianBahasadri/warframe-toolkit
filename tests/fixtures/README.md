# Inventory OCR fixtures

Both images are unmodified 1920 × 1200 English Warframe Inventory/Sell screenshots supplied by the user on 2026-10-10. Game artwork belongs to Digital Extremes. They are read locally during browser tests, never uploaded.

- `public/images/import/inventory-weapons.png` is shared with the illustrated import instructions. Its 17 fully readable labels all show rank 30. The next row has no visible names and must not produce matches.
- `inventory-weapons-bottom.png` has 20 readable labels. Vasto is rank 0; the other 19 are rank 30.

`inventory-screenshots.json` is the manually checked ground truth, independent of OCR output. Browser tests require every listed name, exact variant, and rank, with no extra matches; they also check review, mastery, repeated screenshots, and persistence. These samples do not establish accuracy for other themes, resolutions, languages, or Arsenal layouts.
