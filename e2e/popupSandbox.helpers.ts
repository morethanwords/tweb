import type {Page} from '@playwright/test';

type Story = {id: string, title: string, group: string, surface?: string};
/** One recorded `rootScope.managers` call — what the sandbox answered, or did not. */
type ManagerCall = {manager: string, method: string, args: unknown[]};

declare global {
  interface Window {
    /** The app's own instance of a module (`'/src/…'`, `'/e2e/fixtures/…'`) on an e2e server: vite.e2e.config.ts */
    e2eImport(path: string): Promise<any>;
    popupSandbox: {
      ready(): Promise<void>,
      hide(): void,
      list(): Story[],
      open(id: string): Promise<void>,
      closePopups(): void,
      setDirection(dir: 'ltr' | 'rtl'): void,
      calls(): ManagerCall[],
      unhandled(): ManagerCall[]
    };
    /** Where `openStory` parks the outcome for the poller below to pick up. */
    popupSandboxOutcome: {error: string} | undefined;
  }
}

// Generous: the slowest story builds its popup in well under a second.
const OPEN_TIMEOUT = 30_000;

/**
 * One part of a story sweep that is split to run in parallel. A part takes every Nth story, so the
 * heavy groups (transactions, calls) spread over all of them instead of landing in one.
 */
export function takeStoryPart<T>(stories: T[], part: number, parts: number) {
  return stories.filter((_, index) => index % parts === part);
}

/**
 * What is measured has to be set in its fonts first: Firefox can still be loading a link's when the popup has
 * stopped, and the link widens and moves under a press already measured (a ripple 1.5px off where it was a moment
 * ago); a popup measured twice, once each way, has its icon or its digits change width in between. Laying the page
 * out is what starts them loading. Each face is asked rather than `document.fonts.status`, which WebKit leaves at
 * "loading" for good once one of them has failed.
 */
export async function fontsLoaded(page: Page) {
  await page.evaluate(() => {
    document.body.getBoundingClientRect();
  });
  await page.waitForFunction(() => [...document.fonts].every((face) => face.status !== 'loading'));
}

/**
 * `a11y` turns the keyboard and screen-reader layer on (`?a11y=1`) — every accessibility and
 * focus suite asks for it, since it is off by default.
 */
export async function preparePopupSandbox(page: Page, keepPanel = true, {a11y = false}: {a11y?: boolean} = {}) {
  await page.goto(a11y ? '/?popups=1&a11y=1' : '/?popups=1');
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
    await page.waitForTimeout(20);
  }
}

/**
 * Closes whatever a story opened and waits until it is gone; false when a popup is still in the DOM
 * after `timeout`. A closed popup leaves the DOM in the same 250ms hide timeout that fires
 * `closeAfterTimeout`, so once it is gone its teardown has run — a fixed pause overpaid that on every
 * story. A surface (the sign-in cards, the in-app browser) gives no such signal and keeps 400ms.
 * Polled with short synchronous evaluates, for the reason `openStory` gives.
 *
 * `leaveHiding`: done as soon as no popup is active, without sitting out the hide — for a caller that
 * goes on to measure the next popup rather than this one's teardown.
 */
export async function closeStory(page: Page, story: Pick<Story, 'surface'>, {timeout = 10_000, leaveHiding = false} = {}) {
  await page.evaluate(() => window.popupSandbox.closePopups());
  if(story.surface) {
    await page.waitForTimeout(400);
    return true;
  }

  const deadline = Date.now() + timeout;
  while(await page.evaluate((selector) => !!document.querySelector(selector), leaveHiding ? '.popup.active' : '.popup')) {
    if(Date.now() > deadline) return false;
    await page.waitForTimeout(20);
  }

  // A popup closed from a script rejects its caller's promise (a confirmation's "cancelled") in the task that
  // removes it, and the page reports the unhandled rejection a task later: let that report arrive here, not in
  // the window of whatever the caller checks next.
  if(!leaveHiding) await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 10)));
  return true;
}
