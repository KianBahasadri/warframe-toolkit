import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { cloudflareRuntime } from './runtime.ts';
import { wfmHistory, wfmItems, wfmOrders } from '../fixtures/wfm.ts';
import { handleMarketRelay } from '../../azure/market/handler.ts';

test('public WFM reads share a paced, persistent cache separate from accounts and official drops', async () => {
  const persist = await mkdtemp(join(tmpdir(), 'toolkit-wfm-'));
  const calls: { url: string; headers: Headers; time: number }[] = [];
  const outbound = async (request: Request) => {
    calls.push({ url: request.url, headers: request.headers, time: Date.now() });
    assert.equal(request.headers.get('Cookie'), null); assert.equal(request.headers.get('Authorization'), null);
    assert.equal(new URL(request.url).host, 'api.warframe.market');
    return Response.json(request.url.endsWith('/v2/items') ? wfmItems : request.url.endsWith('/statistics') ? wfmHistory() : wfmOrders());
  };
  let api = await cloudflareRuntime({ persist, outbound });
  const read = (path: string) => api.mf.dispatchFetch(`https://toolkit.test/api/wfm/${path}`);
  try {
    const responses = await Promise.all([read('orders/ash_prime_set'), read('orders/ash_prime_set'), read('history/ash_prime_set')]);
    assert.ok(responses.every(response => response.status === 200));
    const data = await responses[0].json(); assert.deepEqual(await responses[1].json(), data);
    assert.equal(calls.length, 3);
    for (let index = 1; index < calls.length; index++) assert.ok(calls[index].time - calls[index - 1].time >= 950, 'shared queue spaces all API requests');
    await read('orders/ash_prime_set?platform=switch'); assert.equal(calls.length, 4);
    assert.equal(calls.at(-1)!.headers.get('Platform'), 'switch');
    await api.close(); api = await cloudflareRuntime({ persist, outbound });
    assert.deepEqual(await (await read('orders/ash_prime_set')).json(), data);
    assert.equal(calls.length, 4, 'normalized cache survives a restart');
    assert.equal((await api.mf.dispatchFetch('https://toolkit.test/api/droptables')).status, 503);
    assert.equal(calls.length, 4, 'drop reads cannot trigger market requests');
    assert.equal((await api.mf.dispatchFetch('https://toolkit.test/api/wfm/items', { method: 'POST' })).status, 405);
    assert.equal((await read('orders/unknown')).status, 404); assert.equal(calls.length, 4);
  } finally { await api.close(); await rm(persist, { recursive: true, force: true }); }
});

test('the production relay route authenticates privately and keeps all platforms in the shared cache', async () => {
  const calls: { path: string; time: number; platform: string | null }[] = [];
  const api = await cloudflareRuntime({ relay: { url: 'https://relay.test', key: 'private-relay-key' }, outbound: async request => {
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://relay.test', 'configured deployments must never call WFM directly from Cloudflare');
    assert.equal(request.headers.get('x-functions-key'), 'private-relay-key');
    assert.equal(request.headers.get('Cookie'), null); assert.equal(request.headers.get('Authorization'), null);
    return handleMarketRelay(new Request(request.url, { headers: request.headers }), (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname, headers = new Headers(init?.headers);
      assert.equal(headers.get('x-functions-key'), null);
      calls.push({ path, time: Date.now(), platform: headers.get('Platform') });
      return Response.json(path === '/v2/items' ? wfmItems : path.endsWith('/statistics') ? wfmHistory() : wfmOrders());
    }) as typeof fetch);
  } });
  try {
    const read = (path: string) => api.mf.dispatchFetch(`https://toolkit.test/api/wfm/${path}`, { headers: { Cookie: 'session=private', Authorization: 'Bearer private' } });
    const responses = await Promise.all([read('orders/ash_prime_set?platform=switch'), read('orders/ash_prime_set?platform=switch'), read('history/ash_prime_set?platform=switch')]);
    for (const response of responses) {
      assert.equal(response.status, 200); const data = await response.json();
      assert.equal(data.stale, false); assert.doesNotMatch(JSON.stringify(data), /private/);
    }
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(call => call.platform), ['pc', 'switch', 'switch']);
    for (let index = 1; index < calls.length; index++) assert.ok(calls[index].time - calls[index - 1].time >= 950);
  } finally { await api.close(); }
});

