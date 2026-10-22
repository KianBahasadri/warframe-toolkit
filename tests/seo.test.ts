import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeDocument } from '../cloudflare/html.ts';
import { locationTarget } from '../src/lib/routes.ts';
import { applyRouteHtml, documentRedirect, pages, robotsTxt, routeHead, routeMeta, sitemapXml, workerDocumentPaths } from '../src/lib/seo.ts';

const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the checked-in document, robots file, and sitemap match the route list', () => {
  assert.equal(shell.includes(`<!--route-meta-->\n${routeHead('weapons')}\n    <!--/route-meta-->`), true);
  assert.equal(readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8'), robotsTxt());
  assert.equal(readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8'), sitemapXml());
  const terraform = readFileSync(new URL('../infra/cloudflare/main.tf', import.meta.url), 'utf8');
  assert.match(terraform, /html_handling\s+= "none"/);
  assert.match(terraform, /not_found_handling = "none"/);
  for (const path of workerDocumentPaths) assert.match(terraform, new RegExp(`"${path.replaceAll('/', '\\/')}"`));
});

test('each tool has a distinct indexable document without a query string', () => {
  const titles = new Set<string>(), descriptions = new Set<string>();
  for (const page of pages) {
    const meta = routeMeta[page];
    assert.equal(titles.has(meta.title), false); assert.equal(descriptions.has(meta.description), false);
    titles.add(meta.title); descriptions.add(meta.description);
    assert.ok(meta.title.length <= 60); assert.ok(meta.description.length >= 50 && meta.description.length <= 160);
    const html = applyRouteHtml(shell, page);
    assert.match(html, new RegExp(`<title id="route-title">${meta.title}</title>`));
    assert.match(html, new RegExp(`<link id="route-canonical" rel="canonical" href="https://grakata.com/${page}" />`));
    assert.match(html, new RegExp(`"@id":"https://grakata.com/${page}"`));
    assert.equal(html.includes('<div id="root"></div>'), true);
    assert.equal(html.includes(meta.description), true);
    assert.equal((html.match(/<h1/g) ?? []).length, 0);
  }
  assert.match(sitemapXml(), /<loc>https:\/\/grakata\.com\/weapons<\/loc>/);
  assert.doesNotMatch(sitemapXml(), /<loc>[^<]*\?/);
  assert.match(robotsTxt(), /Disallow: \/api\//);
  assert.match(robotsTxt(), /Sitemap: https:\/\/grakata\.com\/sitemap\.xml/);
});

test('legacy fragments become paths and sign-in fragments stay intact', () => {
  assert.equal(locationTarget('/', '', '#relics'), '/relics');
  assert.equal(locationTarget('/weapons', '', '#droptables?view=%7B%7D'), '/droptables?view=%7B%7D');
  assert.equal(locationTarget('/', '', '#backups'), '/weapons');
  assert.equal(locationTarget('/weapons', '', '#backups'), '/weapons');
  assert.equal(locationTarget('/', '?old=1', '#sign-in?username=Tenno&key=wft_abc'), '/weapons?old=1#sign-in?username=Tenno&key=wft_abc');
  assert.equal(locationTarget('/relics', '', '#sign-in?username=Tenno&key=wft_abc'), '/relics#sign-in?username=Tenno&key=wft_abc');
  assert.equal(locationTarget('/droptables', '?view=1', ''), '/droptables?view=1');
  assert.equal(locationTarget('/', '?share=wfs_abc', ''), '/weapons?share=wfs_abc');
  assert.equal(locationTarget('/weapons', '?share=wfs_abc', ''), '/weapons?share=wfs_abc');
  assert.equal(locationTarget('/warframes/', '?share=wfs_abc', ''), '/warframes?share=wfs_abc');
  assert.equal(locationTarget('/relics', '?share=wfs_abc', ''), '/relics?share=wfs_abc');
  assert.equal(locationTarget('/weapons/', '', ''), '/weapons');
  assert.equal(locationTarget('/favicon.svg', '', ''), '/favicon.svg');
  assert.equal(documentRedirect('/', ''), '/weapons');
  assert.equal(documentRedirect('/', '?share=wfs_abc'), '/weapons?share=wfs_abc');
  assert.equal(documentRedirect('/relics/', '?x=1'), '/relics?x=1');
  assert.equal(documentRedirect('/relics', ''), null);
});

test('the worker redirects the site root and serves a route-specific document', async () => {
  const env = {
    ACCOUNTS_ORIGIN: 'https://grakata.com',
    ASSETS: { fetch: async (request: Request) => {
      assert.equal(new URL(request.url).pathname, '/index.html');
      return new Response(shell, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: 'old', 'Content-Length': '1' } });
    } },
  };
  const root = await routeDocument(new Request('https://grakata.com/'), env);
  assert.equal(root?.status, 301); assert.equal(root?.headers.get('Location'), 'https://grakata.com/weapons');
  const relics = await routeDocument(new Request('https://grakata.com/relics?view=shared'), env);
  assert.equal(relics?.status, 200);
  assert.match(await relics!.text(), /<title id="route-title">Warframe relics — Grakata<\/title>/);
  assert.equal(relics?.headers.get('Link'), '<https://grakata.com/relics>; rel="canonical"');
  assert.equal(relics?.headers.get('ETag'), null);
  assert.equal(relics?.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(await routeDocument(new Request('https://grakata.com/robots.txt'), env), undefined);
  const slash = await routeDocument(new Request('https://grakata.com/crafting/'), env);
  assert.equal(slash?.status, 301); assert.equal(slash?.headers.get('Location'), 'https://grakata.com/crafting');
});
