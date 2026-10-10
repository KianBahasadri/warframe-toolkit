import { normalizeName } from './model.ts';
import type { CatalogItem } from './model.ts';

export interface OcrLine { text: string; confidence: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }
export interface Detection {
  id: string;
  item: CatalogItem;
  rawText: string;
  confidence: number;
  exact: boolean;
  selected: boolean;
  owned: boolean;
  mastered: boolean;
  rank: number | null;
  filename: string;
}
export type ScreenshotSource = 'inventory' | 'arsenal';

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/mk\s*[1il]\s*-?\s*/g, 'mk1 ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

const component = /\b(blueprints?|chassis|neuroptics|systems|receiver|barrel|stock|handle|blade|ornament|grip|link)\b/i;
const hasVariant = /\b(prime|umbra|wraith|vandal|prisma|kuva|tenet|dex|coda|mk1)\b/i;

export function matchOcrLines(lines: OcrLine[], catalog: CatalogItem[], filename: string, source: ScreenshotSource): Detection[] {
  const indexed = catalog.map(item => ({ item, parts: tokens(item.name), key: normalizeName(item.name) })).sort((a, b) => b.parts.length - a.parts.length || b.key.length - a.key.length);
  const found = new Map<string, Detection>();
  for (const line of lines) {
    if (component.test(line.text)) continue;
    const parts = tokens(line.text);
    if (!parts.length) continue;
    const occupied = new Set<number>();
    const matches: { item: CatalogItem; exact: boolean; score: number }[] = [];
    for (const candidate of indexed) {
      for (let start = 0; start <= parts.length - candidate.parts.length; start++) {
        if (candidate.parts.every((token, i) => parts[start + i] === token && !occupied.has(start + i))) {
          // A known variant next to a base name must not become a base item.
          const next = parts[start + candidate.parts.length] || '';
          const previous = parts[start - 1] || '';
          if (candidate.item.variant === 'Base' && (hasVariant.test(next) || hasVariant.test(previous))) continue;
          matches.push({ item: candidate.item, exact: true, score: line.confidence });
          candidate.parts.forEach((_, i) => occupied.add(start + i));
          break;
        }
      }
    }
    if (!matches.length) {
      const clean = line.text.replace(/\b(?:rank\s*\d{1,2}|mastered|unranked|max(?:\s+rank)?|owned|equip)\b/gi, '').trim();
      const key = normalizeName(clean);
      if (key.length >= 5 && key.length <= 40) {
        const ranked = indexed.filter(candidate => Math.abs(candidate.key.length - key.length) <= 3 && Boolean(hasVariant.test(clean)) === Boolean(hasVariant.test(candidate.item.name)))
          .map(candidate => ({ item: candidate.item, similarity: 1 - distance(key, candidate.key) / Math.max(key.length, candidate.key.length) }))
          .sort((a, b) => b.similarity - a.similarity);
        if (ranked[0]?.similarity >= 0.78 && (!ranked[1] || ranked[0].similarity - ranked[1].similarity >= 0.08)) {
          matches.push({ item: ranked[0].item, exact: false, score: Math.min(line.confidence, ranked[0].similarity * 100) });
        }
      }
    }
    const rankText = line.text.match(/\brank\s*[:\-]?\s*(\d{1,2})\b/i);
    const rankValue = rankText ? Number(rankText[1]) : /\bunranked\b/i.test(line.text) ? 0 : null;
    // Use only text on the item's own line. Nearby cards and UI labels cannot
    // reliably establish which item a rank or mastery marker belongs to.
    const rank = matches.length === 1 && rankValue !== null && rankValue <= 40 ? rankValue : null;
    const mastered = matches.length === 1 && /\bmastered\b/i.test(line.text) && !/\b(?:not|un)\s*mastered\b/i.test(line.text);
    for (const match of matches) {
      const owned = source === 'inventory' && !/\b(?:not owned|unowned|purchase)\b/i.test(line.text);
      const detection: Detection = {
        id: crypto.randomUUID(), item: match.item, rawText: line.text, filename,
        confidence: Math.round(match.score), exact: match.exact,
        selected: match.exact && match.score >= 65, owned, mastered, rank,
      };
      const prior = found.get(match.item.id);
      if (!prior || (match.exact && !prior.exact) || (match.exact === prior.exact && match.score > prior.confidence)) found.set(match.item.id, detection);
    }
  }
  return [...found.values()];
}
