import { defineConfig } from '@playwright/test';

const browserName = process.env.WARFRAME_TEST_BROWSER === 'firefox' ? 'firefox' : 'chromium';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:5173', browserName, launchOptions: browserName === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : {}, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});
