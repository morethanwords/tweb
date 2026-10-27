import {expect, Page, test} from '@playwright/test';
import {PNG} from 'pngjs';
import {writeFile} from 'node:fs/promises';
import {openChatList} from './chatList.helpers';
import {countDifferingPixels} from './focusPixels.helpers';

/*
 * What is sent from the composer flies into its message (`components/chat/sendFlights`): a copy of the
 * bubble grows out of the composer over the chat while the message itself stands where it goes, unseen;
 * the copy lands on it, goes, and the message shows where the copy was, drawn on the same pixels - nothing
 * of it stays hidden. The compositor moves the copy: it is laid out once, and no script writes on it while
 * it flies. The older messages make room for it as smoothly. A sticker from the panel is not copied: the
 * message's own flies. At the reduced animation level nothing flies, the message just comes.
 *
 * It sends a few messages to the account's Saved Messages and deletes them at the end. Like the other
 * signed-in specs it runs against an authorized preview, and skips rather than reporting a pass it
 * never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:send:app
 */

type Rect = {left: number, top: number, width: number, height: number};
type Frame = {
  // the copy's background, while it flies
  copy: Rect | null,
  // the message's bubble, and whether it can be seen
  bubble: Rect | null,
  bubbleOpacity: number,
  // the top of the message before it, as the list makes room
  previous: number,
  // what script has written on the copy's elements
  written: string
};

