import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createMarketService } from './market.ts';

const PROD_MARKET_ORIGIN = process.env.WFM_PROXY_ORIGIN || 'https://grakata.com';

export function createMarketMiddleware() {
  const local = process.env.WFM_LOCAL === '1';
  const directory = resolve('.cache/wfm');
  const path = (key: string) => resolve(directory, `${createHash('sha256').update(key).digest('hex')}.json`);
  const service = local ? createMarketService({ store: {
    async get(key) { try { return JSON.parse(await readFile(path(key), 'utf8')); } catch { return undefined; } },
    async set(key, value) { await mkdir(directory, { recursive: true }); const file = path(key); await writeFile(`${file}.tmp`, JSON.stringify(value)); await rename(`${file}.tmp`, file); },
  } }) : undefined;
  return {
    stop: () => service?.stop(),
    middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
      if (!req.url?.startsWith('/api/wfm/')) return next();
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (req.headers['x-market-background'] === '1') headers['X-Market-Background'] = '1';
      const upstream = service
        ? service.handle(new Request(`http://localhost${req.url}`, { method: req.method, headers }))
        : fetch(new URL(req.url, PROD_MARKET_ORIGIN), { method: req.method, headers, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
      void upstream.then(async response => {
        const outHeaders: Record<string, string> = {
          'Content-Type': response.headers.get('Content-Type') ?? 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        };
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) outHeaders['Retry-After'] = retryAfter;
        res.writeHead(response.status, outHeaders);
        res.end(await response.text());
      }).catch(() => { res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'Market prices are unavailable.' })); });
    },
  };
}
