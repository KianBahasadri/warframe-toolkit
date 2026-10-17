import type { MarketCacheStore } from './market.ts';

export const MARKET_RELAY_RESPONSE_LIMIT = 12_000_000;
export const MARKET_RELAY_DAILY_REQUESTS = 2000;
export const MARKET_RELAY_DAILY_BYTES = 100_000_000;
const key = 'relay-budget';
type Usage = { day: string; requests: number; bytes: number };

/** Called only within the market service's shared serial upstream queue. */
export function createMarketRelayBudget(store: MarketCacheStore, now = Date.now) {
  return async () => {
    const day = new Date(now()).toISOString().slice(0, 10);
    const saved = await store.get(key) as Usage | undefined;
    if (saved && (!/^\d{4}-\d{2}-\d{2}$/.test(saved.day) || !Number.isSafeInteger(saved.requests) || saved.requests < 0 || !Number.isSafeInteger(saved.bytes) || saved.bytes < 0)) throw new Error('Market usage limit could not be checked.');
    const usage = saved?.day === day ? saved : { day, requests: 0, bytes: 0 };
    if (usage.requests >= MARKET_RELAY_DAILY_REQUESTS || usage.bytes + MARKET_RELAY_RESPONSE_LIMIT > MARKET_RELAY_DAILY_BYTES) throw new Error('Daily market request limit reached. Fresh prices resume tomorrow (UTC).');
    // Reserve the largest permitted response before sending a billable request.
    // Crashes/timeouts keep the reservation, so restarting cannot evade the cap.
    const reserved = { day, requests: usage.requests + 1, bytes: usage.bytes + MARKET_RELAY_RESPONSE_LIMIT };
    await store.set(key, reserved);
    return async (bytes: number) => {
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MARKET_RELAY_RESPONSE_LIMIT) throw new Error('Market relay response exceeded the size limit.');
      await store.set(key, { ...reserved, bytes: reserved.bytes - MARKET_RELAY_RESPONSE_LIMIT + bytes });
    };
  };
}
