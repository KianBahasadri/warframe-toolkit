# Equipment images

These are unmodified Warframe game icons, bundled locally so catalog browsing does not contact a CDN. Game artwork belongs to Digital Extremes.

Most images come from [WFCD/warframe-items](https://github.com/WFCD/warframe-items/tree/4a73b2fb016d7a79ec0694aec42a66778d762288/data/img). The assembled Mote Amp icon comes from the game's export image index, mirrored at [browse.wf](https://browse.wf/Lotus/Interface/Icons/StoreIcons/Operator/Amps/SentTrainingAmpAssembled.png).

`src/data/catalog.json` records the exact `imageSource` URL for every item and pinned source revisions. `npm run catalog:update` refreshes the data and images together, validates PNG signatures, and reuses unchanged images. Shared icons, such as base and MK1 equipment, are stored once. Catalog tests verify that every entry has a local PNG.

The data/code licenses are in `src/data/CATALOG-LICENSE.txt` and `src/data/GAME-EXPORT-LICENSE.txt`; those licenses do not transfer ownership of the game artwork.
