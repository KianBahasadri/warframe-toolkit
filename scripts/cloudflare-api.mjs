export function loadCredentials() {
  try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('Set CLOUDFLARE_API_TOKEN in .env or the environment.');
}
export async function cloudflare(path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...options, headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  // Do not print request bodies or token-bearing request headers on failure.
  if (!response.ok || data.success === false) throw new Error(`Cloudflare ${path.split('?')[0]}: HTTP ${response.status}; ${data.errors?.map(error => `${error.code}: ${error.message}`).join('; ') || 'request failed'}`);
  return data.result;
}
