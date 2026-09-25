import {
  getVerticalVisibilityAdjustment
} from '@components/chat/inputEditor/selectionVisibility';

describe('chat input editor selection visibility', () => {
  const viewport = {top: 56, bottom: 244};

  test('scrolls a caret hidden under the top toolbar into the visible area', () => {
    expect(getVerticalVisibilityAdjustment({top: 40, bottom: 58}, viewport)).toBe(-16);
  });

  test('scrolls a caret hidden under the bottom toolbar into the visible area', () => {
    expect(getVerticalVisibilityAdjustment({top: 240, bottom: 260}, viewport)).toBe(16);
  });

  test('does not move a selection that is already visible', () => {
    expect(getVerticalVisibilityAdjustment({top: 100, bottom: 118}, viewport)).toBe(0);
  });

  test('aligns the leading edge when a selected block is taller than the viewport', () => {
    expect(getVerticalVisibilityAdjustment({top: 30, bottom: 300}, viewport)).toBe(-26);
  });

  test('aligns the leading edge of a tall block that starts inside the viewport', () => {
    expect(getVerticalVisibilityAdjustment({top: 100, bottom: 310}, viewport)).toBe(44);
  });
});
