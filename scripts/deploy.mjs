import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { loadCredentials } from './cloudflare-api.mjs';
import { r2Credentials } from './r2-credentials.mjs';
import { assertProductionState, assertSafePlan } from './deployment-checks.mjs';
import { checkMarket } from './check-market.mjs';
import { checkClerk } from './check-clerk.mjs';

process.umask(0o077);
loadCredentials();
await checkClerk({ buildDirectory: 'dist' });
const credentials = await r2Credentials();
Object.assign(process.env, credentials);
// Derived credentials are not registered GitHub secrets. Mask them before any
// child process runs, while keeping captured Terraform JSON free of log lines.
if (process.env.GITHUB_ACTIONS === 'true') for (const value of Object.values(credentials)) console.log(`::add-mask::${value}`);
function terraform(args, capture = false) {
  const result = spawnSync(process.execPath, ['scripts/terraform.mjs', ...args], {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  // Captured output can contain private state. Never attach it to an exception.
  if (result.error || result.status !== 0) throw new Error(`Terraform ${args[0]} failed (exit ${result.status ?? 'unknown'}).`);
  return result.stdout;
}

terraform(['init', '-input=false', '-lockfile=readonly']);
const metadata = await readFile('infra/cloudflare/.terraform/terraform.tfstate', 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '{}';
  throw error;
});
const backend = JSON.parse(metadata).backend;
if (backend?.type !== 's3' || backend.config?.use_lockfile !== true) throw new Error('Automatic deployment requires shared state with locking. Local or unlocked state is not allowed.');
const state = terraform(['state', 'pull'], true);
assertProductionState(JSON.parse(state));
const backups = '.data/terraform-backups';
await mkdir(backups, { recursive: true, mode: 0o700 });
await chmod(backups, 0o700);
await writeFile(`${backups}/production-${Date.now()}.json`, state, { mode: 0o600, flag: 'wx' });
terraform(['validate']);
const plan = 'production.tfplan';
try {
  terraform(['plan', '-input=false', '-lock-timeout=120s', `-out=${plan}`]);
  assertSafePlan(JSON.parse(terraform(['show', '-json', plan], true)));
  terraform(['apply', '-input=false', '-lock-timeout=120s', plan]);
} finally { await rm(`infra/cloudflare/${plan}`, { force: true }); }

const releaseHash = createHash('sha256');
for (const path of ['build/cloudflare/worker.js', 'dist/index.html']) releaseHash.update(await readFile(path));
const release = releaseHash.digest('hex').slice(0, 16);
const origin = 'https://grakata.com';
let healthy = false;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    const result = await response.json();
    if (response.ok && result.status === 'ok' && result.release === release) { healthy = true; break; }
  } catch { /* Give a new Worker version time to propagate. */ }
  await setTimeout(5000);
}
if (!healthy) throw new Error('Production did not report the expected release after deployment.');
const home = await fetch(origin, { signal: AbortSignal.timeout(15_000) });
if (!home.ok || !(await home.text()).includes('<div id="root">')) throw new Error('The production frontend did not load.');
const session = await fetch(`${origin}/api/account/session`, { signal: AbortSignal.timeout(15_000) });
if (!session.ok || (await session.json()).user !== null) throw new Error('The production account endpoint did not respond correctly.');
await checkMarket(origin);
console.log(`Verified ${origin} (release ${release}).`);
