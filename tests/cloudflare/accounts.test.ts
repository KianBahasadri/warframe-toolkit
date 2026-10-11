import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cloudflareRuntime } from './runtime.ts';
import { emptyProfile, isAccessKey } from '../../src/lib/account.ts';
import { createEquipment } from '../../src/lib/model.ts';

const cookieOf = (response: { headers: Headers }) => response.headers.get('set-cookie')!.split(';')[0];
test('D1 accounts preserve authentication, profile isolation, revisions, key rotation, and protected writes', async () => {
  const api = await cloudflareRuntime();
  try {
    const registered = await api.request('register', { username: '  MyTenno#123  ' });
    assert.equal(registered.status, 201, await registered.clone().text());
    const a = await registered.json() as any, cookie = cookieOf(registered);
    assert.ok(isAccessKey(a.accessKey)); assert.equal(a.user.username, 'MyTenno#123');
    assert.match(registered.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
    assert.equal(registered.headers.get('cache-control'), 'no-store');
    const snapshot = { user: a.user, profile: a.profile, revision: 0 };
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), snapshot);
    assert.equal((await api.request('register', { username: 'mytenno#123' })).status, 409);
    assert.equal((await api.request('register', { username: 'Chosen', password: 'chosen' })).status, 400);
    assert.equal((await api.request('register', { username: 'Cross' }, '', { origin: 'https://other.test' })).status, 403);
    const bResponse = await api.request('register', { username: 'Other' }), b = await bResponse.json() as any;
    const profile = emptyProfile();
    profile.inventory.items.push(createEquipment({ name: 'Boltor Prime', slot: 'Primary', variant: 'Prime' }, { owned: true, rank: 7, mastered: false, notes: 'Preserve planning', override: 'Keep' }));
    const save = { accountId: a.user.id, revision: 0, profile };
    assert.equal((await api.request('profile', save, '', { method: 'PUT' })).status, 401);
    assert.equal((await api.request('profile', save, cookieOf(bResponse), { method: 'PUT' })).status, 409);
    const concurrent = await Promise.all([api.request('profile', save, cookie, { method: 'PUT' }), api.request('profile', { ...save, profile: emptyProfile() }, cookie, { method: 'PUT' })]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    assert.deepEqual((await (await api.request('session', undefined, cookieOf(bResponse))).json() as any).profile, b.profile);
    const saved = await (await api.request('session', undefined, cookie)).json();
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { inventory: {} } }, cookie, { method: 'PUT' })).status, 400);
    assert.equal((await api.request('login', { username: 'MyTenno#123', accessKey: 'wrong' })).status, 401);
    const login = await api.request('login', { username: 'MYTENNO#123', accessKey: a.accessKey });
    assert.equal(login.status, 200);
    const rotation = await api.request('access-key', { accountId: a.user.id }, cookie);
    assert.equal(rotation.status, 200);
    const key = (await rotation.json() as any).accessKey;
    assert.ok(isAccessKey(key)); assert.notEqual(key, a.accessKey);
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), saved);
    assert.deepEqual(await (await api.request('session', undefined, cookieOf(login))).json(), { user: null });
    assert.equal((await api.request('login', { username: a.user.username, accessKey: a.accessKey })).status, 401);
    assert.equal((await api.request('login', { username: a.user.username, accessKey: key })).status, 200);
    const stored = await api.db.prepare('SELECT * FROM accounts WHERE id = ?').bind(a.user.id).first() as any;
    assert.equal(stored.access_key_hash, createHash('sha256').update(key).digest('hex'));
    assert.equal(JSON.stringify(stored).includes(key), false);
    const logout = await api.request('logout', { accountId: a.user.id }, cookie);
    assert.equal(logout.status, 200);
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), { user: null });
  } finally { await api.close(); }
});

test('D1 chunked saves larger than 2 MB round-trip, discard old chunks, and preserve corrupted saves', async () => {
  const api = await cloudflareRuntime();
  try {
    const response = await api.request('register', { username: 'LargeSave' }), data = await response.json() as any, cookie = cookieOf(response);
    const profile = emptyProfile();
    profile.inventory.items = Array.from({ length: 900 }, (_, index) => createEquipment({ name: `Item ${index}`, slot: 'Primary', variant: 'Base' }, { notes: '🎮'.repeat(2300), owned: true }));
    const encoded = JSON.stringify(profile);
    assert.ok(Buffer.byteLength(encoded) > 8 * 1024 * 1024);
    const save = await api.request('profile', { accountId: data.user.id, revision: 0, profile }, cookie, { method: 'PUT' });
    assert.equal(save.status, 200, await save.clone().text());
    assert.deepEqual((await (await api.request('session', undefined, cookie)).json() as any).profile, profile);
    const chunks = await api.db.prepare('SELECT COUNT(*) AS count, MAX(length(CAST(contents AS BLOB))) AS size FROM account_profile_chunks').first() as any;
    assert.ok(chunks.count > 1); assert.ok(chunks.size < 2 * 1024 * 1024);
    assert.equal((await api.request('profile', { accountId: data.user.id, revision: 1, profile: emptyProfile() }, cookie, { method: 'PUT' })).status, 200);
    assert.equal((await api.db.prepare('SELECT COUNT(*) AS count FROM account_profile_chunks').first() as any).count, 1);
    await api.db.prepare("UPDATE account_profile_chunks SET contents = '{broken'").run();
    assert.equal((await api.request('session', undefined, cookie)).status, 503);
    assert.equal((await api.request('profile', { accountId: data.user.id, revision: 2, profile: emptyProfile() }, cookie, { method: 'PUT' })).status, 503);
    assert.equal((await api.request('access-key', { accountId: data.user.id }, cookie)).status, 503);
    assert.equal((await api.db.prepare('SELECT contents FROM account_profile_chunks').first() as any).contents, '{broken');
    assert.equal((await api.request('logout', { accountId: data.user.id }, cookie)).status, 200);
  } finally { await api.close(); }
});

test('D1 saves and persistent throttles survive runtime restarts; expired sessions cannot write', async () => {
  const persist = await mkdtemp(join(tmpdir(), 'toolkit-cloudflare-'));
  let api = await cloudflareRuntime({ persist });
  try {
    const response = await api.request('register', { username: 'Persistent' }), cookie = cookieOf(response), data = await response.json() as any;
    for (let i = 0; i < 12; i++) assert.equal((await api.request('login', { username: 'Limited', accessKey: 'wrong' })).status, 401);
    await api.close(); api = await cloudflareRuntime({ persist });
    assert.deepEqual((await (await api.request('session', undefined, cookie)).json() as any).user, data.user);
    assert.equal((await api.request('login', { username: 'Limited', accessKey: 'wrong' })).status, 429);
    await api.db.prepare('UPDATE sessions SET expires_at = 0').run();
    assert.deepEqual(await (await api.request('session', undefined, cookie)).json(), { user: null });
    assert.equal((await api.request('profile', { accountId: data.user.id, revision: 0, profile: emptyProfile() }, cookie, { method: 'PUT' })).status, 401);
  } finally { await api.close(); await rm(persist, { recursive: true, force: true }); }
});
