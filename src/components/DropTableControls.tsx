import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Columns3, EyeOff, Filter, Search, X } from 'lucide-react';
import { ColumnOptions } from './ColumnPicker';
import { TablePopover } from './TablePopover';
import { Select } from './Select';
import { defaultDropColumns, dropColumns, numericDropColumns } from '../lib/dropTables';
import type { DropColumn, DropColumnKey, DropFilter, DropSort, DropView } from '../lib/dropTables';

export function DropFacet({ column, options, filter, onChange }: { column: DropColumn; options: { value: string; count: number }[]; filter?: DropFilter; onChange: (filter?: DropFilter) => void }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = filter?.kind === 'values' ? filter.values : [];
  const matching = options.filter(option => (option.value || 'Not specified').toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="drop-facet">
    <button ref={trigger} type="button" className="button secondary" aria-expanded={open} onClick={() => { setOpen(!open); setSearch(''); }}><span>{column.title}{filter ? ` (${selected.length || 1})` : ''}</span><ChevronDown size={14} aria-hidden="true" /></button>
    {open && <TablePopover anchor={trigger.current!} label={`Filter ${column.title}`} className="drop-facet-popover" onClose={() => setOpen(false)}>
      <div className="drop-facet-search search-field"><Search size={15} aria-hidden="true" /><input aria-label={`Search ${column.title} options`} value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" className="icon-button" aria-label="Clear option search" onClick={event => { setSearch(''); event.currentTarget.parentElement?.querySelector('input')?.focus(); }}><X size={14} /></button>}</div>
      <div className="drop-facet-options">{matching.map(option => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={event => { const next = event.target.checked ? [...selected, option.value] : selected.filter(value => value !== option.value); onChange(next.length ? { kind: 'values', values: next } : undefined); }} /><span>{option.value || 'Not specified'}</span><small>{option.count.toLocaleString()}</small></label>)}{!matching.length && <p className="muted small">No matching options</p>}</div>
      <div className="drop-facet-footer"><span role="status">{matching.length} options</span><button type="button" className="button quiet" disabled={!filter} onClick={() => onChange()}>Clear</button></div>
    </TablePopover>}
  </div>;
}

export function DropFilterForm({ column, filter, onApply }: { column: DropColumn; filter?: DropFilter; onApply: (filter?: DropFilter) => void }) {
  const [value, setValue] = useState(filter?.kind === 'text' ? filter.value : '');
  const [operator, setOperator] = useState(filter?.kind === 'text' ? filter.operator : 'contains');
  const [min, setMin] = useState(filter?.kind === 'range' ? filter.min : '');
  const [max, setMax] = useState(filter?.kind === 'range' ? filter.max : '');
  const [unknown, setUnknown] = useState(filter?.kind === 'range' && Boolean(filter.unknown));
  const numeric = numericDropColumns.has(column.key);
  const invalid = min !== '' && max !== '' && Number(min) > Number(max);
  return <form className="column-filter-form" onSubmit={event => { event.preventDefault(); if (invalid && !unknown) return; onApply(numeric ? min || max || unknown ? { kind: 'range', min, max, unknown } : undefined : value.trim() ? { kind: 'text', operator, value: value.trim() } : undefined); }}>
    {numeric ? <>
      <label>Minimum (%)<input aria-label={`${column.title} minimum`} type="number" min="0" step="any" disabled={unknown} value={min} onChange={event => setMin(event.target.value)} /></label>
      <label>Maximum (%)<input aria-label={`${column.title} maximum`} type="number" min="0" step="any" disabled={unknown} value={max} aria-invalid={invalid && !unknown || undefined} aria-describedby={invalid ? 'drop-range-error' : undefined} onChange={event => setMax(event.target.value)} /></label>
      {column.key !== 'tableChance' && <label className="drop-check"><input type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} />{column.key === 'chance' ? 'Multiple rolls only' : 'Unspecified only'}</label>}
      {invalid && !unknown && <p id="drop-range-error" className="error-text small" role="alert">Maximum must be at least the minimum</p>}
    </> : <>
      <label>Condition<Select label={`${column.title} condition`} value={operator} options={[{ value: 'contains', label: 'Contains' }, { value: 'equals', label: 'Equals' }, { value: 'excludes', label: 'Does not contain' }]} onChange={value => setOperator(value as typeof operator)} /></label>
      <label>Text<input aria-label={`${column.title} filter text`} value={value} onChange={event => setValue(event.target.value)} /></label>
      {filter?.kind === 'values' && <p className="muted small">Applying a text filter replaces this column’s selected values.</p>}
    </>}
    <div className="column-filter-actions"><button type="button" className="button quiet" disabled={!filter} onClick={() => onApply()}>Clear filter</button><button type="submit" className="button primary" disabled={invalid && !unknown}>Apply filter</button></div>
  </form>;
}

