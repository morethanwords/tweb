import {expect, Page, test} from '@playwright/test';
import {PNG} from 'pngjs';
import {openChatList} from './chatList.helpers';

/*
 * A message edited where it stands changes on the compositor (`components/chat/bubbleTransitions`): its background
 * goes from its old box to its new one, the old text gives way to the new one, cut by the background as it shrinks,
 * and the messages it moves go there instead of jumping. Everything is laid out once, at the end, and no script
 * writes on what draws the change while it plays; nothing of it is left when it is over. At the reduced animation
 * level the text only gives way where it stands, and nothing moves; a message that cannot be seen just changes.
 *
 * It sends a few messages to the account's Saved Messages, edits them and deletes them at the end. Like the other
 * signed-in specs it runs against an authorized preview, and skips rather than reporting a pass it never made:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:edit:app
 */

type Rect = {left: number, top: number, width: number, height: number};
type Frame = {
  // the background drawn in pieces while the message changes, and the message's own box
  shape: Rect | null,
  content: Rect,
  // the text as it was, while it gives way
  copy: Rect | null,
  copyOpacity: number,
  // the top of the message before it, as the change moves it
  previous: number,
  // what script has written on what draws the change
  written: string
};

test.describe('a message edited where it stands', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');
  test.use({viewport: {width: 1280, height: 800}});

  const sent: number[] = [];

  test.afterEach(async({page}) => {
    await page.evaluate(() => (window as any).liteMode.setAnimationLevel(2)).catch(() => {});
    if(!sent.length) return;
    await page.evaluate(async(mids) => {
      const {appImManager, rootScope} = window as any;
      await appImManager.managers.appMessagesManager.deleteMessages(rootScope.myId, mids, true);
    }, sent.splice(0)).catch(() => {});
  });

  async function openSavedMessages(page: Page) {
    test.setTimeout(4 * 60_000);
    await openChatList(page);
    await page.evaluate(() => {
      const {appImManager, rootScope} = window as any;
      appImManager.setInnerPeer({peerId: rootScope.myId});
    });
    await page.waitForFunction(() => {
      const {appImManager, rootScope} = window as any;
      const chat = appImManager.chat;
      return chat?.peerId === rootScope.myId && chat.bubbles.scrollable.loadedAll.bottom;
    }, null, {timeout: 60_000});
    await page.waitForTimeout(1500);
  }

  /** sends `text` and returns its id once the server has given it, the message at the list's end */
  async function sendText(page: Page, text: string): Promise<number> {
    await page.evaluate((text) => {
      const {appImManager, rootScope} = window as any;
      appImManager.managers.appMessagesManager.sendText({peerId: rootScope.myId, text});
    }, text);
    const mid: number = await page.waitForFunction((text) => {
      const bubble = Array.from(document.querySelectorAll<HTMLElement>('#column-center .bubbles-inner .bubble'))
      .find((bubble) => bubble.querySelector('.message')?.textContent.startsWith(text));
      return bubble && !bubble.classList.contains('is-sending') && Number.isInteger(+bubble.dataset.mid) && +bubble.dataset.mid;
    }, text, {timeout: 15_000}).then((handle) => handle.jsonValue() as Promise<number>);
    sent.push(mid);
    await page.waitForTimeout(500);
    return mid;
  }

  /** edits the message `mid` to `text` and returns every frame from then until it is all over */
  async function edit(page: Page, mid: number, text: string) {
    await page.evaluate(async([mid, text]) => {
      const w = window as any;
      const frames: Frame[] = w.__editFrames = [];
      const toRect = (element: Element): Rect => {
        if(!element) return null;
        const rect = element.getBoundingClientRect();
        return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
      };
      // * the background is made of pieces: its box is theirs together
      const union = (elements: Element[]): Rect => {
        const rects = elements.map((element) => element.getBoundingClientRect()).filter((rect) => rect.width && rect.height);
        if(!rects.length) return null;
        const left = Math.min(...rects.map((rect) => rect.left)), top = Math.min(...rects.map((rect) => rect.top));
        const right = Math.max(...rects.map((rect) => rect.right)), bottom = Math.max(...rects.map((rect) => rect.bottom));
        return {left, top, width: right - left, height: bottom - top};
      };
      const bubble = document.querySelector(`#column-center .bubble[data-mid="${mid}"]`);
      const previous = bubble.previousElementSibling || bubble.parentElement.previousElementSibling;
      const started = performance.now();
      const record = () => {
        const content = bubble.querySelector('.bubble-content');
        const layers = Array.from(content.querySelectorAll('[class*="_layer_"]'));
        const copy = content.querySelector('[class*="_textCopy_"]');
        frames.push({
          shape: union(layers.flatMap((layer) => Array.from(layer.querySelectorAll('[class*="_piece_"]')))),
          content: toRect(content),
          copy: toRect(copy),
          copyOpacity: copy ? +getComputedStyle(copy).opacity : 0,
          previous: previous?.getBoundingClientRect().top,
          written: layers.flatMap((layer) => Array.from(layer.querySelectorAll('[style]')))
          .map((element) => element.getAttribute('style')).join('|')
        });
        if(performance.now() - started < 2500) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
      const {appImManager, rootScope} = w;
      const manager = appImManager.managers.appMessagesManager;
      manager.editMessage(await manager.getMessageByPeer(rootScope.myId, mid), text);
    }, [mid, text] as const);
    await page.waitForTimeout(2700);
    return page.evaluate((mid) => {
      const bubble = document.querySelector(`#column-center .bubble[data-mid="${mid}"]`);
      return {
        frames: (window as any).__editFrames as Frame[],
        // * nothing of the change is left: its layers, its classes, its ways on the list
        left: bubble.querySelectorAll('[class*="_layer_"], [class*="_morphing_"], [class*="_timeCopy_"]').length,
        moved: Array.from(document.querySelectorAll<HTMLElement>('#column-center .bubble')).filter((bubble) => bubble.style.translate).length,
        text: bubble.querySelector('.message [data-message-text-source]')?.textContent
      };
    }, mid);
  }

  const near = (a: Rect, b: Rect, tolerance: number) => {
    return Math.abs(a.left - b.left) <= tolerance && Math.abs(a.top - b.top) <= tolerance &&
      Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance;
  };

  /** the background went from the old box to the new one, laid out once, and is gone with nothing left */
  function expectMorph({frames, left, moved}: Awaited<ReturnType<typeof edit>>, before: Rect) {
    const morphing = frames.map((frame, index) => ({...frame, index})).filter((frame) => frame.shape);
    expect(morphing.length, 'the background changed its size').toBeGreaterThan(5);
    const first = morphing[0], last = morphing[morphing.length - 1];
    expect(near(first.shape, before, 1.5), `starts as it was: ${JSON.stringify(first.shape)} vs ${JSON.stringify(before)}`).toBe(true);
    expect(near(last.shape, last.content, 1.5), `ends as it is: ${JSON.stringify(last.shape)} vs ${JSON.stringify(last.content)}`).toBe(true);
    const after = frames[last.index + 1];
    expect(near(after.content, last.content, .5), 'no jump when it is over').toBe(true);
    // * the compositor changes it: nothing of it is written frame by frame
    expect(new Set(morphing.map((frame) => frame.written)).size, 'what draws the change is not restyled as it plays').toBe(1);
    expect(left).toBe(0);
    expect(moved).toBe(0);
    return morphing;
  }

  test('grows from its old box, and the messages above make room', async({page}) => {
    await openSavedMessages(page);
    const stamp = Date.now();
    await sendText(page, `above ${stamp}`);
    const mid = await sendText(page, `edit ${stamp}`);
    const before: Rect = await page.evaluate((mid) => {
      const rect = document.querySelector(`#column-center .bubble[data-mid="${mid}"] .bubble-content`).getBoundingClientRect();
      return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
    }, mid);

    const result = await edit(page, mid, `edit ${stamp}: now long enough to take the whole width of the bubble and to wrap onto a second line`);
    expect(result.text).toContain('wrap onto a second line');
    const morphing = expectMorph(result, before);
    // * it only grows, across and up
    for(let i = 1; i < morphing.length; ++i) {
      expect(morphing[i].shape.width).toBeGreaterThanOrEqual(morphing[i - 1].shape.width - .5);
      expect(morphing[i].shape.height).toBeGreaterThanOrEqual(morphing[i - 1].shape.height - .5);
    }

    // * the message above goes up as it grows, without a step: from where it was to where it is
    const tops = result.frames.map((frame) => frame.previous);
    const way = tops[0] - tops[tops.length - 1];
    expect(way, 'the message above made room').toBeGreaterThan(10);
    for(let i = 1; i < tops.length; ++i) {
      expect(tops[i], 'it goes one way').toBeLessThanOrEqual(tops[i - 1] + .5);
      expect(tops[i - 1] - tops[i], 'no step of more than half the way').toBeLessThanOrEqual(way / 2);
    }
  });

  test('shrinks to its new box, the old text cut by it as it goes', async({page}) => {
    await openSavedMessages(page);
    const stamp = Date.now();
    const mid = await sendText(page, `shrink ${stamp}: a long text that takes the whole width of the bubble and wraps onto a second line`);
    const before: Rect = await page.evaluate((mid) => {
      const rect = document.querySelector(`#column-center .bubble[data-mid="${mid}"] .bubble-content`).getBoundingClientRect();
      return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
    }, mid);

    const result = await edit(page, mid, `shrink ${stamp}`);
    const morphing = expectMorph(result, before);
    // * the old text gives way: it shows at first and is gone, laid out as it was, as wide as the bubble was
    const copies = result.frames.filter((frame) => frame.copy);
    expect(copies.length).toBeGreaterThan(0);
    expect(copies[0].copyOpacity).toBeGreaterThan(.5);
    expect(copies[copies.length - 1].copyOpacity).toBeLessThan(.1);
    expect(Math.abs(copies[0].copy.width - (before.width - 16)), 'as wide as it was').toBeLessThanOrEqual(16);
    for(let i = 1; i < morphing.length; ++i) {
      expect(morphing[i].shape.width).toBeLessThanOrEqual(morphing[i - 1].shape.width + .5);
    }
  });

  test('at the reduced level gives way where it stands, and nothing moves', async({page}) => {
    await openSavedMessages(page);
    await page.evaluate(() => (window as any).liteMode.setAnimationLevel(1));
    const stamp = Date.now();
    const mid = await sendText(page, `reduced ${stamp}`);
    const result = await edit(page, mid, `reduced ${stamp}: longer now, though nothing of it moves`);
    expect(result.frames.some((frame) => frame.shape), 'no background changes its size').toBe(false);
    const copies = result.frames.filter((frame) => frame.copy);
    expect(copies.length, 'the old text gives way').toBeGreaterThan(0);
    expect(new Set(copies.map((frame) => `${frame.copy.left},${frame.copy.top}`)).size, 'where it stands').toBe(1);
    expect(result.left).toBe(0);
    expect(result.moved).toBe(0);
  });

  test('a message that cannot be seen just changes', async({page}) => {
    await openSavedMessages(page);
    const stamp = Date.now();
    const mid = await sendText(page, `unseen ${stamp}`);
    // * scrolled away from it, as far as the list goes
    await page.evaluate(() => {
      const container = (window as any).appImManager.chat.bubbles.scrollable.container;
      container.scrollTop = Math.max(0, container.scrollTop - container.clientHeight * 2);
    });
    await page.waitForTimeout(500);
    const seen = await page.evaluate((mid) => {
      const container = (window as any).appImManager.chat.bubbles.scrollable.container;
      const rect = document.querySelector(`#column-center .bubble[data-mid="${mid}"]`)?.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      return !!rect && rect.bottom > box.top && rect.top < box.bottom;
    }, mid);
    test.skip(seen, 'the list is too short to scroll the message out of sight');

    const result = await edit(page, mid, `unseen ${stamp}: changed out of sight`);
    expect(result.frames.some((frame) => frame.shape || frame.copy)).toBe(false);
    expect(result.text).toContain('changed out of sight');
  });

  // * a bot's answer streamed at the list's end, a line at a time (the sandbox's, in this tab only): the list keeps up
  // * with it, every line it takes moving what is above up on a way of its own rather than at once (`followGrowth`)
  test('a streamed answer: the list keeps up with it without a jump', async({page}) => {
    await openSavedMessages(page);
    const tops: number[] = await page.evaluate(async() => {
      const w = window as any;
      await w.showBubbleSandbox();
      const container: HTMLElement = w.appImManager.chat.bubbles.scrollable.container;
      container.scrollTop = container.scrollHeight;
      await new Promise((resolve) => setTimeout(resolve, 500));
      // * a message above the end, not a date held at the top
      const reference = Array.from(container.querySelectorAll<HTMLElement>('.bubble[data-mid]')).slice(-3)[0];
      const tops: number[] = [];
      let run = true;
      w.bubbleSandbox.stream();
      // * the answer coming at all is the list's own way (a message that comes): its lines after that
      await new Promise((resolve) => setTimeout(resolve, 800));
      const tick = () => {
        tops.push(reference.getBoundingClientRect().top);
        if(run) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      run = false;
      w.bubbleSandbox.stream(true);
      w.bubbleSandbox.close();
      return tops;
    });
    const way = tops[0] - tops[tops.length - 1];
    expect(way, 'lines came, and the list went up as they did').toBeGreaterThan(15);
    const steps = tops.slice(1).map((top, index) => tops[index] - top);
    expect(Math.max(...steps), 'no line moves the list at once').toBeLessThan(6);
    expect(Math.min(...steps), 'it only goes up').toBeGreaterThan(-.5);
  });

  // * the outgoing bubbles' gradient (`components/chat/outgoingGradientUnion`): in a theme of one the bubbles at rest are
  // * cut out of one piece of it drawn for the chat, which draws what a bubble's own piece would, and is no layer of the
  // * compositor's for each; a message that changes where it stands has its own piece while it does; custom emoji are
  // * seen over either; a bubble a scroll brings into sight is of the gradient at once (a theme of this tab only: the
  // * chat's own, its colours far apart)
  test('in a theme of a gradient, the bubbles at rest are drawn by one piece for the chat', async({page}) => {
    await openSavedMessages(page);
    await page.evaluate(async() => {
      const {appImManager} = window as any;
      const chat = appImManager.chat;
      const themes = await appImManager.managers.appThemesManager.getThemes();
      const theme = JSON.parse(JSON.stringify(themes.find((theme: any) => theme.settings?.length)));
      for(const settings of theme.settings) {
        settings.message_colors = [0xff8080, 0x80ff80, 0x8080ff];
        if(settings.pFlags) delete settings.pFlags.message_colors_animated;
      }

      // * the chat sets its theme again when its peer's full info comes
      (window as any).__chatTheme = Object.getOwnPropertyDescriptor(chat, 'currentTheme');
      Object.defineProperty(chat, 'currentTheme', {configurable: true, get: () => theme, set: () => {}});
      chat.applyContainerTheme();
    });

    try {
      const stamp = Date.now();
      const mid = await sendText(page, `gradient ${stamp}: long enough to take the whole width of the bubble and to wrap`);
      const selector = `#column-center .bubble[data-mid="${mid}"]`;
      const state = () => page.evaluate((selector) => {
        const container: HTMLElement = (window as any).appImManager.chat.bubbles.scrollable.container;
        const box = container.getBoundingClientRect();
        const union = container.querySelector<HTMLElement>('.bubbles-inner > .bubbles-gradient');
        const inSight = Array.from(container.querySelectorAll<HTMLElement>('.bubbles-inner .bubble.is-out:not(.just-media)')).filter((bubble) => {
          const rect = bubble.getBoundingClientRect();
          return rect.bottom > box.top && rect.top < box.bottom;
        });
        return {
          drawn: !!union && !union.classList.contains('is-empty') && union.style.clipPath.startsWith('path('),
          inSight: inSight.length,
          joined: inSight.filter((bubble) => bubble.classList.contains('is-gradient-joined')).length,
          ownPieces: inSight.filter((bubble) => getComputedStyle(bubble.querySelector('.bubble-gradient')).display !== 'none').length,
          message: document.querySelector(selector).classList.contains('is-gradient-joined')
        };
      }, selector);

      let now = await state();
      expect(now.drawn, 'the chat\'s piece is drawn').toBe(true);
      expect(now.inSight).toBeGreaterThan(0);
      expect(now.joined, 'every bubble in sight is cut out of it').toBe(now.inSight);
      expect(now.ownPieces, 'and lays out no piece of its own').toBe(0);

      // * the bubble as the chat's piece draws it, and as its own piece does (a bubble moved aside has its own)
      const clip = await page.evaluate((selector) => {
        const rect = document.querySelector(`${selector} .bubble-content`).getBoundingClientRect();
        return {x: Math.floor(rect.left) - 2, y: Math.floor(rect.top) - 2, width: Math.ceil(rect.width) + 14, height: Math.ceil(rect.height) + 4};
      }, selector);
      const frames = (count: number) => page.evaluate((count) => new Promise<void>((resolve) => {
        const tick = () => --count ? requestAnimationFrame(tick) : resolve();
        requestAnimationFrame(tick);
      }), count);
      const cut = PNG.sync.read(await page.screenshot({clip}));
      await page.evaluate((selector) => document.querySelector(selector).classList.add('is-gradient-held'), selector);
      await frames(3);
      now = await state();
      expect(now.message, 'a bubble moved aside is not cut out').toBe(false);
      const own = PNG.sync.read(await page.screenshot({clip}));
      let different = 0;
      for(let i = 0; i < cut.data.length; i += 4) {
        if(Math.max(...[0, 1, 2].map((channel) => Math.abs(cut.data[i + channel] - own.data[i + channel]))) > 12) ++different;
      }

      expect(different / (cut.data.length / 4), `the same pixels (${different} differ)`).toBeLessThan(.002);

      // * the compositor's layers: those of the bubbles' own pieces and of what lies over them, and none of the chat's
      const cdp = await page.context().newCDPSession(page);
      let tree: unknown[] = [];
      cdp.on('LayerTree.layerTreeDidChange', (event: {layers?: unknown[]}) => event.layers && (tree = event.layers));
      await cdp.send('LayerTree.enable');
      const countLayers = async() => {
        tree = [];
        // * a layer that comes and goes, for the tree to be sent again
        await page.evaluate(async() => {
          const probe = document.createElement('div');
          probe.style.cssText = 'position: fixed; width: 1px; height: 1px; will-change: transform; top: 0; left: 0';
          document.body.append(probe);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          probe.remove();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        await page.waitForTimeout(300);
        return tree.length;
      };
      const held = await page.evaluate(() => {
        const bubbles = Array.from(document.querySelectorAll('#column-center .bubbles-inner .bubble.is-gradient-joined'));
        bubbles.forEach((bubble) => bubble.classList.add('is-gradient-held'));
        return bubbles.length;
      });
      await frames(3);
      const ownLayers = await countLayers();
      await page.evaluate(() => {
        document.querySelectorAll('#column-center .is-gradient-held').forEach((bubble) => bubble.classList.remove('is-gradient-held'));
      });
      await frames(3);
      const cutLayers = await countLayers();
      await cdp.detach();
      expect(held).toBeGreaterThan(0);
      expect(ownLayers - cutLayers, `no layer for each bubble (${cutLayers} vs ${ownLayers} with their own pieces)`).toBeGreaterThanOrEqual(Math.min(held, now.inSight));

      // * a message edited where it stands leaves it while it changes, and is cut out again once it is done
      const joinedWhileEdited: boolean[] = await page.evaluate(async([selector, mid, text]) => {
        const w = window as any;
        const bubble = document.querySelector(selector);
        const seen: boolean[] = [];
        let run = true;
        const tick = () => {
          seen.push(bubble.classList.contains('is-gradient-joined'));
          if(run) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        const manager = w.appImManager.managers.appMessagesManager;
        manager.editMessage(await manager.getMessageByPeer(w.rootScope.myId, mid), text);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        run = false;
        return seen;
      }, [selector, mid, `gradient ${stamp}`] as const);
      expect(joinedWhileEdited.some((joined) => !joined), 'it has its own piece while it changes').toBe(true);
      expect(joinedWhileEdited[joinedWhileEdited.length - 1], 'and is cut out again').toBe(true);

      // * its custom emoji (in this tab only, as the bubble sandbox shows a state), drawn on a canvas under its text,
      // * which a spoiler covers: over the chat's piece, and over its own one too
      const inserted: number = await page.evaluate(async(mid) => {
        const {appImManager, rootScope, apiManagerProxy} = window as any;
        const chat = appImManager.chat;
        const set = await rootScope.managers.appStickersManager.getLocalStickerSet('inputStickerSetEmojiDefaultStatuses').catch((): any => undefined);
        const docs = (set?.documents || []).slice(0, 2);
        if(!docs.length) return 0;
        const storageKey: string = chat.messagesStorageKey;
        // * where it is read from (`getMessageFromStorage`): a chat's history keeps the ids of the global one there
        const key = storageKey.endsWith('history') && mid < 0x100000000 ? apiManagerProxy.getGlobalHistoryMessagesStorage() : storageKey;
        const message = apiManagerProxy.getMessageFromStorage(storageKey, mid);
        const entities = docs.map((doc: any, index: number) => ({_: 'messageEntityCustomEmoji', offset: 6 + index * 2, length: 2, document_id: doc.id}));
        const edited = {...message, message: 'emoji 🙂🙂 over the gradient', entities, totalEntities: entities};
        apiManagerProxy.onMirrorTask({name: 'messages', key: key + '\x01' + mid, value: edited, accountNumber: 1});
        rootScope.dispatchEventSingle('message_edit', {storageKey, peerId: message.peerId, mid, message: edited});
        return docs.length;
      }, mid);
      if(inserted) {
        await page.waitForFunction(([selector, inserted]) => document.querySelectorAll(`${selector} custom-emoji-element`).length === inserted, [selector, inserted] as const, {timeout: 10_000});
        await page.waitForTimeout(1500);
        // * how much of where they stand they change on the screen, against them hidden
        const emojiShown = async() => {
          const box = await page.evaluate((selector) => {
            const rects = Array.from(document.querySelectorAll(`${selector} custom-emoji-element`)).map((element) => element.getBoundingClientRect());
            const [left, top] = [Math.min(...rects.map((rect) => rect.left)), Math.min(...rects.map((rect) => rect.top))];
            const [right, bottom] = [Math.max(...rects.map((rect) => rect.right)), Math.max(...rects.map((rect) => rect.bottom))];
            return {x: Math.floor(left), y: Math.floor(top), width: Math.ceil(right - left), height: Math.ceil(bottom - top)};
          }, selector);
          const setVisibility = (visibility: string) => page.evaluate(([selector, visibility]) => {
            document.querySelectorAll<HTMLElement>(`${selector} .custom-emoji-renderer`).forEach((renderer) => renderer.style.visibility = visibility);
          }, [selector, visibility] as const);
          const shown = PNG.sync.read(await page.screenshot({clip: box}));
          await setVisibility('hidden');
          await frames(2);
          const hidden = PNG.sync.read(await page.screenshot({clip: box}));
          await setVisibility('');
          await frames(2);
          let changed = 0;
          for(let i = 0; i < shown.data.length; i += 4) {
            if(Math.max(...[0, 1, 2].map((channel) => Math.abs(shown.data[i + channel] - hidden.data[i + channel]))) > 40) ++changed;
          }

          return changed / (shown.data.length / 4);
        };

        expect(await emojiShown(), 'its custom emoji are seen over the chat\'s piece').toBeGreaterThan(.05);
        await page.evaluate((selector) => document.querySelector(selector).classList.add('is-gradient-held'), selector);
        await frames(3);
        expect(await emojiShown(), 'and over its own one').toBeGreaterThan(.05);
        await page.evaluate((selector) => document.querySelector(selector).classList.remove('is-gradient-held'), selector);
      }

      // * a message of ours coming at the list's end while it is scrolled far up (in this tab only, as the worker hands
      // * it over): the list goes down to it, and every bubble that brings into sight is of the gradient at once, where
      // * a piece the main thread made as it came was missing, the bubble of one colour until the next scroll
      await page.evaluate(async() => {
        const {appImManager, rootScope, apiManagerProxy} = window as any;
        const chat = appImManager.chat;
        const container: HTMLElement = chat.bubbles.scrollable.container;
        const storageKey: string = chat.messagesStorageKey;
        const last = Array.from(chat.bubbles.chatInner.querySelectorAll('.bubble.is-out[data-mid]:not(.just-media)')).pop() as HTMLElement;
        const lastMid = +last.dataset.mid;
        const key = storageKey.endsWith('history') && lastMid < 0x100000000 ? apiManagerProxy.getGlobalHistoryMessagesStorage() : storageKey;
        const original = apiManagerProxy.getMessageFromStorage(storageKey, lastMid);
        let added = 0;
        const append = (text: string) => {
          const mid = lastMid + ++added / 100;
          const message = {...original, mid, id: original.id + added / 100, date: Math.floor(Date.now() / 1000), message: text, entities: [] as any[], totalEntities: [] as any[]};
          apiManagerProxy.onMirrorTask({name: 'messages', key: key + '\x01' + mid, value: message, accountNumber: 1});
          rootScope.dispatchEventSingle('history_append', {storageKey, message, peerId: message.peerId});
        };

        // * a list long enough to scroll far, whatever the account has
        while(container.scrollHeight < container.clientHeight * 3 && added < 40) {
          append(`one of many ${added}`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        await new Promise((resolve) => setTimeout(resolve, 600));
        container.scrollTop = 0;
        await new Promise((resolve) => setTimeout(resolve, 1200));
        append('coming at the end');
      });
      await page.waitForTimeout(2000);
      const read = () => page.evaluate(() => {
        const frame = document.querySelector('#column-center .bubbles').getBoundingClientRect();
        const points = Array.from(document.querySelectorAll('#column-center .bubbles-inner .bubble.is-out:not(.just-media) .bubble-content'))
        .map((content) => content.getBoundingClientRect())
        .filter((rect) => rect.top > frame.top + 60 && rect.bottom < frame.bottom - 80)
        .map((rect) => [Math.round(rect.left + 3), Math.round((rect.top + rect.bottom) / 2)]);
        return {top: frame.top, bottom: frame.bottom, points};
      });
      const geometry = await read();
      const screen = PNG.sync.read(await page.screenshot());
      expect(JSON.stringify(await read()), 'the list stands still').toBe(JSON.stringify(geometry));
      expect(geometry.points.length).toBeGreaterThan(3);
      // * the theme's colours from the bottom of the frame up, which the text reads on as they are
      const stops = [[0xff, 0x80, 0x80], [0x80, 0xff, 0x80], [0x80, 0x80, 0xff]];
      const off = geometry.points.map(([x, y]) => {
        const at = (geometry.bottom - y) / (geometry.bottom - geometry.top) * 2;
        const from = Math.min(1, Math.floor(at)), t = at - from;
        const offset = (y * screen.width + x) * 4;
        return Math.max(...[0, 1, 2].map((channel) => Math.abs(screen.data[offset + channel] - (stops[from][channel] + (stops[from + 1][channel] - stops[from][channel]) * t))));
      });
      expect(Math.max(...off), `every bubble brought into sight is of the gradient (${off.join(', ')})`).toBeLessThan(16);
    } finally {
      await page.evaluate(() => {
        const {appImManager} = window as any;
        const chat = appImManager.chat;
        const descriptor = (window as any).__chatTheme;
        delete chat.currentTheme;
        if(descriptor) Object.defineProperty(chat, 'currentTheme', descriptor);
        chat.applyContainerTheme();
      }).catch(() => {});
    }
  });

  // * the bubble sandbox (`components/bubbleSandbox`): every state it has, one after another, in this tab only — the
  // * reactions and a reply too, shown changing as the text is
  test('the bubble sandbox puts a message in every state and back', async({page}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openSavedMessages(page);
    const stamp = Date.now();
    const text = `sandbox ${stamp}`;
    const mid = await sendText(page, text);
    await page.evaluate(async(mid) => {
      const w = window as any;
      await w.showBubbleSandbox();
      w.bubbleSandbox.select([document.querySelector(`#column-center .bubble[data-mid="${mid}"]`)]);
    }, mid);

    const steps: Array<[dimension: string, option: string, edit: RegExp]> = [
      ...['short', 'line', 'wrap', 'paragraph', 'lines', 'hebrew', 'formatted', 'quote', 'code']
      .map((option) => ['text', option, /^Edit: in place$/] as [string, string, RegExp]),
      ['text', 'emoji', /rendered anew \(bigEmoji\)/],
      ['text', 'line', /rendered anew \(bigEmoji\)/],
      ['edited', 'yes', /^Edit: in place$/],
      ['edited', 'no', /^Edit: in place$/],
      ['reply', 'previous', /rendered anew \(reply_to/],
      ['text', 'wrap', /^Edit: in place$/],
      ['reactions', 'several', /^No edit$/],
      // * the reactions it got are no change of what it is made of: an edit after them changes it in place
      ['text', 'short', /^Edit: in place$/],
      ['reactions', 'one', /^No edit$/],
      ['reactions', 'none', /^No edit$/],
      // * a quoting reply, which a row of reactions makes wider: its quote stretches, its mark going with its end
      ['reply', 'quote', /rendered anew \(reply_to/],
      ['reactions', 'several', /^No edit$/],
      ['reactions', 'none', /^No edit$/],
      ['reply', 'none', /rendered anew \(reply_to/],
      // * a pin comes by its own way and shows in the time; buttons and a forward make the bubble anew
      ['pinned', 'yes', /^No edit$/],
      ['pinned', 'no', /^No edit$/],
      ['buttons', 'rows', /rendered anew \(reply_markup\)/],
      ['buttons', 'none', /rendered anew \(reply_markup\)/],
      ['forward', 'mine', /rendered anew \(fwd_from/],
      ['forward', 'none', /rendered anew \(fwd_from/]
    ];
    // * media is the chat's own (made up, it would not load): what the chat has of it, then none
    const media = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLButtonElement>('[aria-label="Media"] button'))
      .filter((button) => !button.disabled).map((button) => button.textContent.trim());
    });
    const mediaSteps = [['photo', 'Photo'], ['document', 'File']].filter(([, label]) => media.includes(label));
    if(mediaSteps.length) {
      // * a text as wide as a message gets in its group: the bubble it was is shown as it was, not laid out anew
      steps.push(['text', 'paragraph', /^Edit: in place$/]);
      for(const [option] of mediaSteps) steps.push(['media', option, /rendered anew \(media\)/]);
      if(mediaSteps[0][0] === 'photo') {
        // * a photo's caption goes and comes, its reactions going under the photo and back into it
        steps.push(
          ['media', 'photo', /rendered anew \(media\)/],
          ['reactions', 'several', /^No edit$/],
          ['text', 'none', /rendered anew \(hasBodyContent\)/],
          ['text', 'line', /rendered anew \(hasBodyContent\)/],
          ['reactions', 'none', /^No edit$/]
        );
      }
      steps.push(['media', 'none', /rendered anew \(media\)/]);
    }
    let previous = '';
    for(const [dimension, option, edit] of steps) {
      // * whether its background changes its size as it goes
      await page.evaluate(([dimension, option, mid]) => {
        const w = window as any;
        w.__morphed = false;
        w.__animated = false;
        w.__widths = undefined;
        w.__mark = false;
        w.__chips = 0;
        // * how wide a reply's quote was: a quoting one stretches with the bubble
        w.__replyWidth = document.querySelector(`#column-center .bubble[data-mid="${mid}"] .reply.quote-like-icon`)
        ?.getBoundingClientRect().width;
        const started = performance.now();
        // * the bubble as it was: one rendered anew is another one
        w.__stepBubble = document.querySelector(`#column-center .bubble[data-mid="${mid}"]`);
        // * the text as wide as it was laid out last, in the frame before its bubble was rendered anew: a code block may
        // * lay itself out again a while after its change, and what is rendered anew may come late (media to load)
        let width: number;
        const watch = () => {
          // * the picture of a bubble rendered anew as one of another kind: its text as wide as it was
          const ghost = document.querySelector('[class*="_ghost_"] .message');
          const text = document.querySelector(`#column-center .bubble[data-mid="${mid}"] .message`);
          if(ghost && width && !w.__widths) w.__widths = [width, ghost.getBoundingClientRect().width];
          else if(!ghost) width = text?.getBoundingClientRect().width;
          const bubble = document.querySelector(`#column-center .bubble[data-mid="${mid}"]`);
          if(bubble?.querySelector('[class*="_morphing_"]')) w.__morphed = true;
          if(bubble?.querySelector('[class*="_mark_"]')) w.__mark = true;
          // * the reactions that show, live or as pictures of them, as much as they show: none twice
          const shows = (element: Element) => {
            if(getComputedStyle(element).visibility !== 'visible' || !element.getClientRects().length) return false;
            let opacity = 1;
            for(let e = element; e && e !== bubble; e = e.parentElement) opacity *= +getComputedStyle(e).opacity;
            return opacity > .05;
          };
          // * (a picture of one is no reaction element, but has its class)
          w.__chips = Math.max(w.__chips, Array.from(bubble?.querySelectorAll('.reaction') || []).filter(shows).length);
          if(document.getAnimations().some((animation) => bubble?.contains((animation.effect as KeyframeEffect)?.target))) {
            w.__animated = true;
          }

          if(performance.now() - started < 1000) requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
        w.bubbleSandbox.apply({[dimension]: option});
      }, [dimension, option, mid] as const);
      // * shown — a bubble rendered anew comes a moment later (its media may take a while), as another bubble — and over:
      // * nothing of the change is left
      previous = await page.waitForFunction(([mid, previous, anew]) => {
        const bubble = document.querySelector(`#column-center .bubble[data-mid="${mid}"]`);
        if(!bubble || bubble.querySelector('[class*="_layer_"], [class*="_textCopy_"]')) return;
        if(anew && bubble === (window as any).__stepBubble) return;
        const shown = bubble.querySelector('.message')?.textContent || bubble.textContent;
        return shown !== previous && shown;
      }, [mid, dimension === 'text' ? previous : undefined, edit.source.includes('rendered anew')] as const, {timeout: 5000})
      .then((handle) => handle.jsonValue() as Promise<string>);
      expect(await page.evaluate(() => (window as any).bubbleSandbox.report()), `${dimension}: ${option}`).toMatch(edit);
      await page.waitForTimeout(400);
      // * reactions that come and go, and a bubble rendered anew (a reply got or lost, a big emoji and back), change
      // * it in sight too
      if(dimension === 'reactions' || edit.source.includes('rendered anew')) {
        expect(await page.evaluate(() => (window as any).__morphed), `${dimension}: ${option} is shown changing`).toBe(true);
      } else if(dimension === 'pinned') {
        expect(await page.evaluate(() => (window as any).__animated), `${dimension}: ${option} is shown changing`).toBe(true);
      }

      const widths: [number, number] = await page.evaluate(() => (window as any).__widths);
      if(widths) {
        expect(Math.abs(widths[0] - widths[1]), `${dimension}: ${option}: the old text as wide as it was`).toBeLessThan(1);
      }

      const {chips, mark, stretched} = await page.evaluate((mid) => {
        const w = window as any;
        const width = document.querySelector(`#column-center .bubble[data-mid="${mid}"] .reply.quote-like-icon`)
        ?.getBoundingClientRect().width;
        return {chips: w.__chips, mark: w.__mark, stretched: !!width && !!w.__replyWidth && Math.abs(width - w.__replyWidth) > 1};
      }, mid);
      expect(chips, `${dimension}: ${option}: no reaction shows twice`).toBeLessThanOrEqual(3);
      if(stretched) {
        expect(mark, `${dimension}: ${option}: the quote's mark goes with its end`).toBe(true);
      }
    }

    // * a reply's quote that reads "Loading" till what it quotes comes: it is shown changing into the one that came
    await page.evaluate(() => (window as any).bubbleSandbox.apply({text: 'short', reply: 'late'}));
    await page.waitForFunction((mid) => {
      return document.querySelector(`#column-center .bubble[data-mid="${mid}"] .reply`)?.textContent.includes('Loading');
    }, mid, {timeout: 5000});
    const came = await page.evaluate(async(mid) => {
      for(let i = 0; i < 300; ++i) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const bubble = document.querySelector(`#column-center .bubble[data-mid="${mid}"]`);
        if(!bubble.querySelector('.reply')?.textContent.includes('Loading')) {
          return !!bubble.querySelector('[class*="_quoteMorphing_"]');
        }
      }
    }, mid);
    expect(came, 'the quote that came stretches from the one that read "Loading"').toBe(true);
    await page.evaluate(() => (window as any).bubbleSandbox.apply({reply: 'none'}));

    await page.evaluate(() => (window as any).bubbleSandbox.close());
    // * a bubble still being rendered anew when it is put back is rendered once more, as the message is by then
    await page.waitForFunction(([mid, text]) => {
      return document.querySelector(`#column-center .bubble[data-mid="${mid}"] .message [data-message-text-source]`)?.textContent === text;
    }, [mid, text] as const, {timeout: 5000}).catch(() => {});
    const after = await page.waitForFunction((mid) => {
      const bubble = document.querySelector(`#column-center .bubble[data-mid="${mid}"]`);
      return bubble && !bubble.querySelector('[class*="_layer_"]') && !bubble.querySelector('.reply') && {
        text: bubble.querySelector('.message [data-message-text-source]')?.textContent,
        reactions: bubble.querySelectorAll('reaction-element').length,
        edited: /edited/i.test(bubble.querySelector('.time-inner')?.textContent),
        pinned: !!bubble.querySelector('.time-pinned'),
        buttons: !!bubble.parentElement.querySelector(`.bubble[data-mid="${mid}"] .reply-markup`),
        panel: !!(window as any).bubbleSandbox
      };
    }, mid, {timeout: 5000}).then((handle) => handle.jsonValue());
    expect(after, 'put back as it is').toEqual({text, reactions: 0, edited: false, pinned: false, buttons: false, panel: false});
    expect(errors.filter((error) => !/no sticker/.test(error))).toEqual([]);
  });
});
