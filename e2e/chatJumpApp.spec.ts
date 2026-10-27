import {expect, Page, test} from '@playwright/test';

/*
 * A jump in a chat — a search result, a reply, a link to a message — goes where it was asked, whatever
 * the chat is busy with when it is asked:
 * - a jump made while the last one still loads its history takes over from it (it used to be dropped:
 *   the next search result clicked went nowhere);
 * - a jump made while the chat is still opening is made once it has;
 * - the viewport slice the chat makes a few seconds after a scroll does not cut the jump short (it
 *   sliced the old list still on screen, forgot the new one's history load, and the jump went nowhere,
 *   leaving the old list up: a search result clicked a few seconds after a scroll needed a second click).
 *
 * It needs a signed-in account with a channel or a supergroup with some history, so like the other
 * signed-in specs it runs against an authorized preview and skips rather than reporting a pass it never
 * made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 npx playwright test e2e/chatJumpApp.spec.ts
 */

// * how far down the chat list to look for a chat with history
const DIALOGS_LIMIT = 30;
// * the messages a target is picked from: far enough up not to be in the list a chat opens with
const HISTORY_DEPTH = 100;

type Chat = {peerId: number, mids: number[], otherPeerId: number};

test.describe('a jump in a chat', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  // * looked up once: `null` when the account has no chat with enough history
  let found: Chat | null;

  test.beforeEach(async({page}) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
    if(found === undefined) found = await findChat(page) ?? null;
    test.skip(!found, 'no channel or supergroup with enough history in the recent chats of this account');
  });

  test('made while the last one still loads, goes where it was asked', async({page}) => {
    await open(page, found.peerId);
    const [first, second] = [found.mids[HISTORY_DEPTH / 2], found.mids[found.mids.length - 1]];
    await page.evaluate(({first, second}) => {
      const chat = (window as any).appImManager.chat;
      chat.setMessageId({lastMsgId: first, lastMsgPeerId: chat.peerId});
      // * the first one is on its way: the chat changes until its history is in
      if(!chat.setPeerPromise) throw new Error('the first jump was not in flight');
      chat.setMessageId({lastMsgId: second, lastMsgPeerId: chat.peerId});
    }, {first, second});

    await expectShown(page, second);
  });

  test('made after the last one rendered its target nearby, goes there and shows the list', async({page}) => {
    await open(page, found.peerId);
    // * neighbours: the first jump's list holds the second target too
    const [first, second] = [found.mids[found.mids.length - 10], found.mids[found.mids.length - 11]];
    const detached = await page.evaluate(({first, second}) => new Promise<boolean>((resolve) => {
      const chat = (window as any).appImManager.chat;
      chat.setMessageId({lastMsgId: first, lastMsgPeerId: chat.peerId});
      const wait = () => {
        // * the first one has rendered its list, and waits for its media before it shows it
        const bubble = chat.bubbles.getBubble(chat.peerId, second);
        if(bubble && !bubble.isConnected && chat.setPeerPromise) {
          chat.setMessageId({lastMsgId: second, lastMsgPeerId: chat.peerId});
          resolve(true);
        } else if(!chat.setPeerPromise) {
          resolve(false);
        } else {
          requestAnimationFrame(wait);
        }
      };
      requestAnimationFrame(wait);
    }), {first, second});
    expect(detached, 'the second target was rendered into the first jump\'s list before that was shown').toBe(true);

    await expectShown(page, second);
  });

  test('made while the chat opens, is made once it has', async({page}) => {
    await open(page, found.otherPeerId);
    const target = found.mids[found.mids.length - 1];
    const opening = await page.evaluate(({peerId, target}) => new Promise<boolean>((resolve) => {
      const appImManager = (window as any).appImManager;
      appImManager.setInnerPeer({peerId});
      const wait = () => {
        const chat = appImManager.chat;
        if(chat.peerId !== peerId) {
          requestAnimationFrame(wait);
          return;
        }

        const opening = !!chat.setPeerPromise;
        chat.setMessageId({lastMsgId: target, lastMsgPeerId: peerId});
        resolve(opening);
      };
      wait();
    }), {peerId: found.peerId, target});
    expect(opening, 'the jump was asked for while the chat opened').toBe(true);

    await expectShown(page, target);
  });

  test('is not cut short by the viewport slice due after a scroll', async({page}) => {
    await open(page, found.peerId);
    // * a list long enough to have a part out of sight above, which the slice cuts
    const outOfSight = await page.evaluate(async() => {
      const {bubbles} = (window as any).appImManager.chat;
      for(let i = 0; i < 20 && !bubbles.getViewportSlice(true).invisibleTop.length; ++i) {
        // * a load already on its way (the preload after opening) is waited for, else one is asked for
        if(!bubbles.getHistoryTopPromise) bubbles.loadMoreHistory(true);
        await bubbles.getHistoryTopPromise?.catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return bubbles.getViewportSlice(true).invisibleTop.length;
    });
    expect(outOfSight, 'bubbles out of sight above for the slice to cut').toBeGreaterThan(0);
    const target = found.mids[found.mids.length - 1];
    await page.evaluate((target) => new Promise<void>((resolve) => {
      const chat = (window as any).appImManager.chat;
      const {bubbles} = chat;
      const before = bubbles.getHistoryTopPromise;
      chat.setMessageId({lastMsgId: target, lastMsgPeerId: chat.peerId});
      // * the slice the chat makes after a scroll comes due while the jump loads its history
      const wait = () => {
        if(!bubbles.getHistoryTopPromise || bubbles.getHistoryTopPromise === before) {
          requestAnimationFrame(wait);
          return;
        }

        bubbles.sliceViewport(true);
        resolve();
      };
      wait();
    }), target);

    await expectShown(page, target);
  });
});

