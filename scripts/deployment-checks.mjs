// Existing production identities: a fresh or incomplete state must never create
// replacements for live accounts, Durable Objects, or the application route.
export function assertProductionState(state) {
  if (state?.lineage !== '72fa0006-b941-0133-a965-c2a18df5ee18') throw new Error('Production state is missing or has a different lineage. Restore/import state before deploying.');
  const expected = {
    'cloudflare_d1_database.accounts': '2784ba23-6688-46fe-92e8-969d9784c66b',
    'cloudflare_dns_record.apex': 'dc887e7ed77bc60d13db709223741791',
    'cloudflare_workers_script.app': 'warframe-toolkit',
    'cloudflare_workers_script_subdomain.app': 'warframe-toolkit',
    'cloudflare_workers_cron_trigger.drops': 'warframe-toolkit',
    'cloudflare_workers_route.app': 'a6ad1fffd58c4a158ec52cb1ac7d28bd',
    'cloudflare_zone_setting.https': 'always_use_https',
  };
  for (const [address, id] of Object.entries(expected)) {
    const resource = state.resources?.find(resource => resource.mode === 'managed' && `${resource.type}.${resource.name}` === address);
    if (resource?.instances?.length !== 1 || resource.instances[0].attributes?.id !== id) throw new Error(`Production state does not contain the expected ${address}. Restore/import it before deploying.`);
  }
}

export function assertSafePlan(plan) {
  if (plan?.errored || !Array.isArray(plan?.resource_changes)) throw new Error('Terraform did not produce a valid production plan.');
  // SQL migrations legitimately replace their runner, but automated deployments
  // never delete/recreate infrastructure. Intentional removals need a local plan.
  for (const resource of plan.resource_changes) {
    if (resource.change?.actions?.includes('delete') && resource.address !== 'terraform_data.schema') throw new Error(`Automatic deployment refused to delete or replace ${resource.address}.`);
    if (resource.type === 'cloudflare_workers_script') {
      const migration = resource.change?.after?.migrations;
      for (const step of [migration, ...(migration?.steps ?? [])]) {
        if (['deleted_classes', 'renamed_classes', 'transferred_classes'].some(field => step?.[field]?.length)) throw new Error('Automatic deployment refused a destructive Durable Object migration.');
      }
    }
  }
}
