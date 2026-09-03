/*
 * Our own participant row in a legacy (SFU) group call.
 *
 * - A `left` self row (an admin removed us) was ignored: the call only ended
 *   once ICE timed out 15-30 s later, and an unmuted microphone kept feeding
 *   our SFU slot meanwhile while the popup still showed "unmuted".
 * - An admin lifting our forced mute produced no cue at all — we stay muted
 *   (correct), but nothing told the user the microphone button worked again.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const cue = vi.hoisted(() => ({notifyAllowedToSpeak: vi.fn()}));
vi.mock('@components/groupCall/allowedToSpeakCue', () => ({default: cue.notifyAllowedToSpeak}));

import GroupCallInstance from '@lib/calls/groupCallInstance';

class FakeTrack extends EventTarget {
  public readonly kind = 'audio';
  public enabled = true;
  public muted = false;
  public readyState: MediaStreamTrackState = 'live';
}

function makeInstance() {
  const audioTrack = new FakeTrack();
  const managers: any = {
    appGroupCallsManager: {hangUp: vi.fn(async() => {})},
    appCallsManager: {},
    apiUpdatesManager: {processUpdateMessage: vi.fn()}
  };
  const main: any = {
    connection: {iceConnectionState: 'connected'},
    streamManager: {
      inputStream: {getAudioTracks: () => [audioTrack], getVideoTracks: (): unknown[] => []},
      hasInputTrackKind: vi.fn(() => false),
      stop: vi.fn()
    },
    description: {},
    sources: {audio: {source: 1}},
    closeConnectionAndStream: vi.fn()
  };
  const instance = new GroupCallInstance({id: 'self-row' as any, chatId: 0 as any, managers});
  (instance as any).connections = {main};
  instance.joined = true;
  const hangUp = vi.spyOn(instance, 'hangUp').mockResolvedValue(undefined);
  return {instance, audioTrack, main, hangUp};
}

function selfRow(pFlags: Record<string, true>) {
  return {
    _: 'groupCallParticipant',
    peer: {_: 'peerUser', user_id: '42'},
    pFlags: {self: true, ...pFlags},
    source: 1,
    date: 1
  } as any;
}

describe('GroupCallInstance self participant row', () => {
  const instances: GroupCallInstance[] = [];

  afterEach(() => {
    for(const instance of instances.splice(0)) instance.cleanup();
    cue.notifyAllowedToSpeak.mockClear();
    vi.restoreAllMocks();
  });

  it('cuts the microphone synchronously and leaves when the server reports us as left', () => {
    const {instance, audioTrack, hangUp} = makeInstance();
    instances.push(instance);
    instance.onParticipantUpdate(selfRow({can_self_unmute: true}));
    expect(audioTrack.enabled).toBe(true);

    instance.onParticipantUpdate(selfRow({left: true, can_self_unmute: true}));

    expect(audioTrack.enabled).toBe(false);
    expect(hangUp).toHaveBeenCalledTimes(1);

    // A repeated row must not start a second leave.
    instance.onParticipantUpdate(selfRow({left: true, can_self_unmute: true}));
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it('ignores a self left row while our own leave is already closing the connection', () => {
    const {instance, main, hangUp} = makeInstance();
    instances.push(instance);
    main.connection.iceConnectionState = 'closed';

    instance.onParticipantUpdate(selfRow({left: true, can_self_unmute: true}));

    expect(hangUp).not.toHaveBeenCalled();
  });

  it('plays the allowed-to-speak cue exactly once when an admin lifts the forced mute', () => {
    const {instance, audioTrack} = makeInstance();
    instances.push(instance);

    instance.onParticipantUpdate(selfRow({muted: true}));
    expect(cue.notifyAllowedToSpeak).not.toHaveBeenCalled();
    expect(audioTrack.enabled).toBe(false);

    instance.onParticipantUpdate(selfRow({muted: true, can_self_unmute: true}));
    expect(cue.notifyAllowedToSpeak).toHaveBeenCalledTimes(1);
    // We stay muted until the user unmutes — the cue is the only signal.
    expect(audioTrack.enabled).toBe(false);

    instance.onParticipantUpdate(selfRow({muted: true, can_self_unmute: true}));
    instance.onParticipantUpdate(selfRow({can_self_unmute: true}));
    expect(cue.notifyAllowedToSpeak).toHaveBeenCalledTimes(1);
  });

  it('does not cue for a first row that already allows speaking, nor before the call has joined', () => {
    const {instance} = makeInstance();
    instances.push(instance);
    instance.onParticipantUpdate(selfRow({muted: true, can_self_unmute: true}));
    expect(cue.notifyAllowedToSpeak).not.toHaveBeenCalled();

    const {instance: unjoined} = makeInstance();
    instances.push(unjoined);
    unjoined.joined = false;
    unjoined.onParticipantUpdate(selfRow({muted: true}));
    unjoined.onParticipantUpdate(selfRow({muted: true, can_self_unmute: true}));
    expect(cue.notifyAllowedToSpeak).not.toHaveBeenCalled();
  });
});
