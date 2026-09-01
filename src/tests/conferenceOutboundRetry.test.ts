import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import GroupCallInstance from '@lib/calls/groupCallInstance';

const CALL_ID = 'outbound-retry-test' as any;
const outbound = (bytes: Uint8Array, height = 1) => ({bytes, height});

function makeInstance(messages: Uint8Array[], sendConferenceCallBroadcast: ReturnType<typeof vi.fn>) {
  const pullOutbound = vi.fn()
  .mockResolvedValueOnce(messages.map((bytes) => outbound(bytes)))
  .mockResolvedValue([]);
  const managers: any = {
    appGroupCallsManager: {},
    appCallsManager: {sendConferenceCallBroadcast},
    apiUpdatesManager: {processUpdateMessage: () => {}}
  };
  const instance = new GroupCallInstance({id: CALL_ID, chatId: 0 as any, managers});
  instance.groupCall = {
    _: 'groupCall',
    pFlags: {},
    id: CALL_ID,
    access_hash: '1',
    participants_count: 1,
    unmuted_video_count: 0,
    version: 1
  } as any;
  (instance as any).e2e = {pullOutbound};
  (instance as any).e2eActive = true;

  return {instance, pullOutbound};
}

describe('conference outbound broadcast retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a pulled broadcast queued until a transient failure recovers', async() => {
    const send = vi.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new Error('still offline'))
    .mockResolvedValue(undefined);
    const {instance} = makeInstance([new Uint8Array([7])], send);

    const flushed = (instance as any).flushE2eOutbound() as Promise<void>;
    await vi.runAllTimersAsync();
    await flushed;

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map(([, bytes]) => bytes[0])).toEqual([7, 7, 7]);
    expect((instance as any).e2eOutboundQueue).toEqual([]);
  });

  it('bounds retries and continues with the next queued broadcast', async() => {
    const send = vi.fn(async(_call, bytes: Uint8Array) => {
      if(bytes[0] === 1) throw new Error('permanent');
    });
    const {instance} = makeInstance([new Uint8Array([1]), new Uint8Array([2])], send);

    const flushed = (instance as any).flushE2eOutbound() as Promise<void>;
    await vi.runAllTimersAsync();
    await flushed;

    expect(send.mock.calls.map(([, bytes]) => bytes[0])).toEqual([1, 1, 1, 1, 1, 2]);
    expect((instance as any).e2eOutboundQueue).toEqual([]);
  });

  it('coalesces concurrent pending notifications without losing a later pull', async() => {
    const send = vi.fn().mockResolvedValue(undefined);
    const {instance, pullOutbound} = makeInstance([new Uint8Array([3])], send);
    pullOutbound.mockReset()
    .mockResolvedValueOnce([outbound(new Uint8Array([3]))])
    .mockResolvedValueOnce([outbound(new Uint8Array([4]))])
    .mockResolvedValue([]);

    const first = (instance as any).flushE2eOutbound() as Promise<void>;
    const second = (instance as any).flushE2eOutbound() as Promise<void>;
    await Promise.all([first, second]);

    expect(send.mock.calls.map(([, bytes]) => bytes[0])).toEqual([3, 4]);
    expect(pullOutbound).toHaveBeenCalledTimes(2);
  });

  it('does not pull a pre-join broadcast and flushes only after activation', async() => {
    const send = vi.fn().mockResolvedValue(undefined);
    const {instance, pullOutbound} = makeInstance([new Uint8Array([9])], send);
    (instance as any).e2eActive = false;
    vi.spyOn(instance as any, 'startE2eChainPolling').mockImplementation(() => {});

    await (instance as any).flushE2eOutbound();
    expect(pullOutbound).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    await instance.activateE2e();
    await (instance as any).e2eOutboundFlushPromise;

    expect(pullOutbound).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toEqual(new Uint8Array([9]));
  });
});
