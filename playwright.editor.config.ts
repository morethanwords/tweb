import {defineConfig, devices} from '@playwright/test';

const PORT = 8100;

export default defineConfig({
  testDir: './e2e',
  testMatch: /chatInputEditor.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    headless: true,
    viewport: {width: 800, height: 600}
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {name: 'firefox', use: {...devices['Desktop Firefox']}},
    {
      name: 'webkit',
      use: {...devices['Desktop Safari']},
      // WebKit stalls on roughly every 64th page of a multi-file run: `goto`
      // never returns and the browser issues no request at all, so nothing was
      // ever asked of the server and no page code ran. A retry starts a fresh
      // context, which recovers; a real failure fails again on the retry.
      retries: 1
    }
  ],
  webServer: {
    command: `node_modules/.bin/vite --force --config vite.editor-e2e.config.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/e2e/fixtures/chatInputEditor.html`,
    env: {
      TWEB_EDITOR_E2E: '1',
      TWEB_PREVIEW: '1'
    },
    reuseExistingServer: false,
    timeout: 120_000
  }
});
