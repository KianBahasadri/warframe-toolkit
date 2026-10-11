import { build } from 'esbuild';
await build({ entryPoints: ['cloudflare/index.ts'], outfile: 'build/cloudflare/worker.js', bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', conditions: ['workerd', 'worker', 'browser'], external: ['node:*', 'cloudflare:workers'], minify: true });
