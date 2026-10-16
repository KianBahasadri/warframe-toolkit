import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const directory = 'build/azure-market';
await mkdir(`${directory}/market`, { recursive: true });
await build({ entryPoints: ['azure/market/index.ts'], outfile: `${directory}/index.cjs`, bundle: true, format: 'cjs', platform: 'node', target: 'node24', minify: true });
await copyFile('azure/host.json', `${directory}/host.json`);
await copyFile('azure/market/function.json', `${directory}/market/function.json`);
// Stable entry order and timestamps keep repeated plans empty. A content-based
// filename makes Terraform deploy every code change on local machines and CI.
execFileSync('python3', ['-c', `
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
root = Path('${directory}')
with ZipFile('build/azure-market.zip', 'w', compression=ZIP_DEFLATED) as archive:
    for name in ['host.json', 'index.cjs', 'market/function.json']:
        entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, (root / name).read_bytes())
`]);
const bytes = await readFile('build/azure-market.zip');
const hash = createHash('sha256').update(bytes).digest('hex');
await writeFile(`build/azure-market-${hash}.zip`, bytes);
await writeFile('build/azure-market.sha256', `${hash}\n`);
