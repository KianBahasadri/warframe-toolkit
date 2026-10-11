import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAccountsApi } from '../server/accounts.ts';
import { emptyProfile } from '../src/lib/account.ts';
import { createEquipment } from '../src/lib/model.ts';

const password = 'a toolkit test passphrase';
async function serve(path = ':memory:', now?: () => number) {
  const api = createAccountsApi({ databasePath: path, now });
  const server = createServer((req, res) => api.middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    async request(path: string, data?: unknown, cookie = '', options: { method?: string; origin?: string } = {}) {
      return fetch(`${base}/api/account/${path}`, { method: options.method ?? (data === undefined ? 'GET' : 'POST'), headers: { Origin: options.origin ?? base, 'X-Toolkit-Request': '1', 'Content-Type': 'application/json', Cookie: cookie }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    },
    async close() { await new Promise<void>(resolve => server.close(() => resolve())); api.close(); },
  };
}
const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0];

test('accounts use normalized usernames and salted password hashes, with private expiring sessions and no email', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-auth-'));
  const path = join(directory, 'accounts.sqlite');
  const api = await serve(path);
  try {
    const registered = await api.request('register', { username: '  MyTenno#123  ', password });
    assert.equal(registered.status, 201);
    const account = await registered.json();
    assert.equal(account.user.username, 'MyTenno#123'); assert.deepEqual(account.profile, emptyProfile());
    assert.deepEqual(Object.keys(account.user).sort(), ['id', 'username']);
    assert.match(registered.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax; Max-Age=2592000/);
    const cookie = cookieOf(registered);
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), account);
    const duplicate = await api.request('register', { username: 'mytenno#123', password });
    assert.equal(duplicate.status, 409);
    assert.equal((await api.request('login', { username: 'MyTenno#123', password: 'wrong password' })).status, 401);
    assert.equal((await api.request('login', { username: 'UnknownTenno', password })).status, 401);
    const login = await api.request('login', { username: 'MYTENNO#123', password }, cookie);
    assert.equal(login.status, 200); assert.notEqual(cookieOf(login), cookie);
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), { user: null });
    const db = new DatabaseSync(path);
    const stored = db.prepare('SELECT salt, password_hash FROM accounts').get()!;
    assert.equal(String(stored.password_hash).length, 128); assert.equal(String(stored.salt).length, 32);
    assert.notEqual(stored.password_hash, password);
    assert.equal(db.prepare('PRAGMA table_info(accounts)').all().some(row => row.name === 'email'), false);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM sessions').all()).includes(cookieOf(login).split('=')[1]), false);
    db.close();
    const logout = await api.request('logout', { accountId: account.user.id }, cookieOf(login));
    assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/);
    assert.deepEqual(await (await api.request('session', undefined, cookieOf(login))).json(), { user: null });
  } finally { await api.close(); await rm(directory, { recursive: true }); }
});

test('guests cannot save; account ownership and revision checks prevent crossed or stale writes', async () => {
  const api = await serve();
  try {
    assert.equal((await api.request('profile', { profile: emptyProfile(), revision: 0 }, '', { method: 'PUT' })).status, 401);
    const a = await api.request('register', { username: 'TennoA', password }), aCookie = cookieOf(a), aData = await a.json();
    const b = await api.request('register', { username: 'TennoB', password }), bCookie = cookieOf(b), bData = await b.json();
    const profile = emptyProfile();
    profile.inventory.items.push(createEquipment({ name: 'Boltor Prime', slot: 'Primary', variant: 'Prime' }, { owned: true, mastered: false, rank: 7, notes: 'Keep for crafting', override: 'Keep' }));
    const save = { accountId: aData.user.id, revision: 0, profile };
    assert.equal((await api.request('profile', save, bCookie, { method: 'PUT' })).status, 409);
    assert.equal((await api.request('profile', save, aCookie, { method: 'PUT' })).status, 200);
    assert.deepEqual((await (await api.request('session', undefined, aCookie)).json()).profile, profile);
    assert.deepEqual((await (await api.request('session', undefined, bCookie)).json()).profile, bData.profile);
    assert.equal((await api.request('profile', { ...save, profile: emptyProfile() }, aCookie, { method: 'PUT' })).status, 409);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { inventory: {}, dropViews: [] } }, aCookie, { method: 'PUT' })).status, 400);
    assert.deepEqual((await (await api.request('session', undefined, aCookie)).json()).profile, profile);
  } finally { await api.close(); }
});

test('password bounds, origin checks, method restrictions and throttling apply before writes', async () => {
  const api = await serve();
  try {
    assert.equal((await api.request('register', { username: 'TestTenno', password: 'short' })).status, 400);
    assert.equal((await api.request('register', { username: 'TestTenno', password }, '', { origin: 'https://elsewhere.example' })).status, 403);
    assert.equal((await api.request('logout')).status, 405);
    for (let index = 0; index < 12; index++) assert.equal((await api.request('login', { username: 'RateLimitTenno', password: 'x'.repeat(129) })).status, 400);
    const limited = await api.request('login', { username: 'RateLimitTenno', password });
    assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
  } finally { await api.close(); }
});

test('accounts and sessions survive a server restart, while expired sessions cannot save', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-auth-'));
  const path = join(directory, 'accounts.sqlite'); let now = Date.now();
  let api = await serve(path, () => now);
  try {
    const response = await api.request('register', { username: 'PersistentTenno', password });
    const cookie = cookieOf(response), data = await response.json();
    await api.close(); api = await serve(path, () => now);
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), data);
    now += 31 * 24 * 60 * 60 * 1000;
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), { user: null });
    assert.equal((await api.request('profile', { accountId: data.user.id, profile: emptyProfile(), revision: 0 }, cookie, { method: 'PUT' })).status, 401);
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
    const response = await api.request('register', { username: 'PreservedTenno', password });
    const cookie = cookieOf(response), data = await response.json();
    const db = new DatabaseSync(goodPath); db.prepare('UPDATE accounts SET profile = ?').run('{broken');
    assert.equal((await api.request('session', undefined, cookie)).status, 503);
    assert.equal((await api.request('profile', { accountId: data.user.id, profile: emptyProfile(), revision: 0 }, cookie, { method: 'PUT' })).status, 503);
    assert.equal(db.prepare('SELECT profile FROM accounts').get()!.profile, '{broken'); db.close();
  } finally { await api.close(); await rm(directory, { recursive: true }); }
});
