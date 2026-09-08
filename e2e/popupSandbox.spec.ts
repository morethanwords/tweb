import {expect, Page, test} from '@playwright/test';

/*
 * Opens every popup the sandbox knows about and asserts it actually renders.
 *
 * The sandbox (`src/components/popupSandbox`, entered with `?popups=1`) answers every manager call
 * from local fixtures, so this needs no session, no authorization and no Telegram traffic — a plain
 * dev server is enough. That makes it a cheap regression net over every popup in the app: one that
 * starts throwing on construction, or never reaches its visible state, fails here.
 *
 * This covers the FIXTURE source only. The panel's other source — the signed-in session's own data,
 * run against the real managers — needs an authorized preview and has no e2e yet; its write guard is
 * covered by `src/tests/popupSandboxLiveManagers.test.ts` instead.
 */

type Story = {id: string, title: string, group: string};

declare global {
  interface Window {
    popupSandbox: {
      ready(): Promise<void>,
      list(): Story[],
      open(id: string): Promise<void>,
      closePopups(): void,
      unhandled(): Array<{manager: string, method: string}>
    };
    /** Where `openStory` parks the outcome for the poller below to pick up. */
    popupSandboxOutcome: {error: string} | undefined;
  }
}

// A popup reveals itself a couple of frames after construction, and some wait on a lottie decode.
const SHOWN_TIMEOUT = 10_000;
// Generous: the slowest story builds its popup in well under a second.
const OPEN_TIMEOUT = 30_000;

/**
 * Opens one story and returns the message it threw with, or null.
 *
 * Deliberately not `page.evaluate(async ...)`. An async evaluate hands the returned promise to
 * Chromium's inspector, which holds it with a WEAK handle (`Runtime.callFunctionOn` with
 * `awaitPromise`). Opening a popup allocates enough for a GC to land inside that window, and the
 * handle is then collected before the resolution is reported: the protocol answers
 * `-32000 Promise was collected`, which Playwright rewrites into the thoroughly misleading
 * "Execution context was destroyed, most likely because of a navigation." Nothing navigates and
 * nothing hangs — the story opens and its promise resolves (a few ms BEFORE that error arrives);
 * only the trip back to the test is lost. It used to take out `transaction/history-stars-self`,
 * the heaviest open in the registry, on nearly every full run.
 *
 * So: start the work from a synchronous evaluate that parks the outcome on the page, then poll for
 * it with short synchronous evaluates that never leave a pending promise with the debugger.
 */
async function openStory(page: Page, id: string): Promise<string> {
  await page.evaluate((storyId) => {
    window.popupSandboxOutcome = undefined;
    window.popupSandbox.open(storyId).then(
      () => {window.popupSandboxOutcome = {error: null};},
      (err) => {window.popupSandboxOutcome = {error: (err as Error)?.message || String(err)};}
    );
  }, id);

  const deadline = Date.now() + OPEN_TIMEOUT;
  for(;;) {
    const outcome = await page.evaluate(() => window.popupSandboxOutcome);
    if(outcome) return outcome.error;
    if(Date.now() > deadline) return `did not settle within ${OPEN_TIMEOUT}ms`;
    await page.waitForTimeout(50);
  }
}

test('every popup story opens and becomes visible', async({page}) => {
  // One test walks the whole registry, so it needs far more than the config's per-test default.
  test.setTimeout(5 * 60_000);

  const pageErrors: string[] = [];
  const renderErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message || String(error)));
  // Our Solid fork reports render failures through console.error rather than window.onerror.
  page.on('console', (message) => {
    if(message.type() === 'error' && message.text().startsWith('solid error')) {
      renderErrors.push(message.text().split('\n')[0]);
    }
  });

  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox, null, {timeout: 30_000});
  await page.evaluate(() => window.popupSandbox.ready());

  const stories = await page.evaluate(() => window.popupSandbox.list());
  expect(stories.length).toBeGreaterThan(0);

  const failed: string[] = [];
  for(const story of stories) {
    pageErrors.length = 0;
    renderErrors.length = 0;

    const opened = await openStory(page, story.id);

    if(opened) {
      failed.push(`${story.id}: threw while opening — ${opened}`);
    } else {
      try {
        await expect.poll(
          () => page.evaluate(() => document.querySelectorAll('.popup.active').length),
          {timeout: SHOWN_TIMEOUT}
        ).toBeGreaterThan(0);
      } catch{
        failed.push(`${story.id}: never became visible`);
      }

      if(pageErrors.length) {
        failed.push(`${story.id}: page error — ${pageErrors.join(' | ')}`);
      }
    }

    // Teardown is deliberately outside the assertion window (errors reset at the top of the loop):
    // several popups model "cancelled" as a rejected promise, and closing one from a script rather
    // than through the caller's own flow leaves that rejection unhandled — the sandbox's doing.
    await page.evaluate(() => window.popupSandbox.closePopups());
    // Longer than the 250ms hide timeout, after which a closed popup fires `closeAfterTimeout`.
    await page.waitForTimeout(400);
    if(renderErrors.length) {
      failed.push(`${story.id}: render error — ${renderErrors.join(' | ')}`);
    }
  }

  expect(failed, `\n${failed.join('\n')}\n`).toEqual([]);
});
