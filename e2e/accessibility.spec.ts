import {expectNoA11yViolations, setIncreasedContrast, settleForMeasurement} from './accessibility.helpers';
import AxeBuilder from '@axe-core/playwright';
import {Page, expect, test} from '@playwright/test';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';
import {writeFile} from 'node:fs/promises';

async function waitForAuthScreen(page: Page) {
  const authPages = page.locator('#auth-pages');
  await authPages.waitFor({state: 'attached'});
  await expect(authPages).toHaveCSS('opacity', '1');
  await expect(authPages.getByRole('heading', {level: 1})).toBeVisible();
}

test('public app screen has no automatically detectable accessibility violations with increased contrast', async({page}) => {
  await page.goto('/');
  await waitForAuthScreen(page);
  await setIncreasedContrast(page, true);
  await expectNoA11yViolations(page);
});

test('phone login screen has a page heading and no automatically detectable accessibility violations with increased contrast', async({page}) => {
  await page.goto('/');
  await waitForAuthScreen(page);

  await page.getByRole('button', {name: /log in by phone number/i}).click();
  await setIncreasedContrast(page, true);
  await expect(page.getByRole('heading', {level: 1, name: 'Sign in to Telegram'})).toBeVisible();
  await expect(page.getByRole('textbox', {name: 'Phone Number'})).toBeVisible();

  await expectNoA11yViolations(page);
});

for(const theme of ['day', 'night', 'light', 'tinted']) test(`popup stories expose named dialogs and accessible controls (${theme}, increased contrast)`, async({page}, testInfo) => {
  test.setTimeout(20 * 60_000);
  await preparePopupSandbox(page);
  await setIncreasedContrast(page, true);
  await page.getByRole('combobox', {name: 'Theme', exact: true}).selectOption(theme);
  const allStories = await page.evaluate(() => window.popupSandbox.list());
  const requestedStories = process.env.A11Y_STORIES?.split(',').filter(Boolean);
  const stories = requestedStories ? allStories.filter(({id}) => requestedStories.includes(id)) : allStories;
  if(requestedStories) expect(stories.map(({id}) => id).sort()).toEqual([...new Set(requestedStories)].sort());
  const failures: object[] = [];
  let completed = 0;
  for(const story of stories) {
    const error = await openStory(page, story.id);
    if(error) {
      failures.push({story: story.id, error});
    } else {
      // Not every story is a popup: auth cards and call panels name their own
      // surface, the same way the popup-sandbox spec resolves it.
      const surface = story.surface || '.popup.active';
      await page.locator(surface).last().waitFor({state: 'visible', timeout: 10_000});
      // Not a fixed pause: at 300ms a `fade-2` transition is two thirds done,
      // and axe measures the blended colour of half-faded text. `aiTone/view`
      // read #333 at 0.63 over white as #7d7d7d and failed contrast against a
      // surface that is 12.6:1 once it arrives.
      await settleForMeasurement(page, surface);
      let builder = new AxeBuilder({page}).include(surface);
      // The call panels sit on the iOS-style swirl gradient, which is painted
      // into a <canvas> (ChatBackgroundGradientRenderer). Axe only reads CSS
      // colours, so it measures the white text against the popup's own light
      // surface and reports 1.09:1 for a surface that is actually dark. Every
      // other rule still applies here.
      if(story.id.startsWith('call/')) builder = builder.disableRules(['color-contrast']);
      const {violations} = await builder.analyze();
      if(violations.length) {
        failures.push({story: story.id, violations: violations.map(({id, nodes}) => ({
          id,
          nodes: nodes.map(({target, html, failureSummary}) => ({target, html, failureSummary}))
        }))});
      }
    }
    await page.evaluate(() => window.popupSandbox.closePopups());
    await page.waitForTimeout(400);
    await writeFile(testInfo.outputPath('progress.json'), JSON.stringify({completed: ++completed, total: stories.length, last: story.id, failures}, null, 2));
  }
  await testInfo.attach('popup-accessibility.json', {body: JSON.stringify({stories: stories.length, failures}, null, 2), contentType: 'application/json'});
  expect(failures.length, JSON.stringify(failures.map((failure: any) => ({story: failure.story, rules: failure.violations?.map((violation: any) => violation.id), error: failure.error})))).toBe(0);
});
