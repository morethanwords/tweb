import {describe, expect, it, vi} from 'vitest';

vi.mock('@lib/rootScope', async() => {
  const {default: EventListenerBase} = await import('@helpers/eventListenerBase');
  return {default: new EventListenerBase()};
});
vi.mock('@helpers/mediaSizes', async() => {
  const {default: EventListenerBase} = await import('@helpers/eventListenerBase');
  return {default: new EventListenerBase()};
});
vi.mock('@helpers/animation', () => ({animate: () => {}}));
vi.mock('@helpers/liteMode', () => ({default: {isAvailable: () => false}}));
vi.mock('@helpers/canvas/shimmer', () => ({default: class {
  settings() {}
  on() {}
}}));
vi.mock('@helpers/dom/customProperties', () => ({default: {getProperty: () => '#fff'}}));

import EventListenerBase from '@helpers/eventListenerBase';
import DialogsPlaceholder from '@helpers/dialogsPlaceholder';
import rootScope from '@lib/rootScope';

type Events = {theme_changed: () => void};

describe('EventListenerBase dispatch', () => {
  it('does not run a listener that re-subscribes itself again in the same dispatch', () => {
    const emitter = new EventListenerBase<Events>();
    let calls = 0;
    // * capped, so a regression fails the test instead of freezing it
    const listener = () => {
      emitter.removeEventListener('theme_changed', listener);
      if(++calls < 100) emitter.addEventListener('theme_changed', listener);
    };
    emitter.addEventListener('theme_changed', listener);

    emitter.dispatchEvent('theme_changed');
    expect(calls).toBe(1);

    emitter.dispatchEvent('theme_changed');
    expect(calls).toBe(2);
  });

  it('runs a listener added during a dispatch only from the next one', () => {
    const emitter = new EventListenerBase<Events>();
    const added = vi.fn();
    emitter.addEventListener('theme_changed', () => emitter.addEventListener('theme_changed', added));

    emitter.dispatchEvent('theme_changed');
    expect(added).not.toHaveBeenCalled();

    emitter.dispatchEvent('theme_changed');
    expect(added).toHaveBeenCalledTimes(1);
  });

  it('skips a listener removed by an earlier one during the dispatch', () => {
    const emitter = new EventListenerBase<Events>();
    const removed = vi.fn();
    emitter.addEventListener('theme_changed', () => emitter.removeEventListener('theme_changed', removed));
    emitter.addEventListener('theme_changed', removed);

    emitter.dispatchEvent('theme_changed');
    expect(removed).not.toHaveBeenCalled();
  });
});

describe('DialogsPlaceholder', () => {
  const fakeContext = () => {
    const ctx: any = new Proxy({}, {
      get: (target: any, key) => key in target ? target[key] : (target[key] = vi.fn()),
      set: (target: any, key, value) => (target[key] = value, true)
    });
    return ctx;
  };

  it('redraws on a theme change without re-subscribing from inside the dispatch', () => {
    const contexts: any[] = [];
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
      const ctx = fakeContext();
      ctx.canvas = this;
      contexts.push(ctx);
      return ctx;
    } as any);

    try {
      const placeholder = new DialogsPlaceholder();
      const container = document.createElement('div');
      placeholder.attach({container, rect: {width: 300, height: 600}});

      const patterns = () => contexts.reduce((sum, ctx) => sum + (ctx.createPattern?.mock.calls.length ?? 0), 0);
      expect(patterns()).toBe(1);

      const add = vi.spyOn(rootScope, 'addEventListener');
      const remove = vi.spyOn(rootScope, 'removeEventListener');
      rootScope.dispatchEvent('theme_changed');
      expect(patterns()).toBe(2);
      expect(add).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();

      placeholder.remove();
      rootScope.dispatchEvent('theme_changed');
      expect(patterns()).toBe(2);
    } finally {
      getContext.mockRestore();
    }
  });
});
