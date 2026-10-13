import { gzipSync, gunzipSync } from 'node:zlib';
import { createMarketService } from '../server/market.ts';

/** A singleton shares the upstream rate limit and cache across visitors. */
export function createDurableMarket(ctx: DurableObjectState) {
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS market_cache (key TEXT PRIMARY KEY, value BLOB NOT NULL, touched INTEGER NOT NULL)');
  return createMarketService({ store: {
    async get(key) { const row = ctx.storage.sql.exec<{ value: ArrayBuffer }>('SELECT value FROM market_cache WHERE key = ?', key).toArray()[0]; return row ? JSON.parse(gunzipSync(Buffer.from(row.value)).toString('utf8')) : undefined; },
    async set(key, value) {
      ctx.storage.sql.exec('INSERT OR REPLACE INTO market_cache VALUES (?, ?, ?)', key, gzipSync(JSON.stringify(value)), Date.now());
      ctx.storage.sql.exec("DELETE FROM market_cache WHERE key NOT IN ('items', 'throttle') AND key IN (SELECT key FROM market_cache ORDER BY touched DESC LIMIT -1 OFFSET 512)");
    },
  } });
}
