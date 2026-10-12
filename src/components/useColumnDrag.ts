import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, MouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { moveColumn } from '../lib/tableView';
import type { ColumnDropTarget } from '../lib/tableView';

const slideDuration = 180;
const slideEasing = 'cubic-bezier(.2, .8, .2, 1)';

// Keep pointer capture, animated previews, and edge scrolling out of the table renderer.
export function useColumnDrag(container: RefObject<HTMLDivElement | null>, onDrop: (key: string, target: ColumnDropTarget) => void, onStart: () => void) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<ColumnDropTarget | null>(null);
  const drop = useRef(onDrop); drop.current = onDrop;
  const start = useRef(onStart); start.current = onStart;
  const cleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const landing = useRef<Map<string, number> | null>(null);
  const animations = useRef<Animation[]>([]);
  useEffect(() => () => { cleanup.current?.(); animations.current.forEach(animation => animation.cancel()); }, []);

  // The real order changes only on release. Animate from the last preview position
  // into the committed layout (or back to the original layout after cancellation).
  useLayoutEffect(() => {
    if (dragging || !landing.current) return;
    const previous = landing.current; landing.current = null;
    const grid = container.current;
    if (!grid || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = grid.getBoundingClientRect();
    const offsets = new Map([...grid.querySelectorAll<HTMLElement>('th[data-column-key]')].map(cell => [cell.dataset.columnKey!, (previous.get(cell.dataset.columnKey!) ?? cell.getBoundingClientRect().left) - cell.getBoundingClientRect().left]));
    animations.current = [...grid.querySelectorAll<HTMLElement>('[data-column-key]')].flatMap(cell => {
      const offset = offsets.get(cell.dataset.columnKey!) ?? 0;
      if (Math.abs(offset) < .5) return [];
      const rect = cell.getBoundingClientRect();
      if (rect.bottom < bounds.top || rect.top > bounds.bottom) return [];
      return [cell.animate([{ transform: `translateX(${offset}px)` }, { transform: 'translateX(0)' }], { duration: slideDuration, easing: slideEasing })];
    });
  }, [container, dragging]);

  const begin = (key: string, event: ReactPointerEvent<HTMLTableCellElement>) => {
    if (event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey) return;
    cleanup.current?.();
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    suppressClick.current = false;
    const grid = container.current, table = grid?.querySelector('table');
    if (!grid || !table) return;
    const element = event.currentTarget, pointerId = event.pointerId;
    const startX = event.clientX, startY = event.clientY;
    let x = startX, y = startY, active = false, frame = 0, lastFrame = 0;
    let destination: ColumnDropTarget | null = null;
    let contentLeft = 0;
    const columns = [...grid.querySelectorAll<HTMLTableCellElement>('th[data-column-key]')].map((cell, index) => {
      const width = cell.getBoundingClientRect().width;
      const column = { key: cell.dataset.columnKey!, index, width, left: contentLeft };
      contentLeft += width;
      return column;
    });
    const originalOrder = columns.map(column => column.key);
    const source = columns.find(column => column.key === key)!;
    const pinned = getComputedStyle(grid.querySelector('th')!).left === '0px';
    const grabOffset = startX - element.getBoundingClientRect().left;
    const baseLeft = (column: typeof source, tableLeft: number, gridLeft: number) => pinned && column.index === 0 ? Math.max(gridLeft, tableLeft) : tableLeft + column.left;

    const locate = (): ColumnDropTarget | null => {
      const bounds = grid.getBoundingClientRect();
      const header = element.getBoundingClientRect();
      if (x < Math.max(0, bounds.left) || x > Math.min(innerWidth, bounds.right) || y < header.top - 32 || y > header.bottom + 32) return null;
      const tableLeft = table.getBoundingClientRect().left;
      // Hit-test the original slots, so sliding cells cannot move their own targets.
      for (const column of columns) {
        const left = baseLeft(column, tableLeft, bounds.left);
        if (x >= left && x < left + column.width) return column.key === key ? null : { key: column.key, edge: x < left + column.width / 2 ? 'before' : 'after' };
      }
      return null;
    };
    const paint = () => {
      const bounds = grid.getBoundingClientRect(), tableBounds = table.getBoundingClientRect();
      const preview = destination ? moveColumn(originalOrder, key, destination) : originalOrder;
      let left = 0;
      for (const [index, columnKey] of preview.entries()) {
        const column = columns.find(candidate => candidate.key === columnKey)!;
        const previewLeft = pinned && index === 0 ? Math.max(bounds.left, tableBounds.left) : tableBounds.left + left;
        // Keep the preview inside the table so transforms cannot inflate its scroll range.
        const desired = columnKey === key ? Math.max(tableBounds.left, Math.min(x - grabOffset, tableBounds.right - source.width)) : previewLeft;
        const offset = `${desired - baseLeft(column, tableBounds.left, bounds.left)}px`;
        const property = `--column-drag-${column.index}`;
        if (grid.style.getPropertyValue(property) !== offset) grid.style.setProperty(property, offset);
        left += column.width;
      }
    };
    const updateTarget = () => {
      const next = locate();
      if (next?.key !== destination?.key || next?.edge !== destination?.edge) {
        destination = next;
        setTarget(next);
      }
      paint();
    };
    const scroll = (time: number) => {
      const bounds = grid.getBoundingClientRect();
      const header = grid.querySelector('th')?.getBoundingClientRect();
      const left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
      const step = Math.min(32, lastFrame ? time - lastFrame : 16);
      lastFrame = time;
      if (header && y >= header.top - 32 && y <= header.bottom + 32 && x >= left && x <= right) {
        const pinnedWidth = pinned ? columns[0].width : 0;
        const leftEdge = Math.min(left + pinnedWidth + 40, right - 48);
        const velocity = x < leftEdge ? -Math.min(1, (leftEdge - x) / 48) : x > right - 48 ? Math.min(1, (x - right + 48) / 48) : 0;
        grid.scrollLeft += velocity * step;
        updateTarget();
      }
      frame = requestAnimationFrame(scroll);
    };
    const dispose = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      element.removeEventListener('lostpointercapture', lostCapture);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      columns.forEach(column => grid.style.removeProperty(`--column-drag-${column.index}`));
      cleanup.current = null;
    };
    const end = () => {
      if (active) landing.current = new Map([...grid.querySelectorAll<HTMLElement>('th[data-column-key]')].map(cell => [cell.dataset.columnKey!, cell.getBoundingClientRect().left]));
      dispose(); setDragging(null); setTarget(null);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      x = next.clientX; y = next.clientY;
      if (!active && Math.abs(x - startX) >= 6 && Math.abs(x - startX) > Math.abs(y - startY)) {
        active = true;
        suppressClick.current = true;
        element.setPointerCapture(pointerId);
        start.current();
        setDragging(key);
        frame = requestAnimationFrame(scroll);
      }
      if (active) { next.preventDefault(); updateTarget(); }
    };
    const finish = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      x = next.clientX; y = next.clientY;
      if (active) updateTarget();
      const finalTarget = active ? destination : null;
      end();
      if (finalTarget) drop.current(key, finalTarget);
    };
    const cancel = () => end();
    // Touch initially captures on the nested button. Its loss of capture bubbles
    // when we transfer capture to the header, and must not cancel that transfer.
    const lostCapture = (next: PointerEvent) => {
      if (next.target === element && next.pointerId === pointerId) cancel();
    };
    const escape = (next: KeyboardEvent) => {
      if (next.key !== 'Escape') return;
      next.preventDefault(); next.stopPropagation(); end();
    };
    cleanup.current = dispose;
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    element.addEventListener('lostpointercapture', lostCapture);
  };

  return {
    dragging, target,
    cellStyle: (index: number): CSSProperties | undefined => dragging ? { transform: `translateX(var(--column-drag-${index}, 0px))` } : undefined,
    headerProps: (key: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLTableCellElement>) => begin(key, event),
      onDragStart: (event: DragEvent) => event.preventDefault(),
      onClickCapture: (event: MouseEvent) => {
        if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
      },
    }),
  };
}
