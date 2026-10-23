import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { emptyProfile, isShareToken, validateProfile } from '../src/lib/account.ts';
import { preserveCraftingProgress } from '../src/lib/crafting.ts';
import type { AccountProfile, AccountSession } from '../src/lib/account.ts';
import { ClerkAuthError, extractClerkToken, verifyClerkToken } from './clerkAuth.ts';
import type { VerifiedClerkIdentity } from './clerkAuth.ts';

type AccountRow = { id: string; username: string; profile: string; revision: number; share_token?: string | null };
class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const newShareToken = () => `wfs_${randomBytes(32).toString('base64url')}`;

export function createAccountsApi({
  databasePath = resolve('.data/accounts.sqlite'),
  origin,
  jwtKey = process.env.CLERK_JWT_KEY,
  secretKey = process.env.CLERK_SECRET_KEY,
}: {
  databasePath?: string;
  origin?: string;
  jwtKey?: string;
  secretKey?: string;
} = {}) {
  let db: DatabaseSync | undefined, storageError = false;
  try {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    db = new DatabaseSync(databasePath);
    if (databasePath !== ':memory:') chmodSync(databasePath, 0o600);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const existingColumns = new Set(db.prepare('PRAGMA table_info(accounts)').all().map(column => String(column.name)));
    const hasSessions = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get());
    if (hasSessions || ['access_key_hash', 'username_key', 'salt', 'password_hash'].some(col => existingColumns.has(col))) {
      db.exec('DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS accounts;');
    }
    db.exec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL, profile TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, share_token TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS accounts_share_token ON accounts(share_token) WHERE share_token IS NOT NULL;`);
  } catch { storageError = true; }

  function json(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  }
  function expectedOrigin(req: IncomingMessage) {
    return origin || `${'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
  }
  function snapshot(account: AccountRow): AccountSession {
    try { return { user: { id: account.id, username: account.username }, profile: validateProfile(JSON.parse(account.profile)), revision: account.revision }; }
    catch { throw new ApiError(503, 'Your saved account data could not be read. It has been kept unchanged.'); }
  }
  async function authenticate(req: IncomingMessage, required: boolean): Promise<VerifiedClerkIdentity | null> {
    const token = extractClerkToken(
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
      req.headers.cookie,
    );
    if (!token) {
      if (required) throw new ApiError(401, 'Sign in to save your changes.');
      return null;
    }
    const headerUsername = typeof req.headers['x-clerk-username'] === 'string' ? req.headers['x-clerk-username'] : undefined;
    try {
      return await verifyClerkToken(token, { jwtKey, secretKey, authorizedParties: [expectedOrigin(req)] }, headerUsername);
    } catch (error) {
      if (error instanceof ClerkAuthError) throw new ApiError(error.status, error.message);
      throw new ApiError(401, 'Sign in to save your changes.');
    }
  }
  function ensureAccount(identity: VerifiedClerkIdentity): AccountRow {
    let account = db!.prepare('SELECT * FROM accounts WHERE id = ?').get(identity.id) as AccountRow | undefined;
    if (!account) {
      db!.prepare('INSERT OR IGNORE INTO accounts (id, username, profile, revision) VALUES (?, ?, ?, 0)')
        .run(identity.id, identity.username, JSON.stringify(emptyProfile()));
      account = db!.prepare('SELECT * FROM accounts WHERE id = ?').get(identity.id) as AccountRow | undefined;
    } else if (identity.hasExplicitUsername && account.username !== identity.username) {
      db!.prepare('UPDATE accounts SET username = ? WHERE id = ?').run(identity.username, identity.id);
      account = { ...account, username: identity.username };
    }
    if (!account) throw new ApiError(503, 'Account storage is unavailable. Existing data has been kept.');
    return account;
  }
  async function body(req: IncomingMessage, max: number): Promise<Record<string, unknown>> {
    const expected = expectedOrigin(req);
    if (req.headers.origin !== expected || req.headers['x-toolkit-request'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, 'Open this app directly to make changes.');
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new ApiError(415, 'Send JSON data.');
    if (Number(req.headers['content-length']) > max) { req.resume(); throw new ApiError(413, 'This save is too large. Your previous save is unchanged.'); }
    const chunks: Buffer[] = []; let length = 0;
    req.setTimeout(15000, () => req.destroy());
    for await (const chunk of req) { length += chunk.length; if (length > max) throw new ApiError(413, 'This save is too large. Your previous save is unchanged.'); chunks.push(Buffer.from(chunk)); }
    try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
    catch { throw new ApiError(400, 'Could not read the request.'); }
  }
  function profile(value: unknown): AccountProfile {
    try { return validateProfile(value); } catch (error) { throw new ApiError(400, error instanceof Error ? error.message : 'Invalid profile.'); }
  }
  async function handle(req: IncomingMessage, res: ServerResponse, path: string) {
    if (storageError || !db) throw new ApiError(503, 'Account storage is unavailable. Existing data has been kept.');
    if (path === '/api/account/session') {
      if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed.');
      const identity = await authenticate(req, false);
      if (!identity) { json(res, 200, { user: null }); return; }
      json(res, 200, snapshot(ensureAccount(identity)));
      return;
    }
    if (path.startsWith('/api/account/share/')) {
      if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed.');
      let shareToken = '';
      try { shareToken = decodeURIComponent(path.slice('/api/account/share/'.length)); } catch { /* Invalid URI encoding falls through to 404. */ }
      if (!isShareToken(shareToken)) throw new ApiError(404, 'This shared inventory link is invalid or has been replaced.');
      const account = db.prepare('SELECT * FROM accounts WHERE share_token = ?').get(shareToken) as AccountRow | undefined;
      if (!account) throw new ApiError(404, 'This shared inventory link is invalid or has been replaced.');
      const saved = snapshot(account);
      json(res, 200, { username: saved.user.username, inventory: saved.profile.inventory }); return;
    }
    if (path !== '/api/account/share' && path !== '/api/account/profile') throw new ApiError(404, 'Account endpoint not found.');
    if ((path === '/api/account/share' && req.method !== 'POST') || (path === '/api/account/profile' && req.method !== 'PUT')) throw new ApiError(405, 'Method not allowed.');
    const value = await body(req, path === '/api/account/profile' ? 10 * 1024 * 1024 : 4096);
    const identity = (await authenticate(req, true))!;
    if (value.accountId !== identity.id) throw new ApiError(409, 'The signed-in account changed. Sign in again before saving.');
    const account = ensureAccount(identity);
    if (path === '/api/account/share' && req.method === 'POST') {
      if (value.replace !== undefined && typeof value.replace !== 'boolean') throw new ApiError(400, 'Could not read the request.');
      snapshot(account);
      if (!value.replace && isShareToken(account.share_token)) { json(res, 200, { shareToken: account.share_token }); return; }
      let shareToken = newShareToken();
      while (shareToken === account.share_token) shareToken = newShareToken();
      db.prepare('UPDATE accounts SET share_token = ? WHERE id = ?').run(shareToken, account.id);
      json(res, 200, { shareToken }); return;
    }
    if (path === '/api/account/profile' && req.method === 'PUT') {
      const current = snapshot(account);
      if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new ApiError(400, 'Invalid save revision.');
      const next = profile(value.profile);
      next.craftingPlans = preserveCraftingProgress(next.craftingPlans, current.profile.craftingPlans);
      const result = db.prepare('UPDATE accounts SET profile = ?, revision = revision + 1 WHERE id = ? AND revision = ?').run(JSON.stringify(next), account.id, Number(value.revision));
      if (!result.changes) throw new ApiError(409, 'Your saved data changed in another tab or device. Download your changes before loading the saved version.');
      json(res, 200, { revision: Number(value.revision) + 1 }); return;
    }
    throw new ApiError(404, 'Account endpoint not found.');
  }
  return {
    middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
      const path = req.url?.split('?')[0] ?? '';
      if (!path.startsWith('/api/account/')) { next(); return; }
      void handle(req, res, path).catch(error => {
        if (!res.headersSent && !res.destroyed) {
          json(res, error instanceof ApiError ? error.status : 503, { error: error instanceof ApiError ? error.message : 'Could not save account data. Please try again.' });
        }
      });
    },
    close() { db?.close(); db = undefined; },
  };
}
