/*
 * ReceiverVideoConstraints for legacy (SFU) group calls. The server decides how
 * many video participants it announces, so the request is bounded, and tiered
 * the way Telegram iOS asks (VideoChatParticipantsComponent): the pinned video
 * at 720 with every other tile a 180 thumbnail, and 360 for everyone when
 * nothing is pinned. Only the full-quality endpoint is "on stage", like tgcalls.
 * A pin used to wait for the next 5 s resend before the SFU upgraded it.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import GroupCallConnectionInstance from '@lib/calls/groupCallConnectionInstance';

function makeConnection(pinnedSource?: number | string) {
  const send = vi.fn();
  const groupCall = {pinnedSource};
  const instance = new GroupCallConnectionInstance({
    streamManager: {} as any,
    groupCall: groupCall as any,
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
  entries.push({type: 'video', direction: 'inactive', source: 300, endpoint: 'gone'});
  (instance as any).description = {entries};

  const lastSent = () => JSON.parse(send.mock.calls[send.mock.calls.length - 1][0]);
  const request = () => {
    instance.maybeUpdateRemoteVideoConstraints();
    clearInterval((instance as any).updateConstraintsInterval);
    (instance as any).updateConstraintsInterval = undefined;
    return lastSent();
  };
  return {instance, request, send, groupCall, lastSent};
}

afterEach(() => {
  vi.useRealTimers();
});

describe('GroupCallConnectionInstance remote video constraints', () => {
  it('asks for the pinned video in full and every other tile as a thumbnail', () => {
    const {request} = makeConnection(7);
    const obj = request();

    expect(obj.colibriClass).toBe('ReceiverVideoConstraints');
    expect(obj.defaultConstraints).toEqual({maxHeight: 0});
    expect(obj.onStageEndpoints).toEqual(['video7']);
    expect(obj.constraints.video7).toEqual({minHeight: 180, maxHeight: 720});
    expect(obj.constraints.video1).toEqual({minHeight: 180, maxHeight: 180});
    // Bounded: 16 endpoints, the pinned one first.
    expect(Object.keys(obj.constraints)).toHaveLength(16);
    expect(obj.constraints.video20).toBeUndefined();
    expect(obj.constraints.audio).toBeUndefined();
    expect(obj.constraints.own).toBeUndefined();
    expect(obj.constraints.gone).toBeUndefined();
  });

  it('requests medium quality for every tile and puts none on stage when nothing is pinned', () => {
    const {request} = makeConnection();
    const obj = request();

    expect(obj.onStageEndpoints).toEqual([]);
    expect(Object.keys(obj.constraints)).toEqual(Array.from({length: 16}, (_, i) => `video${i + 1}`));
    for(const endpoint of Object.keys(obj.constraints)) {
      expect(obj.constraints[endpoint]).toEqual({minHeight: 180, maxHeight: 360});
    }
  });

  it('turns the grid into thumbnails while our own video is pinned', () => {
    const {request} = makeConnection('main');
    const obj = request();

    expect(obj.onStageEndpoints).toEqual([]);
    expect(obj.constraints.video1).toEqual({minHeight: 180, maxHeight: 180});
  });

  it('sends a pin change after a short debounce instead of waiting for the periodic resend', () => {
    vi.useFakeTimers();
    const {instance, send, groupCall, lastSent} = makeConnection();

    groupCall.pinnedSource = 3;
    instance.scheduleRemoteVideoConstraintsUpdate();
    groupCall.pinnedSource = 4;
    instance.scheduleRemoteVideoConstraintsUpdate();
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(lastSent().constraints.video4).toEqual({minHeight: 180, maxHeight: 720});

    // The periodic resend stays as a safety net.
    vi.advanceTimersByTime(5000);
    expect(send).toHaveBeenCalledTimes(2);
    instance.closeConnection();
  });

  it('does not throw for a connection without a data channel (screen sharing)', () => {
    const {instance} = makeConnection(7);
    (instance as any).dataChannel = undefined;
    expect(() => instance.maybeUpdateRemoteVideoConstraints()).not.toThrow();
  });
});

describe('GroupCallConnectionInstance constraints timer lifetime', () => {
  it('stops the timer when the connection closes without a data-channel close event', () => {
    vi.useFakeTimers();
    const {instance, send} = makeConnection(7);
    instance.maybeUpdateRemoteVideoConstraints();
    expect((instance as any).updateConstraintsInterval).toBeDefined();
    instance.scheduleRemoteVideoConstraintsUpdate();

    // pc.close() does not reliably fire the channel's `close`; the override
    // must not depend on it.
    instance.closeConnection();

    expect((instance as any).updateConstraintsInterval).toBeUndefined();
    const sentBeforeClose = send.mock.calls.length;
    vi.advanceTimersByTime(30000);
    expect(send).toHaveBeenCalledTimes(sentBeforeClose);
  });
});
