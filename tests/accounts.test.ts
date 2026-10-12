import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAccountsApi } from '../server/accounts.ts';
import { accessKeyLink, emptyProfile, isAccessKey, readAccessKeyLink } from '../src/lib/account.ts';
import { createEquipment } from '../src/lib/model.ts';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
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

test('accounts use normalized usernames and generated access keys, with private expiring sessions and no email', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-auth-'));
  const path = join(directory, 'accounts.sqlite');
  const api = await serve(path);
  try {
    const registered = await api.request('register', { username: '  MyTenno#123  ' });
    assert.equal(registered.status, 201);
    const { accessKey, ...account } = await registered.json();
    assert.equal(isAccessKey(accessKey), true);
    assert.equal(registered.headers.get('cache-control'), 'no-store');
    assert.equal(account.user.username, 'MyTenno#123'); assert.deepEqual(account.profile, emptyProfile());
    assert.deepEqual(Object.keys(account.user).sort(), ['id', 'username']);
    assert.match(registered.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax; Max-Age=2592000/);
    const cookie = cookieOf(registered);
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), account);
    const duplicate = await api.request('register', { username: 'mytenno#123' });
    assert.equal(duplicate.status, 409);
    assert.equal((await api.request('login', { username: 'MyTenno#123', accessKey: 'wrong key' })).status, 401);
    assert.equal((await api.request('login', { username: 'UnknownTenno', accessKey })).status, 401);
    const login = await api.request('login', { username: 'MYTENNO#123', accessKey: ` ${accessKey} ` }, cookie);
    assert.equal(login.status, 200); assert.notEqual(cookieOf(login), cookie);
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), { user: null });
    const db = new DatabaseSync(path);
    const stored = db.prepare('SELECT access_key_hash FROM accounts').get()!;
    assert.equal(stored.access_key_hash, digest(accessKey));
    assert.equal(db.prepare('PRAGMA table_info(accounts)').all().some(row => ['salt', 'password_hash'].includes(String(row.name))), false);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM accounts').all()).includes(accessKey), false);
    assert.equal((await api.request('login', { username: 'MyTenno#123', accessKey: digest(accessKey) })).status, 401);
    assert.equal((await login.json()).accessKey, undefined);
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
    const a = await api.request('register', { username: 'TennoA' }), aCookie = cookieOf(a), aData = await a.json();
    const b = await api.request('register', { username: 'TennoB' }), bCookie = cookieOf(b), bData = await b.json();
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

test('generated credentials, input bounds, origin checks, method restrictions and throttling apply before writes', async () => {
  const api = await serve();
  try {
    assert.equal((await api.request('register', { username: 'TestTenno', accessKey: 'chosen-key' })).status, 400);
    assert.equal((await api.request('register', { username: 'TestTenno' }, '', { origin: 'https://elsewhere.example' })).status, 403);
    assert.equal((await api.request('logout')).status, 405);
    for (let index = 0; index < 12; index++) assert.equal((await api.request('login', { username: 'RateLimitTenno', accessKey: 'x'.repeat(129) })).status, 400);
    const limited = await api.request('login', { username: 'RateLimitTenno', accessKey: 'wrong-key' });
    assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
  } finally { await api.close(); }
});

test('accounts and sessions survive a server restart, while expired sessions cannot save', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-auth-'));
  const path = join(directory, 'accounts.sqlite'); let now = Date.now();
  let api = await serve(path, () => now);
  try {
    const response = await api.request('register', { username: 'PersistentTenno' });
    const cookie = cookieOf(response), { accessKey, ...data } = await response.json();
    await api.close(); api = await serve(path, () => now);
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), data);
    now += 31 * 24 * 60 * 60 * 1000;
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), { user: null });
    assert.equal((await api.request('profile', { accountId: data.user.id, profile: emptyProfile(), revision: 0 }, cookie, { method: 'PUT' })).status, 401);
    const logout = await api.request('logout', { accountId: data.user.id }, cookie);
    assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/);
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
    const response = await api.request('register', { username: 'PreservedTenno' });
    const cookie = cookieOf(response), { accessKey, ...data } = await response.json();
    const db = new DatabaseSync(goodPath); db.prepare('UPDATE accounts SET profile = ?').run('{broken');
    assert.equal((await api.request('session', undefined, cookie)).status, 503);
    assert.equal((await api.request('profile', { accountId: data.user.id, profile: emptyProfile(), revision: 0 }, cookie, { method: 'PUT' })).status, 503);
    assert.equal((await api.request('access-key', { accountId: data.user.id }, cookie)).status, 503);
    assert.equal(db.prepare('SELECT access_key_hash FROM accounts').get()!.access_key_hash, digest(accessKey));
    assert.equal(db.prepare('SELECT profile FROM accounts').get()!.profile, '{broken'); db.close();
  } finally { await api.close(); await rm(directory, { recursive: true }); }
});

