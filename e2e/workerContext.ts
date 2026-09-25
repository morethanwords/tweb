import {BrowserContext, BrowserContextOptions, test as base} from '@playwright/test';

/**
 * One browser context per worker instead of one per test.
 *
 * A fresh context fetches the client's ~1600 source modules from the dev server before the popup
 * sandbox is up — 8 s on its own, longer than most of these tests take, and more with several
 * workers doing it at once. A context that keeps its HTTP cache skips most of that: the Chromium
 * and WebKit tests of this suite took 30–50% less time with it. Each test still gets its own page,
 * and what it leaves in localStorage, sessionStorage and cookies is cleared after it.
 *
 * IndexedDB is not: the sandbox runs on mock managers that drop every write, and deleting a database
 * waits until every connection to it has closed — which the client's own never do on request
 * (idb.ts ignores `versionchange`), so a service worker holding one would stall the next test. A test
 * that boots the real client, where that state does matter, asks for a context of its own with
 * `test.use({freshContext: true})`.
 */
export const test = base.extend<{freshContext: boolean}, {workerContext: BrowserContext}>({
  freshContext: [false, {option: true}],

  workerContext: [async({browser}, use, workerInfo) => {
    const {viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, locale, colorScheme} = workerInfo.project.use;
    const options: BrowserContextOptions = {viewport, userAgent, deviceScaleFactor, hasTouch, baseURL, locale, colorScheme};
    // only when set: Firefox does not support the option at all
    if(isMobile) options.isMobile = true;
    const context = await browser.newContext(options);
    await use(context);
    await context.close();
  }, {scope: 'worker'}],

  context: async({context, freshContext, workerContext}, use) => {
    await use(freshContext ? context : workerContext);
  },

  // Not built on the stock `page`, which would leave a blank page behind in the shared context on
  // every test (it counts on the context closing).
  page: async({context, freshContext}, use) => {
    const own = await context.newPage();
    await use(own);
    if(freshContext) return; // the context goes, and the page with it

    await own.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    }).catch(() => {}); // still on about:blank, or the page is gone
    await context.clearCookies();
    await own.close();
  }
});
