import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDropTableCache } from '../server/dropTableCache.ts';
import { parseDropTables } from '../src/lib/dropTableParser.ts';
import { DROP_REFRESH_INTERVAL_MS, DROP_RETRY_INTERVAL_MS, isDropDataset } from '../src/lib/dropTables.ts';
import type { DropDataset } from '../src/lib/dropTables.ts';

const html = await readFile(new URL('./fixtures/drop-tables.html', import.meta.url), 'utf8');
const baseTime = Date.parse('2026-01-02T12:00:00.000Z');
const dataset = (time = baseTime) => parseDropTables(html, new Date(time).toISOString());

async function serve(t: TestContext, cache: ReturnType<typeof createDropTableCache>) {
  const server = createServer((request, response) => cache.middleware(request, response, () => { response.statusCode = 404; response.end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { cache.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/api/droptables`;
}

async function harness(t: TestContext, initial?: string) {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-drop-cache-'));
  const cacheFile = join(directory, 'drop-tables.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  if (initial !== undefined) await writeFile(cacheFile, initial);
  let time = baseTime, calls = 0;
  let fetchData: (signal: AbortSignal) => Promise<DropDataset> = async () => dataset(time);
  let scheduled: { callback: () => Promise<void>; due: number } | undefined;
  const warnings: string[] = [];
  const options = {
    cacheFile, now: () => time, warn: (message: string) => warnings.push(message),
    fetchData: (signal: AbortSignal) => { calls++; return fetchData(signal); },
    schedule: (callback: () => Promise<void>, delay: number) => { const task = { callback, due: time + delay }; scheduled = task; return () => { if (scheduled === task) scheduled = undefined; }; },
  };
  const cache = createDropTableCache(options), url = await serve(t, cache);
  return {
    cache, url, options, directory, cacheFile, warnings, calls: () => calls,
    setFetcher: (next: typeof fetchData) => { fetchData = next; },
    async advance(ms: number) { time += ms; if (scheduled && scheduled.due <= time) { const task = scheduled; scheduled = undefined; await task.callback(); } },
  };
}

test('HTTP reads use the disk snapshot; only scheduled updates fetch upstream, and fresh cache survives restart', async t => {
  const h = await harness(t, JSON.stringify(dataset()));
  await h.cache.start();
  const response = await fetch(h.url);
  assert.equal(response.status, 200); assert.equal((await response.json()).fetchedAt, dataset().fetchedAt);
  for (let i = 0; i < 3; i++) assert.equal((await fetch(h.url)).status, 200);
  const unchanged = await fetch(h.url, { headers: { 'If-None-Match': response.headers.get('etag')! } });
  assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), ''); assert.equal(h.calls(), 0);
  await h.advance(DROP_REFRESH_INTERVAL_MS - 1); assert.equal(h.calls(), 0);
  await h.advance(1); assert.equal(h.calls(), 1);
  const fresh = await (await fetch(h.url)).json();
  assert.equal(fresh.fetchedAt, new Date(baseTime + DROP_REFRESH_INTERVAL_MS).toISOString());
  assert.equal(JSON.parse(await readFile(h.cacheFile, 'utf8')).fetchedAt, fresh.fetchedAt);
  h.cache.stop();
  const restarted = createDropTableCache(h.options), restartUrl = await serve(t, restarted);
  await restarted.start();
  assert.equal((await (await fetch(restartUrl)).json()).fetchedAt, fresh.fetchedAt); assert.equal(h.calls(), 1);
  assert.equal((await fetch(restartUrl, { method: 'POST' })).status, 405); assert.equal(h.calls(), 1);
});

test('stale cache is immediately readable during updates; failed updates retain its timestamp and recover on schedule', async t => {
  const original = dataset(baseTime - DROP_REFRESH_INTERVAL_MS);
  const h = await harness(t, JSON.stringify(original));
  let rejectUpdate!: (error: Error) => void, signalStarted!: () => void;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  h.setFetcher(() => new Promise((_, reject) => { rejectUpdate = reject; signalStarted(); }));
  const startup = h.cache.start(); await started;
  const during = await fetch(h.url, { signal: AbortSignal.timeout(1000) });
  assert.equal((await during.json()).fetchedAt, original.fetchedAt); assert.equal(h.calls(), 1);
  rejectUpdate(new Error('Official page unavailable')); await startup;
  const staleResponse = await fetch(h.url), stale = await staleResponse.json();
  assert.equal(stale.refreshError, 'Official page unavailable'); assert.equal(stale.fetchedAt, original.fetchedAt);
  assert.deepEqual(JSON.parse(await readFile(h.cacheFile, 'utf8')), original);
  h.setFetcher(async () => dataset(baseTime + DROP_RETRY_INTERVAL_MS));
  await h.advance(DROP_RETRY_INTERVAL_MS);
  const recoveredResponse = await fetch(h.url, { headers: { 'If-None-Match': staleResponse.headers.get('etag')! } });
  const recovered = await recoveredResponse.json();
  assert.equal(recoveredResponse.status, 200); assert.equal(recovered.refreshError, null);
  assert.equal(recovered.fetchedAt, new Date(baseTime + DROP_RETRY_INTERVAL_MS).toISOString()); assert.equal(h.calls(), 2);
});

test('first-run reads never trigger fetching and stopping the server cancels its job and future timers', async t => {
  const h = await harness(t);
  const empty = await fetch(h.url); assert.equal(empty.status, 503); assert.equal(h.calls(), 0);
  let signalStarted!: () => void;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  let aborted = false;
  h.setFetcher(signal => new Promise((_, reject) => { signalStarted(); signal.addEventListener('abort', () => { aborted = true; reject(new Error('Stopped')); }, { once: true }); }));
  const startup = h.cache.start(); await started;
  assert.equal((await (await fetch(h.url)).json()).refreshing, true);
  h.cache.stop(); await startup;
  await h.advance(DROP_REFRESH_INTERVAL_MS * 2);
  assert.equal(aborted, true); assert.equal(h.calls(), 1);
});

test('malformed disk data is preserved before recovery and invalid responses cannot replace good data', async t => {
  const h = await harness(t, '{broken');
  await h.cache.start();
  const backup = (await readdir(h.directory)).find(name => name.includes('.invalid-'))!;
  assert.ok(backup); assert.equal(await readFile(join(h.directory, backup), 'utf8'), '{broken'); assert.equal(h.warnings.length, 1);
  assert.ok(isDropDataset(JSON.parse(await readFile(h.cacheFile, 'utf8'))));
  h.setFetcher(async () => ({ ...dataset(), fetchedAt: 'not a date' }));
  await h.advance(DROP_REFRESH_INTERVAL_MS);
  const retained = await (await fetch(h.url)).json();
  assert.equal(retained.fetchedAt, dataset().fetchedAt); assert.match(retained.refreshError, /unrecognized/);
  assert.equal(isDropDataset({ ...dataset(), rows: [{ ...dataset().rows[0], chance: 500 }] }), false);
});
