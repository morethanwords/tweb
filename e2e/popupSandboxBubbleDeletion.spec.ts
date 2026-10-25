import {expect} from '@playwright/test';
import {test} from './workerContext';
import {preparePopupSandbox} from './popupSandbox.helpers';

// The sandbox supplies the app's styles and modules without restoring an account. The fixture
// exercises the real deletion, grouping and scroll preservation against Chromium's animation clock.
for(const {name, targets, direction} of [
  {name: 'one bubble', targets: [18], direction: 'ltr'},
  {name: 'several bubbles together', targets: [20, 19, 18, 17, 16, 15], direction: 'rtl'}
]) {
  test(`deleting ${name} keeps the scrolled-up history still before paint`, async({page}) => {
    await preparePopupSandbox(page, false);
    const result = await page.evaluate(async({targets, direction}) => {
      const {default: ChatBubbles} = await window.e2eImport('/src/components/chat/bubbles.ts');
      const {default: Scrollable} = await window.e2eImport('/src/components/scrollable.ts');
      const {default: BubbleGroups} = await window.e2eImport('/src/components/chat/bubbleGroups.ts');
      const {getMiddleware} = await window.e2eImport('/src/helpers/middleware.ts');
      window.popupSandbox.setDirection(direction as 'ltr' | 'rtl');

      const wrap = document.createElement('div');
      wrap.className = 'chat';
      wrap.style.cssText = 'position:fixed;inset:0;width:650px;height:600px;z-index:99999;--chat-width:650px;--chat-bubbles-padding:0px;--chat-padding-top:72px;--chat-padding-bottom:64px';
      wrap.innerHTML = '<div class="bubbles" style="inset:0"><div class="scrollable scrollable-y bubbles-scrollable" style="position:absolute;inset:0;overflow:auto"><div class="bubbles-padding bubbles-padding-top" style="height:72px"></div><div class="bubbles-inner"><div class="bubbles-date-group"><div></div><div></div><div></div></div></div><div class="bubbles-padding bubbles-padding-bottom" style="height:64px"></div></div><div class="bubbles-remover-container"><div class="bubbles-inner bubbles-remover"></div></div></div>';
      document.body.append(wrap);
      const container = wrap.querySelector<HTMLElement>('.bubbles-scrollable');
      const inner = container.querySelector<HTMLElement>('.bubbles-inner');
      const dateContainer = {container: inner.querySelector('.bubbles-date-group'), groupsLength: 0};
      const middleware = getMiddleware();
      const chat: any = {type: 'chat', peerId: 1, isOutMessage: () => false};
      const scrollable = Object.assign(Object.create(Scrollable.prototype), {
        container,
        scrollPositionProperty: 'scrollTop',
        scrollSizeProperty: 'scrollHeight',
        onSizeChange() {}
      });
      const bubbles = chat.bubbles = Object.assign(Object.create(ChatBubbles.prototype), {
        chat,
        scrollable,
        chatInner: inner,
        remover: wrap.querySelector('.bubbles-remover'),
        bubbles: {},
        skippedMids: new Set(),
        hiddenLinksPendingBubbles: new Set(),
        changedMids: new Map(),
        findPendingBubbleReplacement() {},
        setTopPadding: () => ({}),
        getMiddleware: () => middleware.get(),
        getDateForDateContainer: () => ({dateTimestamp: 0}),
        getDateContainerByTimestamp: () => dateContainer,
        deleteEmptyDateGroups() {}
      });
      const groups = bubbles.bubbleGroups = new BubbleGroups(chat);
      const elements: HTMLElement[] = [];
      for(let i = 0; i < 40; ++i) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble is-in';
        bubble.style.cssText = 'height:80px;min-height:80px;margin:0';
        bubble.innerHTML = `<div class="bubble-content-wrapper">Message ${i}</div>`;
        bubble.dataset.mid = String(i + 1);
        bubble.dataset.peerId = '1';
        (bubble as any).middlewareHelper = {destroy() {}};
        elements.push(bubble);
        bubbles.bubbles['1_' + (i + 1)] = bubble;
        groups.prepareForGrouping(bubble, {
          _: 'message', id: i + 1, mid: i + 1, date: 1700000000 + i,
          peerId: 1, fromId: 1, pFlags: {}, message: `Message ${i}`
        }, false);
      }
      groups.mountUnmountGroups([...groups.groupUngrouped()]);
      container.scrollTop = 1200;
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await frame();
      await frame();

      const anchor = elements[21];
      const initialTop = anchor.getBoundingClientRect().top;
      const samples = [initialTop];
      for(const index of targets) bubbles.destroyBubble(elements[index], true);
      const placeholders = [...inner.querySelectorAll('.bubble-delete-placeholder')];
      const animations = placeholders.flatMap((element) => element.getAnimations());
      // rAF samples alone can see the previous layout and miss the jerk that is actually painted.
      // Observe after the application's observers, once Web Animations have laid out this frame.
      const observer = new ResizeObserver(() => samples.push(anchor.getBoundingClientRect().top));
      observer.observe(inner);
      await Promise.all(animations.map((animation) => animation.finished));
      await frame();
      samples.push(anchor.getBoundingClientRect().top);
      observer.disconnect();
      const result = {
        count: samples.length,
        drift: Math.max(...samples.map((top) => Math.abs(top - initialTop))),
        remaining: inner.querySelectorAll('.bubble').length,
        placeholders: inner.querySelectorAll('.bubble-delete-placeholder').length,
        removed: wrap.querySelector('.bubbles-remover').childElementCount
      };
      wrap.remove();
      middleware.destroy();
      return result;
    }, {targets, direction});

    expect(result.count).toBeGreaterThan(3);
    expect(result.drift).toBeLessThanOrEqual(1);
    expect(result.remaining).toBe(40 - targets.length);
    expect(result.placeholders).toBe(0);
    expect(result.removed).toBe(0);
  });
}
