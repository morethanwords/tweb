import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const observers = vi.hoisted(() => [] as {callback: (entries: any[]) => void, disconnected: boolean}[]);

import {stageInChat} from '@components/widgetSandbox/staging';

/**
 * Where a widget runs its first task while its bubble is not in the chat yet: a layer of the chat's, laid out at the
 * width its scrollable reports. A chat taken out of the page before that report never makes it: a start let go then lets
 * go of the layer and its observer, which would otherwise keep the chat and the bubble.
 */
describe('the staging layer of a chat', () => {
  let chat: any, block: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      private entry: typeof observers[number];
      constructor(callback: (entries: any[]) => void) {
        observers.push(this.entry = {callback, disconnected: false});
      }

      observe() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    });

    const container = document.createElement('div');
    const scrollable = document.createElement('div');
    container.append(scrollable);
    document.body.append(container);
    chat = {bubbles: {container, scrollable: {container: scrollable}, chatInner: {className: 'bubbles-inner'}}};
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    block = document.createElement('div');
    bubble.append(block);
  });

  afterEach(() => {
    observers.length = 0;
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('is let go with a start let go before the chat\'s scrollable has a width', async() => {
    let cancel: () => void;
    const cancelled = new Promise<void>((resolve) => cancel = resolve);
    const staged = stageInChat(chat, block, undefined, cancelled);
    expect(chat.bubbles.container.childElementCount).toBe(2);
    // * the chat goes: no width will come
    chat.bubbles.container.remove();
    cancel();
    expect(await staged).toBeUndefined();
    expect(observers[0].disconnected).toBe(true);
    expect(chat.bubbles.container.childElementCount).toBe(1);
  });

  it('stages once the width comes, and goes with the last copy', async() => {
    const staged = stageInChat(chat, block, undefined, new Promise(() => {}));
    observers[0].callback([{contentRect: {width: 300}}]);
    const stage = await staged;
    expect(stage.container).toBeDefined();
    stage.dispose();
    expect(observers[0].disconnected).toBe(true);
    expect(chat.bubbles.container.childElementCount).toBe(1);
  });
});
