import { DurableObject } from 'cloudflare:workers';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { accountUsername, emptyProfile, isAccessKey, validateProfile } from '../src/lib/account.ts';
import { preserveCraftingProgress } from '../src/lib/crafting.ts';
import type { AccountProfile, AccountSession } from '../src/lib/account.ts';
import type { Env } from './index.ts';

const cookieName = 'warframe_toolkit_session';
const lifetime = 30 * 24 * 60 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
type Account = { id: string; username: string; access_key_hash: string; profile_id: string; profile_hash: string; profile_chunks: number; revision: number };
type ProfileRow = Account & { chunk_index: number | null; contents: string | null };
class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function json(value: unknown, status = 200, cookie?: string) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(cookie ? { 'Set-Cookie': cookie } : {}), ...(status === 429 ? { 'Retry-After': '900' } : {}) } });
}
function token(request: Request) {
  const value = request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}
function profile(value: unknown): AccountProfile {
  try { return validateProfile(value); } catch (error) { throw new ApiError(400, (error as Error).message); }
}
function encodeProfile(value: AccountProfile) {
  const text = JSON.stringify(value), chunks: string[] = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + 524288, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    chunks.push(text.slice(offset, end)); offset = end;
  }
  return { id: randomUUID(), hash: digest(text), chunks };
}

/** D1 owns all account data. This coordinator supplies persistent throttling and
 * enough CPU time for the same large saves supported by the local server. */
