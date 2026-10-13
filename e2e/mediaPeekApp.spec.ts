import {expect, Page, test} from '@playwright/test';
import {findMessage, openMessage, PAGE_MEDIA, Point} from './chatMedia.helpers';

/*
 * Holding the mouse button on a photo or video peeks at it (`components/mediaPeek`): in a chat, in a
 * rich message's page and in the shared media of a profile it opens big over a dimmed page, dragging
 * onto another one switches to it, releasing closes it without opening the media viewer, and an
 * ordinary click still opens the viewer.
 *
 * It needs a signed-in account with photos in its recent chats, so like the other signed-in specs it
 * runs against an authorized preview and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:peek:app
 */

const PEEK = 'div[aria-hidden="true"][class*="_MediaPeek_"]';
const PEEK_ITEM = '[class*="_MediaPeekItem_"]';
const VIEWER = '.media-viewer-whole.active';

test.describe('the media peek', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  // * a desktop-sized window: the right column floats beside the chat only there
  test.use({viewport: {width: 1280, height: 800}});

  // * looked up once: `null` when the account has no photo to peek at
  let found: {peerId: number, mid: number} | null;

  test.beforeEach(async({page}) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
    if(found === undefined) found = await findMessage(page, 'photo') ?? null;
    test.skip(!found, 'no photo in the recent chats of this account');
  });

  test('opens on a held photo in a chat, and a click still opens the viewer', async({page}) => {
    const photo = await openMessage(page, found);
    // * the chat draws the photo itself, not its blurred thumbnail yet, before anything is held on it
    await page.waitForFunction(({x, y}) => {
      const image = document.elementFromPoint(x, y)?.closest('.attachment, .album-item')?.querySelector<HTMLImageElement>('img.media-photo');
      return !!image?.complete && image.naturalWidth > 0;
    }, photo, {timeout: 60_000});
    const thumbnail = await page.evaluate(({x, y}) => {
      const rect = document.elementFromPoint(x, y).closest('.attachment, .album-item').getBoundingClientRect();
      return {width: rect.width, height: rect.height};
    }, photo);

    // * leaving it before the peek opens is a drag, not a peek
    await page.mouse.move(photo.x, photo.y);
    await page.mouse.down();
    await page.mouse.move(photo.x + 600, photo.y, {steps: 4});
    await page.waitForTimeout(600);
    await expect(page.locator(PEEK)).toHaveCount(0);
    await page.mouse.up();

    // * the cache letting the downloaded sizes go (the chat still draws them) leaves the peek its
    // * stripped thumbnail; it starts from what the chat shows instead
    await page.evaluate(() => (window as any).apiManagerProxy.mirrors.thumbs = {});
    await page.mouse.move(photo.x, photo.y);
    await page.mouse.down();
    await expect(page.locator(PEEK)).toHaveClass(/_visible_/);
    await expect(page.locator(PEEK_ITEM)).toHaveCount(1);
    const startedFrom = await page.locator(PEEK_ITEM).evaluate((item) => {
      const first = item.querySelector('[class*="_MediaPeekMedia_"] > img, [class*="_MediaPeekMedia_"] > canvas') as HTMLImageElement | HTMLCanvasElement;
      return {
        width: first instanceof HTMLImageElement ? first.naturalWidth : first?.width,
        // * what it was, should it be the wrong one
        element: first && `${first.tagName}.${first.className} ${(first as HTMLImageElement).src || ''}`
      };
    });
    expect(startedFrom.width, `the peek starts from a blurred thumbnail, not from the picture the chat shows: ${startedFrom.element}`).toBeGreaterThan(thumbnail.width / 2);
    await page.waitForTimeout(400);
    const peeked = await page.locator(PEEK_ITEM).boundingBox();
    expect(peeked.width * peeked.height, 'the peek is not bigger than the photo it shows').toBeGreaterThan(thumbnail.width * thumbnail.height);
    await page.mouse.up();
    await expect(page.locator(PEEK)).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page.locator(VIEWER), 'releasing the peek opened the viewer as well').toHaveCount(0);

    await page.mouse.click(photo.x, photo.y);
    await expect(page.locator(VIEWER)).toHaveCount(1);
    await expect(page.locator(PEEK)).toHaveCount(0);
    // * the viewer takes Escape once it has finished opening
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await expect(page.locator(VIEWER)).toHaveCount(0);
  });

  test('opens on the media of a rich message', async({page}) => {
    const rich = await findMessage(page, 'rich');
    test.skip(!rich, 'no rich message with a photo or video in the recent chats of this account');

    const media = await openMessage(page, rich, PAGE_MEDIA);
    await page.mouse.move(media.x, media.y);
    await page.mouse.down();
    await expect(page.locator(PEEK)).toHaveClass(/_visible_/);
    await page.waitForTimeout(400);
    await page.mouse.up();
    await expect(page.locator(PEEK)).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page.locator(VIEWER), 'releasing the peek opened the viewer as well').toHaveCount(0);
  });

  test('switches between the tiles of shared media', async({page}) => {
    await openMessage(page, found);
    await page.locator('#column-center .chat-info').first().click();
    await page.waitForFunction(() => !!(window as any).appSidebarRight?.sharedMediaTab?.searchSuper, null, {timeout: 30_000});
    await page.evaluate(() => {
      const searchSuper = (window as any).appSidebarRight.sharedMediaTab.searchSuper;
      searchSuper.selectTab(searchSuper.mediaTabs.findIndex((tab: any) => tab.type === 'media'));
    });
    // * the media tab's own tiles: a profile's stories are grid items too
    await expect.poll(() => getMediaTiles(page), {timeout: 60_000}).not.toHaveLength(0);
    await page.waitForTimeout(2000);
    const tiles = await getMediaTiles(page);
    test.skip(tiles.length < 2, 'fewer than two photos or videos in shared media');

    const [first, second] = tiles;
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await expect(page.locator(PEEK)).toHaveClass(/_visible_/);
    await page.waitForTimeout(400);
    const before = await shownMedia(page);

    await page.mouse.move(second.x, second.y, {steps: 4});
    await expect.poll(() => shownMedia(page), {timeout: 10_000}).not.toEqual(before);
    await expect(page.locator(PEEK_ITEM)).toHaveCount(1);

    await page.mouse.up();
    await expect(page.locator(PEEK)).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page.locator(VIEWER), 'releasing the peek opened the viewer as well').toHaveCount(0);
  });
});

// * the first two tiles of the media tab of the open profile, not behind a spoiler
async function getMediaTiles(page: Page): Promise<Point[]> {
  return page.evaluate(() => {
    const itemsTab: HTMLElement = (window as any).appSidebarRight.sharedMediaTab.searchSuper.mediaTabsMap.get('media').itemsTab;
    return Array.from(itemsTab.querySelectorAll<HTMLElement>('.search-super-item.grid-item'))
    .filter((tile) => !tile.querySelector('.media-spoiler-container'))
    .slice(0, 2)
    .map((tile) => {
      const rect = tile.getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    });
  });
}

// * what the item on screen shows: the image or video it is drawing
async function shownMedia(page: Page) {
  return page.evaluate((itemSelector) => {
    const items = Array.from(document.querySelectorAll(itemSelector)).filter((item) => !/_(entering|leaving)_/.test(item.className));
    return items.map((item) => Array.from(item.querySelectorAll('img, video')).map((media) => (media as HTMLImageElement).src).join(' ')).join('|');
  }, PEEK_ITEM);
}
