import {defineConfig, devices} from '@playwright/test';
import path from 'path';
import {playwrightWorkers} from './scripts/testQueue';
import e2ePort from './e2e/ports';

const PORT = e2ePort('editor');

// A quick run is Chromium alone; Firefox and WebKit are the full run: EDITOR_E2E_ALL_ENGINES=1, and
// always on CI.
const allEngines = !!(process.env.EDITOR_E2E_ALL_ENGINES || process.env.CI);

export default defineConfig<{freshContext: boolean}, {samePage: boolean}>({
  testDir: './e2e',
  testMatch: /chatInputEditor.*\.spec\.ts/,
  // Every test opens its own fixture document, with its own clipboard, and shares nothing with the
  // others, so they run side by side; one worker made this 26 minutes long.
  fullyParallel: true,
  workers: playwrightWorkers(process.env.EDITOR_E2E_WORKERS ? Number(process.env.EDITOR_E2E_WORKERS) : '75%'),
  // waits for its turn in the machine-wide queue of heavy test runs (scripts/test-queue.sh)
  globalSetup: path.join(__dirname, 'scripts/testQueue.ts'),
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    headless: true,
    viewport: {width: 800, height: 600},
    // every test opens the fixture by navigating, so a worker keeps one page for all of them
    // (e2e/workerContext.ts): the fixture then opens in a fraction of the time a new page takes
    samePage: true
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    ...(allEngines ? [
      // A context per test for these two: in a shared one Firefox lost a test's document to a
      // navigation in the middle of it, and WebKit ignored the first key a new document got in 5-7
      // of 24 runs of the arrow-key walks (0-1 with a context of their own)
      {name: 'firefox', use: {...devices['Desktop Firefox'], freshContext: true}},
      {
        name: 'webkit',
        use: {...devices['Desktop Safari'], freshContext: true},
        // WebKit stalls on roughly every 64th page of a multi-file run: `goto`
        // never returns and the browser issues no request at all, so nothing was
        // ever asked of the server and no page code ran. A retry starts a fresh
        // context, which recovers; a real failure fails again on the retry.
        retries: 1
      }
    ] : [])
  ],
  webServer: {
    command: `node_modules/.bin/vite --config vite.editor-e2e.config.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/e2e/fixtures/chatInputEditor.html`,
    env: {
      TWEB_E2E: '1',
      TWEB_EDITOR_E2E: '1',
      TWEB_PREVIEW: '1'
    },
    reuseExistingServer: false,
    timeout: 120_000
  }
});
