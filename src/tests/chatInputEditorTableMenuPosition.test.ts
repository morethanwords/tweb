import {getChatInputTableMenuLayout} from '@components/chat/inputEditor/tableMenuPosition';

describe('chat input table menu positioning', () => {
  test('constrains a tall cell menu to the visible viewport', () => {
    const layout = getChatInputTableMenuLayout(
      {bottom: 68, height: 20, left: 366, right: 410, top: 48, width: 44},
      {height: 760, width: 360},
      {height: 676, width: 768}
    );

    expect(layout).toEqual({
      left: 208,
      maxHeight: 596,
      maxWidth: 752,
      top: 72
    });
    expect(layout.top + layout.maxHeight).toBeLessThanOrEqual(676 - 8);
  });

  test('uses visual viewport offsets and clamps the horizontal edge', () => {
    const layout = getChatInputTableMenuLayout(
      {bottom: 270, height: 20, left: 680, right: 720, top: 250, width: 40},
      {height: 240, width: 360},
      {height: 500, left: 100, top: 200, width: 620}
    );

    expect(layout.left).toBe(352);
    expect(layout.top).toBe(274);
    expect(layout.maxHeight).toBe(418);
    expect(layout.maxWidth).toBe(604);
  });

  test('opens upward only when it provides more room for a menu that cannot fit below', () => {
    const layout = getChatInputTableMenuLayout(
      {bottom: 590, height: 20, left: 300, right: 340, top: 570, width: 40},
      {height: 320, width: 240},
      {height: 676, width: 768}
    );

    expect(layout.maxHeight).toBe(558);
    expect(layout.top).toBe(246);
  });
});
