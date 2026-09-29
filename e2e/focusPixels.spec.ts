import {expect} from '@playwright/test';
import {cpus} from 'node:os';
import {createSweepRecorder} from './focusPixels.helpers';
import {closeStory, openStory, preparePopupSandbox, takeStoryPart} from './popupSandbox.helpers';
import {test} from './workerContext';

// The sweep is split into parts that run in parallel (takeStoryPart): walked in one piece, one
// story after another, it took a quarter of an hour. One part a worker but one (the config's 75% of
// the cores, as Playwright counts them), which is left to the sign-in sweep, so everything goes in
// a single wave: a part per worker put that sweep after them, and more parts only boot the sandbox
// more often.
const PARTS = Number(process.env.FOCUS_STORY_PARTS) ||
  Math.max(1, (Number(process.env.FOCUS_WORKERS) || Math.floor(cpus().length * 0.75)) - 1);

/*
 * Looks at every sandbox surface the way a person does: press Tab, see whether
 * anything changed, and see whether it changed where the control is.
 *
 * Findings carry a cropped screenshot, so each one can be judged by eye instead
 * of trusted on the strength of a heuristic.
 */
for(let part = 0; part < PARTS; ++part) test(`every control on a sandbox surface shows visible keyboard focus (part ${part + 1}/${PARTS})`, async({page}, testInfo) => {
  // a part still walks a slice of the registry, more than the config's per-test default allows
  test.setTimeout(5 * 60_000);
  await preparePopupSandbox(page, false, {a11y: true});

  const stories = await page.evaluate(() => window.popupSandbox.list());
  const requested = process.env.FOCUS_STORIES?.split(',').filter(Boolean);
  const subset = takeStoryPart(requested ? stories.filter(({id}) => requested.includes(id)) : stories, part, PARTS);
  test.skip(!subset.length, 'none of FOCUS_STORIES falls in this part');
  // a part as big as the whole registry (one worker, FOCUS_STORY_PARTS=1) needs its time
  test.setTimeout(Math.max(5 * 60_000, subset.length * 3_000));

  const run = createSweepRecorder(page, testInfo, 'pixel-progress.json');
  let completed = 0;

  // A story can take the page down with it — a renderer crash, or a popup that
  // navigates. The sandbox is gone from that point on, and every story after it
  // would be skipped over as if it had been looked at. So the page is checked
  // before each one and stood back up when it is missing.
  const sandboxAlive = () => page.evaluate(() => typeof window.popupSandbox !== 'undefined')
  .catch(() => false);

  // The surface is up (the sweep runs its opening transition to the end itself). A surface that is
  // not a popup (the sign-in cards, the in-app browser) gives no signal, and a sign-in card moves the
  // focus into its field a moment after it shows — mid-walk, it takes the focus off the control
  // being photographed — so those keep the 400ms they always had.
  const shown = async(surface: string, isPopup: boolean) => {
    await page.locator(surface).last().waitFor({state: 'visible', timeout: 10_000});
    if(!isPopup) await page.waitForTimeout(400);
  };

  for(const story of subset) {
    if(!(await sandboxAlive())) {
      await run.note(`the page went down before ${story.id} — sandbox restarted`);
      await preparePopupSandbox(page, false, {a11y: true});
    }
    if(await openStory(page, story.id)) continue;

    const surface = story.surface || '.popup.active';
    try {
      await shown(surface, !story.surface);
    } catch{
      continue;
    }

    // A surface that walked nothing is usually leftover state from the story
    // before it — the auth cards share one #auth-pages container that an
    // earlier story can leave empty. Reload and give it one more go, so a zero
    // walk is never quietly recorded as a clean one.
    if(!(await run.sweep(story.id, surface))) {
      await preparePopupSandbox(page, false, {a11y: true});
      if(!(await openStory(page, story.id))) {
        await shown(surface, !story.surface).catch(() => {});
        await run.sweep(story.id, surface);
      }
    }

    await closeStory(page, story, {leaveHiding: true}).catch(() => false);
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
