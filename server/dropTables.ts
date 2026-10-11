import { parseDropTables } from '../src/lib/dropTableParser.ts';
import { DROP_TABLES_URL } from '../src/lib/dropTables.ts';

const maxBytes = 12 * 1024 * 1024;
const allowedHosts = new Set(['warframe.com', 'www.warframe.com', 'warframe-web-assets.nyc3.cdn.digitaloceanspaces.com']);

export async function fetchLiveDropTables(fetcher: typeof fetch = fetch, parentSignal?: AbortSignal) {
  const timeout = AbortSignal.timeout(30_000);
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
  let url = DROP_TABLES_URL;
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) throw new Error('The official drop-table address redirected to an unsupported host.');
    response = await fetcher(url, { signal, redirect: 'manual', headers: { Accept: 'text/html' } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = response.headers.get('location');
    await response.body?.cancel();
    if (!next) throw new Error('The official page returned an invalid redirect.');
    url = new URL(next, url).href;
    response = undefined;
  }
  if (!response?.ok || !response.body) throw new Error(`The official drop-table page is unavailable${response ? ` (HTTP ${response.status})` : ''}. Try again shortly.`);
  if (!response.headers.get('content-type')?.includes('text/html')) { await response.body.cancel(); throw new Error('The official page returned an unexpected format.'); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('The official page exceeded the supported download size.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return parseDropTables(Buffer.concat(chunks).toString('utf8'));
}

