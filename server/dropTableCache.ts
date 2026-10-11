import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { DROP_REFRESH_INTERVAL_MS, DROP_RETRY_INTERVAL_MS, isDropDataset } from '../src/lib/dropTables.ts';
import type { DropDataset } from '../src/lib/dropTables.ts';
import { fetchLiveDropTables } from './dropTables.ts';

const compress = promisify(gzip);
type Timer = (callback: () => Promise<void>, delay: number) => () => void;
const schedule: Timer = (callback, delay) => { const timer = setTimeout(() => void callback(), delay); timer.unref(); return () => clearTimeout(timer); };
type Options = { cacheFile?: string; fetchData?: (signal: AbortSignal) => Promise<DropDataset>; now?: () => number; schedule?: Timer; warn?: (message: string) => void };

/** Only the server's clock retrieves upstream data. HTTP reads never start or await a refresh. */
export function createDropTableCache(options: Options = {}) {
  const cacheFile = options.cacheFile ?? resolve('.cache/drop-tables.json');
  const fetchData = options.fetchData ?? (signal => fetchLiveDropTables(fetch, signal));
  const now = options.now ?? Date.now, setTimer = options.schedule ?? schedule, warn = options.warn ?? console.warn;
  let data: DropDataset | null = null;
  let body: { plain: Buffer; compressed: Buffer; etag: string } | null = null;
  let error = '', active = false, refreshing = false, writable = true;
  let cancelTimer: (() => void) | undefined, controller: AbortController | undefined, startup: Promise<void> | undefined;

  async function publish() {
    if (!data) return;
    const plain = Buffer.from(JSON.stringify({ ...data, refreshError: error || null }));
    body = { plain, compressed: await compress(plain), etag: `"${createHash('sha256').update(plain).digest('hex')}"` };
  }

  async function persist(snapshot: DropDataset) {
    if (!writable) return;
    const temporary = `${cacheFile}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(cacheFile), { recursive: true });
      await writeFile(temporary, JSON.stringify(snapshot));
      await rename(temporary, cacheFile);
    } catch (cause) { warn(`Drop-table data is available in memory, but the local cache could not be saved: ${String(cause)}`); }
    finally { await unlink(temporary).catch(() => {}); }
  }

  function next(delay: number) {
    cancelTimer?.();
    if (active) cancelTimer = setTimer(refresh, delay);
  }

  async function refresh() {
    if (!active || refreshing) return;
    refreshing = true; controller = new AbortController();
    let delay = DROP_RETRY_INTERVAL_MS;
    try {
      const result = await fetchData(controller.signal);
      if (!active) return;
      if (!isDropDataset(result)) throw new Error('The automatic update returned unrecognized drop-table data.');
      data = result; error = '';
      await publish();
      await persist(result);
      delay = DROP_REFRESH_INTERVAL_MS;
    } catch (cause) {
      if (!active) return;
      error = cause instanceof Error && !['TimeoutError', 'TypeError'].includes(cause.name) ? cause.message : 'Could not reach the official drop tables.';
      await publish();
    } finally { refreshing = false; next(delay); }
  }

  async function initialize() {
    try {
      const cached: unknown = JSON.parse(await readFile(cacheFile, 'utf8'));
      if (!isDropDataset(cached)) throw new Error('Unrecognized cached data');
      if (!active) return;
      data = cached; await publish();
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Preserve malformed cache contents before writing a recovered public snapshot.
        const backup = `${cacheFile}.invalid-${randomUUID()}`;
        try { await rename(cacheFile, backup); warn(`Unreadable drop-table cache preserved at ${backup}: ${String(cause)}`); }
        catch { writable = false; warn(`Unreadable drop-table cache left untouched at ${cacheFile}: ${String(cause)}`); }
      }
    }
    if (!active) return;
    const remaining = data ? Math.min(DROP_REFRESH_INTERVAL_MS, Date.parse(data.fetchedAt) + DROP_REFRESH_INTERVAL_MS - now()) : 0;
    if (remaining > 0) next(remaining); else await refresh();
  }

  return {
    start() { if (!startup) { active = true; startup = initialize(); } return startup; },
    stop() { active = false; cancelTimer?.(); controller?.abort(); },
    middleware(request: IncomingMessage, response: ServerResponse, next: () => void) {
      if (request.url?.split('?')[0] !== '/api/droptables') return next();
      response.setHeader('Cache-Control', 'no-cache');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (request.method !== 'GET') { response.statusCode = 405; response.setHeader('Allow', 'GET'); response.end(JSON.stringify({ error: 'Use GET to read cached drop tables.' })); return; }
      if (!body) {
        response.statusCode = 503; response.setHeader('Retry-After', error ? '60' : '5');
        response.end(JSON.stringify({ error: error || 'Waiting for the first automatic update.', refreshing: !error })); return;
      }
      response.setHeader('ETag', body.etag);
      response.setHeader('Vary', 'Accept-Encoding');
      if (request.headers['if-none-match'] === body.etag) { response.statusCode = 304; response.end(); return; }
      if (/\bgzip\b/.test(request.headers['accept-encoding'] ?? '')) { response.setHeader('Content-Encoding', 'gzip'); response.end(body.compressed); }
      else response.end(body.plain);
    },
  };
}
