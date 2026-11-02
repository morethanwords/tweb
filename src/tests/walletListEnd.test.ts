/*
 * The main screen's lists ask for their next page when their end is near — on a scroll, and also when a page leaves
 * too few rows to scroll at all (a page of mostly hidden dust): after every page the end is looked at again, and the
 * next one comes while it is still in sight. The observer here is a fake the test answers.
 */

import {createRoot, createSignal} from 'solid-js';
import {afterEach, describe, expect, test, vi} from 'vitest';

type FakeObserver = {
  callback: (entries: Partial<IntersectionObserverEntry>[]) => void,
  options: IntersectionObserverInit,
  observed: Element[],
  disconnected: boolean
};

const observers = vi.hoisted(() => [] as FakeObserver[]);
vi.mock('@components/wallet/chatCard/observe', () => ({
  observeWalletCards: (callback: FakeObserver['callback'], options: IntersectionObserverInit) => {
    const fake: FakeObserver = {callback, options, observed: [], disconnected: false};
    observers.push(fake);
    return {
      observe: (element: Element) => fake.observed.push(element),
      unobserve: () => {},
      disconnect: () => fake.disconnected = true
    };
  }
}));

import watchWalletListEnd from '@components/wallet/listEnd';

let dispose: () => void;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  observers.length = 0;
});

const live = () => observers.filter((observer) => !observer.disconnected);
/** the observer says where the end is, as a new one does at once */
const answer = (observer: FakeObserver, near: boolean) => observer.callback([{isIntersecting: near, target: observer.observed[0]}]);

/** a list whose loadMore starts a page; `finish` lands it */
function setup(options: {canLoad?: boolean, withElements?: boolean} = {}) {
  const root = document.createElement('div'), end = document.createElement('div');
  const [loading, setLoading] = createSignal(false);
  const [ended, setEnded] = createSignal(false);
  const [blocked, setBlocked] = createSignal(options.canLoad === false);
  const loadMore = vi.fn(() => setLoading(true));
  createRoot((d) => {
    dispose = d;
    watchWalletListEnd({
      root: () => options.withElements === false ? undefined : root,
      end: () => options.withElements === false ? undefined : end,
      canLoad: () => !blocked() && !loading() && !ended(),
      loadMore,
      margin: 400
    });
  });

  return {root, end, loadMore, finish: (last?: boolean) => {
    if(last) setEnded(true);
    setLoading(false);
  }, setBlocked};
}

describe('wallet list end', () => {
  test('the end within the margin below the view asks for a page; farther, nothing is asked', () => {
    const {root, end, loadMore} = setup();
    expect(live()).toHaveLength(1);
    const [observer] = live();
    expect(observer.options).toMatchObject({root, rootMargin: '0px 0px 400px'});
    expect(observer.observed).toEqual([end]);

    answer(observer, false);
    expect(loadMore).not.toHaveBeenCalled();
    answer(observer, true);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  test('a page that leaves the end in sight asks for the next one without a scroll, until the view is full', () => {
    const {loadMore, finish} = setup();
    answer(live()[0], true);
    expect(loadMore).toHaveBeenCalledTimes(1);
    // * while the page loads nobody watches
    expect(live()).toHaveLength(0);

    // * the page came: its few rows did not push the end away
    finish();
    expect(live()).toHaveLength(1);
    answer(live()[0], true);
    expect(loadMore).toHaveBeenCalledTimes(2);

    // * this one filled the view
    finish();
    answer(live()[0], false);
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  test('nothing is watched once the list ended, while it cannot load, or before its elements are there', () => {
    const {loadMore, finish} = setup();
    answer(live()[0], true);
    finish(true);
    expect(live()).toHaveLength(0);
    expect(loadMore).toHaveBeenCalledTimes(1);
    dispose();

    observers.length = 0;
    const blocked = setup({canLoad: false});
    expect(live()).toHaveLength(0);
    // * a failed page's Retry let it load again
    blocked.setBlocked(false);
    expect(live()).toHaveLength(1);
    dispose();

    observers.length = 0;
    setup({withElements: false});
    expect(live()).toHaveLength(0);
  });
});
