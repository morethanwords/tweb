import {expect, Page, test} from '@playwright/test';
import {openChatList} from './chatList.helpers';

/*
 * A reaction chosen in a message's menu flies to its place in the message (`components/chat/reactionFlight`), as on
 * iOS: a picture of it stays where it was picked as the menu goes, then is tossed there - up over where it starts and
 * down onto the reaction's sticker in the message, which stays hidden till it lands - and lands on the very box the
 * sticker is drawn in. The compositor moves it: it is laid out once and no script writes on it while it flies; the
 * reaction plays in its place only as it lands, and nothing of the flight is left. A pick that takes the reaction off
 * flies nothing, and at the reduced animation level nothing flies at all.
 *
 * Nothing reaches Telegram: the chat's `sendReaction` is replaced, for the test, by what the worker hands the tab for a
 * reaction set or taken off (a `messages_reactions` event, in this tab only), and the message's reactions are put back
 * after. It reacts to a message of the account's service notifications (777000), which every account has. Like the
 * other signed-in specs it runs against an authorized preview, and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:react:app
 */

const SERVICE_NOTIFICATIONS = 777000;

type Rect = {left: number, top: number, width: number, height: number};
type Frame = {
  time: number,
  // the flying picture, while it flies, and what script has written on it
  flight: Rect | null,
  written: string,
  // the reaction's sticker in the message, and whether it can be seen
  sticker: Rect | null,
  stickerVisible: boolean,
  // the reaction's own animation, played in its place
  activate: boolean
};

