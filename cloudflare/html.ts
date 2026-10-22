import { applyRouteHtml, documentRedirect, isPage, SITE_ORIGIN, type Page } from '../src/lib/seo.ts';

export interface AssetEnv { ASSETS: { fetch: (request: Request) => Promise<Response> }; ACCOUNTS_ORIGIN: string }

const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };

function redirect(origin: string, path: string) {
  return new Response(null, { status: 301, headers: { Location: new URL(path, origin).href, 'Cache-Control': 'public, max-age=3600', ...SECURITY } });
}

/** Serves one HTML document per tool. Static files fall through to the asset bundle. */
export async function routeDocument(request: Request, env: AssetEnv): Promise<Response | undefined> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
  const url = new URL(request.url);
  const target = documentRedirect(url.pathname, url.search);
  if (target) return redirect(env.ACCOUNTS_ORIGIN || SITE_ORIGIN, target);
  const page = url.pathname.slice(1);
  if (!isPage(page)) return undefined;
  const index = new URL(request.url);
  index.pathname = '/index.html';
  index.search = '';
  const asset = await env.ASSETS.fetch(new Request(index, { method: 'GET' }));
  if (!asset.ok || !(asset.headers.get('content-type') ?? '').includes('text/html')) return asset;
  const html = applyRouteHtml(await asset.text(), page as Page);
  const headers = new Headers(asset.headers);
  for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', asset.headers.get('Cache-Control') ?? 'public, max-age=0, must-revalidate');
  headers.set('Link', `<${new URL(`/${page}`, env.ACCOUNTS_ORIGIN || SITE_ORIGIN).href}>; rel="canonical"`);
  for (const [name, value] of Object.entries(SECURITY)) headers.set(name, value);
  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
}
