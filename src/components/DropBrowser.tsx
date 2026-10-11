import { useRef } from 'react';
import { ArrowRight, Check, ChevronRight, Compass, Crosshair, Gem, Globe2, MapPinned, Package } from 'lucide-react';
import { formatChance } from '../lib/dropTables';
import type { DropBrowseMode, DropRow } from '../lib/dropTables';
import type { DropGroup } from '../lib/dropExplorer';

export const dropBrowseOptions = [
  { mode: 'mission', label: 'Mission type', description: 'Rewards by mission and rotation', noun: 'mission types', icon: Compass },
  { mode: 'item', label: 'Item', description: 'Find where an item drops', noun: 'items', icon: Package },
  { mode: 'location', label: 'Location', description: 'Planets and open-world locations', noun: 'locations', icon: Globe2 },
  { mode: 'relic', label: 'Relic', description: 'Contents and refinement chances', noun: 'relics', icon: Gem },
  { mode: 'bounty', label: 'Bounty', description: 'Rewards by tier, stage and rotation', noun: 'bounties', icon: MapPinned },
  { mode: 'source', label: 'Enemy / source', description: 'Enemies, containers and all other sources', noun: 'sources', icon: Crosshair },
] as const;

export function DropModePicker({ mode, counts, loading, onSelect }: { mode?: DropBrowseMode; counts: Record<DropBrowseMode, number> | null; loading: boolean; onSelect: (mode: DropBrowseMode) => void }) {
  return <div className={`drop-browse-picker ${mode ? 'is-compact' : ''}`}>
    <h2>Browse by</h2>
    <div className="drop-mode-options" role="group" aria-label="Browse drop tables by">
      {dropBrowseOptions.map(option => <button type="button" key={option.mode} className={`drop-mode-button drop-tone-${option.mode}`} aria-label={`Browse by ${option.label.toLowerCase()}`} aria-pressed={mode === option.mode} onClick={() => onSelect(option.mode)}>
        <span className="drop-mode-icon"><option.icon size={24} strokeWidth={1.6} aria-hidden="true" /></span>
        <span className="drop-mode-copy"><strong>{option.label}</strong><span className="drop-mode-description">{option.description}</span><small>{counts ? `${counts[option.mode].toLocaleString()} ${option.noun}` : loading ? 'Loading…' : 'Unavailable'}</small></span>
        <span className="drop-mode-indicator" aria-hidden="true">{mode === option.mode ? <Check size={16} /> : <ArrowRight size={18} />}</span>
      </button>)}
    </div>
  </div>;
}

export function DropGroupCard({ group, mode, onSelect }: { group: DropGroup; mode: DropBrowseMode; onSelect: () => void }) {
  const Icon = dropBrowseOptions.find(option => option.mode === mode)!.icon;
  const preview = mode === 'item' ? group.sources : mode === 'relic' ? group.rewards : mode === 'mission' || mode === 'bounty' ? group.locations : [...new Set(group.rows.map(row => row.mission || row.category))];
  const count = mode === 'item' || mode === 'mission' ? group.sources.length : mode === 'relic' ? new Set(group.rows.map(row => row.refinement)).size : group.rewards.length;
  const noun = mode === 'item' ? 'source' : mode === 'mission' ? 'mission' : mode === 'relic' ? 'refinement' : 'reward';
  return <button type="button" className={`drop-group-card drop-tone-${mode}`} aria-label={`Open ${group.title}`} onClick={onSelect}>
    <span className="drop-group-top"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span>{count.toLocaleString()} {noun}{count !== 1 ? 's' : ''}</span><ChevronRight size={16} aria-hidden="true" /></span>
    <strong className="drop-group-title">{group.title}</strong>
    <span className="drop-group-preview">{preview.slice(0, 3).join(' · ')}{preview.length > 3 ? ` · +${(preview.length - 3).toLocaleString()}` : ''}</span>
    <span className="drop-group-bottom"><span>{group.rows.length.toLocaleString()} entries</span>{mode === 'item' && <span className="drop-group-rate">{group.bestChance === null ? 'Multiple rolls' : <><small>Highest chance</small> {formatChance(group.bestChance)}</>}</span>}</span>
  </button>;
}

export function DropRewardCards({ rows, mode, onOpen }: { rows: DropRow[]; mode: DropBrowseMode; onOpen: (row: DropRow) => void }) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  return <div className="drop-reward-grid">{rows.map((row, index) => <button type="button" className="drop-result-card" key={row.id}
    ref={node => { if (node) buttons.current.set(row.id, node); else buttons.current.delete(row.id); }}
    aria-label={`${row.reward} from ${row.source}: details`} onClick={() => onOpen(row)}
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      buttons.current.get(rows[next].id)?.focus();
    }}>
    <span className="drop-result-main"><span className="drop-result-context">{row.category}</span><strong>{mode === 'item' ? row.source : row.reward}</strong>{mode !== 'item' && <span className="drop-result-source">{row.source}</span>}
      <span className="drop-result-tags">{row.rotation && <span className="drop-rotation">Rotation {row.rotation}</span>}{row.stage && <span>{row.stage}</span>}{row.refinement && <span>{row.refinement}</span>}{row.rarity && <span>{row.rarity}</span>}</span>
    </span>
    <span className={`drop-result-rate ${row.chance === null ? 'is-unknown' : ''}`}><small>Drop chance</small><strong>{row.chance === null ? 'Multiple rolls' : formatChance(row.chance)}</strong>{row.chance !== null && <span className="drop-chance-track" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, row.chance))}%` }} /></span>}<span className="drop-result-more">Rates & odds <ChevronRight size={13} aria-hidden="true" /></span></span>
  </button>)}</div>;
}
