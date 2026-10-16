# Warframe Toolkit

Read [README.md](README.md) for setup, data semantics, and code locations.

- Commit completed work and useful checkpoints locally without waiting to be asked.
- Keep UI controls/data useful and copy minimal. Use player terms: equipment, rewards, sources, results; never “cards.” No slogans or decorative copy.
- Link relevant community guides only as footnotes in advanced info popups.
- Require no API key; keep screenshots in the browser.
- Guests browse/edit temporarily; saving requires an account using a Warframe username and server-generated access key, never a chosen password/email.
- Sign-in bookmarks carry keys only in URL fragments: consume/remove promptly; never store keys in browser storage or shared links. Preserve legacy saves for explicit migration; never merge accounts.
- Preserve all 14 spreadsheet fields; ownership, mastery, and current rank are independent. Imports preserve planning fields and notes. Never silently reset malformed saves.
- OCR requires review, exact variants, and no inference that missing equipment was sold. Keep README recognition limits accurate.
- Generate `src/data/catalog.json` with `npm run catalog:update` and `src/data/relics.json` with `npm run catalog:relics`. `src/data/reference.ts` is manual.
- After logic changes, run `npm test` and `npm run build`; also run `npm run test:browser` for import, persistence, or interaction changes. Use system Chromium or `CHROMIUM_PATH`.

## Environment

- Check `hostname`, `id`, and `pwd`. Run installs, tests, builds, and servers as `dev` inside `node-dev`, at `/home/dev/warframe-toolkit`. Report access failures; never fall back to the host or weaken isolation.
- Host entry: `dev`; environment docs: `~/dev-box`. Host `/home/kian/warframe-toolkit` and box `/home/dev/warframe-toolkit` share writable files.
- Keep GitHub authentication on the host. Never forward credentials into the box or store them in the checkout/`.env`. The user or host agent handles pushes and GitHub secrets; see [deployment](infra/cloudflare/README.md).
