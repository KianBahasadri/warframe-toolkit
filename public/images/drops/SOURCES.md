# Drop card artwork

These are unmodified Warframe game images, bundled for local browsing. Game artwork belongs to Digital Extremes. This independent fan tool is not affiliated with Digital Extremes.

Item illustrations and renders come from [WFCD/warframe-items](https://github.com/WFCD/warframe-items). Enemy, resource, component, and environment images come from the game archive at [browse.wf](https://browse.wf/), with names and image paths resolved through [warframe-public-export-plus](https://github.com/calamity-inc/warframe-public-export-plus). Source catalogs use the same pinned revisions as `src/data/catalog.json`.

`sources.json` records the original URL and SHA-256 fingerprint of every image used by the drop artwork manifest, including reused files in `../equipment/`. Regenerate it with `npm run catalog:drop-art`; the generator downloads images without transforming them and removes obsolete generated image files. Curated environment mappings are maintained in `scripts/drop-art-scenes.mjs`.

Matching uses exact published names. Blueprint images use an explicit recipe-to-result relationship. Shared component and relic-era renders reflect the source game's artwork. Mission and location scenes illustrate their named environment. New or unmatched names show an explicit unavailable state rather than an unrelated substitute. The manifest contains artwork mappings only, with no drop rates or saved inventory.

Data/code licenses are in `src/data/CATALOG-LICENSE.txt` and `src/data/GAME-EXPORT-LICENSE.txt`; they do not transfer ownership of the game artwork.
