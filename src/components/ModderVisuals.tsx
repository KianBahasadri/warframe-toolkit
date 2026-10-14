import type { CSSProperties } from 'react';
import type { Upgrade } from '../lib/modder';

export const rankText = (mod: Upgrade, rank: number) => [...new Set((mod.ranks[rank] ?? ['Rank unavailable']).flatMap(text => text.split('\n')).map(line => line.trim()).filter(Boolean))].join('\n');

// The texture names are the game's original polarity names.
const symbols: Record<string, string> = { madurai: 'Triangle', vazarin: 'Point', naramon: 'Circle', zenurik: 'Mark', unairu: 'Ward', penjaga: 'Precept', umbra: 'Umbra', universal: 'Universal' };
export function PolarityIcon({ polarity }: { polarity: string }) {
  return symbols[polarity] ? <span className="modder-polarity" aria-hidden="true" style={{ maskImage: `url(/images/modding/Polarity${symbols[polarity]}.png)` }} /> : <span className="modder-no-polarity" aria-hidden="true" />;
}

// Frame composition, rarity colors, drain backers and rank dots adapted from
// Reuzehagel/arsenyx at de051e179996b9b39459e86f55036ea7361319c0:
// apps/web/src/components/build-editor/mod-card-frame.tsx and mod-card.tsx,
// apps/web/src/lib/mod-card-config.ts. Copyright (c) 2026 Reuzehagel, MIT.
// See /licenses/arsenyx-MIT.txt and /images/modding/SOURCES.md.
const rarityStyles: Record<string, { prefix: string; color: string }> = {
  common: { prefix: 'Bronze', color: '#C79989' },
  uncommon: { prefix: 'Silver', color: '#BEC0C2' },
  rare: { prefix: 'Gold', color: '#FBECC4' },
  legendary: { prefix: 'Legendary', color: '#DFDFDF' },
  amalgam: { prefix: 'Amalgam', color: '#98D9EB' },
  galvanized: { prefix: 'Galvanized', color: '#7CB8E4' },
};

function modAppearance(mod?: Upgrade) {
  const rarity = mod?.name.startsWith('Amalgam ') ? 'amalgam' : mod?.name.startsWith('Galvanized ') ? 'galvanized' : mod?.rarity?.toLowerCase() ?? 'uncommon';
  const key = rarity in rarityStyles ? rarity : 'uncommon';
  return { rarity: key, ...rarityStyles[key] };
}

function RankDots({ rank, maxRank }: { rank: number; maxRank: number }) {
  return maxRank > 0 && <span className="modder-rank-pips" aria-hidden="true">{Array.from({ length: maxRank }, (_, i) => <i key={i} className={i < rank ? 'is-ranked' : ''} />)}</span>;
}

export function UpgradeFace({ mod, rank = 0, drain, polarity = '', label, arcane = false, match = '', unavailable = false }: { mod?: Upgrade; rank?: number; drain?: number; polarity?: string; label: string; arcane?: boolean; match?: string; unavailable?: boolean }) {
  const { rarity, prefix, color } = modAppearance(mod);
  const path = `/images/modding/frames/${rarity}/`;
  const backer = rarity === 'amalgam' || rarity === 'galvanized' ? 'Silver' : prefix;
  const name = mod?.name ?? (unavailable ? 'Unavailable upgrade' : arcane ? 'Empty arcane slot' : label);
  const style = { '--rarity-color': color } as CSSProperties;

  if (arcane) return <span className={`modder-face is-arcane${mod ? ' is-filled' : ''}`} style={style}>
    <span className="modder-arcane-socket" aria-hidden="true">
      <svg viewBox="0 0 120 76" fill="none"><path d="M39 5h15l4-3h5l4 3h14l3 5h15l1 12 7 8-2 10 10 17-8 8H80l-6 7H47l-7-7H12L5 57l10-17-2-10 7-8 1-12h14Z" fill="currentColor" fillOpacity=".045" stroke="currentColor" strokeOpacity=".6" /><path d="M25 10h10m48 0h12M14 58l4 3h22m41 0h21l4-3M48 68h25" stroke="currentColor" strokeWidth="2" strokeOpacity=".7" /></svg>
      {mod?.image && <img className="modder-arcane-art" src={mod.image} alt="" loading="lazy" draggable={false} />}
      {mod && <span className="modder-face-drain">R{rank}</span>}
    </span>
    <strong className="modder-face-name">{name}</strong>
    {mod && <RankDots rank={rank} maxRank={mod.maxRank} />}
  </span>;

  return <span className={`modder-face${mod ? ' is-filled' : ' is-empty'}${rarity === 'amalgam' || rarity === 'galvanized' ? ' is-ornate' : ''}`} data-rarity={rarity} style={style}>
    <span className="modder-face-interior">
      {mod?.image && <img src={mod.image} alt="" loading="lazy" draggable={false} />}
      <span className="modder-face-tint" />
    </span>
    <img className="modder-frame-top" src={`${path}${prefix}FrameTop.webp`} alt="" draggable={false} />
    <img className="modder-frame-bottom" src={`${path}${prefix}FrameBottom.webp`} alt="" draggable={false} />
    <span className="modder-face-label">{label}</span>
    {label === 'Aura' && <span className="modder-aura-symbol" aria-hidden="true" />}
    {(mod || polarity) && <span className={`modder-face-drain ${match}`} title={match === 'is-match' ? 'Matching polarity' : match === 'is-mismatch' ? 'Mismatched polarity' : undefined}>
      {mod && <img src={`${path}${backer}TopRightBacker.webp`} alt="" draggable={false} />}
      <span>{mod && drain}<PolarityIcon polarity={polarity} /></span>
    </span>}
    <strong className="modder-face-name">{name}</strong>
    {mod && rank === mod.maxRank && mod.maxRank > 0 && <img className="modder-rank-complete" src={`${path}RankCompleteLine.webp`} alt="" draggable={false} />}
    {mod && <RankDots rank={rank} maxRank={mod.maxRank} />}
  </span>;
}
