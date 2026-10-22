import type { Connect } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createDropTableCache } from './server/dropTableCache.ts';
import { createAccountsApi } from './server/accounts.ts';
import { createMarketMiddleware } from './server/marketMiddleware.ts';
import { documentRedirect } from './src/lib/seo.ts';

const redirectDocuments: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const target = documentRedirect(url.pathname, url.search);
  if (!target) return next();
  res.statusCode = 301;
  res.setHeader('Location', target);
  res.end();
};

export default defineConfig({
  plugins: [react(), {
    name: 'live-drop-tables',
    configureServer(server) {
      server.middlewares.use(redirectDocuments);
      const cache = createDropTableCache();
      const market = createMarketMiddleware();
      const accounts = createAccountsApi({ databasePath: process.env.ACCOUNTS_DATABASE, origin: process.env.ACCOUNTS_ORIGIN });
      server.middlewares.use(cache.middleware);
      server.middlewares.use(market.middleware);
      server.middlewares.use(accounts.middleware);
      server.httpServer?.once('close', () => { cache.stop(); market.stop(); accounts.close(); });
      void cache.start();
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirectDocuments);
      const cache = createDropTableCache();
      const market = createMarketMiddleware();
      const accounts = createAccountsApi({ databasePath: process.env.ACCOUNTS_DATABASE, origin: process.env.ACCOUNTS_ORIGIN });
      server.middlewares.use(cache.middleware);
      server.middlewares.use(market.middleware);
      server.middlewares.use(accounts.middleware);
      server.httpServer.once('close', () => { cache.stop(); market.stop(); accounts.close(); });
      void cache.start();
    },
  }],
  server: { port: 5173, strictPort: true, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**', '**/*.sqlite*'] } },
});
