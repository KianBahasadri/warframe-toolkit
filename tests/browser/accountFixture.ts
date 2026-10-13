import { test as base, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createAccountsApi } from '../../server/accounts';
import { initialInventory } from '../../src/data/reference';
import { emptyProfile } from '../../src/lib/account';
import type { AccountProfile, AccountSession } from '../../src/lib/account';
import type { Inventory } from '../../src/lib/model';
import { cloudflareRuntime } from '../cloudflare/runtime';

type TestAccount = {
  url: string;
  accessKey: string;
  session: () => Promise<AccountSession>;
  profile: () => Promise<AccountProfile>;
  inventory: () => Promise<Inventory>;
  setInventory: (inventory: Inventory) => Promise<void>;
  setProfile: (profile: AccountProfile) => Promise<void>;
  signOut: () => Promise<void>;
};

export const test = base.extend<{ account: TestAccount; signedIn: boolean }>({
  signedIn: [true, { option: true }],
  account: [async ({ page, context, signedIn, baseURL }, use) => {
    const cloud = process.env.WARFRAME_TEST_BACKEND === 'cloudflare' ? await cloudflareRuntime({ origin: baseURL }) : undefined;
    const api = cloud ? undefined : createAccountsApi({ databasePath: ':memory:', origin: baseURL });
    const server = api ? createServer((req, res) => api.middleware(req, res, () => { res.writeHead(404); res.end(); })) : undefined;
    if (server) await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = cloud?.url ?? `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
    await context.route('**/api/account/**', async route => route.fulfill({ response: await route.fetch({ url: url + new URL(route.request().url()).pathname }) }));
    // Unrelated browser tests never contact the live market. Market tests
    // override this route with explicit orders and history fixtures.
    await context.route('**/api/wfm/**', route => route.fulfill({ json: { data: [], fetchedAt: '2026-10-13T12:00:00.000Z', stale: false } }));
    const headers = { Origin: baseURL!, 'X-Toolkit-Request': '1' };
    const session = async (): Promise<AccountSession> => {
      const response = await context.request.get(`${url}/api/account/session`); expect(response.ok()).toBe(true); return response.json();
    };
    const profile = async () => {
      await expect(page.getByRole('status', { name: 'Save status', exact: true })).toHaveText('Saved');
      return (await session()).profile;
    };
    const setProfile = async (profile: AccountProfile) => {
      const current = await session();
      const response = await context.request.put(`${url}/api/account/profile`, { headers, data: { profile, revision: current.revision, accountId: current.user.id } });
      expect(response.ok()).toBe(true);
    };
    let accessKey = "";
    if (signedIn) {
      const response = await context.request.post(`${url}/api/account/register`, { headers, data: { username: 'TestTenno', profile: { ...emptyProfile(), inventory: initialInventory() } } });
      expect(response.status()).toBe(201);
      accessKey = (await response.json()).accessKey;
    }
    try {
      await use({ url, accessKey, session, profile, inventory: async () => (await profile()).inventory, setProfile,
        setInventory: async inventory => setProfile({ ...(await session()).profile, inventory }),
        signOut: async () => { const current = await session(); const response = await context.request.post(`${url}/api/account/logout`, { headers, data: { accountId: current.user.id } }); expect(response.ok()).toBe(true); },
      });
    } finally {
      await page.close();
      // A route.fetch can outlive the page. Finish it before stopping its backend.
      await context.unrouteAll({ behavior: 'wait' });
      if (server) {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
      api?.close(); await cloud?.close();
    }
  }, { auto: true }],
});
export { expect };
