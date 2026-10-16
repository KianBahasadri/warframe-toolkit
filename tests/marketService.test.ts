import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketService } from '../server/market.ts';
import { MARKET_ORDERS_TTL } from '../src/lib/market.ts';
import { wfmHistory, wfmItems, wfmOrders } from './fixtures/wfm.ts';

function fixture() {
  let time = Date.UTC(2026, 9, 13), failure = 0;
  const store = new Map<string, unknown>(), requests: { url: string; time: number; headers: Headers }[] = [];
  const options = { now: () => time, pause: async (delay: number) => { time += delay; },
    store: { async get(key: string) { return store.get(key); }, async set(key: string, data: unknown) { store.set(key, data); } },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); requests.push({ url, time, headers: new Headers(init?.headers) });
      if (failure) return failure === 200 ? Response.json({ wrong: true }) : new Response(failure === 403 ? '<html>Just a moment...</html>' : '', { status: failure, headers: { 'Retry-After': '60', ...(failure === 403 ? { 'cf-mitigated': 'challenge', 'Content-Type': 'text/html' } : {}) } });
      return Response.json(url.endsWith('/v2/items') ? wfmItems : url.endsWith('/statistics') ? wfmHistory() : wfmOrders());
    }) as typeof fetch,
  };
  return { options, requests, tick: (delay: number) => { time += delay; }, fail: (status: number) => { failure = status; } };
}
const request = (path: string) => new Request(`https://toolkit.test/api/wfm/${path}`);

test('market API coalesces duplicates and shares a paced upstream queue across versions and platforms', async () => {
  const f = fixture(), service = createMarketService(f.options);
  const results = await Promise.all([service.handle(request('orders/ash_prime_set')), service.handle(request('orders/ash_prime_set')), service.handle(request('history/ash_prime_set')), service.handle(request('orders/ash_prime_set?platform=switch'))]);
  assert.ok(results.every(response => response.status === 200));
  assert.equal(f.requests.length, 4);
  for (let index = 1; index < f.requests.length; index++) assert.ok(f.requests[index].time - f.requests[index - 1].time >= 450);
  assert.ok(f.requests.some(entry => entry.headers.get('Platform') === 'switch'));
  assert.ok(f.requests.every(entry => !entry.headers.has('Authorization') && entry.headers.get('Crossplay') === 'false'));
  await service.handle(request('orders/ash_prime_set')); assert.equal(f.requests.length, 4);
  const second = createMarketService(f.options); await second.handle(request('orders/ash_prime_set')); assert.equal(f.requests.length, 4);
});

test('stale prices retain their successful timestamp on rate limits and honor Retry-After across restarts', async () => {
  const f = fixture(), service = createMarketService(f.options);
  const original = await (await service.handle(request('orders/ash_prime_set'))).json();
  f.tick(MARKET_ORDERS_TTL + 1); f.fail(429);
  const failed = await service.handle(request('orders/ash_prime_set')), stale = await failed.json();
  assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, original.fetchedAt); assert.deepEqual(stale.data, original.data);
  assert.equal(failed.headers.get('Retry-After'), '60');
  const count = f.requests.length; await service.handle(request('orders/ash_prime_set')); assert.equal(f.requests.length, count);
  f.fail(0); const restarted = createMarketService(f.options);
  await restarted.handle(request('orders/braton_prime_set'));
  assert.ok(f.requests.at(-1)!.time - f.requests[count - 1].time >= 60_000);
  const fresh = await (await restarted.handle(request('orders/ash_prime_set'))).json();
  assert.equal(fresh.stale, false); assert.notEqual(fresh.fetchedAt, original.fetchedAt);
});

test('invalid upstream payloads preserve cached prices; a cold failure is unavailable, never zero', async () => {
  const f = fixture(), service = createMarketService(f.options);
  const original = await (await service.handle(request('orders/ash_prime_set'))).json();
  f.tick(MARKET_ORDERS_TTL + 1); f.fail(200);
  const stale = await (await service.handle(request('orders/ash_prime_set'))).json();
  assert.equal(stale.stale, true); assert.deepEqual(stale.data, original.data);
  const cold = fixture(); cold.fail(503);
  assert.equal((await createMarketService(cold.options).handle(request('items'))).status, 503);
});

test('a WFM browser challenge reports the server block and retains dated prices without immediately retrying', async () => {
  const cold = fixture(); cold.fail(403);
  const unavailable = await createMarketService(cold.options).handle(request('items'));
  assert.equal(unavailable.status, 503);
  const error = await unavailable.json();
  assert.match(error.error, /blocking requests from this server/);
  assert.equal(error.data, undefined);

  const f = fixture(), service = createMarketService(f.options);
  const original = await (await service.handle(request('orders/ash_prime_set'))).json();
  f.tick(MARKET_ORDERS_TTL + 1); f.fail(403);
  const stale = await (await service.handle(request('orders/ash_prime_set'))).json();
  assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, original.fetchedAt);
  assert.deepEqual(stale.data, original.data); assert.match(stale.error, /blocking requests from this server/);
  const count = f.requests.length;
  await service.handle(request('orders/ash_prime_set'));
  assert.equal(f.requests.length, count);
});

test('public read endpoint rejects arbitrary upstream paths, unknown items and write methods', async () => {
  const f = fixture(), service = createMarketService(f.options);
  for (const path of ['orders/ash_prime_set?platform=bad', 'orders/ash_prime_set?platform=pc&platform=xbox', 'orders/ash_prime_set?url=https://example.com', 'items/ash_prime_set', 'orders', 'orders/a%2Fb']) assert.equal((await service.handle(request(path))).status, 400);
  assert.equal(f.requests.length, 0);
  assert.equal((await service.handle(new Request('https://toolkit.test/api/wfm/items', { method: 'POST' }))).status, 405);
  assert.equal((await service.handle(request('orders/not_in_catalog'))).status, 404);
  assert.equal(f.requests.length, 1);
});
