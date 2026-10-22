import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Download, KeyRound, Link, LogOut, RefreshCw, Share2, UserRound } from 'lucide-react';
import { Dialog } from './Dialog';
import { accessKeyLink, shareInventoryLink } from '../lib/account';
import type { AccountUser } from '../lib/account';
import { downloadFile } from '../lib/storage';

export type AccountDialogMode = 'account' | 'login' | 'register' | 'share' | 'replace';

export function AccountActions({ user, checking, dialogOpen, onOpen, onSignOut }: {
  user: AccountUser | null;
  checking: boolean;
  dialogOpen: boolean;
  onOpen: (mode: AccountDialogMode, initialError?: string) => void;
  onSignOut: () => Promise<void>;
}) {
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const closing = useRef<number>(undefined);
  const pendingFocus = useRef<'first' | 'last' | null>(null);
  const clearCloseTimer = () => window.clearTimeout(closing.current);
  const dismiss = () => { clearCloseTimer(); pendingFocus.current = null; setOpen(false); };
  const focusItem = (end: 'first' | 'last') => {
    const buttons = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    const target = (end === 'first' ? buttons?.[0] : buttons?.[buttons.length - 1]) ?? menu.current;
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'nearest' });
  };

  useEffect(() => () => clearCloseTimer(), []);
  useEffect(() => { if (!user || dialogOpen) dismiss(); }, [user, dialogOpen]);

  useLayoutEffect(() => {
    if (!open || !user || !menu.current || !trigger.current) return;
    const panel = menu.current, anchor = trigger.current;
    const position = () => {
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? document.documentElement.clientWidth, height = viewport?.height ?? innerHeight;
      const bounds = anchor.getBoundingClientRect();
      if (bounds.bottom <= top || bounds.top >= top + height) { dismiss(); return; }
      panel.style.maxWidth = `${Math.max(0, width - 24)}px`;
      panel.style.maxHeight = `${Math.max(0, Math.min(360, top + height - bounds.bottom - 16))}px`;
      panel.style.left = `${Math.max(left + 12, Math.min(bounds.left, left + width - panel.offsetWidth - 12))}px`;
      panel.style.top = `${bounds.bottom + 4}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(anchor); observer.observe(panel);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open, user]);

  useLayoutEffect(() => {
    if (!open || !pendingFocus.current) return;
    focusItem(pendingFocus.current); pendingFocus.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { if (!root.current?.contains(event.target as Node)) dismiss(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); dismiss();
      if (root.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape, true); window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape, true); window.removeEventListener('blur', dismiss);
    };
  }, [open]);

  if (!user) return <div className="account-actions">
    <button type="button" className="button account-button account-sign-in" aria-label="Sign in" aria-haspopup="dialog" disabled={checking} onClick={() => onOpen('login')}><UserRound size={16} /><span>Sign in</span></button>
    <button type="button" className="button secondary" aria-haspopup="dialog" disabled={checking} onClick={() => onOpen('register')}>Create account</button>
  </div>;

  return <div ref={root} className="account-actions" onPointerEnter={event => {
    if (event.pointerType === 'touch' || checking || dialogOpen) return;
    clearCloseTimer(); setOpen(true);
  }} onPointerLeave={() => {
    clearCloseTimer();
    if (!menu.current?.contains(document.activeElement)) closing.current = window.setTimeout(dismiss, 200);
  }}>
    <button ref={trigger} type="button" className="button account-button secondary" aria-label={`Account: ${user.username}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={checking}
      onClick={() => { dismiss(); onOpen('account'); }}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault(); clearCloseTimer();
        const end = event.key === 'ArrowUp' ? 'last' : 'first';
        if (open) focusItem(end);
        else { pendingFocus.current = end; setOpen(true); }
      }}><UserRound size={16} /><span>{user.username}</span></button>
    {open && <div ref={menu} id={id} role="menu" aria-label="Account options" className="craft-plan-menu account-menu" tabIndex={-1} onKeyDown={event => {
      if (event.key === 'Tab') { closing.current = window.setTimeout(dismiss, 0); return; }
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { dismiss(); onOpen('share'); }}><Share2 size={15} /><span>Share inventory</span></button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { dismiss(); onOpen('replace'); }}><KeyRound size={15} /><span>Replace access key</span></button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { dismiss(); void onSignOut().catch(error => onOpen('account', (error as Error).message)); }}><LogOut size={15} /><span>Sign out</span></button>
    </div>}
  </div>;
}

type Props = {
  user: AccountUser | null;
  initialMode: AccountDialogMode;
  initialError?: string;
  canIncludeCurrent: boolean;
  dirty: boolean;
  onAuthenticate: (mode: 'login' | 'register', username: string, accessKey: string, includeCurrent: boolean) => Promise<string | undefined>;
  onReplaceAccessKey: () => Promise<string>;
  onShareInventory: (replace?: boolean) => Promise<string>;
  onSignOut: () => Promise<void>;
  onClose: () => void;
};

