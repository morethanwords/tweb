import {expect, Page, test} from '@playwright/test';
import {editMessageLocally, openChat, openChatList} from './chatList.helpers';

/*
 * A press on the photo of a link preview that is not downloaded yet (automatic downloads off) is the
 * photo's, as on any photo: it starts the download, and the preview does nothing else with it. On a touch
 * screen, where the chat takes a press on mousedown, the click coming after it used to follow the
 * preview's link as well - out of the app, in this very tab for a preview with an Instant View, which has
 * no target of its own. A click with a mouse is checked to be still the photo's alone.
 *
 * A message of Saved Messages is faked locally into one with a link preview with a photo and an Instant
 * View (an edit handed to the update pipeline, the way the server's would be - nothing is sent), automatic
 * downloads are off for the run, the press is caught on the photo's download button before it downloads
 * anything, and the preview's own action is counted instead of run; the message and the setting are put
 * back after.
 *
 * It needs a signed-in account, so it runs against an authorized preview, and skips without one:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm exec playwright test e2e/webPageMediaPressApp.spec.ts
 */

type Faked = {peerId: number, mid: number, original: any, autoDownloadOff: boolean};

/** a message of Saved Messages to stand in for the preview, and automatic downloads turned off */
async function prepare(page: Page): Promise<Faked> {
  return page.evaluate(async() => {
    const w = window as any;
    const managers = w.rootScope.managers;
    const peerId = w.rootScope.myId;
    const {history} = await managers.appMessagesManager.getHistory({peerId, limit: 20, offsetId: 0});
    let original: any;
    for(const mid of history) {
      const message = await managers.appMessagesManager.getMessageByPeer(peerId, mid);
      if(message?._ === 'message' && !message.grouped_id) {
        original = message;
        break;
      }
    }

    if(!original) return;
    const [appSettings, setAppSettings] = w.useAppSettings();
    const autoDownloadOff = !!appSettings.autoDownloadNew.pFlags.disabled;
    // * before the chat is open: its bubbles take the setting they are drawn with
    await setAppSettings('autoDownloadNew', 'pFlags', 'disabled', true);
    return {peerId, mid: original.mid, original, autoDownloadOff};
  });
}

/**
 * The message becomes a link with a preview of a page with a large photo and an Instant View, as an edit
 * from the server would make it, and its photo waits to be pressed to download
 */
async function fakeLinkPreview(page: Page, {original, mid}: Faked) {
  const url = 'https://telegram.org/';
  const id = '' + Date.now();
  await editMessageLocally(page, original, {
    url,
    webpage: {
      pFlags: {has_large_media: true},
      display_url: 'telegram.org',
      type: 'article',
      site_name: 'Telegram',
      title: 'A page',
      description: 'A page with a photo',
      cached_page: {_: 'page', pFlags: {}, url, blocks: [], photos: [], documents: []},
      photo: {
        _: 'photo',
        pFlags: {},
        id,
        access_hash: '0',
        file_reference: [],
        date: original.date,
        // * the blurred stand-in drawn until the photo is in (its bytes need not make a picture)
        sizes: [
          {_: 'photoStrippedSize', type: 'i', bytes: [1, 25, 40]},
          {_: 'photoSize', type: 'x', w: 800, h: 500, size: 50_000}
        ],
        dc_id: 2
      }
    }
  });

  await page.evaluate((mid) => {
    const bubble = (window as any).appImManager.chat.bubbles.chatInner.querySelector(`.bubble[data-mid="${mid}"]`);
    bubble?.scrollIntoView({block: 'center'});
  }, mid);
  await expect.poll(() => page.evaluate((mid) => {
    const bubble = (window as any).appImManager.chat.bubbles.chatInner.querySelector(`.bubble[data-mid="${mid}"]`);
    return !!bubble?.querySelector('.webpage .webpage-preview .preloader-container.manual');
  }, mid), {message: 'the preview\'s photo did not wait for a press to download', timeout: 15_000}).toBe(true);
  // * the bubble settles where it was scrolled to
  await page.waitForTimeout(500);
}

