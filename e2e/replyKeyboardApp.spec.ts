import {expect, Page, test} from '@playwright/test';
import {PNG} from 'pngjs';

/*
 * A bot's keyboard stands under the message field, .375rem below it, and the field goes up by as much -
 * the history with it, kept at its end. Past 15rem the keyboard scrolls. It is a part of the composer,
 * not a popup: a click in the history leaves it open, the button or Escape closes it.
 *
 * Nothing is sent: the keyboard is put into the tab's own history storage of Saved Messages, and its
 * buttons are never pressed. Like the other signed-in specs it runs against an authorized preview and
 * skips without one:
 *
 *   bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
 *   PLAYWRIGHT_BASE_URL=http://localhost:9001 npx playwright test e2e/replyKeyboardApp.spec.ts
 */

type Box = {top: number, bottom: number, height: number};

test.describe('the bot keyboard under the field', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'needs an authorized preview (PLAYWRIGHT_BASE_URL)');

  test.use({viewport: {width: 1280, height: 860}});

  test.beforeEach(async({page}) => {
    test.setTimeout(4 * 60_000);
    await openSavedMessages(page);
  });

  test.afterEach(async({page}) => {
    await setKeyboard(page, undefined).catch(() => {});
  });

  test('stands under the field and lifts it with the history, until the button or Escape closes it', async({page}) => {
    await setKeyboard(page, 3);
    const before = await measure(page);
    expect(before.keyboard.height).toBe(0);

    await page.locator('.chat-input-main .toggle-reply-markup').click();
    const opened = await settled(page);
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

    // * the keyboard takes the field's place at the bottom, and the field stands on it, .375rem above its first row
    expect(opened.keyboard.bottom).toBeCloseTo(before.field.bottom, 0);
    expect(opened.keyboard.top).toBeCloseTo(opened.field.bottom, 0);
    expect(opened.firstRow.top - opened.field.bottom).toBeCloseTo(.375 * rem, 0);
    expect(before.field.bottom - opened.field.bottom).toBeCloseTo(opened.keyboard.height, 0);
    // * the history goes up by as much, and stays at its end
    expect(opened.paddingBottom - before.paddingBottom).toBeCloseTo(opened.keyboard.height, 0);
    expect(opened.atEnd).toBe(true);
    // * all of it seen, it fades nowhere
    expect(opened.scroll.masked).toBe(false);
    // * its buttons are painted as the ones under a bubble, further apart, and all rounded alike
    expect(opened.button).toEqual(opened.bubbleButton);
    expect(opened.corners).toEqual({outer: [.625 * rem, .625 * rem, .625 * rem, .625 * rem], inner: .625 * rem});
    expect(opened.gaps.row).toBeCloseTo(.25 * rem, 0);
    expect(opened.gaps.button).toBeCloseTo(.25 * rem, 0);

    // * a click in the history is not a click away from a popup: it stays. Past the messages' column,
    // * where the history's wallpaper is and nothing a click would open
    const empty = await page.evaluate(() => {
      const {right} = (window as any).appImManager.chat.bubbles.chatInner.getBoundingClientRect();
      return {x: right + (innerWidth - right) / 2, y: innerHeight / 3};
    });
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(400);
    expect((await measure(page)).active).toBe(true);

    await page.keyboard.press('Escape');
    const closed = await settled(page);
    expect(closed.active).toBe(false);
    expect(closed.display).toBe('none');
    expect(closed.field.bottom).toBeCloseTo(before.field.bottom, 0);
    expect(closed.paddingBottom).toBeCloseTo(before.paddingBottom, 0);
    expect((await page.evaluate(() => (window as any).appImManager.chat.peerId))).toBeTruthy();

    // * and the button opens and closes it again
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(true);
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).field.bottom).toBeCloseTo(before.field.bottom, 0);
  });

  test('a single-use keyboard goes once a button of it is pressed, another stays for the next one', async({page}) => {
    // * a press sends nothing: the tab answers the send itself. Proved on a probe before any press, so a
    // * guard that does not hold fails the test instead of sending
    const guarded = await page.evaluate(async() => {
      const w = window as any;
      const proxy = w.apiManagerProxy;
      const invoke = proxy.invoke.bind(proxy);
      w.__sent = [];
      proxy.invoke = (type: string, payload: any, ack: boolean, ...rest: any[]) => {
        if(type === 'manager' && payload.method.startsWith('send')) {
          w.__sent.push(payload.method === 'sendText' ? payload.args[0].text : payload.method);
          return ack ? {cached: true, result: Promise.resolve()} : Promise.resolve();
        }

        return invoke(type, payload, ack, ...rest);
      };
      await w.appImManager.chat.input.managers.appMessagesManager.sendProbe().catch((): void => {});
      return w.__sent.splice(0);
    });
    expect(guarded).toEqual(['sendProbe']);

    for(const singleUse of [false, true]) {
      await setKeyboard(page, 2, {singleUse});
      await page.locator('.chat-input-main .toggle-reply-markup').click();
      expect((await settled(page)).active).toBe(true);
      await page.locator('.reply-keyboard .reply-markup-button').first().click();
      expect((await settled(page)).active).toBe(!singleUse);
      // * and a single-use one is remembered as closed: a contact or a place sent by it is no answer that marks it
      if(singleUse) expect(await page.evaluate(() => {
        const {chat} = (window as any).appImManager;
        return chat.appState.closedReplyKeyboards[chat.historyStorage.key];
      })).toBe(1);
      if(!singleUse) {
        await page.locator('.chat-input-main .toggle-reply-markup').click();
        expect((await settled(page)).active).toBe(false);
      }
    }

    expect(await page.evaluate(() => (window as any).__sent)).toEqual(['Row 1', 'Row 1']);
  });

  test('opens by itself when a keyboard comes, but not one the user closed or a single-use one answered', async({page}) => {
    await setKeyboard(page, 2, {mid: 101, comes: true});
    expect((await settled(page)).active).toBe(true);

    // * closed by the user, it stays closed when the chat hears of it again
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(false);
    await setKeyboard(page, 2, {mid: 101, comes: true});
    expect((await settled(page)).active).toBe(false);
    // * nor when the chat opens again: what its opening asks (`ChatInput.finishPeerChange`)
    await page.evaluate(() => (window as any).appImManager.chat.input.replyKeyboard.autoShow(false));
    expect((await settled(page)).active).toBe(false);

    // * another message's opens again, and the user's closing of the first is forgotten once they open it
    await setKeyboard(page, 2, {mid: 102, comes: true});
    expect((await settled(page)).active).toBe(true);
    await page.keyboard.press('Escape');
    expect((await settled(page)).active).toBe(false);
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(true);
    expect(await page.evaluate(() => {
      const {chat} = (window as any).appImManager;
      return chat.appState.closedReplyKeyboards[chat.historyStorage.key];
    })).toBeUndefined();
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(false);

    // * a single-use one already answered does not
    await setKeyboard(page, 2, {mid: 103, singleUse: true, hidden: true, comes: true});
    expect((await settled(page)).active).toBe(false);
  });

  test('takes no press once it is closing, nor leaves Escape to a chat whose dialog is gone', async({page}) => {
    await setKeyboard(page, 2);
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(true);
    // * on its way down, still laid out
    const closing = await page.evaluate(() => {
      const keyboard = (window as any).appImManager.chat.input.replyKeyboard;
      keyboard.toggle(false);
      const element = document.querySelector('.reply-keyboard');
      return {laidOut: element.classList.contains('is-shown'), pointerEvents: getComputedStyle(element).pointerEvents};
    });
    expect(closing).toEqual({laidOut: true, pointerEvents: 'none'});
    // * and asked to go at once meanwhile (another chat, the emoji panel in its place), it goes now
    const cut = await page.evaluate(() => {
      const input = (window as any).appImManager.chat.input;
      input.replyKeyboard.toggle(false, false, false);
      return {laidOut: document.querySelector('.reply-keyboard').classList.contains('is-shown'), moving: input.chatInput.getAnimations().length};
    });
    expect(cut).toEqual({laidOut: false, moving: 0});
    expect((await settled(page)).active).toBe(false);

    // * open again, and the dialog deleted (the chat stays, with no peer)
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(true);
    await page.evaluate(() => (window as any).appImManager.setPeer({isDeleting: true}));
    await expect.poll(() => page.evaluate(() => {
      const w = window as any;
      return {
        active: w.appImManager.chat.input.replyKeyboard.isActive(),
        dismissals: w.appNavigationController.navigations.filter((item: any) => item.type === 'dropdown').length
      };
    })).toEqual({active: false, dismissals: 0});
  });

  test('gives its place under the field to the emoji panel at once', async({page}) => {
    // * short enough for the emoji panel to stand under the field (`is-under`)
    await page.setViewportSize({width: 1280, height: 520});
    await setKeyboard(page, 2);
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(true);
    const handOff = await page.evaluate(async() => {
      const input = (window as any).appImManager.chat.input;
      await input.emoticonsDropdown.toggle(true);
      return {
        under: input.emoticonsDropdown.getElement().classList.contains('is-under'),
        keyboardLaidOut: input.chatInput.querySelector('.reply-keyboard').classList.contains('is-shown')
      };
    });
    expect(handOff).toEqual({under: true, keyboardLaidOut: false});
    // * and has it back once the panel is closed
    await page.evaluate(() => (window as any).appImManager.chat.input.emoticonsDropdown.toggle(false));
    expect((await settled(page)).active).toBe(true);

    // * one open over the field, which the window's size then moves under it
    await page.setViewportSize({width: 1280, height: 860});
    await page.evaluate(() => (window as any).appImManager.chat.input.emoticonsDropdown.toggle(true));
    expect((await settled(page)).active).toBe(true);
    await page.setViewportSize({width: 1280, height: 520});
    expect((await settled(page)).active).toBe(false);
    await page.evaluate(() => (window as any).appImManager.chat.input.emoticonsDropdown.toggle(false));
    expect((await settled(page)).active).toBe(true);

    // * closed, and the panel opened as it still goes down: out of its place at once all the same
    const cut = await page.evaluate(async() => {
      const input = (window as any).appImManager.chat.input;
      input.replyKeyboard.toggle(false);
      await input.emoticonsDropdown.toggle(true);
      return {
        keyboardLaidOut: input.chatInput.querySelector('.reply-keyboard').classList.contains('is-shown'),
        moving: input.chatInput.getAnimations().length
      };
    });
    expect(cut).toEqual({keyboardLaidOut: false, moving: 0});
  });

  test('a keyboard that comes while the emoji panel is open waits for it to close', async({page}) => {
    await setKeyboard(page, 2, {mid: 401});
    await page.evaluate(() => (window as any).appImManager.chat.input.emoticonsDropdown.toggle(true));
    await setKeyboard(page, 2, {mid: 402, comes: true});
    const meanwhile = await settled(page);
    expect(meanwhile.active).toBe(false);
    expect(await page.evaluate(() => (window as any).appImManager.chat.input.emoticonsDropdown.isActive())).toBe(true);
    await page.evaluate(() => (window as any).appImManager.chat.input.emoticonsDropdown.toggle(false));
    expect((await settled(page)).active).toBe(true);
  });

  test('gives way to a selection of messages and comes back once it is cancelled', async({page}) => {
    // * one the user opened, though it would not open by itself (answered): what was open comes back
    await setKeyboard(page, 2, {singleUse: true, hidden: true});
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(true);
    await page.evaluate(async() => {
      const chat = (window as any).appImManager.chat;
      const bubbles = chat.bubbles.chatInner.querySelectorAll('.bubble[data-mid]');
      await chat.selection.toggleByElement(bubbles[bubbles.length - 1]);
    });
    expect((await settled(page)).active).toBe(false);
    await page.evaluate(() => (window as any).appImManager.chat.selection.cancelSelection());
    expect((await settled(page)).active).toBe(true);
  });

  test('what the field gave way to, however it overlaps, gives back the keyboard it is to show', async({page}) => {
    const select = (on: boolean) => page.evaluate(async(on) => {
      const chat = (window as any).appImManager.chat;
      if(!on) return chat.selection.cancelSelection();
      const bubbles = chat.bubbles.chatInner.querySelectorAll('.bubble[data-mid]');
      await chat.selection.toggleByElement(bubbles[bubbles.length - 1]);
    }, on);
    const expand = (on: boolean, animate = false) => page.evaluate(([on, animate]) => {
      const input = (window as any).appImManager.chat.input;
      input.setMessageInputExpanded(on, animate);
      return {
        expanded: input.isRichMessageEditorExpanded() as boolean,
        resizing: input.chatInput.classList.contains('is-message-input-resizing') as boolean,
        keyboard: input.replyKeyboard.isActive() as boolean
      };
    }, [on, animate] as const);

    // * one that comes while the messages are selected opens once they are not
    await setKeyboard(page, 2, {mid: 501});
    await select(true);
    await setKeyboard(page, 2, {mid: 502, comes: true});
    expect((await settled(page)).active).toBe(false);
    await select(false);
    expect((await settled(page)).active).toBe(true);

    // * one taken by the expanded editor and then a selection is back once both are over, not before
    expect((await expand(true)).expanded).toBe(true);
    expect((await settled(page)).active).toBe(false);
    await select(true);
    await select(false);
    expect((await settled(page)).active).toBe(false);
    // * collapsed as the button does it, the field shrinking back first: the keyboard comes after, not under it
    expect(await expand(false, true)).toEqual({expanded: false, resizing: true, keyboard: false});
    expect((await settled(page)).active).toBe(true);

    // * and not one used up meanwhile (answered from another device)
    await setKeyboard(page, 2, {singleUse: true, mid: 503, comes: true});
    expect((await settled(page)).active).toBe(true);
    await select(true);
    await setKeyboard(page, 2, {singleUse: true, hidden: true, mid: 503, comes: true});
    await select(false);
    expect((await settled(page)).active).toBe(false);
  });

  test('a keyboard the user reopened once used up stays open as the chat hears of keyboards', async({page}) => {
    // * come used up already (answered): it does not open by itself, the user opens it
    await setKeyboard(page, 2, {singleUse: true, hidden: true, mid: 601, comes: true});
    expect((await settled(page)).active).toBe(false);
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(true);
    // * the chat told of its keyboards again (another topic's came, say): this one is no more used up than it was
    await setKeyboard(page, 2, {singleUse: true, hidden: true, mid: 601, comes: true});
    expect((await settled(page)).active).toBe(true);
  });

  test('a keyboard that comes as the emoji panel under the field goes takes its place only once it is out', async({page}) => {
    await page.setViewportSize({width: 1280, height: 520});
    await setKeyboard(page, 2, {mid: 701});
    await page.evaluate(() => (window as any).appImManager.chat.input.emoticonsDropdown.toggle(true));
    await setKeyboard(page, 2, {mid: 702, comes: true});
    // * the panel closes, still laid out while it fades; the keyboard comes up in that time
    const meanwhile = await page.evaluate(async() => {
      const input = (window as any).appImManager.chat.input;
      input.emoticonsDropdown.toggle(false);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {keyboard: input.replyKeyboard.isActive(), panelLaidOut: input.emoticonsDropdown.getElement().style.display !== 'none'};
    });
    expect(meanwhile).toEqual({keyboard: true, panelLaidOut: false});
  });

  test('closed with text in the field, it gives focus to the field, its button gone with it', async({page}) => {
    // * the keyboard and focus layer
    await openSavedMessages(page, '&a11y=1');
    // * the field's text sends nothing and saves no draft: the tab answers its writes itself
    await page.evaluate(() => {
      const w = window as any;
      const proxy = w.apiManagerProxy;
      const invoke = proxy.invoke.bind(proxy);
      proxy.invoke = (type: string, payload: any, ack: boolean, ...rest: any[]) => {
        if(type === 'manager' && /^(send|saveDraft|setDraft|clearDraft|syncDraft|read)/.test(payload.method)) {
          return ack ? {cached: true, result: Promise.resolve()} : Promise.resolve();
        }

        return invoke(type, payload, ack, ...rest);
      };
    });
    await setKeyboard(page, 2);
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(true);
    await page.evaluate(() => (window as any).appImManager.chat.input.setInputValue('Some text'));
    await page.locator('.reply-keyboard .reply-markup-button').first().focus();
    await page.keyboard.press('Escape');
    expect((await settled(page)).active).toBe(false);
    expect(await page.evaluate(() => {
      const input = (window as any).appImManager.chat.input;
      return {
        button: input.chatInput.querySelector('.toggle-reply-markup').classList.contains('show'),
        focusInField: input.messageInput.contains(document.activeElement)
      };
    })).toEqual({button: false, focusInField: true});
  });

  test('a keyboard that came behind the chat list on a phone opens once the window shows the chat beside it', async({page}) => {
    await setKeyboard(page, 2, {mid: 801});
    // * a phone's width, the chat list in front
    await page.setViewportSize({width: 400, height: 800});
    await page.evaluate(() => (window as any).appImManager.selectTab(0));
    await setKeyboard(page, 2, {mid: 802, comes: true});
    expect((await settled(page)).active).toBe(false);
    // * a desktop's: the chat beside the list, no change of chat or column on the way
    await page.setViewportSize({width: 1280, height: 860});
    expect((await settled(page)).active).toBe(true);
  });

  test('a keyboard that comes as the chat opens does not open over the draft on its way back', async({page}) => {
    // * the chat opened again with a saved draft, which the worker answers late; nothing is saved or sent
    await page.evaluate(() => {
      const w = window as any;
      const proxy = w.apiManagerProxy;
      const invoke = proxy.invoke.bind(proxy);
      proxy.invoke = (type: string, payload: any, ack: boolean, ...rest: any[]) => {
        if(type === 'manager' && /^(send|saveDraft|setDraft|clearDraft|syncDraft|read)/.test(payload.method)) {
          return ack ? {cached: true, result: Promise.resolve()} : Promise.resolve();
        }

        if(type === 'manager' && payload.method === 'getDraft') {
          const draft = {_: 'draftMessage', pFlags: {}, message: 'A saved draft', date: Math.floor(Date.now() / 1000)};
          const result = new Promise((resolve) => setTimeout(() => resolve(draft), 300));
          return ack ? {cached: false, result} : result;
        }

        return invoke(type, payload, ack, ...rest);
      };
      w.appImManager.setPeer({peerId: 0});
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const w = window as any;
      w.appImManager.setPeer({peerId: w.rootScope.myId});
    });
    // * the draft on its way: a keyboard comes
    await page.waitForFunction(() => !!(window as any).appImManager.chat.input.draftRestoring, null, {timeout: 10_000});
    await setKeyboard(page, 2, {mid: 901, comes: true});
    await page.waitForFunction(() => !(window as any).appImManager.chat.input.draftRestoring, null, {timeout: 10_000});
    const opened = await settled(page);
    expect(opened.active).toBe(false);
    expect(await page.evaluate(() => (window as any).appImManager.chat.input.messageInput.textContent)).toContain('A saved draft');
  });

  test('a keyboard that comes while a message\'s menu is open opens once Escape has closed the menu', async({page}) => {
    await setKeyboard(page, 2, {mid: 1001});
    const bubble = page.locator('.bubbles-inner .bubble[data-mid] .bubble-content').last();
    await bubble.click({button: 'right'});
    await expect.poll(() => page.evaluate(() => !!document.querySelector('.btn-menu.active, .contextmenu.active'))).toBe(true);
    await setKeyboard(page, 2, {mid: 1002, comes: true});
    expect((await settled(page)).active).toBe(false);
    // * Escape is the menu's
    await page.keyboard.press('Escape');
    expect((await settled(page)).active).toBe(true);
  });

  test('a keyboard that comes under a popup opens once the popup is gone', async({page}) => {
    await setKeyboard(page, 2, {mid: 301});
    const dismissals = () => page.evaluate(() => {
      return (window as any).appNavigationController.navigations.filter((item: any) => item.type === 'dropdown').length;
    });
    // * a popup over the chat, as every popup marks itself (`overlayCounter`): its focus and Escape are its own
    await page.evaluate(() => (window as any).overlayCounter.isOverlayActive = true);
    await setKeyboard(page, 2, {mid: 302, comes: true});
    expect((await settled(page)).active).toBe(false);
    expect(await dismissals()).toBe(0);
    await page.evaluate(() => (window as any).overlayCounter.isOverlayActive = false);
    expect((await settled(page)).active).toBe(true);
    expect(await dismissals()).toBe(1);
  });

  test('a single-use keyboard goes once the user answers it with a message of their own', async({page}) => {
    await setKeyboard(page, 2, {singleUse: true, mid: 201, comes: true});
    expect((await settled(page)).active).toBe(true);
    // * what a typed message makes of it (`AppMessagesManager.mergeReplyKeyboard`): answered; its button stays
    await setKeyboard(page, 2, {singleUse: true, hidden: true, mid: 201, comes: true});
    expect((await settled(page)).active).toBe(false);
    await expect(page.locator('.chat-input-main .toggle-reply-markup')).toHaveClass(/\bshow\b/);
  });

  test('goes up and down without laying the chat out on the way', async({page}) => {
    // * the field and the keyboard are moved by the compositor and the history scrolled: a layout as it starts and
    // * one as it ends, not one a frame (a history laid out every frame was 17 or more a way)
    await setKeyboard(page, 3);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const layouts = async() => {
      const {metrics} = await cdp.send('Performance.getMetrics');
      return metrics.find(({name}) => name === 'LayoutCount').value;
    };

    // * the first way also builds the keyboard and lays it out for the first time: the ways after it are measured
    for(const [open, counted] of [[true, false], [false, false], [true, true], [false, true]]) {
      // * a click by its place, read before: an action of Playwright's lays out to find the element
      const {x, y} = await page.evaluate(() => {
        const rect = document.querySelector('.chat-input-main .toggle-reply-markup').getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
      });
      // * the chat at rest first: what its messages still load lays it out too
      if(counted) await expect.poll(async() => {
        const before = await layouts();
        await page.waitForTimeout(700);
        return await layouts() - before;
      }, {timeout: 30_000}).toBe(0);
      const before = await layouts();
      await page.mouse.click(x, y);
      await page.waitForTimeout(700);
      if(counted) expect(await layouts() - before).toBeLessThanOrEqual(5);
      expect((await settled(page)).active).toBe(open);
    }
  });

  test('the field and the history go together while the page is busy', async({page}) => {
    // * the compositor moves both: with the main thread held all the way, the frames shown still move the field, and
    // * the last message as far above it as ever (a history scrolled by the main thread stood still meanwhile, and
    // * the field went over it)
    await setKeyboard(page, 3);
    await page.waitForFunction(() => (window as any).appImManager.chat.bubbles.chatInner.querySelector('.bubble'), null, {timeout: 60_000});
    // * a mark on each, of colours nothing else has, for the frames to be read by
    await page.evaluate(() => {
      const chat = (window as any).appImManager.chat;
      const bubbles = chat.bubbles.chatInner.querySelectorAll('.bubble');
      const marks: [Element, string][] = [[chat.input.inputContainer, '#f0f'], [bubbles[bubbles.length - 1], '#0ff']];
      for(const [element, color] of marks) {
        const mark = document.createElement('div');
        mark.className = 'e2e-mark';
        mark.style.cssText = `position: absolute; top: 0; left: 0; width: 6px; height: 6px; background: ${color}; z-index: 1000`;
        element.append(mark);
      }
    });

    const cdp = await page.context().newCDPSession(page);
    const frames: Buffer[] = [];
    cdp.on('Page.screencastFrame', ({data, sessionId}) => {
      frames.push(Buffer.from(data, 'base64'));
      cdp.send('Page.screencastFrameAck', {sessionId}).catch(() => {});
    });
    const tops = (png: PNG) => {
      const found = {field: -1, message: -1};
      for(let i = 0; i < png.data.length && (found.field < 0 || found.message < 0); i += 4) {
        const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
        const y = Math.floor(i / 4 / png.width);
        if(found.field < 0 && r > 240 && g < 15 && b > 240) found.field = y;
        if(found.message < 0 && r < 15 && g > 240 && b > 240) found.message = y;
      }
      return found;
    };

    for(const open of [true, false]) {
      const rest = tops(PNG.sync.read(await page.screenshot()));
      expect(rest.field).toBeGreaterThan(0);
      expect(rest.message).toBeGreaterThan(0);
      frames.length = 0;
      await cdp.send('Page.startScreencast', {format: 'png', everyNthFrame: 1});
      await page.evaluate(async(open) => {
        const chat = (window as any).appImManager.chat;
        await chat.input.replyKeyboard.toggle(open);
        const animations = [...chat.bubbles.chatInner.getAnimations(), ...chat.input.chatInput.getAnimations()];
        await Promise.all(animations.map((animation: Animation) => animation.ready));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        // * longer than the way
        const end = performance.now() + 600;
        while(performance.now() < end);
      }, open);
      await page.waitForTimeout(300);
      await cdp.send('Page.stopScreencast');

      const seen = frames.map((frame) => tops(PNG.sync.read(frame))).filter(({field, message}) => field > 0 && message > 0);
      const ends = await page.evaluate(() => (window as any).appImManager.chat.input.replyKeyboard.isActive());
      expect(ends).toBe(open);
      const last = seen[seen.length - 1];
      const between = new Set(seen.map(({field}) => field).filter((field) => field !== rest.field && field !== last.field));
      expect(between.size).toBeGreaterThanOrEqual(2);
      for(const {field, message} of seen) {
        expect(Math.abs((field - message) - (rest.field - rest.message))).toBeLessThanOrEqual(2);
      }
    }
  });

  test('a keyboard that changes on the way up is the one the field and the history end up standing on', async({page}) => {
    await setKeyboard(page, 2);
    const before = await measure(page);
    // * another, taller one comes as the field goes up: laid out while it still goes
    const sliding = await page.evaluate(async() => {
      const chat = (window as any).appImManager.chat;
      const keyboard = chat.input.replyKeyboard;
      await keyboard.toggle(true);
      // * the store and its setter, the app's own (`historyStorages`)
      const [store, set] = Object.values((window as any).historyStorages).find(([candidate]: any) => candidate === chat.historyStorage) as [any, (key: string, value: any) => void];
      const button = (text: string) => ({_: 'keyboardButton', text, type: {_: 'buttonTypeDefault'}});
      set('replyMarkup', {
        ...store.replyMarkup,
        mid: 2,
        rows: Array.from({length: 6}, (_, i) => ({_: 'keyboardButtonRow', buttons: [button(`Row ${i + 1}`)]}))
      });
      await keyboard.render();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      // * the field's way, still going
      return chat.input.chatInput.getAnimations().length > 0;
    });
    expect(sliding).toBe(true);
    const opened = await settled(page);
    expect(await page.locator('.reply-keyboard .reply-markup-row').count()).toBe(6);
    expect(before.field.bottom - opened.field.bottom).toBeCloseTo(opened.keyboard.height, 0);
    expect(opened.paddingBottom - before.paddingBottom).toBeCloseTo(opened.keyboard.height, 0);
  });

  test('leaves the emoji panel over the field room under the topbar', async({page}) => {
    // * tall enough for the panel to stand over the field, low enough for the keyboard to take its room
    await page.setViewportSize({width: 1280, height: 600});
    await setKeyboard(page, 12);
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    expect((await settled(page)).active).toBe(true);
    const panel = await page.evaluate(async() => {
      const chat = (window as any).appImManager.chat;
      await chat.input.emoticonsDropdown.toggle(true);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const element = chat.input.emoticonsDropdown.getElement();
      return {
        under: element.classList.contains('is-under'),
        top: element.getBoundingClientRect().top,
        topbarBottom: chat.topbar.container.getBoundingClientRect().bottom
      };
    });
    expect(panel.under).toBe(false);
    expect(panel.top).toBeGreaterThanOrEqual(panel.topbarBottom);
  });

  test('keeps the field it lifts clear of the topbar on a short screen', async({page}) => {
    await page.setViewportSize({width: 1280, height: 320});
    await setKeyboard(page, 12);
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    const opened = await settled(page);
    const topbarBottom = await page.evaluate(() => (window as any).appImManager.chat.topbar.container.getBoundingClientRect().bottom);
    expect(opened.field.top).toBeGreaterThanOrEqual(topbarBottom);
    expect(opened.scroll.scrollHeight).toBeGreaterThan(opened.scroll.clientHeight);

    // * and is as much shorter as the input grows (a reply above it, lines of text): told as the input tells the chat
    await page.evaluate(() => (window as any).appImManager.chat.updateChatInputHeight(48));
    const grown = await settled(page);
    expect(opened.scroll.clientHeight - grown.scroll.clientHeight).toBeCloseTo(48, 0);
  });

  test('scrolls past 15rem', async({page}) => {
    await setKeyboard(page, 12);
    await page.locator('.chat-input-main .toggle-reply-markup').click();
    const opened = await settled(page);
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(opened.scroll.clientHeight).toBeCloseTo(15 * rem, 0);
    expect(opened.scroll.scrollHeight).toBeGreaterThan(opened.scroll.clientHeight);
    expect(opened.keyboard.height).toBeCloseTo(15.375 * rem, 0);

    // * and fades out where it goes on: at the bottom first, at the top once scrolled to its end
    const fades = () => page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.reply-keyboard-scrollable'));
      return ['--reply-keyboard-fade-top', '--reply-keyboard-fade-bottom'].map((name) => parseFloat(style.getPropertyValue(name)));
    });
    await expect.poll(fades).toEqual([0, 1.5 * rem]);
    await page.evaluate(() => {
      const scroller = document.querySelector('.reply-keyboard-scrollable');
      scroller.scrollTop = scroller.scrollHeight;
    });
    await expect.poll(fades).toEqual([1.5 * rem, 0]);
  });
});

