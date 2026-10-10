import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Moon, Plus, ScanLine, Search, Sun, X } from 'lucide-react';
import { InventoryTable } from './components/InventoryTable';
import { EquipmentForm } from './components/EquipmentForm';
import { ScreenshotImport } from './components/ScreenshotImport';
import { Backups } from './components/Backups';
import { Relics } from './components/Relics';
import { Commands } from './components/Commands';
import type { Command } from './components/Commands';
import { Dialog } from './components/Dialog';
import { initialInventory } from './data/reference';
import { catalog } from './data/catalog';
import { editableRecord, equipmentRows, toggleEquipment } from './lib/weaponCatalog';
import { mergeObservations } from './lib/model';
import type { Equipment, Inventory } from './lib/model';
import { downloadFile, inventoryCsv, parseBackup, relicsCsv, STORAGE_KEY } from './lib/storage';
import { MAX_RELIC_QUANTITY } from './lib/relics';
import weaponsIcon from './assets/warframe/weapons.png';
import warframesIcon from './assets/warframe/warframes.png';
import relicsIcon from './assets/warframe/relics.png';

type Page = 'weapons' | 'warframes' | 'relics' | 'import' | 'backups';
const pageNames: Record<Page, string> = { weapons: 'Weapons', warframes: 'Warframes', relics: 'Relics', import: 'Screenshot import', backups: 'Data & backups' };

function pageFromHash(): Page {
  const value = location.hash.slice(1);
  return Object.keys(pageNames).includes(value) ? value as Page : 'weapons';
}

function loadInventory(): { data: Inventory; error: string; fresh: boolean } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { data: saved ? parseBackup(saved) : initialInventory(), error: '', fresh: !saved };
  } catch {
    return { data: { version: 1, items: [], relics: [], imports: [], referenceNotice: false }, error: 'Your saved inventory could not be read. It has not been overwritten. Restore a backup or export the original data below.', fresh: false };
  }
}

