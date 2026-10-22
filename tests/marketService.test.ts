import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketService } from '../server/market.ts';
import { MARKET_ORDERS_TTL } from '../src/lib/market.ts';
import { wfmHistory, wfmItems, wfmOrders } from './fixtures/wfm.ts';

function fixture(random?: () => number) {
  let time = Date.UTC(2026, 9, 13), failure = 0;
  const store = new Map<string, unknown>(), requests: { url: string; time: number; headers: Headers }[] = [];
  const options = { now: () => time, pause: async (delay: number) => { await new Promise(resolve => setImmediate(resolve)); time += delay; }, random,
    store: { async get(key: string) { return store.get(key); }, async set(key: string, data: unknown) { store.set(key, data); } },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); requests.push({ url, time, headers: new Headers(init?.headers) });
      if (failure) return failure === 200 ? Response.json({ wrong: true }) : new Response(failure === 403 ? '<html>Just a moment...</html>' : '', { status: failure, headers: { 'Retry-After': '60', ...(failure === 403 ? { 'cf-mitigated': 'challenge', 'Content-Type': 'text/html' } : {}) } });
      return Response.json(url.endsWith('/v2/items') ? wfmItems : url.endsWith('/statistics') ? wfmHistory() : wfmOrders());
    }) as typeof fetch,
  };
  return { options, requests, tick: (delay: number) => { time += delay; }, fail: (status: number) => { failure = status; } };
}
const request = (path: string, headers?: HeadersInit) => new Request(`https://toolkit.test/api/wfm/${path}`, { headers });

test('market API coalesces duplicates and shares a paced upstream queue across versions and platforms', async () => {
  const f = fixture(), service = createMarketService(f.options);
  const results = await Promise.all([service.handle(request('orders/ash_prime_set')), service.handle(request('orders/ash_prime_set')), service.handle(request('history/ash_prime_set')), service.handle(request('orders/ash_prime_set?platform=switch'))]);
  assert.ok(results.every(response => response.status === 200));
  assert.equal(f.requests.length, 4);
  for (let index = 1; index < f.requests.length; index++) assert.ok(f.requests[index].time - f.requests[index - 1].time >= 1000);
  assert.ok(f.requests.some(entry => entry.headers.get('Platform') === 'switch'));
  assert.ok(f.requests.every(entry => !entry.headers.has('Authorization') && entry.headers.get('Crossplay') === 'false'));
  await service.handle(request('orders/ash_prime_set')); assert.equal(f.requests.length, 4);
  const second = createMarketService(f.options); await second.handle(request('orders/ash_prime_set')); assert.equal(f.requests.length, 4);
});

test('stale prices are returned upfront from SQL storage and queued to refresh in the background', async () => {
  const f = fixture(), service = createMarketService(f.options);
  const original = await (await service.handle(request('orders/ash_prime_set'))).json();
  f.tick(MARKET_ORDERS_TTL + 1); f.fail(429);
  const immediate = await (await service.handle(request('orders/ash_prime_set'))).json();
  assert.equal(immediate.stale, true); assert.equal(immediate.refreshing, true);
  assert.equal(immediate.fetchedAt, original.fetchedAt); assert.deepEqual(immediate.data, original.data);
  await service.flush();
  const failed = await service.handle(request('orders/ash_prime_set')), stale = await failed.json();
  assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, original.fetchedAt); assert.deepEqual(stale.data, original.data);
  assert.equal(failed.headers.get('Retry-After'), '60');
  const count = f.requests.length; await service.handle(request('orders/ash_prime_set')); assert.equal(f.requests.length, count);
  f.fail(0); const restarted = createMarketService(f.options);
  await restarted.handle(request('orders/braton_prime_set'));
  assert.ok(f.requests.at(-1)!.time - f.requests[count - 1].time >= 60_000);
  const queued = await (await restarted.handle(request('orders/ash_prime_set'))).json();
  assert.equal(queued.stale, true); assert.equal(queued.refreshing, true);
  await restarted.flush();
  const fresh = await (await restarted.handle(request('orders/ash_prime_set'))).json();
  assert.equal(fresh.stale, false); assert.notEqual(fresh.fetchedAt, original.fetchedAt);
});

test('queue selection is random but weighted by wait time so waiting items accelerate while new arrivals still get turns', async () => {
  const rolls = [0.98, 0.2];
  const f = fixture(() => rolls.shift() ?? 0), service = createMarketService(f.options);
  for (const path of ['orders/ash_prime_set', 'orders/ash_prime_set?platform=switch', 'orders/braton_prime_set']) {
    await service.handle(request(path));
  }
  await service.flush();
  // Advance past orders TTL (5m) while keeping items catalog (24h) fresh.
  f.tick(MARKET_ORDERS_TTL + 1);
  // Enqueue two stale items at t = 0 and a third item 800ms later before drain() yields past its first pause.
  const first = service.handle(request('orders/ash_prime_set'));
  const second = service.handle(request('orders/ash_prime_set?platform=switch'));
  f.tick(800);
  const third = service.handle(request('orders/braton_prime_set'));
  await Promise.all([first, second, third]);
  await service.flush();
  const order = f.requests.slice(-3).map(entry => `${new URL(entry.url).pathname}:${entry.headers.get('Platform')}`);
  // First roll (0.98) lands in the newly arrived item's tail weight; second roll (0.2) lands in the older waiting items.
  assert.equal(order[0], '/v2/orders/item/braton_prime_set:pc');
  assert.deepEqual(new Set(order.slice(1)), new Set(['/v2/orders/item/ash_prime_set:pc', '/v2/orders/item/ash_prime_set:switch']));
});

test('background cold requests enqueue with 202 when busy so cached SQLite reads are never blocked', async () => {
  const f = fixture(), service = createMarketService(f.options);
  await service.handle(request('orders/ash_prime_set'));
  const cold = await service.handle(request('orders/braton_prime_set', { 'X-Market-Background': '1' }));
  assert.equal(cold.status, 202);
  assert.equal((await cold.json()).refreshing, true);
  // Meanwhile a cached item returns 200 immediately without waiting on the queue.
  const cached = await service.handle(request('orders/ash_prime_set', { 'X-Market-Background': '1' }));
  assert.equal(cached.status, 200);
  await service.flush();
  const ready = await service.handle(request('orders/braton_prime_set', { 'X-Market-Background': '1' }));
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).stale, false);
});

test('invalid upstream payloads preserve cached prices; a cold failure is unavailable, never zero', async () => {
  const f = fixture(), service = createMarketService(f.options);
  const original = await (await service.handle(request('orders/ash_prime_set'))).json();
  f.tick(MARKET_ORDERS_TTL + 1); f.fail(200);
  const stale = await (await service.handle(request('orders/ash_prime_set'))).json();
  assert.equal(stale.stale, true); assert.deepEqual(stale.data, original.data);
  await service.flush();
  const afterFailure = await (await service.handle(request('orders/ash_prime_set'))).json();
  assert.equal(afterFailure.stale, true); assert.deepEqual(afterFailure.data, original.data);
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
  const immediate = await (await service.handle(request('orders/ash_prime_set'))).json();
  assert.equal(immediate.stale, true); assert.equal(immediate.refreshing, true);
  await service.flush();
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