test('a challenge through the relay fails the public endpoint and does not cause an immediate retry', async () => {
  let calls = 0;
  const api = await cloudflareRuntime({ relay: { url: 'https://relay.test', key: 'private-relay-key' }, outbound: async () => {
    calls++; return new Response('<html>Challenge</html>', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
  } });
  try {
    for (let index = 0; index < 2; index++) {
      const response = await api.mf.dispatchFetch('https://toolkit.test/api/wfm/items');
      assert.equal(response.status, 503); assert.match((await response.json()).error, /blocking requests/);
    }
    assert.equal(calls, 1);
  } finally { await api.close(); }
});

test('an incomplete relay configuration fails without falling back to direct Cloudflare requests', async () => {
  let calls = 0;
  const api = await cloudflareRuntime({ relay: { url: 'https://relay.test' }, outbound: async () => { calls++; return Response.json(wfmItems); } });
  try {
    const response = await api.mf.dispatchFetch('https://toolkit.test/api/wfm/items');
    assert.equal(response.status, 503); assert.match((await response.json()).error, /not configured/);
    assert.equal(calls, 0);
  } finally { await api.close(); }
});

test('the persisted cost allowance stops Azure calls and retains stale prices across Worker restarts', async () => {
  const persist = await mkdtemp(join(tmpdir(), 'toolkit-market-budget-'));
  let calls = 0;
  const options = { persist, relay: { url: 'https://relay.test', key: 'private-relay-key' }, outbound: async (request: Request) => {
    calls++; return Response.json(request.url.endsWith('/v2/items') ? wfmItems : wfmOrders());
  } };
  let api = await cloudflareRuntime(options);
  try {
    const original = await (await api.mf.dispatchFetch('https://toolkit.test/api/wfm/orders/ash_prime_set')).json();
    assert.equal(calls, 2);
    const storage = await api.mf.unsafeGetDurableObjectStorage('warframe-toolkit', 'DropTables', { name: 'wfm' });
    const usage = { day: new Date().toISOString().slice(0, 10), requests: 2000, bytes: 0 };
    const expired = { data: original.data, fetchedAt: '2020-01-01T00:00:00.000Z', retryAt: 0, touched: 0 };
    for (const [key, value] of [['relay-budget', usage], ['orders:pc:ash_prime_set', expired], ['throttle', 0]] as const) await storage.exec(`UPDATE market_cache SET value = X'${gzipSync(JSON.stringify(value)).toString('hex')}' WHERE key = '${key}'`);
    await api.close(); api = await cloudflareRuntime(options);
    const immediate = await (await api.mf.dispatchFetch('https://toolkit.test/api/wfm/orders/ash_prime_set')).json();
    assert.equal(immediate.stale, true); assert.equal(immediate.refreshing, true);
    assert.equal(immediate.fetchedAt, expired.fetchedAt); assert.deepEqual(immediate.data, original.data);
    assert.equal((await api.mf.dispatchFetch('https://toolkit.test/api/wfm/orders/braton_prime_set')).status, 503);
    const stale = await (await api.mf.dispatchFetch('https://toolkit.test/api/wfm/orders/ash_prime_set')).json();
    assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, expired.fetchedAt);
    assert.deepEqual(stale.data, original.data); assert.match(stale.error, /Daily market request limit/);
    assert.equal(calls, 2, 'quota checks must run before invoking Azure');
  } finally { await api.close(); await rm(persist, { recursive: true, force: true }); }
});

test('a failed relay response counts its body instead of keeping the byte reservation', async () => {
  const api = await cloudflareRuntime({ relay: { url: 'https://relay.test', key: 'private-relay-key' }, outbound: async () => new Response('no', { status: 500 }) });
  try {
    const response = await api.mf.dispatchFetch('https://toolkit.test/api/wfm/items');
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /unavailable \(500\)/);
    const storage = await api.mf.unsafeGetDurableObjectStorage('warframe-toolkit', 'DropTables', { name: 'wfm' });
    const result = await storage.exec("SELECT hex(value) AS value FROM market_cache WHERE key = 'relay-budget'");
    const usage = JSON.parse(gunzipSync(Buffer.from(result[0].value, 'hex')).toString('utf8')) as { requests: number; bytes: number };
    assert.equal(usage.requests, 1);
    assert.equal(usage.bytes, 2);
  } finally { await api.close(); }
});
