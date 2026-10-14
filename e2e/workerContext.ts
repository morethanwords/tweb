import {BrowserContext, BrowserContextOptions, Page, test as base} from '@playwright/test';

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
 *
 * `samePage` goes further, for a suite whose every test opens its page by navigating (the composer's):
 * the worker keeps one page and each test navigates it again. A navigation still gives the test a new
 * document, but in the same renderer, which serves the modules from its memory cache and keeps their
 * compiled code — a fixture page opened in 220 ms instead of 780. What a test sets on the page itself
 * rather than in its document (listeners, routes, the viewport, where the mouse is) is put back after
 * it, and a failed test takes its worker, and the page, down with it. What stays is the session
 * history: a document that went back further than it pushed would land in the previous test's, where
 * a new page would have gone nowhere.
 */
export const test = base.extend<
  {freshContext: boolean},
  {workerContext: BrowserContext, samePage: boolean, workerPage: {get(): Promise<Page>}}
>({
  freshContext: [false, {option: true}],
  samePage: [false, {option: true, scope: 'worker'}],

  workerContext: [async({browser}, use, workerInfo) => {
    const {viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, locale, colorScheme} = workerInfo.project.use;
    const options: BrowserContextOptions = {viewport, userAgent, deviceScaleFactor, hasTouch, baseURL, locale, colorScheme};
    // only when set: Firefox does not support the option at all
    if(isMobile) options.isMobile = true;
    const context = await browser.newContext(options);
    await use(context);
    await context.close();
  }, {scope: 'worker'}],

  // made by the first test that asks for it, so a suite without `samePage` gets no page it never uses
  workerPage: [async({workerContext}, use) => {
    let page: Promise<Page>;
    await use({get: () => page ??= workerContext.newPage()});
  }, {scope: 'worker'}],

  context: async({context, freshContext, workerContext}, use) => {
    await use(freshContext ? context : workerContext);
  },

  // Not built on the stock `page`, which would leave a blank page behind in the shared context on
  // every test (it counts on the context closing).
  page: async({context, freshContext, samePage, workerPage, viewport}, use) => {
    const shared = samePage && !freshContext;
    const own = shared ? await workerPage.get() : await context.newPage();
    await use(own);
    if(freshContext) return; // the context goes, and the page with it

    await own.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    }).catch(() => {}); // still on about:blank, or the page is gone
    await context.clearCookies();
    if(!shared) {
      await own.close();
      return;
    }

    await own.removeAllListeners();
    await own.unrouteAll({behavior: 'ignoreErrors'});
    const size = own.viewportSize();
    if(viewport && (size?.width !== viewport.width || size?.height !== viewport.height)) {
      await own.setViewportSize(viewport);
    }
    // the next document would open under a pointer left hovering whatever this test pointed at
    await own.mouse.move(0, 0);
  }
});
