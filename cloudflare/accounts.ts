import { DurableObject } from 'cloudflare:workers';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { emptyProfile, isShareToken, validateProfile } from '../src/lib/account.ts';
import { preserveCraftingProgress } from '../src/lib/crafting.ts';
import type { AccountProfile, AccountSession } from '../src/lib/account.ts';
import { ClerkAuthError, extractClerkToken, verifyClerkToken } from '../server/clerkAuth.ts';
import type { VerifiedClerkIdentity } from '../server/clerkAuth.ts';
import type { Env } from './index.ts';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
type Account = { id: string; username: string; profile_id: string; profile_hash: string; profile_chunks: number; revision: number; share_token: string | null };
type ProfileRow = Account & { chunk_index: number | null; contents: string | null };
class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
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

/** D1 owns all account data. This coordinator supplies serialized provisioning and
 * enough CPU time for the same large saves supported by the local server. */
export class AccountGateway extends DurableObject<Env> {
  private async authenticate(request: Request, required: boolean): Promise<VerifiedClerkIdentity | null> {
    const token = extractClerkToken(request.headers.get('Authorization'), request.headers.get('Cookie'));
    if (!token) {
      if (required) throw new ApiError(401, 'Sign in to save your changes.');
      return null;
    }
    try {
      return await verifyClerkToken(
        token,
        {
          jwtKey: this.env.CLERK_JWT_KEY,
          secretKey: this.env.CLERK_SECRET_KEY,
          authorizedParties: [this.env.ACCOUNTS_ORIGIN],
        },
        request.headers.get('X-Clerk-Username'),
      );
    } catch (error) {
      if (error instanceof ClerkAuthError) throw new ApiError(error.status, error.message);
      throw new ApiError(401, 'Sign in to save your changes.');
    }
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
  private chunks(accountId: string, encoded: ReturnType<typeof encodeProfile>) {
    return encoded.chunks.map((chunk, index) => this.env.DB.prepare('INSERT INTO account_profile_chunks (account_id, profile_id, chunk_index, contents) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ? AND profile_id = ?)').bind(accountId, encoded.id, index, chunk, accountId, encoded.id));
  }
  private async ensureAccount(identity: VerifiedClerkIdentity): Promise<{ account: Account; snapshot: AccountSession }> {
    const db = this.env.DB;
    let existing = await this.read('a.id = ?', [identity.id]);
    if (!existing) {
      const initial = emptyProfile(), encoded = encodeProfile(initial);
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO accounts (id, username, profile_id, profile_hash, profile_chunks, revision) VALUES (?, ?, ?, ?, ?, 0)').bind(identity.id, identity.username, encoded.id, encoded.hash, encoded.chunks.length),
        ...this.chunks(identity.id, encoded),
      ]);
      existing = await this.read('a.id = ?', [identity.id]);
    } else if (identity.hasExplicitUsername && existing.account.username !== identity.username) {
      await db.prepare('UPDATE accounts SET username = ? WHERE id = ?').bind(identity.username, identity.id).run();
      existing = {
        account: { ...existing.account, username: identity.username },
        snapshot: { ...existing.snapshot, user: { ...existing.snapshot.user, username: identity.username } },
      };
    }
    if (!existing) throw new ApiError(503, 'Account storage is unavailable. Existing data has been kept.');
    return existing;
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
    if (path === '/api/account/session') {
      if (request.method !== 'GET') throw new ApiError(405, 'Method not allowed.');
      const identity = await this.authenticate(request, false);
      if (!identity) return json({ user: null });
      return json((await this.ensureAccount(identity)).snapshot);
    }
    if (path.startsWith('/api/account/share/')) {
      if (request.method !== 'GET') throw new ApiError(405, 'Method not allowed.');
      let shareToken = '';
      try { shareToken = decodeURIComponent(path.slice('/api/account/share/'.length)); } catch { /* Invalid URI encoding falls through to 404. */ }
      if (!isShareToken(shareToken)) throw new ApiError(404, 'This shared inventory link is invalid or has been replaced.');
      const shared = await this.read('a.share_token = ?', [shareToken]);
      if (!shared) throw new ApiError(404, 'This shared inventory link is invalid or has been replaced.');
      return json({ username: shared.snapshot.user.username, inventory: shared.snapshot.profile.inventory });
    }
    if (path !== '/api/account/share' && path !== '/api/account/profile') throw new ApiError(404, 'Account endpoint not found.');
    if ((path === '/api/account/share' && request.method !== 'POST') || (path === '/api/account/profile' && request.method !== 'PUT')) throw new ApiError(405, 'Method not allowed.');
    const value = await this.body(request, path === '/api/account/profile' ? 10 * 1024 * 1024 : 4096);
    const identity = (await this.authenticate(request, true))!;
    if (value.accountId !== identity.id) throw new ApiError(409, 'The signed-in account changed. Sign in again before saving.');
    const current = await this.ensureAccount(identity);
    const { account } = current;
    if (path === '/api/account/share' && request.method === 'POST') {
      if (value.replace !== undefined && typeof value.replace !== 'boolean') throw new ApiError(400, 'Could not read the request.');
      if (!value.replace && isShareToken(account.share_token)) return json({ shareToken: account.share_token });
      let shareToken = `wfs_${randomToken()}`;
      while (shareToken === account.share_token) shareToken = `wfs_${randomToken()}`;
      const result = await db.prepare('UPDATE accounts SET share_token = ? WHERE id = ?').bind(shareToken, account.id).run();
      if (!result.meta.changes) throw new ApiError(409, 'The signed-in account changed. Sign in again before saving.');
      return json({ shareToken });
    }
    if (path === '/api/account/profile' && request.method === 'PUT') {
      if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new ApiError(400, 'Invalid save revision.');
      const next = profile(value.profile);
      next.craftingPlans = preserveCraftingProgress(next.craftingPlans, current.snapshot.profile.craftingPlans);
      const encoded = encodeProfile(next);
      const results = await db.batch([
        db.prepare('UPDATE accounts SET profile_id = ?, profile_hash = ?, profile_chunks = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND profile_id = ?').bind(encoded.id, encoded.hash, encoded.chunks.length, account.id, Number(value.revision), account.profile_id),
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
