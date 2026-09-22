import {expect, Page, test} from '@playwright/test';

/*
 * The profile sidebar must go idle once it has opened.
 *
 * It did not. `Scrollable.checkForTriggers` fires `onScrolledBottom` whenever the
 * container is within `onScrollOffset` of its end, and a list that does not
 * overflow is always at its end — the sidebar measures `scrollSize` 768 against
 * `clientSize` 768, so `maxScrollPosition - scrollPosition` is 0 and the trigger
 * fires every time it is called. `AppSearchSuper` then re-armed the check from
 * the `finally` of every load, and its `savedDialogs` tab (the one a peer with no
 * shared media lands on) never sets `loaded[type]`, so `canLoadMediaTab` could
 * never end the chain. Measured at ~9300 `load` calls a second with nobody
 * touching the page; a CPU profile put 43% of all main-thread samples in the
 * `this.log('load', ...)` at the top of `load` alone, and a trivial
 * `page.evaluate` against the page took 20 seconds.
 *
 * This needs a signed-in client, so like the other signed-in specs it runs
 * against an authorized preview and skips rather than reporting a pass it never
 * made:
 *
 *   bash scripts/start-preview.sh --port 9105
 *   PLAYWRIGHT_BASE_URL=http://localhost:9105 pnpm exec playwright test e2e/profileSidebarIdle.spec.ts
 */
test.describe('the profile sidebar', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  // The right column only floats in beside the conversation on a desktop-sized
  // window; at the config's default 800px it takes the whole screen instead.
  test.use({viewport: {width: 1280, height: 800}});

  test('stops loading once it has opened', async({page}) => {
    test.setTimeout(5 * 60_000);

    // The shared worker is the one thing a preview pane cannot load; a dedicated
    // worker runs the same code.
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0,
      null, {timeout: 180_000});

    // `'0'` is the client's "no peer", and it is a truthy string — so this asks
    // for a peer that is not it, not merely for one that is set
    const peerId = await openFirstConversation(page);
    expect(peerId, 'no conversation to open').not.toBe('0');
    expect(peerId, 'no conversation to open').toBeTruthy();
    console.log(`profile sidebar: opened peer ${peerId}`);

    // scoped to the conversation: once the sidebar is open there is a second
    // `.chat-info` inside it, and `.first()` would be picking between them
    await page.locator('#column-center .chat-info').first().click();
    // Waited for as an instance, not as a visible box: a peer with nothing shared
    // keeps every tab hidden, and that is the very case the loop was found in.
    await page.waitForFunction(
      () => !!(window as any).appSidebarRight?.sharedMediaTab?.searchSuper,
      null,
      {timeout: 30_000}
    );
    // the first loads are the point of opening it — this waits them out
    await page.waitForTimeout(4000);

    /*
     * Counted at `AppSearchSuper.load`, not inferred from the outside: it is the
     * call the loop multiplied, and a tab that legitimately pages in more content
     * is a handful of these, never thousands.
     *
     * A missing instance fails instead of counting zero — "the sidebar made no
     * load calls" reads the same whether it is idle or whether we were looking at
     * the wrong object.
     */
    const counting = await page.evaluate(() => {
      const searchSuper = (window as any).appSidebarRight?.sharedMediaTab?.searchSuper;
      if(!searchSuper?.load) return false;
      const original = searchSuper.load.bind(searchSuper);
      (window as any).__profileLoads = 0;
      searchSuper.load = (...args: any[]) => {
        ++(window as any).__profileLoads;
        return original(...args);
      };
      return true;
    });
    expect(counting, 'no AppSearchSuper behind the open profile sidebar to measure').toBe(true);

    const activeTab = await page.evaluate(() =>
      (window as any).appSidebarRight?.sharedMediaTab?.searchSuper?.mediaTab?.type);
    console.log(`profile sidebar: active media tab "${activeTab}"`);

    /*
     * Latency first, and measured before the counter is read, because it is what
     * the bug actually cost: every other thing the client wanted to do — and
     * every Playwright call against this page — queued behind the loop. Two
     * seconds is deliberately loose; the broken build spent twenty on a call
     * like this one.
     */
    const started = Date.now();
    await page.waitForTimeout(3000);
    await page.evaluate(() => document.querySelectorAll('#column-right *').length);
    const elapsed = Date.now() - started;

    const loads = await page.evaluate(() => (window as any).__profileLoads as number);
    console.log(`profile sidebar: ${loads} loads in 3s, a trivial evaluate came back after ${elapsed - 3000}ms`);

    expect(loads, 'the shared-media list is loading in a loop with nobody touching it').toBeLessThan(10);
    expect(elapsed - 3000, 'the main thread is too busy to answer').toBeLessThan(2000);
  });
});

async function openFirstConversation(page: Page) {
  // A real mouse click, not `el.click()` and not Enter on the focused row: the
  // chat list opens a conversation from `attachClickEvent`, which wants the
  // pointer sequence and ignores both of the cheaper ways in.
  await page.locator('a.chatlist-chat').first().click();
  // counted rather than awaited through a locator: the first `.bubble` in the
  // conversation is the sticky date, which is not a visible box of its own
  await page.waitForFunction(() => document.querySelectorAll('#column-center .bubble').length > 0,
    null, {timeout: 60_000});
  await page.waitForTimeout(2000);
  return await page.evaluate(() => String((window as any).appImManager?.chat?.peerId ?? ''));
}