// * a channel or a supergroup with at least `HISTORY_DEPTH` messages, and another chat to open first
async function findChat(page: Page): Promise<Chat> {
  return page.evaluate(async({limit, depth}) => {
    const managers = (window as any).appImManager.managers;
    const {dialogs} = await managers.dialogsStorage.getDialogs({filterId: 0, limit});
    for(const {peerId} of dialogs) {
      if(peerId > 0 || !await managers.appPeersManager.isChannel(peerId)) {
        continue;
      }

      const result = await managers.appMessagesManager.getHistory({peerId, limit: depth}).catch((): undefined => undefined);
      const mids: number[] = result?.history || [];
      if(mids.length < depth) {
        continue;
      }

      const other = dialogs.find((dialog: {peerId: number}) => dialog.peerId !== peerId);
      return {peerId, mids, otherPeerId: other.peerId};
    }
  }, {limit: DIALOGS_LIMIT, depth: HISTORY_DEPTH});
}

async function open(page: Page, peerId: number) {
  await page.evaluate(async({peerId, limit}) => {
    const appImManager = (window as any).appImManager;
    // * a fresh page knows only the chats its list has drawn: load as many as the search went through
    await appImManager.managers.dialogsStorage.getDialogs({filterId: 0, limit});
    await appImManager.setInnerPeer({peerId});
  }, {peerId, limit: DIALOGS_LIMIT});
  await page.waitForFunction((peerId) => {
    const chat = (window as any).appImManager.chat;
    return chat.peerId === peerId && !chat.setPeerPromise && chat.bubbles.chatInner.isConnected;
  }, peerId, {timeout: 30_000});
}

// * the chat has settled on a list of its own, with the target (or the album it is in) in view
async function expectShown(page: Page, mid: number) {
  await page.waitForFunction(() => !(window as any).appImManager.chat.setPeerPromise, null, {timeout: 30_000});
  const shown = () => page.evaluate((mid) => {
    const chat = (window as any).appImManager.chat;
    const {chatInner} = chat.bubbles;
    const target = chatInner.querySelector(`.bubble[data-mid="${mid}"], .grouped-item[data-mid="${mid}"]`);
    const viewport = chat.bubblesViewport.getBoundingClientRect();
    const rect = target?.getBoundingClientRect();
    return {
      mounted: chatInner.isConnected,
      inView: !!rect && rect.bottom > viewport.top && rect.top < viewport.bottom
    };
  }, mid);
  // * the scroll to it may still be on its way
  await expect.poll(shown, {timeout: 10_000}).toEqual({mounted: true, inView: true});
}
