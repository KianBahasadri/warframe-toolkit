import { MARKET_HISTORY_TTL, MARKET_ITEMS_TTL, MARKET_ORDERS_TTL, marketPlatforms, parseMarketHistory, parseMarketItems, parseMarketOrders } from '../src/lib/market.ts';
import type { MarketItem, MarketSnapshot } from '../src/lib/market.ts';
import { MARKET_ORIGIN, marketHeaders } from './marketUpstream.ts';

export interface MarketCacheStore { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }
interface Cached { data?: unknown; fetchedAt?: string; retryAt: number; error?: string; touched: number }
type Options = { fetch?: typeof fetch; now?: () => number; pause?: (ms: number) => Promise<void>; store?: MarketCacheStore };

/** One shared queue covers both WFM API versions and every platform. */
export function createMarketService(options: Options = {}) {
  const request = options.fetch ?? fetch, now = options.now ?? Date.now;
  const pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const cache = new Map<string, Cached>(), pending = new Map<string, Promise<Cached>>();
  const abort = new AbortController();
  let queue = Promise.resolve(), nextAt = 0, initialized = false;

  async function upstream(path: string, platform: string) {
    const run = queue.then(async () => {
      if (abort.signal.aborted) throw new Error('Market service stopped.');
      if (!initialized) {
        const saved = await options.store?.get('throttle').catch(() => undefined);
        if (typeof saved === 'number') nextAt = Math.min(saved, now() + 15 * 60_000);
        initialized = true;
      }
      if (nextAt > now()) await pause(nextAt - now());
      nextAt = now() + 1000;
      await options.store?.set('throttle', nextAt).catch(() => {});
      const response = await request(`${MARKET_ORIGIN}/${path}`, {
        headers: marketHeaders(platform), redirect: 'manual',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
      });
      if (!response.ok) {
        if (response.status === 429 || response.status === 509) {
          const header = response.headers.get('Retry-After') ?? '30';
          const delay = /^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now();
          nextAt = now() + Math.max(30_000, Math.min(15 * 60_000, Number.isFinite(delay) ? delay : 30_000));
          await options.store?.set('throttle', nextAt).catch(() => {});
        }
        if (response.headers.get('cf-mitigated') === 'challenge') throw new Error(`WFM is blocking requests from this server (${response.status}).`);
        throw new Error(response.status === 404 ? 'WFM has no data for this item.' : response.status === 429 || response.status === 509 ? 'WFM is rate limiting requests. Prices will retry shortly.' : `WFM is unavailable (${response.status}).`);
      }
      if (Number(response.headers.get('Content-Length') ?? 0) > 12_000_000) throw new Error('WFM response exceeded the size limit.');
      const text = await response.text();
      if (text.length > 12_000_000) throw new Error('WFM response exceeded the size limit.');
      return JSON.parse(text) as unknown;
    });
    queue = run.then(() => {}, () => {});
    return run;
  }
  async function get(key: string, ttl: number, path: string, platform: string, parse: (value: unknown) => unknown): Promise<Cached> {
    if (pending.has(key)) return pending.get(key)!;
    const work = (async () => {
      let entry = cache.get(key);
      if (!entry) {
        const saved = await options.store?.get(key).catch(() => undefined) as Cached | undefined;
        if (saved && typeof saved.retryAt === 'number' && (!saved.fetchedAt || Number.isFinite(Date.parse(saved.fetchedAt)))) entry = saved;
      }
      if (entry && (entry.retryAt > now() || entry.fetchedAt && Date.parse(entry.fetchedAt) + ttl > now())) { cache.set(key, { ...entry, touched: now() }); return entry; }
      if (pending.size > 64) return { ...entry, touched: now(), retryAt: now() + 30_000, error: 'Market prices are queued. Retry shortly.' };
      try {
        const data = parse(await upstream(path, platform));
        entry = { data, fetchedAt: new Date(now()).toISOString(), retryAt: 0, touched: now() };
      } catch (cause) {
        entry = { ...entry, touched: now(), retryAt: Math.max(now() + 30_000, nextAt), error: cause instanceof Error && !['SyntaxError', 'TypeError', 'TimeoutError', 'AbortError'].includes(cause.name) ? cause.message : 'Could not reach Warframe Market.' };
      }
      cache.set(key, entry);
      if (cache.size > 128) { const oldest = [...cache].sort((a, b) => a[1].touched - b[1].touched)[0]; cache.delete(oldest[0]); }
      await options.store?.set(key, entry).catch(() => {});
      return entry;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  const catalog = () => get('items', MARKET_ITEMS_TTL, 'v2/items', 'pc', parseMarketItems);
  function response(entry: Cached) {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(entry.retryAt > now() ? { 'Retry-After': String(Math.ceil((entry.retryAt - now()) / 1000)) } : {}) };
    if (!entry.fetchedAt) return Response.json({ error: entry.error, retryAt: new Date(entry.retryAt).toISOString() }, { status: 503, headers });
    const snapshot: MarketSnapshot<unknown> = { data: entry.data, fetchedAt: entry.fetchedAt, stale: Boolean(entry.error), ...(entry.error ? { error: entry.error, retryAt: new Date(entry.retryAt).toISOString() } : {}) };
    return Response.json(snapshot, { headers });
  }
  return {
    stop: () => abort.abort(),
    async handle(req: Request): Promise<Response> {
      if (req.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
      const url = new URL(req.url), route = /^\/api\/wfm\/(items|orders|history)(?:\/([a-z0-9_]{1,100}))?$/.exec(url.pathname);
      const platform = url.searchParams.get('platform') ?? 'pc';
      if (!route || !marketPlatforms.some(option => option.value === platform) || [...url.searchParams.keys()].some(key => key !== 'platform') || url.searchParams.getAll('platform').length > 1 || (route[1] === 'items') === Boolean(route[2])) return Response.json({ error: 'Unknown market request.' }, { status: 400 });
      const items = await catalog();
      if (route[1] === 'items' || !items.fetchedAt) return response(items);
      if (!(items.data as MarketItem[]).some(item => item.slug === route[2])) return Response.json({ error: 'Item not listed on Warframe Market.' }, { status: 404 });
      const history = route[1] === 'history';
      return response(await get(`${route[1]}:${platform}:${route[2]}`, history ? MARKET_HISTORY_TTL : MARKET_ORDERS_TTL,
        history ? `v1/items/${route[2]}/statistics` : `v2/orders/item/${route[2]}`, platform, history ? parseMarketHistory : parseMarketOrders));
    },
  };
}
