import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createMarketService } from './market.ts';

export function createMarketMiddleware() {
  const directory = resolve('.cache/wfm');
  const path = (key: string) => resolve(directory, `${createHash('sha256').update(key).digest('hex')}.json`);
  const service = createMarketService({ store: {
    async get(key) { try { return JSON.parse(await readFile(path(key), 'utf8')); } catch { return undefined; } },
    async set(key, value) { await mkdir(directory, { recursive: true }); const file = path(key); await writeFile(`${file}.tmp`, JSON.stringify(value)); await rename(`${file}.tmp`, file); },
  } });
  return {
    stop: service.stop,
    middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
      if (!req.url?.startsWith('/api/wfm/')) return next();
      void service.handle(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers['x-market-background'] === '1' ? { 'X-Market-Background': '1' } : undefined })).then(async response => {
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
      }).catch(() => { res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'Market prices are unavailable.' })); });
    },
  };
}
