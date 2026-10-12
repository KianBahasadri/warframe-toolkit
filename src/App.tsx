import { useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Search, Sun, Table2, UserRound, X } from 'lucide-react';
import { InventoryTable } from './components/InventoryTable';
import type { CollectionActions } from './components/CollectionTable';
import { EquipmentForm } from './components/EquipmentForm';
import { ScreenshotImport } from './components/ScreenshotImport';
import { Relics } from './components/Relics';
import { DropTables } from './components/DropTables';
import type { DropTableActions } from './components/DropTables';
import { Commands } from './components/Commands';
import type { Command } from './components/Commands';
import { Dialog } from './components/Dialog';
import { AccountDialog } from './components/AccountDialog';
import { useAccount } from './lib/useAccount';
import './components/Account.css';
import { catalog } from './data/catalog';
import { editableRecord, equipmentRows, toggleEquipment } from './lib/weaponCatalog';
import { mergeObservations } from './lib/model';
import type { Equipment, Inventory } from './lib/model';
import { downloadFile, inventoryCsv, relicsCsv, STORAGE_KEY } from './lib/storage';
import { MAX_RELIC_QUANTITY } from './lib/relics';
import weaponsIcon from './assets/warframe/weapons.png';
import warframesIcon from './assets/warframe/warframes.png';
import relicsIcon from './assets/warframe/relics.png';

type Page = 'weapons' | 'warframes' | 'relics' | 'droptables' | 'import';
const pageNames: Record<Page, string> = { weapons: 'Weapons', warframes: 'Warframes', relics: 'Relics', droptables: 'Drop Tables', import: 'Screenshot import' };
const collectionTabs = [{ key: 'weapons', icon: weaponsIcon }, { key: 'warframes', icon: warframesIcon }, { key: 'relics', icon: relicsIcon }, { key: 'droptables', icon: '' }] as const;

function pageFromHash(): Page {
  const value = location.hash.slice(1).split('?')[0];
  return Object.keys(pageNames).includes(value) ? value as Page : 'weapons';
}

