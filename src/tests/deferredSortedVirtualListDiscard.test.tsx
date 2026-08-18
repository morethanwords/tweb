import {describe, expect, it, vi} from 'vitest';

import {createDeferredSortedVirtualList} from '@components/deferredSortedVirtualList';

/**
 * The list is the only owner of the values it holds (the chat list stores its DialogElements here and
 * nowhere else), so every path that drops a value has to hand it back - otherwise whatever the value
 * owns downstream (a middlewareHelper, its custom emoji renderers, their OffscreenCanvases in the
 * compositor worker) is never released and accumulates for the lifetime of the tab.
 *
 * onItemUnmount is deliberately NOT that signal: it fires when a row merely leaves the rendered
 * window and is kept for re-mounting on scroll back.
 */
describe('deferredSortedVirtualList item discard', () => {
  const setup = () => {
    const onItemDiscard = vi.fn();
    const scrollable = document.createElement('div');
    document.body.append(scrollable);

    const list = createDeferredSortedVirtualList<string>({
      scrollable,
      getItemElement: () => document.createElement('li'),
      onItemDiscard,
      onListShrinked: () => {},
      requestItemForIdx: () => {},
      sortWith: (a, b) => a - b,
      itemSize: 'medium' as any
    });

    return {list, onItemDiscard};
  };

  const item = (id: string, index: number) => ({id, index, value: id});

  it('hands back an item removed by id', () => {
    const {list, onItemDiscard} = setup();
    list.addItems([item('a', 0), item('b', 1)]);

    list.removeItem('a');

    expect(onItemDiscard).toHaveBeenCalledTimes(1);
    expect(onItemDiscard).toHaveBeenCalledWith('a');
  });

  it('hands back a pinned item removed by id', () => {
    const {list, onItemDiscard} = setup();
    list.addPinnedItems([item('p', 0)]);

    list.removePinnedItem('p');

    expect(onItemDiscard).toHaveBeenCalledWith('p');
  });

  it('hands back the value an id used to hold when it is replaced', () => {
    const {list, onItemDiscard} = setup();
    list.addItems([item('a', 0)]);

    list.addItems([{id: 'a', index: 0, value: 'a-replacement'}]);

    expect(onItemDiscard).toHaveBeenCalledTimes(1);
    expect(onItemDiscard).toHaveBeenCalledWith('a');
  });

  it('does not hand back an item re-added as the very same value', () => {
    const {list, onItemDiscard} = setup();
    const a = item('a', 0);
    list.addItems([a]);

    list.addItems([{...a, index: 5}]);

    expect(onItemDiscard).not.toHaveBeenCalled();
  });

  it('hands back everything on clear', () => {
    const {list, onItemDiscard} = setup();
    list.addPinnedItems([item('p', 0)]);
    list.addItems([item('a', 0), item('b', 1)]);

    list.clear();

    expect(onItemDiscard.mock.calls.map(([value]) => value).sort()).toEqual(['a', 'b', 'p']);
  });

  it('hands back everything on dispose', () => {
    const {list, onItemDiscard} = setup();
    list.addItems([item('a', 0), item('b', 1)]);

    list.dispose();

    expect(onItemDiscard.mock.calls.map(([value]) => value).sort()).toEqual(['a', 'b']);
  });

  it('does not report a removal of an id the list never held', () => {
    const {list, onItemDiscard} = setup();
    list.addItems([item('a', 0)]);

    expect(list.removeItem('missing')).toBe(false);
    expect(onItemDiscard).not.toHaveBeenCalled();
  });
});
