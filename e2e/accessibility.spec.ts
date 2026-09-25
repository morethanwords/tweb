import {createAxeBuilder, expectNoA11yViolations, setIncreasedContrast, settleForMeasurement} from './accessibility.helpers';
import {Page, expect} from '@playwright/test';
import {test} from './workerContext';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';
import {writeFile} from 'node:fs/promises';

async function waitForAuthScreen(page: Page) {
  const authPages = page.locator('#auth-pages');
  await authPages.waitFor({state: 'attached'});
  await expect(authPages).toHaveCSS('opacity', '1');
  await expect(authPages.getByRole('heading', {level: 1})).toBeVisible();
}

// These two boot the real client, whose state lives in IndexedDB: a context of their own.
test.describe(() => {
  test.use({freshContext: true});

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
});

// A quick run sweeps the stories in one theme: roles, names and keyboard wiring do not depend on
// it, only the colours do. The other three are for a full run — A11Y_ALL_THEMES=1, and always on
// CI — or name the ones to sweep: A11Y_THEMES=night,tinted.
const ALL_THEMES = ['day', 'night', 'light', 'tinted'];
const THEMES = process.env.A11Y_THEMES?.split(',').filter(Boolean) ||
  (process.env.A11Y_ALL_THEMES || process.env.CI ? ALL_THEMES : ALL_THEMES.slice(0, 1));
// Each theme's sweep is split into parts that run in parallel. A part takes every Nth story, so
// the heavy groups (transactions, calls) spread over all of them instead of landing in one.
const PARTS = Number(process.env.A11Y_STORY_PARTS) || 8;

for(const theme of THEMES) for(let part = 0; part < PARTS; ++part) test(`popup stories expose named dialogs and accessible controls (${theme}, increased contrast, part ${part + 1}/${PARTS})`, async({page}, testInfo) => {
  test.setTimeout(5 * 60_000);
  await preparePopupSandbox(page);
  await setIncreasedContrast(page, true);
  await page.getByRole('combobox', {name: 'Theme', exact: true}).selectOption(theme);
  const allStories = await page.evaluate(() => window.popupSandbox.list());
  const requestedStories = process.env.A11Y_STORIES?.split(',').filter(Boolean);
  const wantedStories = requestedStories ? allStories.filter(({id}) => requestedStories.includes(id)) : allStories;
  if(requestedStories) expect(wantedStories.map(({id}) => id).sort()).toEqual([...new Set(requestedStories)].sort());
  const stories = wantedStories.filter((_, index) => index % PARTS === part);
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
      const builder = await createAxeBuilder(page, surface);
      // The call panels sit on the iOS-style swirl gradient, which is painted
      // into a <canvas> (ChatBackgroundGradientRenderer). Axe only reads CSS
      // colours, so it measures the white text against the popup's own light
      // surface and reports 1.09:1 for a surface that is actually dark. Every
      // other rule still applies here.
      if(story.id.startsWith('call/')) builder.disableRules(['color-contrast']);
      let {violations} = await builder.analyze();
      // With the suite running in parallel, a popup's content can arrive after the settling above
      // and still be fading in when axe reads it (`aiTone/view`: `fade-2-enter-active`, text at
      // 2.64:1 on its way to the real colour). A failed scan is repeated once whatever was moving
      // has finished; only what fails again is reported.
      if(violations.length) {
        await settleForMeasurement(page, surface);
        ({violations} = await builder.analyze());
      }
      if(violations.length) {
        failures.push({story: story.id, violations: violations.map(({id, nodes}) => ({
          id,
          nodes: nodes.map(({target, html, failureSummary}) => ({target, html, failureSummary}))
        }))});
      }
    }
    await page.evaluate(() => window.popupSandbox.closePopups());
    // A closed popup tears itself down 250ms later — it leaves the DOM and, in the same tick,
    // releases the shared overlay and navigation state — and the next story must not be open by
    // then. So wait for exactly that rather than a pause; one that never leaves is reported, not
    // waited on. A surface that is not a popup (the auth cards) keeps the pause.
    if(story.surface) {
      await page.waitForTimeout(400);
    } else {
      await page.waitForFunction(() => !document.querySelector('.popup'), null, {polling: 50, timeout: 5_000})
      .catch(() => failures.push({story: story.id, error: 'the popup was still in the DOM 5s after closing'}));
    }
    await writeFile(testInfo.outputPath('progress.json'), JSON.stringify({completed: ++completed, total: stories.length, last: story.id, failures}, null, 2));
  }
  await testInfo.attach('popup-accessibility.json', {body: JSON.stringify({stories: stories.length, failures}, null, 2), contentType: 'application/json'});
  expect(failures.length, JSON.stringify(failures.map((failure: any) => ({story: failure.story, rules: failure.violations?.map((violation: any) => violation.id), error: failure.error})))).toBe(0);
});
