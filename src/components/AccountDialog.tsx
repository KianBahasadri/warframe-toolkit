import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Languages, LogOut, RefreshCw, Share2, UserRound } from 'lucide-react';
import { Dialog } from './Dialog';
import { shareInventoryLink } from '../lib/account';
import type { AccountUser } from '../lib/account';
import { ClerkAuthForm, useClerkAuth } from '../lib/clerk';
import { LANGUAGES, t, useLanguage } from '../lib/i18n';

export type AccountDialogMode = 'account' | 'login' | 'register' | 'share';

export function AccountActions({ user, checking, dialogOpen, onOpen, onSignOut }: {
  user: AccountUser | null;
  checking: boolean;
  dialogOpen: boolean;
  onOpen: (mode: AccountDialogMode, initialError?: string) => void;
  onSignOut: () => Promise<void>;
}) {
  const [language, setLanguage] = useLanguage();
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'language'>('menu');
  const closing = useRef<number>(undefined);
  const pendingFocus = useRef<'first' | 'last' | 'checked' | 'language' | null>(null);
  const clearCloseTimer = () => window.clearTimeout(closing.current);
  const dismiss = () => { clearCloseTimer(); pendingFocus.current = null; setOpen(false); setView('menu'); };
  const menuItems = () => menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]');
  const focusItem = (end: 'first' | 'last') => {
    const buttons = menuItems();
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
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    if (pending === 'checked') menu.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus({ preventScroll: true });
    else if (pending === 'language') menu.current?.querySelector<HTMLButtonElement>('[data-account-action="language"]')?.focus({ preventScroll: true });
    else focusItem(pending);
  }, [open, view]);

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
    <button type="button" className="button account-button account-sign-in" aria-label={t('Sign in')} aria-haspopup="dialog" disabled={checking} onClick={() => onOpen('login')}><UserRound size={16} /><span>{t('Sign in')}</span></button>
    <button type="button" className="button secondary" aria-haspopup="dialog" disabled={checking} onClick={() => onOpen('register')}>{t('Create account')}</button>
  </div>;

  return <div ref={root} className="account-actions" onPointerEnter={event => {
    if (event.pointerType === 'touch' || checking || dialogOpen) return;
    clearCloseTimer(); setOpen(true);
  }} onPointerLeave={() => {
    clearCloseTimer();
    if (!menu.current?.contains(document.activeElement)) closing.current = window.setTimeout(dismiss, 200);
  }}>
    <button ref={trigger} type="button" className="button account-button secondary" aria-label={t(`Account: ${user.username}`)} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={checking}
      onClick={() => { dismiss(); onOpen('account'); }}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault(); clearCloseTimer();
        const end = event.key === 'ArrowUp' ? 'last' : 'first';
        if (open) focusItem(end);
        else { pendingFocus.current = end; setOpen(true); }
      }}><UserRound size={16} /><span>{user.username}</span></button>
    {open && <div ref={menu} id={id} role="menu" aria-label={t('Account options')} className="craft-plan-menu account-menu" tabIndex={-1} onKeyDown={event => {
      if (event.key === 'Tab') { closing.current = window.setTimeout(dismiss, 0); return; }
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
      {view === 'language' ? <>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => { pendingFocus.current = 'language'; setView('menu'); }}><ArrowLeft size={15} /><span>{t('Change language')}</span></button>
        <div className="account-menu-divider" role="separator" />
        {LANGUAGES.map(option => <button key={option.code} type="button" role="menuitemradio" aria-checked={language === option.code} tabIndex={-1} onClick={() => setLanguage(option.code)}><span>{option.label}</span><Check size={14} aria-hidden="true" className={language === option.code ? undefined : 'select-check-hidden'} /></button>)}
      </> : <>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => { dismiss(); onOpen('share'); }}><Share2 size={15} /><span>{t('Share inventory')}</span></button>
        <button type="button" role="menuitem" data-account-action="language" tabIndex={-1} onClick={() => { pendingFocus.current = 'checked'; setView('language'); }}><Languages size={15} /><span>{t('Change language')}</span></button>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => { dismiss(); void onSignOut().catch(error => onOpen('account', (error as Error).message)); }}><LogOut size={15} /><span>{t('Sign out')}</span></button>
      </>}
    </div>}
  </div>;
}

type Props = {
  user: AccountUser | null;
  initialMode: AccountDialogMode;
  initialError?: string;
  dirty: boolean;
  checking: boolean;
  accountError: string;
  onShareInventory: (replace?: boolean) => Promise<string>;
  onSignOut: () => Promise<void>;
  onClose: () => void;
};

