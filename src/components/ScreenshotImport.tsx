import { useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { catalog } from '../data/catalog';
import { createEquipment } from '../lib/model';
import type { Equipment } from '../lib/model';
import { matchOcrLines } from '../lib/matching';
import type { Detection, ScreenshotSource } from '../lib/matching';
import { Select } from './Select';
import { ScreenshotHelp } from './ScreenshotHelp';

const equipmentOptions = catalog.map(item => ({ value: item.id, label: item.name }));
const importSources = [{ value: 'inventory', label: 'Inventory' }, { value: 'arsenal', label: 'Arsenal' }] as const;

interface Scan { file: File; url: string; read: boolean }

export function ScreenshotImport({ onImport, onInventory }: { onImport: (observations: Equipment[], files: string[]) => { added: number; updated: number } | null; onInventory: () => void }) {
  const [source, setSource] = useState<ScreenshotSource>('inventory');
  const [help, setHelp] = useState<ScreenshotSource | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(0);
  const [dragging, setDragging] = useState<ScreenshotSource | null>(null);
  const [completed, setCompleted] = useState<{ added: number; updated: number } | null>(null);
  const inputs = useRef<Record<ScreenshotSource, HTMLInputElement | null>>({ inventory: null, arsenal: null });
  const pasteSource = useRef<ScreenshotSource>('inventory');
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const urls = useRef<string[]>([]);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); urls.current.forEach(URL.revokeObjectURL); }; }, []);

  const processFiles = async (files: File[], screenshotSource: ScreenshotSource) => {
    if (busyRef.current || scans.length || !files.length) return;
    setSource(screenshotSource);
    if (files.length > 10) { setError('Choose up to 10 screenshots at a time.'); return; }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) { setError('Use PNG, JPG, or WebP screenshots.'); return; }
    if (files.some(file => file.size > 20 * 1024 * 1024)) { setError('Each screenshot must be smaller than 20 MB.'); return; }
    urls.current.forEach(URL.revokeObjectURL);
    const next = files.map(file => ({ file, url: URL.createObjectURL(file), read: false }));
    urls.current = next.map(scan => scan.url);
    setScans(next); setDetections([]); setPreview(0); setCompleted(null); setError('');
    setBusy(true); busyRef.current = true; setProgress(0); setStatus('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const { recognizeScreenshots } = await import('../lib/ocr');
      await recognizeScreenshots(files, (_message, fraction) => {
        if (active.current) setProgress(fraction);
      }, (file, result) => {
        if (!active.current) return;
        setScans(current => current.map(scan => scan.file === file ? { ...scan, read: true } : scan));
        const matched = matchOcrLines(result.lines, catalog, file.name, screenshotSource);
        setDetections(current => {
          const byId = new Map(current.map(detection => [detection.item.id, detection]));
          for (const detection of matched) {
            const previous = byId.get(detection.item.id);
            if (!previous) byId.set(detection.item.id, detection);
            else byId.set(detection.item.id, {
              ...(detection.confidence > previous.confidence ? detection : previous),
              mastered: previous.mastered || detection.mastered, owned: previous.owned || detection.owned,
              rank: detection.rank ?? previous.rank,
            });
          }
          return [...byId.values()];
        });
      }, abort.signal);
      if (active.current) setProgress(1);
    } catch (problem) {
      if (active.current) {
        if (abort.signal.aborted) setStatus('Reading canceled.');
        else setError(problem instanceof Error ? problem.message : 'Could not read this image. Try a clearer screenshot.');
      }
    } finally {
      busyRef.current = false;
      if (active.current) setBusy(false);
    }
  };
  const processRef = useRef(processFiles); processRef.current = processFiles;
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (document.querySelector('dialog[open]') || event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return;
      const files = [...(event.clipboardData?.items || [])].filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
      if (files.length) { event.preventDefault(); void processRef.current(files, pasteSource.current); }
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, []);
  const update = (id: string, patch: Partial<Detection>) => setDetections(current => current.map(detection => detection.id === id ? { ...detection, ...patch } : detection));
  const selected = detections.filter(detection => detection.selected);
  const currentScan = scans[preview];
  const clear = () => {
    urls.current.forEach(URL.revokeObjectURL); urls.current = [];
    setScans([]); setDetections([]); setCompleted(null); setError(''); setStatus(''); setProgress(0); setPreview(0);
  };
  const save = () => {
    const observations = selected.map(detection => ({ ...createEquipment(detection.item), owned: detection.owned, mastered: detection.mastered, rank: detection.rank, source: `Screenshot · ${detection.filename}` }));
    const result = onImport(observations, scans.filter(scan => scan.read).map(scan => scan.file.name));
    if (result) setCompleted(result);
  };
  return <section className="import-section" aria-labelledby="import-title">
    <div className="section-heading"><h1 id="import-title">Import screenshots</h1></div>
    <div className="import-sources">{importSources.map(({ value, label }) => <section key={value} className="import-source" aria-labelledby={`${value}-import-title`} onFocusCapture={() => { pasteSource.current = value; }} onPointerDownCapture={() => { pasteSource.current = value; }}>
      <div className="section-heading import-source-heading">
        <h2 id={`${value}-import-title`}>{label}</h2>
        <div className="import-actions">
          <button type="button" className="button secondary" aria-label={`${label} instructions`} aria-haspopup="dialog" onClick={() => setHelp(value)}><CircleHelp size={16} aria-hidden="true" />Instructions</button>
          {source === value && (busy ? <button type="button" className="button secondary" onClick={() => controller.current?.abort()}>Cancel reading</button> : scans.length > 0 && <button type="button" className="button secondary" onClick={clear}>{completed ? 'Import more' : 'Clear'}</button>)}
        </div>
      </div>
    <input ref={node => { inputs.current[value] = node; }} className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label={`Choose ${label.toLowerCase()} screenshots`} tabIndex={-1} disabled={busy || scans.length > 0} onChange={event => { void processFiles([...event.target.files || []], value); event.target.value = ''; }} />
    {source === value && error && <p className="callout danger" role="alert">{error}</p>}
    {(!scans.length || source !== value) && <button type="button" className={`drop-zone ${dragging === value ? 'dragging' : ''}`} disabled={busy || scans.length > 0} onClick={() => inputs.current[value]?.click()} onDragOver={event => { event.preventDefault(); if (!busy && !scans.length) setDragging(value); }} onDragLeave={() => setDragging(null)} onDrop={event => { event.preventDefault(); setDragging(null); void processFiles([...event.dataTransfer.files], value); }}>
      <span>Drop, paste, or choose screenshots</span>
      <small>{completed ? 'Select Import more to start another batch' : scans.length ? 'Finish or clear the current batch first' : 'PNG, JPG, WebP · up to 10 images · 20 MB each'}</small>
    </button>}
    {source === value && <>
    {busy && <div className="import-progress"><span role="status">Reading screenshots… {Math.round(progress * 100)}%</span><progress value={progress} max={1} aria-label="Screenshot reading progress" /></div>}
    {!!scans.length && !completed && <details className="import-preview"><summary>Screenshot preview</summary>
      {scans.length > 1 && <Select className="preview-picker" label="Preview screenshot" value={String(preview)} onChange={value => setPreview(Number(value))} options={scans.map((scan, index) => ({ value: String(index), label: `${index + 1}. ${scan.file.name}` }))} />}
      <div className="image-preview"><img src={currentScan.url} alt={`Import source: ${currentScan.file.name}`} /></div>
    </details>}
    {!busy && !completed && status && <p className="import-status" role="status">{status}</p>}
    {!!scans.length && !busy && !completed && (detections.length ? <section className="review-section" aria-labelledby="review-title">
      <div className="section-heading"><h3 id="review-title">Review matches</h3><div className="import-actions">
        <button type="button" className="button secondary" onClick={() => setDetections(current => current.map(detection => ({ ...detection, selected: !current.every(entry => entry.selected) })))}>{detections.every(detection => detection.selected) ? 'Deselect all' : 'Select all'}</button>
        <button type="button" className="button primary" disabled={!selected.length} onClick={save}>Import {selected.length} {selected.length === 1 ? 'item' : 'items'}</button>
      </div></div>
      <div className="table-scroll" role="region" aria-label="Screenshot matches" tabIndex={0}><table className="review-table">
        <caption className="sr-only">Review names, ownership, mastery, and rank before importing selected rows. Existing ownership and mastery are preserved.</caption>
        <thead><tr><th scope="col">Import</th><th scope="col">Equipment</th><th scope="col" title="Imports preserve existing ownership.">Owned</th><th scope="col" title="Imports preserve existing mastery. Rank alone does not establish mastery.">Mastered</th><th scope="col">Rank</th></tr></thead>
        <tbody>{detections.map(detection => <tr key={detection.id}>
          <td><label className="table-checkbox"><input type="checkbox" checked={detection.selected} aria-label={`Import ${detection.item.name}`} onChange={event => update(detection.id, { selected: event.target.checked })} /></label></td>
          <td className="match-cell"><Select value={detection.item.id} label={`Matched name for ${detection.rawText}`} onChange={value => { const entry = catalog.find(item => item.id === value); if (entry) update(detection.id, { item: entry, exact: false }); }} options={equipmentOptions} /><small>Read: {detection.rawText}</small>{(!detection.exact || detection.confidence < 65) && <span className="badge caution-badge">Check match</span>}</td>
          <td><label className="table-checkbox"><input type="checkbox" checked={detection.owned} aria-label={`Owned: ${detection.item.name}`} onChange={event => update(detection.id, { owned: event.target.checked })} /></label></td>
          <td><label className="table-checkbox"><input type="checkbox" checked={detection.mastered} aria-label={`Mastered: ${detection.item.name}`} onChange={event => update(detection.id, { mastered: event.target.checked })} /></label></td>
          <td><input className="rank-input" type="number" min={0} max={40} step={1} value={detection.rank ?? ''} placeholder="—" aria-label={`Rank: ${detection.item.name}`} onChange={event => { const value = Number(event.target.value); update(detection.id, { rank: event.target.value !== '' && Number.isInteger(value) && value >= 0 && value <= 40 ? value : null }); }} /></td>
        </tr>)}</tbody>
      </table></div>
    </section> : !status && !error && <p className="import-status" role="status">No equipment matched.</p>)}
    {completed && <div className="import-result"><span role="status">{completed.added} added · {completed.updated} updated</span><button type="button" className="button primary" onClick={onInventory}>View inventory</button></div>}
    </>}
    </section>)}</div>
    {help && <ScreenshotHelp source={help} onClose={() => setHelp(null)} />}
  </section>;
}
