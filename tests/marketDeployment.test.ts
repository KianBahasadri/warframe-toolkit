import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMarket } from '../scripts/check-market.mjs';
import { parseMarketHistory, parseMarketItems, parseMarketOrders } from '../src/lib/market.ts';
import { wfmHistory, wfmItems, wfmOrders } from './fixtures/wfm.ts';

function fixture() {
  const calls: string[] = [], delays: number[] = [];
  const paths = ['items', 'orders/braton_prime_set?platform=pc', 'history/braton_prime_set?platform=pc'];
  const bodies = [parseMarketItems(wfmItems), parseMarketOrders(wfmOrders()), parseMarketHistory(wfmHistory())]
    .map(data => ({ data, fetchedAt: new Date().toISOString(), stale: false }));
  const responses = new Map(paths.map((path, index) => [path, () => Response.json(bodies[index])]));
  return { paths, bodies, responses, calls, delays, options: {
    request: async (url: URL) => {
      assert.equal(url.origin, 'https://toolkit.test');
      assert.ok(url.pathname.startsWith('/api/wfm/'));
      const path = url.pathname.slice('/api/wfm/'.length) + url.search;
      calls.push(path); return responses.get(path)!();
    },
    pause: async (ms: number) => { delays.push(ms); },
  } };
}

test('production smoke check exercises real proxy routes for catalog, orders and history', async () => {
  const f = fixture();
  await checkMarket('https://toolkit.test', f.options);
  assert.deepEqual(f.calls, f.paths); assert.deepEqual(f.delays, []);
});

test('production WFM upstream rejection fails the deployment despite a healthy app', async () => {
  const f = fixture();
  f.responses.set('items', () => Response.json({ error: 'WFM is unavailable (403).' }, { status: 503 }));
  await assert.rejects(checkMarket('https://toolkit.test', f.options), /Production WFM items failed.*403/);
  assert.deepEqual(f.calls, ['items', 'items', 'items']);
  assert.deepEqual(f.delays, [30_000, 30_000]);
});

test('production check rejects stale snapshots, missing prices, invalid timestamps, and HTML', async () => {
  for (const path of fixture().paths) {
    for (const kind of ['stale', 'empty', 'timestamp', 'html']) {
      const f = fixture(), index = f.paths.indexOf(path);
      f.responses.set(path, () => kind === 'html' ? new Response('<html>Just a moment...</html>', { status: 403 }) : Response.json({
        ...f.bodies[index],
        ...(kind === 'stale' ? { stale: true, error: 'WFM is unavailable (403).' } : kind === 'timestamp' ? { fetchedAt: 'invalid' } : { data: index === 2 ? { '48hours': [], '90days': [] } : [] }),
      }));
      await assert.rejects(checkMarket('https://toolkit.test', { ...f.options, attempts: 1 }), /Production WFM .* failed/);
      assert.equal(f.calls.at(-1), path);
    }
  }
});

test('production check allows a bounded retry when a previous cached failure expires', async () => {
  const f = fixture(), success = f.responses.get('items')!;
  let attempts = 0;
  f.responses.set('items', () => ++attempts === 1 ? Response.json({ error: 'Retry shortly.' }, { status: 503 }) : success());
  await checkMarket('https://toolkit.test', f.options);
  assert.deepEqual(f.delays, [30_000]); assert.deepEqual(f.calls, ['items', ...f.paths]);
});
