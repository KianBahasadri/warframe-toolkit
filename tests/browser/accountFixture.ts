import { test as base, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createAccountsApi } from '../../server/accounts';
import { initialInventory } from '../../src/data/reference';
import { accountUsername, emptyProfile } from '../../src/lib/account';
import type { AccountProfile, AccountSession } from '../../src/lib/account';
import type { Inventory } from '../../src/lib/model';
import { cloudflareRuntime } from '../cloudflare/runtime';
import { mintClerkToken, testClerkKeys } from '../fixtures/clerk';

type TestAccount = {
  url: string;
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
    const cloud = process.env.WARFRAME_TEST_BACKEND === 'cloudflare'
      ? await cloudflareRuntime({ origin: baseURL, jwtKey: testClerkKeys.publicKey })
      : undefined;
    const api = cloud ? undefined : createAccountsApi({ databasePath: ':memory:', origin: baseURL, jwtKey: testClerkKeys.publicKey });
    const server = api ? createServer((req, res) => api.middleware(req, res, () => { res.writeHead(404); res.end(); })) : undefined;
    if (server) await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = cloud?.url ?? `http://127.0.0.1:${(server!.address() as { port: number }).port}`;

    const revokedTokens = new Set<string>();
    const issueUser = (rawUsername: string) => {
      const normalized = accountUsername(rawUsername);
      const id = `user_${normalized.key.replace(/[^a-z0-9]/g, '_')}`;
      const token = mintClerkToken({
        sub: id,
        username: normalized.username,
        azp: baseURL!,
      });
      return { id, username: normalized.username, token };
    };

    let activeIdentity = signedIn ? issueUser('TestTenno') : null;
    let bootSignedIn = signedIn;

    await context.route('**/__clerk_test/session', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { username?: string };
        try {
          activeIdentity = issueUser(body.username ?? '');
          bootSignedIn = true;
          await route.fulfill({ status: 200, json: activeIdentity });
        } catch (error) {
          await route.fulfill({ status: 400, json: { error: (error as Error).message } });
        }
        return;
      }
      if (route.request().method() === 'DELETE') {
        if (activeIdentity) revokedTokens.add(activeIdentity.token);
        activeIdentity = null;
        bootSignedIn = false;
        await route.fulfill({ status: 200, json: { ok: true } });
        return;
      }
      await route.fulfill({ status: 200, json: bootSignedIn ? activeIdentity : null });
    });

    await context.route('**/api/account/**', async route => {
      const req = route.request();
      const headers = { ...req.headers() };
      const auth = headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        const rawToken = auth.slice('Bearer '.length).trim();
        if (revokedTokens.has(rawToken)) delete headers.authorization;
      }
      const response = await route.fetch({ url: url + new URL(req.url()).pathname, headers });
      await route.fulfill({ response });
    });

    // Unrelated browser tests never contact the live market. Market tests
    // override this route with explicit orders and history fixtures.
    await context.route('**/api/wfm/**', route => route.fulfill({ json: { data: [], fetchedAt: '2026-10-13T12:00:00.000Z', stale: false } }));

    await context.addInitScript(initialBootIdentity => {
      const listeners = new Set<(resources: unknown) => void>();
      type Identity = { id: string; username: string; token: string } | null;
      let currentIdentity: Identity = null;
      let authModal: HTMLDialogElement | undefined;
      let authTrigger: HTMLElement | null = null;
      const STORAGE_KEY = '__clerk_test_identity';
      const INIT_KEY = '__clerk_test_initialized';

      function readStored(): Identity {
        try {
          if (!sessionStorage.getItem(INIT_KEY)) {
            sessionStorage.setItem(INIT_KEY, '1');
            if (initialBootIdentity) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(initialBootIdentity));
            return initialBootIdentity;
          }
          const raw = sessionStorage.getItem(STORAGE_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return initialBootIdentity;
        }
      }
      function writeStored(identity: Identity) {
        try {
          sessionStorage.setItem(INIT_KEY, '1');
          if (identity) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
          else sessionStorage.removeItem(STORAGE_KEY);
        } catch { /* ignore */ }
      }

      const clerkInstance: Record<string, unknown> = {
        loaded: true,
        status: 'ready',
        version: '6.18.0',
        __authVersion: 0,
        client: { sessions: [], signedInSessions: [] },
        session: null,
        user: null,
        organization: null,
        __internal_lastEmittedResources: { client: { sessions: [] }, session: null, user: null, organization: null },
        async load() {
          clerkInstance.loaded = true;
        },
        addListener(cb: (resources: unknown) => void, opts?: { skipInitialEmit?: boolean }) {
          listeners.add(cb);
          if (!opts?.skipInitialEmit && clerkInstance.loaded) cb(clerkInstance.__internal_lastEmittedResources);
          return () => { listeners.delete(cb); };
        },
        async signOut() {
          writeStored(null);
          try { await fetch('/__clerk_test/session', { method: 'DELETE' }); } catch { /* ignore */ }
          setIdentity(null, true);
        },
        openUserProfile() {},
        openSignIn() { openAuthModal('Sign in'); },
        openSignUp() { openAuthModal('Create account'); },
        __internal_updateProps() {},
      };

      function closeAuthModal() {
        authModal?.close();
        authModal?.remove();
        authModal = undefined;
        if (authTrigger?.isConnected) authTrigger.focus();
      }

      function openAuthModal(submitLabel: string) {
        if (!authModal) {
          authTrigger = document.activeElement as HTMLElement;
          authModal = document.createElement('dialog');
          authModal.dataset.clerkModal = '';
          authModal.style.padding = '20px 16px';
          authModal.addEventListener('cancel', event => { event.preventDefault(); closeAuthModal(); });
          document.body.appendChild(authModal);
          authModal.showModal();
        }
        authModal.setAttribute('aria-label', submitLabel);
        renderForm(authModal, submitLabel);
        const switchMode = document.createElement('button');
        switchMode.type = 'button';
        switchMode.className = 'button quiet';
        switchMode.textContent = submitLabel === 'Sign in' ? 'Create account' : 'Sign in instead';
        switchMode.addEventListener('click', () => openAuthModal(submitLabel === 'Sign in' ? 'Create account' : 'Sign in'));
        authModal.appendChild(switchMode);
      }

      function setIdentity(identity: Identity, emit: boolean) {
        currentIdentity = identity;
        if (identity) {
          const user = {
            id: identity.id,
            username: identity.username,
            fullName: identity.username,
            firstName: identity.username,
            primaryEmailAddress: null,
            organizationMemberships: [],
          };
          const session = {
            id: `sess_${identity.id}`,
            status: 'active',
            user,
            factorVerificationAge: null,
            lastActiveToken: { jwt: { claims: { sub: identity.id, username: identity.username } } },
            getToken: async () => currentIdentity?.token ?? null,
          };
          const client = { sessions: [session], signedInSessions: [session] };
          clerkInstance.user = user;
          clerkInstance.session = session;
          clerkInstance.client = client;
          clerkInstance.__authVersion = Number(clerkInstance.__authVersion) + 1;
          clerkInstance.__internal_lastEmittedResources = { client, session, user, organization: null };
        } else {
          const client = { sessions: [], signedInSessions: [] };
          clerkInstance.user = null;
          clerkInstance.session = null;
          clerkInstance.client = client;
          clerkInstance.__authVersion = Number(clerkInstance.__authVersion) + 1;
          clerkInstance.__internal_lastEmittedResources = { client, session: null, user: null, organization: null };
        }
        if (emit) for (const cb of listeners) cb(clerkInstance.__internal_lastEmittedResources);
      }

      setIdentity(readStored(), false);

      function renderForm(node: HTMLElement, submitLabel: string) {
        node.replaceChildren();
        const form = document.createElement('form');
        form.className = 'account-form';
        const label = document.createElement('label');
        label.textContent = 'Username';
        const input = document.createElement('input');
        input.name = 'username';
        input.required = true;
        input.maxLength = 64;
        input.autocomplete = 'username';
        label.appendChild(input);
        const errorEl = document.createElement('p');
        errorEl.className = 'error-text';
        errorEl.setAttribute('role', 'alert');
        errorEl.hidden = true;
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'button primary';
        submit.textContent = submitLabel;
        form.append(label, errorEl, submit);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          errorEl.hidden = true;
          submit.disabled = true;
          try {
            const res = await fetch('/__clerk_test/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: input.value }),
            });
            const data = await res.json();
            if (!res.ok) {
              errorEl.textContent = data.error || 'Could not sign in.';
              errorEl.hidden = false;
              return;
            }
            writeStored(data);
            setIdentity(data, true);
            closeAuthModal();
          } finally {
            submit.disabled = false;
          }
        });
        node.appendChild(form);
        queueMicrotask(() => input.focus());
      }

      (window as Window & { __clerk_publishable_key?: string; Clerk?: unknown }).__clerk_publishable_key = 'pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk';
      (window as Window & { Clerk?: unknown }).Clerk = clerkInstance;
    }, activeIdentity);

    const authHeaders = () => ({
      Origin: baseURL!,
      'X-Toolkit-Request': '1',
      ...(activeIdentity && !revokedTokens.has(activeIdentity.token)
        ? { Authorization: `Bearer ${activeIdentity.token}`, 'X-Clerk-Username': encodeURIComponent(activeIdentity.username) }
        : {}),
    });

    const session = async (): Promise<AccountSession> => {
      const response = await context.request.get(`${url}/api/account/session`, { headers: authHeaders() });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const profile = async () => {
      await expect(page.getByRole('status', { name: 'Save status', exact: true })).toHaveText('Saved');
      return (await session()).profile;
    };
    const setProfile = async (nextProfile: AccountProfile) => {
      const current = await session();
      const response = await context.request.put(`${url}/api/account/profile`, {
        headers: authHeaders(),
        data: { profile: nextProfile, revision: current.revision, accountId: current.user.id },
      });
      expect(response.ok()).toBe(true);
    };

    if (signedIn && activeIdentity) {
      const created = await session();
      const seeded = await context.request.put(`${url}/api/account/profile`, {
        headers: authHeaders(),
        data: { profile: { ...emptyProfile(), inventory: initialInventory() }, revision: created.revision, accountId: created.user.id },
      });
      expect(seeded.ok()).toBe(true);
    }

    try {
      await use({
        url,
        session,
        profile,
        inventory: async () => (await profile()).inventory,
        setProfile,
        setInventory: async inventory => setProfile({ ...(await session()).profile, inventory }),
        signOut: async () => {
          if (activeIdentity) revokedTokens.add(activeIdentity.token);
          bootSignedIn = false;
          await page.evaluate(() => {
            try { sessionStorage.removeItem('__clerk_test_identity'); } catch { /* ignore */ }
          }).catch(() => {});
        },
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