export default function App() {
  const account = useAccount();
  const inventory = account.profile.inventory;
  const commit = (next: Inventory) => { const saved = account.commitInventory(next); if (saved) inventoryRef.current = next; return saved; };
  const [accountOpen, setAccountOpen] = useState<'login' | 'register' | null>(null);
  const inventoryRef = useRef(inventory); inventoryRef.current = inventory;
  const [page, setPage] = useState<Page>(pageFromHash);
  const equipmentLabel = page === 'weapons' ? 'weapon' : 'equipment';
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('arsenal.theme') || 'dark'; } catch { return 'dark'; } });
  const [notice, setNotice] = useState('');
  const dropActions = useRef<DropTableActions>(null);
  const collectionActions = useRef<CollectionActions>(null);

  useEffect(() => {
    const hashChange = () => setPage(pageFromHash());
    hashChange();
    window.addEventListener('hashchange', hashChange);
    return () => window.removeEventListener('hashchange', hashChange);
  }, []);
  useEffect(() => { setEditing(null); }, [account.user?.id]);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('arsenal.theme', theme); } catch { /* Inventory saving reports its own failures. */ } }, [theme]);
  const navigate = (destination: Page) => { setPage(destination); location.hash = destination; };
  const exportCsv = () => { downloadFile(`grakata-inventory-${new Date().toISOString().slice(0, 10)}.csv`, inventoryCsv(equipmentRows(inventoryRef.current.items, catalog)), 'text/csv;charset=utf-8'); setNotice('Inventory CSV downloaded.'); };
  const exportRelics = () => { downloadFile(`grakata-relics-${new Date().toISOString().slice(0, 10)}.csv`, relicsCsv(inventoryRef.current.relics ?? []), 'text/csv;charset=utf-8'); setNotice('Relics CSV downloaded.'); };
  const commands: Command[] = [
    ...(['weapons', 'warframes', 'relics'].includes(page) ? [{ label: `Add ${page === 'relics' ? 'relic' : equipmentLabel}`, keys: ['Alt', 'N'], run: () => collectionActions.current?.add() }] : []),
    { label: 'Import screenshots', keys: ['Alt', 'I'], run: () => navigate('import') },
    { label: page === 'droptables' ? 'Export filtered drop tables CSV' : page === 'relics' ? 'Export relics CSV' : 'Export inventory CSV', keys: ['Alt', 'E'], run: page === 'droptables' ? () => dropActions.current?.exportCsv() : page === 'relics' ? exportRelics : exportCsv },
    { label: 'Toggle theme', keys: ['Alt', 'Shift', 'T'], run: () => setTheme(value => value === 'dark' ? 'light' : 'dark') },
    { label: 'Keyboard shortcuts', keys: ['Alt', '/'], run: () => setShortcuts(true) },
  ];
  const destinations: Command[] = collectionTabs.map(({ key }, index) => ({ label: pageNames[key], keys: ['Alt', String(index + 1)], run: () => navigate(key) }));
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandler.current = event => {
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'k' || event.ctrlKey && event.code === 'Space')) { if (palette || !document.querySelector('dialog[open]')) { event.preventDefault(); setPalette(value => !value); } return; }
    if ((event.target as HTMLElement)?.closest('input, textarea, [role="combobox"], [contenteditable], dialog') || !event.altKey) return;
    const key = event.key.toLowerCase();
    const command = [...commands, ...destinations].find(option => option.keys.at(-1)?.toLowerCase() === key && option.keys.includes('Shift') === event.shiftKey);
    if (command) { event.preventDefault(); command.run(); }
    if (key === 'j') { event.preventDefault(); setPalette(true); }
  };
  useEffect(() => { const handle = (event: KeyboardEvent) => keyHandler.current(event); window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle); }, []);

  const relics = inventory.relics ?? [];
  const nav = <nav className="collection-nav" aria-label="Main navigation"><ul>
    {collectionTabs.map(({ key, icon }, index) => <li key={key}><a href={`#${key}`} aria-current={page === key ? 'page' : undefined} aria-keyshortcuts={`Alt+${index + 1}`} title={`${pageNames[key]} (Alt+${index + 1})`} onClick={event => { event.preventDefault(); navigate(key); }}><span className="nav-icon" aria-hidden="true" style={key === 'droptables' ? { background: 'none' } : { maskImage: `url(${icon})` }}>{key === 'droptables' && <Table2 size={20} />}</span><span>{pageNames[key]}</span></a></li>)}
    </ul></nav>;
  const visibleItems = useMemo(() => equipmentRows(inventory.items, catalog, true).filter(item => page === 'warframes' ? item.slot === 'Warframe' : item.slot !== 'Warframe'), [inventory.items, page]);
  const isInventory = page === 'weapons' || page === 'warframes';
  return <div className="app-shell">
    <div className="content-shell"><header className="topbar">{nav}<div className="topbar-right"><div className="page-utilities"><button type="button" className="search-launcher" aria-label="Open search and commands" aria-keyshortcuts="Control+k Meta+k Control+Space" onClick={() => setPalette(true)}><Search size={15} /></button><button type="button" className="icon-button theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button><div className="account-actions"><button type="button" className={`button account-button ${account.user ? 'secondary' : 'account-sign-in'}`} aria-label={account.user ? `Account: ${account.user.username}` : 'Sign in'} aria-haspopup="dialog" disabled={account.checking} onClick={() => setAccountOpen('login')}><UserRound size={16} /><span>{account.user?.username ?? 'Sign in'}</span></button>{!account.user && <button type="button" className="button secondary" aria-haspopup="dialog" disabled={account.checking} onClick={() => setAccountOpen('register')}>Create account</button>}</div></div></div></header>
      <main id="main-content" className={page === 'import' ? 'import-page' : undefined}>
        {account.user && <div className="account-save-status" role="status" aria-label="Save status">{account.error && account.dirty ? 'Unsaved changes' : account.saving || account.dirty ? 'Saving…' : 'Saved'}</div>}
        {account.error && <div className="callout danger" role="alert">{account.error}<div className="account-error-actions">{account.unreadable && <button type="button" className="button secondary" onClick={() => { try { downloadFile('grakata-original-data.txt', localStorage.getItem(STORAGE_KEY) || '', 'text/plain'); } catch { setNotice('Browser storage is unavailable.'); } }}>Download original data</button>}{account.user && <><button type="button" className="button secondary" disabled={account.saving} onClick={() => void account.retrySave()}>Try saving again</button><button type="button" className="button secondary" onClick={() => downloadFile('grakata-unsaved-profile.json', JSON.stringify(account.profile, null, 2), 'application/json')}>Download changes</button><button type="button" className="button quiet" disabled={account.saving} onClick={() => void account.reloadSaved()}>Discard changes and reload saved data</button></>}</div></div>}
        {notice && <div className="callout info inline-notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss notification" title="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {isInventory && <InventoryTable key={`${page}:${account.user?.id ?? 'guest'}`} weapons={page === 'weapons'} ownedOnlyDefault={Boolean(account.user)} items={visibleItems} onEdit={row => setEditing(editableRecord(row))} onToggle={(item, field) => commit({ ...inventoryRef.current, items: toggleEquipment(inventoryRef.current.items, item, field) })} onAdd={() => setEditing('new')} onImport={() => navigate('import')} onExport={exportCsv} actionsRef={collectionActions} />}
        {page === 'relics' && <Relics key={account.user?.id ?? 'guest'} relics={relics} onExport={exportRelics} actionsRef={collectionActions} onSave={relic => {
          const current = inventoryRef.current;
          const existing = current.relics ?? [];
          return commit({ ...current, relics: existing.some(entry => entry.id === relic.id) ? existing.map(entry => entry.id === relic.id ? relic : entry) : [...existing, relic] });
        }} onDelete={id => commit({ ...inventoryRef.current, relics: (inventoryRef.current.relics ?? []).filter(relic => relic.id !== id) })} onQuantityChange={(id, change) => {
          const current = inventoryRef.current;
          commit({ ...current, relics: (current.relics ?? []).map(relic => relic.id === id ? { ...relic, quantity: Math.max(0, Math.min(MAX_RELIC_QUANTITY, relic.quantity + change)), updatedAt: new Date().toISOString() } : relic) });
        }} />}
        {page === 'import' && <ScreenshotImport onImport={(observations, files) => {
          const merged = mergeObservations(inventoryRef.current.items, observations);
          const next = { ...inventoryRef.current, items: merged.items, imports: [{ id: crypto.randomUUID(), date: new Date().toISOString(), files, added: merged.added, updated: merged.updated }, ...inventoryRef.current.imports].slice(0, 100) };
          if (!commit(next)) return false;
          navigate('weapons');
          return true;
        }} />}
        {page === 'droptables' && <DropTables actionsRef={dropActions} savedViews={account.profile.dropViews} savedViewsError={account.viewsError} canSave={Boolean(account.user)} onSaveViews={account.commitViews} onSignIn={() => setAccountOpen('login')} />}
      </main>
    </div>
    {editing && <EquipmentForm weapons={page === 'weapons'} item={editing === 'new' ? undefined : editing} existing={inventory.items} onClose={() => setEditing(null)} onSave={item => { const current = inventoryRef.current; const exists = current.items.some(entry => entry.id === item.id); if (commit({ ...current, items: exists ? current.items.map(entry => entry.id === item.id ? item : entry) : [...current.items, item] })) { setEditing(null); setNotice(`${item.name} ${exists ? 'updated' : 'added'}.`); return true; } return false; }} onDelete={id => { if (commit({ ...inventoryRef.current, items: inventoryRef.current.items.filter(item => item.id !== id) })) { setEditing(null); setNotice(`${page === 'weapons' ? 'Weapon' : 'Equipment'} entry removed.`); return true; } return false; }} />}
    {palette && <Commands commands={commands} destinations={destinations} onClose={() => setPalette(false)} />}
    {accountOpen && <AccountDialog initialMode={accountOpen} user={account.user} dirty={account.dirty} canIncludeCurrent={account.canIncludeCurrent} onAuthenticate={account.authenticate} onReplaceAccessKey={account.replaceAccessKey} onSignOut={account.signOut} onClose={() => setAccountOpen(null)} />}
    {shortcuts && <Dialog title="Keyboard shortcuts" onClose={() => setShortcuts(false)}><dl className="shortcut-list"><div><dt>Search and commands</dt><dd><kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd> / <kbd>Ctrl</kbd> + <kbd>Space</kbd></dd></div>{[...commands, ...destinations].map(command => <div key={command.label}><dt>{command.label}</dt><dd>{command.keys.map(key => <kbd key={key}>{key}</kbd>)}</dd></div>)}<div><dt>Column actions</dt><dd><kbd>Shift</kbd> + <kbd>F10</kbd></dd></div><div><dt>Move between {page === 'droptables' ? 'reward' : equipmentLabel} rows</dt><dd><kbd>↑</kbd><kbd>↓</kbd></dd></div><div><dt>Open selected {page === 'droptables' ? 'reward' : equipmentLabel}</dt><dd><kbd>Enter</kbd><kbd>Space</kbd></dd></div></dl></Dialog>}
  </div>;
}
