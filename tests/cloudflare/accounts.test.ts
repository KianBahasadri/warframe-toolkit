import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudflareRuntime } from './runtime.ts';
import { emptyProfile, isShareToken } from '../../src/lib/account.ts';
import { createEquipment } from '../../src/lib/model.ts';
import { newArsenal } from '../../src/lib/modderModel.ts';

test('D1 preserves arsenals and rejects malformed builds', async () => {
  const api = await cloudflareRuntime();
  try {
    const token = api.tokenFor('user_modder', 'ModderTenno');
    const account = await (await api.request('session', undefined, token)).json() as any;
    const profile = emptyProfile(); profile.arsenals = [newArsenal()];
    const save = { accountId: account.user.id, revision: 0, profile };
    assert.equal((await api.request('profile', save, token, { method: 'PUT' })).status, 200);
    assert.deepEqual((await (await api.request('session', undefined, token)).json() as any).profile.arsenals, profile.arsenals);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { ...profile, arsenals: null } }, token, { method: 'PUT' })).status, 400);
    assert.deepEqual((await (await api.request('session', undefined, token)).json() as any).profile.arsenals, profile.arsenals);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { ...profile, arsenals: [] } }, token, { method: 'PUT' })).status, 200);
    assert.deepEqual((await (await api.request('session', undefined, token)).json() as any).profile.arsenals, []);
  } finally { await api.close(); }
});

test('D1 keeps crafting plans and rejects malformed replacements', async () => {
  const api = await cloudflareRuntime();
  try {
    const token = api.tokenFor('user_crafting', 'CraftingTenno');
    const account = await (await api.request('session', undefined, token)).json() as any;
    const profile = emptyProfile();
    profile.craftingPlans = [{ id: 'plan', itemId: '/Rhino', quantity: 1, completed: ['root'], choices: {} }];
    const save = { accountId: account.user.id, revision: 0, profile };
    assert.equal((await api.request('profile', save, token, { method: 'PUT' })).status, 200);
    assert.deepEqual((await (await api.request('session', undefined, token)).json() as any).profile.craftingPlans, profile.craftingPlans);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { ...profile, craftingPlans: null } }, token, { method: 'PUT' })).status, 400);
    assert.deepEqual((await (await api.request('session', undefined, token)).json() as any).profile.craftingPlans, profile.craftingPlans);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { ...profile, craftingPlans: [] } }, token, { method: 'PUT' })).status, 200);
    assert.deepEqual((await (await api.request('session', undefined, token)).json() as any).profile.craftingPlans, []);
  } finally { await api.close(); }
});

