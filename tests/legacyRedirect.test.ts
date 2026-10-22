import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyRedirect } from '../cloudflare/legacyRedirect.ts';

const env = { ACCOUNTS_ORIGIN: 'https://grakata.com', LEGACY_ORIGIN: 'https://bahasadri.com' };

test('the previous hostname redirects to the app and keeps the path and query', () => {
  const response = legacyRedirect(new Request('https://bahasadri.com/relics?refine=intact'), env);
  assert.equal(response?.status, 301);
  assert.equal(response?.headers.get('location'), 'https://grakata.com/relics?refine=intact');
});

test('the app hostname and unrelated hosts are served directly', () => {
  assert.equal(legacyRedirect(new Request('https://grakata.com/relics'), env), undefined);
  assert.equal(legacyRedirect(new Request('https://example.com/relics'), env), undefined);
  assert.equal(legacyRedirect(new Request('https://bahasadri.com/relics'), { ACCOUNTS_ORIGIN: 'https://grakata.com' }), undefined);
  assert.equal(legacyRedirect(new Request('https://grakata.com/relics'), { ACCOUNTS_ORIGIN: 'https://grakata.com', LEGACY_ORIGIN: 'https://grakata.com' }), undefined);
});
