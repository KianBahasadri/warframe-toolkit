import { execFile } from 'node:child_process';

export const PUBLIC_EXPORT = 'https://content.warframe.com/PublicExport';
export const EXPORT_INDEX = `${PUBLIC_EXPORT}/index_en.txt.lzma`;

export async function checkedFetch(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return response;
}

// Some exports contain literal control characters inside JSON strings.
export function parseExport(text) {
  let quoted = false, escaped = false, normalized = '';
  for (const char of text.replace(/^\uFEFF/, '')) {
    if (quoted && char.charCodeAt(0) < 32) normalized += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    else normalized += char;
    if (char === '"' && !escaped) quoted = !quoted;
    escaped = char === '\\' && !escaped;
  }
  return JSON.parse(normalized);
}

export async function fetchPublicExport(keys) {
  const compressed = Buffer.from(await (await checkedFetch(EXPORT_INDEX)).arrayBuffer());
  const index = await new Promise((resolve, reject) => {
    const child = execFile('xz', ['--decompress', '--format=lzma', '--stdout'], { maxBuffer: 1024 * 1024, timeout: 30_000 }, (error, stdout) => error ? reject(new Error('Cannot decode Public Export index; install xz.', { cause: error })) : resolve(stdout));
    child.stdin.on('error', () => {});
    child.stdin.end(compressed);
  });
  const files = index.trim().split(/\r?\n/);
  const sources = {};
  const entries = await Promise.all(keys.map(async key => {
    const file = files.find(file => file.startsWith(`${key}${key === 'ExportManifest' ? '' : '_en'}.json!`));
    if (!file || !/^Export[A-Za-z_]+\.json![A-Za-z0-9_+!\-]+$/.test(file)) throw new Error(`Missing or invalid ${key} in Public Export index`);
    const url = `${PUBLIC_EXPORT}/Manifest/${file}`;
    const data = parseExport(await (await checkedFetch(url)).text());
    const rows = data[key === 'ExportManifest' ? 'Manifest' : key];
    if (!Array.isArray(rows) || !rows.length) throw new Error(`Empty or invalid ${key}`);
    sources[key] = url;
    return [key, rows];
  }));
  return { exports: Object.fromEntries(entries), sources: Object.fromEntries(Object.entries(sources).sort()) };
}