test('D1 accounts verify Clerk tokens, isolate profiles, enforce revisions, and support live sharing', async () => {
  const api = await cloudflareRuntime();
  try {
    assert.deepEqual(await (await api.request('session')).json(), { user: null });
    const aToken = api.tokenFor('user_tenno_a', '  MyTenno#123  ');
    const sessionRes = await api.request('session', undefined, aToken);
    assert.equal(sessionRes.status, 200);
    assert.equal(sessionRes.headers.get('cache-control'), 'no-store');
    const a = await sessionRes.json() as any;
    assert.equal(a.user.id, 'user_tenno_a');
    assert.equal(a.user.username, 'MyTenno#123');
    assert.deepEqual(a.profile, emptyProfile());

    const bToken = api.tokenFor('user_tenno_b', 'Other');
    const b = await (await api.request('session', undefined, bToken)).json() as any;
    const profile = emptyProfile();
    profile.inventory.items.push(createEquipment({ name: 'Boltor Prime', slot: 'Primary', variant: 'Prime' }, { owned: true, rank: 7, mastered: false, notes: 'Preserve planning', override: 'Keep' }));
    profile.craftingPlans.push({ id: 'rhino-plan', itemId: '/Lotus/Powersuits/Rhino/Rhino', quantity: 2, completed: ['root/part'], choices: {} });
    const save = { accountId: a.user.id, revision: 0, profile };
    assert.equal((await api.request('profile', save, '', { method: 'PUT' })).status, 401);
    assert.equal((await api.request('profile', save, aToken, { method: 'PUT', origin: 'https://other.test' })).status, 403);
    assert.equal((await api.request('profile', save, bToken, { method: 'PUT' })).status, 409);
    const concurrent = await Promise.all([api.request('profile', save, aToken, { method: 'PUT' }), api.request('profile', { ...save, profile: emptyProfile() }, aToken, { method: 'PUT' })]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    assert.deepEqual((await (await api.request('session', undefined, bToken)).json() as any).profile, b.profile);
    assert.equal((await api.request('profile', { ...save, revision: 1, profile: { inventory: {} } }, aToken, { method: 'PUT' })).status, 400);

    const share = await api.request('share', { accountId: a.user.id }, aToken);
    assert.equal(share.status, 200);
    const { shareToken } = await share.json() as any;
    assert.ok(isShareToken(shareToken));
    assert.deepEqual(await (await api.request(`share/${shareToken}`)).json(), { username: 'MyTenno#123', inventory: profile.inventory });
    const replacedShare = await api.request('share', { accountId: a.user.id, replace: true }, aToken);
    assert.equal(replacedShare.status, 200);
    const { shareToken: nextShareToken } = await replacedShare.json() as any;
    assert.ok(isShareToken(nextShareToken)); assert.notEqual(nextShareToken, shareToken);
    assert.equal((await api.request(`share/${shareToken}`)).status, 404);
    assert.deepEqual(await (await api.request(`share/${nextShareToken}`)).json(), { username: 'MyTenno#123', inventory: profile.inventory });
  } finally { await api.close(); }
});

test('D1 chunked saves larger than 2 MB round-trip, discard old chunks, and preserve corrupted saves', async () => {
  const api = await cloudflareRuntime();
  try {
    const token = api.tokenFor('user_large', 'LargeSave');
    const data = await (await api.request('session', undefined, token)).json() as any;
    const profile = emptyProfile();
    profile.inventory.items = Array.from({ length: 900 }, (_, index) => createEquipment({ name: `Item ${index}`, slot: 'Primary', variant: 'Base' }, { notes: '🎮'.repeat(2300), owned: true }));
    const encoded = JSON.stringify(profile);
    assert.ok(Buffer.byteLength(encoded) > 8 * 1024 * 1024);
    const save = await api.request('profile', { accountId: data.user.id, revision: 0, profile }, token, { method: 'PUT' });
    assert.equal(save.status, 200, await save.clone().text());
    assert.deepEqual((await (await api.request('session', undefined, token)).json() as any).profile, profile);
    const chunks = await api.db.prepare('SELECT COUNT(*) AS count, MAX(length(CAST(contents AS BLOB))) AS size FROM account_profile_chunks').first() as any;
    assert.ok(chunks.count > 1); assert.ok(chunks.size < 2 * 1024 * 1024);
    assert.equal((await api.request('profile', { accountId: data.user.id, revision: 1, profile: emptyProfile() }, token, { method: 'PUT' })).status, 200);
    assert.equal((await api.db.prepare('SELECT COUNT(*) AS count FROM account_profile_chunks').first() as any).count, 1);
    await api.db.prepare("UPDATE account_profile_chunks SET contents = '{broken'").run();
    assert.equal((await api.request('session', undefined, token)).status, 503);
    assert.equal((await api.request('profile', { accountId: data.user.id, revision: 2, profile: emptyProfile() }, token, { method: 'PUT' })).status, 503);
    assert.equal((await api.db.prepare('SELECT contents FROM account_profile_chunks').first() as any).contents, '{broken');
  } finally { await api.close(); }
});

test('D1 saves survive runtime restarts; expired Clerk tokens cannot write', async () => {
  const persist = await mkdtemp(join(tmpdir(), 'toolkit-cloudflare-'));
  let api = await cloudflareRuntime({ persist });
  try {
    const token = api.tokenFor('user_persist', 'Persistent');
    const data = await (await api.request('session', undefined, token)).json() as any;
    await api.close(); api = await cloudflareRuntime({ persist });
    assert.deepEqual((await (await api.request('session', undefined, token)).json() as any).user, data.user);
    const expired = api.tokenFor('user_persist', 'Persistent', -60);
    assert.equal((await api.request('session', undefined, expired)).status, 401);
    assert.equal((await api.request('profile', { accountId: data.user.id, revision: 0, profile: emptyProfile() }, expired, { method: 'PUT' })).status, 401);
  } finally { await api.close(); await rm(persist, { recursive: true, force: true }); }
});

test('partial crafting quantities survive saves without accepting malformed replacements', async () => {
  const api = await cloudflareRuntime();
  try {
    const token = api.tokenFor('user_partial', 'PartialTenno');
    const account = await (await api.request('session', undefined, token)).json() as any;
    const profile = emptyProfile();
    profile.craftingPlans = [{ id: 'partial-plan', itemId: '/Rhino', quantity: 1, completed: [], choices: {}, progress: { 'root/part': 50 } }];
    assert.equal((await api.request('profile', { accountId: account.user.id, revision: 0, profile }, token, { method: 'PUT' })).status, 200);
    const { progress, ...legacyPlan } = profile.craftingPlans[0];
    const save = { accountId: account.user.id, revision: 1, profile: { ...profile, craftingPlans: [legacyPlan] } };
    assert.equal((await api.request('profile', save, token, { method: 'PUT' })).status, 200);
    const read = async () => (await (await api.request('session', undefined, token)).json() as any).profile.craftingPlans[0].progress;
    assert.deepEqual(await read(), progress);
    assert.equal((await api.request('profile', { ...save, revision: 2, profile: { ...profile, craftingPlans: [{ ...legacyPlan, progress: null }] } }, token, { method: 'PUT' })).status, 400);
    assert.deepEqual(await read(), progress);
    assert.equal((await api.request('profile', { ...save, revision: 2, profile: { ...profile, craftingPlans: [{ ...legacyPlan, progress: {} }] } }, token, { method: 'PUT' })).status, 200);
    assert.deepEqual(await read(), {});
  } finally { await api.close(); }
});
