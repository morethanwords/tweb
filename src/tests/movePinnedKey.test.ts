import {describe, expect, it} from 'vitest';
import movePinnedKey from '@appManagers/utils/dialogs/movePinnedKey';

// the keys are peer ids, so plain numbers here
const ORDER = [1, 2, 3, 4];

describe('movePinnedKey', () => {
  it('puts the moved key after the one it now follows', () => {
    // 1 dragged down past 2: it now follows 2
    expect(movePinnedKey(ORDER, 1, 2, 3)).toEqual([2, 1, 3, 4]);
  });

  it('puts it before the one below when nothing is above it', () => {
    // 3 dragged to the very top of what was on screen
    expect(movePinnedKey(ORDER, 3, undefined, 1)).toEqual([3, 1, 2, 4]);
  });

  it('keeps a pin the drag never saw where it was', () => {
    // 2 is pinned but has no row (a folded Community's chat), and 3 was dragged above 1
    expect(movePinnedKey([1, 2, 3], 3, undefined, 1)).toEqual([3, 1, 2]);
    // ... and dragging 1 below 3 must not land it above 2, which counting slots would
    expect(movePinnedKey([1, 2, 3], 1, 3, undefined)).toEqual([2, 3, 1]);
  });

  it('answers nothing when the moved dialog is not pinned any more', () => {
    expect(movePinnedKey(ORDER, 5, 1, 2)).toBeUndefined();
  });

  it('answers nothing when the neighbour it was put next to is gone', () => {
    expect(movePinnedKey(ORDER, 1, 9, 3)).toBeUndefined();
    expect(movePinnedKey(ORDER, 1, undefined, 9)).toBeUndefined();
  });

  it('leaves the order it was given alone', () => {
    const order = ORDER.slice();
    movePinnedKey(order, 1, 2, 3);
    expect(order).toEqual(ORDER);
  });
});
