import {expect, Page, test} from '@playwright/test';
import {openChatList} from './chatList.helpers';

/*
 * The links of a sender the client does not know (the settings bar offers to report spam) are not
 * drawn: a chat with such a sender opens with them plain from its very first frame. Opened from the
 * cache, the chat's bubbles used to be built before the settings reached them, and the links and the
 * link preview showed for a frame or two before they went.
 *
 * A message of the account's own is faked into one with a link and a preview, and its sender into an
 * unknown one - both locally, handed to the update pipeline the way the server's would be, and
 * nothing is sent anywhere; the message and the settings are put back after.
 *
 * It needs a signed-in account, so like the other signed-in specs it runs against an authorized
 * preview, and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/hiddenLinksApp.spec.ts
 */

type Chats = {target: number, other: number, mid: number};
type Frame = {links: number, webpages: number, placeholder: boolean, built: boolean};

/** two chats with users that have nothing unread (opening them reads nothing), the first with a message from its user */
async function findChats(page: Page): Promise<Chats> {
  return page.evaluate(async() => {
    const w = window as any;
    const managers = w.rootScope.managers;
    const {dialogs} = await managers.dialogsStorage.getDialogs({offsetIndex: 0, limit: 100, filterId: 0});
    let target: number, mid: number, other: number;
    for(const item of dialogs) {
      const dialog = item.dialog || item;
      const peerId = dialog.peerId;
      const user = peerId > 0 && w.apiManagerProxy.getUser(peerId);
      if(!user || user.pFlags.bot || user.pFlags.self || user.pFlags.support || dialog.unread_count || dialog.pFlags.unread_mark) {
        continue;
      }

      if(!target) {
        const {history} = await managers.appMessagesManager.getHistory({peerId, limit: 20, offsetId: 0});
        for(const _mid of history) {
          const message = await managers.appMessagesManager.getMessageByPeer(peerId, _mid);
          if(message?._ === 'message' && !message.pFlags.out && !message.grouped_id) {
            target = peerId;
            mid = _mid;
            break;
          }
        }

        if(target) continue;
      }

      other ??= peerId;
      if(target && other) break;
    }

    return target && other ? {target, other, mid} : undefined;
  });
}

/** opens the chat and waits for it to be on screen */
async function openChat(page: Page, peerId: number) {
  await page.evaluate((peerId) => (window as any).appImManager.setInnerPeer({peerId}), peerId);
  await page.waitForFunction((peerId) => {
    const chat = (window as any).appImManager.chat;
    return chat?.peerId === peerId && chat.bubbles.chatInner.isConnected && !chat.setPeerPromise;
  }, peerId);
}

/** what draws a link of the message, and its preview */
const LINKS = '.message a[href]', WEBPAGES = '.webpage';

type FakedMessage = {original: any, settings: any, peer: any};

/** gives the message a link and its preview, as an edit from the server would; returns what puts it all back */
function fakeLinkPreview(page: Page, {target, mid}: Chats) {
  return page.evaluate(async({target, mid}): Promise<FakedMessage> => {
    const managers = (window as any).rootScope.managers;
    const original = await managers.appMessagesManager.getMessageByPeer(target, mid);
    const settings = await managers.appProfileManager.getPeerSettings(target);
    const peer = await managers.appPeersManager.getOutputPeer(target);
    const url = 'https://telegram.org/';
    await managers.apiUpdatesManager.processLocalUpdate({
      _: 'updateEditMessage',
      message: {
        ...original,
        message: url,
        entities: [{_: 'messageEntityUrl', offset: 0, length: url.length}],
        media: {
          _: 'messageMediaWebPage',
          pFlags: {},
          webpage: {
            _: 'webPage',
            pFlags: {},
            id: '' + Date.now(),
            url,
            display_url: 'telegram.org',
            hash: 0,
            type: 'article',
            site_name: 'Telegram',
            title: 'Telegram',
            description: 'A link from someone unknown'
          }
        }
      },
      pts: 0,
      pts_count: 0
    });

    return {original, settings, peer};
  }, {target, mid});
}

function setPeerSettings(page: Page, peer: any, settings: any) {
  return page.evaluate(({peer, settings}) => {
    return (window as any).rootScope.managers.apiUpdatesManager.processLocalUpdate({_: 'updatePeerSettings', peer, settings});
  }, {peer, settings});
}

/** the sender turns out to be someone the client does not know: the settings bar offers to report spam */
function markUnknown(page: Page, {peer}: FakedMessage) {
  return setPeerSettings(page, peer, {
    _: 'peerSettings',
    pFlags: {report_spam: true, add_contact: true, block_contact: true},
    phone_country: 'NL',
    registration_month: '01.2024'
  });
}

