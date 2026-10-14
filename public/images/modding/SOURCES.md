# Arsenal interface references and symbols

The upgrade layout follows the user's English 1920 × 1200 Arsenal / Nekros screenshots, supplemented by the Arsenal screenshot in Digital Extremes' [Mods Guide](https://www.warframe.com/en/news/mods-guide) and the [Mod Guide](https://support.warframe.com/hc/en-us/articles/200500194-Mod-Guide-Use-Fusion-Transmutation-Sale). References checked October 13, 2026. The supplied screenshots are visual references only and are not distributed with the application.

The layout uses gold controls on translucent charcoal/plum surfaces, an upper Aura/Exilus row, eight numbered slots in two rows, arcanes at the right, a left capacity/stats panel, and a two-row horizontal mod tray on desktop. The interface retains the calculator's existing model and whole-arsenal saves; it does not claim in-game configuration synchronization.

## Open-source renderer

The compact mod renderer in `src/components/ModderVisuals.tsx` and the matching styles in `src/components/Modder.css` adapt [Arsenyx](https://github.com/Reuzehagel/arsenyx) at revision [`de051e179996b9b39459e86f55036ea7361319c0`](https://github.com/Reuzehagel/arsenyx/tree/de051e179996b9b39459e86f55036ea7361319c0). Copyright (c) 2026 Reuzehagel, used under the [MIT license](../../licenses/arsenyx-MIT.txt).

Adapted upstream files:

- `apps/web/src/components/build-editor/mod-card-frame.tsx`: separate top/bottom frame layers, drain backer, and rank markers.
- `apps/web/src/components/build-editor/mod-card.tsx`: compact artwork crop, tint, and name placement.
- `apps/web/src/lib/mod-card-config.ts`: rarity colors and frame/backer selection, including Amalgam and Galvanized variants.

The original 184 × 64 compact frame with a 32px lower rim is laid out as a responsive 184 × 96 face. The adaptation uses this project's CSS and existing calculation data, without Arsenyx's Tailwind, view transitions, backend, or build schema.

The 24 WebP files in `frames/{common,uncommon,rare,legendary,amalgam,galvanized}/` are unmodified copies of the corresponding `apps/web/public/mod-components/` files at that revision: each rarity's `FrameTop`, `FrameBottom`, `TopRightBacker`, and `RankCompleteLine`. Amalgam and Galvanized use Silver drain backers. These are Warframe game textures © Digital Extremes; the MIT license covers the upstream implementation and does not transfer ownership of game artwork. They are served locally. Empty arcane sockets are a small, original SVG outline informed by the supplied screenshots.

## Other artwork and type

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
