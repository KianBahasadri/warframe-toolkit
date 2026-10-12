import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionState, assertSafePlan } from '../scripts/deployment-checks.mjs';

function productionState() {
  const resources = [
    ['cloudflare_d1_database', 'accounts', '2784ba23-6688-46fe-92e8-969d9784c66b'],
    ['cloudflare_dns_record', 'apex', 'dc887e7ed77bc60d13db709223741791'],
    ['cloudflare_workers_script', 'app', 'warframe-toolkit'],
    ['cloudflare_workers_script_subdomain', 'app', 'warframe-toolkit'],
    ['cloudflare_workers_cron_trigger', 'drops', 'warframe-toolkit'],
    ['cloudflare_workers_route', 'app', 'a6ad1fffd58c4a158ec52cb1ac7d28bd'],
    ['cloudflare_zone_setting', 'https', 'always_use_https'],
  ].map(([type, name, id]) => ({ mode: 'managed', type, name, instances: [{ attributes: { id } }] }));
  return { lineage: 'fda4ae0f-f27e-c291-9eea-8c87fada68c3', resources };
}

test('deployment refuses empty, unrelated, incomplete or mismatched production state', () => {
  assert.doesNotThrow(() => assertProductionState(productionState()));
  for (const state of [undefined, {}, { ...productionState(), lineage: 'another-deployment' }]) assert.throws(() => assertProductionState(state), /state/);
  const incomplete = productionState(); incomplete.resources.shift();
  assert.throws(() => assertProductionState(incomplete), /cloudflare_d1_database.accounts/);
  const wrongDatabase = productionState(); wrongDatabase.resources[0].instances[0].attributes.id = 'another-database';
  assert.throws(() => assertProductionState(wrongDatabase), /cloudflare_d1_database.accounts/);
  const wrongWorker = productionState(); wrongWorker.resources[2].instances[0].attributes.id = 'another-worker';
  assert.throws(() => assertProductionState(wrongWorker), /cloudflare_workers_script.app/);
});

test('deployment permits updates and migration runs but rejects infrastructure deletion or replacement', () => {
  const change = (address: string, actions: string[]) => ({ address, change: { actions } });
  const safe = { resource_changes: [change('cloudflare_workers_script.app', ['update']), change('cloudflare_d1_database.accounts', ['no-op']), change('terraform_data.schema', ['delete', 'create'])] };
  assert.doesNotThrow(() => assertSafePlan(safe));
  assert.doesNotThrow(() => assertSafePlan({ resource_changes: [] }));
  for (const address of ['cloudflare_d1_database.accounts', 'cloudflare_workers_script.app', 'cloudflare_workers_route.app']) {
    for (const actions of [['delete'], ['delete', 'create'], ['create', 'delete']]) assert.throws(() => assertSafePlan({ resource_changes: [change(address, actions)] }), /refused/);
  }
  assert.throws(() => assertSafePlan({ ...safe, errored: true }), /valid production plan/);
  assert.throws(() => assertSafePlan({}), /valid production plan/);
});

test('an in-place Worker update cannot silently delete or transfer Durable Object namespaces', () => {
  for (const field of ['deleted_classes', 'renamed_classes', 'transferred_classes']) {
    const step = { [field]: field === 'deleted_classes' ? ['AccountGateway'] : [{ from: 'AccountGateway', to: 'Other' }] };
    for (const migrations of [step, { steps: [step] }]) {
      assert.throws(() => assertSafePlan({ resource_changes: [{ address: 'cloudflare_workers_script.app', type: 'cloudflare_workers_script', change: { actions: ['update'], after: { migrations } } }] }), /Durable Object migration/);
    }
  }
  assert.doesNotThrow(() => assertSafePlan({ resource_changes: [{ address: 'cloudflare_workers_script.app', type: 'cloudflare_workers_script', change: { actions: ['update'], after: { migrations: { old_tag: 'v1', new_tag: 'v1' } } } }] }));
});
