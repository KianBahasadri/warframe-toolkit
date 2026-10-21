import { relicCatalog, relicNames } from '../data/relicCatalog';
import { MAX_RELIC_QUANTITY, refinements, relicKey } from '../lib/relics';
import type { RelicDetection } from '../lib/relicMatching';
import { relicImportError } from '../lib/relicMatching';
import { EditableSelect } from './EditableSelect';

const names = [{ value: '', label: 'Choose relic' }, ...relicNames.map(name => ({ value: name, label: name }))];
const catalogByKey = new Map(relicCatalog.map(item => [relicKey(item), item]));

export function RelicScreenshotReview({ detections, busy, onUpdate, onSelectAll, onImport }: {
  detections: RelicDetection[]; busy: boolean;
  onUpdate: (id: string, patch: Partial<RelicDetection>) => void; onSelectAll: () => void; onImport: () => void;
}) {
  const selected = detections.filter(detection => detection.selected);
  const error = relicImportError(detections);
  return <section className="review-section" aria-labelledby="relic-review-title">
    <div className="section-heading"><h3 id="relic-review-title">Review relics</h3><div className="import-actions">
      <button type="button" className="button secondary" onClick={onSelectAll}>{detections.every(detection => detection.selected) ? 'Deselect all' : 'Select all'}</button>
      <button type="button" className="button primary" disabled={busy || !selected.length || Boolean(error)} onClick={onImport}>Import {selected.length} {selected.length === 1 ? 'stack' : 'stacks'}</button>
    </div></div>
    <p className="small muted">Replaces quantities for selected stacks. Review any flagged fields before importing.</p>
    {error && <p className="callout caution" role="alert">{error}</p>}
    <div className="table-scroll" role="region" aria-label="Relic screenshot matches" tabIndex={0}><table className="review-table relic-review-table">
      <caption className="sr-only">Review relic names, refinements, and quantities before importing. Overlapping screenshots never add quantities together.</caption>
      <thead><tr><th scope="col">Import</th><th scope="col">Relic</th><th scope="col">Refinement</th><th scope="col">Quantity</th></tr></thead>
      <tbody>{detections.map(detection => {
        const label = `${detection.name || 'Unknown relic'} ${detection.refinement || 'unknown refinement'}`;
        const image = detection.name && detection.refinement ? catalogByKey.get(relicKey({ name: detection.name, refinement: detection.refinement }))?.image : undefined;
        return <tr key={detection.id}>
          <td><label className="table-checkbox"><input type="checkbox" checked={detection.selected} aria-label={`Import ${label}`} onChange={event => onUpdate(detection.id, { selected: event.target.checked })} /></label></td>
          <td className="match-cell"><div className="match-content">
            {image && <img className="equipment-image" src={image} alt="" width={96} height={96} loading="lazy" />}
            <div className="match-details"><EditableSelect mode="list-only" label={`Relic name for ${detection.rawText}`} value={detection.name} options={names} onChange={name => onUpdate(detection.id, { name, refinement: name === 'Requiem Eterna' ? 'Unrefined' : detection.refinement === 'Unrefined' ? null : detection.refinement })} /><small>Read: {detection.rawText}</small>{!detection.reviewed && detection.issues.map(issue => <span className="badge caution-badge" key={issue}>{issue}</span>)}</div>
          </div></td>
          <td><fieldset className="relic-refinements"><legend className="sr-only">Refinement: {label}</legend>
            {refinements.filter(value => detection.name === 'Requiem Eterna' ? value === 'Unrefined' : value !== 'Unrefined').reverse().map(value => <label key={value}>
              <input type="radio" name={`refinement-${detection.id}`} value={value} checked={detection.refinement === value} onChange={() => onUpdate(detection.id, { refinement: value })} />{value}
            </label>)}
          </fieldset></td>
          <td><input className="rank-input" type="number" min={0} max={MAX_RELIC_QUANTITY} step={1} value={detection.quantity ?? ''} aria-label={`Quantity: ${label}`} onChange={event => onUpdate(detection.id, { quantity: event.target.value === '' ? null : Number(event.target.value) })} /></td>
        </tr>;
      })}</tbody>
    </table></div>
  </section>;
}
