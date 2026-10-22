# Cloudflare deployment

Terraform manages [grakata.com](https://grakata.com): Worker/assets, D1 accounts, Durable Objects, migrations, schedules, routing, DNS, an Azure WFM relay, and private R2 state. Deploy only through Terraform; no dashboard creation or `wrangler deploy`. Local and hosted accounts remain separate.

## Setup

Run from the repository root inside `node-dev`; requires Node, npm, and Python 3. `npm ci` installs build tools; the Terraform wrapper downloads and checksum-verifies its pinned version.

Set `CLOUDFLARE_API_TOKEN` in ignored `.env` or the environment. Required permissions:

- Account: Workers Scripts, D1, Workers R2 Storage — Edit.
- Zone: Zone — Read; DNS, Workers Routes, Zone Settings — Edit.

Scope the token to the deployment account and `grakata.com`. The wrapper discovers IDs and derives R2 credentials; optional paired overrides are documented in [`.env.example`](../../.env.example).

[GitHub Actions](../../.github/workflows/deploy.yml) tests and deploys pushes to `main` or manual runs on that branch. It requires the `CLOUDFLARE_API_TOKEN` repository secret and a public repository. Manage GitHub secrets and authenticated pushes on the host; never forward GitHub credentials into the box or shared checkout. Pass secret values through stdin, never arguments or logs.

Azure uses the `Azure for Students` subscription and the dedicated `warframe-toolkit-wfm` resource group in East US. For local Terraform, install the Azure CLI inside the box, sign in, and set `ARM_SUBSCRIPTION_ID` to the intended subscription. Keep the Azure session outside the checkout. The subscription must already have `Microsoft.Web`, `Microsoft.Storage`, and `Microsoft.ManagedIdentity` registered; CI deliberately does not register providers.

Terraform creates a managed deployment identity with Contributor access only to that resource group. GitHub uses OIDC for the repository's `production` environment, whose deployment branch policy allows only `main`; set repository variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` from the corresponding Terraform outputs after the first local apply. No Azure client secret is required. The host agent manages these GitHub variables and the environment's branch policy.

The trust record includes GitHub's immutable owner/repository IDs. Before changing it after a rename or transfer, read the exact `sub_claim_prefix` with `gh api repos/KianBahasadri/warframe-toolkit/actions/oidc/customization/sub` on the host, then append `:environment:production`. CI verifies the actual GitHub-to-Azure token exchange and resource-group access before running tests; a trust mismatch fails immediately. [GitHub's immutable subject format](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/) explains the identifiers.

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

CI uses [`scripts/deploy.mjs`](../../scripts/deploy.mjs), which requires existing production state, rejects infrastructure deletion/replacement, and verifies the live release, frontend, guest account endpoint, and WFM catalog/orders/history through the deployed proxy. WFM checks reject stale or missing data and retry twice at 30-second intervals before failing the run. Run `node scripts/check-market.mjs` to repeat only the live WFM check. It serializes applies; retain its guards.

## Recovery and changes

- Authoritative state: R2 `warframe-toolkit-terraform/production/terraform.tfstate`. Use normal `init`, not migration/bootstrap. Keep `backend.tf` and locking enabled; force-unlock only after the owning process stops.
- Missing state: stop deployments and restore a verified backup or import existing resources. Never substitute stale local state or recreate the database.
- Append numbered SQL migrations in `cloudflare/migrations/`; never rewrite applied migrations. Roll back by rebuilding a known-good commit and reviewing its Terraform plan, preserving D1 and schema compatibility.
- Durable Object namespaces already exist at tag `v1`. Preserve both migration tags; do not replay creation or recreate namespaces to fix errors.
- Before decommissioning, apply cron `schedules = []`; deleting the cron resource alone does not remove schedules.

Drop updates run hourly, retry after five minutes, and retain cached data on failure. Initial schedule propagation may delay availability; page reads never trigger upstream updates.

WFM reads use the separate `wfm` object in the existing `DROPS` namespace for shared pacing and cached public prices. Requests are spaced at least one second apart, honor upstream rate-limit backoff across restarts, and coalesce duplicate reads. No WFM credentials or new namespace migration are needed.

WFM challenges requests originating from Cloudflare, including descriptive, conservatively paced API requests. Production therefore sends only upstream reads through the Terraform-managed Azure Consumption Function. Its private function key becomes a Worker secret binding; the browser never receives it. The relay allows only catalog, orders, and history paths, forwards an explicit header allowlist, bounds response sizes, refuses redirects, and preserves upstream status/Retry-After/challenge headers. Public callers cannot use it as an open proxy. Local development still contacts WFM directly.

`npm run build:cloudflare` also builds the Node 24 relay package. Its reproducible ZIP filename includes the content hash so Terraform updates changed code and leaves unchanged packages alone across machines. The Windows Consumption (Y1) Function scales to zero, allows one instance, and has an Azure-enforced daily quota of 5,000 GB-seconds. It has no Application Insights resource or built-in invocation logging. At the published Consumption compute rate of $0.000016/GB-second, exhausting that quota for all 31 days is about $2.48 in execution time before grants/credits. This is not a total Azure bill cap: storage, invocations, and network usage are separate. See [Functions pricing](https://learn.microsoft.com/azure/azure-functions/pricing).

The Worker additionally limits relay traffic to 2,000 requests and 100 MB per UTC day, shared across all visitors and persisted across restarts. Each request reserves its maximum 12 MB response before contacting Azure; completed reads return unused bytes, while timeouts keep the reservation. Exhausted limits retain dated, stale prices and stop further Azure requests until the next UTC day. These limits live in `server/marketRelayBudget.ts`; storage failures stop requests too. They bound normal app traffic to 62,000 invocations and 3.1 GB/month, separate from deployment/host overhead. Normal small-site usage should cost substantially less than the execution quota ceiling; check actual subscription charges rather than assuming student credits include the paid-plan free grants.

The deployment guard rejects changing the Azure plan away from Y1, enabling always-on execution, increasing the instance limit, or removing/raising the compute quota. Review the cost implications before intentionally changing those guards.

The deployed WFM check above exercises catalog, orders, and history through the public application routes, rejecting challenges, missing data, and stale cached successes. Unit and Cloudflare runtime tests additionally exercise relay routing, credential isolation, response limits, pacing, and failure handling. A future WFM restriction on Azure will fail this live check too; the relay does not solve browser challenges.

Review [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) for current quotas and charges.
