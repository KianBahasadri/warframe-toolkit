import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { cloudflare, loadCredentials } from './cloudflare-api.mjs';
import { r2Credentials } from './r2-credentials.mjs';

process.umask(0o077);
const version = '1.16.5', architecture = { x64: 'amd64', arm64: 'arm64' }[process.arch];
if (process.platform !== 'linux' || !architecture) throw new Error('Run Terraform inside the Linux development box.');
const directory = resolve(`.tools/terraform/${version}`), binary = `${directory}/terraform`;
try { await access(binary); } catch {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `terraform_${version}_linux_${architecture}.zip`, base = `https://releases.hashicorp.com/terraform/${version}`;
  const [archive, sums] = await Promise.all([fetch(`${base}/${name}`), fetch(`${base}/terraform_${version}_SHA256SUMS`)]);
  if (!archive.ok || !sums.ok) throw new Error('Could not download the pinned Terraform release.');
  const bytes = Buffer.from(await archive.arrayBuffer());
  const expected = (await sums.text()).split('\n').find(line => line.endsWith(`  ${name}`))?.split(/\s+/)[0];
  if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Terraform download checksum mismatch.');
  const archivePath = `${directory}/${name}`; await writeFile(archivePath, bytes);
  execFileSync('python3', ['-m', 'zipfile', '-e', archivePath, directory]); await chmod(binary, 0o700);
}
const args = process.argv.slice(2);
if (!args.length) throw new Error('Usage: npm run infra -- init|validate|plan|apply|output|...');
// Backend credentials are needed during init as well as plan/apply. Keep them
// in the environment; -backend-config would copy them into plans and metadata.
try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existsSync('infra/cloudflare/backend.tf') && !['fmt', 'validate', 'version', 'providers'].includes(args[0]) && !args.includes('-backend=false')) {
  Object.assign(process.env, await r2Credentials());
}
if (!['fmt', 'validate', 'version', 'init'].includes(args[0])) {
  loadCredentials();
  const hostname = process.env.TF_VAR_hostname || 'bahasadri.com';
  const zones = await cloudflare(`/zones?name=${encodeURIComponent(hostname)}`);
  if (zones.length !== 1) throw new Error(`Expected one Cloudflare zone for ${hostname}.`);
  process.env.TF_VAR_account_id ||= zones[0].account.id;
  process.env.TF_VAR_zone_id ||= zones[0].id;
  // The artifact digest is stable across Git commits and changes with either
  // backend or frontend; repeated plans of the same build remain empty.
  const files = ['build/cloudflare/worker.js', 'dist/index.html'];
  const hash = createHash('sha256'); for (const file of files) hash.update(await readFile(file));
  process.env.TF_VAR_release ||= hash.digest('hex').slice(0, 16);
}
await new Promise((resolve, reject) => {
  const child = spawn(binary, ['-chdir=infra/cloudflare', ...args], { stdio: 'inherit', env: { ...process.env, TF_IN_AUTOMATION: '1' } });
  child.on('error', reject); child.on('exit', code => { if (code === 0 || code === 2 && args.includes('-detailed-exitcode')) { process.exitCode = code; resolve(); } else reject(new Error(`Terraform exited with status ${code}.`)); });
});
