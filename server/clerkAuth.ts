import { verifyToken } from '@clerk/backend';
import { accountUsername, clerkDisplayName } from '../src/lib/account.ts';

export class ClerkAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface VerifiedClerkIdentity {
  id: string;
  username: string;
  hasExplicitUsername: boolean;
}

export interface ClerkVerifyOptions {
  jwtKey?: string;
  secretKey?: string;
  authorizedParties?: string[];
}

export function extractClerkToken(authorization?: string | null, cookieHeader?: string | null): string {
  if (typeof authorization === 'string') {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    if (match) return match[1];
  }
  if (typeof cookieHeader === 'string') {
    const session = cookieHeader
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith('__session='))
      ?.slice('__session='.length);
    if (session) return session;
  }
  return '';
}

function decodeHeaderUsername(headerValue?: string | null): string | undefined {
  if (typeof headerValue !== 'string' || !headerValue.trim()) return undefined;
  try {
    return accountUsername(decodeURIComponent(headerValue.trim())).username;
  } catch {
    return undefined;
  }
}

export async function verifyClerkToken(
  token: string,
  options: ClerkVerifyOptions,
  headerUsername?: string | null,
): Promise<VerifiedClerkIdentity> {
  if (!token || token.length > 8192) throw new ClerkAuthError(401, 'Sign in to save your changes.');
  const jwtKey = options.jwtKey?.trim().replace(/\\n/g, '\n');
  const secretKey = options.secretKey?.trim();
  if (!jwtKey && !secretKey) throw new ClerkAuthError(503, 'Account sign-in is not configured.');
  let payload: Record<string, unknown>;
  try {
    payload = await verifyToken(token, {
      ...(jwtKey ? { jwtKey } : {}),
      ...(secretKey ? { secretKey } : {}),
      ...(options.authorizedParties?.length ? { authorizedParties: options.authorizedParties } : {}),
    }) as Record<string, unknown>;
  } catch {
    throw new ClerkAuthError(401, 'Sign in to save your changes.');
  }
  const id = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
  if (!id || id.length > 128) throw new ClerkAuthError(401, 'Sign in to save your changes.');
  const explicitHeader = decodeHeaderUsername(headerUsername);
  const tokenCandidates = [payload.username, payload.name, payload.first_name, payload.email];
  const hasTokenName = tokenCandidates.some(value => typeof value === 'string' && value.trim().length > 0);
  const username = explicitHeader ?? clerkDisplayName(...tokenCandidates);
  return {
    id,
    username,
    hasExplicitUsername: Boolean(explicitHeader || hasTokenName),
  };
}
