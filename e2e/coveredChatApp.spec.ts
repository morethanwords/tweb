import {expect, Page, test} from '@playwright/test';
import {openChat, openChatList} from './chatList.helpers';

/*
 * A chat another one is opened over (a link, a mention, a profile's "Send Message") stays in the page under
 * it, laid out, for its scroll to be where it was when it is gone back to. Once the chat over it has come
 * in, nothing of it is styled or drawn any more: it was drawn at opacity 0, and its CSS animations (the
 * sparkles of a channel's paid reactions) and its thousands of elements were restyled in every frame the
 * page made — the right column's opening took twice the work over such a chat.
 * - while the chats cross, the one left is drawn still (hidden at once, it left frames with neither);
 * - once the other is in, the one left is `content-visibility: hidden`;
 * - gone back to, it is drawn from the first frame it is shown in, with its scroll where it was.
 *
 * It needs a signed-in account with two chats, so like the other signed-in specs it runs against an
 * authorized preview and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 npx playwright test e2e/coveredChatApp.spec.ts
 */

// * what a chat of the stack is in a frame: `id` is the order the chats were first seen in
type ChatFrame = {id: number, active: boolean, opacity: number, hidden: boolean};
type Frame = {t: number, chats: ChatFrame[]};

test.describe('a chat another one is opened over', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  test('is not drawn once the other is in, and is back as it was', async({page}) => {
    test.setTimeout(4 * 60_000);
    await openChatList(page, {query: '?noSharedWorker=1', minRows: 2});
    const peerIds = await findChats(page);
    expect(peerIds.length, 'two chats with some history in the recent chats of this account').toBe(2);
    const [under, over] = peerIds;

    await open(page, under);
    // * somewhere else than where it opened, for its scroll to have something to keep: what is in view then
    await page.evaluate(async() => {
      const {bubbles} = (window as any).appImManager.chat;
      const container = bubbles.scrollable.container as HTMLElement;
      container.scrollTop = Math.max(0, container.scrollTop - 200);
      // * near its top the chat loads more history, and that moves the scroll
      for(let i = 0; i < 20; ++i) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        if(!bubbles.getHistoryTopPromise) break;
        await bubbles.getHistoryTopPromise.catch((): void => {});
      }
    });
    const inView = await anchor(page);
    expect(inView, 'a message in view').toBeTruthy();

    const forward = await record(page, async() => {
      await (window as any).appImManager.setInnerPeer({peerId: (window as any).__over});
    }, over);
    // * the frames of the crossing: drawn until it has faded away
    expect(hiddenEarly(forward), 'a frame where a chat was hidden before it had faded').toBeUndefined();
    expect(chatIn(forward[forward.length - 1], 0).hidden, 'nothing of the covered chat is styled or drawn').toBe(true);

    const back = await record(page, async() => {
      (window as any).appImManager.setPeer({});
    });
    expect(hiddenEarly(back), 'a frame where a chat was hidden before it had faded').toBeUndefined();
    const shown = back.map((frame) => chatIn(frame, 0)).filter((chat) => chat.active);
    expect(shown.length, 'the chat gone back to is shown').toBeGreaterThan(0);
    expect(shown.find((chat) => chat.hidden), 'a frame where the chat gone back to was shown undrawn').toBeUndefined();
    expect(await page.evaluate(() => (window as any).appImManager.chat.peerId)).toBe(under);
    expect(await anchor(page, inView.mid), 'the message in view stands where it stood').toEqual(inView);
  });

  test('turned back to midway, neither chat is hidden before it has faded', async({page}) => {
    test.setTimeout(4 * 60_000);
    await openChatList(page, {query: '?noSharedWorker=1', minRows: 2});
    const [under, over] = await findChats(page);
    expect(over, 'two chats with some history in the recent chats of this account').toBeTruthy();
    await open(page, under);
    // * the crossing slowed down, for the turn back to be in the middle of it whatever the main thread is busy with
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', {playbackRate: 0.25});

    const frames = await record(page, async() => {
      const appImManager = (window as any).appImManager;
      appImManager.setInnerPeer({peerId: (window as any).__over});
      // * the chat over it has started to come in: it is turned back a third of the way into the crossing
      await new Promise<void>((resolve) => {
        const check = () => appImManager.chats[1]?.container.classList.contains('active') ? resolve() : requestAnimationFrame(check);
        check();
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      appImManager.setPeer({});
    }, over);
    expect(frames.some((frame) => frame.chats.length > 1 && chatIn(frame, 1).active), 'the chat over it came in').toBe(true);
    expect(hiddenEarly(frames), 'a frame where a chat was hidden before it had faded').toBeUndefined();
    expect(chatIn(frames[frames.length - 1], 0), 'the chat turned back to is shown').toMatchObject({active: true, hidden: false});
  });
});

