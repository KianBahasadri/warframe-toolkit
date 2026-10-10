import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ClipboardPaste, ImagePlus, ScanLine, Upload, X } from 'lucide-react';
import { catalog } from '../data/catalog';
import { createEquipment, normalizeName } from '../lib/model';
import type { Equipment, ImportLog } from '../lib/model';
import { matchOcrLines } from '../lib/matching';
import type { Detection, ScreenshotSource } from '../lib/matching';
import type { OcrResult } from '../lib/ocr';

interface Scan { file: File; url: string; result?: OcrResult }

export function ScreenshotImport({ items, history, onImport, onInventory }: { items: Equipment[]; history: ImportLog[]; onImport: (observations: Equipment[], files: string[]) => { added: number; updated: number } | null; onInventory: () => void }) {
  const [source, setSource] = useState<ScreenshotSource>('inventory');
  const [scans, setScans] = useState<Scan[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [completed, setCompleted] = useState<{ added: number; updated: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const urls = useRef<string[]>([]);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); urls.current.forEach(URL.revokeObjectURL); }; }, []);

  const processFiles = async (files: File[]) => {
    if (busyRef.current || !files.length) return;
    if (files.length > 10) { setError('Choose up to 10 screenshots at a time.'); return; }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) { setError('Use PNG, JPG, or WebP screenshots.'); return; }
    if (files.some(file => file.size > 20 * 1024 * 1024)) { setError('Each screenshot must be smaller than 20 MB.'); return; }
    urls.current.forEach(URL.revokeObjectURL);
    const next = files.map(file => ({ file, url: URL.createObjectURL(file) }));
    urls.current = next.map(scan => scan.url);
    setScans(next); setDetections([]); setPreview(0); setCompleted(null); setError('');
    setBusy(true); busyRef.current = true; setProgress(0); setStatus('Preparing the screenshot reader');
    const abort = new AbortController(); controller.current = abort;
    try {
      const { recognizeScreenshots } = await import('../lib/ocr');
      await recognizeScreenshots(files, (message, fraction) => {
        if (active.current) { setStatus(message); setProgress(fraction); }
      }, (file, result) => {
        if (!active.current) return;
        setScans(current => current.map(scan => scan.file === file ? { ...scan, result } : scan));
        const matched = matchOcrLines(result.lines, catalog, file.name, source);
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
      if (active.current) { setProgress(1); setStatus('Reading complete'); }
    } catch (problem) {
      if (active.current) {
        if (abort.signal.aborted) setStatus('Reading canceled. Completed results are still available below.');
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
      if ((event.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return;
      const files = [...(event.clipboardData?.items || [])].filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
      if (files.length) { event.preventDefault(); void processRef.current(files); }
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, []);
  const update = (id: string, patch: Partial<Detection>) => setDetections(current => current.map(detection => detection.id === id ? { ...detection, ...patch } : detection));
  const selected = detections.filter(detection => detection.selected);
  const currentScan = scans[preview];
  return <>
    <div className="page-heading"><div><p className="eyebrow">LESS TYPING. MORE PLAYING.</p><h1>Import screenshots</h1><p className="page-description">Drop in your inventory. Review the matches. Get back to the Origin System.</p></div></div>
    <ol className="import-steps"><li className={!scans.length ? 'current' : ''}><span>01</span> Add screenshots</li><li className={scans.length && !completed ? 'current' : ''}><span>02</span> Review equipment</li><li className={completed ? 'current' : ''}><span>03</span> Save to inventory</li></ol>
    <div className="import-controls"><label>Screenshots from<select value={source} disabled={busy || scans.length > 0} onChange={event => setSource(event.target.value as ScreenshotSource)}><option value="inventory">Inventory · owned equipment</option><option value="arsenal">Arsenal · review ownership</option></select></label><p>{source === 'inventory' ? 'Matches start as owned. Use equipment screens, not blueprints or the Foundry.' : 'Arsenal lists may include unowned items. Check Owned for the equipment you have.'}</p></div>
    <input ref={input} className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="Choose screenshots" tabIndex={-1} onChange={event => { void processFiles([...event.target.files || []]); event.target.value = ''; }} />
    {!scans.length ? <button type="button" className={`drop-zone ${dragging ? 'dragging' : ''}`} onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void processFiles([...event.dataTransfer.files]); }}><span className="upload-symbol"><ImagePlus size={28} /></span><strong>Drop your screenshots here</strong><span>or click to browse files</span><span className="upload-formats">PNG, JPG, WebP · up to 10 images · 20 MB each</span><span className="paste-hint"><ClipboardPaste size={14} />You can also paste an image from your clipboard</span></button>
      : <div className="scan-workspace">
        <div className="scan-preview"><div className="preview-header"><span>Source screenshots <span className="count">{scans.length}</span></span><button type="button" className="button quiet" disabled={busy} onClick={() => { urls.current.forEach(URL.revokeObjectURL); urls.current = []; setScans([]); setDetections([]); setCompleted(null); setError(''); }}>Clear</button></div><div className="image-preview"><img src={currentScan.url} alt={`Import source: ${currentScan.file.name}`} /></div><div className="preview-tabs">{scans.map((scan, index) => <button type="button" className={`preview-tab ${preview === index ? 'selected' : ''}`} key={`${scan.file.name}-${index}`} onClick={() => setPreview(index)} aria-label={`Preview screenshot ${index + 1}`} aria-pressed={preview === index}><img src={scan.url} alt="" />{scan.result && <Check size={12} />}</button>)}</div><p className="file-name">{currentScan.file.name}</p></div>
        <div className="scan-details"><ScanLine size={28} /><h2>{busy ? 'Reading your equipment…' : completed ? 'Inventory updated' : 'Ready for your review'}</h2><p>{busy ? 'Recognizing text and matching equipment names. The first image takes a little longer.' : completed ? 'Your equipment and existing planning notes are saved in this browser.' : 'Check the names, ownership, and mastery below. Uncertain matches start unchecked.'}</p><div className="scan-stat"><strong>{detections.length}</strong><span>equipment matched</span></div><p className="muted small">Mastery is checked only when “Mastered” is read on the same line. A rank alone does not establish full mastery.</p>{busy && <><progress value={progress} max={1} aria-label="Screenshot reading progress" /><p className="small" role="status">{status}</p><button type="button" className="button secondary" onClick={() => controller.current?.abort()}><X size={16} />Cancel reading</button></>}{!busy && !completed && <p className="small muted" role="status">{status}</p>}</div>
      </div>}
    {error && <p className="callout danger" role="alert"><strong>Import problem:</strong> {error}</p>}
    {!scans.length && <div className="import-notes"><div><span className="note-number">01</span><h3>Names in clear view</h3><p>Use full-resolution English screenshots. Item names should be visible and unobstructed.</p></div><div><span className="note-number">02</span><h3>You have the final say</h3><p>Review the recognized items before saving. Repeated items merge into their existing entries.</p></div><div><span className="note-number">03</span><h3>Stays on your device</h3><p>Reading happens in your browser. Your screenshots are never uploaded or saved in the backup.</p></div></div>}
    {!!scans.length && !busy && !completed && <section className="review-section" aria-labelledby="review-title"><div className="section-heading"><div><h2 id="review-title">Review equipment <span className="count">{detections.length}</span></h2><p className="muted small">Only selected rows will be imported. Your keep preferences and notes are preserved.</p></div><button type="button" className="button secondary" onClick={() => setDetections(current => current.map(detection => ({ ...detection, selected: !current.every(entry => entry.selected) })))} disabled={!detections.length}>{detections.every(detection => detection.selected) && detections.length ? 'Deselect all' : 'Select all'}</button></div>
      {detections.length ? <div className="table-scroll"><table className="review-table"><caption className="sr-only">Review screenshot matches before importing</caption><thead><tr><th scope="col">Import</th><th scope="col">Matched equipment</th><th scope="col">Match</th><th scope="col">Owned</th><th scope="col">Mastered</th><th scope="col">Rank</th></tr></thead><tbody>{detections.map(detection => <tr key={detection.id}><td><label className="table-checkbox"><input type="checkbox" checked={detection.selected} aria-label={`Import ${detection.item.name}`} onChange={event => update(detection.id, { selected: event.target.checked })} /></label></td><td className="match-cell"><select value={detection.item.id} aria-label={`Matched name for ${detection.rawText}`} onChange={event => { const entry = catalog.find(item => item.id === event.target.value); if (entry) update(detection.id, { item: entry, exact: false }); }}>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>Read: {detection.rawText}<span> · {items.some(item => normalizeName(item.name) === normalizeName(detection.item.name)) ? 'Updates existing item' : 'New equipment'}</span></small></td><td><span className={`badge ${detection.exact && detection.confidence >= 65 ? 'good-badge' : 'caution-badge'}`}>{detection.exact && detection.confidence >= 65 ? 'Exact name' : 'Check match'}</span></td><td><label className="table-checkbox"><input type="checkbox" checked={detection.owned} aria-label={`Owned: ${detection.item.name}`} onChange={event => update(detection.id, { owned: event.target.checked })} /></label></td><td><label className="table-checkbox"><input type="checkbox" checked={detection.mastered} aria-label={`Mastered: ${detection.item.name}`} onChange={event => update(detection.id, { mastered: event.target.checked })} /></label></td><td><input className="rank-input" type="number" min={0} max={40} step={1} value={detection.rank ?? ''} placeholder="—" aria-label={`Rank: ${detection.item.name}`} onChange={event => { const value = Number(event.target.value); update(detection.id, { rank: event.target.value !== '' && Number.isInteger(value) && value >= 0 && value <= 40 ? value : null }); }} /></td></tr>)}</tbody></table></div> : <div className="empty-state"><ScanLine size={28} /><h3>No equipment names matched</h3><p>Try a closer crop with readable item names. You can inspect the text below or add the equipment manually.</p></div>}
      <p className="small muted">Existing ownership and mastery checks stay set. Clear them in the inventory if needed.</p>
      <div className="import-footer"><span>{selected.length} selected · duplicate names are merged</span><button type="button" className="button primary" disabled={!selected.length} onClick={() => {
        const observations = selected.map(detection => ({ ...createEquipment(detection.item), owned: detection.owned, mastered: detection.mastered, rank: detection.rank, source: `Screenshot · ${detection.filename}` }));
        const result = onImport(observations, scans.filter(scan => scan.result).map(scan => scan.file.name));
        if (result) setCompleted(result);
      }}><Upload size={16} />Import {selected.length} {selected.length === 1 ? 'item' : 'items'}</button></div>
    </section>}
    {completed && <div className="callout success import-success"><div><strong>Saved to your inventory.</strong><p>{completed.added} added · {completed.updated} updated</p></div><button type="button" className="button primary" onClick={onInventory}>View inventory<ArrowRight size={16} /></button></div>}
    {!!scans.length && !busy && <details className="recognized-text"><summary>Inspect recognized text</summary>{scans.filter(scan => scan.result).map((scan, i) => <div key={i}><h3>{scan.file.name}</h3><pre>{scan.result?.text || 'No text detected.'}</pre></div>)}</details>}
    {!!history.length && <section className="history-section"><h2>Recent imports</h2>{history.slice(0, 5).map(log => <div className="history-row" key={log.id}><span className="history-icon"><Check size={16} /></span><div><strong>{log.files.length} {log.files.length === 1 ? 'screenshot' : 'screenshots'}</strong><p>{log.added} added · {log.updated} updated</p></div><time dateTime={log.date}>{new Date(log.date).toLocaleString()}</time></div>)}</section>}
  </>;
}
