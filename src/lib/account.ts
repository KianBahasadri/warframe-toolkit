import type { Inventory } from './model.ts';
import type { DropView } from './dropTables.ts';
import { isDropView } from './dropTables.ts';
import { validateInventory } from './storage.ts';
import { validateCraftingPlans } from './crafting.ts';
import type { CraftingPlan } from './crafting.ts';
import { validateArsenals } from './modderModel.ts';
import type { ArsenalBuild } from './modderModel.ts';

export interface AccountUser { id: string; username: string }
export interface SavedDropView { name: string; view: DropView }
export interface AccountProfile { inventory: Inventory; dropViews: SavedDropView[]; craftingPlans: CraftingPlan[]; arsenals: ArsenalBuild[] }
export interface AccountSession { user: AccountUser; profile: AccountProfile; revision: number }
export const isShareToken = (value: unknown): value is string => typeof value === 'string' && /^wfs_[A-Za-z0-9_-]{43}$/.test(value);

export function shareInventoryLink(base: string, shareToken: string): string {
  const url = new URL('/weapons', base);
  url.search = new URLSearchParams({ share: shareToken }).toString();
  url.hash = '';
  return url.href;
}

export function readShareInventoryLink(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has('share')) return null;
  const shareToken = params.get('share');
  if (!isShareToken(shareToken) || params.getAll('share').length !== 1) throw new Error('This shared inventory link is invalid or has been replaced.');
  return shareToken;
}

export const emptyProfile = (): AccountProfile => ({ inventory: { version: 1, items: [], relics: [], imports: [], referenceNotice: false }, dropViews: [], craftingPlans: [], arsenals: [] });

export function validateDropViews(value: unknown): SavedDropView[] {
  if (!Array.isArray(value) || value.length > 200 || value.some(entry => !entry || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 100 || !isDropView(entry.view))) throw new Error('Saved views could not be read. The original data has been kept.');
  return value.map(entry => ({ name: entry.name, view: entry.view }));
}

export function validateProfile(value: unknown): AccountProfile {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved profile.');
  const profile = value as AccountProfile;
  return { inventory: validateInventory(profile.inventory), dropViews: validateDropViews(profile.dropViews), craftingPlans: validateCraftingPlans(profile.craftingPlans === undefined ? [] : profile.craftingPlans), arsenals: validateArsenals(profile.arsenals === undefined ? [] : profile.arsenals) };
}

export function accountUsername(value: unknown): { username: string; key: string } {
  if (typeof value !== 'string') throw new Error('Enter your username.');
  const username = value.trim().normalize('NFKC');
  if (!/^[\p{L}\p{N}_.@# -]{1,64}$/u.test(username)) throw new Error('Use a username up to 64 characters.');
  return { username, key: username.toLowerCase() };
}

export function clerkDisplayName(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const raw = candidate.includes('@') ? candidate.split('@')[0] : candidate;
    const cleaned = raw.normalize('NFKC').replace(/[^\p{L}\p{N}_.@# -]+/gu, ' ').trim().slice(0, 64).trim();
    if (cleaned) return accountUsername(cleaned).username;
  }
  return 'Tenno';
}
