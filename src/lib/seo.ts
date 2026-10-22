export const SITE_ORIGIN = 'https://grakata.com';
export const SITE_NAME = 'Grakata';
export const SITE_DESCRIPTION = 'Warframe catalogs, inventory, crafting plans, official drop tables, and an arsenal modding workshop.';

export const pages = ['weapons', 'warframes', 'relics', 'droptables', 'crafting', 'modder', 'import'] as const;
export type Page = typeof pages[number];

export const routeMeta: Record<Page, { title: string; description: string }> = {
  weapons: {
    title: 'Warframe weapons — Grakata',
    description: 'Warframe weapon catalog with ownership, mastery, rank, Incarnon, vault status, and platinum prices.',
  },
  warframes: {
    title: 'Warframes — Grakata',
    description: 'Warframe and Necramech catalog with ownership, mastery, rank, Helminth subsume status, and crafting.',
  },
  relics: {
    title: 'Warframe relics — Grakata',
    description: 'Warframe relic stacks by era and refinement, with vault status, rewards, and platinum prices.',
  },
  droptables: {
    title: 'Warframe drop tables — Grakata',
    description: 'Official Warframe drop tables with sources, rewards, chances, and relic openings.',
  },
  crafting: {
    title: 'Warframe crafting — Grakata',
    description: 'Warframe Foundry crafting plans with ingredients, sources, batches, and remaining materials.',
  },
  modder: {
    title: 'Warframe Modding Calculator — Grakata',
    description: 'Warframe arsenal workshop for mods, arcanes, capacity, polarities, and damage calculations.',
  },
  import: {
    title: 'Warframe screenshot import — Grakata',
    description: 'Import Warframe inventory, Codex, and relic screenshots. Matches stay in the browser for review.',
  },
};

const ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

export function isPage(value: string): value is Page {
  return (pages as readonly string[]).includes(value);
}

/** Paths the Worker must answer so each tool has its own document head. */
export const workerDocumentPaths = ['/', '/index.html', ...pages.flatMap(page => [`/${page}`, `/${page}/`])];

export function documentRedirect(pathname: string, search = ''): string | null {
  if (pathname === '/' || pathname === '/index.html') return `/weapons${new URLSearchParams(search).has('share') ? search : ''}`;
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (trimmed !== pathname && isPage(trimmed.slice(1))) return `${trimmed}${search}`;
  return null;
}

export function jsonLd(page: Page): string {
  const meta = routeMeta[page];
  const url = `${SITE_ORIGIN}/${page}`;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE_ORIGIN}/#website`, name: SITE_NAME, url: `${SITE_ORIGIN}/weapons`, description: SITE_DESCRIPTION, inLanguage: 'en' },
      { '@type': 'WebApplication', '@id': `${SITE_ORIGIN}/#app`, name: SITE_NAME, url: `${SITE_ORIGIN}/weapons`, applicationCategory: 'GameApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: SITE_DESCRIPTION, isPartOf: { '@id': `${SITE_ORIGIN}/#website` } },
      { '@type': 'WebPage', '@id': url, url, name: meta.title, description: meta.description, inLanguage: 'en', isPartOf: { '@id': `${SITE_ORIGIN}/#website` }, about: { '@id': `${SITE_ORIGIN}/#app` } },
    ],
  }).replaceAll('<', '\\u003c');
}

function escapeAttr(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

export function routeHead(page: Page): string {
  const meta = routeMeta[page];
  const url = `${SITE_ORIGIN}/${page}`;
  const tags = [
    `<title id="route-title">${escapeAttr(meta.title)}</title>`,
    `<meta id="route-description" name="description" content="${escapeAttr(meta.description)}" />`,
    `<link id="route-canonical" rel="canonical" href="${url}" />`,
    `<meta id="route-robots" name="robots" content="${ROBOTS}" />`,
    `<meta id="og-title" property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta id="og-description" property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta id="og-url" property="og:url" content="${url}" />`,
    `<meta id="og-type" property="og:type" content="website" />`,
    `<meta id="og-site-name" property="og:site_name" content="${SITE_NAME}" />`,
    `<meta id="og-locale" property="og:locale" content="en_US" />`,
    `<meta id="twitter-card" name="twitter:card" content="summary" />`,
    `<meta id="twitter-title" name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta id="twitter-description" name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<script id="route-jsonld" type="application/ld+json">${jsonLd(page)}</script>`,
  ];
  return tags.map(tag => `    ${tag}`).join('\n');
}

export function applyRouteHtml(html: string, page: Page): string {
  const block = `<!--route-meta-->\n${routeHead(page)}\n    <!--/route-meta-->`;
  if (html.includes('<!--route-meta-->') && html.includes('<!--/route-meta-->')) return html.replace(/<!--route-meta-->[\s\S]*?<!--\/route-meta-->/, block);
  return html.replace('</head>', `    ${block}\n  </head>`);
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}

export function sitemapXml(): string {
  const urls = pages.map(page => `  <url><loc>${SITE_ORIGIN}/${page}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
