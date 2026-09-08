import {defineConfig} from '@playwright/test';

const baseURL = 'http://127.0.0.1:3122';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: true,
  // Every test opens its own page against shared read-only servers, so tests are independent.
  // SHELL_BROWSER_WORKERS=1 restores the serial run for a constrained or flaky host.
  workers: process.env.SHELL_BROWSER_WORKERS ? Number(process.env.SHELL_BROWSER_WORKERS) : '50%',
  timeout: 45_000, expect: {timeout: 6000},
  reporter: [['list']], outputDir: 'artifacts/browser-results',
  use: {baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', contextOptions: {reducedMotion: 'reduce'}},
  projects: (['chromium', 'webkit'] as const).flatMap(browserName =>
      [{width: 375, height: 812}, {width: 900, height: 900}, {width: 1280, height: 900}, {width: 375, height: 480}].map(viewport => ({
        name: browserName + '-' + viewport.width + 'x' + viewport.height,
        use: {browserName, viewport}
      }))
    ),
  webServer: [
    {command: 'node scripts/serve-artifact.mjs --port 3122', url: baseURL, reuseExistingServer: false, timeout: 15_000},
    {command: 'node scripts/serve-artifact.mjs --port 3123 --dir reference-dist --manifest artifacts/reference-manifest.json', url: 'http://127.0.0.1:3123', reuseExistingServer: false, timeout: 15_000}
  ]
});
