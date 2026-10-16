import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMarketRelay } from '../azure/market/handler.ts';
import { MARKET_USER_AGENT } from '../server/marketUpstream.ts';

const request = (path: string, headers?: HeadersInit) => new Request(`https://relay.test/api/wfm/${path}`, { headers });

test('Azure relays only public market reads with descriptive headers and no caller credentials', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const upstream = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Response.json({ data: ['market data'] }, { headers: { 'Set-Cookie': 'upstream=private' } });
  }) as typeof fetch;
  for (const path of ['v2/items', 'v2/orders/item/braton_prime_set', 'v1/items/braton_prime_set/statistics']) {
    const response = await handleMarketRelay(request(path, { Platform: 'switch', Cookie: 'account=private', Authorization: 'Bearer private', 'x-functions-key': 'relay-secret', 'User-Agent': 'caller' }), upstream);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { data: ['market data'] });
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(calls.at(-1)!.url, `https://api.warframe.market/${path}`);
    const init = calls.at(-1)!.init!, headers = new Headers(init.headers);
    assert.equal(headers.get('Platform'), 'switch'); assert.equal(headers.get('Crossplay'), 'false');
    assert.equal(headers.get('User-Agent'), MARKET_USER_AGENT);
    for (const header of ['Cookie', 'Authorization', 'x-functions-key']) assert.equal(headers.get(header), null);
    assert.equal(init.redirect, 'error', 'a redirect must not turn the relay into an arbitrary proxy');
    assert.ok(init.signal);
  }
});

test('Azure refuses arbitrary paths, query strings, unsupported platforms, and write methods before fetching', async () => {
  let calls = 0;
  const upstream = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  for (const path of ['https://example.com', 'v2/profile/name', 'v2/items?url=https://example.com', 'v2/orders/item/a%2Fb', 'v1/items/name/orders', 'v2/items/extra']) {
    assert.equal((await handleMarketRelay(request(path), upstream)).status, 400, path);
  }
  assert.equal((await handleMarketRelay(request('v2/items', { Platform: 'invalid' }), upstream)).status, 400);
  assert.equal((await handleMarketRelay(new Request('https://relay.test/api/wfm/v2/items', { method: 'POST' }), upstream)).status, 405);
  assert.equal(calls, 0);
});

test('Azure preserves WFM challenges and Retry-After so the shared cache backs off honestly', async () => {
  for (const status of [403, 429, 509]) {
    const response = await handleMarketRelay(request('v2/items'), (async () => new Response('upstream error', { status, headers: {
      'Retry-After': '120', 'cf-mitigated': 'challenge', 'Content-Type': 'text/html', 'Set-Cookie': 'secret=value',
    } })) as typeof fetch);
    assert.equal(response.status, status); assert.equal(response.headers.get('Retry-After'), '120');
    assert.equal(response.headers.get('cf-mitigated'), 'challenge'); assert.equal(response.headers.get('Content-Type'), 'text/html');
    assert.equal(response.headers.get('Set-Cookie'), null); assert.equal(await response.text(), 'upstream error');
  }
});

test('Azure bounds declared and streamed bodies and keeps transport errors private', async () => {
  const responses = [
    new Response('too big', { headers: { 'Content-Length': '12000001' } }),
    new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(12_000_001)); } })),
  ];
  for (const response of responses) {
    const result = await handleMarketRelay(request('v2/items'), (async () => response) as typeof fetch);
    assert.equal(result.status, 502); assert.deepEqual(await result.json(), { error: 'Could not reach Warframe Market.' });
  }
  const result = await handleMarketRelay(request('v2/items'), (async () => { throw new Error('secret transport details'); }) as typeof fetch);
  assert.equal(result.status, 502); assert.doesNotMatch(await result.text(), /secret/);
});
