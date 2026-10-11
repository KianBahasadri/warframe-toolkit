import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';

export async function cloudflareRuntime(options: { origin?: string; persist?: string; outbound?: (request: Request) => Promise<Response> } = {}) {
  const config = convertV4MiniflareOptions({
    name: 'warframe-toolkit', modules: true, scriptPath: 'build/cloudflare/worker.js',
    compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
    bindings: { ACCOUNTS_ORIGIN: options.origin ?? 'https://toolkit.test', RELEASE: 'test' },
    d1Databases: ['DB'],
    durableObjects: { ACCOUNTS: { className: 'AccountGateway', useSQLite: true }, DROPS: { className: 'DropTables', useSQLite: true } },
    ...(options.outbound ? { outboundService: options.outbound } : {}),
  });
  const mf = new Miniflare({ ...config, unsafeInspectDurableObjects: true, ...(options.persist ? { resourcePersistencePath: options.persist } : {}) });
  const db = await mf.getD1Database('DB');
  const existing = await db.prepare("SELECT name FROM sqlite_master WHERE name = 'accounts'").first();
  if (!existing) for (const file of (await readdir('cloudflare/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    const sql = (await readFile(`cloudflare/migrations/${file}`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ');
    await db.exec(sql);
  }
  const url = (await mf.ready).origin;
  return {
    mf, db, url,
    request(path: string, data?: unknown, cookie = '', overrides: { method?: string; origin?: string } = {}) {
      return mf.dispatchFetch(`https://toolkit.test/api/account/${path}`, { method: overrides.method ?? (data === undefined ? 'GET' : 'POST'), headers: { Origin: overrides.origin ?? options.origin ?? 'https://toolkit.test', 'X-Toolkit-Request': '1', 'Content-Type': 'application/json', Cookie: cookie }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    },
    close: () => mf.dispose(),
  };
}
