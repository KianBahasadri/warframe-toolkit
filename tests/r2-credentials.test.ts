import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { r2Credentials } from '../scripts/r2-credentials.mjs';

test('R2 state uses explicit scoped credentials without requesting or changing the Cloudflare token', async () => {
  const env = { AWS_ACCESS_KEY_ID: 'scoped-id', AWS_SECRET_ACCESS_KEY: 'scoped-secret' };
  const credentials = await r2Credentials(env, async () => { throw new Error('Should not verify an independent token.'); });
  assert.deepEqual(credentials, env);
  assert.deepEqual(env, { AWS_ACCESS_KEY_ID: 'scoped-id', AWS_SECRET_ACCESS_KEY: 'scoped-secret' });
});

test('R2 credentials derive from a verified token without modifying or persisting the input', async () => {
  const env = { CLOUDFLARE_API_TOKEN: 'test-only-token-value' }, id = 'a'.repeat(32);
  const result = await r2Credentials(env, async () => ({ id, status: 'active' }));
  assert.deepEqual(result, { AWS_ACCESS_KEY_ID: id, AWS_SECRET_ACCESS_KEY: createHash('sha256').update(env.CLOUDFLARE_API_TOKEN).digest('hex') });
  assert.deepEqual(env, { CLOUDFLARE_API_TOKEN: 'test-only-token-value' });
  assert.equal(Object.values(result).includes(env.CLOUDFLARE_API_TOKEN), false);
});

test('partial credentials and inactive or malformed token verification stop state access', async () => {
  for (const env of [{}, { AWS_ACCESS_KEY_ID: 'partial' }, { AWS_SECRET_ACCESS_KEY: 'partial' }, { AWS_SESSION_TOKEN: 'partial' }]) {
    await assert.rejects(r2Credentials(env, async () => { throw new Error('Must validate inputs first.'); }), /Set CLOUDFLARE_API_TOKEN|Provide both/);
  }
  const env = { CLOUDFLARE_API_TOKEN: 'test-only-token-value' };
  for (const result of [null, {}, { id: 'a'.repeat(32), status: 'disabled' }, { id: 'malformed', status: 'active' }]) await assert.rejects(r2Credentials(env, async () => result), /verify an active/);
  await assert.rejects(r2Credentials(env, async () => { throw new Error('Verification unavailable.'); }), /Verification unavailable/);
});