async function openSavedMessages(page: Page, query = '') {
  await page.goto('/?noSharedWorker=1' + query);
  await page.waitForFunction(() => document.querySelectorAll('.chatlist-chat').length > 0, null, {timeout: 180_000});
  // * the app's own instances, which it puts on the window: a bundled preview has no module of its sources to import
  await page.evaluate(() => {
    const w = window as any;
    w.appImManager.setPeer({peerId: w.rootScope.myId});
  });
  await page.waitForFunction(() => {
    const chat = (window as any).appImManager.chat;
    return chat.peerId && !chat.setPeerPromise && document.body.classList.contains('has-chat');
  }, null, {timeout: 30_000});
  await page.waitForTimeout(500);
}

type KeyboardOptions = {
  singleUse?: boolean,
  // * a single-use one answered already
  hidden?: boolean,
  // * the message that brought it
  mid?: number,
  // * as a keyboard that comes: the chat is told, as the worker tells it
  comes?: boolean
};

// * the keyboard a bot's last message would have left in the chat, `rows` rows of it (none: what there was, and the
// * user's closing of it forgotten)
async function setKeyboard(page: Page, rows: number, options: KeyboardOptions = {}) {
  await page.evaluate(async([rows, {singleUse, hidden, mid = 1, comes}]) => {
    const chat = (window as any).appImManager.chat;
    // * the store and its setter, the app's own (`historyStorages`)
    const [, setStore] = Object.values((window as any).historyStorages).find(([candidate]: any) => candidate === chat.historyStorage) as [any, (key: string, value: any) => void];

    const keyboard = chat.input.replyKeyboard;
    if(!rows) {
      await keyboard.toggle(false);
      setStore('replyMarkup', undefined);
      await keyboard.checkAvailability();
      chat.setAppState('closedReplyKeyboards', chat.historyStorage.key, undefined);
      return;
    }

    const button = (text: string) => ({_: 'keyboardButton', text, type: {_: 'buttonTypeDefault'}});
    setStore('replyMarkup', {
      _: 'replyKeyboardMarkup',
      pFlags: {...(singleUse && {single_use: true}), ...(hidden && {hidden: true})},
      mid,
      fromId: chat.peerId,
      rows: Array.from({length: rows}, (_, i) => ({
        _: 'keyboardButtonRow',
        buttons: i % 2 ? [button(`Row ${i + 1}`), button('Beside')] : [button(`Row ${i + 1}`)]
      }))
    });
    if(comes) {
      (window as any).rootScope.dispatchEventSingle('history_reply_markup', {peerId: chat.peerId});
    } else {
      await keyboard.checkAvailability();
    }
  }, [rows, options] as const);
}

