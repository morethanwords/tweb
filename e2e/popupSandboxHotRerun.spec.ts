import {expect} from '@playwright/test';
import {test as base} from './workerContext';
import {recordModules, rerunLoadedModules} from './hotRerun.helpers';

// the server that serves the modules by their URLs, with the hot updates' transform: test:popups's own serves a
// bundle, and names this one (playwright.popups.config.ts); run on its own, the spec has the configured server
const test = base.extend<{modulesURL: string}>({modulesURL: [undefined, {option: true}]});

// A module run again with its code unchanged, as a hot update runs it, keeps the page (see hotRerun.helpers.ts). The
// sandbox loads the app's whole top level without signing in; hotRerunApp.spec.ts does the same past the sign-in.
test('a module run again with its code unchanged keeps the page', async({page, modulesURL}) => {
  test.setTimeout(240_000);
  await recordModules(page);
  await page.goto((modulesURL ?? '/') + '?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox, null, {timeout: 60_000});
  await page.evaluate(() => window.popupSandbox.ready());

  const result = await rerunLoadedModules(page);
  expect(result.modules).toBeGreaterThan(500);
  expect(result.errors).toEqual([]);
  expect(result.unexpected).toEqual([]);
});
