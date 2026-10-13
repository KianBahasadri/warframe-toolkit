# Cloudflare deployment

Terraform manages [bahasadri.com](https://bahasadri.com): Worker/assets, D1 accounts, Durable Objects, migrations, schedules, routing, DNS, and private R2 state. Deploy only through Terraform; no dashboard creation or `wrangler deploy`. Local and hosted accounts remain separate.

## Setup

Run from the repository root inside `node-dev`; requires Node, npm, and Python 3. `npm ci` installs build tools; the Terraform wrapper downloads and checksum-verifies its pinned version.

Set `CLOUDFLARE_API_TOKEN` in ignored `.env` or the environment. Required permissions:

- Account: Workers Scripts, D1, Workers R2 Storage — Edit.
- Zone: Zone — Read; DNS, Workers Routes, Zone Settings — Edit.

Scope the token to the deployment account and `bahasadri.com`. The wrapper discovers IDs and derives R2 credentials; optional paired overrides are documented in [`.env.example`](../../.env.example).

[GitHub Actions](../../.github/workflows/deploy.yml) tests and deploys pushes to `main` or manual runs on that branch. It requires the `CLOUDFLARE_API_TOKEN` repository secret and a public repository. Manage GitHub secrets and authenticated pushes on the host; never forward GitHub credentials into the box or shared checkout. Pass secret values through stdin, never arguments or logs.

## Manual deployment

Use system Chromium or set `CHROMIUM_PATH`. Before applying changes, save `node scripts/terraform.mjs state pull` privately under `.data/terraform-backups/` (directory 700, files 600). Never commit/upload credentials, state, plans, or account data.

```sh
npm test
npm run test:cloudflare
WARFRAME_TEST_BACKEND=cloudflare npm run test:browser
npm run build:cloudflare
npm run infra -- init -input=false
npm run infra -- validate
npm run infra -- plan -out=deploy.tfplan
npm run infra -- show deploy.tfplan
# Review the plan; keep the build unchanged before applying.
npm run infra -- apply deploy.tfplan
npm run infra -- plan -detailed-exitcode  # 0: no drift
```

CI uses [`scripts/deploy.mjs`](../../scripts/deploy.mjs), which requires existing production state, rejects infrastructure deletion/replacement, and verifies the live release, frontend, and guest account endpoint. It serializes applies; retain its guards.

## Recovery and changes

- Authoritative state: R2 `warframe-toolkit-terraform/production/terraform.tfstate`. Use normal `init`, not migration/bootstrap. Keep `backend.tf` and locking enabled; force-unlock only after the owning process stops.
- Missing state: stop deployments and restore a verified backup or import existing resources. Never substitute stale local state or recreate the database.
- Append numbered SQL migrations in `cloudflare/migrations/`; never rewrite applied migrations. Roll back by rebuilding a known-good commit and reviewing its Terraform plan, preserving D1 and schema compatibility.
- Durable Object namespaces already exist at tag `v1`. Preserve both migration tags; do not replay creation or recreate namespaces to fix errors.
- Before decommissioning, apply cron `schedules = []`; deleting the cron resource alone does not remove schedules.

Drop updates run hourly, retry after five minutes, and retain cached data on failure. Initial schedule propagation may delay availability; page reads never trigger upstream updates.

Review [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) for current quotas and charges.
