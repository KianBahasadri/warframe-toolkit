import { useEffect, useState, useSyncExternalStore } from 'react';
import { MARKET_HISTORY_TTL, MARKET_ITEMS_TTL, MARKET_ORDERS_TTL, marketIndex, marketPlatforms, quoteMarketOrders, resolveMarketTarget } from './market';
import type { MarketIndex, MarketItem, MarketOrder, MarketPlatform, MarketQuote, MarketSnapshot, MarketSubject, MarketTarget } from './market';

export interface MarketResource<T> { snapshot?: MarketSnapshot<T>; loading: boolean; error?: string; retryAt?: number }
const resources = new Map<string, MarketResource<unknown>>(), listeners = new Map<string, Set<() => void>>();
const tasks: { path: string; run: () => Promise<void> }[] = [], promises = new Map<string, Promise<void>>();
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>(), prefetched = new Set<string>();
const allListeners = new Set<() => void>();
let running = 0, revision = 0, notification: ReturnType<typeof setTimeout> | undefined;
let platform: MarketPlatform = 'pc';
try { const saved = localStorage.getItem('grakata.wfm-platform'); if (marketPlatforms.some(item => item.value === saved)) platform = saved as MarketPlatform; } catch { /* Public preference only. */ }
const platformListeners = new Set<() => void>();
export const getMarketPlatform = () => platform;
export function setMarketPlatform(value: MarketPlatform) {
  platform = value;
  try { localStorage.setItem('grakata.wfm-platform', value); } catch { /* Keep the current view usable. */ }
  platformListeners.forEach(listener => listener());
  changed('platform');
}
export const marketPath = (kind: 'orders' | 'history', slug: string, selected = platform) => `/api/wfm/${kind}/${slug}?platform=${selected}`;
export const marketCatalogPath = '/api/wfm/items';
export function marketResource<T>(path: string): MarketResource<T> {
  if (!resources.has(path)) resources.set(path, { loading: false });
  return resources.get(path)! as MarketResource<T>;
}
function changed(path: string) {
  listeners.get(path)?.forEach(listener => listener());
  if (!notification) notification = setTimeout(() => { notification = undefined; revision++; allListeners.forEach(listener => listener()); }, 100);
}
function publish(path: string, value: MarketResource<unknown>) { resources.set(path, value); changed(path); }
function scheduleRefresh(path: string, retryAt: number) {
  if (refreshTimers.has(path)) return;
  const timer = setTimeout(() => {
    refreshTimers.delete(path);
    if ((listeners.get(path)?.size ?? 0) > 0 || prefetched.has(path)) void loadMarket(path);
  }, Math.max(250, retryAt - Date.now()));
  refreshTimers.set(path, timer);
}
function pump() {
  while (running < 12 && tasks.length) {
    const task = tasks.shift()!; running++;
    void task.run().finally(() => { running--; pump(); });
  }
}
export function loadMarket(path: string, priority = false): Promise<void> {
  const current = marketResource(path), ttl = path === marketCatalogPath ? MARKET_ITEMS_TTL : path.includes('/history/') ? MARKET_HISTORY_TTL : MARKET_ORDERS_TTL;
  if (promises.has(path)) {
    if (priority) { const index = tasks.findIndex(task => task.path === path); if (index >= 0) tasks.unshift(...tasks.splice(index, 1)); }
    return promises.get(path)!;
  }
  if ((current.retryAt ?? 0) > Date.now() || current.snapshot && !current.snapshot.stale && Date.parse(current.snapshot.fetchedAt) + ttl > Date.now()) return Promise.resolve();
  let finish!: () => void;
  const promise = new Promise<void>(resolve => { finish = resolve; }); promises.set(path, promise);
  publish(path, { ...current, loading: !current.snapshot });
  const task = { path, async run() {
    try {
      const response = await fetch(path, { signal: AbortSignal.timeout(90_000), headers: { Accept: 'application/json', 'X-Market-Background': '1' } });
      const body = await response.json();
      if (response.status === 202 && body?.refreshing) {
        const wait = Number(response.headers.get('Retry-After')) * 1000;
        const retryAt = body.retryAt ? Date.parse(body.retryAt) : Date.now() + (Number.isFinite(wait) && wait > 0 ? wait : 1500);
        publish(path, { ...current, loading: !current.snapshot, error: undefined, retryAt });
        scheduleRefresh(path, retryAt);
      } else if (!response.ok || !body || !Number.isFinite(Date.parse(body.fetchedAt)) || !('data' in body) || (path.includes('/history/') ? !Array.isArray(body.data?.['90days']) : !Array.isArray(body.data))) {
        const wait = Number(response.headers.get('Retry-After')) * 1000;
        publish(path, { ...current, loading: false, error: typeof body?.error === 'string' ? body.error : 'WFM prices are unavailable.', retryAt: Math.max(Date.now() + 30_000, Date.now() + (Number.isFinite(wait) ? wait : 0)) });
      } else {
        const retryAt = body.retryAt ? Date.parse(body.retryAt) : body.refreshing ? Date.now() + 1500 : undefined;
        publish(path, { snapshot: body, loading: false, error: body.error, retryAt });
        if (body.refreshing && retryAt) scheduleRefresh(path, retryAt);
      }
    } catch { publish(path, { ...current, loading: false, error: 'Could not load WFM prices. Previously fetched prices are retained.', retryAt: Date.now() + 30_000 }); }
    finally { promises.delete(path); finish(); }
  } };
  if (priority) tasks.unshift(task); else tasks.push(task);
  pump(); return promise;
}
export function useMarketResource<T>(path: string, enabled = true) {
  const state = useSyncExternalStore(callback => { if (!enabled) return () => {}; if (!listeners.has(path)) listeners.set(path, new Set()); listeners.get(path)!.add(callback); return () => { listeners.get(path)?.delete(callback); }; }, () => marketResource<T>(path));
  useEffect(() => {
    if (!enabled) return;
    void loadMarket(path);
    const refresh = () => { if (!document.hidden) void loadMarket(path); };
    const timer = setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [path, enabled]);
  return state;
}
export function useMarketPlatform() { return useSyncExternalStore(callback => { platformListeners.add(callback); return () => { platformListeners.delete(callback); }; }, getMarketPlatform); }
export function useMarketRevision() { return useSyncExternalStore(callback => { allListeners.add(callback); return () => { allListeners.delete(callback); }; }, () => revision); }
let indexed: MarketItem[] | undefined, index: MarketIndex | undefined;
export function marketTarget(subject: MarketSubject): MarketTarget | null {
  const items = marketResource<MarketItem[]>(marketCatalogPath).snapshot?.data;
  if (!items) return null;
  if (indexed !== items) { indexed = items; index = marketIndex(items); }
  return resolveMarketTarget(subject, index!);
}
const quotes = new WeakMap<MarketOrder[], Map<string, MarketQuote>>();
export function marketQuote(target: MarketTarget, selected = platform): MarketQuote | undefined {
  const orders = marketResource<MarketOrder[]>(marketPath('orders', target.item.slug, selected)).snapshot?.data;
  if (!orders) return undefined;
  if (!quotes.has(orders)) quotes.set(orders, new Map());
  const key = JSON.stringify(target.variant), known = quotes.get(orders)!;
  if (!known.has(key)) known.set(key, quoteMarketOrders(orders, target.variant));
  return known.get(key)!;
}
export function marketPrice(subject: MarketSubject): number | null { const target = marketTarget(subject); return target ? marketQuote(target)?.price ?? null : null; }

/** Sorting/filtering explicitly resolves the whole candidate scope, not just
 * currently visible cells. Changing scope stops enqueueing the previous scope. */
export function useMarketPrefetch(subjects: MarketSubject[], active: boolean) {
  const selected = useMarketPlatform(), currentRevision = useMarketRevision();
  const [paths, setPaths] = useState<string[]>([]), [catalogPending, setCatalogPending] = useState(false);
  const key = JSON.stringify(subjects);
  useEffect(() => {
    let canceled = false;
    if (!active) { setPaths([]); prefetched.clear(); return; }
    setCatalogPending(true);
    void (async () => {
      await loadMarket(marketCatalogPath);
      if (canceled) return;
      const nextPaths = [...new Set((JSON.parse(key) as MarketSubject[]).flatMap(subject => { const target = marketTarget(subject); return target ? [marketPath('orders', target.item.slug, selected)] : []; }))];
      prefetched.clear();
      for (const path of nextPaths) prefetched.add(path);
      setPaths(nextPaths); setCatalogPending(false);
      for (let index = 0; index < nextPaths.length && !canceled; index += 12) await Promise.all(nextPaths.slice(index, index + 12).map(path => loadMarket(path)));
    })();
    return () => { canceled = true; prefetched.clear(); };
  }, [key, active, selected]);
  void currentRevision;
  const loaded = paths.filter(path => { const entry = marketResource(path); return entry.snapshot || entry.error; }).length;
  return active && (catalogPending || loaded < paths.length) ? `WFM prices ${loaded}/${paths.length || '…'}` : '';
}
