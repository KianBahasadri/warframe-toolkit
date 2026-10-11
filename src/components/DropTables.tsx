import { useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { MouseEvent, Ref } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUp, Bookmark, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleHelp, ExternalLink, Filter, Link, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { ColumnPicker } from './ColumnPicker';
import { TablePopover } from './TablePopover';
import { Select } from './Select';
import { Dialog } from './Dialog';
import { DropColumnMenu, DropFacet, DropSorts } from './DropTableControls';
import { DropDetails } from './DropDetails';
import { compileDropQuery, defaultDropColumns, defaultDropView, DROP_TABLES_URL, dropColumns, dropFilterLabel, dropRowsCsv, dropViewHash, filterDropRows, formatChance, isDropView, moveDropSort, numericDropColumns, readDropView, setDropSort, sortDropRows } from '../lib/dropTables';
import type { DropColumnKey, DropDataset, DropFilter, DropRow, DropView } from '../lib/dropTables';
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
  const [page, setPage] = useState(1), [pageInput, setPageInput] = useState('1');
  const [details, setDetails] = useState<DropRow | null>(null), [active, setActive] = useState('');
  const [menu, setMenu] = useState<{ key: DropColumnKey; anchor: HTMLElement; point?: { x: number; y: number }; filter?: boolean; id: number } | null>(null);
  const [viewName, setViewName] = useState('');
  const [saved, setSaved] = useState<{ views: SavedView[]; error: string }>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(viewsKey) ?? '[]');
      if (!Array.isArray(raw) || raw.some(value => !value || typeof value.name !== 'string' || !value.name.trim() || !isDropView(value.view))) throw new Error('Invalid views');
      return { views: raw, error: '' };
    } catch { return { views: [], error: 'Saved views could not be read. The original data has been kept.' }; }
  });
  const searchInput = useRef<HTMLInputElement>(null), viewsButton = useRef<HTMLButtonElement>(null), tableRegion = useRef<HTMLDivElement>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>()), headers = useRef(new Map<DropColumnKey, HTMLButtonElement>());
  const sequence = useRef(0), request = useRef<AbortController | null>(null);
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
    const onHash = () => { if (location.hash.startsWith('#droptables')) { setView(readDropView(location.hash)); setPage(1); } };
    window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const clearFocus = (event: PointerEvent) => { const active = document.activeElement as HTMLElement | null; if (!tableRegion.current?.contains(event.target as Node) && active?.matches('.drop-reward-button')) active.blur(); };
    document.addEventListener('pointerdown', clearFocus); return () => document.removeEventListener('pointerdown', clearFocus);
  }, []);
  const deferredQuery = useDeferredValue(view.query);
  const query = useMemo(() => compileDropQuery(deferredQuery), [deferredQuery]);
  const rows = useMemo(() => sortDropRows(filterDropRows(data?.rows ?? [], query, view.filters), view.sorting), [data, query, view.filters, view.sorting]);
  const pages = Math.max(1, Math.ceil(rows.length / view.pageSize)), currentPage = Math.min(page, pages);
  const displayed = rows.slice((currentPage - 1) * view.pageSize, currentPage * view.pageSize);
  const columns = view.columns.map(key => dropColumns.find(column => column.key === key)!);
  const activeId = displayed.some(row => row.id === active) ? active : displayed[0]?.id;
  const facets = useMemo(() => Object.fromEntries(facetKeys.map(key => {
    const values = new Map<string, number>();
    for (const row of data?.rows ?? []) { const value = String(row[key] ?? ''); values.set(value, (values.get(value) ?? 0) + 1); }
    return [key, [...values].map(([value, count]) => ({ value, count })).sort((a, b) => !a.value ? 1 : !b.value ? -1 : a.value.localeCompare(b.value, undefined, { numeric: true }))];
  })), [data]);
  const filterEntries = Object.entries(view.filters) as [DropColumnKey, DropFilter][];
  const changed = Boolean(view.query || filterEntries.length);
  const setFilter = (key: DropColumnKey, filter?: DropFilter) => { const next = { ...view.filters }; if (filter) next[key] = filter; else delete next[key]; changeView({ ...view, filters: next }); };
  const resetFilters = () => changeView({ ...view, query: '', filters: {} });
  const changeVisibility = (key: DropColumnKey, visible: boolean) => changeView({ ...view, columns: visible ? dropColumns.filter(column => column.key === key || view.columns.includes(column.key)).map(column => column.key) : view.columns.filter(column => column === 'reward' || column !== key) });
  const setSort = (key: DropColumnKey, direction: 1 | -1 | 0) => changeView({ ...view, sorting: setDropSort(view.sorting, key, direction) });
  const moveSort = (key: DropColumnKey, index: number) => changeView({ ...view, sorting: moveDropSort(view.sorting, key, index) });
  const openMenu = (key: DropColumnKey, event: MouseEvent<HTMLElement>, filter = false) => { event.preventDefault(); setMenu({ key, anchor: headers.current.get(key) ?? event.currentTarget, point: event.type === 'contextmenu' && (event.clientX || event.clientY) ? { x: event.clientX, y: event.clientY } : undefined, filter, id: ++sequence.current }); };
  const closeMenu = () => { setMenu(null); requestAnimationFrame(() => { if (menu && !menu.anchor.isConnected && document.activeElement === document.body) headers.current.get('reward')?.focus(); }); };
  const openDetails = (row: DropRow) => { rowButtons.current.get(row.id)?.focus({ preventScroll: true }); setActive(row.id); setDetails(row); };
  const exportCsv = () => { if (!rows.length || deferredQuery !== view.query) return; downloadFile(`warframe-drops-${new Date().toISOString().slice(0, 10)}.csv`, dropRowsCsv(rows, view.columns), 'text/csv;charset=utf-8'); setNotice(`Exported ${rows.length.toLocaleString()} matching entries with the visible columns, in the current sort order.`); };
  useImperativeHandle(actionsRef, () => ({ exportCsv, refresh: () => { void refresh(); } }));
  useEffect(() => setPageInput(String(currentPage)), [currentPage]);
  const goToPage = (next: number) => { setPage(Math.max(1, Math.min(pages, next))); if (tableRegion.current) tableRegion.current.scrollTop = 0; };
  const saveViews = (next: SavedView[]) => {
    try { localStorage.setItem(viewsKey, JSON.stringify(next)); setSaved({ views: next, error: '' }); return true; }
    catch { setNotice('Could not save the view. Browser storage may be full or unavailable.'); return false; }
  };
  const closeViews = () => { setViewsOpen(false); requestAnimationFrame(() => viewsButton.current?.focus({ preventScroll: true })); };
  const preset = (kind: 'all' | 'missions' | 'relics' | 'bounties' | 'enemies') => {
    const next = defaultDropView();
    const categories = [...new Set((data?.rows ?? []).filter(row => kind === 'missions' ? row.section === 'missionRewards' : kind === 'relics' ? row.section === 'relicRewards' : kind === 'bounties' ? row.category.includes('Bounty') : kind === 'enemies' ? /ByAvatar$/.test(row.section) : true).map(row => row.category))];
    if (kind !== 'all') next.filters.category = { kind: 'values', values: categories };
    if (kind === 'relics') next.columns = ['reward', 'source', 'era', 'refinement', 'rarity', 'chance'];
    if (kind === 'missions') next.columns = ['reward', 'source', 'location', 'mission', 'rotation', 'chance'];
    if (kind === 'enemies') next.columns = ['reward', 'source', 'category', 'chance', 'tableChance', 'sourceChance'];
    changeView(next); closeViews();
  };
  return <section className="drop-tables" aria-label="Drop Tables">
    <div className="drop-heading"><div><h1>Drop Tables</h1><div className="drop-provenance"><a href={DROP_TABLES_URL} target="_blank" rel="noreferrer">Warframe PC drops <ExternalLink size={12} /></a>{data && <><span>Published {data.updated || 'date unavailable'}</span><span title={new Date(data.fetchedAt).toLocaleString()}>Fetched {new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></>}</div></div><button type="button" className="button secondary drop-refresh" disabled={loading} aria-busy={loading} onClick={() => void refresh()}><RefreshCw size={15} className={loading ? 'drop-spinner' : ''} />{loading ? 'Fetching…' : 'Refresh'}</button></div>
    {error && <div className="callout danger" role="alert">{error}{data && <p>Showing the last successful fetch from {new Date(data.fetchedAt).toLocaleString()}.</p>}<button type="button" className="button secondary" disabled={loading} onClick={() => void refresh()}>Retry</button></div>}
    {data && data.skippedRows > 0 && <p className="callout caution" role="status">{data.skippedRows.toLocaleString()} entries could not be parsed. These results are incomplete; consult the official table.</p>}
    <div className="drop-toolbar">
      <div className="drop-search-label"><label htmlFor="drop-search">Search drop tables</label><div className="search-field"><Search size={15} aria-hidden="true" /><input id="drop-search" ref={searchInput} placeholder={'Reward, source, or chance:>=10…'} value={view.query} maxLength={2000} aria-invalid={Boolean(query.error) || undefined} aria-describedby={query.error ? 'drop-query-error' : undefined} onChange={event => changeView({ ...view, query: event.target.value })} />{view.query && <button type="button" className="icon-button" aria-label="Clear drop search" onClick={() => { changeView({ ...view, query: '' }); searchInput.current?.focus(); }}><X size={15} /></button>}</div></div>
      <button type="button" className="button secondary" aria-expanded={filtersOpen} aria-controls="drop-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} />Filters{filterEntries.length > 0 ? ` (${filterEntries.length})` : ''}</button>
      <ColumnPicker options={dropColumns} selected={view.columns} onChange={changeVisibility} onReset={() => changeView({ ...view, columns: [...defaultDropColumns] })} />
      <button type="button" ref={viewsButton} className="button secondary" aria-expanded={viewsOpen} onClick={() => setViewsOpen(!viewsOpen)}><Bookmark size={15} />Views</button>
      <div className="drop-toolbar-actions"><button type="button" className="button quiet" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}${dropViewHash(view)}`); setNotice('View link copied. It will fetch the latest published data when opened.'); } catch { setNotice('Could not copy the link. Copy this page’s address from your browser.'); } }}><Link size={15} />Copy view link</button><button type="button" className="button quiet" disabled={!rows.length || view.query !== deferredQuery} onClick={exportCsv}><ArrowDownToLine size={15} />Export CSV</button><button type="button" className="icon-button" aria-label="Search help" title="Search help" onClick={() => setHelp(true)}><CircleHelp size={17} /></button></div>
    </div>
    {query.error && <p id="drop-query-error" className="error-text small" role="alert">{query.error}</p>}
    {filtersOpen && <div className="drop-filters" id="drop-filters" aria-label="Drop table filters">{facetKeys.map(key => <DropFacet key={key} column={dropColumns.find(column => column.key === key)!} options={facets[key] ?? []} filter={view.filters[key]} onChange={filter => setFilter(key, filter)} />)}<button type="button" className="button secondary" onClick={event => openMenu('chance', event, true)}><Filter size={14} />Drop chance</button><button type="button" className="button quiet" disabled={!changed} onClick={resetFilters}>Reset filters</button></div>}
    {filterEntries.length > 0 && <div className="drop-filter-chips" aria-label="Active filters">{filterEntries.map(([key, filter]) => <button type="button" key={key} title={dropFilterLabel(filter)} onClick={() => setFilter(key)} aria-label={`Remove ${dropColumns.find(column => column.key === key)!.title} filter`}><span>{dropColumns.find(column => column.key === key)!.title}: {dropFilterLabel(filter)}</span><X size={12} /></button>)}{view.query && <button type="button" onClick={resetFilters}>Clear all</button>}</div>}
    {view.sorting.length > 0 && <DropSorts sorting={view.sorting} onSort={setSort} onPriority={moveSort} onClear={() => changeView({ ...view, sorting: [] })} />}
    <div className="drop-result-summary"><span role="status">{data ? <><strong>{rows.length.toLocaleString()}</strong> of {data.rows.length.toLocaleString()} entries{changed ? ' match' : ''}</> : loading ? 'Fetching official drop tables…' : 'No live data loaded'}</span><span>Click a column to sort or filter</span></div>
    {notice && <div className="drop-notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss drop table notification" onClick={() => setNotice('')}><X size={14} /></button></div>}
    <div ref={tableRegion} className="table-scroll drop-table-scroll" role="region" aria-label="Drop table results" aria-busy={loading || view.query !== deferredQuery} tabIndex={0}>
      <table className="drop-table"><caption className="sr-only">Official Warframe PC drop tables. Open a reward for rates and odds. Click or right-click column headers for sorting, filters, and columns.</caption><thead><tr>{columns.map(column => {
        const index = view.sorting.findIndex(sort => sort.key === column.key), direction = view.sorting[index]?.direction;
        const indicator = <span className="sort-indicator" aria-hidden="true">{direction && <>{direction === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{index + 1}</>}</span>;
        return <th scope="col" key={column.key} className={numericDropColumns.has(column.key) ? 'number-cell' : ''} aria-sort={index === 0 ? direction === 1 ? 'ascending' : 'descending' : undefined} onContextMenu={event => openMenu(column.key, event)}><button ref={node => { if (node) headers.current.set(column.key, node); else headers.current.delete(column.key); }} type="button" className="sort-button" aria-label={`${column.title} column actions`} aria-haspopup="menu" aria-expanded={menu?.key === column.key} aria-describedby={`drop-sort-${column.key}`} onClick={event => openMenu(column.key, event)} onKeyDown={event => { if (event.key === 'F10' && event.shiftKey || event.key === 'ContextMenu') { event.preventDefault(); setMenu({ key: column.key, anchor: event.currentTarget, id: ++sequence.current }); } }}>{numericDropColumns.has(column.key) && indicator}{column.title}{view.filters[column.key] && <Filter size={11} aria-label="Filtered" />}{!numericDropColumns.has(column.key) && indicator}</button><span id={`drop-sort-${column.key}`} className="sr-only">{direction ? `Sort priority ${index + 1} of ${view.sorting.length}, ${direction === 1 ? 'ascending' : 'descending'}` : 'Unsorted'}</span></th>;
      })}</tr></thead><tbody>{displayed.map((row, index) => <tr key={row.id} onClick={event => { if (!(event.target as HTMLElement).closest('button, a, input') && !window.getSelection()?.toString()) openDetails(row); }}>{columns.map(column => <td key={column.key} className={numericDropColumns.has(column.key) ? 'number-cell' : ['source', 'stage', 'reward', 'category'].includes(column.key) ? `drop-cell-${column.key}` : ''}>{column.key === 'reward' ? <button type="button" className="drop-reward-button" ref={node => { if (node) rowButtons.current.set(row.id, node); else rowButtons.current.delete(row.id); }} tabIndex={row.id === activeId ? 0 : -1} aria-label={`${row.reward} from ${row.source}: details`} onFocus={() => setActive(row.id)} onClick={() => openDetails(row)} onKeyDown={event => { if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); const next = displayed[Math.max(0, Math.min(displayed.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]; rowButtons.current.get(next.id)?.focus({ preventScroll: true }); rowButtons.current.get(next.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}>{row.reward}</button> : numericDropColumns.has(column.key) ? row[column.key] === null ? <span className="table-missing" title={column.key === 'chance' ? 'Multiple rolls; open details for published rates' : 'Not separately specified'}>{column.key === 'chance' ? 'Multiple rolls' : '—'}</span> : formatChance(row[column.key] as number) : row[column.key] || <span className="table-missing">—</span>}</td>)}</tr>)}{!data && loading && Array.from({ length: 8 }, (_, index) => <tr key={index} className="drop-loading-row" aria-hidden="true">{columns.map(column => <td key={column.key}><span /></td>)}</tr>)}</tbody></table>
      {data && !displayed.length && <div className="empty-state"><h3>No matching drops</h3><p>{query.error || 'Change the search or filters to see more entries.'}</p>{changed && <button type="button" className="button secondary" onClick={resetFilters}>Reset filters</button>}</div>}
      {!data && !loading && <div className="empty-state"><p>Live drop tables could not be loaded.</p><button type="button" className="button secondary" onClick={() => void refresh()}>Try again</button></div>}
    </div>
    {data && <div className="drop-pagination"><span>{rows.length ? ((currentPage - 1) * view.pageSize + 1).toLocaleString() : 0}–{Math.min(currentPage * view.pageSize, rows.length).toLocaleString()} of {rows.length.toLocaleString()}</span><label>Rows per page<Select label="Rows per page" value={String(view.pageSize)} options={[25, 50, 100, 250].map(value => ({ value: String(value), label: String(value) }))} onChange={value => changeView({ ...view, pageSize: Number(value) })} /></label><div className="drop-page-controls"><button type="button" className="icon-button" disabled={currentPage === 1} aria-label="First page" onClick={() => goToPage(1)}><ChevronsLeft size={17} /></button><button type="button" className="icon-button" disabled={currentPage === 1} aria-label="Previous page" onClick={() => goToPage(currentPage - 1)}><ChevronLeft size={17} /></button><form onSubmit={event => { event.preventDefault(); const next = Number(pageInput); if (Number.isInteger(next) && next >= 1 && next <= pages) goToPage(next); else setPageInput(String(currentPage)); }}><label>Page<input type="number" min="1" max={pages} value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={() => setPageInput(String(currentPage))} /></label><span>of {pages.toLocaleString()}</span><button type="submit" className="sr-only">Go to page</button></form><button type="button" className="icon-button" disabled={currentPage === pages} aria-label="Next page" onClick={() => goToPage(currentPage + 1)}><ChevronRight size={17} /></button><button type="button" className="icon-button" disabled={currentPage === pages} aria-label="Last page" onClick={() => goToPage(pages)}><ChevronsRight size={17} /></button></div></div>}
    {menu && <DropColumnMenu key={menu.id} column={dropColumns.find(column => column.key === menu.key)!} anchor={menu.anchor} point={menu.point} initialFilter={menu.filter} view={view} onView={changeView} onFilter={filter => setFilter(menu.key, filter)} onSort={direction => setSort(menu.key, direction)} onPriority={index => moveSort(menu.key, index)} onVisibility={changeVisibility} onClose={closeMenu} />}
    {details && <DropDetails row={details} onClose={() => setDetails(null)} onFindReward={() => { changeView({ ...view, query: '', filters: { reward: { kind: 'text', operator: 'equals', value: details.reward } }, sorting: [{ key: 'chance', direction: -1 }] }); setDetails(null); }} onFindSource={() => { changeView({ ...view, query: '', filters: { source: { kind: 'text', operator: 'equals', value: details.source } } }); setDetails(null); }} />}
    {viewsOpen && <TablePopover anchor={viewsButton.current!} label="Drop table views" className="drop-views-popover" onClose={() => setViewsOpen(false)}><div className="column-menu-heading">Views</div><div className="column-menu-content"><div className="drop-view-presets">{([['all', 'All tables'], ['missions', 'Mission rewards'], ['relics', 'Relic contents'], ['bounties', 'Bounty stages'], ['enemies', 'Enemy & container drops']] as const).map(([key, label]) => <button type="button" key={key} className="column-menu-action" disabled={!data} onClick={() => preset(key)}>{label}</button>)}</div>{saved.views.length > 0 && <div className="drop-saved-views"><h3>Saved views</h3>{saved.views.map((entry, index) => <div key={entry.name}><button type="button" className="column-menu-action" onClick={() => { changeView(entry.view); closeViews(); }}>{entry.name}</button><button type="button" className="icon-button" aria-label={`Delete view ${entry.name}`} onClick={() => saveViews(saved.views.filter((_, position) => position !== index))}><X size={14} /></button></div>)}</div>}<form className="drop-save-view" onSubmit={event => { event.preventDefault(); if (!viewName.trim() || saved.error) return; if (saved.views.some(entry => entry.name.toLocaleLowerCase() === viewName.trim().toLocaleLowerCase())) { setNotice('A view with that name already exists. Choose another name.'); return; } if (saveViews([...saved.views, { name: viewName.trim(), view }])) { setViewName(''); closeViews(); setNotice('View saved. Only filters, sorting, and columns are saved.'); } }}><label>View name<input maxLength={60} value={viewName} onChange={event => setViewName(event.target.value)} disabled={Boolean(saved.error)} /></label><button type="submit" className="button secondary" disabled={!viewName.trim() || Boolean(saved.error)}>Save current view</button>{saved.error && <p className="error-text small">{saved.error}</p>}</form></div></TablePopover>}
    {help && <Dialog title="Search & drop rates" onClose={() => setHelp(false)} className="drop-help"><h3>Search syntax</h3><p>Combine terms to narrow results. Use quotes for a phrase and a minus sign to exclude a term. Search ignores letter case.</p><dl className="drop-query-examples"><div><dt><code>"nova prime"</code></dt><dd>Find the phrase across all text fields</dd></div><div><dt><code>reward:forma -source:lith</code></dt><dd>Forma rewards, excluding Lith sources</dd></div><div><dt><code>mission:survival rotation:c</code></dt><dd>Survival rewards in rotation C</dd></div><div><dt><code>chance:&gt;=10 chance:&lt;50</code></dt><dd>Drop chance from 10% up to, but excluding, 50%</dd></div></dl><p className="small muted">Fields: reward, source, category, location, mission, rotation, stage, era, refinement, rarity, chance, within, roll. Numeric fields accept =, &gt;, &gt;=, &lt;, and &lt;=.</p><h3>Reading the rates</h3><p><strong>Drop chance</strong> combines the source’s table roll rate with the reward’s within-table chance. Rates above 100% indicate multiple rolls; their overall odds are left uncalculated. The rarity label comes directly from the publisher.</p><p>Bounty stages and rotations are separate opportunities. Duplicate rewards within a table remain separate entries; they are not automatically added together. Reverse indexes for enemy drops are shown once.</p><p className="muted small">The official page describes PC rewards and may omit drops or lag hotfixes. Listed relics or sources can be vaulted or unavailable. Refresh fetches the latest published page, not an in-game live rotation. CSV exports all matching entries using the visible columns and current sort order; rates are percentages.</p><a href={DROP_TABLES_URL} target="_blank" rel="noreferrer">Open the official drop tables</a></Dialog>}
  </section>;
}
