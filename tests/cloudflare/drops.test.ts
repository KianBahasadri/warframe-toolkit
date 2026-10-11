import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudflareRuntime } from './runtime.ts';

test('scheduled drop updates persist, support conditional reads, and retain the last success after failures', async () => {
  const html = await readFile('tests/fixtures/drop-tables.html', 'utf8');
  const persist = await mkdtemp(join(tmpdir(), 'toolkit-drops-'));
  let calls = 0, failed = false;
  const outbound = async () => { calls++; return new Response(failed ? 'offline' : html, { status: failed ? 503 : 200, headers: { 'Content-Type': 'text/html' } }); };
  let api = await cloudflareRuntime({ persist, outbound });
  const read = (headers = {}) => api.mf.dispatchFetch('https://toolkit.test/api/droptables', { headers });
  const refresh = async () => {
    const namespace = await api.mf.getDurableObjectNamespace('DROPS');
    await (namespace.get(namespace.idFromName('official-pc')) as any).refresh();
  };
  try {
    assert.equal((await read()).status, 503); assert.equal(calls, 0);
    const scheduled = await api.mf.dispatchFetch('https://toolkit.test/cdn-cgi/local/scheduled?format=json');
    assert.equal(scheduled.status, 200);
    assert.equal((await scheduled.json() as any).outcome, 'ok');
    assert.equal(calls, 1);
    const first = await read(), etag = first.headers.get('etag')!, data = await first.json() as any;
    assert.equal(first.status, 200); assert.ok(data.rows.length > 10); assert.equal(data.refreshError, null);
    assert.equal((await read({ 'If-None-Match': etag })).status, 304);
    await refresh(); assert.equal(calls, 1, 'clock ticks before due time must not refetch');
    await api.close(); api = await cloudflareRuntime({ persist, outbound });
    assert.deepEqual(await (await read()).json(), data); assert.equal(calls, 1);
    const storage = await api.mf.unsafeGetDurableObjectStorage('warframe-toolkit', 'DropTables', { name: 'official-pc' });
    await storage.exec('UPDATE metadata SET next_attempt = 0');
    failed = true; await refresh();
    const stale = await (await read()).json() as any;
    assert.deepEqual(stale.rows, data.rows); assert.equal(stale.fetchedAt, data.fetchedAt); assert.match(stale.refreshError, /503/);
    assert.equal(calls, 2);
    assert.notEqual((await read()).headers.get('etag'), etag);
    assert.equal((await api.mf.dispatchFetch('https://toolkit.test/api/droptables', { method: 'POST' })).status, 405);
    assert.equal(calls, 2, 'page reads and unsupported methods never refresh upstream');
    await storage.exec('UPDATE metadata SET next_attempt = 0');
    failed = false; await refresh();
    assert.equal((await (await read()).json() as any).refreshError, null);
    assert.equal(calls, 3);
  } finally { await api.close(); await rm(persist, { recursive: true, force: true }); }
});