export class AccountGateway extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS attempts_expiry ON attempts(until)');
  }
  private cookie(value: string) {
    return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? lifetime / 1000 : 0}${this.env.ACCOUNTS_ORIGIN.startsWith('https://') ? '; Secure' : ''}`;
  }
  private throttle(request: Request, username: string) {
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql, now = Date.now();
      sql.exec('DELETE FROM attempts WHERE until <= ?', now);
      const keys = [[`ip:${request.headers.get('CF-Connecting-IP') || 'unknown'}`, 60], [`user:${username}`, 12]] as const;
      for (const [key, max] of keys) {
        const row = sql.exec<{ count: number }>('SELECT count FROM attempts WHERE key = ?', key).toArray()[0];
        if (row && row.count >= max) throw new ApiError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
      }
      for (const [key] of keys) sql.exec('INSERT INTO attempts VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1', key, now + 900000);
    });
  }
  private async read(where: string, args: (string | number)[]): Promise<{ account: Account; snapshot: AccountSession } | undefined> {
    // One joined query reads the revision and every chunk from one SQL snapshot.
    const result = await this.env.DB.prepare(`SELECT a.*, p.chunk_index, p.contents FROM accounts a LEFT JOIN account_profile_chunks p ON p.account_id = a.id AND p.profile_id = a.profile_id WHERE ${where} ORDER BY p.chunk_index`).bind(...args).all<ProfileRow>();
    const rows = result.results, account = rows[0];
    if (!account) return;
    try {
      if (rows.length !== account.profile_chunks || rows.some((row, index) => row.chunk_index !== index || typeof row.contents !== 'string')) throw new Error();
      const text = rows.map(row => row.contents).join('');
      if (digest(text) !== account.profile_hash) throw new Error();
      const saved = validateProfile(JSON.parse(text));
      return { account, snapshot: { user: { id: account.id, username: account.username }, profile: saved, revision: account.revision } };
    } catch { throw new ApiError(503, 'Your saved account data could not be read. It has been kept unchanged.'); }
  }
  private async session(request: Request) {
    const value = token(request);
    return value ? this.read('a.id IN (SELECT account_id FROM sessions WHERE token_hash = ? AND expires_at > ?)', [digest(value), Date.now()]) : undefined;
  }
  private chunks(accountId: string, encoded: ReturnType<typeof encodeProfile>) {
    return encoded.chunks.map((chunk, index) => this.env.DB.prepare('INSERT INTO account_profile_chunks (account_id, profile_id, chunk_index, contents) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ? AND profile_id = ?)').bind(accountId, encoded.id, index, chunk, accountId, encoded.id));
  }
  private async body(request: Request, max: number): Promise<Record<string, unknown>> {
    if (request.headers.get('Origin') !== this.env.ACCOUNTS_ORIGIN || request.headers.get('X-Toolkit-Request') !== '1' || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403, 'Open this app directly to make changes.');
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new ApiError(415, 'Send JSON data.');
    if (Number(request.headers.get('Content-Length')) > max) throw new ApiError(413, 'This save is too large. Your previous save is unchanged.');
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, 'Could not read the request.');
    const chunks: Uint8Array[] = []; let size = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel(); reject(new ApiError(408, 'The request timed out.')); }, 15000); });
    try {
      while (true) {
        const { done, value } = await Promise.race([reader.read(), timeout]);
        if (done) break;
        size += value.byteLength;
        if (size > max) throw new ApiError(413, 'This save is too large. Your previous save is unchanged.');
        chunks.push(value);
      }
    } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); }
    try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
    catch { throw new ApiError(400, 'Could not read the request.'); }
  }
  private async handle(request: Request) {
    const path = new URL(request.url).pathname, db = this.env.DB;
    if (path === '/api/account/session' && request.method === 'GET') return json((await this.session(request))?.snapshot ?? { user: null });
    if (!['POST', 'PUT'].includes(request.method)) throw new ApiError(405, 'Method not allowed.');
    const value = await this.body(request, ['/api/account/profile', '/api/account/register'].includes(path) ? 10 * 1024 * 1024 : 4096);
    if (['/api/account/register', '/api/account/login'].includes(path) && request.method === 'POST') {
      let name: ReturnType<typeof accountUsername>;
      try { name = accountUsername(value.username); } catch (error) { throw new ApiError(400, (error as Error).message); }
      this.throttle(request, name.key);
      const sessionToken = randomToken(), expires = Date.now() + lifetime;
      if (path.endsWith('/register')) {
        if (value.accessKey !== undefined || value.password !== undefined) throw new ApiError(400, 'Access keys are generated when you create an account.');
        const saved = value.profile === undefined ? emptyProfile() : profile(value.profile);
        const encoded = encodeProfile(saved), accessKey = `wft_${randomToken()}`, id = randomUUID();
        const results = await db.batch([
          db.prepare('INSERT OR IGNORE INTO accounts (id, username, username_key, access_key_hash, profile_id, profile_hash, profile_chunks) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, name.username, name.key, digest(accessKey), encoded.id, encoded.hash, encoded.chunks.length),
          ...this.chunks(id, encoded),
          db.prepare('INSERT INTO sessions SELECT ?, id, ? FROM accounts WHERE id = ?').bind(digest(sessionToken), expires, id),
          db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR (token_hash = ? AND EXISTS (SELECT 1 FROM accounts WHERE id = ?))').bind(Date.now(), digest(token(request)), id),
        ]);
        if (!results[0].meta.changes) throw new ApiError(409, 'That username is already registered. Sign in instead.');
        return json({ user: { id, username: name.username }, profile: saved, revision: 0, accessKey }, 201, this.cookie(sessionToken));
      }
      const credential = value.accessKey;
      if (typeof credential !== 'string' || !credential.length || credential.length > 128) throw new ApiError(400, 'Enter your saved access key.');
      // Verify the key before reading private profile data (including corruption errors).
      const account = await db.prepare('SELECT id, access_key_hash FROM accounts WHERE username_key = ?').bind(name.key).first<Pick<Account, 'id' | 'access_key_hash'>>();
      const expected = account && /^[a-f0-9]{64}$/.test(account.access_key_hash) ? Buffer.from(account.access_key_hash, 'hex') : Buffer.alloc(32);
      if (!timingSafeEqual(Buffer.from(digest(credential.trim()), 'hex'), expected) || !account || !isAccessKey(credential.trim())) throw new ApiError(401, 'Username or access key is incorrect.');
      const saved = await this.read('a.id = ? AND a.access_key_hash = ?', [account.id, account.access_key_hash]);
      if (!saved) throw new ApiError(401, 'Username or access key is incorrect.');
      const results = await db.batch([
        db.prepare('INSERT INTO sessions SELECT ?, id, ? FROM accounts WHERE id = ? AND access_key_hash = ?').bind(digest(sessionToken), expires, account.id, account.access_key_hash),
        db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR (token_hash = ? AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND access_key_hash = ?))').bind(Date.now(), digest(token(request)), account.id, account.access_key_hash),
      ]);
      if (!results[0].meta.changes) throw new ApiError(401, 'Username or access key is incorrect.');
      this.ctx.storage.sql.exec('DELETE FROM attempts WHERE key = ?', `user:${name.key}`);
      return json(saved.snapshot, 200, this.cookie(sessionToken));
    }
    if (path === '/api/account/logout' && request.method === 'POST') {
      // Ending a session must remain possible even if its saved profile is damaged.
      const active = await db.prepare('SELECT account_id FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(digest(token(request)), Date.now()).first<{ account_id: string }>();
      if (active && value.accountId !== active.account_id) throw new ApiError(409, 'The signed-in account changed. Sign in again before saving.');
      await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(digest(token(request))).run();
      return json({ user: null }, 200, this.cookie(''));
    }
    const current = await this.session(request);
    if (current && value.accountId !== current.account.id) throw new ApiError(409, 'The signed-in account changed. Sign in again before saving.');
    if (!current) throw new ApiError(401, 'Sign in to save your changes.');
    const { account } = current;
    const validSession = 'EXISTS (SELECT 1 FROM sessions WHERE token_hash = ? AND account_id = accounts.id AND expires_at > ?)';
    if (path === '/api/account/access-key' && request.method === 'POST') {
      this.throttle(request, account.username.toLowerCase());
      const accessKey = `wft_${randomToken()}`, hash = digest(accessKey);
      const results = await db.batch([
        db.prepare(`UPDATE accounts SET access_key_hash = ? WHERE id = ? AND access_key_hash = ? AND ${validSession}`).bind(hash, account.id, account.access_key_hash, digest(token(request)), Date.now()),
        db.prepare('DELETE FROM sessions WHERE account_id = ? AND token_hash != ? AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND access_key_hash = ?)').bind(account.id, digest(token(request)), account.id, hash),
      ]);
      if (!results[0].meta.changes) throw new ApiError(409, 'The signed-in account changed. Sign in again before saving.');
      return json({ accessKey });
    }
    if (path === '/api/account/profile' && request.method === 'PUT') {
      if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new ApiError(400, 'Invalid save revision.');
      const next = profile(value.profile);
      if (!Object.hasOwn(value.profile as object, 'craftingPlans')) next.craftingPlans = current.snapshot.profile.craftingPlans;
      else next.craftingPlans = preserveCraftingProgress(next.craftingPlans, current.snapshot.profile.craftingPlans);
      const encoded = encodeProfile(next);
      const results = await db.batch([
        db.prepare(`UPDATE accounts SET profile_id = ?, profile_hash = ?, profile_chunks = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND profile_id = ? AND ${validSession}`).bind(encoded.id, encoded.hash, encoded.chunks.length, account.id, Number(value.revision), account.profile_id, digest(token(request)), Date.now()),
        ...this.chunks(account.id, encoded),
        db.prepare('DELETE FROM account_profile_chunks WHERE account_id = ? AND profile_id != ? AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND profile_id = ?)').bind(account.id, encoded.id, account.id, encoded.id),
      ]);
      if (!results[0].meta.changes) throw new ApiError(409, 'Your saved data changed in another tab or device. Download your changes before loading the saved version.');
      return json({ revision: Number(value.revision) + 1 });
    }
    throw new ApiError(404, 'Account endpoint not found.');
  }
  async fetch(request: Request) {
    try { return await this.handle(request); }
    catch (error) { return json({ error: error instanceof ApiError ? error.message : 'Could not save account data. Please try again.' }, error instanceof ApiError ? error.status : 503); }
  }
}
