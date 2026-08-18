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

    expect(list.removePinnedItem('p')).toBe(true);
    expect(onItemDiscard).toHaveBeenCalledWith('p');
  });

  it('reports removals truthfully per collection', () => {
    const {list} = setup();
    list.addPinnedItems([item('p', 0)]);
    list.addItems([item('a', 0)]);

    // * Each side answers for itself - removeItem used to answer from the merged map and claim a
    // * pinned id was removed while leaving it in place
    expect(list.removeItem('p')).toBe(false);
    expect(list.removePinnedItem('a')).toBe(false);
    expect(list.removeItem('a')).toBe(true);
    expect(list.removePinnedItem('p')).toBe(true);
  });

  it('does not hand back a pinned item to a plain removeItem', () => {
    const {list, onItemDiscard} = setup();
    list.addPinnedItems([item('p', 0)]);

    list.removeItem('p');

    expect(onItemDiscard).not.toHaveBeenCalled();
    expect(list.has('p')).toBe(true);
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
