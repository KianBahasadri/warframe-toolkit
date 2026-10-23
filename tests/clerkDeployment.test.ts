import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkClerk, productionClerkConfig } from '../scripts/check-clerk.mjs';
import { testClerkKeys } from './fixtures/clerk.ts';

const publishableKey = `pk_live_${Buffer.from('clerk.grakata.com$').toString('base64')}`;
const env = { VITE_CLERK_PUBLISHABLE_KEY: publishableKey, CLERK_JWT_KEY: testClerkKeys.publicKey };
const jwk = createPublicKey(testClerkKeys.publicKey).export({ format: 'jwk' });

test('production refuses missing, development, wrong-domain, or invalid Clerk configuration', () => {
  assert.equal(productionClerkConfig(env).frontendApi, 'https://clerk.grakata.com');
  assert.doesNotThrow(() => productionClerkConfig({ ...env, CLERK_JWT_KEY: env.CLERK_JWT_KEY.replace(/\n/g, '\\n') }));
  for (const VITE_CLERK_PUBLISHABLE_KEY of ['', publishableKey.replace('pk_live_', 'pk_test_'), `pk_live_${Buffer.from('clerk.other.com$').toString('base64')}`]) {
    assert.throws(() => productionClerkConfig({ ...env, VITE_CLERK_PUBLISHABLE_KEY }), /production/i);
  }
  for (const CLERK_JWT_KEY of ['', 'not a public key', testClerkKeys.privateKey]) {
    assert.throws(() => productionClerkConfig({ ...env, CLERK_JWT_KEY }), /PEM public key/);
  }
});

test('deployment verifies the configured key against the production domain before migrations', async () => {
  const fetchImpl = async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://clerk.grakata.com/.well-known/jwks.json');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    return Response.json({ keys: [jwk] });
  };
  await checkClerk({ env, fetchImpl });
  await assert.rejects(checkClerk({ env, fetchImpl: async () => new Response('', { status: 503 }) }), /DNS and certificates/);
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
  for (const keys of [[], [other], [{ kty: 'invalid' }]]) {
    await assert.rejects(checkClerk({ env, fetchImpl: async () => Response.json({ keys }) }), /does not match/);
  }
});

test('a valid backend configuration cannot deploy a guest-only or development frontend build', async () => {
  const buildDirectory = await mkdtemp(join(tmpdir(), 'toolkit-clerk-build-'));
  const fetchImpl = async () => Response.json({ keys: [jwk] });
  try {
    await mkdir(join(buildDirectory, 'assets'));
    const file = join(buildDirectory, 'assets', 'index.js');
    for (const content of ['', publishableKey.replace('pk_live_', 'pk_test_')]) {
      await writeFile(file, content);
      await assert.rejects(checkClerk({ env, fetchImpl, buildDirectory }), /Rebuild the frontend/);
    }
    await writeFile(file, `const publishableKey = '${publishableKey}';`);
    await checkClerk({ env, fetchImpl, buildDirectory });
  } finally { await rm(buildDirectory, { recursive: true, force: true }); }
});
