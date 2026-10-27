import {expect, Page, test} from '@playwright/test';
import {openChatList} from './chatList.helpers';

/*
 * The line under a peer's name - the last message of its chat-list row, the status in the chat's
 * topbar and in its profile - crossfades to what takes its place when that says something else,
 * as the official apps have it (`crossfadeContent`): an activity ("typing…") coming and going, a
 * status in other words ("online" giving way to "last seen just now"). A status that only counts
 * on - the minutes of "last seen 2 minutes ago" - changes in place.
 *
 * The updates are faked locally - handed to the update pipeline the way the server's would be -
 * and nothing is sent anywhere; the status the peer really had is put back after.
 *
 * It needs a signed-in account, so like the other signed-in specs it runs against an authorized
 * preview, and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/peerTypingCrossfade.spec.ts
 */

type Place = 'row' | 'topbar' | 'profile';
type Frame = Record<Place, {
  /** the activity is among the line's own children - what it shows, or fades to */
  typing: boolean,
  /** the opacity of what fades out over it, if anything does */
  leaving: number | null,
  /** what fades out is the activity */
  leavingTyping: boolean,
  /** what fades out is left out of the accessibility tree */
  leavingHidden: boolean,
  text: string
}>;

/** what a place went through, each state once - for the message of a failure */
function states(frames: Frame[], place: Place) {
  return JSON.stringify(frames.map((frame) => frame[place]).filter((state, i, states) => {
    return !i || JSON.stringify(state) !== JSON.stringify(states[i - 1]);
  }));
}

/** a user's row of the chat list, brought into sight, whose chat is then opened */
async function openUser(page: Page) {
  return page.evaluate(async() => {
    const w = window as any;
    const row = Array.from(document.querySelectorAll<HTMLElement>('#column-left .chatlist-chat[data-peer-id]')).find((row) => {
      const peerId = +row.dataset.peerId;
      const user = peerId > 0 && w.apiManagerProxy.getUser(peerId);
      return user && !user.pFlags.bot && !user.pFlags.self && !user.pFlags.support;
    });
    if(!row) return;

    row.scrollIntoView({block: 'center'});
    const peerId = +row.dataset.peerId;
    await w.appImManager.setInnerPeer({peerId});
    return peerId;
  });
}

/** opens the profile of the open chat in the right column, once the chat is there */
async function openProfile(page: Page, peerId: number) {
  await page.waitForFunction((peerId) => {
    const w = window as any;
    const chat = w.appImManager.chat;
    // * the column takes the chat's profile once the chat is switched to (`replaceSharedMediaTab`)
    return chat?.peerId === peerId && chat.topbar?.subtitle?.isConnected && !!w.appSidebarRight.sharedMediaTab;
  }, peerId);
  await page.evaluate(() => (window as any).appSidebarRight.toggleSidebar(true));
  await expect(page.locator('.profile-subtitle-status')).toBeVisible();
}

/** Hands the update pipeline `update`, and reports the three lines of the peer on every frame after */
function observe(page: Page, peerId: number, update: Record<string, any>) {
  return page.evaluate(async({peerId, update}) => {
    const w = window as any;
    const lines = (): Record<Place, HTMLElement> => ({
      row: document.querySelector(`#column-left .chatlist-chat[data-peer-id="${peerId}"] .row-subtitle`),
      topbar: w.appImManager.chat.topbar.subtitle,
      profile: document.querySelector('.profile-subtitle-status')
    });

    const frames: Frame[] = [];
    const snapshot = () => {
      const frame = {} as Frame;
      for(const [place, line] of Object.entries(lines()) as [Place, HTMLElement][]) {
        const leaving = line.querySelector<HTMLElement>(':scope > .crossfade-leaving');
        frame[place] = {
          typing: !!line.querySelector(':scope > .peer-typing-container'),
          leaving: leaving ? +getComputedStyle(leaving).opacity : null,
          leavingTyping: !!leaving?.querySelector('.peer-typing-container'),
          leavingHidden: leaving?.getAttribute('aria-hidden') === 'true',
          text: line.textContent
        };
      }

      frames.push(frame);
    };

    snapshot();
    w.rootScope.managers.apiUpdatesManager.processLocalUpdate(update);

    // * past the crossfade, and past the last message rendered back
    const start = performance.now();
    return new Promise<Frame[]>((resolve) => {
      const tick = () => {
        snapshot();
        if(performance.now() - start < 1200) requestAnimationFrame(tick);
        else resolve(frames);
      };
      tick();
    });
  }, {peerId, update});
}

