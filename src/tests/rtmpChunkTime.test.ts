/*
 * The live-stream service worker derives its chunk clock from the server's
 * groupCallStreamChannel.scale. `1000 >> 10` is 0, which turned the buffer size
 * into Infinity and the replenish loop into an unbounded allocation that took
 * the whole service worker down — so the exponent is validated first.
 */
import {describe, expect, it} from 'vitest';
import {RTMP_MAX_ABS_SCALE, scaleToChunkTime} from '@lib/rtmp/utils';

describe('scaleToChunkTime', () => {
  it('maps the scale exponent to a chunk duration', () => {
    expect(scaleToChunkTime(0)).toBe(1000);
    expect(scaleToChunkTime(1)).toBe(500);
    expect(scaleToChunkTime(RTMP_MAX_ABS_SCALE)).toBe(125);
    expect(scaleToChunkTime(-1)).toBe(2000);
    expect(scaleToChunkTime(-RTMP_MAX_ABS_SCALE)).toBe(8000);
  });

  it('rejects a scale the chunk arithmetic cannot represent', () => {
    const invalid = [10, -22, RTMP_MAX_ABS_SCALE + 1, -RTMP_MAX_ABS_SCALE - 1, 1.5, NaN, undefined as unknown as number];
    for(const scale of invalid) {
      expect(() => scaleToChunkTime(scale)).toThrow('Invalid stream channel scale');
    }
  });
});
