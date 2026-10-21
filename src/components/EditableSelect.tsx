import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface Option { value: string; label: string }
interface EditableSelectProps {
  label: string;
  value: string;
  options: readonly Option[];
  mode: 'list-only';
  onChange: (value: string) => void;
}

const normalize = (text: string) => text.trim().toLocaleLowerCase();

/** Editable, list-only dropdown adapted from the design-guide reference. */
export function EditableSelect({ label, value, options, mode, onChange }: EditableSelectProps) {
  const id = useId(), input = useRef<HTMLInputElement>(null), menu = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState<string | null>(null), [active, setActive] = useState<string | null>(null);
  const [width, setWidth] = useState(176);
  const committed = useRef(value);
  committed.current = value;
  const currentLabel = options.find(option => option.value === value)?.label ?? value;
  const text = query ?? currentLabel;
  const matching = options.map((option, index) => ({ ...option, index })).filter(option => query === null || normalize(option.label).includes(normalize(query)));
  const activeIndex = Math.max(0, matching.findIndex(option => option.value === active));
  const activeOption = matching[activeIndex];
  const dismiss = () => { setOpen(false); setQuery(null); setActive(null); };
  const commit = (option: Option) => {
    if (option.value !== committed.current) { committed.current = option.value; onChange(option.value); }
    dismiss();
  };
  const settle = () => {
    const exact = query !== null && options.find(option => normalize(option.label) === normalize(query));
    if (exact) commit(exact); else dismiss();
  };
  const show = (last = false) => {
    setQuery(null); setActive(last ? options.at(-1)?.value ?? null : value); setOpen(true);
  };

  useLayoutEffect(() => {
    const field = input.current!;
    const fit = () => {
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      const style = getComputedStyle(field);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const inputWidth = context.measureText(text).width + 52;
      context.font = `${style.fontStyle} 600 13.5px ${style.fontFamily}`;
      const optionWidth = Math.max(0, ...options.map(option => context.measureText(option.label).width)) + 28;
      setWidth(Math.min(232, Math.max(176, Math.ceil(Math.max(inputWidth, optionWidth)))));
    };
    fit();
    let disposed = false;
    void document.fonts.ready.then(() => { if (!disposed) fit(); });
    return () => { disposed = true; };
  }, [text, options]);

  useLayoutEffect(() => {
    const popup = menu.current, field = input.current;
    if (!open || !popup || !field) return;
    const position = () => {
      const bounds = field.getBoundingClientRect(), viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0, left = viewport?.offsetLeft ?? 0;
      const height = viewport?.height ?? innerHeight, viewportWidth = viewport?.width ?? innerWidth;
      const below = top + height - bounds.bottom - 14, above = bounds.top - top - 14;
      const desired = Math.min(240, popup.scrollHeight + 2), opensAbove = below < desired && above > below;
      const popupHeight = Math.max(0, Math.min(desired, opensAbove ? above : below));
      Object.assign(popup.style, { width: `${Math.min(bounds.width, viewportWidth - 16)}px`, maxHeight: `${popupHeight}px`,
        left: `${Math.max(left + 8, Math.min(bounds.left, left + viewportWidth - bounds.width - 8))}px`,
        top: `${opensAbove ? bounds.top - popupHeight - 6 : bounds.bottom + 6}px` });
    };
    position();
    const observer = new ResizeObserver(position); observer.observe(field);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open, matching.length, width]);

  useLayoutEffect(() => {
    const popup = menu.current, option = popup?.children[activeIndex] as HTMLElement | undefined;
    if (!open || !popup || !option) return;
    if (option.offsetTop < popup.scrollTop) popup.scrollTop = option.offsetTop - 2;
    else if (option.offsetTop + option.offsetHeight > popup.scrollTop + popup.clientHeight) popup.scrollTop = option.offsetTop + option.offsetHeight - popup.clientHeight + 2;
  }, [open, activeIndex, query]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!input.current?.parentElement?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) settle();
    };
    document.addEventListener('pointerdown', outside, true); window.addEventListener('blur', settle);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('blur', settle); };
  });

  return <div className="editable-select" style={{ width }} data-mode={mode}>
    <input ref={input} type="text" className="editable-select-input" role="combobox" aria-label={label} aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && activeOption ? `${id}-option-${activeOption.index}` : undefined}
      autoComplete="off" spellCheck={false} value={text} onChange={event => { setQuery(event.target.value); setActive(null); setOpen(true); }}
      onClick={() => { if (!open) { show(); input.current?.select(); } }} onBlur={settle}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!open) show(event.key === 'ArrowUp');
          else if (matching.length) setActive(matching[(activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matching.length) % matching.length].value);
        } else if (event.key === 'Enter' && open) {
          event.preventDefault(); if (activeOption) commit(activeOption);
        } else if (event.key === 'Escape' && (open || query !== null)) {
          event.preventDefault(); event.stopPropagation(); dismiss();
        } else if (event.key === 'Tab') settle();
      }} />
    <ChevronDown size={14} aria-hidden="true" focusable="false" />
    <span className="sr-only" aria-live="polite">{open ? `${matching.length} ${matching.length === 1 ? 'option' : 'options'} available` : ''}</span>
    {open && createPortal(<ul ref={menu} id={`${id}-list`} className="editable-select-menu" role="listbox" aria-label={label} onMouseDown={event => event.preventDefault()}>
      {matching.map(option => <li key={option.value} id={`${id}-option-${option.index}`} className="editable-select-option" role="option" aria-selected={option.value === value} data-active={option.value === activeOption?.value || undefined}
        onPointerMove={event => { if (event.pointerType === 'mouse' && (event.movementX || event.movementY)) setActive(option.value); }} onClick={() => commit(option)}>{option.label}</li>)}
      {!matching.length && <li className="editable-select-empty" role="presentation">No matching options</li>}
    </ul>, input.current?.closest('dialog') ?? document.body)}
  </div>;
}