export function DropColumnMenu({ column, anchor, point, initialFilter, view, onView, onFilter, onSort, onPriority, onVisibility, onClose }: {
  column: DropColumn; anchor: HTMLElement; point?: { x: number; y: number }; initialFilter?: boolean; view: DropView;
  onView: (view: DropView) => void; onFilter: (filter?: DropFilter) => void; onSort: (direction: 1 | -1 | 0) => void; onPriority: (index: number) => void;
  onVisibility: (key: DropColumnKey, visible: boolean) => void; onClose: () => void;
}) {
  const [panel, setPanel] = useState<'actions' | 'columns' | 'filter' | 'priority'>(initialFilter ? 'filter' : 'actions');
  const content = useRef<HTMLDivElement>(null);
  const index = view.sorting.findIndex(sort => sort.key === column.key), direction = view.sorting[index]?.direction;
  const filter = view.filters[column.key];
  const finish = (action: () => void) => { action(); onClose(); if (anchor.isConnected) anchor.focus({ preventScroll: true }); };
  useEffect(() => { content.current?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true }); }, [panel]);
  return <TablePopover anchor={anchor} point={point} role={panel === 'actions' || panel === 'priority' ? 'menu' : 'group'} label={panel === 'columns' ? 'Table columns' : panel === 'filter' ? `Filter ${column.title}` : `Column actions for ${column.title}`} className="column-context" onClose={onClose}>
    <div className="column-menu-heading">{panel !== 'actions' && <button type="button" className="icon-button" aria-label="Back to column actions" onClick={() => setPanel('actions')}><ArrowLeft size={16} /></button>}<span>{panel === 'columns' ? 'Columns' : panel === 'filter' ? `Filter ${column.title}` : panel === 'priority' ? 'Sort priority' : column.title}</span></div>
    <div ref={content} className="column-menu-content">
      {panel === 'actions' && <>
        <button type="button" role="menuitemradio" aria-checked={direction === 1} className="column-menu-action" onClick={() => finish(() => onSort(1))}><ArrowUp size={16} />Sort ascending</button>
        <button type="button" role="menuitemradio" aria-checked={direction === -1} className="column-menu-action" onClick={() => finish(() => onSort(-1))}><ArrowDown size={16} />Sort descending</button>
        <button type="button" role="menuitem" className="column-menu-action" disabled={!direction} onClick={() => finish(() => onSort(0))}><X size={16} />Remove sort</button>
        <button type="button" role="menuitem" className="column-menu-action" disabled={index < 0 || view.sorting.length < 2} onClick={() => setPanel('priority')}><ArrowUp size={16} />Sort priority{index >= 0 && <span className="menu-value">{index + 1} of {view.sorting.length}</span>}</button>
        <div role="separator" className="column-menu-divider" />
        <button type="button" role="menuitem" className="column-menu-action" onClick={() => setPanel('filter')}><Filter size={16} />{filter ? 'Edit filter' : 'Set filter'}</button>
        {filter && <button type="button" role="menuitem" className="column-menu-action" onClick={() => finish(() => onFilter())}><X size={16} />Clear filter</button>}
        <div role="separator" className="column-menu-divider" />
        <button type="button" role="menuitem" className="column-menu-action" disabled={column.required} onClick={() => finish(() => onVisibility(column.key, false))}><EyeOff size={16} />Hide column</button>
        <button type="button" role="menuitem" className="column-menu-action" onClick={() => setPanel('columns')}><Columns3 size={16} />Add or remove columns</button>
      </>}
      {panel === 'filter' && <DropFilterForm column={column} filter={filter} onApply={filter => finish(() => onFilter(filter))} />}
      {panel === 'columns' && <ColumnOptions options={dropColumns} selected={view.columns} onChange={onVisibility} onReset={() => onView({ ...view, columns: [...defaultDropColumns] })} />}
      {panel === 'priority' && view.sorting.map((sort, position) => <button type="button" key={sort.key} role="menuitemradio" aria-checked={index === position} className="column-menu-action" onClick={() => finish(() => onPriority(position))}><span className="menu-priority">{position + 1}</span>{dropColumns.find(column => column.key === sort.key)!.title}</button>)}
    </div>
  </TablePopover>;
}

export function DropSorts({ sorting, onSort, onPriority, onClear }: { sorting: DropSort[]; onSort: (key: DropColumnKey, direction: 1 | -1 | 0) => void; onPriority: (key: DropColumnKey, index: number) => void; onClear: () => void }) {
  return <div className="drop-sorts" aria-label="Sort priorities"><span className="muted small">Sort</span>{sorting.map((sort, index) => <div className="drop-sort" key={sort.key}><span className="drop-sort-number">{index + 1}</span><button type="button" className="drop-sort-direction" title="Reverse sort direction" aria-label={`${dropColumns.find(column => column.key === sort.key)!.title}: ${sort.direction === 1 ? 'ascending' : 'descending'}. Reverse direction`} onClick={() => onSort(sort.key, sort.direction === 1 ? -1 : 1)}>{dropColumns.find(column => column.key === sort.key)!.title}{sort.direction === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}</button><button type="button" className="drop-mini-button" aria-label={`Increase ${sort.key} sort priority`} disabled={!index} onClick={() => onPriority(sort.key, index - 1)}><ArrowLeft size={13} /></button><button type="button" className="drop-mini-button" aria-label={`Remove ${sort.key} sort`} onClick={() => onSort(sort.key, 0)}><X size={13} /></button></div>)}<button type="button" className="button quiet" onClick={onClear}>Clear sorts</button></div>;
}
