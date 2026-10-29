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
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/profileSidebarIdle.spec.ts
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
    const peerId = await openReadConversation(page);
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

  /*
   * A chat opened while the column is hidden does not wait for its profile: that is built after the chat's first
   * frame. Opened before that - from the header, the moment the conversation is up - the column must not slide in
   * empty and fill afterwards: it waits for the profile. Opened and closed once first, so the column keeps a
   * navigation history, which is the case that once slid in empty.
   */
  test('slides in with the profile of a chat opened while it was hidden', async({page}) => {
    test.setTimeout(5 * 60_000);

    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0,
      null, {timeout: 180_000});
    const peers = await pickReadConversations(page, 3);
    expect(peers.length, 'three conversations with nothing unread are needed').toBe(3);

    await page.evaluate(async(peerId) => {
      const w = window as any;
      await w.appImManager.setPeer({peerId});
      await w.appImManager.chat.setPeerPromise;
      await w.appSidebarRight.toggleSidebar(true);
    }, peers[0]);
    await page.waitForFunction(() => !!(window as any).appSidebarRight?.sharedMediaTab?.searchSuper, null, {timeout: 30_000});
    await page.evaluate(() => (window as any).appSidebarRight.toggleSidebar(false));
    await page.waitForTimeout(1000);

    const atShown = await page.evaluate(async(peerId) => {
      const w = window as any;
      const sidebar = w.appSidebarRight;
      let shown: {peerId: PeerId, nameLength: number};
      const observer = new MutationObserver(() => {
        if(shown || !document.body.classList.contains('is-right-column-shown')) return;
        const tab = sidebar.sharedMediaTab;
        shown = {peerId: tab?.peerId, nameLength: (tab?.container.querySelector('.profile-name')?.textContent || '').trim().length};
      });
      observer.observe(document.body, {attributes: true, attributeFilter: ['class']});
      const previousInner = w.appImManager.chat.bubbles.chatInner;
      w.appImManager.setPeer({peerId});
      // * the frame the new conversation is put up in: the earliest its header can be clicked
      await new Promise<void>((resolve) => {
        const check = () => {
          const inner = w.appImManager.chat.bubbles.chatInner;
          if(inner !== previousInner && inner.isConnected && sidebar.sharedMediaTab?.peerId === peerId) resolve();
          else requestAnimationFrame(check);
        };
        check();
      });
      sidebar.toggleSidebar(true);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      observer.disconnect();
      return shown;
    }, peers[1]);

    expect(atShown, 'the column never slid in').toBeTruthy();
    expect(atShown.peerId, 'the column slid in with the profile of another chat').toBe(peers[1]);
    expect(atShown.nameLength, 'the column slid in before the profile was filled').toBeGreaterThan(0);

    // * closed again while it still waits for the profile: it must not slide in once the profile is there
    await page.evaluate(() => (window as any).appSidebarRight.toggleSidebar(false));
    await page.waitForTimeout(1000);
    const shownAfterClose = await page.evaluate(async(peerId) => {
      const w = window as any;
      const sidebar = w.appSidebarRight;
      const previousInner = w.appImManager.chat.bubbles.chatInner;
      w.appImManager.setPeer({peerId});
      await new Promise<void>((resolve) => {
        const check = () => {
          const inner = w.appImManager.chat.bubbles.chatInner;
          if(inner !== previousInner && inner.isConnected && sidebar.sharedMediaTab?.peerId === peerId) resolve();
          else requestAnimationFrame(check);
        };
        check();
      });
      sidebar.toggleSidebar(true);
      sidebar.toggleSidebar(false);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return document.body.classList.contains('is-right-column-shown');
    }, peers[2]);
    expect(shownAfterClose, 'the column slid in after it was closed').toBe(false);

    // * the header's avatar toggles the column: a second click while the first still waits cancels it, as it closes
    // * a shown one
    const shownAfterTwoClicks = await page.evaluate(async(peerId) => {
      const w = window as any;
      const sidebar = w.appSidebarRight;
      const previousInner = w.appImManager.chat.bubbles.chatInner;
      w.appImManager.setPeer({peerId});
      await new Promise<void>((resolve) => {
        const check = () => {
          const inner = w.appImManager.chat.bubbles.chatInner;
          if(inner !== previousInner && inner.isConnected && sidebar.sharedMediaTab?.peerId === peerId) resolve();
          else requestAnimationFrame(check);
        };
        check();
      });
      // * what ChatTopbar does on a click on the avatar
      sidebar.toggleSidebar(!sidebar.isShownOrOpening());
      sidebar.toggleSidebar(!sidebar.isShownOrOpening());
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return document.body.classList.contains('is-right-column-shown');
    }, peers[0]);
    expect(shownAfterTwoClicks, 'a second click on the avatar did not cancel the opening').toBe(false);

    // * back down the stack to a chat whose profile is still being filled: the stacked chat's profile stays on screen
    // * until that one is in - its chat is destroyed well before - and goes once it is
    const back = await page.evaluate(async([below, above]) => {
      const w = window as any;
      const sidebar = w.appSidebarRight;
      const mounted = (peerId: PeerId, previousInner: HTMLElement) => new Promise<void>((resolve) => {
        const check = () => {
          const inner = w.appImManager.chat.bubbles.chatInner;
          if(inner !== previousInner && inner.isConnected && sidebar.sharedMediaTab?.peerId === peerId) resolve();
          else requestAnimationFrame(check);
        };
        check();
      });
      const describeTab = (tab: any) => ({
        peerId: tab?.peerId as PeerId,
        connected: !!tab?.container.isConnected,
        nameLength: (tab?.container.querySelector('.profile-name')?.textContent || '').trim().length
      });

      let previousInner = w.appImManager.chat.bubbles.chatInner;
      w.appImManager.setPeer({peerId: below});
      await mounted(below, previousInner);
      // * built after the chat's first frame, so held back here until the stacked chat has come and gone
      const belowTab = sidebar.sharedMediaTab;
      const unbuilt = !belowTab.isLoaded && !belowTab._readyPromise;
      let release: () => void;
      const gate = new Promise<void>((resolve) => release = resolve);
      const ensureLoaded = belowTab.ensureLoaded.bind(belowTab);
      belowTab.ensureLoaded = () => gate.then(ensureLoaded);

      previousInner = w.appImManager.chat.bubbles.chatInner;
      w.appImManager.setInnerPeer({peerId: above});
      await mounted(above, previousInner);
      const aboveTab = sidebar.sharedMediaTab;
      await sidebar.toggleSidebar(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const stacked = describeTab(aboveTab);

      // * what the chat's back button does; the chat left is destroyed 350 ms later
      w.appImManager.setPeer({});
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const waiting = {
        shown: document.body.classList.contains('is-right-column-shown'),
        standIn: describeTab(aboveTab),
        belowConnected: belowTab.container.isConnected,
        current: sidebar.sharedMediaTab?.peerId as PeerId
      };

      // * closed and opened again meanwhile: it waits for the profile below, not slides in with the one standing in
      await sidebar.toggleSidebar(false);
      sidebar.toggleSidebar(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const reopenedEarly = document.body.classList.contains('is-right-column-shown');

      release();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const filled = {...describeTab(sidebar.sharedMediaTab), shown: document.body.classList.contains('is-right-column-shown')};
      const left = describeTab(aboveTab);
      await sidebar.toggleSidebar(false);
      return {unbuilt, stacked, waiting, reopenedEarly, filled, left};
    }, [peers[1], peers[2]]);

    expect(back.unbuilt, 'the profile of the chat below was built before it could be held back').toBe(true);
    expect(back.stacked.connected && back.stacked.nameLength > 0, 'the stacked chat showed no profile').toBe(true);
    expect(back.waiting.shown, 'the column closed on the way back').toBe(true);
    expect(back.waiting.belowConnected, 'the column swapped to a profile not filled yet').toBe(false);
    expect(back.waiting.standIn.connected && back.waiting.standIn.nameLength > 0,
      'the column stood empty while the profile below was being filled').toBe(true);
    // * what a link into the profile (gifts, a story album) works with
    expect(back.waiting.current, 'the profile standing in passed for the profile of the chat').toBe(peers[1]);
    expect(back.reopenedEarly, 'the column opened again with the profile of another chat').toBe(false);
    expect(back.filled.shown, 'the column opened again never slid in').toBe(true);
    expect(back.filled.peerId, 'the profile below never took its place').toBe(peers[1]);
    expect(back.filled.connected && back.filled.nameLength > 0, 'the profile below came in empty').toBe(true);
    expect(back.left.connected, 'the stacked chat left its profile behind').toBe(false);

    // * closed after a chat started getting ready with the column shown, before it is put up: its profile came with it,
    // * and its shared media must start loading all the same - nothing else starts them then, not even the column
    // * opened again over its history
    const closedMidway = await page.evaluate(async(peerId) => {
      const w = window as any;
      const sidebar = w.appSidebarRight;
      await sidebar.toggleSidebar(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result = {intercepted: false, loads: 0, shown: true};
      sidebar.replaceSharedMediaTab = (tab: any) => {
        if(tab?.peerId === peerId) {
          delete sidebar.replaceSharedMediaTab;
          result.intercepted = !!tab.searchSuper;
          if(tab.searchSuper) {
            const load = tab.searchSuper.load.bind(tab.searchSuper);
            tab.searchSuper.load = (...args: any[]) => (++result.loads, load(...args));
          }
          sidebar.toggleSidebar(false);
        }
        return Object.getPrototypeOf(sidebar).replaceSharedMediaTab.call(sidebar, tab);
      };
      w.appImManager.setPeer({peerId});
      await new Promise((resolve) => setTimeout(resolve, 3000));
      delete sidebar.replaceSharedMediaTab;
      result.shown = document.body.classList.contains('is-right-column-shown');
      return result;
    }, peers[2]);
    expect(closedMidway.intercepted, 'the chat was not put up with its profile built').toBe(true);
    expect(closedMidway.shown, 'the column did not close').toBe(false);
    expect(closedMidway.loads, 'the shared media of a profile built with its chat never started loading').toBeGreaterThan(0);

    // * closed, the column slides out a while yet - also when it is closed while still sliding in: a chat opened
    // * meanwhile must not put its profile up unfilled in it
    const slidingOut = await page.evaluate(async(targets) => {
      const w = window as any;
      const sidebar = w.appSidebarRight;
      if(!document.body.classList.contains('animation-level-2')) return {fullLevel: false, emptyFrames: [] as number[], slidingIn: false};
      const emptyFrames: number[] = [];
      let slidingIn = false;
      for(const [i, peerId] of targets.entries()) {
        const cancelsSlideIn = i === 1;
        await w.appImManager.chat.setPeerPromise;
        // * filled, so that the column slides in at once
        await sidebar.sharedMediaTab?.whenLoaded();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // * long enough for the chat to be put up, and its profile built, while the column is still on its way out
        document.documentElement.style.setProperty('--transition-standard-out-time', '0.8s');
        if(cancelsSlideIn) {
          sidebar.toggleSidebar(true);
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          slidingIn = document.body.classList.contains('is-right-column-shown');
        } else {
          await sidebar.toggleSidebar(true);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        sidebar.toggleSidebar(false);
        w.appImManager.setPeer({peerId});
        let empty = 0;
        const started = performance.now();
        await new Promise<void>((resolve) => {
          const check = () => {
            const tab = sidebar.sharedMediaTab;
            if(tab?.peerId === peerId && tab.container.isConnected &&
              !(tab.container.querySelector('.profile-name')?.textContent || '').trim()) {
              ++empty;
            }
            if(performance.now() - started < 800) requestAnimationFrame(check);
            else resolve();
          };
          requestAnimationFrame(check);
        });
        document.documentElement.style.removeProperty('--transition-standard-out-time');
        emptyFrames.push(empty);
      }

      return {fullLevel: true, emptyFrames, slidingIn};
    }, [peers[0], peers[1]]);
    expect(slidingOut.fullLevel, 'the preview runs below the full animation level, where the column does not slide').toBe(true);
    expect(slidingOut.slidingIn, 'the column did not start sliding in before it was closed').toBe(true);
    expect(slidingOut.emptyFrames, 'the column on its way out showed a profile not filled yet').toEqual([0, 0]);
  });
});

/** Conversations an opening reads nothing in: the preview may be signed in to a real account */
async function pickReadConversations(page: Page, count: number) {
  return page.evaluate(async(count) => {
    const w = window as any;
    const {dialogs} = await w.rootScope.managers.dialogsStorage.getDialogs({filterId: 0, limit: 40});
    return dialogs.filter((dialog: any) => dialog._ === 'dialog' && dialog.top_message && dialog.peerId !== w.rootScope.myId &&
      !dialog.unread_count && !dialog.pFlags?.unread_mark && !dialog.unread_mentions_count && !dialog.unread_reactions_count &&
      !w.apiManagerProxy.isForum(dialog.peerId) && !w.apiManagerProxy.isMonoforum(dialog.peerId) && !w.apiManagerProxy.isBotforum(dialog.peerId))
    .slice(0, count)
    .map((dialog: any) => dialog.peerId as PeerId);
  }, count);
}

async function openReadConversation(page: Page) {
  const [peerId] = await pickReadConversations(page, 1);
  expect(peerId, 'no conversation with nothing unread to open').toBeTruthy();
  // A real mouse click, not `el.click()` and not Enter on the focused row: the
  // chat list opens a conversation from `attachClickEvent`, which wants the
  // pointer sequence and ignores both of the cheaper ways in. In the chat list
  // itself: the empty column's tips show rows of chats too, under their other cards.
  await page.locator(`#column-left a.chatlist-chat[data-peer-id="${peerId}"]`).first().click();
  // counted rather than awaited through a locator: the first `.bubble` in the
  // conversation is the sticky date, which is not a visible box of its own
  await page.waitForFunction(() => document.querySelectorAll('#column-center .bubble').length > 0,
    null, {timeout: 60_000});
  await page.waitForTimeout(2000);
  return await page.evaluate(() => String((window as any).appImManager?.chat?.peerId ?? ''));
}
