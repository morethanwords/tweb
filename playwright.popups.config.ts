import {defineConfig, devices} from '@playwright/test';

const PORT = 8117;

// A quick run is Chromium alone. Firefox and WebKit each boot the whole client from the dev server
// for every test — Firefox ~12 s a test, alone longer than the entire Chromium run — so they are
// the full run: POPUPS_ALL_ENGINES=1, and always on CI.
const allEngines = !!(process.env.POPUPS_ALL_ENGINES || process.env.CI);

export default defineConfig<{freshContext: boolean}>({
  testDir: './e2e',
  testMatch: /popupSandbox.*\.spec\.ts/,
  // Every test opens its own sandbox page and shares nothing with the others, so they run side by
  // side; one worker made this 13 minutes long.
  fullyParallel: true,
  workers: process.env.POPUPS_WORKERS ? Number(process.env.POPUPS_WORKERS) : '75%',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    headless: true,
    viewport: {width: 800, height: 600}
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    ...(allEngines ? [
      // A context per test, as in the a11y suite: a shared one fails Firefox's dynamic imports
      {name: 'firefox', use: {...devices['Desktop Firefox'], freshContext: true}},
      {name: 'webkit', use: {...devices['Desktop Safari']}}
    ] : [])
  ],
  webServer: {
    command: `node_modules/.bin/vite --config vite.popups-e2e.config.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/?popups=1`,
    env: {TWEB_PREVIEW: '1'},
    reuseExistingServer: false,
    timeout: 120_000
  }
});
