import { jsonLd, routeMeta, SITE_ORIGIN, type Page } from './seo.ts';

function content(id: string, value: string) {
  document.getElementById(id)?.setAttribute('content', value);
}

export function applyDocumentMeta(page: Page) {
  const meta = routeMeta[page];
  const url = `${SITE_ORIGIN}/${page}`;
  document.title = meta.title;
  const title = document.getElementById('route-title');
  if (title) title.textContent = meta.title;
  content('route-description', meta.description);
  content('og-title', meta.title);
  content('og-description', meta.description);
  content('og-url', url);
  content('twitter-title', meta.title);
  content('twitter-description', meta.description);
  document.getElementById('route-canonical')?.setAttribute('href', url);
  const data = document.getElementById('route-jsonld');
  if (data) data.textContent = jsonLd(page);
}