// * the same twice over, and nothing of the field or the history moving: a way that has not started yet (a busy machine
// * holds its first frame) measures the same too
async function settled(page: Page) {
  let last: string;
  await expect.poll(async() => {
    const moving = await page.evaluate(() => {
      const chat = (window as any).appImManager.chat;
      return chat.input.chatInput.getAnimations().length + chat.bubbles.chatInner.getAnimations().length;
    });
    const now = JSON.stringify(await measure(page));
    const same = !moving && now === last;
    last = now;
    return same;
  }, {intervals: [150]}).toBe(true);
  return JSON.parse(last) as Awaited<ReturnType<typeof measure>>;
}

function measure(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element): Box => {
      const {top, bottom, height} = element.getBoundingClientRect();
      return {top, bottom, height};
    };
    const chat = (window as any).appImManager.chat;
    const keyboard = chat.input.chatInput.querySelector('.reply-keyboard') as HTMLElement;
    const scroll = keyboard.querySelector('.reply-keyboard-scrollable') as HTMLElement;
    const button = keyboard.querySelector('.reply-markup-button');
    const rows = keyboard.querySelectorAll('.reply-markup-row');
    const radiusOf = (element: Element, corner: 'borderStartStartRadius' | 'borderStartEndRadius' | 'borderEndStartRadius' | 'borderEndEndRadius') => {
      return parseFloat(getComputedStyle(element)[corner]);
    };
    const paint = (element: Element) => {
      const style = getComputedStyle(element);
      return {background: style.backgroundColor, color: style.color};
    };
    // * a button under a bubble, for what the keyboard's should look like
    const probe = document.createElement('div');
    probe.className = 'bubble';
    probe.innerHTML = '<div class="reply-markup"><div class="reply-markup-row"><button class="reply-markup-button"></button></div></div>';
    chat.bubbles.chatInner.append(probe);
    const bubbleButton = paint(probe.querySelector('.reply-markup-button'));
    probe.remove();
    return {
      active: chat.input.replyKeyboard.isActive() as boolean,
      display: getComputedStyle(keyboard).display,
      field: box(chat.input.inputContainer),
      keyboard: box(keyboard),
      firstRow: box(keyboard.querySelector('.reply-markup-row') || keyboard),
      // * there once it is first shown
      scroll: scroll && {clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight, masked: getComputedStyle(scroll).maskImage !== 'none'},
      paddingBottom: chat.bubbles.paddingBottom.getBoundingClientRect().height,
      atEnd: chat.bubbles.scrollable.isScrolledToEnd as boolean,
      button: button ? paint(button) : undefined,
      bubbleButton,
      // * the outer corners of the buttons in its corners (start-start, start-end, end-start, end-end), and an inner
      // * one: the first row's button's under it
      corners: rows.length ? {
        outer: [
          radiusOf(rows[0].firstElementChild, 'borderStartStartRadius'),
          radiusOf(rows[0].lastElementChild, 'borderStartEndRadius'),
          radiusOf(rows[rows.length - 1].firstElementChild, 'borderEndStartRadius'),
          radiusOf(rows[rows.length - 1].lastElementChild, 'borderEndEndRadius')
        ],
        inner: radiusOf(rows[0].firstElementChild, 'borderEndStartRadius')
      } : undefined,
      gaps: rows.length > 1 ? {
        row: rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom,
        // * the second row has two (`setKeyboard`)
        button: Math.abs(rows[1].lastElementChild.getBoundingClientRect().left - rows[1].firstElementChild.getBoundingClientRect().right)
      } : undefined
    };
  });
}
