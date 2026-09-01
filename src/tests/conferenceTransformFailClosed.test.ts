import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import GroupCallInstance from '@lib/calls/groupCallInstance';

function makeInstance() {
  const managers: any = {
    appGroupCallsManager: {},
    appCallsManager: {},
    apiUpdatesManager: {processUpdateMessage: () => {}}
  };
  const instance = new GroupCallInstance({id: 'late-transform-test' as any, chatId: 0 as any, managers});
  const hangUp = vi.fn();
  (instance as any).hangUp = hangUp;
  (instance as any).e2e = {};
  return {instance, hangUp};
}

describe('late conference receive transform', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('stops the unauthenticated track and leaves through the instance failure path', async() => {
    const {instance, hangUp} = makeInstance();
    const logError = vi.spyOn((instance as any).log, 'error');
    const stop = vi.fn();
    const receiver = {track: {stop}} as unknown as RTCRtpReceiver;

    instance.attachE2eRecvTransformLate(receiver, 'audio');

    expect(stop).toHaveBeenCalledTimes(1);
    expect((receiver as any).transform).toBeUndefined();
    await Promise.resolve();
    expect(hangUp).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      'CONFERENCE BUG —',
      expect.stringMatching(/encryption could not be attached/i),
      expect.objectContaining({reason: expect.stringMatching(/encryption could not be attached/i)})
    );
  });

  it('does nothing when the receiver was secured before decoder binding', async() => {
    const {instance, hangUp} = makeInstance();
    const stop = vi.fn();
    const receiver = {track: {stop}, transform: {}} as unknown as RTCRtpReceiver;

    instance.attachE2eRecvTransformLate(receiver, 'video');
    await Promise.resolve();

    expect(stop).not.toHaveBeenCalled();
    expect(hangUp).not.toHaveBeenCalled();
  });
});
