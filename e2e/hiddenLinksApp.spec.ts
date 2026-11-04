import {expect, Page, test} from '@playwright/test';
import {editMessageLocally, openChat, openChatList} from './chatList.helpers';

/*
 * The links of a sender the client does not know (the settings bar offers to report spam) are not
 * drawn, and neither are the buttons of their messages: a chat with such a sender opens with them
 * gone from its very first frame. Opened from the cache, the chat's bubbles used to be built before
 * the settings reached them, and the links and the link preview showed for a frame or two before
 * they went.
 *
 * A message of the account's own is faked into one with a link, a preview and a bot's button, and
 * its sender into an unknown one - both locally, handed to the update pipeline the way the server's
 * would be, and nothing is sent anywhere; the message and the settings are put back after.
 *
 * It needs a signed-in account, so like the other signed-in specs it runs against an authorized
 * preview, and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/hiddenLinksApp.spec.ts
 */

type Chats = {target: number, other: number, mid: number};
type Frame = {links: number, webpages: number, buttons: number, placeholder: boolean, built: boolean};

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

/** what draws a link of the message, its preview and its buttons */
const LINKS = '.message a[href]', WEBPAGES = '.webpage', BUTTONS = '.reply-markup-button';

/** a bot's button, as one sent through an inline bot comes with the message */
const REPLY_MARKUP = {
  _: 'replyInlineMarkup',
  rows: [{
    _: 'keyboardInlineButtonRow',
    buttons: [{_: 'keyboardInlineButton', text: 'Claim a gift', type: {_: 'inlineButtonTypeUrl', url: 'https://telegram.org/'}}]
  }]
};

type FakedMessage = {original: any, settings: any, peer: any};

/** gives the message a bot's button, and a link with its preview when given one, as an edit from the server would;
 * returns what puts it all back */
async function fakeButtons(page: Page, {target, mid}: Chats, linkPreview?: Parameters<typeof editMessageLocally>[2]): Promise<FakedMessage> {
  const faked = await page.evaluate(async({target, mid}): Promise<FakedMessage> => {
    const managers = (window as any).rootScope.managers;
    const original = await managers.appMessagesManager.getMessageByPeer(target, mid);
    const settings = await managers.appProfileManager.getPeerSettings(target);
    const peer = await managers.appPeersManager.getOutputPeer(target);
    return {original, settings, peer};
  }, {target, mid});

  await editMessageLocally(page, {...faked.original, reply_markup: REPLY_MARKUP}, linkPreview);
  return faked;
}

/** gives the message a link, its preview and a bot's button */
function fakeLinkPreview(page: Page, chats: Chats) {
  return fakeButtons(page, chats, {
    url: 'https://telegram.org/',
    webpage: {
      display_url: 'telegram.org',
      type: 'article',
      site_name: 'Telegram',
      title: 'Telegram',
      description: 'A link from someone unknown'
    }
  });
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
  await editMessageLocally(page, original).catch(() => {});
  await setPeerSettings(page, peer, settings).catch(() => {});
}

/** the links, the previews and the buttons the message's bubble in the open chat draws */
function readBubble(page: Page, {target, mid}: Chats) {
  return page.evaluate(({target, mid, LINKS, WEBPAGES, BUTTONS}) => {
    const chat = (window as any).appImManager.chat;
    const bubble = chat?.peerId === target && chat.bubbles.chatInner.querySelector(`.bubble[data-mid="${mid}"]`);
    return bubble && {
      links: bubble.querySelectorAll(LINKS).length,
      webpages: bubble.querySelectorAll(WEBPAGES).length,
      buttons: bubble.querySelectorAll(BUTTONS).length
    };
  }, {target, mid, LINKS, WEBPAGES, BUTTONS});
}

/** the button the pinned plate of the open chat offers, one going away left out */
function readPinnedButton(page: Page, {target}: Chats) {
  return page.evaluate(({target}) => {
    const chat = (window as any).appImManager.chat;
    const plate: HTMLElement = chat?.peerId === target && chat.topbar.pinnedMessage?.container;
    return plate ? plate.querySelectorAll('.pinned-message-action-button:not(.is-leaving)').length : undefined;
  }, {target});
}

