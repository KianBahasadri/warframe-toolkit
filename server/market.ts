import { MARKET_HISTORY_TTL, MARKET_ITEMS_TTL, MARKET_ORDERS_TTL, marketPlatforms, parseMarketHistory, parseMarketItems, parseMarketOrders } from '../src/lib/market.ts';
import type { MarketItem, MarketSnapshot } from '../src/lib/market.ts';
import { MARKET_ORIGIN, marketHeaders } from './marketUpstream.ts';

export interface MarketCacheStore { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }
interface Cached { data?: unknown; fetchedAt?: string; retryAt: number; error?: string; touched: number }
interface QueuedTask {
  key: string; path: string; platform: string; parse: (value: unknown) => unknown;
  enqueuedAt: number; promise: Promise<Cached>; resolve: (value: Cached) => void;
}
type Options = {
  fetch?: typeof fetch; now?: () => number; pause?: (ms: number) => Promise<void>;
  random?: () => number; store?: MarketCacheStore; waitUntil?: (promise: Promise<unknown>) => void;
};

/** One shared queue covers both WFM API versions and every platform. */
export function createMarketService(options: Options = {}) {
  const request = options.fetch ?? fetch, now = options.now ?? Date.now, random = options.random ?? Math.random;
  const pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const cache = new Map<string, Cached>(), queued = new Map<string, QueuedTask>(), inflight = new Map<string, Promise<Cached>>();
  const abort = new AbortController();
  let worker: Promise<void> | undefined, nextAt = 0, initialized = false;

  async function initThrottle() {
    if (initialized) return;
    const saved = await options.store?.get('throttle').catch(() => undefined);
    if (!initialized && typeof saved === 'number') nextAt = Math.min(saved, now() + 15 * 60_000);
    initialized = true;
  }

  async function readEntry(key: string): Promise<Cached | undefined> {
    let entry = cache.get(key);
    if (!entry) {
      const saved = await options.store?.get(key).catch(() => undefined) as Cached | undefined;
      if (saved && typeof saved.retryAt === 'number' && (!saved.fetchedAt || Number.isFinite(Date.parse(saved.fetchedAt)))) {
        entry = saved;
        cache.set(key, entry);
      }
    }
    return entry;
  }

  function pickNext(): QueuedTask | undefined {
    const items = [...queued.values()];
    if (!items.length) return undefined;
    const coldCatalog = items.find(item => item.key === 'items' && !cache.get('items')?.fetchedAt);
    if (coldCatalog) {
      queued.delete(coldCatalog.key);
      return coldCatalog;
    }
    if (items.length === 1) {
      queued.delete(items[0].key);
      return items[0];
    }
    const current = now();
    let total = 0;
    const weights = items.map(item => {
      const weight = 1000 + Math.max(0, current - item.enqueuedAt);
      total += weight;
      return weight;
    });
    let roll = random() * total;
    for (let index = 0; index < items.length; index++) {
      roll -= weights[index];
      if (roll <= 0) {
        const chosen = items[index];
        queued.delete(chosen.key);
        return chosen;
      }
    }
    const chosen = items[items.length - 1];
    queued.delete(chosen.key);
    return chosen;
  }

  async function fetchUpstream(path: string, platform: string) {
    if (abort.signal.aborted) throw new Error('Market service stopped.');
    await initThrottle();
    if (nextAt > now()) await pause(nextAt - now());
    if (abort.signal.aborted) throw new Error('Market service stopped.');
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
  }

  async function drain() {
    await Promise.resolve();
    while (queued.size > 0 && !abort.signal.aborted) {
      await initThrottle();
      if (nextAt > now()) await pause(nextAt - now());
      if (abort.signal.aborted) break;
      const task = pickNext();
      if (!task) break;
      inflight.set(task.key, task.promise);
      try {
        const existing = await readEntry(task.key);
        let entry: Cached;
        try {
          const data = task.parse(await fetchUpstream(task.path, task.platform));
          entry = { data, fetchedAt: new Date(now()).toISOString(), retryAt: 0, touched: now() };
        } catch (cause) {
          entry = {
            ...existing,
            touched: now(),
            retryAt: Math.max(now() + 30_000, nextAt),
            error: cause instanceof Error && !['SyntaxError', 'TypeError', 'TimeoutError', 'AbortError'].includes(cause.name) ? cause.message : 'Could not reach Warframe Market.',
          };
        }
        cache.set(task.key, entry);
        if (cache.size > 512) { const oldest = [...cache].sort((a, b) => a[1].touched - b[1].touched)[0]; cache.delete(oldest[0]); }
        await options.store?.set(task.key, entry).catch(() => {});
        task.resolve(entry);
      } finally {
        inflight.delete(task.key);
      }
    }
    if (abort.signal.aborted && queued.size > 0) {
      for (const task of queued.values()) task.resolve({ ...cache.get(task.key), touched: now(), retryAt: now() + 30_000, error: 'Market service stopped.' });
      queued.clear();
    }
  }

  function enqueue(key: string, path: string, platform: string, parse: (value: unknown) => unknown): Promise<Cached> {
    if (inflight.has(key)) return inflight.get(key)!;
    if (queued.has(key)) return queued.get(key)!.promise;
    let resolve!: (value: Cached) => void;
    const promise = new Promise<Cached>(done => { resolve = done; });
    queued.set(key, { key, path, platform, parse, enqueuedAt: now(), promise, resolve });
    if (!worker) {
      worker = drain().finally(() => { worker = undefined; });
      options.waitUntil?.(worker);
    }
    return promise;
  }

  async function get(key: string, ttl: number, path: string, platform: string, parse: (value: unknown) => unknown, background = false): Promise<{ entry: Cached; refreshing: boolean }> {
    const entry = await readEntry(key);
    const pending = queued.has(key) || inflight.has(key);
    const fresh = Boolean(entry?.fetchedAt && Date.parse(entry.fetchedAt) + ttl > now() && !entry.error);
    if (entry && fresh) {
      cache.set(key, { ...entry, touched: now() });
      return { entry, refreshing: false };
    }
    await initThrottle();
    const backedOff = Math.max(entry?.retryAt ?? 0, nextAt >= now() + 5000 ? nextAt : 0);
    if (entry?.fetchedAt && backedOff > now() && !pending) {
      cache.set(key, { ...entry, touched: now() });
      return { entry: { ...entry, retryAt: backedOff }, refreshing: false };
    }
    if (entry?.fetchedAt) {
      cache.set(key, { ...entry, touched: now() });
      if (!pending && queued.size + inflight.size >= 512) {
        return { entry: { ...entry, touched: now(), retryAt: now() + 30_000, error: 'Market prices are queued. Retry shortly.' }, refreshing: false };
      }
      void enqueue(key, path, platform, parse);
      return { entry, refreshing: true };
    }
    if (entry && backedOff > now() && !pending) return { entry: { ...entry, retryAt: backedOff }, refreshing: false };
    if (!pending && queued.size + inflight.size >= 64) {
      return { entry: { ...entry, touched: now(), retryAt: now() + 30_000, error: 'Market prices are queued. Retry shortly.' }, refreshing: false };
    }
    const busy = inflight.size > 0 || queued.size > 0 || nextAt > now();
    if (background && key !== 'items' && busy) {
      void enqueue(key, path, platform, parse);
      return { entry: { retryAt: now() + 1500, touched: now() }, refreshing: true };
    }
    return { entry: await enqueue(key, path, platform, parse), refreshing: false };
  }

  const catalog = () => get('items', MARKET_ITEMS_TTL, 'v2/items', 'pc', parseMarketItems);
  function response({ entry, refreshing }: { entry: Cached; refreshing: boolean }) {
    const retryMs = refreshing ? 1500 : Math.max(0, entry.retryAt - now());
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(retryMs > 0 ? { 'Retry-After': String(Math.ceil(retryMs / 1000)) } : {}) };
    if (!entry.fetchedAt) {
      if (refreshing) return Response.json({ refreshing: true, retryAt: new Date(now() + retryMs).toISOString() }, { status: 202, headers });
      return Response.json({ error: entry.error, retryAt: new Date(entry.retryAt).toISOString() }, { status: 503, headers });
    }
    const stale = refreshing || Boolean(entry.error);
    const snapshot: MarketSnapshot<unknown> = {
      data: entry.data,
      fetchedAt: entry.fetchedAt,
      stale,
      ...(refreshing ? { refreshing: true, retryAt: new Date(now() + retryMs).toISOString() } : {}),
      ...(entry.error ? { error: entry.error, ...(!refreshing && entry.retryAt > now() ? { retryAt: new Date(entry.retryAt).toISOString() } : {}) } : {}),
    };
    return Response.json(snapshot, { headers });
  }
  return {
    stop: () => abort.abort(),
    flush: () => worker ?? Promise.resolve(),
    async handle(req: Request): Promise<Response> {
      if (req.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
      const url = new URL(req.url), route = /^\/api\/wfm\/(items|orders|history)(?:\/([a-z0-9_]{1,100}))?$/.exec(url.pathname);
      const platform = url.searchParams.get('platform') ?? 'pc';
      if (!route || !marketPlatforms.some(option => option.value === platform) || [...url.searchParams.keys()].some(key => key !== 'platform') || url.searchParams.getAll('platform').length > 1 || (route[1] === 'items') === Boolean(route[2])) return Response.json({ error: 'Unknown market request.' }, { status: 400 });
      const items = await catalog();
      if (route[1] === 'items' || !items.entry.fetchedAt) return response(items);
      if (!(items.entry.data as MarketItem[]).some(item => item.slug === route[2])) return Response.json({ error: 'Item not listed on Warframe Market.' }, { status: 404 });
      const history = route[1] === 'history', background = req.headers.get('X-Market-Background') === '1';
      return response(await get(`${route[1]}:${platform}:${route[2]}`, history ? MARKET_HISTORY_TTL : MARKET_ORDERS_TTL,
        history ? `v1/items/${route[2]}/statistics` : `v2/orders/item/${route[2]}`, platform, history ? parseMarketHistory : parseMarketOrders, background));
    },
  };
}
