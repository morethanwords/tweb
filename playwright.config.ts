import {defineConfig, devices} from '@playwright/test';

// Browser tests for lottie sticker rendering.
//
// The first-frame / blink bug only reproduces in the REAL pipeline (SharedWorker + transferred
// OffscreenCanvas + the page compositor); jsdom/vitest can't render lottie at all, and a
// self-contained worker would be a *dedicated* worker with different commit timing. So these run
// against the actual dev server in a real browser. Lottie renders without login (the login page
// itself plays .tgs animations), so a plain `vite` dev server is enough - no auth/seed needed.
const PORT = 8099;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // one sticker on screen at a time keeps the screenshot detector unambiguous
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `https://localhost:${PORT}/`, // tweb's dev server runs over https
    ignoreHTTPSErrors: true, // self-signed dev cert
    headless: true,
    viewport: {width: 800, height: 600}
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `https://localhost:${PORT}/`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
