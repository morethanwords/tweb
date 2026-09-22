import {beforeEach, afterEach, describe, expect, test, vi} from 'vitest';
import Scrollable from '@components/scrollable';
import ScrollableRefiller from '@helpers/scrollableRefiller';

/**
 * The profile sidebar used to spin at ~9000 loads a second the moment it opened:
 * `Scrollable.checkForTriggers` fires `onScrolledBottom` for a list that does not
 * overflow, and `AppSearchSuper` re-armed that check from the `finally` of every
 * load — including the loads that rendered nothing, because its `savedDialogs`
 * tab never sets `loaded[type]`.
 *
 * The trigger side of that is deliberate and stays (a first page shorter than the
 * viewport has to be able to ask for a second one), so these pin both halves: the
 * `Scrollable` contract that makes the trap possible, and the guard that keeps a
 * consumer from falling into it.
 */

// A scrollable's metrics come from the container, and jsdom lays nothing out, so
// the sizes are the test's to drive. `scrollSize === clientSize` is the sidebar's
// measured state: a list shorter than the column it lives in.
function mockScrollable(sizes: {scrollSize: number, clientSize: number, scrollPosition?: number}) {
  const el = document.createElement('div');
  document.body.append(el);
  const scrollable = new Scrollable(el);
  const container = scrollable.container;

  let scrollPosition = sizes.scrollPosition ?? 0;
  Object.defineProperty(container, 'scrollHeight', {get: () => sizes.scrollSize, configurable: true});
  Object.defineProperty(container, 'clientHeight', {get: () => sizes.clientSize, configurable: true});
  Object.defineProperty(container, 'offsetHeight', {get: () => sizes.clientSize, configurable: true});
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollPosition,
    set: (value: number) => scrollPosition = value,
    configurable: true
  });

  return scrollable;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('Scrollable.checkForTriggers', () => {
  test('treats a list that does not overflow as scrolled to the bottom', () => {
    const scrollable = mockScrollable({scrollSize: 768, clientSize: 768});
    const onScrolledBottom = vi.fn();
    scrollable.onScrolledBottom = onScrolledBottom;

    // maxScrollPosition - scrollPosition === 0, which is within onScrollOffset
    scrollable.checkForTriggers();
    scrollable.checkForTriggers();

    // * every call fires: this is what fills a short list, and it is also why a
    // * consumer must never re-arm the check unconditionally
    expect(onScrolledBottom).toHaveBeenCalledTimes(2);
  });

  test('stays quiet for a container with no height at all', () => {
    const scrollable = mockScrollable({scrollSize: 0, clientSize: 0});
    const onScrolledBottom = vi.fn();
    scrollable.onScrolledBottom = onScrolledBottom;

    scrollable.checkForTriggers();

    expect(onScrolledBottom).not.toHaveBeenCalled();
  });

  test('stays quiet while a long list is scrolled away from its end', () => {
    const scrollable = mockScrollable({scrollSize: 5000, clientSize: 768, scrollPosition: 0});
    const onScrolledBottom = vi.fn();
    scrollable.onScrolledBottom = onScrolledBottom;

    scrollable.checkForTriggers();

    expect(onScrolledBottom).not.toHaveBeenCalled();
  });
});

