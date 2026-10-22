import {defineConfig, devices} from '@playwright/test';
import base from './playwright.config';
import {appServer} from './playwright.popups.config';
import {playwrightWorkers} from './scripts/testQueue';
import e2ePort from './e2e/ports';

// the app as a bundle, as the popup suites have it (vite.popups-e2e.config.ts), on a port of its own
const PORT = e2ePort('a11y');

export default defineConfig<{freshContext: boolean}>({
  ...base,
  // The base runs one test at a time for the lottie screenshot detector; nothing here needs that,
  // and one worker is what made this suite a quarter of an hour long.
  fullyParallel: true,
  workers: playwrightWorkers(process.env.A11Y_WORKERS ? Number(process.env.A11Y_WORKERS) : '75%'),
  testMatch: /accessibility(?:Keyboard|MediaEditor|Window|Stories|Contrast)?\.spec\.ts/,
  use: {...base.use, baseURL: `http://127.0.0.1:${PORT}/`},
  webServer: appServer(PORT),
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {name: 'chromium-touch', testMatch: '**/accessibilityKeyboard.spec.ts', use: {...devices['Desktop Chrome'], hasTouch: true}},
    // Firefox gets a context per test: sharing one across tests (e2e/workerContext.ts) made its
    // dynamic imports fail now and then, and it gained nothing from the shared cache anyway.
    {name: 'firefox', testMatch: /accessibility(?:Keyboard|Window|Stories)\.spec\.ts/, use: {...devices['Desktop Firefox'], freshContext: true}},
    {name: 'webkit', testMatch: /accessibility(?:Keyboard|Window|Stories)\.spec\.ts/, use: {...devices['Desktop Safari']}}
  ]
});
