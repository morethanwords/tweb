import {
  findSharedMediaScrollDateItemIndex,
  supportsSharedMediaScrollDate
} from '@components/sharedMediaScrollDate';

describe('shared media scroll date', () => {
  test('supports media and stories tabs', () => {
    expect(supportsSharedMediaScrollDate('media')).toBe(true);
    expect(supportsSharedMediaScrollDate('stories')).toBe(true);
    expect(supportsSharedMediaScrollDate('links')).toBe(false);
  });

  test('selects the first item below the sticky tabs', () => {
    const bottoms = [100, 100, 100, 220, 220, 220, 340, 340, 340];

    expect(findSharedMediaScrollDateItemIndex(bottoms.length, 100, (index) => bottoms[index])).toBe(3);
    expect(findSharedMediaScrollDateItemIndex(bottoms.length, 219, (index) => bottoms[index])).toBe(3);
    expect(findSharedMediaScrollDateItemIndex(bottoms.length, 220, (index) => bottoms[index])).toBe(6);
  });

  test('uses the first item of the visible grid row', () => {
    const bottoms = [100, 100, 100, 220, 220, 220];

    expect(findSharedMediaScrollDateItemIndex(bottoms.length, 150, (index) => bottoms[index])).toBe(3);
  });

  test('returns no item below the content', () => {
    const bottoms = [100, 100, 100];

    expect(findSharedMediaScrollDateItemIndex(bottoms.length, 100, (index) => bottoms[index])).toBe(-1);
  });
});
