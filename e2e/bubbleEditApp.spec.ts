import {expect, Page, test} from '@playwright/test';
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
