import type { CSSProperties } from 'react';
import { Gem, Plus } from 'lucide-react';
import type { Upgrade } from '../lib/modder';

export const rankText = (mod: Upgrade, rank: number) => [...new Set((mod.ranks[rank] ?? ['Rank unavailable']).flatMap(text => text.split('\n')).map(line => line.trim()).filter(Boolean))].join('\n');

// The texture names are the game's original polarity names.
const symbols: Record<string, string> = { madurai: 'Triangle', vazarin: 'Point', naramon: 'Circle', zenurik: 'Mark', unairu: 'Ward', penjaga: 'Precept', umbra: 'Umbra', universal: 'Universal' };
export function PolarityIcon({ polarity }: { polarity: string }) {
  return symbols[polarity] ? <span className="modder-polarity" aria-hidden="true" style={{ maskImage: `url(/images/modding/Polarity${symbols[polarity]}.png)` }} /> : <span className="modder-no-polarity" aria-hidden="true" />;
}

export function UpgradeFace({ mod, rank = 0, drain, polarity = '', label, arcane = false, match = '', unavailable = false }: { mod?: Upgrade; rank?: number; drain?: number; polarity?: string; label: string; arcane?: boolean; match?: string; unavailable?: boolean }) {
  return <span className={`modder-face${mod ? ' is-filled' : ''}${arcane ? ' is-arcane' : ''}`} data-rarity={mod?.rarity?.toLowerCase() ?? ''}>
    <span className="modder-face-interior" style={mod?.image ? { '--mod-art': `url("${mod.image}")` } as CSSProperties : undefined} />
    <span className="modder-face-label">{label}</span>
    {label === 'Aura' && <span className="modder-aura-symbol" aria-hidden="true" />}
    <span className={`modder-face-drain ${match}`} title={match === 'is-match' ? 'Matching polarity' : match === 'is-mismatch' ? 'Mismatched polarity' : undefined}>{mod && (arcane ? `R${rank}` : drain)}{!arcane && <PolarityIcon polarity={polarity} />}</span>
    {!mod && <span className="modder-empty-symbol">{arcane ? <Gem size={32} aria-hidden="true" /> : <Plus size={22} aria-hidden="true" />}</span>}
    <strong className="modder-face-name">{mod?.name ?? (unavailable ? 'Unavailable upgrade' : arcane ? 'Empty arcane slot' : label === 'Aura' || label === 'Stance' || label === 'Exilus' ? label : 'Empty slot')}</strong>
    {mod && <span className="modder-rank-pips" aria-hidden="true">{Array.from({ length: mod.maxRank }, (_, i) => <i key={i} className={i < rank ? 'is-ranked' : ''} />)}</span>}
  </span>;
}
