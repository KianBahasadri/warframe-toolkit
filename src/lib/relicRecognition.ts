import { MAX_RELIC_QUANTITY, parseRelicName, refinements, relicKey } from './relics.ts';
import type { Refinement } from './relics.ts';
import type { RelicDetection } from './relicMatching.ts';
import type { ImageRegion } from './relicVision.ts';

export interface TextReading { text: string; confidence: number }
export interface RelicReading {
  region: ImageRegion;
  name: TextReading[];
  refinement: TextReading[];
  quantity: TextReading[];
  labelComplete: boolean;
  refinementAbsent: boolean;
  counter: 'empty' | 'text' | 'cropped';
}

/** Corrections are suggestions constrained by the code's letter/digit roles.
 * An existing, different catalog code is never rewritten to win a vote. */
export function readRelicName(text: string, names: Map<string, string>): { name: string; exact: boolean } | null {
  const match = /^\s*(Lith|Meso|Neo|Axi|Requiem|Vanguard)\s+(.+?)\s*Rel[iIl1]c\s*$/i.exec(text);
  if (!match) return null;
  const code = match[2].replace(/\s+/g, '');
  const parsed = parseRelicName(`${match[1]} ${code}`);
  const exact = parsed && names.get(parsed.name.toLowerCase());
  if (exact) return { name: exact, exact: true };
  if (/^Requiem$/i.test(match[1])) return null;
  const first: Record<string, string> = { '$': 'S', '5': 'S', '8': 'B', '0': 'O', '6': 'G', '2': 'Z' };
  const digits: Record<string, string> = { I: '1', l: '1', O: '0', o: '0', G: '6', S: '5', B: '8', Z: '2' };
  const corrected = (first[code[0]] ?? code[0]) + [...code.slice(1)].map(char => digits[char] ?? char).join('');
  if (!/^[A-Z]\d+$/i.test(corrected) || corrected === code) return null;
  const suggestion = names.get(`${match[1]} ${corrected}`.toLowerCase());
  return suggestion ? { name: suggestion, exact: false } : null;
}

function consensus<T extends string | number>(readings: TextReading[], parse: (text: string) => T | null) {
  const candidates = readings.map(reading => ({ ...reading, value: parse(reading.text) })).filter(reading => reading.value !== null && reading.confidence >= 35);
  const values = [...new Set(candidates.map(reading => reading.value!))];
  const best = [...candidates].sort((a, b) => b.confidence - a.confidence)[0];
  return { value: values.length === 1 ? values[0] : null, conflict: values.length > 1,
    certain: values.length === 1 && candidates.filter(reading => reading.confidence >= 35).length >= 2 && best.confidence >= 65 };
}

export function matchRelicReadings(readings: RelicReading[], catalogNames: string[], filename: string): RelicDetection[] {
  const names = new Map(catalogNames.map(name => [name.toLowerCase(), name]));
  return readings.map(reading => {
    const issues: string[] = [];
    const candidates = reading.name.map(value => ({ ...value, match: readRelicName(value.text, names) })).filter(value => value.match);
    const nameVote = consensus(reading.name, text => readRelicName(text, names)?.name ?? null);
    const best = [...candidates].sort((a, b) => Number(b.match!.exact) - Number(a.match!.exact) || b.confidence - a.confidence)[0];
    const name = nameVote.value ?? best?.match?.name ?? '';
    if (!nameVote.certain || !candidates.some(value => value.match!.name === name && value.match!.exact && value.confidence >= 65) || !reading.labelComplete) issues.push('Check name');
    const refinementVote = consensus(reading.refinement, text => refinements.find(value => text.replace(/[\[\]()\s]/g, '').toLowerCase() === value.toLowerCase()) ?? null);
    let refinement: Refinement | null = refinementVote.value;
    if (!reading.refinement.length && reading.refinementAbsent && reading.labelComplete) refinement = name === 'Requiem Eterna' ? 'Unrefined' : 'Intact';
    if (!refinement || reading.refinement.length > 0 && !refinementVote.certain || !reading.labelComplete) issues.push('Choose refinement');
    const quantityVote = consensus(reading.quantity, text => {
      const match = /^[x×]\s*(\d+|\d{1,3}(?:,\d{3})+)$/i.exec(text.trim());
      const value = match ? Number(match[1].replace(/,/g, '')) : NaN;
      return Number.isInteger(value) && value > 0 && value <= MAX_RELIC_QUANTITY ? value : null;
    });
    let quantity: number | null = quantityVote.value;
    if (reading.counter === 'empty') quantity = 1;
    else if (reading.counter === 'cropped') { quantity = null; issues.push('Quantity cropped'); }
    else if (!quantityVote.certain) { quantity = null; issues.push(quantityVote.conflict ? 'Conflicting quantities' : 'Check quantity'); }
    if ((name === 'Requiem Eterna') !== (refinement === 'Unrefined')) issues.push('Choose refinement');
    const rawText = [...new Set([...reading.name, ...reading.refinement, ...reading.quantity].map(value => value.text).filter(Boolean))].join(' · ') || 'Unread relic';
    const recognizedKey = name && refinement ? relicKey({ name, refinement }) : `${name}|unknown:${Math.round(reading.region.x)}:${Math.round(reading.region.y)}`;
    return { id: crypto.randomUUID(), name, refinement, quantity, rawText, filename,
      confidence: Math.round(best?.confidence ?? 0), selected: issues.length === 0, reviewed: false, recognizedKey, issues: [...new Set(issues)] };
  });
}
