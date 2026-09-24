import {describe, expect, it} from 'vitest';
import {layoutSectionIndexSlots} from '@components/sectionIndex';

const letters = (count: number) => Array.from({length: count}, (_, idx) => ({letter: String.fromCharCode(65 + idx), top: idx * 100}));

describe('layoutSectionIndexSlots', () => {
  it('lays every letter out, 15px apart and centred, when they fit', () => {
    const {slots, pitch} = layoutSectionIndexSlots(letters(4), 400);
    expect(pitch).toBe(15);
    expect(slots.map(({letter}) => letter)).toEqual(['A', 'B', 'C', 'D']);
    // centred in the 380px between the insets: (380 - 60) / 2 + 10
    expect(slots.map(({y}) => y)).toEqual([177, 192, 207, 222]);
  });

  it('keeps every n-th letter and the last one when they do not fit', () => {
    // 200px leave 180 - 37 for the letters: 11 of them at 12px at the least
    const {slots, pitch} = layoutSectionIndexSlots(letters(26), 200);
    expect(slots.map(({letter}) => letter).join('')).toBe('ADGJMPSVYZ');
    expect(slots.map(({sourceIndex}) => sourceIndex)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 25]);
    expect(pitch).toBe(14);
  });

  it('lays nothing out without letters or height', () => {
    expect(layoutSectionIndexSlots([], 400).slots).toEqual([]);
    expect(layoutSectionIndexSlots(letters(3), 0).slots).toEqual([]);
  });
});
