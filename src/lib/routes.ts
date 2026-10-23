import { isPage, type Page } from './seo.ts';

export function pageFromPath(pathname: string): Page | null {
  const name = pathname.replace(/\/+$/, '').replace(/^\//, '');
  return isPage(name) ? name : null;
}

/** Old fragment addresses become paths. */
export function locationTarget(pathname: string, search: string, hash: string): string {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const body = hash.startsWith('#') ? hash.slice(1) : '';
  const split = body.indexOf('?');
  const legacyName = (split === -1 ? body : body.slice(0, split)).replace(/\/+$/, '');
  const legacyQuery = split === -1 ? '' : body.slice(split);
  if (isPage(legacyName)) return legacyName === 'droptables' ? `/droptables${legacyQuery}` : `/${legacyName}`;
  const shared = new URLSearchParams(search).has('share');
  if (normalized === '/' || normalized === '/index.html') return `/weapons${shared ? search : ''}`;
  const page = pageFromPath(normalized);
  if (page) return `${normalized}${page === 'droptables' || (shared && ['weapons', 'warframes', 'relics'].includes(page)) ? search : ''}`;
  const segment = normalized.replace(/^\//, '');
  if (segment && !segment.includes('.') && !segment.includes('/')) return '/weapons';
  return `${pathname}${search}${hash}`;
}

export function adoptLegacyLocation(): boolean {
  const next = locationTarget(location.pathname, location.search, location.hash);
  if (next === `${location.pathname}${location.search}${location.hash}`) return false;
  history.replaceState(history.state, '', next);
  return true;
}

export function go(url: string, mode: 'push' | 'replace' = 'push') {
  if (`${location.pathname}${location.search}${location.hash}` !== url) history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function sameDocumentLink(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void }) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  event.preventDefault();
  return true;
}
