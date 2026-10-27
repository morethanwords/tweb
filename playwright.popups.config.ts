import {defineConfig, devices} from '@playwright/test';
import path from 'path';
import {playwrightWorkers} from './scripts/testQueue';
import e2ePort from './e2e/ports';

const PORT = e2ePort('popups');
// the modules as they are, for popupSandboxHotRerun.spec.ts: it runs every module again by its URL
const MODULES_PORT = e2ePort('popupsModules');

// The app's server for the sandbox suites (vite.popups-e2e.config.ts): a bundle, ready once it is built, which
// /__e2e/ready says — or, `bundled` false, the modules as they are
export const appServer = (port = PORT, bundled = true) => ({
  command: `node_modules/.bin/vite --config vite.popups-e2e.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
  url: `http://127.0.0.1:${port}/__e2e/ready`,
  env: {TWEB_PREVIEW: '1', TWEB_E2E: '1', ...(!bundled && {TWEB_E2E_BUNDLED: '0'})},
  reuseExistingServer: false,
  timeout: 180_000
});

// A quick run is Chromium alone. Firefox and WebKit each boot the whole client from the dev server
// for every test — Firefox ~12 s a test, alone longer than the entire Chromium run — so they are
// the full run: POPUPS_ALL_ENGINES=1, and always on CI.
const allEngines = !!(process.env.POPUPS_ALL_ENGINES || process.env.CI);

// The specs with a test of a minute or more: the story sweeps, the hot-update rerun, the receipts. Workers take the
// tests in the order of their projects and then of the files, so in a project of their own, first, they start at
// once instead of trailing the run by a minute after its short tests.
const LONG = /popupSandbox(Rtl|HotRerun|StarsTransactions)?\.spec\.ts$/;

export default defineConfig<{freshContext: boolean, modulesURL: string}>({
  testDir: './e2e',
  testMatch: /popupSandbox.*\.spec\.ts/,
  // Every test opens its own sandbox page and shares nothing with the others, so they run side by
  // side; one worker made this 13 minutes long.
  fullyParallel: true,
  workers: playwrightWorkers(process.env.POPUPS_WORKERS ? Number(process.env.POPUPS_WORKERS) : '75%'),
  // waits for its turn in the machine-wide queue of heavy test runs (scripts/test-queue.sh)
  globalSetup: path.join(__dirname, 'scripts/testQueue.ts'),
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    modulesURL: `http://127.0.0.1:${MODULES_PORT}/`,
    headless: true,
    viewport: {width: 800, height: 600}
  },
  projects: [
    {name: 'chromium-long', testMatch: LONG, use: {...devices['Desktop Chrome']}},
    {name: 'chromium', testIgnore: LONG, use: {...devices['Desktop Chrome']}},
    ...(allEngines ? [
      // A context per test, as in the a11y suite: a shared one fails Firefox's dynamic imports
      {name: 'firefox', use: {...devices['Desktop Firefox'], freshContext: true}},
      {name: 'webkit', use: {...devices['Desktop Safari']}}
    ] : [])
  ],
  webServer: [appServer(), appServer(MODULES_PORT, false)]
});