async function putBack(page: Page, {original, settings, peer}: FakedMessage) {
  await page.evaluate((original) => {
    return (window as any).rootScope.managers.apiUpdatesManager.processLocalUpdate({_: 'updateEditMessage', message: original, pts: 0, pts_count: 0});
  }, original).catch(() => {});
  await setPeerSettings(page, peer, settings).catch(() => {});
}

/** the links and the previews the message's bubble in the open chat draws */
function readBubble(page: Page, {target, mid}: Chats) {
  return page.evaluate(({target, mid, LINKS, WEBPAGES}) => {
    const chat = (window as any).appImManager.chat;
    const bubble = chat?.peerId === target && chat.bubbles.chatInner.querySelector(`.bubble[data-mid="${mid}"]`);
    return bubble && {links: bubble.querySelectorAll(LINKS).length, webpages: bubble.querySelectorAll(WEBPAGES).length};
  }, {target, mid, LINKS, WEBPAGES});
}

/** opens the chat, and reports its message on every frame from the one it is first drawn on */
function observeOpening(page: Page, {target, mid}: Chats, previousInner: string) {
  return page.evaluate(({target, mid, previousInner, LINKS, WEBPAGES}) => new Promise<Frame[]>((resolve) => {
    const w = window as any;
    const frames: Frame[] = [];
    const startedAt = performance.now();
    const sample = () => {
      const chat = w.appImManager.chat;
      const inner: HTMLElement = chat?.peerId === target && chat.bubbles.chatInner;
      const bubble = inner?.isConnected && inner.querySelector(`.bubble[data-mid="${mid}"]`);
      if(bubble) frames.push({
        links: bubble.querySelectorAll(LINKS).length,
        webpages: bubble.querySelectorAll(WEBPAGES).length,
        placeholder: !!inner.querySelector('.unknown-user-bubble'),
        built: inner !== w[previousInner]
      });

      if(frames.length >= 30 || performance.now() - startedAt > 10_000) resolve(frames);
      else requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
    w.appImManager.setInnerPeer({peerId: target});
  }), {target, mid, previousInner, LINKS, WEBPAGES});
}

test.describe('links of an unknown sender', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  let chats: Chats;
  test.beforeEach(async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page);
    chats = await findChats(page);
    test.skip(!chats, 'no two chats with users with nothing unread, one with a message from its user');

    // * the chat's history is in the cache once it has been open - and what comes from the server for it
    // * then would take the place of the message faked before. The chat a step back is gone back to as it
    // * is (`samePeer`), so the target is opened after the other one, and left by going back to that
    await openChat(page, chats.other);
    await openChat(page, chats.target);
    await page.waitForTimeout(1000);
  });

  test('are plain from the first frame of a chat opened from the cache', async({page}) => {
    await page.evaluate(() => (window as any).__hiddenLinksInner = (window as any).appImManager.chat.bubbles.chatInner);
    const faked = await fakeLinkPreview(page, chats);
    await markUnknown(page, faked);

    try {
      await openChat(page, chats.other);
      await page.waitForTimeout(1000);

      const frames = await observeOpening(page, chats, '__hiddenLinksInner');
      const states = JSON.stringify(frames.slice(0, 5));
      expect(frames.length, 'the message was not drawn').toBeGreaterThan(0);
      expect(frames.every((frame) => frame.built), 'the chat was not built again, but shown as it was left').toBe(true);
      expect(frames.every((frame) => !frame.links && !frame.webpages), `a link or its preview was drawn - ${states}`).toBe(true);
      // * the bubble that tells who the sender is comes with the messages, not after them (a longer history
      // * than the first screen has none: it goes on top of the whole history)
      const placeholder = frames[frames.length - 1].placeholder;
      expect(frames.every((frame) => frame.placeholder === placeholder), `the sender's bubble came late - ${states}`).toBe(true);
    } finally {
      await page.evaluate(() => delete (window as any).__hiddenLinksInner);
      await putBack(page, faked);
    }
  });

  test('go with the preview an edit gave the message once the sender turns out unknown', async({page}) => {
    const faked = await fakeLinkPreview(page, chats);

    try {
      await expect.poll(async() => (await readBubble(page, chats))?.webpages, {message: 'the edit was not drawn'}).toBe(1);
      await markUnknown(page, faked);
      await expect.poll(() => readBubble(page, chats), {message: 'a link or its preview stayed'}).toEqual({links: 0, webpages: 0});
      // * and back, as edited: the bubble drawn again is the message as it is now, not as it was grouped
      await setPeerSettings(page, faked.peer, {_: 'peerSettings', pFlags: {}});
      await expect.poll(async() => (await readBubble(page, chats))?.webpages, {message: 'the preview did not come back'}).toBe(1);
    } finally {
      await putBack(page, faked);
    }
  });
});
