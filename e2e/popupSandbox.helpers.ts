import type {Page} from '@playwright/test';

type Story = {id: string, title: string, group: string, surface?: string};

declare global {
  interface Window {
    popupSandbox: {
      ready(): Promise<void>,
      hide(): void,
      list(): Story[],
      open(id: string): Promise<void>,
      closePopups(): void,
      unhandled(): Array<{manager: string, method: string}>
    };
    /** Where `openStory` parks the outcome for the poller below to pick up. */
    popupSandboxOutcome: {error: string} | undefined;
  }
}

// Generous: the slowest story builds its popup in well under a second.
const OPEN_TIMEOUT = 30_000;

export async function preparePopupSandbox(page: Page, keepPanel = true) {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox, null, {timeout: 30_000});
  await page.evaluate(() => window.popupSandbox.ready());
  // The panel is a third of the window wide and popups are centred under it, so
  // anything that measures or photographs a popup sees the panel instead. The
  // registry keeps working without it — only the list of stories goes away.
  if(!keepPanel) {
    await page.evaluate(() => window.popupSandbox.hide());
    await page.waitForTimeout(300);
  }
}

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
export async function openStory(page: Page, id: string): Promise<string> {
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
