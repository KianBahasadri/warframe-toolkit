import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Columns3, EyeOff, Filter, ListOrdered, X } from 'lucide-react';
import type { TableColumn, FilterChoice, ColumnFilter, ColumnKey, ColumnSort } from '../lib/tableView';
import { ColumnOptions } from './ColumnPicker';
import { Select } from './Select';
import { TablePopover } from './TablePopover';

export function ColumnMenu({ column, columns, selected, choices, sorting, filter, anchor, point, initialView = 'actions', onVisibility, onReset, onSort, onPriority, onFilter, onHide, onClose }: {
  column: TableColumn; columns: TableColumn[]; selected: ColumnKey[]; choices?: FilterChoice[]; sorting: ColumnSort[]; filter?: ColumnFilter;
  anchor: HTMLElement; point?: { x: number; y: number }; initialView?: 'actions' | 'filter';
  onVisibility: (key: ColumnKey, visible: boolean) => void; onReset: () => void;
  onSort: (direction: 1 | -1 | 0) => void; onPriority: (index: number) => void;
  onFilter: (filter?: ColumnFilter) => void; onHide: () => void; onClose: () => void;
}) {
  const [view, setView] = useState<'actions' | 'columns' | 'priority' | 'filter'>(initialView);
  const content = useRef<HTMLDivElement>(null);
  const sortIndex = sorting.findIndex(sort => sort.key === column.key);
  const direction = sorting[sortIndex]?.direction;
  const finish = (action: () => void) => { action(); onClose(); if (anchor.isConnected) anchor.focus({ preventScroll: true }); };
  useEffect(() => { content.current?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true }); }, [view]);
  const title = view === 'columns' ? 'Columns' : view === 'priority' ? `${column.title} sort priority` : view === 'filter' ? `Filter ${column.title}` : column.title;
  return <TablePopover anchor={anchor} point={point} role={view === 'actions' || view === 'priority' ? 'menu' : 'group'} label={view === 'columns' ? 'Table columns' : view === 'filter' ? title : `Column actions for ${column.title}`} className="column-context" onClose={onClose}>
    <div className="column-menu-heading">{view !== 'actions' && <button type="button" className="icon-button" aria-label="Back to column actions" title="Back to column actions" onClick={() => setView('actions')}><ArrowLeft size={16} aria-hidden="true" /></button>}<span>{title}</span></div>
    <div ref={content} className={`column-menu-content ${view === 'columns' ? 'column-menu-content-options' : ''}`}>
      {view === 'actions' && <>
        <button type="button" role="menuitemradio" aria-checked={direction === 1} className="column-menu-action" onClick={() => finish(() => onSort(1))}><ArrowUp size={16} aria-hidden="true" />Sort ascending</button>
        <button type="button" role="menuitemradio" aria-checked={direction === -1} className="column-menu-action" onClick={() => finish(() => onSort(-1))}><ArrowDown size={16} aria-hidden="true" />Sort descending</button>
        <button type="button" role="menuitem" className="column-menu-action" disabled={!direction} onClick={() => finish(() => onSort(0))}><X size={16} aria-hidden="true" />Remove sort</button>
        <button type="button" role="menuitem" className="column-menu-action" disabled={sortIndex < 0 || sorting.length < 2} onClick={() => setView('priority')}><ListOrdered size={16} aria-hidden="true" />Sort priority{sortIndex >= 0 && <span className="menu-value">{sortIndex + 1} of {sorting.length}</span>}</button>
        <div className="column-menu-divider" role="separator" />
        <button type="button" role="menuitem" className="column-menu-action" onClick={() => setView('filter')}><Filter size={16} aria-hidden="true" />{filter ? 'Edit filter' : 'Set filter'}</button>
        {filter && <button type="button" role="menuitem" className="column-menu-action" onClick={() => finish(() => onFilter())}><X size={16} aria-hidden="true" />Clear filter</button>}
        <div className="column-menu-divider" role="separator" />
        <button type="button" role="menuitem" className="column-menu-action" disabled={column.required || !selected.includes(column.key)} onClick={onHide}><EyeOff size={16} aria-hidden="true" />Hide column</button>
        <button type="button" role="menuitem" className="column-menu-action" onClick={() => setView('columns')}><Columns3 size={16} aria-hidden="true" />Add or remove columns</button>
      </>}
      {view === 'priority' && sorting.map((sort, index) => <button key={sort.key} type="button" role="menuitemradio" aria-checked={index === sortIndex} className="column-menu-action" onClick={() => finish(() => onPriority(index))}><span className="menu-priority">{index + 1}</span><span>{columns.find(option => option.key === sort.key)?.title}</span>{sort.direction === 1 ? <ArrowUp size={14} aria-label="Ascending" /> : <ArrowDown size={14} aria-label="Descending" />}</button>)}
      {view === 'columns' && <ColumnOptions options={columns} selected={selected} onChange={onVisibility} onReset={onReset} />}
      {view === 'filter' && <ColumnFilterForm column={column} choices={choices} filter={filter} onApply={next => finish(() => onFilter(next))} />}
    </div>
  </TablePopover>;
}

function ColumnFilterForm({ column, choices, filter, onApply }: { column: TableColumn; choices?: FilterChoice[]; filter?: ColumnFilter; onApply: (filter?: ColumnFilter) => void }) {
  const [value, setValue] = useState(filter ? String(filter.value) : '');
  const [operator, setOperator] = useState(filter?.kind === 'number' ? filter.operator : 'equals');
  return <form className="column-filter-form" onSubmit={event => {
    event.preventDefault();
    if (column.kind === 'number') onApply(operator === 'unknown' || value !== '' ? { kind: 'number', operator, value: Number(value) } : undefined);
    else onApply(value.trim() ? { kind: choices ? 'choice' : 'text', value: value.trim() } : undefined);
  }}>
    {column.kind === 'number' ? <>
      <label>Condition<Select label={`${column.title} condition`} value={operator} onChange={next => setOperator(next as typeof operator)} options={[{ value: 'equals', label: 'Equals' }, { value: 'atLeast', label: 'At least' }, { value: 'atMost', label: 'At most' }, ...(column.number?.unknown ? [{ value: 'unknown', label: 'Unknown' }] : [])]} /></label>
      {operator !== 'unknown' && <label>{column.title}<input aria-label={`Filter ${column.title.toLowerCase()}`} type="number" min={column.number?.min} max={column.number?.max} step="1" value={value} onChange={event => setValue(event.target.value)} /></label>}
    </> : choices ? <label>Value<Select label={`${column.title} filter value`} value={value} onChange={setValue} options={[{ value: '', label: 'Any' }, ...choices]} /></label>
      : <label>Contains<input aria-label={`${column.title} contains`} value={value} onChange={event => setValue(event.target.value)} /></label>}
    <div className="column-filter-actions"><button type="button" className="button quiet" disabled={!filter} onClick={() => onApply()}>Clear filter</button><button type="submit" className="button primary">Apply filter</button></div>
  </form>;
}