test('replacing an access key preserves saves and revokes the old key and other sessions', async () => {
  const api = await serve();
  try {
    const profile = emptyProfile();
    profile.inventory.items.push(createEquipment({ name: 'Boltor', slot: 'Primary', variant: 'Base' }, { owned: true, rank: 7, notes: 'Keep this save' }));
    const first = await api.request('register', { username: 'KeyTenno', profile });
    const cookie = cookieOf(first), { accessKey, ...account } = await first.json();
    const other = await api.request('login', { username: 'KeyTenno', accessKey });
    const otherCookie = cookieOf(other);
    assert.equal((await api.request('access-key', { accountId: account.user.id })).status, 401);
    assert.equal((await api.request('access-key', { accountId: 'another-account' }, cookie)).status, 409);
    assert.equal((await api.request('access-key', { accountId: account.user.id }, cookie, { origin: 'https://elsewhere.example' })).status, 403);
    const replaced = await api.request('access-key', { accountId: account.user.id }, cookie);
    assert.equal(replaced.status, 200);
    const { accessKey: newKey } = await replaced.json();
    assert.equal(isAccessKey(newKey), true); assert.notEqual(newKey, accessKey);
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), account);
    assert.deepEqual(await (await api.request('session', undefined, otherCookie)).json(), { user: null });
    assert.equal((await api.request('login', { username: 'KeyTenno', accessKey })).status, 401);
    assert.equal((await api.request('login', { username: 'KeyTenno', accessKey: newKey })).status, 200);
    const second = await (await api.request('register', { username: 'DifferentTenno' })).json();
    assert.notEqual(second.accessKey, newKey);
    assert.equal((await api.request('login', { username: 'DifferentTenno', accessKey: newKey })).status, 401);
  } finally { await api.close(); }
});

test('removing retired credential columns preserves access keys, profiles, revisions and sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'warframe-schema-'));
  const path = join(directory, 'accounts.sqlite');
  const accessKey = `wft_${'x'.repeat(43)}`, sessionToken = 's'.repeat(43);
  const profile = emptyProfile();
  profile.inventory.items.push(createEquipment({ name: 'Boltor Prime', slot: 'Primary', variant: 'Prime' }, { owned: true, rank: 7, notes: 'Preserve existing account' }));
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, access_key_hash TEXT, profile TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)`);
  db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('existing-id', 'ExistingTenno', 'existingtenno', 'retired salt', 'retired hash', digest(accessKey), JSON.stringify(profile), 9);
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(sessionToken), 'existing-id', Date.now() + 60_000);
  db.close();
  const api = await serve(path);
  try {
    const expected = { user: { id: 'existing-id', username: 'ExistingTenno' }, profile, revision: 9 };
    assert.deepEqual(await (await api.request('session', undefined, `warframe_toolkit_session=${sessionToken}`)).json(), expected);
    const login = await api.request('login', { username: 'ExistingTenno', accessKey });
    assert.equal(login.status, 200); assert.deepEqual(await login.json(), expected);
    assert.equal((await api.request('login', { username: 'ExistingTenno', accessKey: 'a previous toolkit password' })).status, 401);
    assert.equal((await api.request('register', { username: 'NewTenno' })).status, 201);
    const read = new DatabaseSync(path);
    assert.equal(read.prepare('PRAGMA table_info(accounts)').all().some(row => ['salt', 'password_hash'].includes(String(row.name))), false);
    assert.equal(read.prepare('SELECT access_key_hash FROM accounts WHERE id = ?').get('existing-id')!.access_key_hash, digest(accessKey));
    assert.equal(read.prepare('PRAGMA foreign_key_check').all().length, 0);
    read.close();
  } finally { await api.close(); await rm(directory, { recursive: true }); }
});

test('personal sign-in links carry credentials only in the fragment and reject malformed links', () => {
  const accessKey = `wft_${'x'.repeat(43)}`, username = 'Tennö#123';
  const url = new URL(accessKeyLink('https://toolkit.example/app/?old=1#droptables?view=old', username, accessKey));
  assert.equal(url.origin, 'https://toolkit.example'); assert.equal(url.pathname, '/app/'); assert.equal(url.search, '');
  assert.equal(`${url.origin}${url.pathname}${url.search}`.includes(accessKey), false);
  assert.deepEqual(readAccessKeyLink(url.hash), { username, accessKey });
  assert.equal(readAccessKeyLink('#droptables?view=old'), null);
  for (const hash of ['#sign-in', '#sign-in?username=Tenno', '#sign-in?username=Tenno&key=short', `${url.hash}&key=${accessKey}`, `${url.hash}&username=Other`]) assert.throws(() => readAccessKeyLink(hash), /incomplete or invalid/);
});
