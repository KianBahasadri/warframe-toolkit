import type { Connect } from 'vite';
import { defineConfig, loadEnv } from 'vite';
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

export default defineConfig(({ mode }) => {
  // Vite exposes VITE_ keys to the browser, but server middleware must load its
  // own Clerk verification configuration from the matching environment file.
  const env = loadEnv(mode, process.cwd(), ['CLERK_', 'ACCOUNTS_']);
  const accountOptions = {
    databasePath: env.ACCOUNTS_DATABASE,
    origin: env.ACCOUNTS_ORIGIN,
    jwtKey: env.CLERK_JWT_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  };
  return {
  plugins: [react(), {
    name: 'live-drop-tables',
    configureServer(server) {
      server.middlewares.use(redirectDocuments);
      const cache = createDropTableCache();
      const market = createMarketMiddleware();
      const accounts = createAccountsApi(accountOptions);
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
      const accounts = createAccountsApi(accountOptions);
      server.middlewares.use(cache.middleware);
      server.middlewares.use(market.middleware);
      server.middlewares.use(accounts.middleware);
      server.httpServer.once('close', () => { cache.stop(); market.stop(); accounts.close(); });
      void cache.start();
    },
  }],
  server: { port: 5173, strictPort: true, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**', '**/*.sqlite*'] } },
  };
});
