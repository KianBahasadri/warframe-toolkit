import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAccountsApi } from '../server/accounts.ts';
import { emptyProfile, isShareToken, readShareInventoryLink, shareInventoryLink } from '../src/lib/account.ts';
import { createEquipment } from '../src/lib/model.ts';
import { newArsenal } from '../src/lib/modderModel.ts';
import { mintClerkToken, testClerkKeys } from './fixtures/clerk.ts';

async function serve(path = ':memory:') {
  const api = createAccountsApi({ databasePath: path, jwtKey: testClerkKeys.publicKey });
  const server = createServer((req, res) => api.middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    base,
    tokenFor(sub: string, username?: string, expOffsetSeconds?: number) {
      return mintClerkToken({ sub, username, azp: base, expOffsetSeconds });
    },
    async request(path: string, data?: unknown, token = '', options: { method?: string; origin?: string; username?: string } = {}) {
      return fetch(`${base}/api/account/${path}`, {
        method: options.method ?? (data === undefined ? 'GET' : 'POST'),
        headers: {
          Origin: options.origin ?? base,
          'X-Toolkit-Request': '1',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.username ? { 'X-Clerk-Username': encodeURIComponent(options.username) } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    },
    async close() { await new Promise<void>(resolve => server.close(() => resolve())); api.close(); },
  };
}

test('arsenal saves round-trip and malformed replacements are rejected', async () => {
  const api = await serve();
  try {
    const token = api.tokenFor('user_modder', 'ModderTenno');
    const profile = emptyProfile(); profile.arsenals = [newArsenal()];
    const account = await (await api.request('session', undefined, token)).json();
    const save = { accountId: account.user.id, revision: 0, profile };
    assert.equal((await api.request('profile', save, token, { method: 'PUT' })).status, 200);
    assert.deepEqual((await (await api.request('session', undefined, token)).json()).profile.arsenals, profile.arsenals);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { ...profile, arsenals: null } }, token, { method: 'PUT' })).status, 400);
    assert.deepEqual((await (await api.request('session', undefined, token)).json()).profile.arsenals, profile.arsenals);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { ...profile, arsenals: [] } }, token, { method: 'PUT' })).status, 200);
    assert.deepEqual((await (await api.request('session', undefined, token)).json()).profile.arsenals, []);
  } finally { await api.close(); }
});

test('Clerk session tokens auto-provision accounts, update display usernames, and reject invalid or forged JWTs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-auth-'));
  const path = join(directory, 'accounts.sqlite');
  const api = await serve(path);
  try {
    assert.deepEqual(await (await api.request('session')).json(), { user: null });
    const token = api.tokenFor('user_tenno_123', '  MyTenno#123  ');
    const session = await api.request('session', undefined, token);
    assert.equal(session.status, 200);
    assert.equal(session.headers.get('cache-control'), 'no-store');
    const account = await session.json();
    assert.deepEqual(account, { user: { id: 'user_tenno_123', username: 'MyTenno#123' }, profile: emptyProfile(), revision: 0 });

    const renamed = await api.request('session', undefined, api.tokenFor('user_tenno_123'), { username: 'RenamedTenno' });
    assert.equal((await renamed.json()).user.username, 'RenamedTenno');

    const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const forgedToken = mintClerkToken({ sub: 'user_tenno_123', azp: api.base, privateKey: wrongKey.privateKey });
    assert.equal((await api.request('session', undefined, forgedToken)).status, 401);

    const wrongAzpToken = mintClerkToken({ sub: 'user_tenno_123', azp: 'https://evil.example' });
    assert.equal((await api.request('session', undefined, wrongAzpToken)).status, 401);

    const expiredToken = api.tokenFor('user_tenno_123', 'MyTenno#123', -60);
    assert.equal((await api.request('session', undefined, expiredToken)).status, 401);

    const db = new DatabaseSync(path);
    const cols = db.prepare('PRAGMA table_info(accounts)').all().map(row => String(row.name));
    assert.deepEqual(cols, ['id', 'username', 'profile', 'revision', 'share_token']);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get(), undefined);
    db.close();
  } finally { await api.close(); await rm(directory, { recursive: true }); }
});

