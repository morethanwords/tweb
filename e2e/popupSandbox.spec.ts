import {expect, test} from '@playwright/test';

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
  }
}

// A popup reveals itself a couple of frames after construction, and some wait on a lottie decode.
const SHOWN_TIMEOUT = 10_000;

test('every popup story opens and becomes visible', async({page}) => {
  // One test walks the whole registry, so it needs far more than the config's per-test default.
  test.setTimeout(5 * 60_000);

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message || String(error)));

  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox, null, {timeout: 30_000});
  await page.evaluate(() => window.popupSandbox.ready());

  const stories = await page.evaluate(() => window.popupSandbox.list());
  expect(stories.length).toBeGreaterThan(0);

  const failed: string[] = [];
  for(const story of stories) {
    pageErrors.length = 0;

    const opened = await page.evaluate(async(id) => {
      try {
        await window.popupSandbox.open(id);
        return null;
      } catch(err) {
        return (err as Error).message;
      }
    }, story.id);

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
  }

  expect(failed, `\n${failed.join('\n')}\n`).toEqual([]);
});
