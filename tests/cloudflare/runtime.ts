import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { mintClerkToken, testClerkKeys } from '../fixtures/clerk.ts';

export async function cloudflareRuntime(options: { origin?: string; persist?: string; jwtKey?: string; relay?: { url?: string; key?: string }; outbound?: (request: Request) => Promise<Response> } = {}) {
  const origin = options.origin ?? 'https://toolkit.test';
  const jwtKey = options.jwtKey ?? testClerkKeys.publicKey;
  const config = convertV4MiniflareOptions({
    name: 'warframe-toolkit', modules: true, scriptPath: 'build/cloudflare/worker.js',
    compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
    bindings: { ACCOUNTS_ORIGIN: origin, CLERK_JWT_KEY: jwtKey, RELEASE: 'test', ...(options.relay?.url ? { WFM_RELAY_URL: options.relay.url } : {}), ...(options.relay?.key ? { WFM_RELAY_KEY: options.relay.key } : {}) },
    d1Databases: ['DB'],
    durableObjects: { ACCOUNTS: { className: 'AccountGateway', useSQLite: true }, DROPS: { className: 'DropTables', useSQLite: true } },
    ...(options.outbound ? { outboundService: options.outbound } : {}),
  });
  const mf = new Miniflare({ ...config, unsafeTriggerHandlers: true, unsafeInspectDurableObjects: true, ...(options.persist ? { resourcePersistencePath: options.persist } : {}) });
  const db = await mf.getD1Database('DB');
  const existing = await db.prepare("SELECT name FROM sqlite_master WHERE name = 'accounts'").first();
  if (!existing) for (const file of (await readdir('cloudflare/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    const sql = (await readFile(`cloudflare/migrations/${file}`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ');
    await db.exec(sql);
  }
  const url = (await mf.ready).origin;
  return {
    mf, db, url,
    tokenFor(sub: string, username?: string, expOffsetSeconds?: number) {
      return mintClerkToken({ sub, username, azp: origin, expOffsetSeconds });
    },
    request(path: string, data?: unknown, token = '', overrides: { method?: string; origin?: string; username?: string } = {}) {
      return mf.dispatchFetch(`https://toolkit.test/api/account/${path}`, {
        method: overrides.method ?? (data === undefined ? 'GET' : 'POST'),
        headers: {
          Origin: overrides.origin ?? origin,
          'X-Toolkit-Request': '1',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(overrides.username ? { 'X-Clerk-Username': encodeURIComponent(overrides.username) } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    },
    close: () => mf.dispose(),
  };
}
