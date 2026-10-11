import type { Inventory } from './model.ts';
import type { DropView } from './dropTables.ts';
import { isDropView } from './dropTables.ts';
import { validateInventory } from './storage.ts';

export interface AccountUser { id: string; username: string }
export interface SavedDropView { name: string; view: DropView }
export interface AccountProfile { inventory: Inventory; dropViews: SavedDropView[] }
export interface AccountSession { user: AccountUser; profile: AccountProfile; revision: number }
export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 128;

export const emptyProfile = (): AccountProfile => ({ inventory: { version: 1, items: [], relics: [], imports: [], referenceNotice: false }, dropViews: [] });

export function validateDropViews(value: unknown): SavedDropView[] {
  if (!Array.isArray(value) || value.length > 200 || value.some(entry => !entry || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 100 || !isDropView(entry.view))) throw new Error('Saved views could not be read. The original data has been kept.');
  return value.map(entry => ({ name: entry.name, view: entry.view }));
}

export function validateProfile(value: unknown): AccountProfile {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved profile.');
  const profile = value as AccountProfile;
  return { inventory: validateInventory(profile.inventory), dropViews: validateDropViews(profile.dropViews) };
}

export function accountUsername(value: unknown): { username: string; key: string } {
  if (typeof value !== 'string') throw new Error('Enter your Warframe username.');
  const username = value.trim().normalize('NFKC');
  if (!/^[\p{L}\p{N}_.# -]{1,64}$/u.test(username)) throw new Error('Use your Warframe username, up to 64 characters. Letters, numbers, spaces, dots, underscores, hyphens, and # are supported.');
  return { username, key: username.toLowerCase() };
}