describe('ScrollableRefiller', () => {
  /**
   * The shape of the bug, in miniature: a list that never overflows, a loader
   * that re-checks the triggers once it is done, and a `canLoad` that is always
   * true because nothing tells it otherwise.
   */
  function setup(options: {rendersPerLoad: number, pages?: number}) {
    const scrollable = mockScrollable({scrollSize: 768, clientSize: 768});
    let rendered = 0;
    let loads = 0;

    const refiller = new ScrollableRefiller({
      scrollable,
      getProgress: () => rendered
    });

    scrollable.onScrolledBottom = () => {
      ++loads;
      if(options.pages === undefined || loads <= options.pages) {
        rendered += options.rendersPerLoad;
      }

      refiller.schedule('media');
    };

    return {scrollable, refiller, getLoads: () => loads, getRendered: () => rendered};
  }

  test('stops the chain once a load renders nothing', () => {
    const {scrollable, getLoads} = setup({rendersPerLoad: 0});

    scrollable.checkForTriggers();
    vi.runAllTimers();

    // the first load is the one that was asked for; the second is the one that
    // proves there is nothing more to render. There is no third.
    expect(getLoads()).toBe(2);
  });

  test('keeps refilling while the list is still growing', () => {
    const {scrollable, getLoads, getRendered} = setup({rendersPerLoad: 10, pages: 4});

    scrollable.checkForTriggers();
    vi.runAllTimers();

    // four pages of items, then one load that adds nothing and ends the chain
    expect(getRendered()).toBe(40);
    expect(getLoads()).toBe(5);
  });

  test('ignores progress that goes backwards', () => {
    const scrollable = mockScrollable({scrollSize: 768, clientSize: 768});
    let loads = 0;
    let progress = 10;
    const refiller = new ScrollableRefiller({scrollable, getProgress: () => progress});
    scrollable.onScrolledBottom = () => {
      ++loads;
      progress -= 1; // a list that is losing items is not a list to load more into
      refiller.schedule('media');
    };

    scrollable.checkForTriggers();
    vi.runAllTimers();

    // the first check is the one that was asked for, the second sees less than
    // before and ends it. Strictly-greater is what makes this terminate at all:
    // anything that merely DIFFERS from the last reading would chain forever.
    expect(loads).toBe(2);
  });

  test('a scroll still loads after the chain has stopped', () => {
    const {scrollable, getLoads} = setup({rendersPerLoad: 0});

    scrollable.checkForTriggers();
    vi.runAllTimers();
    expect(getLoads()).toBe(2);

    // the guard only withholds the self-re-arm — the user reaching the bottom is
    // a fresh reason to ask, and goes straight through
    scrollable.checkForTriggers();
    vi.runAllTimers();
    expect(getLoads()).toBe(3);
  });

  test('several loads finishing in one tick share a single check', () => {
    const scrollable = mockScrollable({scrollSize: 768, clientSize: 768});
    const checkForTriggers = vi.spyOn(scrollable, 'checkForTriggers');
    let rendered = 0;
    const refiller = new ScrollableRefiller({scrollable, getProgress: () => rendered});

    ++rendered;
    refiller.schedule('media');
    refiller.schedule('media');
    refiller.schedule('media');
    vi.runAllTimers();

    expect(checkForTriggers).toHaveBeenCalledTimes(1);
  });

  test('keeps the tabs apart', () => {
    const scrollable = mockScrollable({scrollSize: 768, clientSize: 768});
    const checkForTriggers = vi.spyOn(scrollable, 'checkForTriggers');
    const refiller = new ScrollableRefiller({scrollable, getProgress: () => 0});

    refiller.schedule('media');
    refiller.schedule('files');
    vi.runAllTimers();
    expect(checkForTriggers).toHaveBeenCalledTimes(2);

    // and neither of them has anything new to say the second time round
    refiller.schedule('media');
    refiller.schedule('files');
    vi.runAllTimers();
    expect(checkForTriggers).toHaveBeenCalledTimes(2);
  });

  test('drops a cancelled check', () => {
    const scrollable = mockScrollable({scrollSize: 768, clientSize: 768});
    const checkForTriggers = vi.spyOn(scrollable, 'checkForTriggers');
    const refiller = new ScrollableRefiller({scrollable, getProgress: () => 1});

    refiller.schedule('media', () => false);
    vi.runAllTimers();

    expect(checkForTriggers).not.toHaveBeenCalled();
  });

  test('a reset lets the next peer refill from scratch', () => {
    const scrollable = mockScrollable({scrollSize: 768, clientSize: 768});
    const checkForTriggers = vi.spyOn(scrollable, 'checkForTriggers');
    const refiller = new ScrollableRefiller({scrollable, getProgress: () => 0});

    refiller.schedule('media');
    vi.runAllTimers();
    refiller.schedule('media');
    vi.runAllTimers();
    expect(checkForTriggers).toHaveBeenCalledTimes(1);

    // cleanup() runs on every peer change, and the new peer's empty tab looks
    // exactly like the old one's — it still gets its load
    refiller.reset();
    refiller.schedule('media');
    vi.runAllTimers();
    expect(checkForTriggers).toHaveBeenCalledTimes(2);
  });
});