export default function App() {
  const [initial] = useState(loadInventory);
  const [inventory, setInventory] = useState(initial.data);
  const inventoryRef = useRef(inventory); inventoryRef.current = inventory;
  const [storageError, setStorageError] = useState(initial.error);
  const [unreadable, setUnreadable] = useState(Boolean(initial.error));
  const [page, setPage] = useState<Page>(pageFromHash);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('arsenal.theme') || 'dark'; } catch { return 'dark'; } });
  const [notice, setNotice] = useState('');

  const commit = (next: Inventory, restoring = false): boolean => {
    next = { ...next, relics: next.relics ?? [] };
    if (unreadable && !restoring) { setStorageError('Export the original data and restore a valid backup before editing. Your unreadable saved data is being preserved.'); return false; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); inventoryRef.current = next; setInventory(next); setStorageError(''); setUnreadable(false); return true; }
    catch { setStorageError('Your browser could not save changes. Free some storage or download a backup. The last saved inventory is unchanged.'); return false; }
  };
  useEffect(() => {
    if (initial.fresh) commit(initial.data);
    const hashChange = () => setPage(pageFromHash());
    hashChange();
    const storage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { const next = parseBackup(event.newValue); inventoryRef.current = next; setInventory(next); setNotice('Inventory updated from another tab.'); }
      catch { setStorageError('Another tab wrote an invalid inventory. Your current view has been kept.'); }
    };
    window.addEventListener('hashchange', hashChange); window.addEventListener('storage', storage);
    return () => { window.removeEventListener('hashchange', hashChange); window.removeEventListener('storage', storage); };
  }, [initial]);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('arsenal.theme', theme); } catch { /* Inventory saving reports its own failures. */ } }, [theme]);
  const navigate = (destination: Page) => { setPage(destination); location.hash = destination; setSearch(''); };
  const exportCsv = () => { downloadFile(`arsenal-inventory-${new Date().toISOString().slice(0, 10)}.csv`, inventoryCsv(equipmentRows(inventoryRef.current.items, catalog)), 'text/csv;charset=utf-8'); setNotice('Inventory CSV downloaded.'); };
  const exportRelics = () => { downloadFile(`arsenal-relics-${new Date().toISOString().slice(0, 10)}.csv`, relicsCsv(inventoryRef.current.relics ?? []), 'text/csv;charset=utf-8'); setNotice('Relics CSV downloaded.'); };
  const commands: Command[] = [
    { label: 'Add equipment', keys: ['Alt', 'N'], run: () => setEditing('new') },
    { label: 'Import screenshots', keys: ['Alt', 'I'], run: () => navigate('import') },
    { label: page === 'relics' ? 'Export relics CSV' : 'Export inventory CSV', keys: ['Alt', 'E'], run: page === 'relics' ? exportRelics : exportCsv },
    { label: 'Toggle theme', keys: ['Alt', 'Shift', 'T'], run: () => setTheme(value => value === 'dark' ? 'light' : 'dark') },
    { label: 'Keyboard shortcuts', keys: ['Alt', '/'], run: () => setShortcuts(true) },
  ];
  const destinations: Command[] = [
    { label: 'Weapons', keys: ['Alt', '1'], run: () => navigate('weapons') },
    { label: 'Screenshot import', keys: ['Alt', '2'], run: () => navigate('import') },
    { label: 'Data & backups', keys: ['Alt', '3'], run: () => navigate('backups') },
    { label: 'Relics', keys: ['Alt', '4'], run: () => navigate('relics') },
  ];
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandler.current = event => {
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'k' || event.ctrlKey && event.code === 'Space')) { if (palette || !document.querySelector('dialog[open]')) { event.preventDefault(); setPalette(value => !value); } return; }
    if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable], dialog') || !event.altKey) return;
    const key = event.key.toLowerCase();
    const command = [...commands, ...destinations].find(option => option.keys.at(-1)?.toLowerCase() === key && option.keys.includes('Shift') === event.shiftKey);
    if (command) { event.preventDefault(); command.run(); }
    if (key === 'j') { event.preventDefault(); setPalette(true); }
  };
  useEffect(() => { const handle = (event: KeyboardEvent) => keyHandler.current(event); window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle); }, []);

  const relics = inventory.relics ?? [];
  const nav = <nav className="collection-nav" aria-label="Main navigation"><ul>
    {([{ key: 'weapons', icon: weaponsIcon }, { key: 'warframes', icon: warframesIcon }, { key: 'relics', icon: relicsIcon }] as const).map(({ key, icon }) => <li key={key}><a href={`#${key}`} aria-current={page === key ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(key); }}><span className="nav-icon" aria-hidden="true" style={{ maskImage: `url(${icon})` }} /><span>{pageNames[key]}</span></a></li>)}
    </ul></nav>;
  const visibleItems = useMemo(() => equipmentRows(inventory.items, catalog, page === 'weapons').filter(item => page === 'warframes' ? item.slot === 'Warframe' : item.slot !== 'Warframe'), [inventory.items, page]);
  const isInventory = page === 'weapons' || page === 'warframes';
  return <div className="app-shell">
    <div className="content-shell"><header className="topbar">{nav}<div className="topbar-right"><div className="page-utilities"><button type="button" className="search-launcher" aria-label="Open search and commands" aria-keyshortcuts="Control+k Meta+k Control+Space" onClick={() => setPalette(true)}><Search size={15} /></button><button type="button" className="icon-button theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button></div></div></header>
      <main id="main-content">
        {storageError && <div className="callout danger" role="alert"><strong>Storage problem:</strong> {storageError}{initial.error && <button type="button" className="button secondary" onClick={() => { try { downloadFile('arsenal-original-data.txt', localStorage.getItem(STORAGE_KEY) || '', 'text/plain'); } catch { setNotice('Browser storage is unavailable.'); } }}>Download original data</button>}</div>}
        {notice && <div className="callout info inline-notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss notification" title="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {isInventory && <>
          <section className="inventory-section" aria-labelledby="inventory-title">
            <div className="section-heading"><h1 id="inventory-title">{pageNames[page]}</h1><div className="inventory-actions">
              <button type="button" className="button secondary" onClick={() => setEditing('new')}><Plus size={16} />Add equipment</button>
              <button type="button" className="button primary" onClick={() => navigate('import')}><ScanLine size={16} />Import screenshots</button>
              <button type="button" className="button quiet" onClick={exportCsv}><ArrowDownToLine size={15} />Export CSV</button>
            </div></div>
            <InventoryTable key={page} weapons={page === 'weapons'} items={visibleItems} search={search} setSearch={setSearch} onEdit={row => setEditing(editableRecord(row))} onToggle={(item, field) => commit({ ...inventoryRef.current, items: toggleEquipment(inventoryRef.current.items, item, field) })} />
          </section>
        </>}
        {page === 'relics' && <Relics relics={relics} onExport={exportRelics} onSave={relic => {
          const current = inventoryRef.current;
          const existing = current.relics ?? [];
          return commit({ ...current, relics: existing.some(entry => entry.id === relic.id) ? existing.map(entry => entry.id === relic.id ? relic : entry) : [...existing, relic] });
        }} onDelete={id => commit({ ...inventoryRef.current, relics: (inventoryRef.current.relics ?? []).filter(relic => relic.id !== id) })} onQuantityChange={(id, change) => {
          const current = inventoryRef.current;
          commit({ ...current, relics: (current.relics ?? []).map(relic => relic.id === id ? { ...relic, quantity: Math.max(0, Math.min(MAX_RELIC_QUANTITY, relic.quantity + change)), updatedAt: new Date().toISOString() } : relic) });
        }} />}
        {page === 'import' && <ScreenshotImport items={inventory.items} history={inventory.imports} onInventory={() => navigate('weapons')} onImport={(observations, files) => { const merged = mergeObservations(inventoryRef.current.items, observations); const next = { ...inventoryRef.current, items: merged.items, imports: [{ id: crypto.randomUUID(), date: new Date().toISOString(), files, added: merged.added, updated: merged.updated }, ...inventoryRef.current.imports].slice(0, 100) }; return commit(next) ? { added: merged.added, updated: merged.updated } : null; }} />}
        {page === 'backups' && <Backups inventory={inventory} onRestore={data => commit(data, true)} />}
      </main>
    </div>
    {editing && <EquipmentForm item={editing === 'new' ? undefined : editing} existing={inventory.items} onClose={() => setEditing(null)} onSave={item => { const current = inventoryRef.current; const exists = current.items.some(entry => entry.id === item.id); if (commit({ ...current, items: exists ? current.items.map(entry => entry.id === item.id ? item : entry) : [...current.items, item] })) { setEditing(null); setNotice(`${item.name} ${exists ? 'updated' : 'added'}.`); return true; } return false; }} onDelete={id => { if (commit({ ...inventoryRef.current, items: inventoryRef.current.items.filter(item => item.id !== id) })) { setEditing(null); setNotice('Equipment entry removed.'); return true; } return false; }} />}
    {palette && <Commands commands={commands} destinations={destinations} onClose={() => setPalette(false)} />}
    {shortcuts && <Dialog title="Keyboard shortcuts" onClose={() => setShortcuts(false)}><dl className="shortcut-list"><div><dt>Search and commands</dt><dd><kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd> / <kbd>Ctrl</kbd> + <kbd>Space</kbd></dd></div>{[...commands, ...destinations].map(command => <div key={command.label}><dt>{command.label}</dt><dd>{command.keys.map(key => <kbd key={key}>{key}</kbd>)}</dd></div>)}<div><dt>Move between equipment rows</dt><dd><kbd>↑</kbd><kbd>↓</kbd></dd></div><div><dt>Open selected equipment</dt><dd><kbd>Enter</kbd><kbd>Space</kbd></dd></div></dl></Dialog>}
  </div>;
}
