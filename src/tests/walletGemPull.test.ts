import {GemPull} from '@components/wallet/visual/gem/pull';

const pointer = (clientX: number, clientY = 0, type = 'pointermove') => ({clientX, clientY, type, pointerId: 1} as PointerEvent);

describe('a finger on a wallet gem', () => {
  test('each move gives how far the finger went since the last one', () => {
    const pull = new GemPull(pointer(100, 50, 'pointerdown'), 0);
    expect(pull.move(pointer(110, 45), 0.01)).toEqual([10, -5]);
    expect(pull.move(pointer(130, 45), 0.02)).toEqual([20, 0]);
  });

  // * iOS: the release's speed is the finger's over its last 80 ms
  test('a throw goes at the finger\'s speed over its last 80 ms, not since the press', () => {
    const pull = new GemPull(pointer(0, 0, 'pointerdown'), 0);
    pull.move(pointer(10), 0.5);
    pull.move(pointer(20), 0.55);
    pull.move(pointer(30), 0.6);
    pull.move(pointer(100), 0.65);
    // * the sample at .55 s is 100 ms old: the speed counts from the one at .6 s
    expect(pull.velocity(pointer(100, 0, 'pointerup'), 0.65)).toBeCloseTo((100 - 30) / (0.65 - 0.6));
    expect(new GemPull(pointer(0, 0, 'pointerdown'), 1).velocity(pointer(50, 0, 'pointerup'), 1)).toBe(0);
  });

  // * iOS: shorter than 0.25 s and closer than 10 pt
  test('a short press that hardly moved is a tap; a long, a moved or a cancelled one is not', () => {
    const pull = new GemPull(pointer(0, 0, 'pointerdown'), 0);
    expect(pull.isTap(pointer(6, 6, 'pointerup'), 0.2)).toBe(true);
    expect(pull.isTap(pointer(6, 6, 'pointerup'), 0.3)).toBe(false);
    expect(pull.isTap(pointer(8, 8, 'pointerup'), 0.1)).toBe(false);
    expect(pull.isTap(pointer(0, 0, 'pointercancel'), 0.1)).toBe(false);
  });
});
