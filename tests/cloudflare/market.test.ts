import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudflareRuntime } from './runtime.ts';
import { wfmHistory, wfmItems, wfmOrders } from '../fixtures/wfm.ts';

test('public WFM reads share a paced, persistent cache separate from accounts and official drops', async () => {
  const persist = await mkdtemp(join(tmpdir(), 'toolkit-wfm-'));
  const calls: { url: string; headers: Headers; time: number }[] = [];
  const outbound = async (request: Request) => {
    calls.push({ url: request.url, headers: request.headers, time: Date.now() });
    assert.equal(request.headers.get('Cookie'), null); assert.equal(request.headers.get('Authorization'), null);
    assert.equal(new URL(request.url).host, 'api.warframe.market');
    return Response.json(request.url.endsWith('/v2/items') ? wfmItems : request.url.endsWith('/statistics') ? wfmHistory() : wfmOrders());
  };
  let api = await cloudflareRuntime({ persist, outbound });
  const read = (path: string) => api.mf.dispatchFetch(`https://toolkit.test/api/wfm/${path}`);
  try {
    const responses = await Promise.all([read('orders/ash_prime_set'), read('orders/ash_prime_set'), read('history/ash_prime_set')]);
    assert.ok(responses.every(response => response.status === 200));
    const data = await responses[0].json(); assert.deepEqual(await responses[1].json(), data);
    assert.equal(calls.length, 3);
    for (let index = 1; index < calls.length; index++) assert.ok(calls[index].time - calls[index - 1].time >= 400, 'shared queue spaces all API requests');
    await read('orders/ash_prime_set?platform=switch'); assert.equal(calls.length, 4);
    assert.equal(calls.at(-1)!.headers.get('Platform'), 'switch');
    await api.close(); api = await cloudflareRuntime({ persist, outbound });
    assert.deepEqual(await (await read('orders/ash_prime_set')).json(), data);
    assert.equal(calls.length, 4, 'normalized cache survives a restart');
    assert.equal((await api.mf.dispatchFetch('https://toolkit.test/api/droptables')).status, 503);
    assert.equal(calls.length, 4, 'drop reads cannot trigger market requests');
    assert.equal((await api.mf.dispatchFetch('https://toolkit.test/api/wfm/items', { method: 'POST' })).status, 405);
    assert.equal((await read('orders/unknown')).status, 404); assert.equal(calls.length, 4);
  } finally { await api.close(); await rm(persist, { recursive: true, force: true }); }
});
