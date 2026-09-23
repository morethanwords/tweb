import {describe, expect, it} from 'vitest';
import reorderIndexes from '@helpers/array/reorderIndexes';

// a chat list sorted by descending index: the topmost row holds the greatest one
const ITEMS = [
  {id: 'a', index: 30},
  {id: 'b', index: 20},
  {id: 'c', index: 10},
  {id: 'd', index: 5}
];

describe('reorderIndexes', () => {
  it('redeals the indexes the items hold, topmost first', () => {
    // b dragged above a
    expect(reorderIndexes(ITEMS, ['b', 'a', 'c'], true)).toEqual([30, 20, 10]);
  });

  it('leaves everything else where it was', () => {
    // only the three rows that took part are dealt their own indexes - d keeps 5
    const indexes = reorderIndexes(ITEMS, ['c', 'a', 'b'], true);
    expect(indexes).toEqual([30, 20, 10]);
    expect(ITEMS.map(({index}) => index)).toEqual([30, 20, 10, 5]);
  });

  it('counts the other way round for a list sorted by ascending index', () => {
    expect(reorderIndexes(ITEMS, ['b', 'a', 'c'])).toEqual([10, 20, 30]);
  });

  it('answers nothing when one of the keys is not in the list', () => {
    expect(reorderIndexes(ITEMS, ['a', 'z'], true)).toBeUndefined();
  });

  it('holds a single item still', () => {
    expect(reorderIndexes(ITEMS, ['c'], true)).toEqual([10]);
  });
});
