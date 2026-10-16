import type { AccountGateway } from './accounts.ts';
import type { DropTables } from './drop-tables.ts';
export { AccountGateway } from './accounts.ts';
export { DropTables } from './drop-tables.ts';

export interface Env {
  DB: D1Database;
  ACCOUNTS: DurableObjectNamespace<AccountGateway>;
  DROPS: DurableObjectNamespace<DropTables>;
  ASSETS: Fetcher;
  ACCOUNTS_ORIGIN: string;
  RELEASE: string;
  WFM_RELAY_URL?: string;
  WFM_RELAY_KEY?: string;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/account/')) return env.ACCOUNTS.getByName('accounts').fetch(request);
    if (path === '/api/droptables') return env.DROPS.getByName('official-pc').fetch(request);
    if (path.startsWith('/api/wfm/')) return env.DROPS.getByName('wfm').fetch(request);
    if (path === '/api/health' && request.method === 'GET') return Response.json({ status: 'ok', release: env.RELEASE }, { headers: { 'Cache-Control': 'no-store' } });
    if (path.startsWith('/api/')) return Response.json({ error: 'Endpoint not found.' }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await env.DROPS.getByName('official-pc').refresh();
  },
} satisfies ExportedHandler<Env>;
