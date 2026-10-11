import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createDropTableCache } from './server/dropTableCache.ts';
import { createAccountsApi } from './server/accounts.ts';

export default defineConfig({
  plugins: [react(), {
    name: 'live-drop-tables',
    configureServer(server) {
      const cache = createDropTableCache();
      const accounts = createAccountsApi({ databasePath: process.env.ACCOUNTS_DATABASE, origin: process.env.ACCOUNTS_ORIGIN });
      server.middlewares.use(cache.middleware);
      server.middlewares.use(accounts.middleware);
      server.httpServer?.once('close', () => { cache.stop(); accounts.close(); });
      void cache.start();
    },
    configurePreviewServer(server) {
      const cache = createDropTableCache();
      const accounts = createAccountsApi({ databasePath: process.env.ACCOUNTS_DATABASE, origin: process.env.ACCOUNTS_ORIGIN });
      server.middlewares.use(cache.middleware);
      server.middlewares.use(accounts.middleware);
      server.httpServer.once('close', () => { cache.stop(); accounts.close(); });
      void cache.start();
    },
  }],
  server: { port: 5173, strictPort: true, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**', '**/*.sqlite*'] } },
});