// * a chat not shown and not drawn while it still could be seen
function hiddenEarly(frames: Frame[]) {
  return frames.find((frame) => frame.chats.some((chat) => chat.hidden && chat.opacity > 0.05));
}

function chatIn(frame: Frame, id: number) {
  return frame.chats.find((chat) => chat.id === id);
}

// * two chats of the recent ones, not forums (they open on their topics), each with a screenful of history
async function findChats(page: Page): Promise<number[]> {
  return page.evaluate(async() => {
    const appImManager = (window as any).appImManager;
    const {managers} = appImManager;
    const {dialogs} = await managers.dialogsStorage.getDialogs({filterId: 0, limit: 30});
    const found: number[] = [];
    for(const {peerId} of dialogs) {
      if(await managers.appPeersManager.isForum(peerId) || await managers.appPeersManager.isBotforum(peerId)) {
        continue;
      }

      const result = await managers.appMessagesManager.getHistory({peerId, limit: 40}).catch((): undefined => undefined);
      if((result?.history?.length || 0) >= 40 && found.push(peerId) === 2) {
        break;
      }
    }

    return found;
  });
}

async function open(page: Page, peerId: number) {
  await openChat(page, peerId);
  // * the crossing of the chats, and the list's first settling
  await page.waitForTimeout(1000);
}

// * the first message of the open chat that is wholly in view (or the one asked for), and where it stands in it
async function anchor(page: Page, mid?: string) {
  return page.evaluate((mid) => {
    const {bubbles} = (window as any).appImManager.chat;
    const viewport = (bubbles.scrollable.container as HTMLElement).getBoundingClientRect();
    const list = [...(bubbles.chatInner as HTMLElement).querySelectorAll<HTMLElement>('.bubble[data-mid]')];
    const bubble = mid ? list.find((bubble) => bubble.dataset.mid === mid) : list.find((bubble) => {
      const rect = bubble.getBoundingClientRect();
      return rect.top >= viewport.top && rect.bottom <= viewport.bottom;
    });
    return bubble && {mid: bubble.dataset.mid, top: Math.round(bubble.getBoundingClientRect().top - viewport.top)};
  }, mid);
}

// * what the chats are in every frame while `action` runs and for a while after it
async function record(page: Page, action: () => Promise<void>, over?: number): Promise<Frame[]> {
  return page.evaluate(async({action, over}) => {
    const w = window as any;
    w.__over = over;
    // * ids by the order the chats are first seen in: the first chat of the stack is 0
    const ids: Map<HTMLElement, number> = w.__chatIds ??= new Map(w.appImManager.chats.map((chat: any, i: number) => [chat.container, i]));
    const frames: Frame[] = [];
    const t0 = performance.now();
    let done = false;
    const sample = () => {
      const chats = [...document.querySelectorAll<HTMLElement>('.chats-container > .chat')].map((container) => {
        if(!ids.has(container)) ids.set(container, ids.size);
        const style = getComputedStyle(container);
        return {
          id: ids.get(container),
          active: container.classList.contains('active'),
          opacity: +style.opacity,
          hidden: style.contentVisibility === 'hidden'
        };
      });
      frames.push({t: Math.round(performance.now() - t0), chats});
      if(!done) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    await new Function(`return (${action})()`)();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    done = true;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return frames;
  }, {action: action.toString(), over});
}
