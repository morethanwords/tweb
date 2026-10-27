import {expect, Page, test} from '@playwright/test';
import {findMessage, openMessage} from './chatMedia.helpers';

/*
 * The media viewer paging through a chat's photos. Its header - who sent the media, and "3 of 15 • the
 * date" under it: the place of the photo opened comes from the server after the date; every other one
 * is counted from it, so paging asks the server nothing and the place never drops out. Neither its
 * coming nor a step may move the title or change the line's height, and every place shown is the
 * server's. And a step pressed before the one before has ended leaves no media behind.
 *
 * It needs a signed-in account with a chat of three photos or more, so like the other signed-in specs
 * it runs against an authorized preview and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:viewer:app
 */

const VIEWER = '.media-viewer-whole.active';

type HeaderFrame = {titleTop: number, dateHeight: number, mid: number, place?: string};

declare global {
  interface Window {
    headerFrames?: HeaderFrame[],
    positionRequests?: number[],
    movedAside?: HTMLElement,
    appMediaViewer?: any
  }
}

test.describe('the media viewer', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 800}});

  test('counts its place without asking, and keeps its header still', async({page}) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
    const found = await findMessage(page, 'photo', {photos: 3});
    test.skip(!found, 'no chat with three photos in the recent chats of this account');
    const photo = await openMessage(page, found);

    await recordHeader(page);
    await page.mouse.click(photo.x, photo.y);
    await expect(page.locator(`${VIEWER} .media-viewer-date-extra`)).toBeVisible({timeout: 30_000});
    await page.waitForTimeout(1000);

    // * from here on, the places the viewer asks the server for
    await page.evaluate(() => {
      const loader = window.appMediaViewer.listLoader;
      const managers = loader.managers;
      const requests: number[] = window.positionRequests = [];
      const appMessagesManager = new Proxy(managers.appMessagesManager, {
        get: (target, key) => key !== 'getHistory' ? target[key] : (options: any) => {
          if(options.needRealOffsetIdOffset) requests.push(options.offsetId);
          return target.getHistory(options);
        }
      });
      loader.managers = new Proxy(managers, {
        get: (target, key) => key === 'appMessagesManager' ? appMessagesManager : target[key]
      });
    });

    // * from the newest photo back through older ones, and forward again
    for(const key of ['ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(1000);
    }

    expect(await page.evaluate(() => window.positionRequests), 'places asked of the server while paging').toEqual([]);

    const frames = await page.evaluate(() => {
      const frames = window.headerFrames;
      window.headerFrames = undefined;
      return frames;
    });
    const places = new Map(frames.filter(({place}) => place).map(({mid, place}) => [mid, place]));
    expect(places.size, `the viewer paged through three photos: ${[...places.values()].join(', ')}`).toBeGreaterThanOrEqual(3);

    const tops = [...new Set(frames.map(({titleTop}) => titleTop))];
    expect(tops, 'the title moved').toHaveLength(1);
    const heights = [...new Set(frames.map(({dateHeight}) => dateHeight))];
    expect(heights, 'the date line changed its height').toHaveLength(1);

    const firstPlace = frames.findIndex(({place}) => place);
    const without = frames.slice(firstPlace).filter(({place}) => !place).length;
    expect(without, 'frames whose date line lost the place after it had one').toBe(0);

    // * what the server says each one's place is: the result itself, counted from the newest
    const serverPlaces = await page.evaluate(async(mids) => {
      const {searchContext, reverse} = window.appMediaViewer.listLoader;
      const managers = (window as any).appImManager.managers;
      return Promise.all(mids.map(async(mid) => {
        const {count, offsetIdOffset} = await managers.appMessagesManager.getHistory({
          ...searchContext,
          offsetId: mid,
          limit: 1,
          backLimit: 1,
          needRealOffsetIdOffset: true
        });
        return [reverse ? count - offsetIdOffset + 1 : offsetIdOffset, count].join(' of ');
      }));
    }, [...places.keys()]);
    const shown = [...places.values()].map((place) => place.match(/\d+/g).join(' of '));
    expect(shown, 'the places shown are the server\'s').toEqual(serverPlaces);
  });

  // * a step pressed while the one before is still moving its media in moves that one aside on its way:
  // * it has to go like any other, not stay at the edge of the screen
  test('leaves nothing behind when paged on before a step has ended', async({page}) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
    const found = await findMessage(page, 'photo', {photos: 3});
    test.skip(!found, 'no chat with three photos in the recent chats of this account');
    const photo = await openMessage(page, found);
    await page.mouse.click(photo.x, photo.y);
    await expect(page.locator(`${VIEWER} .media-viewer-mover.center`)).toHaveCount(1);
    await page.waitForTimeout(1000);
    const opened = await page.evaluate(() => window.appMediaViewer.target.mid);

    await page.keyboard.press('ArrowLeft');
    // * the next step once the viewer takes one and the media of this one is visibly on its way in: that
    // * transition is the one the step cuts short. Pressed from the page, the moment it is seen
    await page.evaluate(async() => {
      const viewer = window.appMediaViewer;
      let start: number;
      for(let i = 0; i < 300; ++i) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const {content, setMoverPromise} = viewer;
        if(setMoverPromise || !content.mover.classList.contains('opening')) continue;
        const left = content.mover.getBoundingClientRect().left;
        start ??= left;
        if(Math.abs(left - start) > 20) break;
      }

      const movedAside = window.movedAside = viewer.content.mover;
      // * the transition cut short is cancelled, and that cancel can come after the mover is sent
      // * aside, before its own transition runs - Chrome sends it only at times (it did in a channel
      // * whose items change the layout): sent here as it sends it, so the test does not hang on it
      const property = getComputedStyle(movedAside).transitionProperty.split(',')[0].trim();
      const observer = new MutationObserver(() => {
        if(viewer.content.mover === movedAside) return;
        observer.disconnect();
        movedAside.dispatchEvent(new TransitionEvent('transitioncancel', {propertyName: property}));
      });
      observer.observe(movedAside, {attributes: true});
      document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true}));
    });

    // * the one moved aside on its way in goes on moving out, rather than vanishing where it was
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => {
      const rect = window.movedAside.getBoundingClientRect();
      return window.movedAside.isConnected && rect.right > 0 && rect.left < innerWidth;
    }), 'the media moved aside is still moving out').toBe(true);

    await expect.poll(() => page.evaluate((viewer) => {
      return [...document.querySelectorAll<HTMLElement>(`${viewer} .media-viewer-mover`)]
      .filter((mover) => getComputedStyle(mover).visibility !== 'hidden')
      .map((mover) => mover.className);
    }, VIEWER), {message: 'the movers on screen once paging has settled', timeout: 5000}).toEqual([expect.stringContaining('center')]);
    // * both steps taken: the photo opened is the second one ahead
    expect(await page.evaluate(() => window.appMediaViewer.listLoader.next[1]?.mid)).toBe(opened);
  });

  // * right to left the viewer pages in reading order: the step ArrowLeft takes left to right is
  // * ArrowRight's, and the button back stands on the right, the one forward on the left
  test('pages in reading order right to left', async({page}) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/?noSharedWorker=1&rtl=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    const found = await findMessage(page, 'photo', {photos: 3});
    test.skip(!found, 'no chat with three photos in the recent chats of this account');
    const photo = await openMessage(page, found);
    await page.mouse.click(photo.x, photo.y);
    await expect(page.locator(`${VIEWER} .media-viewer-mover.center`)).toHaveCount(1);
    await page.waitForTimeout(1000);
    const opened = await page.evaluate(() => window.appMediaViewer.target.mid);

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(() => window.appMediaViewer.listLoader.next[0]?.mid), {
      message: 'ArrowRight stepped back from the photo opened'
    }).toBe(opened);
    await page.waitForTimeout(1000);

    const middle = page.viewportSize().width / 2;
    const previous = await page.locator(`${VIEWER} .media-viewer-switcher-prev`).boundingBox();
    const next = await page.locator(`${VIEWER} .media-viewer-switcher-next`).boundingBox();
    expect(previous.x, 'the button back stands on the right').toBeGreaterThanOrEqual(middle);
    expect(next.x + next.width, 'the button forward stands on the left').toBeLessThanOrEqual(middle);
  });

  // * The URL of a picture can be gone by the time the viewer shows it: revoked, or its cache entry
  // * evicted. Such a picture loads nothing - it must not replace the thumbnail with an empty box, but be
  // * asked for anew. The worker is made to hand out a dead URL for one photo, every size of it, until
  // * the viewer drops that photo's cache entry.
  test('asks anew for a picture whose URL is gone, rather than showing nothing', async({page}) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
    const found = await findMessage(page, 'photo', {photos: 2});
    test.skip(!found, 'no chat with two photos in the recent chats of this account');
    const photo = await openMessage(page, found);
    await page.mouse.click(photo.x, photo.y);
    await expect(page.locator(`${VIEWER} .media-viewer-mover.center`)).toHaveCount(1);
    await page.waitForTimeout(1000);

    const key = await page.evaluate(() => {
      const {listLoader, managers} = window.appMediaViewer;
      const proxy = (window as any).apiManagerProxy;
      const isPhoto = (item: {peerId: PeerId, mid: number}) => item && proxy.getMessageByPeer(item.peerId, item.mid)?.media?._ === 'messageMediaPhoto';
      const previous = listLoader.previous[listLoader.previous.length - 1];
      const target = isPhoto(previous) ? previous : isPhoto(listLoader.next[0]) ? listLoader.next[0] : undefined;
      if(!target) return;

      const photoId = proxy.getMessageByPeer(target.peerId, target.mid).media.photo.id;
      const dead = URL.createObjectURL(new Blob(['x'], {type: 'image/jpeg'}));
      URL.revokeObjectURL(dead);
      // * a size gets its real URL back once the viewer drops its cache entry
      const dropped = new Set<string>();
      const served = (window as any).deadServed = [] as string[];
      (window as any).deadDropped = dropped;
      const isDead = (media: {id?: unknown}, type?: string) => {
        const dead = media?.id === photoId && !dropped.has(type ?? 'full');
        if(dead) served.push(type ?? 'full');
        return dead;
      };
      const thumbsStorage = managers.thumbsStorage, apiFileManager = managers.apiFileManager;
      managers.thumbsStorage = new Proxy(thumbsStorage, {
        get: (object, key) => key === 'getCacheContext' ? async(media: any, type?: string) => {
          const context = await object.getCacheContext(media, type);
          return isDead(media, type) ? {...context, url: dead, downloaded: context.downloaded || 1} : context;
        } : key === 'deleteCacheContext' ? (media: any, type?: string) => {
          if(media?.id === photoId) dropped.add(type ?? 'full');
          return object.deleteCacheContext(media, type);
        } : object[key]
      });
      managers.apiFileManager = new Proxy(apiFileManager, {
        get: (object, key) => key === 'downloadMediaURL' ? async(options: any) => {
          const url = await object.downloadMediaURL(options);
          return isDead(options.media, options.thumb?.type) ? dead : url;
        } : object[key]
      });
      (window as any).restoreManagers = () => {
        managers.thumbsStorage = thumbsStorage;
        managers.apiFileManager = apiFileManager;
      };
      return target === previous ? 'ArrowLeft' : 'ArrowRight';
    });
    test.skip(!key, 'neither neighbour of the photo opened is a photo');

    await page.keyboard.press(key);
    // * right after the step the thumbnail copied from the chat is there, and drawn: what counts is what
    // * is left once the picture has come
    await page.waitForTimeout(5000);
    const state = await page.evaluate((viewer) => {
      (window as any).restoreManagers();
      return {
        served: (window as any).deadServed.length,
        dropped: [...(window as any).deadDropped],
        images: [...document.querySelectorAll<HTMLImageElement>(`${viewer} .media-viewer-mover.center img`)]
        .map((image) => image.complete && image.naturalWidth > 0)
      };
    }, VIEWER);
    expect(state.served, 'a dead URL was handed out').toBeGreaterThan(0);
    expect(state.images, 'the picture on screen is drawn').toEqual([true]);
    expect(state.dropped.length, 'the viewer dropped the cache entry behind it').toBeGreaterThan(0);
  });

  // * A video's box is sized from the document itself, so the size the viewer picks for it is the video
  // * file. Once that file sits downloaded in a blob (a video that is not streamed), the picture shown
  // * until the video plays must still be a thumbnail - an <img> of the file is a broken image. Opened
  // * with nothing in the chat to grow out of, as a video paged to is.
  test('stands a video\'s thumbnail in for it, not the video file', async({page}) => {
    test.setTimeout(4 * 60_000);
    await page.goto('/?noSharedWorker=1');
    await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
    const opened = await page.evaluate(async(viewer) => {
      const managers = (window as any).appImManager.managers;
      const {dialogs} = await managers.dialogsStorage.getDialogs({filterId: 0, limit: 30});
      let message: any;
      for(const {peerId} of dialogs) {
        const result = await managers.appMessagesManager.getHistory({peerId, inputFilter: {_: 'inputMessagesFilterVideo'}, limit: 10}).catch((): undefined => undefined);
        for(const mid of result?.history || []) {
          const candidate = await managers.appMessagesManager.getMessageByPeer(peerId, mid);
          const doc = candidate?.media?.document;
          // * small enough to download whole here, with a thumbnail to stand in for it
          if(doc?.type === 'video' && doc.size < 5e6 && doc.thumbs?.some((thumb: any) => thumb._ === 'photoSize') && !candidate.media.pFlags.spoiler) {
            message = candidate;
            break;
          }
        }
        if(message) break;
      }
      if(!message) return;

      const doc = message.media.document;
      const blob = await managers.apiFileManager.downloadMedia({media: doc});
      const {url} = await managers.thumbsStorage.setCacheContextBlob(doc, '', blob, blob.size);
      const path = '/src/components/mediaViewer/index.ts';
      const {default: AppMediaViewer} = await import(/* @vite-ignore */ path);
      new AppMediaViewer()
      .setSearchContext({peerId: message.peerId, inputFilter: {_: 'inputMessagesFilterVideo'}, useSearch: false})
      .openMedia({message});

      // * every picture the slide shows while it opens
      const seen = new Set<string>();
      for(let i = 0; i < 30; ++i) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        for(const element of document.querySelectorAll<HTMLElement>(`${viewer} .media-viewer-mover img, ${viewer} .media-viewer-mover canvas`)) {
          if(element instanceof HTMLCanvasElement) {
            if(element.width) seen.add('a picture');
          } else if((element as HTMLImageElement).complete) {
            const image = element as HTMLImageElement;
            seen.add(image.src === url ? 'the video file' : image.naturalWidth ? 'a picture' : 'a broken image');
          }
        }
      }
      return [...seen];
    }, VIEWER);
    test.skip(!opened, 'no small video with a thumbnail in the recent chats of this account');
    expect(opened, 'what the slide shows until the video plays').toEqual(['a picture']);
  });
});

// * from now on, every frame the header differs from the one before: where the title is, how tall the
// * date line is, the item and the place it shows - read back from window.headerFrames, which also stops it
async function recordHeader(page: Page) {
  await page.evaluate((viewer) => {
    const frames: HeaderFrame[] = window.headerFrames = [];
    let last: string;
    const sample = () => {
      if(window.headerFrames !== frames) return;
      const whole = document.querySelector(viewer);
      const title = whole?.querySelector('.media-viewer-name');
      const date = whole?.querySelector('.media-viewer-date');
      if(title && date) {
        const frame: HeaderFrame = {
          titleTop: +title.getBoundingClientRect().top.toFixed(2),
          dateHeight: +date.getBoundingClientRect().height.toFixed(2),
          mid: window.appMediaViewer?.target?.mid,
          place: date.querySelector('.media-viewer-date-extra')?.textContent || undefined
        };
        const json = JSON.stringify(frame);
        if(json !== last) frames.push(frame);
        last = json;
      }

      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, VIEWER);
}