test('guests cannot save; account ownership and revision checks prevent crossed or stale writes', async () => {
  const api = await serve();
  try {
    assert.equal((await api.request('profile', { profile: emptyProfile(), revision: 0 }, '', { method: 'PUT' })).status, 401);
    const aToken = api.tokenFor('user_a', 'TennoA'), aData = await (await api.request('session', undefined, aToken)).json();
    const bToken = api.tokenFor('user_b', 'TennoB'), bData = await (await api.request('session', undefined, bToken)).json();
    const profile = emptyProfile();
    profile.inventory.items.push(createEquipment({ name: 'Boltor Prime', slot: 'Primary', variant: 'Prime' }, { owned: true, mastered: false, rank: 7, notes: 'Keep for crafting', override: 'Keep' }));
    profile.craftingPlans.push({ id: 'rhino-plan', itemId: '/Lotus/Powersuits/Rhino/Rhino', quantity: 1, completed: ['root/part'], choices: { 'root/part': 'gather' } });
    const save = { accountId: aData.user.id, revision: 0, profile };
    assert.equal((await api.request('profile', save, bToken, { method: 'PUT' })).status, 409);
    assert.equal((await api.request('profile', save, aToken, { method: 'PUT' })).status, 200);
    assert.deepEqual((await (await api.request('session', undefined, aToken)).json()).profile, profile);
    assert.deepEqual((await (await api.request('session', undefined, bToken)).json()).profile, bData.profile);
    assert.equal((await api.request('profile', { ...save, profile: emptyProfile() }, aToken, { method: 'PUT' })).status, 409);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { inventory: {}, dropViews: [] } }, aToken, { method: 'PUT' })).status, 400);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { ...profile, craftingPlans: null } }, aToken, { method: 'PUT' })).status, 400);
    assert.deepEqual((await (await api.request('session', undefined, aToken)).json()).profile, profile);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { ...profile, craftingPlans: [] } }, aToken, { method: 'PUT' })).status, 200);
    assert.deepEqual((await (await api.request('session', undefined, aToken)).json()).profile.craftingPlans, []);
  } finally { await api.close(); }
});

test('origin checks and method restrictions apply before writes', async () => {
  const api = await serve();
  try {
    const token = api.tokenFor('user_origin', 'TestTenno');
    assert.equal((await api.request('profile', { accountId: 'user_origin', revision: 0, profile: emptyProfile() }, token, { method: 'PUT', origin: 'https://elsewhere.example' })).status, 403);
    assert.equal((await api.request('session', { extra: true }, token, { method: 'POST' })).status, 405);
    assert.equal((await api.request('unknown', undefined, token, { method: 'GET' })).status, 404);
  } finally { await api.close(); }
});

test('accounts survive a server restart, while expired Clerk tokens cannot save', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-auth-'));
  const path = join(directory, 'accounts.sqlite');
  let api = await serve(path);
  try {
    const token = api.tokenFor('user_persist', 'PersistentTenno');
    const data = await (await api.request('session', undefined, token)).json();
    await api.close(); api = await serve(path);
    const freshToken = api.tokenFor('user_persist', 'PersistentTenno');
    assert.deepEqual(await (await api.request('session', undefined, freshToken)).json(), data);
    const expiredToken = api.tokenFor('user_persist', 'PersistentTenno', -60);
    assert.equal((await api.request('session', undefined, expiredToken)).status, 401);
    assert.equal((await api.request('profile', { accountId: data.user.id, profile: emptyProfile(), revision: 0 }, expiredToken, { method: 'PUT' })).status, 401);
  } finally { await api.close(); await rm(directory, { recursive: true }); }
});

test('unreadable account files and profiles are preserved instead of being reset', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-auth-'));
  const path = join(directory, 'accounts.sqlite');
  await writeFile(path, 'existing unreadable account data');
  let api = await serve(path);
  try {
    assert.equal((await api.request('session')).status, 503);
    assert.equal(await readFile(path, 'utf8'), 'existing unreadable account data');
    await api.close();
    const goodPath = join(directory, 'good.sqlite'); api = await serve(goodPath);
    const token = api.tokenFor('user_preserved', 'PreservedTenno');
    const data = await (await api.request('session', undefined, token)).json();
    const db = new DatabaseSync(goodPath); db.prepare('UPDATE accounts SET profile = ?').run('{broken');
    assert.equal((await api.request('session', undefined, token)).status, 503);
    assert.equal((await api.request('profile', { accountId: data.user.id, profile: emptyProfile(), revision: 0 }, token, { method: 'PUT' })).status, 503);
    assert.equal(db.prepare('SELECT profile FROM accounts').get()!.profile, '{broken'); db.close();
  } finally { await api.close(); await rm(directory, { recursive: true }); }
});

test('legacy access-key tables are dropped and replaced with the Clerk schema', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-schema-'));
  const path = join(directory, 'accounts.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, access_key_hash TEXT NOT NULL, profile TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)`);
  db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)').run('legacy-id', 'LegacyTenno', 'legacytenno', 'hash', JSON.stringify(emptyProfile()), 3);
  db.close();
  const api = await serve(path);
  try {
    const token = api.tokenFor('user_new_clerk', 'NewTenno');
    const session = await api.request('session', undefined, token);
    assert.equal(session.status, 200);
    const read = new DatabaseSync(path);
    assert.equal(read.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get(), undefined);
    assert.equal(read.prepare('SELECT * FROM accounts WHERE id = ?').get('legacy-id'), undefined);
    assert.equal((read.prepare('SELECT * FROM accounts WHERE id = ?').get('user_new_clerk') as { username: string }).username, 'NewTenno');
    read.close();
  } finally { await api.close(); await rm(directory, { recursive: true }); }
});

