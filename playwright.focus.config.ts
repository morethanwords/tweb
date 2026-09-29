import {defineConfig, devices} from '@playwright/test';
import popups from './playwright.popups.config';

// The popup suite's setup — the sandbox on a server that caches modules for the run, tests side by
// side on a context shared per worker — for the focus sweep, which ran on the lottie config one
// test at a time and took a quarter of an hour. Its server takes the same port, so the two suites
// run one after the other, not at once. Chromium only: what is photographed is Chromium's painting.
export default defineConfig<{freshContext: boolean}>({
  ...popups,
  testMatch: /focusPixels(?:Auth)?\.spec\.ts/,
  // the same count focusPixels.spec.ts cuts its parts by — not the popup suite's POPUPS_WORKERS
  workers: process.env.FOCUS_WORKERS ? Number(process.env.FOCUS_WORKERS) : '75%',
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}]
});
