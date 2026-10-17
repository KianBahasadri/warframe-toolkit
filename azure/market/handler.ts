import { MARKET_ORIGIN, isMarketPath, marketHeaders } from '../../server/marketUpstream.ts';
import { MARKET_RELAY_RESPONSE_LIMIT as limit } from '../../server/marketRelayBudget.ts';

const platforms = new Set(['pc', 'ps4', 'xbox', 'switch', 'mobile']);

/** Azure's function-level key authenticates callers before this handler runs. */
export async function handleMarketRelay(request: Request, upstream: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const url = new URL(request.url), prefix = '/api/wfm';
  const path = url.pathname.slice(prefix.length), platform = request.headers.get('Platform') ?? 'pc';
  if (!url.pathname.startsWith(`${prefix}/`) || !isMarketPath(path) || url.search || !platforms.has(platform)) return Response.json({ error: 'Unknown market request.' }, { status: 400 });
  try {
    const response = await upstream(`${MARKET_ORIGIN}${path}`, {
      headers: marketHeaders(platform), redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['Content-Type', 'Retry-After', 'cf-mitigated']) {
      const value = response.headers.get(name); if (value) headers.set(name, value);
    }
    if (Number(response.headers.get('Content-Length') ?? 0) > limit) {
      await response.body?.cancel();
      throw new Error('Response too large.');
    }
    const reader = response.body?.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error('Response too large.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, headers });
  } catch {
    return Response.json({ error: 'Could not reach Warframe Market.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
