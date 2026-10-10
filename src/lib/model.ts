import type { Relic } from './relics.ts';

export const slots = ['Primary', 'Secondary', 'Melee', 'Warframe', 'Archgun', 'Archmelee'] as const;
export type Slot = (typeof slots)[number];
export const variants = ['Base', 'Prime', 'MK1', 'Umbra', 'Wraith', 'Vandal', 'Prisma', 'Kuva', 'Tenet', 'Dex', 'Coda', 'Other'] as const;
export type Variant = (typeof variants)[number];
export type Upgrade = 'Unknown' | 'Yes' | 'No';
export type Override = 'None' | 'Keep' | "Don't keep";

export interface CatalogItem {
  id: string;
  name: string;
  slot: Slot;
  variant: Variant;
  masteryReq: number;
  craftingTarget: string;
  hasPrimeVariant: boolean;
  wikiUrl: string;
}

export interface Equipment {
  id: string;
  name: string;
  slot: Slot;
  owned: boolean;
  mastered: boolean;
  dontKeep: boolean;
  craftingIngredient: boolean;
  craftingTarget: string;
  variant: Variant;
  incarnon: boolean;
  questWeapon: boolean;
  upgraded: Upgrade;
  powerful: boolean;
  hasPrimeVariant: boolean;
  override: Override;
  rank: number | null;
  notes: string;
  source: string;
  updatedAt: string;
}

export interface ImportLog {
  id: string;
  date: string;
  files: string[];
  added: number;
  updated: number;
}

export interface Inventory {
  version: 1;
  items: Equipment[];
  relics: Relic[];
  imports: ImportLog[];
  referenceNotice: boolean;
}

export function normalizeName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function createEquipment(item: Pick<CatalogItem, 'name' | 'slot' | 'variant'> & Partial<CatalogItem>): Equipment {
  return {
    id: crypto.randomUUID(), name: item.name, slot: item.slot, variant: item.variant,
    owned: true, mastered: false, dontKeep: false,
    craftingIngredient: Boolean(item.craftingTarget), craftingTarget: item.craftingTarget || '',
    incarnon: false, questWeapon: false, upgraded: 'Unknown', powerful: false,
    hasPrimeVariant: item.hasPrimeVariant || false, override: 'None', rank: null, notes: '',
    source: 'Added manually', updatedAt: new Date().toISOString(),
  };
}

export function disposition(item: Equipment): string {
  if (item.override === 'Keep') return 'Keep';
  if (item.override === "Don't keep") return "Don't keep";
  return item.dontKeep ? "Don't keep" : 'Keep';
}

// Only affirmative observations are merged. An absent checkmark in a screenshot
// is not evidence that a previously owned or mastered item should be cleared.
export function mergeObservations(existing: Equipment[], observations: Equipment[]): { items: Equipment[]; added: number; updated: number } {
  const result = existing.map(item => ({ ...item }));
  const indices = new Map(result.map((item, i) => [normalizeName(item.name), i]));
  const existingIds = new Set(existing.map(item => item.id));
  let added = 0;
  const updated = new Set<string>();
  for (const incoming of observations) {
    const key = normalizeName(incoming.name);
    const index = indices.get(key);
    if (index === undefined) {
      indices.set(key, result.length);
      result.push({ ...incoming });
      added++;
    } else {
      const current = result[index];
      const next = {
        ...current, owned: current.owned || incoming.owned, mastered: current.mastered || incoming.mastered,
        // Ranks can decrease after Forma; only replace when a new rank was read.
        rank: incoming.rank ?? current.rank,
        source: incoming.source, updatedAt: incoming.updatedAt,
      };
      result[index] = next;
      if (existingIds.has(current.id)) updated.add(current.id);
    }
  }
  return { items: result, added, updated: updated.size };
}
