# Cloudflare deployment

Terraform is the deployment entry point. It owns the Worker code, static assets,
D1 database, ordered SQL migrations, SQLite Durable Object namespaces, schedule,
Worker route, apex DNS record, HTTPS redirect setting, and disabled workers.dev
URLs. Do not use `wrangler deploy` or create these resources in the dashboard.

The target is https://bahasadri.com. The existing proxied CNAME and HTTPS setting
are adopted with Terraform import blocks, without changing their values. The
Worker route serves every path without using the tunnel as an origin. Other
databases, DNS records, and applications in this Cloudflare account are untouched.

## Deploy

Run inside the Linux development box, from the repository root. Requires Node,
npm and Python 3. `npm ci` installs the pinned build tools; the wrapper downloads
Terraform 1.16.5 from HashiCorp and verifies its published SHA-256 checksum.
The committed provider lock pins Cloudflare 5.27.0.

Put `CLOUDFLARE_API_TOKEN=...` in private, ignored `.env`, or export it in the
environment. The token needs Account **Workers Scripts: Edit**, **D1: Edit**;
Zone **Zone: Read**, **DNS: Edit**, **Workers Routes: Edit**, and **Zone Settings:
Edit**, restricted to the deployment account and `bahasadri.com`. The wrapper
discovers the account and zone IDs without printing credentials. Terraform's
provider reads the token from the environment, not a state-backed variable.

```sh
npm test
npm run test:cloudflare
CHROMIUM_PATH=/path/to/chromium WARFRAME_TEST_BACKEND=cloudflare npm run test:browser
npm run build:cloudflare
npm run infra -- init -input=false
npm run infra -- validate
npm run infra -- plan -out=deploy.tfplan
npm run infra -- apply deploy.tfplan
npm run infra -- plan -detailed-exitcode  # 0 means no drift
```

Review the saved plan before applying it. Keep the build unchanged between plan
and apply. Terraform uploads `dist/` through the Cloudflare provider and deploys
`build/cloudflare/worker.js`. Neither directory contains credentials or account
data. The release identifier derives from the built artifacts.

Schema files in `cloudflare/migrations/` run before Worker deployment. Append a
new numbered migration for schema changes; never rewrite an applied migration.
Terraform invokes `scripts/cloudflare-migrate.mjs`, which supplies its D1 ID to a
temporary Wrangler config and applies pending migrations with rollback on error.
Wrangler only executes SQL here. It does not create infrastructure or deploy code.
Changes to schema files or the migration runner retrigger this step.

The two SQLite Durable Object namespaces were created in migration `v1`.
Normal updates send `old_tag = "v1"` and `new_tag = "v1"` without creation
steps. The provider replays the migrations block on every Worker upload, so
leaving initial `new_sqlite_classes` declarations there breaks subsequent
deployments. Treat future namespace changes as explicit Terraform migrations;
never recreate a namespace to fix a migration-tag error.

## Automatic deployment

`.github/workflows/deploy.yml` runs on every push to `main` and can also be run
manually from that branch. It uses a standard `ubuntu-24.04` runner, pinned
checkout/setup actions, Node 26.11.1, and `npm ci`. Unit tests, Cloudflare runtime
tests, local account browser tests, the full D1 browser suite, and the production
build must all pass before deployment credentials are provided to the deploy
step. No build artifacts, state, or plans are uploaded to GitHub storage.

`scripts/deploy.mjs` initializes the remote backend, checks that state contains
the existing production identities, validates Terraform, then plans and applies
the exact saved plan. Infrastructure deletion or replacement stops automatic
deployment; SQL migration runner replacements are allowed. It checks the live
release, frontend, and guest account endpoint after applying. GitHub serializes
deployments without interrupting an active apply; the remote state lock also
coordinates with local Terraform runs. Multiple queued pushes can coalesce to
the latest pending commit, so intermediate commits are not guaranteed a separate
deployment. Local commits alone do not trigger a deployment.

**Activation is pending:** GitHub CLI authentication is not available in this
development box, the current Cloudflare token lacks R2 access, and state is still
local. The workflow and R2 configuration are prepared, but automatic production
deployment has not been enabled or run on GitHub. Do not push an active deployment
workflow expecting it to work until the following state migration is complete.

The R2 option is defined in `state.tf.example` and `backend.tf.example`. It uses
one private Standard-storage bucket, with public `r2.dev` access disabled and
Terraform `prevent_destroy`. All infrastructure is created through Terraform.
No paid Workers or D1 subscription is enabled by these files.

1. Accept R2's possible overage billing and enable R2 on the Cloudflare account.
   Add Account **Workers R2 Storage: Edit** to the scoped Cloudflare token in
   `.env`. Do not create the bucket manually.
2. Copy `state.tf.example` to `state.tf`, review a normal Terraform plan, and apply
   it using the existing local state. This creates the private state bucket.
3. Create R2 **Object Read & Write** credentials scoped only to
   `warframe-toolkit-terraform`. Add the access key ID as `AWS_ACCESS_KEY_ID` and
   secret access key as `AWS_SECRET_ACCESS_KEY` to private `.env`. These variable
   names come from Terraform's S3 backend; no Amazon account is involved.
4. Keep a private backup of the existing local state. Copy `backend.tf.example`
   to `backend.tf`, then run `npm run infra -- init -migrate-state` and confirm
   migration of that existing state to the new bucket. Do not use `-reconfigure`
   to migrate and do not start from empty state. Run a plan to verify no changes.
   Commit both activated `.tf` files. Never commit credentials, state or plans.
