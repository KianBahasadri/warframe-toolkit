import { useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import { ArrowDownToLine, ArrowLeft, Bookmark, ChevronLeft, ChevronRight, CircleHelp, ExternalLink, Filter, Link, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { TablePopover } from './TablePopover';
import { Select } from './Select';
import { Dialog } from './Dialog';
import { DropFacet, DropFilterForm, DropSorts } from './DropTableControls';
import { DropDetails } from './DropDetails';
import { DropGroupCard, DropModePicker, DropRewardCards, dropBrowseOptions } from './DropBrowser';
import { compileDropQuery, defaultDropView, DROP_TABLES_URL, dropColumns, dropFilterLabel, dropRowsCsv, dropViewHash, filterDropRows, isDropView, moveDropSort, readDropView, setDropSort, sortDropRows } from '../lib/dropTables';
import type { DropBrowseMode, DropColumnKey, DropDataset, DropFilter, DropRow, DropView } from '../lib/dropTables';
import { dropBrowseCounts, groupDropRows } from '../lib/dropExplorer';
import { downloadFile } from '../lib/storage';
import './DropTables.css';

export interface DropTableActions { exportCsv: () => void; refresh: () => void }
let sessionData: DropDataset | null = null;
let sessionView = defaultDropView();
const facetKeys: DropColumnKey[] = ['category', 'location', 'mission', 'rotation', 'stage', 'era', 'refinement', 'rarity'];
const viewsKey = 'warframe-toolkit.drop-views.v1';
type SavedView = { name: string; view: DropView };

export function DropTables({ actionsRef }: { actionsRef: Ref<DropTableActions> }) {
  const [data, setData] = useState(sessionData);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [view, setView] = useState(() => location.hash.includes('?') ? readDropView(location.hash) : sessionView);
  const [filtersOpen, setFiltersOpen] = useState(false), [help, setHelp] = useState(false), [viewsOpen, setViewsOpen] = useState(false);
  const [chanceOpen, setChanceOpen] = useState(false);
  const [page, setPage] = useState(1), [pageInput, setPageInput] = useState('1');
  const [details, setDetails] = useState<DropRow | null>(null);
  const [viewName, setViewName] = useState('');
  const [saved, setSaved] = useState<{ views: SavedView[]; error: string }>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(viewsKey) ?? '[]');
      if (!Array.isArray(raw) || raw.some(value => !value || typeof value.name !== 'string' || !value.name.trim() || !isDropView(value.view))) throw new Error('Invalid views');
      return { views: raw, error: '' };
    } catch { return { views: [], error: 'Saved views could not be read. The original data has been kept.' }; }
  });
  const searchInput = useRef<HTMLInputElement>(null), viewsButton = useRef<HTMLButtonElement>(null), chanceButton = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null), request = useRef<AbortController | null>(null);
  const changeView = (next: DropView) => { setView(next); setPage(1); };
  const refresh = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/droptables', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]), cache: 'no-store' });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The live drop-table endpoint is unavailable. Run this app with npm run dev or npm run preview.');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load the official drop tables.');
      if (!Array.isArray(result.rows) || !result.rows.length || typeof result.fetchedAt !== 'string' || result.rows.some((row: DropRow) => typeof row.reward !== 'string' || typeof row.source !== 'string' || typeof row.tableChance !== 'number')) throw new Error('The live drop-table response was not recognized.');
      if (controller.signal.aborted) return;
      sessionData = result; setData(result); setDetails(null);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error && cause.name !== 'TimeoutError' && cause.name !== 'TypeError' ? cause.message : 'Could not reach the live drop tables. Check your connection and retry.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  useEffect(() => {
    // StrictMode replays mount effects; do not start a download for its discarded mount.
    let mounted = true;
    queueMicrotask(() => { if (mounted) void refresh(); });
    return () => { mounted = false; request.current?.abort(); };
  }, []);
  useEffect(() => {
    sessionView = view;
    const timer = window.setTimeout(() => history.replaceState(null, '', dropViewHash(view)), 250);
    return () => window.clearTimeout(timer);
  }, [view]);
  useEffect(() => {
    // A plain tab link resumes the session; a shared view link replaces its settings.
    const onHash = () => { if (location.hash.startsWith('#droptables?')) { setView(readDropView(location.hash)); setPage(1); } };
    window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash);
  }, []);


  const filterEntries = Object.entries(view.filters) as [DropColumnKey, DropFilter][];
  const changed = Boolean(view.query || filterEntries.length);
  // Older saved links can still open their search directly in the item browser.
  const mode = view.browse?.mode ?? (changed || view.sorting.length ? 'item' : undefined);
  const option = dropBrowseOptions.find(option => option.mode === mode);
  const groupKey = view.browse?.group;
  const deferredQuery = useDeferredValue(view.query);
  const query = useMemo(() => compileDropQuery(deferredQuery), [deferredQuery]);
  const filtered = useMemo(() => sortDropRows(filterDropRows(data?.rows ?? [], query, view.filters), view.sorting.length ? view.sorting : [{ key: mode === 'item' ? 'source' : 'reward', direction: 1 }]), [data, query, view.filters, view.sorting, mode]);
  const counts = useMemo(() => data ? dropBrowseCounts(data.rows) : null, [data]);
  const allGroups = useMemo(() => mode ? groupDropRows(data?.rows ?? [], mode) : [], [data, mode]);
  const groups = useMemo(() => mode ? groupDropRows(filtered, mode, view.sorting) : [], [filtered, mode, view.sorting]);
  const selected = groupKey === undefined ? undefined : groups.find(group => group.key === groupKey);
  const selectedTitle = groupKey === undefined ? '' : allGroups.find(group => group.key === groupKey)?.title ?? 'Group unavailable';
  const rows = useMemo(() => groupKey !== undefined ? selected?.rows ?? [] : sortDropRows(groups.flatMap(group => group.rows), view.sorting), [groupKey, selected, groups, view.sorting]);
  const total = groupKey === undefined ? groups.length : rows.length;
  const pages = Math.max(1, Math.ceil(total / view.pageSize)), currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * view.pageSize;
  const facets = useMemo(() => Object.fromEntries(facetKeys.map(key => {
    const values = new Map<string, number>();
    for (const row of data?.rows ?? []) { const value = String(row[key] ?? ''); values.set(value, (values.get(value) ?? 0) + 1); }
    return [key, [...values].map(([value, count]) => ({ value, count })).sort((a, b) => !a.value ? 1 : !b.value ? -1 : a.value.localeCompare(b.value, undefined, { numeric: true }))];
  })), [data]);
  const setFilter = (key: DropColumnKey, filter?: DropFilter) => { const next = { ...view.filters }; if (filter) next[key] = filter; else delete next[key]; changeView({ ...view, filters: next }); };
  const resetFilters = () => changeView({ ...view, query: '', filters: {} });
  const focusResults = () => requestAnimationFrame(() => resultsHeading.current?.focus({ preventScroll: true }));
  const chooseMode = (mode: DropBrowseMode) => { changeView({ ...view, browse: { mode } }); setChanceOpen(false); };
  const openGroup = (group: string) => { changeView({ ...view, browse: { mode: mode!, group } }); focusResults(); };
  const exportCsv = () => {
    if (!rows.length || deferredQuery !== view.query) return;
    downloadFile(`warframe-drops-${new Date().toISOString().slice(0, 10)}.csv`, dropRowsCsv(rows, dropColumns.map(column => column.key)), 'text/csv;charset=utf-8');
    setNotice(`Exported all ${rows.length.toLocaleString()} matching entries with all fields.`);
  };
  useImperativeHandle(actionsRef, () => ({ exportCsv, refresh: () => { void refresh(); } }));
  useEffect(() => setPageInput(String(currentPage)), [currentPage]);
  const goToPage = (next: number) => { setPage(Math.max(1, Math.min(pages, next))); resultsHeading.current?.scrollIntoView({ block: 'start' }); focusResults(); };
  const saveViews = (next: SavedView[]) => {
    try { localStorage.setItem(viewsKey, JSON.stringify(next)); setSaved({ views: next, error: '' }); return true; }
    catch { setNotice('Could not save the view. Browser storage may be full or unavailable.'); return false; }
  };
  const closeViews = () => { setViewsOpen(false); requestAnimationFrame(() => viewsButton.current?.focus({ preventScroll: true })); };
  const sortValue = !view.sorting.length ? 'name' : view.sorting.length === 1 && view.sorting[0].key === 'chance' ? view.sorting[0].direction === -1 ? 'chance-desc' : 'chance-asc' : 'custom';
  const browseRelated = (mode: DropBrowseMode, group: string) => {
    changeView({ ...view, query: '', filters: {}, sorting: [{ key: 'chance', direction: -1 }], browse: { mode, group } });
    setDetails(null); focusResults();
  };

  return <section className="drop-tables" aria-label="Drop Tables">
    <div className="drop-heading"><div><h1>Drop Tables</h1><div className="drop-provenance"><a href={DROP_TABLES_URL} target="_blank" rel="noreferrer">Warframe PC drops <ExternalLink size={12} /></a>{data && <><span>Published {data.updated || 'date unavailable'}</span><span title={new Date(data.fetchedAt).toLocaleString()}>Fetched {new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></>}</div></div>
      <div className="drop-heading-actions"><button type="button" ref={viewsButton} className="button secondary" aria-expanded={viewsOpen} onClick={() => setViewsOpen(!viewsOpen)}><Bookmark size={15} />Saved views</button><button type="button" className="button secondary drop-refresh" disabled={loading} aria-busy={loading} onClick={() => void refresh()}><RefreshCw size={15} className={loading ? 'drop-spinner' : ''} />{loading ? 'Fetching…' : 'Refresh'}</button></div>
    </div>
    {error && <div className="callout danger" role="alert">{error}{data && <p>Showing the last successful fetch from {new Date(data.fetchedAt).toLocaleString()}.</p>}<button type="button" className="button secondary" disabled={loading} onClick={() => void refresh()}>Retry</button></div>}
    {data && data.skippedRows > 0 && <p className="callout caution" role="status">{data.skippedRows.toLocaleString()} entries could not be parsed. These results are incomplete; consult the official table.</p>}
    <DropModePicker mode={mode} counts={counts} loading={loading} onSelect={chooseMode} />
    {notice && <div className="drop-notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss drop table notification" onClick={() => setNotice('')}><X size={14} /></button></div>}
    {mode && <div className="drop-workspace">
      <div className="drop-toolbar">
        <div className="drop-search-label"><label className="sr-only" htmlFor="drop-search">Search drop tables</label><div className="search-field"><Search size={18} aria-hidden="true" /><input id="drop-search" ref={searchInput} placeholder={mode === 'item' ? 'Search items, e.g. Nova Prime Systems…' : mode === 'mission' ? 'Search missions, rewards or locations…' : mode === 'relic' ? 'Search relics or their rewards…' : 'Search rewards, locations or sources…'} value={view.query} maxLength={2000} aria-invalid={Boolean(query.error) || undefined} aria-describedby={query.error ? 'drop-query-error' : undefined} onChange={event => changeView({ ...view, query: event.target.value })} />{view.query && <button type="button" className="icon-button" aria-label="Clear drop search" onClick={() => { changeView({ ...view, query: '' }); searchInput.current?.focus(); }}><X size={15} /></button>}</div></div>
        <button type="button" className="button secondary" aria-expanded={filtersOpen} aria-controls="drop-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} />Filters{filterEntries.length > 0 ? ` (${filterEntries.length})` : ''}</button>
        <button type="button" className="icon-button" aria-label="Search help" title="Search help" onClick={() => setHelp(true)}><CircleHelp size={18} /></button>
      </div>
      {query.error && <p id="drop-query-error" className="error-text small" role="alert">{query.error}</p>}
      {filtersOpen && <div className="drop-filters" id="drop-filters" aria-label="Drop table filters">{facetKeys.map(key => <DropFacet key={key} column={dropColumns.find(column => column.key === key)!} options={facets[key] ?? []} filter={view.filters[key]} onChange={filter => setFilter(key, filter)} />)}<button type="button" ref={chanceButton} className="button secondary" aria-expanded={chanceOpen} onClick={() => setChanceOpen(!chanceOpen)}><Filter size={14} />Drop chance</button><button type="button" className="button quiet" disabled={!changed} onClick={resetFilters}>Reset filters</button></div>}
      {filterEntries.length > 0 && <div className="drop-filter-chips" aria-label="Active filters">{filterEntries.map(([key, filter]) => <button type="button" key={key} title={dropFilterLabel(filter)} onClick={() => setFilter(key)} aria-label={`Remove ${dropColumns.find(column => column.key === key)!.title} filter`}><span>{dropColumns.find(column => column.key === key)!.title}: {dropFilterLabel(filter)}</span><X size={12} /></button>)}</div>}
      {sortValue === 'custom' && <DropSorts sorting={view.sorting} onSort={(key, direction) => changeView({ ...view, sorting: setDropSort(view.sorting, key, direction) })} onPriority={(key, index) => changeView({ ...view, sorting: moveDropSort(view.sorting, key, index) })} onClear={() => changeView({ ...view, sorting: [] })} />}
      <div className="drop-results-heading">
        <div>{groupKey !== undefined && <button type="button" className="drop-back" onClick={() => { chooseMode(mode); focusResults(); }}><ArrowLeft size={14} />All {option!.noun}</button>}<h2 ref={resultsHeading} tabIndex={-1}>{groupKey === undefined ? option!.noun[0].toUpperCase() + option!.noun.slice(1) : selectedTitle}</h2>
          <div className="drop-result-summary" role="status">{data ? <>{groupKey === undefined && <><strong>{groups.length.toLocaleString()}</strong> {option!.noun}<span aria-hidden="true"> · </span></>}<strong>{rows.length.toLocaleString()}</strong> matching entries</> : loading ? 'Fetching official drop tables…' : 'No live data loaded'}</div>
        </div>
        <div className="drop-results-actions"><label className="drop-sort-label"><span>Sort by</span><Select label="Sort results" value={sortValue} options={[{ value: 'name', label: 'Name A–Z' }, { value: 'chance-desc', label: 'Chance: high to low' }, { value: 'chance-asc', label: 'Chance: low to high' }, ...(sortValue === 'custom' ? [{ value: 'custom', label: 'Custom order' }] : [])]} onChange={value => changeView({ ...view, sorting: value === 'name' ? [] : [{ key: 'chance', direction: value === 'chance-desc' ? -1 : 1 }] })} /></label>
          <button type="button" className="icon-button" aria-label="Copy view link" title="Copy view link" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}${dropViewHash(view)}`); setNotice('View link copied. It will fetch the latest published data when opened.'); } catch { setNotice('Could not copy the link. Copy this page’s address from your browser.'); } }}><Link size={17} /></button><button type="button" className="icon-button" aria-label="Export CSV" title="Export all matching entries as CSV" disabled={!rows.length || view.query !== deferredQuery} onClick={exportCsv}><ArrowDownToLine size={17} /></button>
        </div>
      </div>
      <div className="drop-results" role="region" aria-label="Drop results" aria-busy={loading || view.query !== deferredQuery}>
        {!data && loading ? <div className="drop-group-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div className="drop-loading-card" key={index}><span /><span /><span /></div>)}</div> : groupKey === undefined ? <div className="drop-group-grid">{groups.slice(offset, offset + view.pageSize).map(group => <DropGroupCard key={group.key} group={group} mode={mode} onSelect={() => openGroup(group.key)} />)}</div> : <DropRewardCards rows={rows.slice(offset, offset + view.pageSize)} mode={mode} onOpen={setDetails} />}
        {data && !total && <div className="drop-empty"><Search size={28} aria-hidden="true" /><h3>No matching drops</h3><p>{query.error || 'Try another search, clear your filters, or choose a different view.'}</p>{changed && <button type="button" className="button secondary" onClick={resetFilters}>Clear search and filters</button>}</div>}
        {!data && !loading && <div className="drop-empty"><p>Live drop tables could not be loaded.</p><button type="button" className="button secondary" onClick={() => void refresh()}>Try again</button></div>}
      </div>
      {data && total > 0 && <div className="drop-pagination"><span>{(offset + 1).toLocaleString()}–{Math.min(offset + view.pageSize, total).toLocaleString()} of {total.toLocaleString()} {groupKey === undefined ? option!.noun : 'entries'}</span><label>Per page<Select label="Results per page" value={String(view.pageSize)} options={[...new Set([12, 24, 48, 96, view.pageSize])].sort((a, b) => a - b).map(value => ({ value: String(value), label: String(value) }))} onChange={value => changeView({ ...view, pageSize: Number(value) })} /></label><div className="drop-page-controls"><button type="button" className="icon-button" disabled={currentPage === 1} aria-label="Previous page" onClick={() => goToPage(currentPage - 1)}><ChevronLeft size={17} /></button><form onSubmit={event => { event.preventDefault(); const next = Number(pageInput); if (Number.isInteger(next) && next >= 1 && next <= pages) goToPage(next); else setPageInput(String(currentPage)); }}><label>Page<input type="number" min="1" max={pages} value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={() => setPageInput(String(currentPage))} /></label><span>of {pages.toLocaleString()}</span><button type="submit" className="sr-only">Go to page</button></form><button type="button" className="icon-button" disabled={currentPage === pages} aria-label="Next page" onClick={() => goToPage(currentPage + 1)}><ChevronRight size={17} /></button></div></div>}
    </div>}
    {chanceOpen && filtersOpen && <TablePopover anchor={chanceButton.current!} label="Filter Drop chance" onClose={() => setChanceOpen(false)}><div className="column-menu-heading">Drop chance</div><DropFilterForm column={dropColumns.find(column => column.key === 'chance')!} filter={view.filters.chance} onApply={filter => { setFilter('chance', filter); setChanceOpen(false); chanceButton.current?.focus(); }} /></TablePopover>}
    {details && <DropDetails row={details} onClose={() => setDetails(null)} onFindReward={() => browseRelated('item', details.reward)} onFindSource={() => browseRelated('source', details.source)} />}
    {viewsOpen && <TablePopover anchor={viewsButton.current!} label="Drop table views" className="drop-views-popover" onClose={() => setViewsOpen(false)}><div className="column-menu-heading">Saved views</div><div className="column-menu-content">
      {saved.views.length > 0 ? <div className="drop-saved-views">{saved.views.map((entry, index) => <div key={entry.name}><button type="button" className="column-menu-action" onClick={() => { changeView({ ...entry.view, browse: entry.view.browse ?? { mode: 'item' } }); closeViews(); }}>{entry.name}</button><button type="button" className="icon-button" aria-label={`Delete view ${entry.name}`} onClick={() => saveViews(saved.views.filter((_, position) => position !== index))}><X size={14} /></button></div>)}</div> : <p className="drop-saved-empty muted small">No saved views</p>}
      <form className="drop-save-view" onSubmit={event => { event.preventDefault(); if (!viewName.trim() || saved.error || !mode) return; if (saved.views.some(entry => entry.name.toLocaleLowerCase() === viewName.trim().toLocaleLowerCase())) { setNotice('A view with that name already exists. Choose another name.'); return; } if (saveViews([...saved.views, { name: viewName.trim(), view: { ...view, browse: view.browse ?? { mode } } }])) { setViewName(''); closeViews(); setNotice('View saved. Live drop data is fetched when opened.'); } }}><label>View name<input maxLength={60} value={viewName} onChange={event => setViewName(event.target.value)} disabled={Boolean(saved.error) || !mode} /></label><button type="submit" className="button secondary" disabled={!viewName.trim() || Boolean(saved.error) || !mode}>Save current view</button>{saved.error && <p className="error-text small">{saved.error}</p>}{!mode && <p className="muted small">Choose a browse view to save it.</p>}</form>
    </div></TablePopover>}
    {help && <Dialog title="Search & drop rates" onClose={() => setHelp(false)} className="drop-help"><h3>Search syntax</h3><p>Combine terms to narrow results. Use quotes for a phrase and a minus sign to exclude a term. Search ignores letter case.</p><dl className="drop-query-examples"><div><dt><code>"nova prime"</code></dt><dd>Find the phrase across all text fields</dd></div><div><dt><code>reward:forma -source:lith</code></dt><dd>Forma rewards, excluding Lith sources</dd></div><div><dt><code>mission:survival rotation:c</code></dt><dd>Survival rewards in rotation C</dd></div><div><dt><code>chance:&gt;=10 chance:&lt;50</code></dt><dd>Drop chance from 10% up to, but excluding, 50%</dd></div></dl><p className="small muted">Fields: reward, source, category, location, mission, rotation, stage, era, refinement, rarity, chance, within, roll. Numeric fields accept =, &gt;, &gt;=, &lt;, and &lt;=.</p><h3>Reading the rates</h3><p><strong>Drop chance</strong> combines the source’s table roll rate with the reward’s within-table chance. Rates above 100% indicate multiple rolls; their overall odds are left uncalculated. The rarity label comes directly from the publisher.</p><p>Bounty stages and rotations are separate opportunities. Duplicate rewards within a table remain separate entries; they are not automatically added together. Reverse indexes for enemy drops are shown once.</p><p className="muted small">The official page describes PC rewards and may omit drops or lag hotfixes. Listed relics or sources can be vaulted or unavailable. Refresh fetches the latest published page, not an in-game live rotation. CSV exports every matching entry in the current group or view, with all fields; rates are percentages.</p><a href={DROP_TABLES_URL} target="_blank" rel="noreferrer">Open the official drop tables</a></Dialog>}
  </section>;
}
