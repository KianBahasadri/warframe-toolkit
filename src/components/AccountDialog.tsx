import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../lib/account';
import type { AccountUser } from '../lib/account';

export function AccountDialog({ user, canIncludeCurrent, dirty, onAuthenticate, onSignOut, onClose }: { user: AccountUser | null; canIncludeCurrent: boolean; dirty: boolean; onAuthenticate: (mode: 'login' | 'register', username: string, password: string, includeCurrent: boolean) => Promise<void>; onSignOut: () => Promise<void>; onClose: () => void }) {
  const [mode, setMode] = useState<'account' | 'login' | 'register'>(user ? 'account' : 'login');
  const [username, setUsername] = useState(user?.username ?? ''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [includeCurrent, setIncludeCurrent] = useState(canIncludeCurrent);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const usernameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mode !== 'account') usernameInput.current?.focus(); }, [mode]);
  const close = () => { if (!busy) onClose(); };
  return <Dialog title={mode === 'account' ? 'Account' : mode === 'register' ? 'Create account' : 'Sign in'} onClose={close} className="account-dialog">
    {mode === 'account' ? <>
      <p className="account-username">{user!.username}</p>
      <p className="muted small">{dirty ? 'You have unsaved changes.' : 'Your inventory and saved views belong to this account.'}</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="dialog-footer"><button type="button" className="button quiet" disabled={busy} onClick={() => { setMode('login'); setError(''); }}>Sign in again</button><button type="button" className="button secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onSignOut(); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{busy ? 'Signing out…' : 'Sign out'}</button></div>
    </> : <form className="account-form" onSubmit={async event => {
      event.preventDefault(); setError('');
      if (mode === 'register' && password !== confirmation) { setError('Passwords do not match.'); return; }
      setBusy(true);
      try { await onAuthenticate(mode, username, password, includeCurrent); onClose(); }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not sign in. Please try again.'); }
      finally { setBusy(false); }
    }}>
      <label>Warframe username<input ref={usernameInput} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required value={username} readOnly={Boolean(user && dirty)} onChange={event => setUsername(event.target.value)} disabled={busy} /></label>
      <label>Password<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? MIN_PASSWORD_LENGTH : undefined} maxLength={MAX_PASSWORD_LENGTH} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} aria-describedby={mode === 'register' ? 'account-password-help' : undefined} /></label>
      {mode === 'register' && <>
        <p id="account-password-help" className="muted small">Choose a new password for this toolkit with at least {MIN_PASSWORD_LENGTH} characters.</p>
        <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" maxLength={MAX_PASSWORD_LENGTH} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label>
        {canIncludeCurrent && <label className="check-row"><input type="checkbox" checked={includeCurrent} onChange={event => setIncludeCurrent(event.target.checked)} disabled={busy} /><span>Save my current inventory and views to this account</span></label>}
      </>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="dialog-footer"><button type="button" className="button quiet" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setPassword(''); setConfirmation(''); setError(''); }}>{mode === 'login' ? 'Create account' : 'Sign in instead'}</button><button type="submit" className="button primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button></div>
    </form>}
  </Dialog>;
}
