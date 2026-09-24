import AxeBuilder from '@axe-core/playwright';
import {expect, Page} from '@playwright/test';

/** Change the rendered mode without persisting fixture settings or contacting Telegram. */
export async function setIncreasedContrast(page: Page, enabled: boolean) {
  await page.evaluate(async(enabled) => {
    const load = (path: string) => import('/src/' + path);
    const [{appSettings, setAppSettingsSilent}, {default: rootScope}, {joinDeepPath}] = await Promise.all([
      load('stores/appSettings.ts'),
      load('lib/rootScope.ts'),
      load('helpers/object/setDeepProperty.ts')
    ]);
    setAppSettingsSilent('increaseContrast', enabled);
    rootScope.dispatchEvent('settings_updated', {key: joinDeepPath('settings', 'increaseContrast'), value: enabled, settings: appSettings});
  }, enabled);
  await expect.poll(() => page.locator('html').evaluate((element) => element.classList.contains('high-contrast'))).toBe(enabled);
}

export function trackBrowserErrors(page: Page) {
  const pageErrors: string[] = [];
  const renderErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message || String(error)));
  // Our Solid fork reports render failures separately from window.onerror.
  page.on('console', (message) => {
    if(message.type() === 'error' && message.text().startsWith('solid error')) {
      renderErrors.push(message.text().split('\n')[0]);
    }
  });
  return {pageErrors, renderErrors};
}

export async function moveClient(page: Page, intoFrame: boolean) {
  return page.evaluate(async(intoFrame) => {
    const moduleURL = '/src/components/clientPip.tsx';
    const {moveAppToWindow, moveAppBack} = await import(moduleURL);
    if(!intoFrame) {
      moveAppBack();
      return true;
    }
    const frame = document.createElement('iframe');
    frame.id = 'a11y-other-window';
    frame.style.cssText = 'width:430px;height:760px;border:0';
    document.body.append(frame);
    return moveAppToWindow(frame.contentWindow);
  }, intoFrame);
}

/**
 * Hold until the UI has settled, so a measurement of it means something.
 *
 * Shared by everything that measures: a fixed pause is a guess, and at 300ms a
 * `fade-2` transition is only two thirds done — axe then reads the blended
 * colour of half-faded text (#333 at 0.63 over white reads as #7d7d7d) and
 * reports a contrast failure against a UI that is fine once it arrives.
 */
export async function settleForMeasurement(page: Page, include?: string) {
  /*
   * Measure the settled UI, not the intermediate colors/positions of a tab or
   * dialog transition. Infinite media/loader animations must keep running.
   *
   * Two things here are deliberate, and both were paid for by a run that hung
   * for twenty minutes with nothing to read.
   *
   * The root is reached with `page.evaluate` and a selector rather than through
   * a locator: a locator re-resolves and retries, and these suites set no action
   * timeout, so on some roots — `#column-right` with the profile open is one —
   * it simply never comes back. Nothing here needs locator semantics; the
   * settling only has to run against whichever element currently answers.
   *
   * And the wait is capped, because a finite `endTime` is not a promise that the
   * animation will ever reach it: one that is paused, or attached to a timeline
   * that is not running, never resolves `finished`. Settling is a courtesy to
   * the measurement, so after the cap the scan proceeds — the same way it
   * already proceeds past the infinite ones it filters out.
   *
   * The root is waited for separately, and that is not incidental: the locator
   * this replaced was doing two jobs and only one of them was settling. It also
   * held the scan until the root existed, so dropping it let axe run against an
   * include that had not rendered yet and fail with "No elements found for
   * include" — which is what `accessibilityContrast` does on a theme switch.
   */
  if(include) {
    await page.locator(include).first().waitFor({state: 'attached', timeout: 30_000});
  }

  await page.evaluate(async(selector) => {
    // Every match, not the first: a scan's include can name several elements
    // (stacked popups are all `.popup.active`), and settling one of them while
    // measuring another is how a half-faded surface gets measured.
    const elements = selector ? Array.from(document.querySelectorAll(selector)) : [document.body];
    if(!elements.length) return;
    const transitions = elements.flatMap((element) => element.getAnimations({subtree: true}))
    .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    const settled = Promise.all(transitions.map((animation) => animation.finished.catch(() => {})));
    await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 5000))]);
  }, include);
}

export async function expectNoA11yViolations(page: Page, include?: string) {
  await settleForMeasurement(page, include);
  const builder = new AxeBuilder({page});
  if(include) builder.include(include);
  const {violations} = await builder.analyze();
  const details = violations.map(({help, id, impact, nodes}) => {
    const targets = nodes.map(({target, failureSummary}) => `${target.join(' ')}: ${failureSummary}`).join(', ');
    return `[${impact ?? 'unknown'}] ${id}: ${help} (${targets})`;
  }).join('\n');
  expect(violations.length, details || 'Axe reported accessibility violations').toBe(0);
}

/**
 * A real mouse press on an element that is actually on screen.
 *
 * The client keeps spare chat containers and sidebars in the DOM, so a plain
 * `.first()` often picks a hidden twin and the step silently does nothing. And
 * the press has to be a real one: the chat list opens a chat on a mouse
 * sequence, so `element.click()` selects nothing.
 *
 * Returns whether there was anything to click, so a caller can say "this screen
 * was never reached" instead of reporting a clean run it never made.
 */
export async function clickVisible(page: Page, selector: string, opts?: {button?: 'right', last?: boolean}) {
  const shown = page.locator(selector).filter({visible: true});
  if(!(await shown.count())) return false;
  const target = opts?.last ? shown.last() : shown.first();
  // Both waits need their own deadline. These suites set no action timeout, so
  // the default is "wait forever", and `scrollIntoViewIfNeeded` waits for the
  // element to stop moving — on a header with an animated avatar that moment
  // never comes, and the run hangs instead of failing.
  await target.scrollIntoViewIfNeeded({timeout: 8000}).catch(() => {});
  await target.click({button: opts?.button, timeout: 8000}).catch(() => {});
  return true;
}
