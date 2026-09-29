import { defineConfig } from '@playwright/test';
// Desktop specs launch Electron with this environment; keep their windows off screen.
process.env.LEAF_HIDDEN_WINDOW ??= '1';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  // Fresh CI runners must transform lazy readers and generate eight PDF covers.
  expect: { timeout: process.env.CI ? 30000 : 5000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    viewport: { width: 1440, height: 960 },
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