test.describe('a message sent from the composer', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');
  test.use({viewport: {width: 1280, height: 800}});

  const sent: number[] = [];

  test.afterEach(async({page}) => {
    if(!sent.length) return;
    await page.evaluate(async(mids) => {
      const {appImManager, rootScope} = window as any;
      await appImManager.managers.appMessagesManager.deleteMessages(rootScope.myId, mids, true);
    }, sent.splice(0)).catch(() => {});
  });

  async function openSavedMessages(page: Page, query = '') {
    test.setTimeout(4 * 60_000);
    await openChatList(page, {query});
    await page.evaluate(() => {
      const {appImManager, rootScope} = window as any;
      appImManager.setInnerPeer({peerId: rootScope.myId});
    });
    await page.waitForFunction(() => {
      const {appImManager, rootScope} = window as any;
      const chat = appImManager.chat;
      return chat?.peerId === rootScope.myId && chat.bubbles.scrollable.loadedAll.bottom &&
        !!chat.input.messageInput?.isConnected;
    }, null, {timeout: 60_000});
    await page.waitForTimeout(1500);
    // * the account's own draft there would go with what a test types, and be deleted with it
    const draft = await page.evaluate(() => !(window as any).appImManager.chat.input.isInputEmpty());
    test.skip(draft, 'Saved Messages has a draft, which a test would send and delete with its own message');
  }

  /** Types `text` in the composer, and more lines under it if given; returns the composer's box */
  async function type(page: Page, text: string, lines: string[] = []): Promise<Rect> {
    await page.locator('#column-center .input-message-input[contenteditable="true"]').click();
    await page.keyboard.type(text);
    for(const line of lines) {
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type(line);
    }

    return page.evaluate(() => {
      const rect = (window as any).appImManager.chat.input.rowsWrapper.getBoundingClientRect();
      return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
    });
  }

  /**
   * Sends `text` from the composer, and more lines under it if given, and returns every frame from the press
   * until it is all over
   */
  async function send(page: Page, text: string, lines: string[] = []) {
    const field = await type(page, text, lines);
    await page.evaluate((text) => {
      const w = window as any;
      const frames: Frame[] = w.__sendFlightFrames = [];
      const toRect = (element: Element): Rect => {
        if(!element) return null;
        const rect = element.getBoundingClientRect();
        return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
      };
      // * the copy's background is made of pieces: its box is theirs together
      const union = (elements: Element[]): Rect => {
        const rects = elements.map((element) => element.getBoundingClientRect()).filter((rect) => rect.width && rect.height);
        if(!rects.length) return null;
        const left = Math.min(...rects.map((rect) => rect.left)), top = Math.min(...rects.map((rect) => rect.top));
        const right = Math.max(...rects.map((rect) => rect.right)), bottom = Math.max(...rects.map((rect) => rect.bottom));
        return {left, top, width: right - left, height: bottom - top};
      };
      const started = performance.now();
      const previous = Array.from(document.querySelectorAll('#column-center .bubbles-inner .bubble')).pop();
      const record = () => {
        const overlay = document.querySelector('#column-center [class*="_overlay_"]');
        // * the message itself, not its copy over the chat
        const bubble = Array.from(document.querySelectorAll<HTMLElement>('#column-center .bubble'))
        .find((bubble) => !overlay?.contains(bubble) && bubble.textContent.includes(text));
        frames.push({
          copy: union(Array.from(overlay?.querySelectorAll('[class*="_piece_"]') || [])),
          bubble: toRect(bubble?.querySelector('.bubble-content')),
          bubbleOpacity: bubble ? +getComputedStyle(bubble.querySelector('.bubble-content-wrapper')).opacity : 1,
          previous: previous?.getBoundingClientRect().top,
          // * but its ticks, which change as the message's do when it is sent
          written: Array.from(overlay?.querySelectorAll('[style]') || [])
          .filter((element) => !element.closest('.time-sending-status'))
          .map((element) => element.getAttribute('style')).join('|')
        });
        if(performance.now() - started < 1500) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    }, text);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1700);

    const result = await page.evaluate(() => {
      const {appImManager} = window as any;
      return {
        frames: (window as any).__sendFlightFrames as Frame[],
        // * the overlay stays in the chat, empty
        copies: appImManager.chat.container.querySelectorAll('[class*="_overlay_"] > *').length,
        hidden: document.querySelectorAll('[class*="_hidden_"]').length
      };
    });
    const mid = await sentMid(page, text).catch((): number => undefined);
    if(mid) sent.push(mid);
    return {...result, mid, field};
  }

  /**
   * The id the test's message is sent under, once the server has given it: the one with `text`, or the one its held
   * flight flew into (whose message is the server's once it confirms it) - never merely the newest, which may be
   * another device's. A message is deleted at the end under that id, a temporary id is not sent to the server
   */
  async function sentMid(page: Page, text?: string): Promise<number> {
    return page.waitForFunction((text) => {
      const bubbles = Array.from(document.querySelectorAll<HTMLElement>('#column-center .bubbles-inner .bubble'));
      const mid = (window as any).__flight?.message?.mid;
      const bubble = text ?
        bubbles.find((bubble) => bubble.textContent.includes(text)) :
        bubbles.find((bubble) => mid && +bubble.dataset.mid === mid);
      return bubble && !bubble.classList.contains('is-sending') && +bubble.dataset.mid;
    }, text, {timeout: 10_000}).then((handle) => handle.jsonValue());
  }

  /**
   * The next copy is held where it lands, until `window.__land()`: what it draws there is compared with its message.
   * The flight is `window.__flight`
   */
  async function holdLanding(page: Page) {
    await page.evaluate(() => {
      const w = window as any;
      const flights = w.appImManager.chat.bubbles.sendFlights;
      const {mount} = flights;
      w.__land = w.__flight = undefined;
      flights.mount = function(flight: any) {
        flights.mount = mount;
        w.__flight = flight;
        const {land} = flight;
        flight.land = () => w.__land = () => land.call(flight);
        return mount.call(this, flight);
      };
    });
  }

  /**
   * What is drawn where an element of the test's message (its held flight's) is, and as far around it as given: a
   * bubble's tail at its side, its shadow under it. Not further up, where the message before it may be playing;
   * and, given `above`, only above where that element of the message starts
   */
  async function shootNewest(page: Page, selector: string, around = {side: 0, top: 0, bottom: 0}, above?: string) {
    const rect = await page.evaluate(([selector, above]) => {
      const bubble: Element = (window as any).__flight?.bubble || Array.from(document.querySelectorAll('#column-center .bubbles-inner .bubble')).pop();
      const {left, top, width, bottom} = bubble.querySelector(selector).getBoundingClientRect();
      const end = above ? Math.min(bottom, bubble.querySelector(above).getBoundingClientRect().top) : bottom;
      return {left, top, width, height: end - top};
    }, [selector, above] as const);
    return PNG.sync.read(await page.screenshot({
      clip: {
        x: rect.left - around.side,
        y: rect.top - around.top,
        width: rect.width + around.side * 2,
        height: rect.height + around.top + around.bottom
      }
    }));
  }

  /**
   * The copy where it landed and its message after it are drawn alike: both pictures go with a failure. A video
   * is scaled by the compositor, which samples a big one a little differently in the flight's layer than in the
   * bubble: its sharp edges may be a few shades off, which is not seen, while a picture drawn anew (another frame,
   * a thumbnail) is far off
   */
  async function expectDrawnAlike(held: PNG, landed: PNG, message: string, video?: boolean) {
    const count = video ? countDifferingPixels(held, landed, 48, Infinity, true) : countDifferingPixels(held, landed, 24);
    if(count > 2) {
      for(const [name, picture] of [['held', held], ['landed', landed]] as const) {
        const path = test.info().outputPath(`${name}.png`);
        await writeFile(path, PNG.sync.write(picture));
        await test.info().attach(name, {path, contentType: 'image/png'});
      }
    }

    expect(count, message).toBeLessThanOrEqual(2);
  }

  const near = (a: Rect, b: Rect, tolerance: number) => {
    return Math.abs(a.left - b.left) <= tolerance && Math.abs(a.top - b.top) <= tolerance &&
      Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance;
  };

  /** the copy flew, and landed on the bubble, which then shows where it was; nothing is left behind */
  function expectLanding({frames, copies, hidden}: Awaited<ReturnType<typeof send>>) {
    const flying = frames.map((frame, index) => ({...frame, index})).filter((frame) => frame.copy);
    expect(flying.length, 'a copy flew').toBeGreaterThan(5);
    const last = flying[flying.length - 1];
    const after = frames[last.index + 1];
    expect(near(last.copy, last.bubble, 1), `lands: ${JSON.stringify(last.copy)} vs ${JSON.stringify(last.bubble)}`).toBe(true);
    expect(after.copy).toBeNull();
    expect(after.bubbleOpacity).toBe(1);
    expect(near(after.bubble, last.copy, 1), 'no jump when the copy goes').toBe(true);
    expect(copies).toBe(0);
    expect(hidden).toBe(0);
    return flying;
  }

  test('flies out of the composer and lands on its bubble', async({page}) => {
    await openSavedMessages(page);
    const result = await send(page, `flight ${Date.now()}`);
    const {field, mid} = result;
    expect(mid, 'the message was sent').toBeTruthy();

    const flying = expectLanding(result);
    // * it starts as the composer's capsule: across it moves fast from the first frame, up slowly
    const first = flying[0].copy;
    const final = flying[flying.length - 1].copy;
    expect(Math.abs(first.top - field.top), `starts at the composer: ${JSON.stringify(first)} vs ${JSON.stringify(field)}`).toBeLessThanOrEqual(2);
    expect(Math.abs(first.height - field.height)).toBeLessThanOrEqual(2);
    expect(first.width).toBeGreaterThan(final.width);
    // * the message is not seen while its copy flies
    for(const frame of flying) {
      if(frame.bubble) expect(frame.bubbleOpacity, `frame ${frame.index}`).toBe(0);
    }

    // * the compositor moves the copy: it is laid out once, and nothing of it is written frame by frame
    const moved = new Set(flying.map((frame) => `${frame.copy.left},${frame.copy.top}`));
    expect(moved.size, 'the copy moves').toBeGreaterThan(5);
    expect(new Set(flying.map((frame) => frame.written)).size, 'the copy is not restyled while it flies').toBe(1);
  });

  for(const direction of ['ltr', 'rtl']) {
    test(`rapid consecutive sends keep older flights moving and land on their bubbles (${direction})`, async({page}) => {
      await openSavedMessages(page, direction === 'rtl' ? '?rtl=1' : '');
      await page.evaluate(() => {
        const w = window as any;
        const flights = w.appImManager.chat.bubbles.sendFlights;
        const mounted: any[] = w.__burstFlights = [];
        const frames: {time: number, tops: (number | null)[]}[] = w.__burstFrames = [];
        const landings: {copy: number, target: number}[] = w.__burstLandings = [];
        const top = (flight: any) => {
          const pieces = Array.from(flight.root.querySelectorAll('[class*="_piece_"]')) as Element[];
          return pieces.length ? Math.min(...pieces.map((piece) => piece.getBoundingClientRect().top)) : null;
        };
        const {mount} = flights;
        flights.mount = function(flight: any) {
          mounted.push(flight);
          const {land} = flight;
          flight.land = function() {
            landings.push({copy: top(flight), target: flight.target.getBoundingClientRect().top});
            return land.call(this);
          };
          return mount.call(this, flight);
        };
        const start = performance.now();
        const record = () => {
          frames.push({time: performance.now(), tops: mounted.map((flight) => {
            return !flight.done && flight.animations[0]?.currentTime >= 300 ? top(flight) : null;
          })});
          if(performance.now() - start < 5000) requestAnimationFrame(record);
          else flights.mount = mount;
        };
        requestAnimationFrame(record);
      });
      const prefix = `burst ${Date.now()}`;
      await page.locator('#column-center .input-message-input[contenteditable="true"]').click();
      for(let i = 0; i < 7; ++i) {
        await page.keyboard.insertText(`${prefix} ${i}`);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => (window as any).appImManager.chat.input.isInputEmpty());
        await page.waitForTimeout(65);
      }
      // Record only this test's confirmed message ids, before any assertions that might fail.
      for(let i = 0; i < 7; ++i) sent.push(await sentMid(page, `${prefix} ${i}`));
      await page.waitForTimeout(1800);
      const result = await page.evaluate(() => {
        const w = window as any;
        return {
          count: w.__burstFlights.length,
          frames: w.__burstFrames as {time: number, tops: (number | null)[]}[],
          landings: w.__burstLandings as {copy: number, target: number}[],
          remaining: w.__burstFlights.filter((flight: any) => flight.root.isConnected).length,
          hidden: document.querySelectorAll('#column-center .bubbles-inner [class*="_hidden_"]').length
        };
      });
      expect(result.count).toBe(7);
      expect(result.landings).toHaveLength(7);
      for(const {copy, target} of result.landings) expect(Math.abs(copy - target)).toBeLessThanOrEqual(1);
      for(let i = 1; i < result.frames.length; ++i) {
        const previous = result.frames[i - 1], current = result.frames[i];
        const elapsed = current.time - previous.time;
        if(elapsed > 80) continue;
        current.tops.forEach((top, index) => {
          if(top === null || previous.tops[index] == null) return;
          expect(Math.abs(top - previous.tops[index]), 'a finished shape follows the new scroll without jumping')
          .toBeLessThanOrEqual(elapsed * 1.25 + 2);
        });
      }
      expect(result.remaining).toBe(0);
      expect(result.hidden).toBe(0);
    });
  }

  test('of several lines, lands on its bubble as the composer shrinks back under the list', async({page}) => {
    await openSavedMessages(page);
    const result = await send(page, `lines ${Date.now()}`, [
      'a second line, long enough to be wrapped in the bubble but not in the composer',
      'and a third'
    ]);
    expect(result.mid, 'the message was sent').toBeTruthy();
    // * the composer had grown for the lines: as it shrinks, the list's end moves down under the copy
    expect(result.field.height, 'the composer grew').toBeGreaterThan(70);
    expectLanding(result);

    // * the older messages make room for it as it flies, on their way up all along: not at once, nor back
    const tops = result.frames.slice(result.frames.findIndex((frame) => frame.bubble)).map((frame) => frame.previous);
    const steps = tops.slice(1).map((top, index) => tops[index] - top);
    const moved = tops[0] - tops[tops.length - 1];
    expect(moved, 'the list made room').toBeGreaterThan(20);
    expect(Math.min(...steps), `never back: ${steps}`).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...steps), `not at once: ${steps}`).toBeLessThan(moved / 2);
  });

  test('lands on the very pixels its bubble is drawn on', async({page}) => {
    await openSavedMessages(page);
    await holdLanding(page);
    await type(page, `pixels ${Date.now()}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !!(window as any).__land, null, {timeout: 10_000});
    // * its ticks as they stay: the message sent, and their change played
    sent.push(await sentMid(page));
    await page.waitForTimeout(600);

    // * its background's edges and corners, its tail and its shadow, its text and its ticks
    const around = {side: 12, top: 1, bottom: 4};
    const held = await shootNewest(page, '.bubble-content', around);
    await page.evaluate(() => (window as any).__land());
    await page.waitForTimeout(300);
    const landed = await shootNewest(page, '.bubble-content', around);
    await expectDrawnAlike(held, landed, 'the bubble is drawn where its copy was');
  });

  test('flies its custom emoji with it, drawn where they stand in its bubble', async({page}) => {
    await openSavedMessages(page);
    await holdLanding(page);
    const text = `emoji ${Date.now()} `;
    await type(page, text);
    // * two of the custom emoji every account has, after the text
    const inserted = await page.evaluate(async() => {
      const {appImManager, rootScope} = window as any;
      const set = await rootScope.managers.appStickersManager.getStickerSet({_: 'inputStickerSetEmojiDefaultStatuses'}).catch((): any => undefined);
      const docs = set?.documents || [];
      for(const doc of docs.slice(0, 2)) {
        appImManager.chat.input.onEmojiSelected({docId: doc.id, emoji: doc.stickerEmojiRaw || '🙂'}, false);
      }

      return Math.min(docs.length, 2);
    });
    test.skip(!inserted, 'the account gets no custom emoji');
    // * drawn in the field, on its canvas next to it: each one where it stands, faded in and well past what the
    // * pictures taken of them are asked to have (an emoji fading in, or on an all but empty frame, is not yet)
    await page.waitForFunction((inserted) => {
      const input = document.querySelector<HTMLElement>('#column-center .input-message-input');
      const placeholders = Array.from(input.querySelectorAll('.custom-emoji-placeholder'));
      const canvas = input.previousElementSibling?.querySelector('canvas');
      if(placeholders.length !== inserted || !canvas?.width) return false;
      const canvasRect = canvas.getBoundingClientRect();
      const scale = canvas.width / canvasRect.width;
      return placeholders.every((placeholder) => {
        const rect = placeholder.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width * scale)), height = Math.max(1, Math.round(rect.height * scale));
        const {data} = canvas.getContext('2d').getImageData((rect.left - canvasRect.left) * scale, (rect.top - canvasRect.top) * scale, width, height);
        let count = 0;
        for(let i = 3; i < data.length; i += 4) if(data[i] > 32) ++count;
        return count / (width * height) > .1;
      });
    }, inserted, {timeout: 20_000});
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !!(window as any).__land, null, {timeout: 10_000});

    const flown = await page.evaluate(() => {
      const overlay = document.querySelector('#column-center [class*="_overlay_"]');
      const bubble: HTMLElement = (window as any).__flight.bubble;
      const drawn = (canvas: HTMLCanvasElement) => {
        const {data} = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let count = 0;
        for(let i = 3; i < data.length; i += 4) if(data[i] > 32) ++count;
        return count / (canvas.width * canvas.height);
      };
      const pictures = (selector: string) => Array.from(overlay.querySelectorAll<HTMLCanvasElement>(`${selector} canvas[style*="position: absolute"]`))
      .map((canvas) => ({rect: canvas.getBoundingClientRect().toJSON() as Rect, drawn: drawn(canvas)}));
      return {
        emoji: Array.from(bubble.querySelectorAll('custom-emoji-element')).map((element) => element.getBoundingClientRect().toJSON() as Rect),
        field: pictures('[class*="_fieldText_"]'),
        bubble: pictures('[class*="_bubble_"]')
      };
    });
    sent.push(await sentMid(page));

    // * the field's copy has them, and so has the bubble's, each one drawn over where its emoji is
    expect(flown.emoji.length, 'the message has its custom emoji').toBe(inserted);
    expect(flown.field.length, 'the field\'s copy has them').toBe(inserted);
    expect(flown.bubble.length, 'the bubble\'s copy has them').toBe(inserted);
    for(const [index, picture] of [...flown.field, ...flown.bubble].entries()) {
      expect(picture.drawn, `picture ${index} is drawn`).toBeGreaterThan(.05);
    }

    flown.emoji.forEach((rect, index) => {
      const picture = flown.bubble[index].rect;
      expect(near(picture, rect, 1), `emoji ${index}: ${JSON.stringify(picture)} vs ${JSON.stringify(rect)}`).toBe(true);
    });

    await page.evaluate(() => (window as any).__land());
  });

  type Moment = {frame?: number, time?: number};

  /**
   * Opens the panel on a tab and says where its first item shown over the chat is, once it shows itself: a GIF's
   * video with a frame (until then its thumbnail is all there is to fly)
   */
  async function findInPanel(page: Page, tab: 'stickers' | 'gifs') {
    await page.evaluate(() => (window as any).appImManager.chat.input.emoticonsDropdown.toggle(true));
    await page.locator(`.emoji-dropdown .emoji-tabs-${tab}`).click();
    return page.waitForFunction((tab) => {
      const panel = document.querySelector('.emoji-dropdown').getBoundingClientRect();
      const cell = Array.from(document.querySelectorAll(tab === 'gifs' ? '.emoji-dropdown .gif' : '.emoji-dropdown .super-sticker'))
      .find((cell) => {
        const rect = cell.getBoundingClientRect();
        return cell.querySelector('canvas, img, video') && rect.height > 20 && rect.top >= panel.top && rect.bottom <= panel.bottom;
      });
      if(tab === 'gifs' && !(cell?.querySelector('video')?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)) {
        return;
      }

      const rect = cell?.getBoundingClientRect();
      return rect && {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    }, tab, {timeout: 20_000}).then((handle) => handle.jsonValue(), (): {x: number, y: number} => undefined);
  }

  /** stops what plays in the panel's item there, and says where it stopped: a sticker's frame, a video's time */
  async function stopInPanel(page: Page, at: {x: number, y: number}): Promise<Moment> {
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(400);
    await page.evaluate(({x, y}) => {
      const w = window as any;
      const cell = document.elementFromPoint(x, y).closest('.super-sticker, .gif');
      const canvas = cell.querySelector('canvas');
      w.__panelPlayer = w.lottieLoader?.getAnimation(cell) || (canvas && w.lottieLoader?.getAnimation(canvas.parentElement));
      w.__panelVideo = cell.querySelector('video');
      w.__panelPlayer?.pause();
      w.__panelVideo?.pause();
    }, at);
    // * a sticker drawn by a worker settles on the frame the worker stopped at
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const w = window as any;
      return {frame: w.__panelPlayer?.curFrame, time: w.__panelVideo?.currentTime};
    });
  }

  /**
   * Holds the next flight where it lands, and sees what flies on every frame till then: the message's own
   * picture (rather than a copy), and the moment it shows (a sticker's frame, a video's time)
   */
  async function watchOwnFlight(page: Page) {
    await holdLanding(page);
    await page.evaluate(() => {
      const w = window as any;
      const frames: {frame?: number, time?: number, playing: boolean}[] = w.__ownFrames = [];
      const record = () => {
        const own = document.querySelector<HTMLElement>('#column-center [class*="_overlay_"] [class*="_borrowed_"]');
        if(own) {
          w.__flown = own;
          const canvas = own.querySelector('canvas');
          const player = w.lottieLoader?.getAnimation(own) || (canvas && w.lottieLoader?.getAnimation(canvas.parentElement));
          const video = own.querySelector('video');
          w.__flownPlayer = player;
          frames.push({
            frame: player?.hasRenderedFirstFrame ? player.curFrame : undefined,
            time: video?.readyState ? video.currentTime : undefined,
            playing: (player && !player.paused) || (video && !video.paused)
          });
        }

        if(!w.__land) {
          requestAnimationFrame(record);
        }
      };
      requestAnimationFrame(record);
    });
  }

  /**
   * The message's own picture flew, held still on the moment its source was at; it lands where it is drawn after,
   * as it flew, seen at once, and nothing stands in for it any more
   */
  async function expectOwnLanding(page: Page, moment: Moment = {}) {
    await page.waitForFunction(() => !!(window as any).__land, null, {timeout: 10_000});
    sent.push(await sentMid(page));
    const frames: {frame?: number, time?: number, playing: boolean}[] = await page.evaluate(() => (window as any).__ownFrames);
    expect(frames.length, 'the message\'s own picture flies').toBeGreaterThan(5);
    expect(frames.filter((frame) => frame.playing), 'nothing of it plays on the way').toEqual([]);
    if(moment.frame !== undefined) {
      const shown = frames.map((frame) => frame.frame).filter((frame) => frame !== undefined);
      expect(new Set(shown), 'its sticker is on the frame it was chosen at, all the way').toEqual(new Set([moment.frame]));
      // * and draws it, not only says so: the frame on its canvas
      const drawn = await page.evaluate(() => (window as any).__flownPlayer.exportFrame().then(({frame, frameNo}: {frame: ImageBitmap, frameNo: number}) => {
        frame.close();
        return frameNo;
      }));
      expect(drawn, 'its sticker draws that frame').toBe(moment.frame);
    }

    if(moment.time !== undefined) {
      // * once its video is there and has been put on that time
      const times = frames.map((frame) => frame.time).filter((time) => time !== undefined);
      expect(times.length, 'its video came').toBeGreaterThan(0);
      expect(Math.abs(times[times.length - 1] - moment.time), `its video is at the time it was chosen at: ${times}`).toBeLessThan(.05);
    }

    // * kept still where it lands (it plays on once there), it is shot there, above its time: the time comes once
    // * it is there, over it
    const video = await page.evaluate(() => {
      const w = window as any;
      if(w.__flownPlayer) {
        w.__flownPlayer.autoplay = false;
      }

      const videos: NodeListOf<HTMLVideoElement> = w.__flown.querySelectorAll('video');
      videos.forEach((video) => video.play = () => Promise.resolve());
      return videos.length > 0;
    });
    const held = await shootNewest(page, '.attachment', undefined, '.time-inner');
    // * it is seen as it lands: nothing it goes back into fades in over it
    const shown = await page.evaluate(async() => {
      (window as any).__land();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      let opacity = 1;
      for(let element: HTMLElement = (window as any).__flown; element; element = element.parentElement) {
        opacity *= +getComputedStyle(element).opacity;
      }

      return opacity;
    });
    expect(shown, 'it is seen as it lands').toBe(1);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const bubble: HTMLElement = (window as any).__flight.bubble;
      return {
        back: bubble.querySelector('.attachment') === (window as any).__flown,
        stands: bubble.querySelectorAll('.attachment').length,
        hidden: document.querySelectorAll('[class*="_hidden_"]').length
      };
    });
    expect(after.back, 'it is back in its message').toBe(true);
    expect(after.stands, 'nothing stands in for it any more').toBe(1);
    expect(after.hidden).toBe(0);
    const landed = await shootNewest(page, '.attachment', undefined, '.time-inner');
    await expectDrawnAlike(held, landed, 'nothing of it is drawn anew', video);
  }

  for(const tab of ['stickers', 'gifs'] as const) {
    const what = tab === 'gifs' ? 'GIF' : 'sticker';
    test(`flies its own ${what} from the panel, still where it was chosen at, and lands it as it flew`, async({page}) => {
      await openSavedMessages(page);
      const cell = await findInPanel(page, tab);
      test.skip(!cell, `the account has no ${what} to send`);

      const moment = await stopInPanel(page, cell);
      await watchOwnFlight(page);
      await page.mouse.click(cell.x, cell.y);
      await expectOwnLanding(page, moment);
    });
  }

  test('flies its own big emoji, and lands them as they flew', async({page}) => {
    await openSavedMessages(page);
    await watchOwnFlight(page);
    await type(page, '😀😎👍');
    await page.keyboard.press('Enter');
    await expectOwnLanding(page);
  });

  test('just comes at the reduced animation level', async({page}) => {
    // * the system's reduce motion under the accessibility layer is the reduced level
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openSavedMessages(page, '?a11y=1');
    const {frames, mid, copies, hidden} = await send(page, `no flight ${Date.now()}`);
    expect(mid, 'the message was sent').toBeTruthy();
    expect(frames.some((frame) => frame.copy), 'nothing flew').toBe(false);
    expect(frames.every((frame) => frame.bubbleOpacity === 1)).toBe(true);
    expect(copies).toBe(0);
    expect(hidden).toBe(0);
  });
});
