import {expect, test} from '@playwright/test';
import {createSweepRecorder} from './focusPixels.helpers';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

/*
 * Looks at every sandbox surface the way a person does: press Tab, see whether
 * anything changed, and see whether it changed where the control is.
 *
 * Findings carry a cropped screenshot, so each one can be judged by eye instead
 * of trusted on the strength of a heuristic.
 */
test('every control on a sandbox surface shows visible keyboard focus', async({page}, testInfo) => {
  test.setTimeout(60 * 60_000);
  test.slow();
  await preparePopupSandbox(page, false);

  const stories = await page.evaluate(() => window.popupSandbox.list());
  const requested = process.env.FOCUS_STORIES?.split(',').filter(Boolean);
  const subset = requested ? stories.filter(({id}) => requested.includes(id)) : stories;

  const run = createSweepRecorder(page, testInfo, 'pixel-progress.json');
  let completed = 0;

  // A story can take the page down with it — a renderer crash, or a popup that
  // navigates. The sandbox is gone from that point on, and every story after it
  // would be skipped over as if it had been looked at. So the page is checked
  // before each one and stood back up when it is missing.
  const sandboxAlive = () => page.evaluate(() => typeof window.popupSandbox !== 'undefined')
  .catch(() => false);

  for(const story of subset) {
    if(!(await sandboxAlive())) {
      await run.note(`the page went down before ${story.id} — sandbox restarted`);
      await preparePopupSandbox(page, false);
    }
    if(await openStory(page, story.id)) continue;

    const surface = story.surface || '.popup.active';
    try {
      await page.locator(surface).last().waitFor({state: 'visible', timeout: 10_000});
    } catch{
      continue;
    }
    await page.waitForTimeout(400);

    // A surface that walked nothing is usually leftover state from the story
    // before it — the auth cards share one #auth-pages container that an
    // earlier story can leave empty. Reload and give it one more go, so a zero
    // walk is never quietly recorded as a clean one.
    if(!(await run.sweep(story.id, surface))) {
      await preparePopupSandbox(page, false);
      if(!(await openStory(page, story.id))) {
        await page.locator(surface).last().waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
        await page.waitForTimeout(500);
        await run.sweep(story.id, surface);
      }
    }

    await page.evaluate(() => window.popupSandbox.closePopups()).catch(() => {});
    await page.waitForTimeout(200);
    await run.save({completed: ++completed, total: subset.length});
  }

  await testInfo.attach('focus-pixels.json', {
    body: JSON.stringify({surfaces: subset.length, totalStops: run.total(),
      walked: run.walked, findings: run.findings}, null, 2),
    contentType: 'application/json'
  });

  // a sweep that focused nothing must not read as a clean one
  expect(run.total(), 'the sweep walked no controls at all').toBeGreaterThan(subset.length);
  expect(run.findings, run.summary()).toEqual([]);
});
