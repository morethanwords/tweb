/*
 * ReceiverVideoConstraints for legacy (SFU) group calls. The server decides how
 * many video participants it announces; the client used to put every one of
 * them on stage at 720p, so a flooded participant list turned into a request
 * to forward thousands of HD streams. tgcalls asks only for the visible tiles,
 * by quality tier — pinned at full, grid at medium, bounded in number.
 */
import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import GroupCallConnectionInstance from '@lib/calls/groupCallConnectionInstance';

function makeConnection(pinnedSource?: number) {
  const send = vi.fn();
  const instance = new GroupCallConnectionInstance({
    streamManager: {} as any,
    groupCall: {pinnedSource} as any,
    type: 'main',
    options: {type: 'main'},
    managers: {} as any
  } as any);
  (instance as any).dataChannel = {readyState: 'open', send};

  const entries: any[] = [];
  for(let i = 1; i <= 20; ++i) {
    entries.push({type: 'video', direction: 'recvonly', source: i, endpoint: `video${i}`});
  }
  entries.push({type: 'audio', direction: 'recvonly', source: 100, endpoint: 'audio'});
  entries.push({type: 'video', direction: 'sendonly', source: 200, endpoint: 'own'});
  (instance as any).description = {entries};

  const request = () => {
    instance.maybeUpdateRemoteVideoConstraints();
    clearInterval((instance as any).updateConstraintsInterval);
    return JSON.parse(send.mock.calls[send.mock.calls.length - 1][0]);
  };
  return {instance, request, send};
}

describe('GroupCallConnectionInstance remote video constraints', () => {
  it('bounds the number of forwarded streams and tiers the pinned tile above the grid', () => {
    const {request} = makeConnection(7);
    const obj = request();

    expect(obj.colibriClass).toBe('ReceiverVideoConstraints');
    expect(obj.defaultConstraints).toEqual({maxHeight: 0});
    expect(obj.onStageEndpoints).toHaveLength(16);
    expect(obj.onStageEndpoints[0]).toBe('video7');
    expect(obj.constraints.video7).toEqual({minHeight: 180, maxHeight: 720});
    expect(obj.constraints.video1).toEqual({minHeight: 180, maxHeight: 360});
    expect(obj.onStageEndpoints).not.toContain('video20');
    expect(obj.constraints.audio).toBeUndefined();
    expect(obj.constraints.own).toBeUndefined();
  });

  it('requests medium quality for every grid tile when nothing is pinned', () => {
    const {request} = makeConnection();
    const obj = request();

    expect(obj.onStageEndpoints).toEqual(Array.from({length: 16}, (_, i) => `video${i + 1}`));
    for(const endpoint of obj.onStageEndpoints) {
      expect(obj.constraints[endpoint]).toEqual({minHeight: 180, maxHeight: 360});
    }
  });
});

describe('GroupCallConnectionInstance constraints timer lifetime', () => {
  it('stops the timer when the connection closes without a data-channel close event', () => {
    vi.useFakeTimers();
    try {
      const {instance, send} = makeConnection(7);
      instance.maybeUpdateRemoteVideoConstraints();
      expect((instance as any).updateConstraintsInterval).toBeDefined();

      // pc.close() does not reliably fire the channel's `close`; the override
      // must not depend on it.
      instance.closeConnection();

      expect((instance as any).updateConstraintsInterval).toBeUndefined();
      const sentBeforeClose = send.mock.calls.length;
      vi.advanceTimersByTime(30000);
      expect(send).toHaveBeenCalledTimes(sentBeforeClose);
    } finally {
      vi.useRealTimers();
    }
  });
});
