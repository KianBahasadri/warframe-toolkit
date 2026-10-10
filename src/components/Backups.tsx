import { useRef, useState } from 'react';
import { Database, Download, FileSpreadsheet, FolderOpen, HardDrive } from 'lucide-react';
import { Dialog } from './Dialog';
import { catalog, catalogDate } from '../data/catalog';
import { downloadFile, inventoryCsv, parseBackup } from '../lib/storage';
import type { Inventory } from '../lib/model';

export function Backups({ inventory, onRestore }: { inventory: Inventory; onRestore: (inventory: Inventory) => boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Inventory | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const date = new Date().toISOString().slice(0, 10);
  const relics = inventory.relics ?? [];
  const backup = () => downloadFile(`arsenal-backup-${date}.json`, JSON.stringify(inventory, null, 2), 'application/json');
  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR DATA. YOUR SAVE FILE.</p><h1>Data & backups</h1><p className="page-description">Keep a copy of your collection, or take it back to a spreadsheet.</p></div></div>
    <div className="storage-summary"><HardDrive size={24} /><div><h2>Saved in this browser</h2><p>{inventory.items.length} equipment entries and {relics.length} relic stacks. Export a backup before clearing browser data or switching devices. There is no cloud sync.</p></div><span className="badge">Local storage</span></div>
    <div className="backup-options">
      <section className="backup-option"><Database size={24} /><h2>Full inventory backup</h2><p>Equipment, relics, notes, and import history.</p><button type="button" className="button primary" onClick={() => { backup(); setStatus('JSON backup downloaded.'); }}><Download size={16} />Download JSON</button></section>
      <section className="backup-option"><FileSpreadsheet size={24} /><h2>Spreadsheet export</h2><p>Your original 14 columns, with rank and notes. Opens in Google Sheets or Excel.</p><button type="button" className="button secondary" onClick={() => { downloadFile(`arsenal-inventory-${date}.csv`, inventoryCsv(inventory.items), 'text/csv;charset=utf-8'); setStatus('Spreadsheet CSV downloaded.'); }}><Download size={16} />Download CSV</button></section>
      <section className="backup-option"><FolderOpen size={24} /><h2>Restore a backup</h2><p>Choose an Arsenal JSON backup. You’ll review the replacement before saving.</p><button type="button" className="button secondary" onClick={() => input.current?.click()}><FolderOpen size={16} />Choose backup</button><input className="sr-only" ref={input} type="file" accept=".json,application/json" aria-label="Choose inventory backup" tabIndex={-1} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        try { if (file.size > 10 * 1024 * 1024) throw new Error('Backups must be smaller than 10 MB.'); setPending(parseBackup(await file.text())); setError(''); }
        catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not read this backup.'); }
      }} /></section>
    </div>
    {status && <p className="callout success" role="status"><strong>Export complete:</strong> {status}</p>}
    {error && <p className="callout danger" role="alert"><strong>Couldn’t restore:</strong> {error}</p>}
    <section className="about-data"><h2>About your equipment data</h2><dl><div><dt>Starting inventory</dt><dd>35 visible weapon rows from your reference spreadsheet. Hidden rows were not available.</dd></div><div><dt>Equipment catalog</dt><dd>{catalog.length} names from <a href="https://github.com/WFCD/warframe-items" target="_blank" rel="noreferrer">Warframe Community Developers</a>, bundled {new Date(catalogDate).toLocaleDateString()}.</dd></div><div><dt>Screenshot reader</dt><dd>Local English text recognition with <a href="https://github.com/naptha/tesseract.js" target="_blank" rel="noreferrer">Tesseract.js</a>. No API key required. Custom weapon names may need a manual match.</dd></div><div><dt>Keep preferences</dt><dd>Your own notes and flags. “Don’t keep” does not establish that an item is safe to sell.</dd></div></dl></section>
    {pending && <Dialog title="Restore this inventory?" onClose={() => setPending(null)}><p>This backup contains <strong>{pending.items.length} equipment entries</strong>, <strong>{pending.relics.length} relic stacks</strong>, and {pending.imports.length} imports. It will replace your current {inventory.items.length} equipment entries and {relics.length} relic stacks.</p><p className="muted">A backup of your current inventory will download first.</p><div className="dialog-footer"><button type="button" className="button secondary" onClick={() => setPending(null)}>Cancel</button><button type="button" className="button primary" onClick={() => { backup(); if (onRestore(pending)) { setPending(null); setStatus('Backup restored. Your previous inventory was downloaded.'); } }}>Back up & restore</button></div></Dialog>}
  </>;
}
