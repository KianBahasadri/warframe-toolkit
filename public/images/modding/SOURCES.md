# Arsenal interface references and symbols

The upgrade layout follows the user's English 1920 × 1200 Arsenal / Nekros screenshots, supplemented by the Arsenal screenshot in Digital Extremes' [Mods Guide](https://www.warframe.com/en/news/mods-guide) and the [Mod Guide](https://support.warframe.com/hc/en-us/articles/200500194-Mod-Guide-Use-Fusion-Transmutation-Sale). References checked October 13, 2026. The supplied screenshots are visual references only and are not distributed with the application.

Gold controls on translucent charcoal/plum surfaces, an upper Aura/Exilus row, eight numbered slots in two rows, arcanes at the right, the left capacity/stats panel, metallic mod borders, upper-right drain/polarity markers, and blue rank pips are reproduced in CSS. The interface retains the calculator's existing model and whole-arsenal saves; it does not claim in-game configuration synchronization.

Unmodified polarity textures © Digital Extremes, downloaded from [the game asset index](https://browse.wf/Lotus/Interface/). Each filename below links to its original image.

| Local file | Polarity |
| --- | --- |
| [PolarityTriangle.png](https://browse.wf/Lotus/Interface/PolarityTriangle.png) | Madurai |
| [PolarityPoint.png](https://browse.wf/Lotus/Interface/PolarityPoint.png) | Vazarin |
| [PolarityCircle.png](https://browse.wf/Lotus/Interface/PolarityCircle.png) | Naramon |
| [PolarityMark.png](https://browse.wf/Lotus/Interface/PolarityMark.png) | Zenurik |
| [PolarityWard.png](https://browse.wf/Lotus/Interface/PolarityWard.png) | Unairu |
| [PolarityPrecept.png](https://browse.wf/Lotus/Interface/PolarityPrecept.png) | Penjaga |
| [PolarityUmbra.png](https://browse.wf/Lotus/Interface/PolarityUmbra.png) | Umbra |
| [PolarityUniversal.png](https://browse.wf/Lotus/Interface/PolarityUniversal.png) | Universal |
| [PolarityAura.png](https://browse.wf/Lotus/Interface/PolarityAura.png) | Aura slot |

Mod and arcane illustrations in `../mods/` are unmodified Warframe artwork © Digital Extremes. `npm run catalog:modder` obtains their rarity and artwork from the WFCD revision pinned in [modder.json](../../../src/data/modder.json), downloads each distinct source image from that revision's `data/img/`, and names it by the first 16 hex characters of its filename's SHA-256 hash. All images are served locally; no image service is contacted from the browser.

The title uses [Bebas Neue](https://github.com/google/fonts/tree/main/ofl/bebasneue), licensed under the [SIL Open Font License](../../fonts/OFL.txt), as a condensed display face. This is not the game's proprietary font.
