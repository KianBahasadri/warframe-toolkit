import { useCallback, useEffect, useRef, useState } from 'react';
import { accountUsername, emptyProfile, isShareToken, validateProfile } from './account';
import type { AccountProfile, AccountSession, AccountUser, SavedDropView } from './account';
import { useClerkAuth } from './clerk';
import type { Inventory } from './model';
import type { CraftingPlan } from './crafting';
import type { ArsenalBuild } from './modderModel';
import { validateInventory } from './storage';

type State = { user: AccountUser | null; profile: AccountProfile; revision: number; checking: boolean; dirty: boolean; saving: boolean; error: string };

function guestState(): State {
  return { user: null, profile: emptyProfile(), revision: 0, checking: true, dirty: false, saving: false, error: '' };
}

async function request(path: string, options: { body?: unknown; method?: string; token?: string | null; username?: string | null } = {}) {
  const { body, method = 'POST', token, username } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Toolkit-Request': '1' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (username) headers['X-Clerk-Username'] = encodeURIComponent(username);
  const response = await fetch(`/api/account/${path}`, {
    method: body === undefined ? 'GET' : method,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not reach your account. Please try again.');
  return result;
}
function checkedSession(value: unknown): AccountSession {
  const session = value as AccountSession;
  if (!session?.user || typeof session.user.id !== 'string' || typeof session.user.username !== 'string' || !Number.isSafeInteger(session.revision) || session.revision < 0) throw new Error('Could not read the account response. Your current data has been kept.');
  return { user: session.user, profile: validateProfile(session.profile), revision: session.revision };
}
const message = (error: unknown) => error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError' ? error.message : 'Could not reach your account. Your changes are still here; try saving again.';

export function useAccount() {
  const clerk = useClerkAuth();
  const clerkRef = useRef(clerk);
  clerkRef.current = clerk;
  const [state, setState] = useState(guestState);
  const current = useRef(state), guest = useRef<State>({ ...guestState(), checking: false });
  const authVersion = useRef(0);
  const pending = useRef<Promise<void> | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const update = useCallback((patch: Partial<State>) => { current.current = { ...current.current, ...patch }; setState(current.current); }, []);

  const save = useCallback((): Promise<void> => {
    if (pending.current) return pending.current;
    const run = async () => {
      while (current.current.user && current.current.dirty) {
        const before = current.current;
        update({ saving: true, error: '' });
        try {
          const token = await clerkRef.current.getToken();
          const result = await request('profile', {
            body: { accountId: before.user!.id, revision: before.revision, profile: before.profile },
            method: 'PUT',
            token,
            username: clerkRef.current.username ?? before.user!.username,
          });
          if (!Number.isSafeInteger(result.revision) || result.revision !== before.revision + 1) throw new Error('Could not confirm your save. Your changes are still here.');
          update({ revision: result.revision, dirty: current.current.profile !== before.profile });
        } catch (error) { update({ error: message(error) }); break; }
      }
      update({ saving: false });
    };
    pending.current = run().finally(() => { pending.current = null; });
    return pending.current;
  }, [update]);

  useEffect(() => {
    if (!clerk.isLoaded) return;
    let active = true;
    const version = ++authVersion.current;
    if (!clerk.isSignedIn || !clerk.userId) {
      if (current.current.user) {
        if (current.current.dirty) {
          update({ checking: false, error: current.current.error || 'Sign in to save your changes.' });
        } else {
          update({ ...guest.current, user: null, checking: false, dirty: false, saving: false, error: '' });
        }
        return;
      }
      void request('session').then(result => {
        if (!active || version !== authVersion.current || !current.current.checking) return;
        if (result.user) update({ ...checkedSession(result), checking: false, error: '' });
        else update({ checking: false });
      }).catch(error => {
        if (active && version === authVersion.current && current.current.checking) update({ checking: false, error: current.current.error || message(error) });
      });
      return () => { active = false; };
    }

    const before = current.current;
    if (before.user && before.dirty && before.user.id !== clerk.userId) {
      update({ checking: false, error: 'Save or download your changes before switching accounts.' });
      return;
    }
    update({ checking: true });
    void (async () => {
      try {
        const token = await clerk.getToken();
        const response = await request('session', { token, username: clerk.username });
        if (!active || version !== authVersion.current) return;
        const result = checkedSession(response);
        if (!before.user) guest.current = { ...before, checking: false };
        if (before.user?.id === result.user.id && before.dirty) {
          update({ user: result.user, revision: result.revision, error: '', checking: false });
          await save();
        } else {
          update({ ...result, checking: false, dirty: false, saving: false, error: '' });
        }
      } catch (error) {
        if (active && version === authVersion.current) update({ checking: false, error: message(error) });
      }
    })();
    return () => { active = false; };
  }, [clerk.isLoaded, clerk.isSignedIn, clerk.userId, clerk.username, clerk.sessionVersion, save, update]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (current.current.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); clearTimeout(timer.current); };
  }, []);

  const commit = (profile: AccountProfile, saveDelay = 150): boolean => {
    if (current.current.checking) { update({ error: 'Please wait while sign-in is checked.' }); return false; }
    update({ profile, dirty: true, error: '' });
    if (!current.current.user) guest.current = { ...current.current, checking: false };
    else { clearTimeout(timer.current); timer.current = setTimeout(() => void save(), saveDelay); }
    return true;
  };
  const shareInventory = useCallback(async (replace = false): Promise<string> => {
    clearTimeout(timer.current); await save();
    if (current.current.dirty) throw new Error('Your changes have not been saved. Try saving again before sharing.');
    const token = await clerkRef.current.getToken();
    const response = await request('share', {
      body: { accountId: current.current.user?.id, ...(replace ? { replace: true } : {}) },
      token,
      username: clerkRef.current.username ?? current.current.user?.username,
    });
    if (!isShareToken(response.shareToken)) throw new Error('Could not read your share link. Please try again.');
    return response.shareToken;
  }, [save]);
  const signOut = async () => {
    clearTimeout(timer.current); await save();
    if (current.current.dirty) throw new Error('Your changes have not been saved. Try saving again before signing out.');
    await clerkRef.current.signOut();
    update({ ...guest.current, user: null, checking: false, saving: false, dirty: false, error: '' });
  };
  const reloadSaved = async () => {
    try {
      clearTimeout(timer.current); await pending.current;
      const before = current.current.profile;
      const token = await clerkRef.current.getToken();
      const result = checkedSession(await request('session', { token, username: clerkRef.current.username ?? current.current.user?.username }));
      if (result.user.id !== current.current.user?.id) throw new Error('Sign in to the same account to load its saved data.');
      if (before !== current.current.profile) throw new Error('You made new changes while loading. Your current changes have been kept.');
      update({ ...result, dirty: false, error: '' });
    } catch (error) { update({ error: message(error) }); }
  };
  return {
    ...state,
    shareInventory,
    signOut,
    retrySave: save,
    reloadSaved,
    commitInventory: (inventory: Inventory, saveDelay?: number) => commit({ ...current.current.profile, inventory }, saveDelay),
    commitViews: (dropViews: SavedDropView[]) => current.current.user ? commit({ ...current.current.profile, dropViews }) : false,
    commitCrafting: (craftingPlans: CraftingPlan[]) => commit({ ...current.current.profile, craftingPlans }),
    commitArsenals: (arsenals: ArsenalBuild[]) => commit({ ...current.current.profile, arsenals }, 400),
  };
}

export async function fetchSharedInventory(shareToken: string): Promise<{ username: string; inventory: Inventory }> {
  const result = await request(`share/${encodeURIComponent(shareToken)}`);
  return { username: accountUsername(result.username).username, inventory: validateInventory(result.inventory) };
}
