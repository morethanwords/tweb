import {describe, expect, it, vi} from 'vitest';
import ByteBuf from '@lib/calls/p2P/byteBuf';
import {SctpSignaling} from '@lib/calls/p2P/sctpSignaling';

describe('SctpSignaling retry clock', () => {
  it('retries INIT from monotonic elapsed time after the wall clock moves backward', () => {
    let monotonicNow = 10000;
    const performanceNow = vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(5000000);
    const signaling = new SctpSignaling();

    expect(signaling.wrapPayload(ByteBuf.alloc(1))).toBeDefined();
    wallClock.mockReturnValue(-5000000);
    monotonicNow += 999;
    expect(signaling.wrapPayload(ByteBuf.alloc(1))).toBeUndefined();
    monotonicNow += 1;
    expect(signaling.wrapPayload(ByteBuf.alloc(1))).toBeDefined();

    performanceNow.mockRestore();
    wallClock.mockRestore();
  });
});
