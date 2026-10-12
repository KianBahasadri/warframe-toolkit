import { useEffect, useRef, useState } from 'react';
import type { DragEvent, MouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { ColumnDropTarget } from '../lib/tableView';

// Keep pointer capture, cancellation, and edge scrolling out of the table renderer.
export function useColumnDrag(container: RefObject<HTMLDivElement | null>, onDrop: (key: string, target: ColumnDropTarget) => void, onStart: () => void) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<ColumnDropTarget | null>(null);
  const drop = useRef(onDrop); drop.current = onDrop;
  const start = useRef(onStart); start.current = onStart;
  const cleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => () => cleanup.current?.(), []);

  const begin = (key: string, event: ReactPointerEvent<HTMLTableCellElement>) => {
    if (event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey) return;
    cleanup.current?.();
    suppressClick.current = false;
    const element = event.currentTarget, pointerId = event.pointerId;
    const startX = event.clientX, startY = event.clientY;
    let x = startX, y = startY, active = false, frame = 0, lastFrame = 0;
    let destination: ColumnDropTarget | null = null;

    const locate = (): ColumnDropTarget | null => {
      const grid = container.current;
      const bounds = grid?.getBoundingClientRect();
      const header = grid?.querySelector('th')?.getBoundingClientRect();
      if (!grid || !bounds || !header || x < Math.max(0, bounds.left) || x > Math.min(innerWidth, bounds.right) || y < header.top - 32 || y > header.bottom + 32) return null;
      const cell = document.elementFromPoint(x, Math.max(bounds.top, header.top) + header.height / 2)?.closest<HTMLTableCellElement>('th[data-column-key]');
      if (!cell || !grid.contains(cell) || cell.dataset.columnKey === key) return null;
      const rect = cell.getBoundingClientRect();
      return { key: cell.dataset.columnKey!, edge: x < rect.left + rect.width / 2 ? 'before' : 'after' };
    };
    const updateTarget = () => {
      const next = locate();
      if (next?.key !== destination?.key || next?.edge !== destination?.edge) {
        destination = next;
        setTarget(next);
      }
    };
    const scroll = (time: number) => {
      const grid = container.current;
      if (!grid) return;
      const bounds = grid.getBoundingClientRect();
      const header = grid.querySelector('th')?.getBoundingClientRect();
      const left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
      const step = Math.min(32, lastFrame ? time - lastFrame : 16);
      lastFrame = time;
      if (header && y >= header.top - 32 && y <= header.bottom + 32 && x >= left && x <= right) {
        const first = grid.querySelector('th');
        const pinnedWidth = first && getComputedStyle(first).left === '0px' ? first.getBoundingClientRect().width : 0;
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
      element.removeEventListener('lostpointercapture', lostCapture);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      cleanup.current = null;
    };
    const end = () => { dispose(); setDragging(null); setTarget(null); };
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
      const destination = active ? locate() : null;
      end();
      if (destination) drop.current(key, destination);
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
    element.addEventListener('lostpointercapture', lostCapture);
  };

  return {
    dragging, target,
    headerProps: (key: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLTableCellElement>) => begin(key, event),
      onDragStart: (event: DragEvent) => event.preventDefault(),
      onClickCapture: (event: MouseEvent) => {
        if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
      },
    }),
  };
}