const typingUpdate = (peerId: number, action: 'sendMessageTypingAction' | 'sendMessageCancelAction') => {
  return {_: 'updateUserTyping', user_id: peerId, action: {_: action}};
};

const statusUpdate = (peerId: number, status: Record<string, any>) => {
  return {_: 'updateUserStatus', user_id: peerId, status};
};

/** what fades out is never there to be read out */
function expectLeavingHidden(frames: Frame[], places: Place[]) {
  for(const frame of frames) for(const place of places) {
    if(frame[place].leaving !== null) expect(frame[place].leavingHidden, `${place}: what faded out was exposed`).toBe(true);
  }
}

test.describe('the line under a peer\'s name', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1440, height: 900}});

  let peerId: number;
  test.beforeEach(async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page);
    test.skip(
      !await page.evaluate(() => document.body.classList.contains('animation-level-2')),
      'animations are off in this client'
    );

    peerId = await openUser(page);
    test.skip(!peerId, 'no user in the chat list of this account');
    await openProfile(page, peerId);
    // * no activity left over from before
    await observe(page, peerId, typingUpdate(peerId, 'sendMessageCancelAction'));
  });

  test('crossfades to an activity and back - in the chat list, the topbar and the profile', async({page}) => {
    const places: Place[] = ['row', 'topbar', 'profile'];
    const typing = await observe(page, peerId, typingUpdate(peerId, 'sendMessageTypingAction'));
    const before = typing[0];
    for(const place of places) {
      expect(before[place].typing, `${place}: typing before it started`).toBe(false);
      // * the new and the old at once: the frames of a slow machine may well miss the middle of it
      expect(
        typing.some((frame) => frame[place].typing && frame[place].leaving !== null),
        `${place}: the activity did not crossfade in - ${states(typing, place)}`
      ).toBe(true);
      const last = typing[typing.length - 1][place];
      expect(last.typing && last.leaving === null, `${place}: it did not settle on the activity`).toBe(true);
    }

    const stopped = await observe(page, peerId, typingUpdate(peerId, 'sendMessageCancelAction'));
    for(const place of places) {
      expect(
        stopped.some((frame) => !frame[place].typing && frame[place].leavingTyping),
        `${place}: the activity did not crossfade out - ${states(stopped, place)}`
      ).toBe(true);
      const last = stopped[stopped.length - 1][place];
      expect(last.typing || last.leaving !== null, `${place}: it did not settle on the line`).toBe(false);
    }

    // * the very message it took the place of - a status may have changed meanwhile (typing is online)
    expect(stopped[stopped.length - 1].row.text).toBe(before.row.text);
    expectLeavingHidden([...typing, ...stopped], places);
  });

  test('crossfades to a status in other words, and puts one that counts on in place', async({page}) => {
    const places: Place[] = ['topbar', 'profile'];
    const status = await page.evaluate((peerId) => (window as any).apiManagerProxy.getUser(peerId).status, peerId);
    const now = () => Date.now() / 1000 | 0;

    try {
      await observe(page, peerId, statusUpdate(peerId, {_: 'userStatusOnline', expires: now() + 300}));

      // * "online" → "last seen just now", and that → "last seen 2 minutes ago": other words
      for(const wasOnline of [now() - 10, now() - 120]) {
        const reworded = await observe(page, peerId, statusUpdate(peerId, {_: 'userStatusOffline', was_online: wasOnline}));
        for(const place of places) {
          expect(
            reworded.some((frame) => frame[place].leaving !== null),
            `${place}: the status did not crossfade - ${states(reworded, place)}`
          ).toBe(true);
          expect(reworded[reworded.length - 1][place].leaving, `${place}: it did not settle`).toBe(null);
        }

        expectLeavingHidden(reworded, places);
      }

      // * "last seen 2 minutes ago" → "last seen 3 minutes ago": only the count
      const counted = await observe(page, peerId, statusUpdate(peerId, {_: 'userStatusOffline', was_online: now() - 180}));
      for(const place of places) {
        expect(
          counted.every((frame) => frame[place].leaving === null),
          `${place}: the count crossfaded - ${states(counted, place)}`
        ).toBe(true);
        expect(counted[counted.length - 1][place].text, `${place}: the status did not change`).not.toBe(counted[0][place].text);
      }
    } finally {
      // * whatever the peer really had
      if(status) await observe(page, peerId, statusUpdate(peerId, status)).catch(() => {});
    }
  });
});