/** opens the chat, and reports its message on every frame from the one it is first drawn on */
function observeOpening(page: Page, {target, mid}: Chats, previousInner: string) {
  return page.evaluate(({target, mid, previousInner, LINKS, WEBPAGES, BUTTONS}) => new Promise<Frame[]>((resolve) => {
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
        buttons: bubble.querySelectorAll(BUTTONS).length,
        placeholder: !!inner.querySelector('.unknown-user-bubble'),
        built: inner !== w[previousInner]
      });

      if(frames.length >= 30 || performance.now() - startedAt > 10_000) resolve(frames);
      else requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
    w.appImManager.setInnerPeer({peerId: target});
  }), {target, mid, previousInner, LINKS, WEBPAGES, BUTTONS});
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
      expect(frames.every((frame) => !frame.links && !frame.webpages && !frame.buttons), `a link, its preview or a button was drawn - ${states}`).toBe(true);
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
      await expect.poll(() => readBubble(page, chats), {message: 'a link, its preview or a button stayed'}).toEqual({links: 0, webpages: 0, buttons: 0});
      // * and back, as edited: the bubble drawn again is the message as it is now, not as it was grouped
      await setPeerSettings(page, faked.peer, {_: 'peerSettings', pFlags: {}});
      await expect.poll(async() => (await readBubble(page, chats))?.webpages, {message: 'the preview did not come back'}).toBe(1);
      expect((await readBubble(page, chats))?.buttons, 'the button did not come back').toBe(1);
    } finally {
      await putBack(page, faked);
    }
  });

  // * a message with no preview: its text is the bubble's Solid body, which takes the change where it stands - the
  // * buttons are the bubble's own, and it is drawn again for them
  test('a button goes once the sender turns out unknown, and comes back once they are known', async({page}) => {
    const faked = await fakeButtons(page, chats);

    try {
      await expect.poll(async() => (await readBubble(page, chats))?.buttons, {message: 'the edit was not drawn'}).toBe(1);
      await markUnknown(page, faked);
      await expect.poll(async() => (await readBubble(page, chats))?.buttons, {message: 'the button stayed'}).toBe(0);
      await setPeerSettings(page, faked.peer, {_: 'peerSettings', pFlags: {}});
      await expect.poll(async() => (await readBubble(page, chats))?.buttons, {message: 'the button did not come back'}).toBe(1);
    } finally {
      await putBack(page, faked);
    }
  });

  // * the plate is made to show the message by hand (as a discussion's shows its thread's start): a pin made here
  // * would be fetched again from the server, which knows nothing of it
  test('the pinned plate offers no button of a sender who turns out unknown', async({page}) => {
    const faked = await fakeButtons(page, chats);

    try {
      await expect.poll(async() => (await readBubble(page, chats))?.buttons, {message: 'the edit was not drawn'}).toBe(1);
      await page.evaluate(({mid}) => (window as any).appImManager.chat.topbar.pinnedMessage.setStaticMessage(mid), chats);
      await expect.poll(() => readPinnedButton(page, chats), {message: 'the plate offered no button'}).toBe(1);
      // * the button held back fades out, and takes no key from the moment it starts to (a button of the chat's own pin
      // * may still be fading out from before)
      await page.evaluate((text) => {
        const w = window as any;
        const plate: HTMLElement = w.appImManager.chat.topbar.pinnedMessage.container;
        const leaving: boolean[] = w.__pinnedLeaving = [];
        w.__pinnedObserver = new MutationObserver(() => {
          plate.querySelectorAll<HTMLElement>('.pinned-message-action-button.is-leaving').forEach((button) => {
            if(button.textContent === text) leaving.push(button.inert);
          });
        });
        w.__pinnedObserver.observe(plate, {subtree: true, attributes: true, attributeFilter: ['class', 'inert']});
      }, REPLY_MARKUP.rows[0].buttons[0].text);
      await markUnknown(page, faked);
      await expect.poll(() => readPinnedButton(page, chats), {message: 'the plate kept the button'}).toBe(0);
      const leaving: boolean[] = await page.evaluate(() => (window as any).__pinnedLeaving);
      expect(leaving.length, 'the button did not fade out').toBeGreaterThan(0);
      expect(leaving.every(Boolean), 'the button took keys while it faded out').toBe(true);
      await setPeerSettings(page, faked.peer, {_: 'peerSettings', pFlags: {}});
      await expect.poll(() => readPinnedButton(page, chats), {message: 'the button did not come back'}).toBe(1);
      // * a plate drawn once its chat has gone on to another peer (the chat's policy is that peer's) knows nothing of
      // * the sender: it offers no button till it is replaced
      await page.evaluate(({mid}) => {
        const chat = (window as any).appImManager.chat;
        chat.bubbles.hidesMessageLinks = (): undefined => undefined;
        chat.topbar.pinnedMessage.setStaticMessage(mid);
      }, chats);
      await expect.poll(() => readPinnedButton(page, chats), {message: 'a plate of a peer gone offered the button'}).toBe(0);
    } finally {
      await page.evaluate(() => {
        const w = window as any;
        delete w.appImManager.chat?.bubbles.hidesMessageLinks;
        w.__pinnedObserver?.disconnect();
        delete w.__pinnedObserver;
        delete w.__pinnedLeaving;
      }).catch(() => {});
      await putBack(page, faked);
      // * the plate goes back to the chat's own pins
      await openChat(page, chats.other).catch(() => {});
    }
  });
});