test('shareable inventory links expose only live inventory and replacing a link disables the previous one', async () => {
  const shareToken = `wfs_${'s'.repeat(43)}`;
  const shareUrl = new URL(shareInventoryLink('https://toolkit.example/warframes?old=1#hash', shareToken));
  assert.equal(shareUrl.pathname, '/weapons');
  assert.equal(readShareInventoryLink(shareUrl.search), shareToken);
  assert.equal(readShareInventoryLink('?view=1'), null);
  for (const bad of ['?share=', '?share=short', `?share=wft_${'x'.repeat(43)}`, `${shareUrl.search}&share=${shareToken}`]) assert.throws(() => readShareInventoryLink(bad), /invalid or has been replaced/);

  const api = await serve();
  try {
    const profile = emptyProfile();
    profile.inventory.items.push(createEquipment({ name: 'Boltor Prime', slot: 'Primary', variant: 'Prime' }, { owned: true, rank: 30, notes: 'Shared build' }));
    profile.craftingPlans.push({ id: 'rhino-plan', itemId: '/Lotus/Powersuits/Rhino/Rhino', quantity: 1, completed: [], choices: {} });
    profile.arsenals = [newArsenal()];
    const token = api.tokenFor('user_share', 'ShareTenno');
    const account = await (await api.request('session', undefined, token)).json();
    assert.equal((await api.request('profile', { accountId: account.user.id, revision: 0, profile }, token, { method: 'PUT' })).status, 200);
    const otherToken = api.tokenFor('user_other', 'OtherTenno');
    await api.request('session', undefined, otherToken);

    assert.equal((await api.request('share', { accountId: account.user.id })).status, 401);
    assert.equal((await api.request('share', { accountId: account.user.id }, otherToken)).status, 409);
    assert.equal((await api.request('share', { accountId: account.user.id }, token, { origin: 'https://elsewhere.example' })).status, 403);

    const created = await api.request('share', { accountId: account.user.id }, token);
    assert.equal(created.status, 200);
    const { shareToken: firstToken } = await created.json();
    assert.equal(isShareToken(firstToken), true);

    const repeated = await api.request('share', { accountId: account.user.id }, token);
    assert.deepEqual(await repeated.json(), { shareToken: firstToken });

    const shared = await api.request(`share/${firstToken}`);
    assert.equal(shared.status, 200);
    assert.deepEqual(await shared.json(), { username: 'ShareTenno', inventory: profile.inventory });

    const updatedProfile = structuredClone(profile);
    updatedProfile.inventory.items.push(createEquipment({ name: 'Anku', slot: 'Melee', variant: 'Base' }, { owned: true, mastered: true, rank: 30 }));
    assert.equal((await api.request('profile', { accountId: account.user.id, revision: 1, profile: updatedProfile }, token, { method: 'PUT' })).status, 200);
    assert.deepEqual(await (await api.request(`share/${firstToken}`)).json(), { username: 'ShareTenno', inventory: updatedProfile.inventory });

    const replaced = await api.request('share', { accountId: account.user.id, replace: true }, token);
    assert.equal(replaced.status, 200);
    const { shareToken: secondToken } = await replaced.json();
    assert.equal(isShareToken(secondToken), true);
    assert.notEqual(secondToken, firstToken);
    assert.equal((await api.request(`share/${firstToken}`)).status, 404);
    assert.deepEqual(await (await api.request(`share/${secondToken}`)).json(), { username: 'ShareTenno', inventory: updatedProfile.inventory });
  } finally { await api.close(); }
});

test('partial crafting quantities survive saves without accepting malformed replacements', async () => {
  const api = await serve();
  try {
    const token = api.tokenFor('user_partial', 'PartialTenno');
    const account = await (await api.request('session', undefined, token)).json();
    const profile = emptyProfile();
    profile.craftingPlans = [{ id: 'partial-plan', itemId: '/Rhino', quantity: 1, completed: [], choices: {}, progress: { 'root/part': 50 } }];
    assert.equal((await api.request('profile', { accountId: account.user.id, revision: 0, profile }, token, { method: 'PUT' })).status, 200);
    const { progress, ...legacyPlan } = profile.craftingPlans[0];
    const save = { accountId: account.user.id, revision: 1, profile: { ...profile, craftingPlans: [legacyPlan] } };
    assert.equal((await api.request('profile', save, token, { method: 'PUT' })).status, 200);
    const read = async () => (await (await api.request('session', undefined, token)).json()).profile.craftingPlans[0].progress;
    assert.deepEqual(await read(), progress);
    assert.equal((await api.request('profile', { ...save, revision: 2, profile: { ...profile, craftingPlans: [{ ...legacyPlan, progress: null }] } }, token, { method: 'PUT' })).status, 400);
    assert.deepEqual(await read(), progress);
    assert.equal((await api.request('profile', { ...save, revision: 2, profile: { ...profile, craftingPlans: [{ ...legacyPlan, progress: {} }] } }, token, { method: 'PUT' })).status, 200);
    assert.deepEqual(await read(), {});
  } finally { await api.close(); }
});
