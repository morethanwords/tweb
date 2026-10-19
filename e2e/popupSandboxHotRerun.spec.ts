import {expect} from '@playwright/test';
import {test} from './workerContext';
import {recordModules, rerunLoadedModules} from './hotRerun.helpers';

// A module run again with its code unchanged, as a hot update runs it, keeps the page (see hotRerun.helpers.ts). The
// sandbox loads the app's whole top level without signing in; hotRerunApp.spec.ts does the same past the sign-in.
test('a module run again with its code unchanged keeps the page', async({page}) => {
  test.setTimeout(240_000);
  await recordModules(page);
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox, null, {timeout: 60_000});
  await page.evaluate(() => window.popupSandbox.ready());

  const result = await rerunLoadedModules(page);
  expect(result.modules).toBeGreaterThan(500);
  expect(result.errors).toEqual([]);
  expect(result.unexpected).toEqual([]);
});