export function AccountDialog({ user, initialMode, initialError, dirty, checking, accountError, onShareInventory, onSignOut, onClose }: Props) {
  const languageLabel = useId();
  const [language, setLanguage] = useLanguage();
  const clerk = useClerkAuth();
  const [mode, setMode] = useState<AccountDialogMode>(() => user ? (initialMode === 'login' || initialMode === 'register' ? 'account' : initialMode) : (initialMode === 'register' ? 'register' : 'login'));
  const [shareToken, setShareToken] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(initialError ?? ''), [copied, setCopied] = useState('');
  const shareInput = useRef<HTMLInputElement>(null);
  const authStartVersion = useRef(clerk.sessionVersion);
  const wasAuthenticated = useRef(Boolean(user && !dirty && !accountError));
  const needsUser = mode === 'account' || mode === 'share';

  useEffect(() => {
    if (needsUser && !user) onClose();
  }, [needsUser, user, onClose]);

  useEffect(() => {
    if (mode !== 'login' && mode !== 'register') return;
    const nowAuthenticated = Boolean(user && !checking && !dirty && !accountError);
    if ((!wasAuthenticated.current && nowAuthenticated) || (clerk.sessionVersion > authStartVersion.current && nowAuthenticated)) {
      onClose();
    }
  }, [mode, user, checking, dirty, accountError, clerk.sessionVersion, onClose]);

  useEffect(() => {
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
  const close = () => {
    if (busy) return;
    onClose();
  };
  const copy = async (value: string, label: string) => {
    setError('');
    try { await navigator.clipboard.writeText(value); setCopied(t(`${label} copied.`)); }
    catch { setError(t('Could not copy. Select and copy the text instead.')); }
  };
  // Clerk can clear the user before its asynchronous sign-out finishes.
  if (needsUser && !user) return null;
  const shareLink = shareToken ? shareInventoryLink(location.href, shareToken) : '';
  const title = t(mode === 'share' ? 'Share inventory' : mode === 'account' ? 'Account' : mode === 'register' ? 'Create account' : 'Sign in');
  const feedback = <>{error && <p className="error-text" role="alert">{error}</p>}{copied && <p className="muted small" role="status">{copied}</p>}</>;
  return <Dialog title={title} onClose={close} className="account-dialog">
    {mode === 'share' ? <div className="account-form">
      <p className="muted small">{t('Anyone with this link can view your live saved inventory.')}</p>
      <label>{t('Shareable link')}<input ref={shareInput} className="account-secret" readOnly autoComplete="off" spellCheck={false} value={shareLink} placeholder={busy ? t('Loading link…') : ''} onFocus={event => event.target.select()} /></label>
      <div className="account-key-actions">
        <button type="button" className="button secondary" disabled={busy || !shareLink} onClick={() => void copy(shareLink, 'Share link')}><Copy size={15} />{t('Copy link')}</button>
        <button type="button" className="button secondary" disabled={busy || !shareLink} onClick={async () => {
          setBusy(true); setError(''); setCopied('');
          try {
            setShareToken(await onShareInventory(true));
            setCopied(t('New share link generated. Previous link disabled.'));
          } catch (error) { setError((error as Error).message); }
          finally { setBusy(false); }
        }}><RefreshCw size={15} />{busy && shareToken ? t('Generating…') : t('Generate new link')}</button>
      </div>
      <p className="muted small">{t('Generating a new link replaces your current link, and the old link will stop working.')}</p>
      {feedback}
      <div className="dialog-footer">
        <button type="button" className="button quiet" disabled={busy} onClick={() => { setMode('account'); setError(''); setCopied(''); }}>{t('Back')}</button>
        <button type="button" className="button primary" disabled={busy} onClick={close}>{t('Done')}</button>
      </div>
    </div> : mode === 'account' ? <>
      <p className="account-username">{user!.username}</p>
      <p className="muted small">{t(dirty ? 'You have unsaved changes.' : 'Your inventory, views, crafting plans, and arsenals belong to this account.')}</p>
      <div className="account-option-list">
        <button type="button" className="button secondary" disabled={busy} onClick={() => { setMode('share'); setError(''); setCopied(''); }}><Share2 size={15} />{t('Share inventory')}</button>
      </div>
      <div className="account-language">
        <span id={languageLabel}>{t('Language')}</span>
        <div role="radiogroup" aria-labelledby={languageLabel} onKeyDown={event => {
          if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
          const index = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
          const next = buttons[(index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length];
          next?.focus(); next?.click();
        }}>
          {LANGUAGES.map(option => <button key={option.code} type="button" role="radio" aria-checked={language === option.code} onClick={() => setLanguage(option.code)}>{option.label}</button>)}
        </div>
      </div>
      {feedback}
      <div className="dialog-footer"><button type="button" className="button quiet" disabled={busy} onClick={() => { authStartVersion.current = clerk.sessionVersion; wasAuthenticated.current = false; setMode('login'); setError(''); }}>{t('Sign in again')}</button><button type="button" className="button secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onSignOut(); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{busy ? t('Signing out…') : t('Sign out')}</button></div>
    </> : <div className="account-form">
      <ClerkAuthForm mode={mode} />
      {feedback}
      <div className="dialog-footer"><button type="button" className="button quiet" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{t(mode === 'login' ? 'Create account' : 'Sign in instead')}</button></div>
    </div>}
  </Dialog>;
}
