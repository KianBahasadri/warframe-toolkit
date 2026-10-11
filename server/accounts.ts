import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { accountUsername, emptyProfile, isAccessKey, validateProfile } from '../src/lib/account.ts';
import type { AccountProfile, AccountSession } from '../src/lib/account.ts';

const cookieName = 'warframe_toolkit_session';
const lifetime = 30 * 24 * 60 * 60 * 1000;
const hashOptions = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
type AccountRow = { id: string; username: string; salt: string; password_hash: string; access_key_hash: string | null; profile: string; revision: number };
class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const newAccessKey = () => `wft_${randomBytes(32).toString('base64url')}`;
// Only used to migrate accounts created before generated access keys were introduced.
const passwordHash = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, hashOptions, (error, result) => error ? reject(error) : resolve(result)));

export function createAccountsApi({ databasePath = resolve('.data/accounts.sqlite'), origin, now = Date.now }: { databasePath?: string; origin?: string; now?: () => number } = {}) {
  let db: DatabaseSync | undefined, storageError = false, hashing = 0;
  const limits = new Map<string, { attempts: number; until: number }>();
  try {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    db = new DatabaseSync(databasePath);
    if (databasePath !== ':memory:') chmodSync(databasePath, 0o600);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, salt TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL DEFAULT '', access_key_hash TEXT, profile TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);`);
    if (!db.prepare('PRAGMA table_info(accounts)').all().some(column => column.name === 'access_key_hash')) db.exec('ALTER TABLE accounts ADD COLUMN access_key_hash TEXT');
  } catch { storageError = true; }

  function json(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value));
  }
  function token(req: IncomingMessage) {
    const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
  }
  function setCookie(req: IncomingMessage, res: ServerResponse, value: string) {
    const secure = origin?.startsWith('https://') || ('encrypted' in req.socket && req.socket.encrypted);
    res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? lifetime / 1000 : 0}${secure ? '; Secure' : ''}`);
  }
  function session(req: IncomingMessage): AccountRow | undefined {
    const value = token(req);
    if (!value) return;
    return db!.prepare('SELECT a.* FROM accounts a JOIN sessions s ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?').get(digest(value), now()) as AccountRow | undefined;
  }
  function snapshot(account: AccountRow): AccountSession {
    try { return { user: { id: account.id, username: account.username }, profile: validateProfile(JSON.parse(account.profile)), revision: account.revision }; }
    catch { throw new ApiError(503, 'Your saved account data could not be read. It has been kept unchanged.'); }
  }
  function signIn(req: IncomingMessage, res: ServerResponse, account: AccountRow) {
    const result = snapshot(account), value = randomBytes(32).toString('base64url');
    db!.prepare('DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?').run(now(), digest(token(req)));
    db!.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(value), account.id, now() + lifetime);
    setCookie(req, res, value); return result;
  }
  function throttle(req: IncomingMessage, username: string) {
    for (const [key, limit] of limits) if (limit.until <= now()) limits.delete(key);
    const keys = [[`ip:${req.socket.remoteAddress}`, 60], [`user:${username}`, 12]] as const;
    if (limits.size > 10000 || keys.some(([key, max]) => (limits.get(key)?.attempts ?? 0) >= max)) throw new ApiError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
    for (const [key] of keys) { const limit = limits.get(key) ?? { attempts: 0, until: now() + 15 * 60_000 }; limit.attempts++; limits.set(key, limit); }
  }
  async function derive(password: string, salt: string) {
    if (hashing >= 2) throw new ApiError(429, 'Sign-in is busy. Please try again shortly.');
    hashing++;
    try { return await passwordHash(password, salt); } finally { hashing--; }
  }
  function replaceAccessKey(account: AccountRow, keepSession: string) {
    snapshot(account);
    const accessKey = newAccessKey();
    db!.exec('BEGIN IMMEDIATE');
    try {
      db!.prepare("UPDATE accounts SET access_key_hash = ?, salt = '', password_hash = '' WHERE id = ?").run(digest(accessKey), account.id);
      db!.prepare('DELETE FROM sessions WHERE account_id = ? AND token_hash != ?').run(account.id, digest(keepSession));
      db!.exec('COMMIT');
    } catch (error) { db!.exec('ROLLBACK'); throw error; }
    return accessKey;
  }
  async function body(req: IncomingMessage, max: number): Promise<Record<string, unknown>> {
    const expected = origin || `${'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
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
    if (path === '/api/account/session' && req.method === 'GET') { const account = session(req); json(res, 200, account ? snapshot(account) : { user: null }); return; }
    if (!['POST', 'PUT'].includes(req.method || '')) throw new ApiError(405, 'Method not allowed.');
    const value = await body(req, path === '/api/account/profile' || path === '/api/account/register' ? 10 * 1024 * 1024 : 4096);
    if ((path === '/api/account/register' || path === '/api/account/login') && req.method === 'POST') {
      let name: ReturnType<typeof accountUsername>;
      try { name = accountUsername(value.username); } catch (error) { throw new ApiError(400, (error as Error).message); }
      throttle(req, name.key);
      if (path.endsWith('/register')) {
        if (value.accessKey !== undefined || value.password !== undefined) throw new ApiError(400, 'Access keys are generated when you create an account.');
        const savedProfile = value.profile === undefined ? emptyProfile() : profile(value.profile);
        const accessKey = newAccessKey(), id = randomUUID();
        const result = db.prepare("INSERT OR IGNORE INTO accounts (id, username, username_key, salt, password_hash, access_key_hash, profile) VALUES (?, ?, ?, '', '', ?, ?)").run(id, name.username, name.key, digest(accessKey), JSON.stringify(savedProfile));
        if (!result.changes) throw new ApiError(409, 'That username is already registered. Sign in instead.');
        json(res, 201, { ...signIn(req, res, db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow), accessKey }); return;
      }
      const credential = value.accessKey;
      if (typeof credential !== 'string' || !credential.length || [...credential].length > 128) throw new ApiError(400, 'Enter your saved access key.');
      const account = db.prepare('SELECT * FROM accounts WHERE username_key = ?').get(name.key) as AccountRow | undefined;
      let accessKey: string | undefined;
      if (account && account.access_key_hash === null && /^[a-f0-9]{128}$/.test(account.password_hash) && /^[a-f0-9]{32}$/.test(account.salt)) {
        const hash = await derive(credential, account.salt);
        if (!timingSafeEqual(hash, Buffer.from(account.password_hash, 'hex'))) throw new ApiError(401, 'Username or access key is incorrect.');
        const latest = db.prepare('SELECT access_key_hash, password_hash FROM accounts WHERE id = ?').get(account.id);
        if (latest?.access_key_hash !== null || latest.password_hash !== account.password_hash) throw new ApiError(401, 'Username or access key is incorrect.');
        accessKey = replaceAccessKey(account, '');
      } else {
        const hash = Buffer.from(digest(credential.trim()), 'hex');
        const expected = account?.access_key_hash && /^[a-f0-9]{64}$/.test(account.access_key_hash) ? Buffer.from(account.access_key_hash, 'hex') : Buffer.alloc(32);
        if (!timingSafeEqual(hash, expected) || !account || !isAccessKey(credential.trim())) throw new ApiError(401, 'Username or access key is incorrect.');
      }
      limits.delete(`user:${name.key}`);
      json(res, 200, { ...signIn(req, res, account!), ...(accessKey ? { accessKey } : {}) }); return;
    }
    const account = session(req);
    if (account && value.accountId !== account.id) throw new ApiError(409, 'The signed-in account changed. Sign in again before saving.');
    if (path === '/api/account/logout' && req.method === 'POST') {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token(req)));
      setCookie(req, res, ''); json(res, 200, { user: null }); return;
    }
    if (!account) throw new ApiError(401, 'Sign in to save your changes.');
    if (path === '/api/account/access-key' && req.method === 'POST') {
      throttle(req, account.username.toLowerCase());
      json(res, 200, { accessKey: replaceAccessKey(account, token(req)) }); return;
    }
    if (path === '/api/account/profile' && req.method === 'PUT') {
      snapshot(account);
      if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new ApiError(400, 'Invalid save revision.');
      const next = profile(value.profile);
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
      void handle(req, res, path).catch(error => { if (!res.headersSent && !res.destroyed) { if (error instanceof ApiError && error.status === 429) res.setHeader('Retry-After', '900'); json(res, error instanceof ApiError ? error.status : 503, { error: error instanceof ApiError ? error.message : 'Could not save account data. Please try again.' }); } });
    },
    close() { db?.close(); db = undefined; },
  };
}
