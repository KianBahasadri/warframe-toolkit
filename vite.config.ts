import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createDropTableCache } from './server/dropTableCache.ts';

export default defineConfig({
  plugins: [react(), {
    name: 'live-drop-tables',
    configureServer(server) {
      const cache = createDropTableCache();
      server.middlewares.use(cache.middleware);
      server.httpServer?.once('close', () => cache.stop());
      void cache.start();
    },
    configurePreviewServer(server) {
      const cache = createDropTableCache();
      server.middlewares.use(cache.middleware);
      server.httpServer.once('close', () => cache.stop());
      void cache.start();
    },
  }],
  server: { port: 5173, strictPort: true },
});
