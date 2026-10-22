import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketRelayBudget, MARKET_RELAY_DAILY_BYTES, MARKET_RELAY_DAILY_REQUESTS, MARKET_RELAY_RESERVE_BYTES, MARKET_RELAY_RESPONSE_LIMIT } from '../server/marketRelayBudget.ts';

function fixture() {
  let time = Date.UTC(2026, 9, 16, 12);
  const data = new Map<string, unknown>();
  const store = { async get(key: string) { return structuredClone(data.get(key)); }, async set(key: string, value: unknown) { data.set(key, structuredClone(value)); } };
  return { data, store, now: () => time, tomorrow: () => { time += 86_400_000; } };
}

test('the relay request allowance persists across restarts and resets only on a new UTC date', async () => {
  const f = fixture();
  let reserve = createMarketRelayBudget(f.store, f.now);
  for (let count = 0; count < MARKET_RELAY_DAILY_REQUESTS; count++) await (await reserve())(100);
  reserve = createMarketRelayBudget(f.store, f.now);
  await assert.rejects(reserve(), /Daily market request limit/);
  f.tomorrow(); await (await reserve())(100);
  assert.deepEqual(f.data.get('relay-budget'), { day: '2026-10-17', requests: 1, bytes: 100 });
});

test('large responses exhaust the daily byte allowance before the request allowance', async () => {
  const f = fixture(), reserve = createMarketRelayBudget(f.store, f.now), payload = 10_000_000;
  const filled = Math.floor((MARKET_RELAY_DAILY_BYTES - MARKET_RELAY_RESERVE_BYTES) / payload) + 1;
  for (let count = 0; count < filled; count++) await (await reserve())(payload);
  await assert.rejects(reserve(), /Daily market request limit/);
  assert.ok(filled < MARKET_RELAY_DAILY_REQUESTS);
  assert.deepEqual(f.data.get('relay-budget'), { day: '2026-10-16', requests: filled, bytes: filled * payload });
});

test('interrupted and oversized responses keep their reservation instead of evading the byte limit', async () => {
  const f = fixture(), holes = Math.floor(MARKET_RELAY_DAILY_BYTES / MARKET_RELAY_RESERVE_BYTES);
  for (let count = 0; count < holes; count++) await createMarketRelayBudget(f.store, f.now)();
  await assert.rejects(createMarketRelayBudget(f.store, f.now)(), /Daily market request limit/);
  assert.equal((f.data.get('relay-budget') as { bytes: number }).bytes, holes * MARKET_RELAY_RESERVE_BYTES);
  const other = fixture(), complete = await createMarketRelayBudget(other.store, other.now)();
  await assert.rejects(complete(MARKET_RELAY_RESPONSE_LIMIT + 1), /size limit/);
  assert.deepEqual(other.data.get('relay-budget'), { day: '2026-10-16', requests: 1, bytes: MARKET_RELAY_RESERVE_BYTES });
});

test('a handled failure can release the byte reservation without forgetting the request', async () => {
  const f = fixture(), complete = await createMarketRelayBudget(f.store, f.now)();
  await complete(0);
  assert.deepEqual(f.data.get('relay-budget'), { day: '2026-10-16', requests: 1, bytes: 0 });
});

test('unavailable or malformed budget storage fails closed before any billable request', async () => {
  const f = fixture(); f.data.set('relay-budget', { day: 'broken', requests: -1, bytes: NaN });
  await assert.rejects(createMarketRelayBudget(f.store, f.now)(), /could not be checked/);
  await assert.rejects(createMarketRelayBudget({ get: async () => { throw new Error('storage unavailable'); }, set: f.store.set })(), /storage unavailable/);
  await assert.rejects(createMarketRelayBudget({ get: async () => undefined, set: async () => { throw new Error('cannot save reservation'); } })(), /cannot save/);
});
