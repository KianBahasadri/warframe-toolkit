// Check the real CI identity before building or applying. Tokens stay
// in memory and are never logged, written to files, or passed to subprocesses.
const env = process.env;
for (const name of ['ARM_CLIENT_ID', 'ARM_TENANT_ID', 'ARM_SUBSCRIPTION_ID', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) {
  if (!env[name]) throw new Error(`Azure deployment authentication requires ${name}.`);
}
for (const name of ['ARM_CLIENT_ID', 'ARM_TENANT_ID', 'ARM_SUBSCRIPTION_ID']) {
  if (!/^[a-f0-9-]{36}$/i.test(env[name])) throw new Error(`${name} must be an Azure identifier.`);
}
const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
url.searchParams.set('audience', 'api://AzureADTokenExchange');
const assertionResponse = await fetch(url, {
  headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
  redirect: 'error', signal: AbortSignal.timeout(20_000),
});
if (!assertionResponse.ok) throw new Error(`GitHub OIDC token request failed (HTTP ${assertionResponse.status}).`);
const { value: assertion } = await assertionResponse.json();
if (typeof assertion !== 'string') throw new Error('GitHub did not return an OIDC token.');
const { sub } = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8'));
console.log(`GitHub deployment subject: ${sub}`);
const tokenResponse = await fetch(`https://login.microsoftonline.com/${env.ARM_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
  body: new URLSearchParams({ client_id: env.ARM_CLIENT_ID, scope: 'https://management.azure.com/.default',
    grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion }),
});
if (!tokenResponse.ok) throw new Error(`Azure federation failed (HTTP ${tokenResponse.status}). Check the identity's issuer, audience, and subject above.`);
const { access_token: accessToken } = await tokenResponse.json();
if (typeof accessToken !== 'string') throw new Error('Azure did not return an access token.');
const group = await fetch(`https://management.azure.com/subscriptions/${env.ARM_SUBSCRIPTION_ID}/resourceGroups/warframe-toolkit-wfm?api-version=2022-09-01`, {
  headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'error', signal: AbortSignal.timeout(20_000),
});
if (!group.ok) throw new Error(`Azure deployment identity cannot read the app's resource group (HTTP ${group.status}).`);
console.log('Azure deployment identity verified.');