test.describe('a reaction chosen for a message', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');
  test.use({viewport: {width: 1280, height: 800}});

  test.afterEach(async({page}) => {
    await page.evaluate(() => {
      const w = window as any;
      w.liteMode.setAnimationLevel(2);
      const {chat} = w.appImManager;
      delete chat.sendReaction;
      const saved: Map<number, any> = w.__reactionsBefore;
      saved?.forEach((reactions, mid) => {
        const message = chat.getMessageByPeer(chat.peerId, mid);
        message.reactions = reactions;
        w.rootScope.dispatchEventSingle('messages_reactions', [{message, changedResults: [], removedResults: []}]);
      });
      saved?.clear();
    }).catch(() => {});
  });

  /** opens the service notifications and returns the last message there that has no reactions */
  async function openMessage(page: Page) {
    test.setTimeout(4 * 60_000);
    await openChatList(page);
    // * a chat of a user opens once the worker has the user: on a fresh sign-in the list shows before it does, and a chat
    // * opened before that is left half open
    // * (a promise the page answers with is no answer to `waitForFunction`: it is polled from here)
    await expect.poll(() => page.evaluate(async(userId) => {
      return !!(await (window as any).rootScope.managers.appUsersManager.getUser(userId))?.access_hash;
    }, SERVICE_NOTIFICATIONS), {timeout: 60_000}).toBe(true);
    await page.evaluate((peerId) => (window as any).appImManager.setInnerPeer({peerId}), SERVICE_NOTIFICATIONS);
    await page.waitForFunction((peerId) => {
      const chat = (window as any).appImManager.chat;
      return chat?.peerId === peerId && chat.bubbles.scrollable.loadedAll.bottom &&
        document.querySelectorAll('#column-center .bubble.is-in[data-mid]').length;
    }, SERVICE_NOTIFICATIONS, {timeout: 60_000});
    await page.waitForTimeout(1500);

    // * the worker's answer to a reaction set or taken off, in this tab only. The worker never holds it, so a message it
    // * hands the tab anew (read, say) comes without it: what it was set to is kept here and put on it again (`keep`)
    const mid: number = await page.evaluate(() => {
      const w = window as any;
      const {chat} = w.appImManager;
      const saved: Map<number, any> = w.__reactionsBefore ??= new Map();
      const now: Map<number, any> = w.__reactionsNow = new Map();
      w.__keepReactions = () => now.forEach((reactions, mid) => chat.getMessageByPeer(chat.peerId, mid).reactions = reactions);
      const same = (a: any, b: any) => a._ === b._ && a.emoticon === b.emoticon && '' + a.document_id === '' + b.document_id;
      chat.sendReaction = ({message, reaction}: {message: any, reaction: any}) => {
        const current = chat.getMessageByPeer(message.peerId, message.mid);
        if(!saved.has(current.mid)) saved.set(current.mid, current.reactions);
        const chosen = (now.get(current.mid) ?? current.reactions)?.results.find((reactionCount: any) => {
          return reactionCount.chosen_order !== undefined && same(reactionCount.reaction, reaction);
        });
        const reactionCount = chosen ? undefined : {_: 'reactionCount', reaction, count: 1, chosen_order: 0};
        current.reactions = {
          _: 'messageReactions',
          results: reactionCount ? [reactionCount] : [],
          recent_reactions: [],
          pFlags: {can_see_list: true}
        };
        now.set(current.mid, current.reactions);
        w.rootScope.dispatchEventSingle('messages_reactions', [{
          message: current,
          changedResults: reactionCount ? [reactionCount] : [],
          removedResults: []
        }]);
        return Promise.resolve();
      };

      // * the last one in full view, a little under the chat's top: its reactions grow it there
      const view = chat.bubbles.scrollable.container.getBoundingClientRect();
      const bubbles = Array.from(document.querySelectorAll<HTMLElement>('#column-center .bubble.is-in[data-mid]'));
      const bubble = bubbles.reverse().find((bubble) => {
        const rect = bubble.getBoundingClientRect();
        return !bubble.querySelector('reactions-element') && rect.top > view.top + 60 && rect.bottom < view.bottom - 10;
      });
      return bubble && +bubble.dataset.mid;
    });
    expect(mid, 'a message to react to').toBeTruthy();
    return mid;
  }

  /** opens the message's menu and returns where its first reaction is */
  async function openMenu(page: Page, mid: number) {
    const content = page.locator(`#column-center .bubble[data-mid="${mid}"] .bubble-content`);
    const box = await content.boundingBox();
    await page.mouse.click(box.x + 20, box.y + box.height / 2, {button: 'right'});
    const reaction = page.locator('.btn-menu-reactions-reaction').first();
    await reaction.waitFor({state: 'visible'});
    // * its emoji drawn, and the menu done opening
    await page.waitForFunction(() => {
      const media = document.querySelector('.btn-menu-reactions-reaction canvas, .btn-menu-reactions-reaction img');
      return media && media.getBoundingClientRect().width > 0;
    });
    await page.waitForTimeout(700);
    return reaction.boundingBox();
  }

  /** picks the reaction at `point` and returns every frame from then until it is all over */
  async function pick(page: Page, mid: number, point: {x: number, y: number}) {
    await page.evaluate((mid) => {
      const w = window as any;
      w.__keepReactions();
      const frames: Frame[] = w.__reactionFrames = [];
      const toRect = (element: Element): Rect => {
        if(!element) return null;
        const rect = element.getBoundingClientRect();
        return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
      };
      const started = performance.now();
      const record = () => {
        const flight = document.querySelector('[class*="_flight_"]');
        const sticker = document.querySelector(`#column-center .bubble[data-mid="${mid}"] reaction-element .reaction-sticker`);
        frames.push({
          time: performance.now() - started,
          flight: toRect(flight?.querySelector('[class*="_path_"]')),
          written: flight?.getAttribute('style') ?? '',
          sticker: toRect(sticker),
          stickerVisible: !!sticker && getComputedStyle(sticker).visibility === 'visible',
          activate: !!sticker?.querySelector('.reaction-sticker-activate')
        });
        if(performance.now() - started < 2000) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    }, mid);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(2200);
    return page.evaluate(() => ({
      frames: (window as any).__reactionFrames as Frame[],
      left: document.querySelectorAll('[class*="_flight_"]').length
    }));
  }

  const center = (rect: Rect) => ({x: rect.left + rect.width / 2, y: rect.top + rect.height / 2});

  // * one sign-in for all of it: each fresh one is another authorization of the preview's account, and a chat opened right
  // * after one may not open at all
  test('flies from where it was picked to its sticker, unless taken off or at the reduced level', async({page}) => {
    const mid = await openMessage(page);
    const pickFirst = async() => {
      const picked = await openMenu(page, mid);
      const point = {x: picked.x + picked.width / 2, y: picked.y + picked.height / 2};
      return {point, ...await pick(page, mid, point)};
    };

    await test.step('flies to its sticker', async() => {
      const {point, frames, left} = await pickFirst();
      const flying = frames.filter((frame) => frame.flight);
      expect(flying.length, 'it flew').toBeGreaterThan(5);
      const [first] = flying;
      const last = flying[flying.length - 1];
      const ended = frames[frames.indexOf(last) + 1];
      expect(ended, 'it landed').toBeTruthy();

      // * it starts where it was picked, on the picked emoji
      const start = center(first.flight);
      expect(Math.abs(start.x - point.x), 'starts on the picked reaction').toBeLessThan(8);
      expect(Math.abs(start.y - point.y), 'starts on the picked reaction').toBeLessThan(8);

      // * laid out once: nothing but the compositor moves it
      expect(new Set(flying.map((frame) => frame.written)).size, 'no script wrote on it while it flew').toBe(1);

      // * tossed: up over where it starts first, unless it goes far up anyway
      const target = center(ended.sticker);
      if(target.y - start.y > -100) {
        const highest = Math.min(...flying.map((frame) => center(frame.flight).y));
        expect(highest, 'it went up over where it started').toBeLessThan(start.y - 10);
      }

      // * it comes ever nearer its sticker as it ends, and lands on the box the sticker is drawn in
      const distances = flying.map((frame) => Math.hypot(center(frame.flight).x - target.x, center(frame.flight).y - target.y));
      const closing = distances.slice(Math.floor(distances.length * .6));
      closing.forEach((distance, index) => {
        if(index) expect(distance, 'nearer every frame at its end').toBeLessThanOrEqual(closing[index - 1] + .5);
      });
      expect(Math.abs(last.flight.left - ended.sticker.left), 'lands on the sticker').toBeLessThan(3);
      expect(Math.abs(last.flight.top - ended.sticker.top), 'lands on the sticker').toBeLessThan(3);
      expect(Math.abs(last.flight.width - ended.sticker.width), 'as big as the sticker').toBeLessThan(2);

      // * the reaction in the message stays hidden till it lands, and plays in its place only then
      expect(flying.every((frame) => !frame.stickerVisible), 'the sticker is hidden while it flies').toBe(true);
      expect(ended.stickerVisible, 'the sticker shows as it lands').toBe(true);
      expect(flying.some((frame) => frame.activate), 'the reaction plays only as it lands').toBe(false);

      // * nothing of it is left
      expect(left).toBe(0);
    });

    await test.step('flies nothing when the pick takes it off', async() => {
      await page.waitForTimeout(1000);
      const {frames} = await pickFirst();
      expect(frames.some((frame) => frame.flight), 'nothing flew').toBe(false);
      expect(frames[frames.length - 1].sticker, 'the reaction is off').toBeNull();
    });

    await test.step('just comes at the reduced animation level', async() => {
      await page.waitForTimeout(1000);
      await page.evaluate(() => (window as any).liteMode.setAnimationLevel(1));
      const {frames} = await pickFirst();
      expect(frames.some((frame) => frame.flight), 'nothing flew').toBe(false);
      const shown = frames.find((frame) => frame.sticker);
      expect(shown, 'the reaction came').toBeTruthy();
      expect(shown.stickerVisible, 'shown at once').toBe(true);
    });
  });
});
