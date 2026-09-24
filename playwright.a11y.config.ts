import {defineConfig, devices} from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: /accessibility(?:Keyboard|MediaEditor|Window|Stories|Contrast)?\.spec\.ts/,
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {name: 'chromium-touch', testMatch: '**/accessibilityKeyboard.spec.ts', use: {...devices['Desktop Chrome'], hasTouch: true}},
    {name: 'firefox', testMatch: /accessibility(?:Keyboard|Window|Stories)\.spec\.ts/, use: {...devices['Desktop Firefox']}},
    {name: 'webkit', testMatch: /accessibility(?:Keyboard|Window|Stories)\.spec\.ts/, use: {...devices['Desktop Safari']}}
  ]
});
