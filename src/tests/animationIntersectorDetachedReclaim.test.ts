import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({
  observe: undefined as (entries: any[]) => void,
  observed: new Set<Element>(),
  idle: false,
  appSettings: {stickers: {loop: true}} as any
}));

vi.mock('@config/debug', () => ({MOUNT_CLASS_TO: undefined, DEBUG: false}));
vi.mock('@stores/appSettings', () => ({useAppSettings: () => [state.appSettings]}));
vi.mock('@helpers/idleController', () => ({default: {
  get isIdle() { return state.idle; },
  addEventListener: vi.fn()
}}));
vi.mock('@helpers/appWindow', () => ({
  onAppWindowChange: vi.fn(),
  getAppWindow: () => ({IntersectionObserver: class {
    constructor(callback: typeof state.observe) { state.observe = callback; }
    observe(el: Element) { state.observed.add(el); }
    unobserve(el: Element) { state.observed.delete(el); }
    disconnect() { state.observed.clear(); }
  }})
}));

import animationIntersector from '@components/animationIntersector';

const makeAnimation = () => ({
  remove: vi.fn(),
  clearCacheWhenSafe: vi.fn(),
  paused: true,
  pause: vi.fn(),
  play: vi.fn(),
  autoplay: true,
  loop: true
}) as any;

const add = (el: HTMLElement, animation: any) => animationIntersector.addAnimation({
  animation,
  group: '',
  observeElement: el,
  type: 'lottie'
});

// a real observer only reports elements it is observing
const intersect = (el: HTMLElement, isIntersecting: boolean) => {
  if(state.observed.has(el)) {
    state.observe([{target: el, isIntersecting}]);
  }
};

// An auth card under <Transition mode="outin"> runs its onMount - and loads its stickers - while the
// outgoing card is still leaving, so the player is registered against a DETACHED element. The
// observer reports that element as "not intersecting" straight away; reclaiming there destroyed the
// sticker before it was ever inserted (blank monkey on the code/password card until a reload).
describe('animationIntersector out-of-DOM reclaim', () => {
  let el: HTMLElement;
  let animation: any;

  const isRegistered = () => !!animationIntersector.getAnimations(el).length;

  beforeEach(() => {
    document.body.replaceChildren();
    state.observed.clear();
    el = document.createElement('div');
    animation = makeAnimation();
  });

  it('keeps an animation that has not been inserted yet', () => {
    add(el, animation);
    intersect(el, false); // observer's first report for the detached subtree

    expect(animation.remove).not.toHaveBeenCalled();
    expect(isRegistered()).toBe(true);

    document.body.append(el); // the transition finally swaps the card in
    intersect(el, true);

    expect(animation.play).toHaveBeenCalled();
    expect(isRegistered()).toBe(true);
  });

  it('reclaims an animation whose element left the DOM', () => {
    document.body.append(el);
    add(el, animation);
    intersect(el, true);

    el.remove();
    intersect(el, false);

    expect(animation.remove).toHaveBeenCalled();
    expect(isRegistered()).toBe(false);
  });

  // the observer reports a detached element once and then goes quiet, so the deadline runs on a timer
  it('reclaims a never-inserted animation on its own deadline', () => {
    vi.useFakeTimers();
    try {
      add(el, animation);
      intersect(el, false);
      expect(isRegistered()).toBe(true);

      vi.advanceTimersByTime(61000);

      expect(animation.remove).toHaveBeenCalled();
      expect(isRegistered()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the deadline once the element is inserted', () => {
    vi.useFakeTimers();
    try {
      add(el, animation);
      intersect(el, false);

      document.body.append(el);
      intersect(el, true);
      vi.advanceTimersByTime(61000);

      expect(animation.remove).not.toHaveBeenCalled();
      expect(isRegistered()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// The login monkey renders its idle and its tracking player into ONE container, so one observed
// element carries two items.
describe('animationIntersector observer fan-out', () => {
  let el: HTMLElement;
  let first: any;
  let second: any;

  beforeEach(() => {
    document.body.replaceChildren();
    state.observed.clear();
    el = document.createElement('div');
    document.body.append(el);
    first = makeAnimation();
    second = makeAnimation();
    add(el, first);
    add(el, second);
  });

  it('drives every animation registered on the element', () => {
    intersect(el, true);
    expect(first.play).toHaveBeenCalled();
    expect(second.play).toHaveBeenCalled();

    first.paused = second.paused = false;
    intersect(el, false);
    expect(first.pause).toHaveBeenCalled();
    expect(second.pause).toHaveBeenCalled();
  });

  it('reclaims every animation on the element when it leaves the DOM', () => {
    intersect(el, true);
    el.remove();
    intersect(el, false);

    expect(first.remove).toHaveBeenCalled();
    expect(second.remove).toHaveBeenCalled();
    expect(animationIntersector.getAnimations(el)).toHaveLength(0);
  });

  it('keeps observing the element while another animation is still on it', () => {
    animationIntersector.removeAnimation(animationIntersector.getAnimations(el)[0]);

    intersect(el, true);
    expect(second.play).toHaveBeenCalled();
  });
});

// Stickers are loaded during the bootstrap (auth cards), before the settings store is filled.
describe('animationIntersector playback settings', () => {
  let el: HTMLElement;

  beforeEach(() => {
    document.body.replaceChildren();
    state.observed.clear();
    el = document.createElement('div');
    document.body.append(el);
  });

  afterEach(() => {
    state.appSettings = {stickers: {loop: true}};
  });

  it('registers an animation while the settings store is still empty', () => {
    state.appSettings = {};
    const animation = makeAnimation();

    expect(() => add(el, animation)).not.toThrow();
    expect(animation.loop).toBe(true);
    expect(animationIntersector.getAnimations(el)).toHaveLength(1);
  });

  it('still honours the loop setting once it is there', () => {
    state.appSettings = {stickers: {loop: false}};
    const animation = makeAnimation();

    add(el, animation);
    expect(animation.loop).toBe(false);
  });
});
