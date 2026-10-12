# GitHub deployment handoff for the host agent

**Completed on 2026-10-12 UTC (2026-10-11 in America/New_York).** Existing host
authentication had repository administration and workflow access. The
`CLOUDFLARE_API_TOKEN` Actions secret was set through stdin without exposing its
value, and all 24 queued commits were pushed normally to `main` at
`de3aa2c2624e20f9b85bb91562a73cb7cb779504`.

[Workflow run 38194984853](https://github.com/KianBahasadri/warframe-toolkit/actions/runs/38194984853)
completed successfully, including the deployment and live release checks.
Independent host checks confirmed `/api/health` returned `status: "ok"` and
release `bc6a830913f7cb83`, the homepage loaded, and the guest account endpoint
returned `user: null`. GitHub credentials remained on the host. Automatic
deployment is active; the original handoff below is retained as a setup record.

The original task was to finish GitHub Actions activation for
`KianBahasadri/warframe-toolkit` from the host. The user authorized publishing
the workflow and deploying pushes to `main`, and explicitly requires GitHub
credentials to remain outside `node-dev`.

The host checkout is `/home/kian/warframe-toolkit`. It shares files with
`/home/dev/warframe-toolkit` inside the box, including Git history and the ignored
`.env`. Verify `hostname`, `id`, and `pwd` before working. Read `AGENTS.md` and
`infra/cloudflare/README.md`.

Keep GitHub authentication in the host's credential store. Do not forward an
agent/socket/token into the box, log in there, or store GitHub credentials in the
shared checkout, `.env`, a remote URL, or repository Git configuration. Host-side
work here is Git/GitHub administration. Dependency installs, project scripts,
tests and builds stay inside the box or run in GitHub Actions.

Original state at handoff:

- Repository: `https://github.com/KianBahasadri/warframe-toolkit.git`; branch `main`.
  Implementation is committed through `6007405`, followed by this documentation
  checkpoint. The local branch is ahead of `origin/main`; recheck after fetching.
- Production is live at `https://bahasadri.com`; last verified release
  `bc6a830913f7cb83`. The guest account and frontend checks passed.
- `.github/workflows/deploy.yml` is ready but has not run on GitHub. It tests and
  builds before invoking `node scripts/deploy.mjs`, which deploys with Terraform
  and verifies the live release. Pushes to `main` trigger it; local commits do not.
- R2 bucket `warframe-toolkit-terraform` already exists, is private, and is managed
  by Terraform. State is at `production/terraform.tfstate`. Migration preserved
  all ten resources and outputs; competing-process locking was verified.
- All 73 Node tests, the Cloudflare build, Actionlint and Terraform validation
  passed. The deployment command completed using R2 with a no-change plan.
- Only one GitHub Actions repository secret is required: `CLOUDFLARE_API_TOKEN`.
  Its existing value is in the checkout's private `.env`, and already has the
  required Cloudflare and R2 permissions. R2 credentials are derived internally;
  do not add separate AWS/R2 secrets.

Activation steps, completed in order:

1. Verify host GitHub access to this repository, including setting Actions
   secrets, pushing workflow changes, and reading workflow runs. Reuse existing
   host authentication. If needed, use
   `gh auth login --hostname github.com --git-protocol https --web --scopes workflow`
   on the host. For an existing OAuth login missing the workflow scope, use
   `gh auth refresh --hostname github.com --scopes workflow`. Keep credential
   helper configuration in the host's global configuration. See
   [GitHub CLI authentication](https://cli.github.com/manual/gh_auth_login).

2. Read only `CLOUDFLARE_API_TOKEN` from `.env` as data, without printing it or
   sourcing the file as shell code. Pass the value directly through stdin to
   `gh secret set CLOUDFLARE_API_TOKEN --app actions --repo KianBahasadri/warframe-toolkit`.
   Do not put the value in command arguments, logs, chat, or a new file. Verify
   the secret's name with `gh secret list --repo KianBahasadri/warframe-toolkit`.
   [The CLI accepts the value on stdin](https://cli.github.com/manual/gh_secret_set).

3. Review the working tree and outgoing commits. Fetch `origin/main` and confirm
   it is an ancestor of local `main` with
   `git merge-base --is-ancestor origin/main main`. If histories have diverged,
   preserve both sides and resolve that before proceeding. Push normally with
   `git push origin main:main`; never force-push or discard local work. Set the
   secret before pushing so the first deployment can succeed.

4. Find the run for the pushed commit:

   ```sh
   gh run list --repo KianBahasadri/warframe-toolkit --workflow deploy.yml --branch main --commit "$(git rev-parse main)" --json databaseId,headSha,status,conclusion,url
   ```

   Allow a short time for the push event to create the run. Watch the matching
   run with `gh run watch RUN_ID --repo KianBahasadri/warframe-toolkit --exit-status`,
   replacing `RUN_ID` with its actual ID. Inspect failures and fix the cause;
   do not bypass tests, state locking, or deployment guards. See
   [run filtering](https://cli.github.com/manual/gh_run_list) and
   [watching a run](https://cli.github.com/manual/gh_run_watch).

5. Require a successful deployment job, including its live release check.
   Confirm `https://bahasadri.com/api/health` returns `status: "ok"` with the
   release reported by that run, and the homepage loads. Report the pushed SHA,
   workflow run URL, conclusion, and production status. Update the README's
   pending-activation notes only after a successful run, and commit the update.

Preserve all Cloudflare infrastructure as Terraform-managed. There is no bucket,
database, or state migration left to bootstrap. Do not run `wrangler deploy`,
switch to local state, initialize empty production state, or recreate existing
resources. Never commit/upload `.env`, Terraform state or plans, or account data.
The workflow uses standard runners and refuses to deploy if the repository is
private. Keep those settings; the user has accepted R2's possible overage charges.