export function AccountDialog({ user, initialMode, initialError, canIncludeCurrent, dirty, onAuthenticate, onReplaceAccessKey, onShareInventory, onSignOut, onClose }: Props) {
  const [mode, setMode] = useState<'account' | 'login' | 'register' | 'key' | 'replace' | 'share'>(() => user ? (initialMode === 'login' || initialMode === 'register' ? 'account' : initialMode) : (initialMode === 'register' ? 'register' : 'login'));
  const [username, setUsername] = useState(user?.username ?? ''), [credential, setCredential] = useState('');
  const [issuedKey, setIssuedKey] = useState(''), [keySaved, setKeySaved] = useState(false);
  const [shareToken, setShareToken] = useState('');
  const [includeCurrent, setIncludeCurrent] = useState(canIncludeCurrent);
  const [busy, setBusy] = useState(false), [error, setError] = useState(initialError ?? ''), [copied, setCopied] = useState('');
  const usernameInput = useRef<HTMLInputElement>(null), keyInput = useRef<HTMLInputElement>(null), shareInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode === 'login' || mode === 'register') usernameInput.current?.focus();
    if (mode === 'key') keyInput.current?.focus();
    if (mode === 'share' && shareToken) shareInput.current?.focus();
  }, [mode, shareToken]);
  useEffect(() => {
    if (mode !== 'share' || shareToken) return;
    let active = true;
    setBusy(true); setError('');
    void onShareInventory(false).then(
      token => { if (active) { setShareToken(token); setBusy(false); } },
      err => { if (active) { setError(err instanceof Error ? err.message : 'Could not load share link.'); setBusy(false); } },
    );
    return () => { active = false; };
  }, [mode, shareToken, onShareInventory]);
  useEffect(() => {
    if (!issuedKey || keySaved) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [issuedKey, keySaved]);
  const close = () => {
    if (busy) return;
    if (issuedKey && !keySaved) { setError('Save your key or sign-in link, then confirm below.'); return; }
    onClose();
  };
  const showKey = (key: string) => { setIssuedKey(key); setCredential(''); setKeySaved(false); setCopied(''); setError(''); setMode('key'); };
  const copy = async (value: string, label: string) => {
    setError('');
    try { await navigator.clipboard.writeText(value); setCopied(`${label} copied.`); }
    catch { setError('Could not copy. Select and copy the text instead.'); }
  };
  const signInLink = issuedKey ? accessKeyLink(location.href, user?.username ?? username, issuedKey) : '';
  const shareLink = shareToken ? shareInventoryLink(location.href, shareToken) : '';
  const title = mode === 'key' ? 'Save your access key' : mode === 'replace' ? 'Replace access key' : mode === 'share' ? 'Share inventory' : mode === 'account' ? 'Account' : mode === 'register' ? 'Create account' : 'Sign in';
  const feedback = <>{error && <p className="error-text" role="alert">{error}</p>}{copied && <p className="muted small" role="status">{copied}</p>}</>;
  return <Dialog title={title} onClose={close} className="account-dialog">
    {mode === 'key' ? <div className="account-form">
      <p className="muted small">Save your key or personal sign-in link. You’ll need one to sign in again; there is no email recovery.</p>
      <label>Warframe username<input readOnly value={user?.username ?? username} /></label>
      <label>Access key<input ref={keyInput} className="account-secret" readOnly autoComplete="off" spellCheck={false} value={issuedKey} onFocus={event => event.target.select()} /></label>
      <div className="account-key-actions">
        <button type="button" className="button secondary" onClick={() => void copy(issuedKey, 'Access key')}><Copy size={15} />Copy key</button>
        <button type="button" className="button secondary" onClick={() => downloadFile('grakata-access-key.txt', `Grakata\nUsername: ${user?.username ?? username}\nAccess key: ${issuedKey}\nSign-in link: ${signInLink}\n\nKeep this file private. Anyone with this key or link can access your account.\n`, 'text/plain;charset=utf-8')}><Download size={15} />Download key</button>
      </div>
      <label>Personal sign-in link<input className="account-secret" readOnly autoComplete="off" spellCheck={false} value={signInLink} onFocus={event => event.target.select()} /></label>
      <div className="account-key-actions">
        <button type="button" className="button secondary" onClick={() => void copy(signInLink, 'Sign-in link')}><Link size={15} />Copy sign-in link</button>
        <a className="account-bookmark" href={signInLink} draggable onClick={event => event.preventDefault()} aria-label="Drag personal sign-in link to bookmarks">Drag to bookmarks</a>
      </div>
      <p className="muted small">Add the link to your browser bookmarks to sign in automatically. Keep it private: anyone with the key or link can access your account.</p>
      <label className="check-row"><input type="checkbox" checked={keySaved} onChange={event => { setKeySaved(event.target.checked); setError(''); }} /><span>I have saved my key or sign-in link</span></label>
      {feedback}
      <div className="dialog-footer"><button type="button" className="button primary" disabled={!keySaved} onClick={close}>Done</button></div>
    </div> : mode === 'share' ? <div className="account-form">
      <p className="muted small">Anyone with this link can view your live saved inventory.</p>
      <label>Shareable link<input ref={shareInput} className="account-secret" readOnly autoComplete="off" spellCheck={false} value={shareLink} placeholder={busy ? 'Loading link…' : ''} onFocus={event => event.target.select()} /></label>
      <div className="account-key-actions">
        <button type="button" className="button secondary" disabled={busy || !shareLink} onClick={() => void copy(shareLink, 'Share link')}><Copy size={15} />Copy link</button>
        <button type="button" className="button secondary" disabled={busy || !shareLink} onClick={async () => {
          setBusy(true); setError(''); setCopied('');
          try {
            setShareToken(await onShareInventory(true));
            setCopied('New share link generated. Previous link disabled.');
          } catch (error) { setError((error as Error).message); }
          finally { setBusy(false); }
        }}><RefreshCw size={15} />{busy && shareToken ? 'Generating…' : 'Generate new link'}</button>
      </div>
      <p className="muted small">Generating a new link replaces your current link, and the old link will stop working.</p>
      {feedback}
      <div className="dialog-footer">
        <button type="button" className="button quiet" disabled={busy} onClick={() => { setMode('account'); setError(''); setCopied(''); }}>Back</button>
        <button type="button" className="button primary" disabled={busy} onClick={close}>Done</button>
      </div>
    </div> : mode === 'replace' ? <div className="account-form">
      <p className="muted small">Your current key and bookmarked sign-in links will stop working. Other devices will be signed out. Save the new key or link before closing.</p>
      {feedback}
      <div className="dialog-footer">
        <button type="button" className="button quiet" disabled={busy} onClick={() => { setMode('account'); setError(''); }}>Cancel</button>
        <button type="button" className="button primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { showKey(await onReplaceAccessKey()); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{busy ? 'Replacing…' : 'Replace key'}</button>
      </div>
    </div> : mode === 'account' ? <>
      <p className="account-username">{user!.username}</p>
      <p className="muted small">{dirty ? 'You have unsaved changes.' : 'Your inventory, views, crafting plans, and arsenals belong to this account.'}</p>
      <div className="account-option-list">
        <button type="button" className="button secondary" disabled={busy} onClick={() => { setMode('share'); setError(''); setCopied(''); }}><Share2 size={15} />Share inventory</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => { setMode('replace'); setError(''); setCopied(''); }}><KeyRound size={15} />Replace access key</button>
      </div>
      {feedback}
      <div className="dialog-footer"><button type="button" className="button quiet" disabled={busy} onClick={() => { setMode('login'); setError(''); }}>Sign in again</button><button type="button" className="button secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onSignOut(); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{busy ? 'Signing out…' : 'Sign out'}</button></div>
    </> : <form className="account-form" onSubmit={async event => {
      event.preventDefault(); setError(''); setBusy(true);
      try {
        const key = await onAuthenticate(mode, username, credential, includeCurrent);
        if (key) showKey(key); else { setCredential(''); onClose(); }
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not sign in. Please try again.'); }
      finally { setBusy(false); }
    }}>
      <label>Warframe username<input ref={usernameInput} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required value={username} readOnly={Boolean(user && dirty)} onChange={event => setUsername(event.target.value)} disabled={busy} /></label>
      {mode === 'login' ? <>
        <label>Access key<input name="accessKey" type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} maxLength={128} required value={credential} onChange={event => setCredential(event.target.value)} disabled={busy} /></label>
      </> : <>
        <p className="muted small">We’ll generate an access key for you to save. No password or email is needed. If you lose your key and sign-in link, there is no email recovery.</p>
        {canIncludeCurrent && <label className="check-row"><input type="checkbox" checked={includeCurrent} onChange={event => setIncludeCurrent(event.target.checked)} disabled={busy} /><span>Save my current inventory, views, crafting plans, and arsenals to this account</span></label>}
      </>}
      {feedback}
      <div className="dialog-footer"><button type="button" className="button quiet" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setCredential(''); setError(''); }}>{mode === 'login' ? 'Create account' : 'Sign in instead'}</button><button type="submit" className="button primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button></div>
    </form>}
  </Dialog>;
}
