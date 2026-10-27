import {createRoot, createSignal} from 'solid-js';
import {describe, expect, it} from 'vitest';

import {createDeferredSortedVirtualList} from '@components/deferredSortedVirtualList';

/**
 * A chat with folder tags is a line taller than one without, so a folder's chat list lays its rows
 * out by their own heights - every row below a taller one moves down by what it adds, and back up
 * when it loses its tags.
 */
describe('deferredSortedVirtualList item heights', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

  const setup = (ids = ['a', 'b', 'c'], initiallyTall = ['b'], listOffset = 0) => {
    const scrollable = document.createElement('div');
    document.body.append(scrollable);

    const [tall, setTall] = createRoot(() => createSignal(new Set(initiallyTall)));
    const list = createDeferredSortedVirtualList<string>({
      scrollable,
      getItemElement: (value) => {
        const element = document.createElement('li');
        element.dataset.id = value;
        return element;
      },
      onListShrinked: () => {},
      requestItemForIdx: () => {},
      sortWith: (a, b) => a - b,
      itemSize: 72,
      getItemHeight: (value) => tall().has(value) ? 82 : 72,
      extraPaddingBottom: 0
    });

    // * jsdom lays nothing out: the list starts `listOffset` down what the host scrolls
    list.list.getBoundingClientRect = () => ({top: listOffset - scrollable.scrollTop}) as DOMRect;

    list.setWasAtLeastOnceFetched(true);
    list.addItems(ids.map((id, index) => ({id, index, value: id})));
    list.setTotalCount(ids.length);

    const tops = () => Object.fromEntries(
      Array.from(list.list.querySelectorAll('li')).map((element) => [element.dataset.id, element.style.top])
    );

    // * as a browser does: the list hears of a scroll from its event
    const scrollTo = (top: number) => {
      scrollable.scrollTop = top;
      scrollable.dispatchEvent(new Event('scroll'));
    };

    return {list, setTall, tops, scrollable, scrollTo};
  };

  it('puts the rows under a taller one lower by what it adds', async() => {
    const {list, tops} = setup();
    await settle();

    expect(tops()).toEqual({a: '0px', b: '72px', c: '154px'});
    expect(list.list.style.height).toBe(72 + 82 + 72 + 'px');
  });

  it('moves them back when the row is no taller any more', async() => {
    const {list, setTall, tops} = setup();
    await settle();

    setTall(new Set<string>());
    await settle();

    expect(tops()).toEqual({a: '0px', b: '72px', c: '144px'});
    expect(list.list.style.height).toBe(72 * 3 + 'px');
  });

  // * a row that grows or shrinks above the screen would push what is on it down or pull it up: the
  // * list scrolls by as much instead, keeping the row at the top of the screen where it was
  it('keeps the row at the top of the screen in place when a row above it changes height', async() => {
    const {setTall, scrollable, scrollTo} = setup(['a', 'b', 'c', 'd', 'e', 'f'], []);
    await settle();

    // * `c` is at the top of the screen, a few pixels of it scrolled away
    scrollTo(150);

    setTall(new Set(['a']));
    await settle();
    expect(scrollable.scrollTop).toBe(160);
    scrollTo(scrollable.scrollTop);

    // * one under it changes nothing above it
    setTall(new Set(['a', 'd']));
    await settle();
    expect(scrollable.scrollTop).toBe(160);

    // * and the row above going back takes the scroll back with it
    setTall(new Set<string>());
    await settle();
    expect(scrollable.scrollTop).toBe(150);
  });

  // * the chat list's host scrolls the stories above the list too
  it('finds the top of the screen in the list under whatever the host shows above it', async() => {
    const {setTall, scrollable, scrollTo} = setup(['a', 'b', 'c', 'd', 'e', 'f'], [], 100);
    await settle();

    // * the screen starts 150 down the list: `c` is at its top, as above - and grows downwards, over
    // * the rows under it, not up off the screen
    scrollTo(250);

    setTall(new Set(['c']));
    await settle();
    expect(scrollable.scrollTop).toBe(250);
  });

  it('leaves a list scrolled to its top alone', async() => {
    const {setTall, scrollable} = setup(['a', 'b', 'c'], []);
    await settle();

    setTall(new Set(['a', 'b']));
    await settle();
    expect(scrollable.scrollTop).toBe(0);
  });
});
