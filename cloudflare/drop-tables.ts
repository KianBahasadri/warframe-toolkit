import { DurableObject } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fetchLiveDropTables } from '../server/dropTables.ts';
import { DROP_REFRESH_INTERVAL_MS, DROP_RETRY_INTERVAL_MS } from '../src/lib/dropTables.ts';
import type { Env } from './index.ts';
import { createDurableMarket } from './market.ts';

type Metadata = { fetched_at: string | null; error: string | null; etag: string | null; next_attempt: number };
/** Official drops refresh only on schedules/alarms; WFM uses a separate object identity. */
export class DropTables extends DurableObject<Env> {
  // WFM uses a separate object identity in the existing public-data namespace.
  private market: ReturnType<typeof createDurableMarket> | undefined;
  private refreshing: Promise<void> | undefined;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK (id = 1), fetched_at TEXT, error TEXT, etag TEXT, next_attempt INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS chunks (id INTEGER PRIMARY KEY, contents BLOB NOT NULL)');
  }
  private meta() { return this.ctx.storage.sql.exec<Metadata>('SELECT * FROM metadata WHERE id = 1').toArray()[0]; }
  private compressed() { return Buffer.concat(this.ctx.storage.sql.exec<{ contents: ArrayBuffer }>('SELECT contents FROM chunks ORDER BY id').toArray().map(row => Buffer.from(row.contents))); }
  private publish(text: string, fetchedAt: string | null, error: string | null, next: number) {
    const bytes = gzipSync(text), etag = `"${createHash('sha256').update(bytes).digest('hex')}"`;
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      sql.exec('DELETE FROM chunks');
      for (let offset = 0, id = 0; offset < bytes.length; offset += 512 * 1024, id++) sql.exec('INSERT INTO chunks VALUES (?, ?)', id, bytes.subarray(offset, offset + 512 * 1024));
      sql.exec('INSERT OR REPLACE INTO metadata VALUES (1, ?, ?, ?, ?)', fetchedAt, error, etag, next);
    });
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    const meta = this.meta();
    if (meta && meta.next_attempt > Date.now()) { await this.ctx.storage.setAlarm(meta.next_attempt); return; }
    this.refreshing = this.update().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private async update() {
    // An alarm set before fetching also recovers from a terminated invocation.
    await this.ctx.storage.setAlarm(Date.now() + DROP_RETRY_INTERVAL_MS);
    try {
      const data = await fetchLiveDropTables();
      const next = Date.now() + DROP_REFRESH_INTERVAL_MS;
      this.publish(JSON.stringify({ ...data, refreshError: null }), data.fetchedAt, null, next);
      await this.ctx.storage.setAlarm(next);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'The official drop tables could not be updated.';
      const meta = this.meta(), next = Date.now() + DROP_RETRY_INTERVAL_MS;
      if (meta?.fetched_at) {
        const previous = JSON.parse(gunzipSync(this.compressed()).toString('utf8'));
        this.publish(JSON.stringify({ ...previous, refreshError: error }), meta.fetched_at, error, next);
      } else this.ctx.storage.sql.exec('INSERT OR REPLACE INTO metadata VALUES (1, NULL, ?, NULL, ?)', error, next);
      await this.ctx.storage.setAlarm(next);
    }
  }
  async alarm() { await this.refresh(); }
  async fetch(request: Request) {
    if (new URL(request.url).pathname.startsWith('/api/wfm/')) return (this.market ??= createDurableMarket(this.ctx, this.env)).handle(request);
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    const meta = this.meta();
    if (!meta?.fetched_at) return Response.json({ error: meta?.error || 'The first drop-table update is being prepared.', refreshing: !meta?.error }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': meta?.error ? '60' : '5' } });
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'ETag': meta.etag!, 'Vary': 'Accept-Encoding', 'X-Content-Type-Options': 'nosniff' });
    if (request.headers.get('If-None-Match') === meta.etag) return new Response(null, { status: 304, headers });
    // Keep stored data compressed; identity clients decompress as a stream.
    const compressed = this.compressed();
    if (/(?:^|,)\s*gzip\s*(?:,|$|;(?!\s*q=0(?:\.0*)?\s*(?:,|$)))/i.test(request.headers.get('Accept-Encoding') || '')) {
      headers.set('Content-Encoding', 'gzip');
      return new Response(compressed, { headers, encodeBody: 'manual' });
    }
    const stream = new Response(compressed).body!.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream, { headers });
  }
}
