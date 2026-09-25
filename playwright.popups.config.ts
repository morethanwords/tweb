import {defineConfig, devices} from '@playwright/test';

const PORT = 8117;

export default defineConfig({
  testDir: './e2e',
  testMatch: /popupSandbox.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    headless: true,
    viewport: {width: 800, height: 600}
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {name: 'firefox', use: {...devices['Desktop Firefox']}},
    {name: 'webkit', use: {...devices['Desktop Safari']}}
  ],
  webServer: {
    command: `node_modules/.bin/vite --config vite.popups-e2e.config.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/?popups=1`,
    env: {TWEB_PREVIEW: '1'},
    reuseExistingServer: false,
    timeout: 120_000
  }
});
