import { useRef, useState } from 'react';

// Drafts live in the collection immediately; the account layer debounces the save.
// Hiding the column or changing pages therefore cannot discard a pending edit.
export function TableNotes({ name, value, onChange }: { name: string; value: string; onChange: (notes: string) => void }) {
  const [editing, setEditing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return editing ? <textarea className="table-notes-input" aria-label={`Notes for ${name}`} autoFocus rows={3} maxLength={5000} value={value}
    onChange={event => onChange(event.target.value)} onBlur={() => setEditing(false)}
    onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation(); setEditing(false);
        requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
      }
    }} />
    : <button ref={button} type="button" className={`table-notes ${value ? '' : 'table-missing'}`} aria-label={`Edit notes for ${name}`} onClick={() => setEditing(true)}>{value || 'Add a note…'}</button>;
}
