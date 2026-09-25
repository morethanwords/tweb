import {defineConfig, devices} from '@playwright/test';

// Browser tests for lottie sticker rendering.
//
// The first-frame / blink bug only reproduces in the REAL pipeline (SharedWorker + transferred
// OffscreenCanvas + the page compositor); jsdom/vitest can't render lottie at all, and a
// self-contained worker would be a *dedicated* worker with different commit timing. So these run
// against the actual dev server in a real browser. Lottie renders without login (the login page
// itself plays .tgs animations), so a plain HTTP Vite preview is enough - no auth/seed needed.
const PORT = 8099;

// A spec that needs a signed-in client cannot use that server: it points at an
// authorized preview instead (`bash scripts/start-preview.sh`), and then there is
// nothing for us to start.
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // one sticker on screen at a time keeps the screenshot detector unambiguous
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: externalBaseURL || `http://localhost:${PORT}/`,
    headless: true,
    viewport: {width: 800, height: 600}
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  // No hot reload (vite.e2e.config.ts): an edit during a run must not reload the page under a test.
  webServer: externalBaseURL ? undefined : {
    command: `pnpm exec vite --config vite.e2e.config.ts --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    env: {TWEB_PREVIEW: '1'},
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
