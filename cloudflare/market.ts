import { gzipSync, gunzipSync } from 'node:zlib';
import { createMarketService } from '../server/market.ts';
import { MARKET_ORIGIN, isMarketPath, marketHeaders } from '../server/marketUpstream.ts';
import type { Env } from './index.ts';

function relayFetch(env: Pick<Env, 'WFM_RELAY_URL' | 'WFM_RELAY_KEY'>): typeof fetch | undefined {
  if (!env.WFM_RELAY_URL && !env.WFM_RELAY_KEY) return undefined;
  return async (input, init) => {
    if (!env.WFM_RELAY_URL || !env.WFM_RELAY_KEY) throw new Error('Market relay is not configured.');
    const source = new URL(input instanceof Request ? input.url : String(input));
    const target = new URL(env.WFM_RELAY_URL);
    if (source.origin !== MARKET_ORIGIN || !isMarketPath(source.pathname) || source.search || target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || target.pathname !== '/') throw new Error('Invalid market relay request.');
    target.pathname = `/api/wfm${source.pathname}`;
    const headers = marketHeaders(new Headers(init?.headers).get('Platform') ?? 'pc');
    headers.set('x-functions-key', env.WFM_RELAY_KEY);
    return fetch(target, { method: 'GET', headers, redirect: 'manual', signal: init?.signal });
  };
}

/** A singleton shares the upstream rate limit and cache across visitors. */
export function createDurableMarket(ctx: DurableObjectState, env: Pick<Env, 'WFM_RELAY_URL' | 'WFM_RELAY_KEY'>) {
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS market_cache (key TEXT PRIMARY KEY, value BLOB NOT NULL, touched INTEGER NOT NULL)');
  return createMarketService({ fetch: relayFetch(env), store: {
    async get(key) { const row = ctx.storage.sql.exec<{ value: ArrayBuffer }>('SELECT value FROM market_cache WHERE key = ?', key).toArray()[0]; return row ? JSON.parse(gunzipSync(Buffer.from(row.value)).toString('utf8')) : undefined; },
    async set(key, value) {
      ctx.storage.sql.exec('INSERT OR REPLACE INTO market_cache VALUES (?, ?, ?)', key, gzipSync(JSON.stringify(value)), Date.now());
      ctx.storage.sql.exec("DELETE FROM market_cache WHERE key NOT IN ('items', 'throttle') AND key IN (SELECT key FROM market_cache ORDER BY touched DESC LIMIT -1 OFFSET 512)");
    },
  } });
}
