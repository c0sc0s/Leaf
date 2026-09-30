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
    env: {
      VITE_LEAF_SEED_SAMPLES: '1',
      LEAF_TEST_PLUGINS: 'all',
      // ask.spec.ts serves a scripted OpenAI-compatible model here.
      LEAF_AI_BASE_URL: 'http://127.0.0.1:5199/v1',
      LEAF_AI_MODEL: 'mock-model',
      LEAF_AI_API_KEY: 'test-key',
    },
    // A plain `npm run dev` server does not seed the sample library the specs rely on.
    reuseExistingServer: false,
  },
});