async function putBack(page: Page, {original, autoDownloadOff}: Faked) {
  await page.evaluate((autoDownloadOff) => {
    (window as any).useAppSettings()[1]('autoDownloadNew', 'pFlags', 'disabled', autoDownloadOff || undefined);
  }, autoDownloadOff).catch(() => {});
  await editMessageLocally(page, original).catch(() => {});
}

/**
 * Where to press: on the preview's photo, off its download button. The button keeps what it is handed
 * (nothing is downloaded), the preview's action (its Instant View) is counted instead of run, and a click
 * that reaches the window unhandled - one the link would follow - is counted and stopped there.
 */
function armPress(page: Page, {mid}: Faked) {
  return page.evaluate((mid) => {
    const w = window as any;
    const bubble = w.appImManager.chat.bubbles.chatInner.querySelector(`.bubble[data-mid="${mid}"]`);
    const media: HTMLElement = bubble.querySelector('.webpage .webpage-preview');
    const button: HTMLElement = media.querySelector('.preloader-container.manual');
    const counts = w.__webPageMediaPress = {button: 0, preview: 0, followed: 0};
    const box: HTMLElement = bubble.querySelector('.webpage');
    const callbacks: WeakMap<HTMLElement, Function> = w.appImManager.chat.bubbles.webPageClickCallbacks;
    if(!callbacks.has(box)) return;
    callbacks.set(box, () => counts.preview++);
    for(const type of ['mousedown', 'click']) {
      button.addEventListener(type, (e) => {
        counts.button++;
        e.preventDefault();
        e.stopImmediatePropagation();
      }, {capture: true});
    }

    window.addEventListener('click', (e) => {
      if(!e.defaultPrevented && (e.target as HTMLElement).closest?.('a[href]')) counts.followed++;
      e.preventDefault();
    }, {once: true});

    const rect = media.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const x = rect.left + 16, y = rect.top + 16;
    const target = document.elementFromPoint(x, y);
    return {
      x,
      y,
      onPhoto: media.contains(target) && !button.contains(target),
      clear: x < buttonRect.left || y < buttonRect.top
    };
  }, mid);
}

/** presses the preview's photo off its download button, and checks the press went to the button alone */
async function pressPhoto(page: Page, faked: Faked, press: (x: number, y: number) => Promise<void>) {
  await fakeLinkPreview(page, faked);
  const at = await armPress(page, faked);
  expect(at, 'the preview has no Instant View to open').toBeTruthy();
  expect(at.onPhoto && at.clear, 'nowhere on the photo to press off its download button').toBe(true);
  await press(at.x, at.y);
  await page.waitForTimeout(500);

  const counts = await page.evaluate(() => (window as any).__webPageMediaPress);
  expect(counts.button, 'the photo\'s download button was not handed the press').toBe(1);
  expect(counts.preview, 'the preview opened its Instant View too').toBe(0);
  expect(counts.followed, 'the click of the press went on to the preview\'s link').toBe(0);
}

test.describe('a link preview\'s photo waiting to be downloaded', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  let faked: Faked;
  test.beforeEach(async({page}) => {
    test.setTimeout(5 * 60_000);
    await openChatList(page);
    faked = await prepare(page);
    test.skip(!faked, 'no message in Saved Messages to stand in for a link preview');
    await openChat(page, faked.peerId);
    await page.waitForTimeout(1000);
  });

  test.afterEach(async({page}) => {
    if(faked) await putBack(page, faked);
  });

  test('takes a click as the photo\'s, and the preview does nothing with it', async({page}) => {
    await pressPhoto(page, faked, (x, y) => page.mouse.click(x, y));
  });

  test.describe('on a touch screen', () => {
    test.use({hasTouch: true});

    test('takes a tap as the photo\'s, and the preview\'s link is not followed', async({page}) => {
      await pressPhoto(page, faked, (x, y) => page.touchscreen.tap(x, y));
    });
  });
});