5. Authenticate `gh auth login --scopes workflow` inside `node-dev`. The workflow
   declares the `production` environment and limits deployments to `main` in
   the public repository. Set these repository secrets from private input:
   `CLOUDFLARE_API_TOKEN`, `TERRAFORM_STATE_ACCESS_KEY_ID` (the R2 access key ID),
   and `TERRAFORM_STATE_SECRET_ACCESS_KEY` (the R2 secret access key).
6. Push to `main` and check the first workflow run and production verification.

The R2 S3 backend uses `use_lockfile = true`; do not disable locking to bypass a
failed deployment. Only force-unlock after confirming that the owning Terraform
process has stopped. R2 does not provide S3 object versioning: retain a private
state backup before manual infrastructure changes or recovery. Never store state
in a public repository, GitHub Actions artifact, or dependency cache.

**Costs:** this repository is public, so standard GitHub-hosted Actions runners
are [free](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
The workflow stops if the repository becomes private, since private repositories
have different billing. It does not configure paid runners or artifact/cache storage. R2
Standard includes 10 GB-month storage, 1 million Class A operations and 10 million
Class B operations monthly; this roughly 28 KB state should use a small fraction.
However, [R2 bills usage beyond its free allowance](https://developers.cloudflare.com/r2/pricing/)
and the allowance is shared across the account. It is not an unconditional
zero-billing guarantee. The existing app's Free-plan quotas are listed below.

See [Cloudflare's Terraform backend guide](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/)
and [Terraform state locking](https://developer.hashicorp.com/terraform/language/backend/s3#state-locking).

## Runtime and limits

Static assets use Workers Static Assets, with only `/api/*` invoking the Worker.
Accounts, session digests, and inventory/view profiles live in **D1**. Profiles
are split into rows below D1's 2 MB limit, retaining the local API's 10 MiB request
limit. A single transactional batch changes the revision and all profile chunks;
stale saves cannot delete or overwrite a newer revision. Corrupt or incomplete
profiles are preserved and reported as unavailable.

The `AccountGateway` SQLite Durable Object stores sign-in throttle counters and
coordinates account requests. It gives large JSON saves enough CPU time without
running them under the Free Worker's 10 ms CPU limit. D1 remains the account data
store. `DropTables` stores only the compressed public drop dataset and its fetch
metadata, below the per-row storage limit.

A cron clock ticks every five minutes to bootstrap and recover the updater.
An object alarm schedules each successful fetch one hour later; failed fetches
retry after five minutes. Both check the persisted due time and share an active
refresh, so clock ticks do not add extra upstream requests. Page reads never
start updates. The last successful fetch time survives restarts and failures.
New cron schedules can take [up to 15 minutes to propagate](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
then run on the next five-minute boundary. Until the first fetch, the drop
endpoint returns 503 with a retry interval. Other features work immediately.

This uses Free-compatible resources, without enabling a paid subscription. Free
quotas still apply: Workers and Durable Objects each allow 100,000 requests/day;
D1 allows 5 million rows read/day, 100,000 rows written/day and 5 GB total storage.
Static asset requests are free and unlimited. Keep an eye on usage if traffic
grows. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
and [static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

## State and recovery

Terraform state and saved plans are local, private and excluded from Git. Keep
a private backup of `infra/cloudflare/terraform.tfstate` and its backup file;
the local Git checkpoints do **not** back them up. Run one Terraform operation
at a time. There is no paid remote-state service configured. Losing state does
not delete cloud data, but requires importing the existing resources before
another deployment. Never solve a missing state file by recreating the database.

D1 and Worker resources have `prevent_destroy`; the existing apex record is
also protected. For rollback, rebuild a known-good Git commit and apply its
reviewed Terraform plan, retaining D1. Schema changes should remain backward
compatible. Before decommissioning, set the cron `schedules` to `[]` and apply:
the provider does not remove schedules when just deleting its cron resource.

Local development still uses `.data/accounts.sqlite` and `.cache/drop-tables.json`.
It needs no Cloudflare token. Local and hosted accounts are separate databases;
local accounts are not silently uploaded or merged. The first deployment found
no local accounts to migrate. Both local and hosted accounts use generated access keys.

Cloudflare regression tests use isolated Miniflare D1/object storage and never
touch the production database. Run `npm run test:cloudflare` for API, concurrency,
large-profile, restart, corruption, scheduled-refresh and conditional-read tests.
The browser suite can use either the Node backend or the Cloudflare backend via
`WARFRAME_TEST_BACKEND=cloudflare`.

Deployment verification on 2026-10-11 passed 67 Node tests, 4 Cloudflare runtime
tests, all 53 browser tests against D1, and 14 account browser tests against the
local Node server. Live HTTPS checks exercised account creation, saves, revision
conflicts, key replacement, and logout; the temporary account was removed. The
first scheduled production fetch loaded 43,367 entries at 22:21:11 UTC, and
conditional reads returned 304. Live desktop/mobile browsing, game artwork and
timezone display passed without JavaScript errors. A final Terraform plan
reported no changes.

The subsequent account cleanup passed 70 Node tests, 4 Cloudflare runtime tests,
53 D1 browser tests and 14 local account browser tests, plus the production build.
The account changes are live; desktop/mobile checks confirmed both guest account
buttons and direct signup, with no page errors. Terraform updated the Worker
without changing either Durable Object namespace ID, and a final plan reported
no changes. Actionlint, deployment-guard tests, and validation of the proposed
R2 configuration passed locally. A real GitHub workflow run remains pending the
activation steps above.
