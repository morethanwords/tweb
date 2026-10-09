/*
 * "Speaking" in a group call used to mean "unmuted", and a 100 ms analyser loop
 * ran over every remote track with nobody listening. Now remote speech comes
 * from the RTP audio-level extension (RTCRtpReceiver.getSynchronizationSources),
 * ours from one analyser on the microphone, with a hold so the indicator does
 * not flicker — and only while the participant list is on screen.
 *
 * The same participant rows carry the per-viewer volume and muted_by_you that
 * playback now applies, and after a transport rejoin our own rows of the
 * previous connection must not end the call.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const cue = vi.hoisted(() => ({notifyAllowedToSpeak: vi.fn()}));
vi.mock('@components/groupCall/allowedToSpeakCue', () => ({default: cue.notifyAllowedToSpeak}));
vi.mock('@helpers/dom/safePlay', () => ({default: vi.fn()}));

import SpeakingDetector, {SPEAKING_HOLD_MS, SPEAKING_POLL_INTERVAL_MS} from '@lib/calls/helpers/speakingDetector';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import LocalConferenceDescription from '@lib/calls/localConferenceDescription';
import {getOutputAudioElementKey} from '@lib/calls/callInstanceBase';

class FakeTrack extends EventTarget {
  public enabled = true;
  public muted = false;
  public readyState: MediaStreamTrackState = 'live';

  constructor(public readonly kind: 'audio' | 'video' = 'audio') {
    super();
  }
}

type FakeSource = {source: number, audioLevel?: number, timestamp: number};

function makeInstance() {
  const audioTrack = new FakeTrack();
  let inputLevel = 0;
  const receivers = new Map<number, {getSynchronizationSources: ReturnType<typeof vi.fn>}>();
  const levels = new Map<number, FakeSource[]>();
  const connection = {
    iceConnectionState: 'connected',
    addTransceiver: vi.fn((kind: string) => {
      const index = receivers.size;
      const receiver = {
        getSynchronizationSources: vi.fn((): FakeSource[] => levels.get(index) ?? [])
      };
      receivers.set(index, receiver);
      return {receiver, sender: {}, mid: null as string, direction: 'recvonly', kind};
    })
  };
  const description = new LocalConferenceDescription(connection as any);
  const managers: any = {
    appGroupCallsManager: {
      hangUp: vi.fn(async() => {}),
      getCachedParticipants: vi.fn(async() => new Map())
    },
    appCallsManager: {},
    apiUpdatesManager: {processUpdateMessage: vi.fn()}
  };
  const main: any = {
    connection,
    streamManager: {
      inputStream: {getAudioTracks: () => [audioTrack], getVideoTracks: (): unknown[] => []},
      hasInputTrackKind: vi.fn(() => true),
      getInputAudioLevel: vi.fn(() => inputLevel),
      addTrack: vi.fn(),
      stop: vi.fn()
    },
    description,
    sources: {audio: {source: 1}},
    requestNegotiation: vi.fn(async() => {}),
    scheduleRemoteVideoConstraintsUpdate: vi.fn(),
    closeConnectionAndStream: vi.fn(),
    closeConnection: vi.fn()
  };
  const instance = new GroupCallInstance({id: 'speaking' as any, chatId: 0 as any, managers});
  (instance as any).connections = {main};
  instance.joined = true;
  const hangUp = vi.spyOn(instance, 'hangUp').mockResolvedValue(undefined);
  const setRemoteLevel = (receiverIndex: number, audioLevel: number | undefined, ageMs = 0) => {
    levels.set(receiverIndex, [{
      source: 1000 + receiverIndex,
      audioLevel,
      get timestamp() {
        return performance.timeOrigin + performance.now() - ageMs;
      }
    }]);
  };
  return {
    instance,
    main,
    audioTrack,
    receivers,
    hangUp,
    setRemoteLevel,
    setInputLevel: (level: number) => inputLevel = level
  };
}

function remoteRow(userId: number, source: number, pFlags: Record<string, true> = {}, extra: Record<string, unknown> = {}) {
  return {
    _: 'groupCallParticipant',
    peer: {_: 'peerUser', user_id: userId},
    pFlags: {can_self_unmute: true, ...pFlags},
    source,
    date: 1,
    ...extra
  } as any;
}

function selfRow(source: number, pFlags: Record<string, true> = {}) {
  return {
    _: 'groupCallParticipant',
    peer: {_: 'peerUser', user_id: 42},
    pFlags: {self: true, can_self_unmute: true, ...pFlags},
    source,
    date: 1
  } as any;
}

const instances: GroupCallInstance[] = [];
afterEach(() => {
  for(const instance of instances.splice(0)) instance.cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SpeakingDetector', () => {
  it('marks a key on the first loud sample and releases it after the hold', () => {
    let now = 0;
    let level = 0;
    const onChange = vi.fn();
    const detector = new SpeakingDetector<string>({
      sample: () => [['a', level]],
      onChange,
      now: () => now
    });

    detector.tick();
    expect(onChange).not.toHaveBeenCalled();

    level = 0.2;
    detector.tick();
    expect(onChange).toHaveBeenLastCalledWith('a', true);
    expect(detector.isSpeaking('a')).toBe(true);

    // Gaps between syllables do not flicker the indicator.
    level = 0;
    now += SPEAKING_HOLD_MS - 1;
    detector.tick();
    expect(onChange).toHaveBeenCalledTimes(1);

    now += 2;
    detector.tick();
    expect(onChange).toHaveBeenLastCalledWith('a', false);
    expect(detector.isSpeaking('a')).toBe(false);
  });

  it('survives a sampler that throws and reports everyone silent when stopped', () => {
    const onChange = vi.fn();
    let fail = false;
    const detector = new SpeakingDetector<string>({
      sample: () => {
        if(fail) throw new Error('teardown');
        return [['a', 1]];
      },
      onChange,
      now: () => 0
    });
    detector.tick();
    fail = true;
    expect(() => detector.tick()).not.toThrow();
    detector.stop();
    expect(onChange).toHaveBeenLastCalledWith('a', false);
  });
});

describe('GroupCallInstance speaking', () => {
  it('reports a remote participant speaking from the RTP audio level, not from the mute flag', async() => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance']});
    const {instance, setRemoteLevel} = makeInstance();
    instances.push(instance);
    instance.onParticipantUpdate(remoteRow(5, 500));
    const changes: Array<{peerId: PeerId, speaking: boolean}> = [];
    instance.addEventListener('speaking', (change) => changes.push(change));
    const release = instance.watchSpeaking();

    // Unmuted but silent: not speaking.
    setRemoteLevel(0, 0.01);
    vi.advanceTimersByTime(SPEAKING_POLL_INTERVAL_MS * 3);
    expect(changes).toEqual([]);
    expect(instance.isSpeaking(5 as PeerId)).toBe(false);

    setRemoteLevel(0, 0.3);
    vi.advanceTimersByTime(SPEAKING_POLL_INTERVAL_MS);
    expect(changes).toEqual([{peerId: 5, speaking: true}]);
    expect(instance.isSpeaking(5 as PeerId)).toBe(true);

    // A source that stopped delivering packets keeps its last level; it must
    // not keep the participant speaking.
    setRemoteLevel(0, 0.3, 5000);
    vi.advanceTimersByTime(SPEAKING_HOLD_MS + SPEAKING_POLL_INTERVAL_MS * 2);
    expect(changes).toEqual([{peerId: 5, speaking: true}, {peerId: 5, speaking: false}]);
    release();
  });

  it('does not read the receivers of muted participants and stops polling when unwatched', () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance']});
    const {instance, receivers} = makeInstance();
    instances.push(instance);
    instance.onParticipantUpdate(remoteRow(5, 500, {muted: true}));
    const receiver = receivers.get(0);

    // Nothing is sampled until the list is on screen.
    vi.advanceTimersByTime(1000);
    expect(receiver.getSynchronizationSources).not.toHaveBeenCalled();

    const release = instance.watchSpeaking();
    vi.advanceTimersByTime(1000);
    expect(receiver.getSynchronizationSources).not.toHaveBeenCalled();

    instance.onParticipantUpdate(remoteRow(5, 500));
    vi.advanceTimersByTime(SPEAKING_POLL_INTERVAL_MS);
    expect(receiver.getSynchronizationSources).toHaveBeenCalled();

    release();
    receiver.getSynchronizationSources.mockClear();
    vi.advanceTimersByTime(1000);
    expect(receiver.getSynchronizationSources).not.toHaveBeenCalled();
  });

  it('reports our own speech from the microphone only while capture is open', () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance']});
    const {instance, audioTrack, setInputLevel} = makeInstance();
    instances.push(instance);
    instance.onParticipantUpdate(selfRow(1));
    const release = instance.watchSpeaking();

    setInputLevel(0.4);
    vi.advanceTimersByTime(SPEAKING_POLL_INTERVAL_MS);
    expect(instance.isSpeaking(42 as PeerId)).toBe(true);

    audioTrack.enabled = false;
    vi.advanceTimersByTime(SPEAKING_HOLD_MS + SPEAKING_POLL_INTERVAL_MS * 2);
    expect(instance.isSpeaking(42 as PeerId)).toBe(false);
    release();
  });
});

describe('GroupCallInstance participant playback', () => {
  it('plays a participant at their per-viewer volume, clamped at 100%, and honours muted_by_you', async() => {
    const {instance} = makeInstance();
    instances.push(instance);
    instance.onParticipantUpdate(remoteRow(5, 500, {}, {volume: 5000}));
    const track = new FakeTrack();
    instance.tryAddTrack({
      stream: {id: 'stream500', getTracks: () => [track]} as any,
      track: track as any,
      type: 'output',
      source: '500'
    });
    const element = instance.getElement(getOutputAudioElementKey(500) as any) as HTMLAudioElement;
    expect(element.volume).toBeCloseTo(0.5);
    expect(element.muted).toBe(false);

    instance.onParticipantUpdate(remoteRow(5, 500, {muted_by_you: true}, {volume: 15000}));
    expect(element.volume).toBe(1);
    expect(element.muted).toBe(true);

    instance.onParticipantUpdate(remoteRow(5, 500));
    expect(element.volume).toBe(1);
    expect(element.muted).toBe(false);

    // A `min` row reaches the instance merged by the manager
    // (keepPersonalFieldsFromCachedParticipant): an admin's volume rides on it
    // and must apply.
    instance.onParticipantUpdate(remoteRow(5, 500, {min: true, volume_by_admin: true}, {volume: 2500}));
    expect(element.volume).toBeCloseTo(0.25);
  });

  it('frees a participant\'s audio element once their entry is removed, and all of them on a rejoin', () => {
    const {instance, main} = makeInstance();
    instances.push(instance);
    const addTrack = (userId: number, source: number) => {
      instance.onParticipantUpdate(remoteRow(userId, source));
      const entry = main.description.getEntryBySource(source);
      const track = new FakeTrack();
      entry.transceiver.receiver.track = track;
      instance.tryAddTrack({
        stream: {id: 'stream' + source, getTracks: () => [track]} as any,
        track: track as any,
        type: 'output',
        source: '' + source
      });
      return {entry, element: instance.getElement(getOutputAudioElementKey(source) as any) as HTMLAudioElement};
    };
    const first = addTrack(5, 500);
    const second = addTrack(6, 600);

    // Left: the entry goes inactive, the next answer rejects it, and the
    // negotiation hands the removed entries over.
    instance.onParticipantUpdate(remoteRow(5, 500, {left: true}));
    expect(first.entry.direction).toBe('inactive');
    instance.releaseRemovedEntries([first.entry]);
    expect(instance.getElement(getOutputAudioElementKey(500) as any)).toBeUndefined();
    expect(first.element.isConnected).toBe(false);
    expect(second.element.isConnected).toBe(true);

    // A rebuilt connection starts from nothing: every remote element goes.
    instance.prepareMainConnectionRejoin();
    expect(instance.getElement(getOutputAudioElementKey(600) as any)).toBeUndefined();
    expect(second.element.isConnected).toBe(false);
  });

  it('frees the video element of a removed video entry too', () => {
    const {instance, main} = makeInstance();
    instances.push(instance);
    instance.onParticipantUpdate(remoteRow(7, 700, {}, {
      video: {
        _: 'groupCallParticipantVideo',
        pFlags: {},
        endpoint: 'endpoint7',
        source_groups: [{_: 'groupCallParticipantVideoSourceGroup', semantics: 'SIM', sources: [710]}]
      }
    }));
    const entry = main.description.getEntryBySource(710);
    expect(entry.type).toBe('video');
    const track = new FakeTrack('video');
    entry.transceiver.receiver.track = track;
    instance.tryAddTrack({
      stream: {id: 'stream710', getTracks: () => [track]} as any,
      track: track as any,
      type: 'output',
      source: '710'
    });
    expect(instance.getElement(710)).toBeDefined();

    instance.releaseRemovedEntries([entry]);
    expect(instance.getElement(710)).toBeUndefined();
  });
});

describe('GroupCallInstance self rows across a transport rejoin', () => {
  it('ignores rows of our previous connection and keeps the call', () => {
    const {instance, main, hangUp} = makeInstance();
    instances.push(instance);
    instance.onParticipantUpdate(selfRow(1));
    const current = instance.participant;

    const replaced = instance.prepareMainConnectionRejoin();
    expect(replaced).toBe(main);
    main.sources = {audio: {source: 2}};

    instance.onParticipantUpdate(selfRow(1));
    instance.onParticipantUpdate(selfRow(1, {left: true}));

    expect(hangUp).not.toHaveBeenCalled();
    expect(instance.participant).toBe(current);

    instance.onParticipantUpdate(selfRow(2));
    expect(instance.participant.source).toBe(2);
    expect(hangUp).not.toHaveBeenCalled();
  });

  it('still leaves when a source we never used shows up (joined from another device)', () => {
    const {instance, hangUp} = makeInstance();
    instances.push(instance);
    instance.onParticipantUpdate(selfRow(1));

    instance.onParticipantUpdate(selfRow(9));

    expect(hangUp).toHaveBeenCalledTimes(1);
  });
});
