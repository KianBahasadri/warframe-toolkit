import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { clerkDisplayName } from './account';
import { t } from './i18n';

export interface ClerkAuthState {
  configured: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  username: string | null;
  sessionVersion: number;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  openUserProfile: () => void;
}

const unconfiguredState: ClerkAuthState = {
  configured: false,
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  username: null,
  sessionVersion: 0,
  getToken: async () => null,
  signOut: async () => {},
  openUserProfile: () => {},
};

const ClerkAuthContext = createContext<ClerkAuthState>(unconfiguredState);

type DirectClerk = {
  loaded?: boolean;
  __authVersion?: number;
  user?: {
    id?: string;
    username?: string | null;
    fullName?: string | null;
    firstName?: string | null;
    primaryEmailAddress?: { emailAddress?: string | null } | null;
  } | null;
  session?: {
    id?: string;
    getToken?: () => Promise<string | null>;
  } | null;
  addListener?: (cb: () => void) => () => void;
  signOut?: () => Promise<void>;
  openUserProfile?: () => void;
};

function readWindowClerk(): { publishableKey?: string; Clerk?: DirectClerk } {
  if (typeof window === 'undefined') return {};
  const win = window as Window & { __clerk_publishable_key?: string; Clerk?: DirectClerk };
  return { publishableKey: win.__clerk_publishable_key, Clerk: win.Clerk };
}

function ClerkStateBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, sessionId, getToken, signOut } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const winClerk = readWindowClerk().Clerk;
    if (clerk.loaded || winClerk?.loaded) setTick(n => n + 1);
    const unsubIso = clerk.addListener(() => setTick(n => n + 1));
    const unsubWin = winClerk?.addListener ? winClerk.addListener(() => setTick(n => n + 1)) : undefined;
    return () => {
      unsubIso();
      unsubWin?.();
    };
  }, [clerk]);

  const winClerk = readWindowClerk().Clerk;
  const loaded = Boolean(isLoaded || clerk.loaded || winClerk?.loaded);
  const activeUser = user ?? clerk.user ?? winClerk?.user ?? null;
  const activeSession = clerk.session ?? winClerk?.session ?? null;
  const activeUserId = userId ?? activeUser?.id ?? null;
  const signedIn = Boolean((isSignedIn || activeSession) && activeUserId);

  const username = useMemo(() => {
    if (!activeUser) return null;
    return clerkDisplayName(
      activeUser.username,
      activeUser.fullName,
      activeUser.firstName,
      activeUser.primaryEmailAddress?.emailAddress,
    );
  }, [activeUser, tick]);

  const sessionVersion = useMemo(() => {
    return winClerk?.__authVersion ?? tick;
  }, [winClerk?.__authVersion, tick, sessionId, activeUserId, signedIn]);

  const value = useMemo<ClerkAuthState>(() => ({
    configured: true,
    isLoaded: loaded,
    isSignedIn: signedIn,
    userId: signedIn ? activeUserId : null,
    username: signedIn ? username : null,
    sessionVersion,
    getToken: async () => {
      try {
        const currentSession = clerk.session ?? readWindowClerk().Clerk?.session;
        if (currentSession?.getToken) return await currentSession.getToken();
        return await getToken();
      } catch {
        return null;
      }
    },
    signOut: async () => {
      const direct = readWindowClerk().Clerk;
      if (direct?.signOut && !clerk.loaded) await direct.signOut();
      else await clerk.signOut();
    },
    openUserProfile: () => { clerk.openUserProfile(); },
  }), [loaded, signedIn, activeUserId, username, sessionVersion, getToken, signOut, clerk]);

  return <ClerkAuthContext.Provider value={value}>{children}</ClerkAuthContext.Provider>;
}

export function AppClerkProvider({ children }: { children: ReactNode }) {
  const envKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim();
  const { publishableKey: winKey, Clerk } = readWindowClerk();
  const publishableKey = envKey || winKey || (Clerk ? 'pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk' : '');
  if (!publishableKey) {
    return <ClerkAuthContext.Provider value={unconfiguredState}>{children}</ClerkAuthContext.Provider>;
  }
  return (
    <ClerkProvider publishableKey={publishableKey} {...(Clerk ? { Clerk: Clerk as never } : {})}>
      <ClerkStateBridge>{children}</ClerkStateBridge>
    </ClerkProvider>
  );
}

export function useClerkAuth(): ClerkAuthState {
  return useContext(ClerkAuthContext);
}

export function ClerkAuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { configured } = useClerkAuth();
  if (!configured) {
    return <p className="muted small" role="status">{t('Clerk is not configured. Set VITE_CLERK_PUBLISHABLE_KEY to enable sign-in.')}</p>;
  }
  return (
    <div className="clerk-auth-container">
      {mode === 'register' ? <SignUp routing="hash" /> : <SignIn routing="hash" />}
    </div>
  );
}
