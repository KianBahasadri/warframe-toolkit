import { setTimeout } from 'node:timers/promises';

// Exercise the deployed proxy: a direct WFM request from a CI runner cannot
// detect Cloudflare challenging requests from the production Worker.
export async function checkMarket(origin, { request = fetch, pause = setTimeout, attempts = 3 } = {}) {
  const slug = 'braton_prime_set';
  const checks = [
    ['items', data => Array.isArray(data) && data.some(item => item?.slug === slug)],
    [`orders/${slug}?platform=pc`, data => Array.isArray(data) && data.some(order => order?.type === 'sell' && Number.isFinite(order.price) && order.price > 0)],
    [`history/${slug}?platform=pc`, data => ['48hours', '90days'].every(range => Array.isArray(data?.[range])) && data['90days'].some(row => row?.type === 'closed' && Number.isFinite(Date.parse(row.time)))],
  ];
  for (const [path, valid] of checks) {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await request(new URL(`/api/wfm/${path}`, origin), { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.stale !== false || body?.error || !Number.isFinite(Date.parse(body?.fetchedAt)) || !valid(body?.data)) {
          const detail = typeof body?.error === 'string' ? `: ${body.error.slice(0, 200)}` : '';
          throw new Error(`Production WFM ${path} failed (HTTP ${response.status}); expected current market data${detail}`);
        }
        break;
      } catch (error) {
        if (attempt >= attempts) throw error;
        await pause(30_000);
      }
    }
  }
}

if (import.meta.main) {
  const origin = process.argv[2] ?? 'https://grakata.com';
  await checkMarket(origin);
  console.log(`Verified WFM catalog, orders, and history through ${origin}.`);
}
