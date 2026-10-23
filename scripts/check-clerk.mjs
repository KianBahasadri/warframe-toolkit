import { createPublicKey } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function productionClerkConfig(env = process.env) {
  const publishableKey = env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  if (!publishableKey?.startsWith('pk_live_')) throw new Error('Production requires VITE_CLERK_PUBLISHABLE_KEY from a Clerk production instance.');
  const domain = Buffer.from(publishableKey.slice('pk_live_'.length), 'base64').toString('utf8');
  const hostname = env.TF_VAR_hostname || 'grakata.com';
  if (domain !== `clerk.${hostname}$`) throw new Error('The Clerk publishable key must belong to the production domain.');
  const jwtKey = env.CLERK_JWT_KEY?.trim().replace(/\\n/g, '\n');
  let publicKey;
  try {
    if (!jwtKey?.startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error();
    publicKey = createPublicKey(jwtKey);
    if (publicKey.asymmetricKeyType !== 'rsa') throw new Error();
  } catch {
    throw new Error('Production requires CLERK_JWT_KEY containing the Clerk PEM public key.');
  }
  return { publishableKey, publicKey, frontendApi: `https://clerk.${hostname}` };
}

// Run before migrations: a guest-only frontend or a mismatched verification key
// must never replace the working production login.
export async function checkClerk({ env = process.env, fetchImpl = fetch, buildDirectory } = {}) {
  const config = productionClerkConfig(env);
  const response = await fetchImpl(`${config.frontendApi}/.well-known/jwks.json`, {
    signal: AbortSignal.timeout(15_000), redirect: 'error',
  });
  if (!response.ok) throw new Error('Clerk production DNS and certificates must be ready before deployment.');
  const jwks = await response.json();
  const expected = config.publicKey.export({ type: 'spki', format: 'der' });
  const matches = jwks.keys?.some(key => {
    try { return createPublicKey({ key, format: 'jwk' }).export({ type: 'spki', format: 'der' }).equals(expected); }
    catch { return false; }
  });
  if (!matches) throw new Error('CLERK_JWT_KEY does not match the production Clerk instance.');
  if (buildDirectory) {
    const directory = join(buildDirectory, 'assets');
    const scripts = (await readdir(directory)).filter(file => file.endsWith('.js'));
    const contents = await Promise.all(scripts.map(file => readFile(join(directory, file), 'utf8')));
    if (!contents.some(script => script.includes(config.publishableKey))) throw new Error('Rebuild the frontend with the production Clerk publishable key before deploying.');
  }
  return config;
}

if (import.meta.main) {
  try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await checkClerk();
  console.log('Verified Clerk production domain and JWT public key.');
}
