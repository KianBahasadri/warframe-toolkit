import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { catalog } from '../data/catalog';
import { createEquipment } from '../lib/model';
import type { Equipment } from '../lib/model';
import { appendDetections, matchOcrLines, reviewDetection } from '../lib/matching';
import type { Detection, ScreenshotSource } from '../lib/matching';
import { Select } from './Select';
import { ScreenshotHelp } from './ScreenshotHelp';
import { ScreenshotGallery } from './ScreenshotGallery';

const equipmentOptions = catalog.map(item => ({ value: item.id, label: item.name }));
const importSources = [{ value: 'inventory', label: 'Inventory' }, { value: 'codex', label: 'Codex' }] as const;

interface Scan { file: File; url: string; read: boolean }
interface Batch { source: ScreenshotSource | null; scans: Scan[]; pending: File[]; completed: boolean }

export function ScreenshotImport({ onImport, onInventory }: { onImport: (observations: Equipment[], files: string[]) => { added: number; updated: number } | null; onInventory: () => void }) {
  const [source, setSource] = useState<ScreenshotSource>('inventory');
  const [pasteTarget, setPasteTarget] = useState<ScreenshotSource>('inventory');
  const [help, setHelp] = useState<ScreenshotSource | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [departing, setDeparting] = useState<ScreenshotSource | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState<ScreenshotSource | null>(null);
  const [completed, setCompleted] = useState<{ added: number; updated: number } | null>(null);
  const inputs = useRef<Record<ScreenshotSource, HTMLInputElement | null>>({ inventory: null, codex: null });
  const sourceStage = useRef<HTMLDivElement | null>(null);
  const pasteSource = useRef<ScreenshotSource>('inventory');
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const batch = useRef<Batch>({ source: null, scans: [], pending: [], completed: false });
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); batch.current.pending = []; batch.current.scans.forEach(scan => URL.revokeObjectURL(scan.url)); }; }, []);
  useEffect(() => {
    if (!departing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDeparting(null); return; }
    // Also finish if a resize or browser interruption cancels the CSS transition.
    const timeout = window.setTimeout(() => setDeparting(null), 320);
    return () => window.clearTimeout(timeout);
  }, [departing]);
  const choosePasteSource = useCallback((value: ScreenshotSource) => {
    if (batch.current.source || batch.current.completed || document.querySelector('dialog[open]')) return;
    pasteSource.current = value;
    setPasteTarget(value);
  }, []);
  useEffect(() => {
    const followPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || batch.current.source || document.querySelector('dialog[open]')) return;
      const stage = sourceStage.current?.getBoundingClientRect();
      if (!stage) return;
      // Keep the hit boundary stationary while the panels move beneath it.
      const beforeDivider = window.matchMedia('(max-width: 900px)').matches
        ? event.clientY < stage.top + stage.height / 2
        : event.clientX < stage.left + stage.width / 2;
      choosePasteSource(beforeDivider ? 'inventory' : 'codex');
    };
    document.addEventListener('pointermove', followPointer);
    return () => document.removeEventListener('pointermove', followPointer);
  }, [choosePasteSource]);

  const processFiles = async (files: File[], screenshotSource: ScreenshotSource) => {
    if (!files.length || batch.current.completed || controller.current?.signal.aborted || (batch.current.source && batch.current.source !== screenshotSource)) return;
    setSource(screenshotSource);
    if (batch.current.scans.length + files.length > 10) { setError('Up to 10 screenshots per batch. Import or clear this batch before adding more.'); return; }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) { setError('Use PNG, JPG, or WebP screenshots.'); return; }
    if (files.some(file => file.size > 20 * 1024 * 1024)) { setError('Each screenshot must be smaller than 20 MB.'); return; }
    const next = files.map(file => ({ file, url: URL.createObjectURL(file), read: false }));
    if (!batch.current.source) setDeparting(screenshotSource === 'inventory' ? 'codex' : 'inventory');
    batch.current.source = screenshotSource;
    batch.current.scans = [...batch.current.scans, ...next];
    batch.current.pending.push(...files);
    pasteSource.current = screenshotSource;
    setPasteTarget(screenshotSource);
    setScans(batch.current.scans); setError(''); setStatus('');
    if (busyRef.current) return;
    setBusy(true); busyRef.current = true; setProgress(0); setStatus('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const { recognizeScreenshots } = await import('../lib/ocr');
      while (batch.current.pending.length) {
        const queued = batch.current.pending.splice(0);
        const readCount = batch.current.scans.filter(scan => scan.read).length;
        await recognizeScreenshots(queued, (_message, fraction) => {
          if (active.current) setProgress((readCount + fraction * queued.length) / batch.current.scans.length);
        }, (file, result) => {
          if (!active.current || abort.signal.aborted) return;
          batch.current.scans = batch.current.scans.map(scan => scan.file === file ? { ...scan, read: true } : scan);
          setScans(batch.current.scans);
          const matched = matchOcrLines(result.lines, catalog, file.name, screenshotSource);
          setDetections(current => appendDetections(current, matched));
        }, abort.signal, screenshotSource);
      }
      if (active.current) setProgress(1);
    } catch (problem) {
      if (active.current) {
        if (abort.signal.aborted) setStatus('Reading canceled.');
        else setError(problem instanceof Error ? problem.message : 'Could not read this image. Try a clearer screenshot.');
      }
    } finally {
      // Failed/canceled images can be added again without clearing read results.
      batch.current.pending = [];
      batch.current.scans.filter(scan => !scan.read).forEach(scan => URL.revokeObjectURL(scan.url));
      batch.current.scans = batch.current.scans.filter(scan => scan.read);
      if (!batch.current.scans.length) batch.current.source = null;
      controller.current = null;
      busyRef.current = false;
      if (active.current) {
        setScans(batch.current.scans);
        if (!batch.current.scans.length) { setDeparting(null); setViewing(null); }
        setBusy(false);
      }
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
  const update = (id: string, patch: Partial<Detection>) => setDetections(current => current.map(detection => detection.id === id ? reviewDetection(detection, patch) : detection));
  const selected = detections.filter(detection => detection.selected);
  const hasBatch = scans.length > 0 || !!completed;
  const visibleSources = importSources.filter(entry => !hasBatch || entry.value === source || entry.value === departing);
  const clear = () => {
    batch.current.scans.forEach(scan => URL.revokeObjectURL(scan.url));
    batch.current = { source: null, scans: [], pending: [], completed: false };
    setScans([]); setDetections([]); setCompleted(null); setError(''); setStatus(''); setProgress(0); setDeparting(null); setViewing(null);
  };
  const save = () => {
    if (busyRef.current || batch.current.completed || !selected.length) return;
    const observations = selected.map(detection => ({ ...createEquipment(detection.item), owned: detection.owned, mastered: detection.mastered, rank: detection.rank, source: `Screenshot · ${detection.filename}` }));
    const result = onImport(observations, scans.filter(scan => scan.read).map(scan => scan.file.name));
    if (result) { batch.current.completed = true; setCompleted(result); }
  };
  return <section className="import-section" aria-label="Import screenshots">
    <div ref={sourceStage} className={`import-sources${hasBatch ? ' has-batch' : ''}`}>{visibleSources.map(({ value, label }) => <section key={value} data-source={value} className={`import-source${!hasBatch && pasteTarget === value ? ' is-paste-target' : ''}${departing === value ? ' is-exiting' : ''}`} inert={departing === value} aria-hidden={departing === value ? true : undefined} aria-labelledby={`${value}-import-title`} aria-description={!hasBatch && pasteTarget === value ? 'Selected for screenshot paste' : undefined} onFocusCapture={() => choosePasteSource(value)} onPointerDownCapture={() => choosePasteSource(value)} onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === 'transform' && departing === value) setDeparting(null); }}>
      <div className="import-source-content">
      <div className="section-heading import-source-heading">
        <h2 id={`${value}-import-title`}>{label}</h2>
        <div className="import-actions">
          <button type="button" className="button quiet" aria-label={`${label} instructions`} aria-haspopup="dialog" onClick={() => setHelp(value)}><CircleHelp size={16} aria-hidden="true" />Instructions</button>
          {source === value && (busy ? <button type="button" className="button secondary" onClick={() => controller.current?.abort()}>Cancel reading</button> : (scans.length > 0 || status || error) && <button type="button" className="button secondary" onClick={clear}>{completed ? 'Import more' : 'Clear'}</button>)}
        </div>
      </div>
    <input ref={node => { inputs.current[value] = node; }} className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label={`Choose ${label.toLowerCase()} screenshots`} tabIndex={-1} disabled={!!completed} onChange={event => { void processFiles([...event.target.files || []], value); event.target.value = ''; }} />
    {source === value && error && <p className="callout danger" role="alert">{error}</p>}
    {!completed && <button type="button" className={`drop-zone ${scans.length && source === value ? 'drop-zone-compact' : ''} ${dragging === value ? 'dragging' : ''}`} aria-labelledby={`${value}-upload-label ${value}-upload-limits`} onClick={() => inputs.current[value]?.click()} onDragOver={event => { event.preventDefault(); choosePasteSource(value); setDragging(value); }} onDragLeave={() => setDragging(null)} onDrop={event => { event.preventDefault(); setDragging(null); void processFiles([...event.dataTransfer.files], value); }}>
      {(!hasBatch || departing === value) && <img className="import-source-example" src={`/images/import/${value}-weapons.png`} width={1920} height={1200} alt={value === 'inventory' ? 'Example Warframe Inventory screen showing weapons and ranks' : 'Example Warframe Codex screen showing weapons and mastery badges'} draggable={false} />}
      <span id={`${value}-upload-label`}>{scans.length && source === value ? 'Add screenshots' : 'Drag and drop or Ctrl+V to paste. Or click to open file browser'}</span>
      <small id={`${value}-upload-limits`}>{scans.length && source === value ? `Drop, paste, or choose · ${scans.length}/10 images` : 'PNG, JPG, WebP · up to 10 images · 20 MB each'}</small>
    </button>}
    {source === value && <>
    {busy && <div className="import-progress"><span role="status">Reading screenshots… {Math.round(progress * 100)}%</span><progress value={progress} max={1} aria-label="Screenshot reading progress" /></div>}
    {!!scans.length && !completed && <section className="import-preview" aria-label="Screenshot preview">
      <ul className="screenshot-gallery" aria-label="Screenshot previews">{scans.map((scan, index) => <li key={scan.url}>
        <figure>
          <button type="button" className="image-preview" aria-label={`View screenshot ${index + 1}: ${scan.file.name}`} aria-haspopup="dialog" onClick={() => setViewing(scan.url)}><img src={scan.url} alt={`Import source: ${scan.file.name}`} /></button>
          <figcaption>{index + 1}. {scan.file.name}</figcaption>
        </figure>
      </li>)}</ul>
    </section>}
    {!busy && !completed && status && <p className="import-status" role="status">{status}</p>}
    {!!scans.length && !completed && (detections.length ? <section className="review-section" aria-labelledby="review-title">
      <div className="section-heading"><h3 id="review-title">Review matches</h3><div className="import-actions">
        <button type="button" className="button secondary" onClick={() => setDetections(current => current.map(detection => reviewDetection(detection, { selected: !current.every(entry => entry.selected) })))}>{detections.every(detection => detection.selected) ? 'Deselect all' : 'Select all'}</button>
        <button type="button" className="button primary" disabled={busy || !selected.length} title={busy ? 'Finish or cancel reading before importing.' : undefined} onClick={save}>Import {selected.length} {selected.length === 1 ? 'item' : 'items'}</button>
      </div></div>
      <div className="table-scroll" role="region" aria-label="Screenshot matches" tabIndex={0}><table className="review-table">
        <caption className="sr-only">Review names, ownership, mastery, and rank before importing selected rows. Existing ownership and mastery are preserved.</caption>
        <thead><tr><th scope="col">Import</th><th scope="col">Equipment</th><th scope="col" title="Imports preserve existing ownership.">Owned</th><th scope="col" title="Checked from a recognized Codex mastery badge or the catalog's maximum rank. Modular equipment needs review unless a badge was recognized. Existing mastery is preserved.">Mastered</th><th scope="col">Rank</th></tr></thead>
        <tbody>{detections.map(detection => <tr key={detection.id}>
          <td><label className="table-checkbox"><input type="checkbox" checked={detection.selected} aria-label={`Import ${detection.item.name}`} onChange={event => update(detection.id, { selected: event.target.checked })} /></label></td>
          <td className="match-cell"><Select value={detection.item.id} label={`Matched name for ${detection.rawText}`} onChange={value => { const entry = catalog.find(item => item.id === value); if (entry) update(detection.id, { item: entry, exact: false }); }} options={equipmentOptions} /><small>Read: {detection.rawText}</small>{(!detection.exact || detection.confidence < 65) && <span className="badge caution-badge">Check match</span>}</td>
          <td><label className="table-checkbox"><input type="checkbox" checked={detection.owned} aria-label={`Owned: ${detection.item.name}`} onChange={event => update(detection.id, { owned: event.target.checked })} /></label></td>
          <td><label className="table-checkbox"><input type="checkbox" checked={detection.mastered} aria-label={`Mastered: ${detection.item.name}`} onChange={event => update(detection.id, { mastered: event.target.checked })} /></label></td>
          <td><input className="rank-input" type="number" min={0} max={40} step={1} value={detection.rank ?? ''} placeholder="—" aria-label={`Rank: ${detection.item.name}`} onChange={event => { const value = Number(event.target.value); update(detection.id, { rank: event.target.value !== '' && Number.isInteger(value) && value >= 0 && value <= 40 ? value : null }); }} /></td>
        </tr>)}</tbody>
      </table></div>
    </section> : !busy && !status && !error && <p className="import-status" role="status">No equipment matched.</p>)}
    {completed && <div className="import-result"><span role="status">{completed.added} added · {completed.updated} updated</span><button type="button" className="button primary" onClick={onInventory}>View inventory</button></div>}
    </>}
    </div>
    </section>)}</div>
    {help && <ScreenshotHelp source={help} onClose={() => setHelp(null)} />}
    {viewing && !!scans.length && !completed && <ScreenshotGallery images={scans.map(scan => ({ url: scan.url, name: scan.file.name }))} activeUrl={viewing} onSelect={setViewing} onClose={() => setViewing(null)} />}
  </section>;
}
