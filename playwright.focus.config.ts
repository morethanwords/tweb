import {defineConfig, devices} from '@playwright/test';
import popups, {appServer} from './playwright.popups.config';
import {playwrightWorkers} from './scripts/testQueue';

// The popup suite's setup — the sandbox on a server that caches modules for the run, tests side by
// side on a context shared per worker — for the focus sweep, which ran on the lottie config one
// test at a time and took a quarter of an hour. Its server takes the same port, so the two suites
// run one after the other, not at once. Chromium only: what is photographed is Chromium's painting.
export default defineConfig<{freshContext: boolean}>({
  ...popups,
  testMatch: /focusPixels(?:Auth)?\.spec\.ts/,
  // the same count focusPixels.spec.ts cuts its parts by — not the popup suite's POPUPS_WORKERS. A run
  // narrowed to some files gets fewer workers (scripts/testQueue.ts) and walks the same parts on them.
  workers: playwrightWorkers(process.env.FOCUS_WORKERS ? Number(process.env.FOCUS_WORKERS) : '75%'),
  // the bundle alone: the popup suite's second server is for its hot-update spec
  webServer: appServer(),
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}]
});
