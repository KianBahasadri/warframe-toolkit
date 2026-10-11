import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

if (!process.env.CLOUDFLARE_ACCOUNT_ID || !/^[\da-f-]{36}$/.test(process.env.TOOLKIT_DATABASE_ID || '')) throw new Error('Terraform must supply the D1 account and database IDs.');
const directory = await mkdtemp(`${tmpdir()}/toolkit-d1-`);
try {
  const config = resolve(directory, 'wrangler.json');
  await writeFile(config, JSON.stringify({ name: 'warframe-toolkit-schema', account_id: process.env.CLOUDFLARE_ACCOUNT_ID, compatibility_date: '2026-10-01', d1_databases: [{ binding: 'DB', database_name: 'warframe-toolkit-accounts', database_id: process.env.TOOLKIT_DATABASE_ID, migrations_dir: resolve('cloudflare/migrations') }] }), { mode: 0o600 });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', config], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, CI: 'true', CLOUDFLARE_SEND_METRICS: 'false' } });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`D1 migration failed (${code}).`)));
  });
} finally { await rm(directory, { recursive: true, force: true }); }
