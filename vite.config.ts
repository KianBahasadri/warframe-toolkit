import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dropTablesMiddleware } from './server/dropTables.ts';

export default defineConfig({
  plugins: [react(), {
    name: 'live-drop-tables',
    configureServer(server) { server.middlewares.use(dropTablesMiddleware); },
    configurePreviewServer(server) { server.middlewares.use(dropTablesMiddleware); },
  }],
  server: { port: 5173, strictPort: true },
});
