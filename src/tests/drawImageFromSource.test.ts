import {describe, expect, test, vi} from 'vitest';
import {drawImageFromSource} from '@components/messageSpoilerOverlay/drawImageFromSource';

describe('drawImageFromSource', () => {
  test('tiles a media spoiler simulation across a target larger than its source', () => {
    const drawImage = vi.fn();
    const context = {drawImage} as unknown as CanvasRenderingContext2D;
    const source = {height: 480, width: 480} as HTMLCanvasElement;

    drawImageFromSource(context, source, 0, 0, 1000, 720, 0, 0, 1000, 720);

    const calls = drawImage.mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every(([, sx, sy, sw, sh]) => (
      sx >= 0 &&
      sy >= 0 &&
      sx + sw <= source.width &&
      sy + sh <= source.height
    ))).toBe(true);
    expect(calls.reduce((area, call) => area + call[7] * call[8], 0)).toBe(1000 * 720);
    expect(Math.max(...calls.map((call) => call[5] + call[7]))).toBe(1000);
    expect(Math.max(...calls.map((call) => call[6] + call[8]))).toBe(720);
  });
});
