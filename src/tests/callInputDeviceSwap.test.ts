import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  appSettings: {callDevices: {speakerId: ''}},
  getStream: vi.fn(),
  getUserStream: vi.fn(),
  invokeCrypto: vi.fn()
}));

vi.mock('@helpers/dom/safePlay', () => ({default: vi.fn()}));
vi.mock('@environment/webpSupport', () => ({default: true}));
vi.mock('@lib/calls/helpers/getAudioConstraints', () => ({
  default: (deviceId?: string) => ({deviceId})
}));
vi.mock('@lib/calls/helpers/getStream', () => ({default: mocks.getStream}));
vi.mock('@lib/calls/p2P/utils', async(importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/calls/p2P/utils')>();
  return {...actual, getUserStream: mocks.getUserStream};
});
vi.mock('@lib/calls/helpers/getStreamCached', () => ({default: () => vi.fn()}));
vi.mock('@lib/calls/helpers/stopTrack', () => ({
  default: (track: {stop: () => void}) => track.stop()
}));
vi.mock('@lib/calls/localConferenceDescription', () => ({default: class LocalConferenceDescription {}}));
vi.mock('@lib/calls/streamManager', () => ({default: class StreamManager {}}));
vi.mock('@lib/calls/callsController', () => ({default: {}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {invokeCrypto: mocks.invokeCrypto}}));
vi.mock('@stores/appSettings', () => ({appSettings: mocks.appSettings}));

import CallInstanceBase from '@lib/calls/callInstanceBase';
import CallInstance from '@lib/calls/callInstance';
import CALL_STATE from '@lib/calls/callState';
import deferred from './helpers/deferred';
import createSerializedQueue from '@helpers/createSerializedQueue';

type FakeTrack = MediaStreamTrack & {enabled: boolean, stop: ReturnType<typeof vi.fn>};

function makeTrack(kind: 'audio' | 'video' = 'audio'): FakeTrack {
  return {
    enabled: true,
    kind,
    stop: vi.fn()
  } as unknown as FakeTrack;
}

function makeP2pInstance(oldTrack: FakeTrack) {
  const oldStream = makeStream(oldTrack);
  const fallbackTrack = makeTrack();
  fallbackTrack.enabled = false;
  const fallbackStream = makeStream(fallbackTrack);
  const sender = {
    track: oldTrack as MediaStreamTrack,
    replaceTrack: vi.fn(async(track: MediaStreamTrack) => {
      sender.track = track;
    })
  };
  const state = {
    senders: {audio: sender},
    silence: fallbackStream,
    streams: {ownAudio: oldStream},
    transceivers: {audio: {currentDirection: 'sendrecv', direction: 'sendrecv'}}
  };
  const instance = Object.assign(Object.create(CallInstance.prototype), {
    dispatchEvent: vi.fn(),
    log: Object.assign(vi.fn(), {warn: vi.fn()}),
    mediaDeviceChangeGenerations: {audio: 0, output: 0, video: 0},
    mediaDeviceChangeQueues: {
      audio: createSerializedQueue(),
      output: createSerializedQueue(),
      video: createSerializedQueue()
    },
    pendingInputAudioTracks: new Set<MediaStreamTrack>(),
    p2p: state,
    p2pConnectionState: 'connected',
    sendLocalMediaState: vi.fn(),
    updateStreams: vi.fn(),
    videoElements: new Map()
  }) as CallInstance;

  return {instance, sender, state};
}

function makeStream(track: FakeTrack): MediaStream {
  return {
    getAudioTracks: () => track.kind === 'audio' ? [track] : [],
    getVideoTracks: () => track.kind === 'video' ? [track] : [],
    getTracks: () => [track]
  } as unknown as MediaStream;
}


class TestCallInstance extends CallInstanceBase<Record<never, never>> {
  public closing = false;
  public muted = false;

  constructor(
    private manager: {
      inputStream: {getAudioTracks: () => FakeTrack[]},
      hasInputTrackKind: (kind: string) => boolean,
      replaceInputAudio: ReturnType<typeof vi.fn>,
      stop: ReturnType<typeof vi.fn>
    },
    private replaceTrack: (
      kind: 'audio' | 'video',
      oldTrack: MediaStreamTrack,
      newTrack: MediaStreamTrack
    ) => Promise<void>
  ) {
    super();
  }

  public get streamManager() {
    return this.manager as any;
  }

  public get description() {
    return {} as any;
  }

  public get isMuted() {
    return this.muted;
  }

  public get isClosing() {
    return this.closing;
  }

  public toggleMuted(): Promise<void> {
    return Promise.resolve();
  }

  protected replaceSenderTrack(
    kind: 'audio' | 'video',
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack
  ): Promise<void> {
    return this.replaceTrack(kind, oldTrack, newTrack);
  }
}

function createHarness() {
  const oldTrack = makeTrack();
  const newTrack = makeTrack();
  let currentTrack = oldTrack;
  const manager = {
    inputStream: {getAudioTracks: () => [currentTrack]},
    hasInputTrackKind: () => true,
    replaceInputAudio: vi.fn((stream: MediaStream) => {
      currentTrack = stream.getAudioTracks()[0] as FakeTrack;
    }),
    stop: vi.fn()
  };
  const replaceTrack = vi.fn().mockResolvedValue(undefined);
  const instance = new TestCallInstance(manager, replaceTrack);
  mocks.getStream.mockResolvedValue(makeStream(newTrack));

  return {getCurrentTrack: () => currentTrack, instance, manager, newTrack, oldTrack, replaceTrack};
}

function createVideoHarness() {
  const oldTrack = makeTrack('video');
  const newTrack = makeTrack('video');
  let currentTrack = oldTrack;
  const manager = {
    inputStream: {
      getAudioTracks: (): FakeTrack[] => [],
      getVideoTracks: () => [currentTrack]
    },
    hasInputTrackKind: (kind: string) => kind === 'video',
    replaceInputAudio: vi.fn(),
    removeTrack: vi.fn(),
    addTrack: vi.fn((_stream: MediaStream, track: FakeTrack) => {
      currentTrack = track;
    }),
    stop: vi.fn()
  };
  const replaceTrack = vi.fn().mockResolvedValue(undefined);
  const instance = new TestCallInstance(manager, replaceTrack);
  mocks.getStream.mockResolvedValue(makeStream(newTrack));

  return {getCurrentTrack: () => currentTrack, instance, manager, newTrack, oldTrack, replaceTrack};
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appSettings.callDevices.speakerId = '';
  mocks.getUserStream.mockReset();
  mocks.getUserStream.mockImplementation(() => mocks.getStream());
  mocks.invokeCrypto.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('P2P emoji fingerprint derivation', () => {
  it('clears a rejected in-flight derivation so a later popup can retry', async() => {
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      dh: {g_a: new Uint8Array([3])},
      encryptionKey: new Uint8Array([1, 2])
    }) as CallInstance;
    const transientError = new Error('crypto worker unavailable');
    mocks.invokeCrypto.mockRejectedValueOnce(transientError).mockResolvedValueOnce([
      '1f600',
      '1f603',
      '1f604',
      '1f601'
    ]);

    await expect(instance.getEmojisFingerprint()).rejects.toBe(transientError);
    await expect(instance.getEmojisFingerprint()).resolves.toHaveLength(4);

    expect(mocks.invokeCrypto).toHaveBeenCalledTimes(2);
  });
});

describe('mid-call microphone device swap', () => {
  it('rejects acquisition failure so settings can roll back', async() => {
    const {instance, manager, replaceTrack} = createHarness();
    const error = new Error('permission denied');
    mocks.getStream.mockRejectedValue(error);

    await expect(instance.setInputAudioDeviceId('new-mic')).rejects.toBe(error);
    expect(replaceTrack).not.toHaveBeenCalled();
    expect(manager.replaceInputAudio).not.toHaveBeenCalled();
    instance.cleanup();
  });

  it('rolls sender changes back and rejects when replacement fails', async() => {
    const {instance, manager, newTrack, oldTrack, replaceTrack} = createHarness();
    const error = new Error('replaceTrack failed');
    replaceTrack.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);

    await expect(instance.setInputAudioDeviceId('new-mic')).rejects.toBe(error);
    expect(replaceTrack).toHaveBeenNthCalledWith(1, 'audio', oldTrack, newTrack);
    expect(replaceTrack).toHaveBeenNthCalledWith(2, 'audio', newTrack, oldTrack);
    expect(manager.replaceInputAudio).not.toHaveBeenCalled();
    expect(newTrack.stop).toHaveBeenCalledTimes(1);
    expect(oldTrack.stop).not.toHaveBeenCalled();
    instance.cleanup();
  });

  it('commits the new input only after sender replacement succeeds', async() => {
    const {instance, manager, newTrack, oldTrack, replaceTrack} = createHarness();

    await instance.setInputAudioDeviceId('new-mic');

    expect(replaceTrack).toHaveBeenCalledWith('audio', oldTrack, newTrack);
    expect(manager.replaceInputAudio).toHaveBeenCalledWith(expect.anything(), oldTrack);
    expect(oldTrack.stop).toHaveBeenCalledTimes(1);
    expect(newTrack.stop).not.toHaveBeenCalled();
    instance.cleanup();
  });

  it('keeps a replacement microphone disabled while the call is muted', async() => {
    const {instance, newTrack, oldTrack, replaceTrack} = createHarness();
    oldTrack.enabled = false;

    await instance.setInputAudioDeviceId('new-mic');

    expect(replaceTrack).toHaveBeenCalledWith('audio', oldTrack, newTrack);
    expect(newTrack.enabled).toBe(false);
    instance.cleanup();
  });

  it.each([
    ['mute', true, true, false],
    ['unmute', false, false, true]
  ] as const)('applies %s to a microphone replacement while sender replacement is pending', async(
    _title,
    oldTrackEnabled,
    muted,
    expectedEnabled
  ) => {
    const {instance, newTrack, oldTrack, replaceTrack} = createHarness();
    const replacement = deferred<void>();
    oldTrack.enabled = oldTrackEnabled;
    replaceTrack.mockReturnValueOnce(replacement.promise);

    const change = instance.setInputAudioDeviceId('new-mic');
    await vi.waitFor(() => expect(replaceTrack).toHaveBeenCalledWith('audio', oldTrack, newTrack));

    instance.setMuted(muted);

    expect(oldTrack.enabled).toBe(expectedEnabled);
    expect(newTrack.enabled).toBe(expectedEnabled);

    replacement.resolve();
    await expect(change).resolves.toBe(true);
    expect(newTrack.enabled).toBe(expectedEnabled);
    instance.cleanup();
  });

  it('drops an older acquisition that resolves after the newer device committed', async() => {
    const {getCurrentTrack, instance, manager, oldTrack, replaceTrack} = createHarness();
    const trackA = makeTrack();
    const trackB = makeTrack();
    const acquireA = deferred<MediaStream>();
    const acquireB = deferred<MediaStream>();
    mocks.getStream.mockReturnValueOnce(acquireA.promise).mockReturnValueOnce(acquireB.promise);

    const changeA = instance.setInputAudioDeviceId('mic-a');
    const changeB = instance.setInputAudioDeviceId('mic-b');
    acquireB.resolve(makeStream(trackB));
    await expect(changeB).resolves.toBe(true);
    acquireA.resolve(makeStream(trackA));
    await expect(changeA).resolves.toBe(false);

    expect(replaceTrack).toHaveBeenCalledTimes(1);
    expect(replaceTrack).toHaveBeenCalledWith('audio', oldTrack, trackB);
    expect(manager.replaceInputAudio).toHaveBeenCalledTimes(1);
    expect(getCurrentTrack()).toBe(trackB);
    expect(trackA.stop).toHaveBeenCalledTimes(1);
    expect(trackB.stop).not.toHaveBeenCalled();
    instance.cleanup();
  });

  it('rolls an in-flight stale sender replacement back before applying the newer device', async() => {
    const {getCurrentTrack, instance, manager, oldTrack, replaceTrack} = createHarness();
    const trackA = makeTrack();
    const trackB = makeTrack();
    const replacementA = deferred<void>();
    mocks.getStream.mockResolvedValueOnce(makeStream(trackA)).mockResolvedValueOnce(makeStream(trackB));
    replaceTrack.mockReset()
    .mockReturnValueOnce(replacementA.promise)
    .mockResolvedValue(undefined);

    const changeA = instance.setInputAudioDeviceId('mic-a');
    await vi.waitFor(() => expect(replaceTrack).toHaveBeenCalledTimes(1));
    const changeB = instance.setInputAudioDeviceId('mic-b');
    replacementA.resolve();

    await expect(changeA).resolves.toBe(false);
    await expect(changeB).resolves.toBe(true);
    expect(replaceTrack).toHaveBeenNthCalledWith(1, 'audio', oldTrack, trackA);
    expect(replaceTrack).toHaveBeenNthCalledWith(2, 'audio', trackA, oldTrack);
    expect(replaceTrack).toHaveBeenNthCalledWith(3, 'audio', oldTrack, trackB);
    expect(manager.replaceInputAudio).toHaveBeenCalledTimes(1);
    expect(getCurrentTrack()).toBe(trackB);
    expect(trackA.stop).toHaveBeenCalledTimes(1);
    expect(trackB.stop).not.toHaveBeenCalled();
    instance.cleanup();
  });

  it('releases a replacement that completes after hangup instead of committing it', async() => {
    const {instance, manager, newTrack, oldTrack, replaceTrack} = createHarness();
    const replacement = deferred<void>();
    replaceTrack.mockReturnValueOnce(replacement.promise);

    const change = instance.setInputAudioDeviceId('new-mic');
    await vi.waitFor(() => expect(replaceTrack).toHaveBeenCalledWith('audio', oldTrack, newTrack));
    instance.closing = true;
    instance.cleanup();

    expect(newTrack.stop).toHaveBeenCalledTimes(1);
    replacement.resolve();

    await expect(change).resolves.toBe(true);
    expect(manager.replaceInputAudio).not.toHaveBeenCalled();
    expect(newTrack.stop).toHaveBeenCalled();
    expect(oldTrack.stop).not.toHaveBeenCalled();
  });
});

describe('speaker device swap', () => {
  it('applies the persisted sink to the base group-call audio element', async() => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'setSinkId');
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
      configurable: true,
      value: setSinkId
    });
    mocks.appSettings.callDevices.speakerId = 'speaker-saved';
    const {instance} = createHarness();

    try {
      await vi.waitFor(() => expect(setSinkId).toHaveBeenCalledWith('speaker-saved'));
      expect((instance as any).outputDeviceId).toBe('speaker-saved');
    } finally {
      instance.cleanup();
      if(originalDescriptor) {
        Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', originalDescriptor);
      } else {
        delete (HTMLMediaElement.prototype as any).setSinkId;
      }
    }
  });

  it('keeps the browser default as committed when the persisted sink is unavailable', async() => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'setSinkId');
    const error = new Error('saved speaker unavailable');
    const setSinkId = vi.fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
      configurable: true,
      value: setSinkId
    });
    mocks.appSettings.callDevices.speakerId = 'speaker-stale';
    const {instance} = createHarness();

    try {
      await vi.waitFor(() => expect(setSinkId).toHaveBeenCalledTimes(2));
      expect(setSinkId.mock.calls).toEqual([['speaker-stale'], ['']]);
      expect((instance as any).outputDeviceId).toBe('');
    } finally {
      instance.cleanup();
      if(originalDescriptor) {
        Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', originalDescriptor);
      } else {
        delete (HTMLMediaElement.prototype as any).setSinkId;
      }
    }
  });

  it('rolls every element back and rejects when one setSinkId fails', async() => {
    const {instance} = createHarness();
    const error = new Error('speaker unavailable');
    const setSinkA = vi.fn().mockResolvedValue(undefined);
    const setSinkB = vi.fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce(undefined);
    (instance as any).elements = new Map([
      ['a', {setSinkId: setSinkA}],
      ['b', {setSinkId: setSinkB}]
    ]);

    await expect(instance.setOutputDeviceId('speaker-b')).rejects.toBe(error);

    expect(setSinkA).toHaveBeenNthCalledWith(1, 'speaker-b');
    expect(setSinkA).toHaveBeenNthCalledWith(2, '');
    expect(setSinkB).toHaveBeenNthCalledWith(1, 'speaker-b');
    expect(setSinkB).toHaveBeenNthCalledWith(2, '');
    instance.cleanup();
  });

  it('serializes rapid output selections and leaves the latest sink applied', async() => {
    const {instance} = createHarness();
    const firstSinkChange = deferred<void>();
    const setSinkId = vi.fn()
    .mockReturnValueOnce(firstSinkChange.promise)
    .mockResolvedValue(undefined);
    (instance as any).elements = new Map([['audio', {setSinkId}]]);

    const changeA = instance.setOutputDeviceId('speaker-a');
    await vi.waitFor(() => expect(setSinkId).toHaveBeenCalledWith('speaker-a'));
    const changeB = instance.setOutputDeviceId('speaker-b');
    firstSinkChange.resolve();

    await expect(changeA).resolves.toBe(false);
    await expect(changeB).resolves.toBe(true);
    expect(setSinkId.mock.calls).toEqual([
      ['speaker-a'],
      [''],
      ['speaker-b']
    ]);
    instance.cleanup();
  });

  it('applies the sink to the real P2P audio element exactly once', async() => {
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    const audio = {setSinkId} as unknown as HTMLAudioElement;
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      elements: new Map([['same-audio', audio]]),
      mediaDeviceChangeGenerations: {audio: 0, output: 0, video: 0},
      mediaDeviceChangeQueues: {
        audio: createSerializedQueue(),
        output: createSerializedQueue(),
        video: createSerializedQueue()
      },
      outputDeviceId: 'speaker-old',
      p2p: {audio}
    }) as CallInstance;

    await expect(instance.setOutputDeviceId('speaker-new')).resolves.toBe(true);

    expect(setSinkId).toHaveBeenCalledTimes(1);
    expect(setSinkId).toHaveBeenCalledWith('speaker-new');
    expect((instance as any).outputDeviceId).toBe('speaker-new');
  });

  it('rolls base and P2P audio sinks back together after a partial failure', async() => {
    const error = new Error('P2P sink unavailable');
    const setBaseSink = vi.fn().mockResolvedValue(undefined);
    const setP2pSink = vi.fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce(undefined);
    const p2pAudio = {setSinkId: setP2pSink} as unknown as HTMLAudioElement;
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      elements: new Map([['base', {setSinkId: setBaseSink}]]),
      mediaDeviceChangeGenerations: {audio: 0, output: 0, video: 0},
      mediaDeviceChangeQueues: {
        audio: createSerializedQueue(),
        output: createSerializedQueue(),
        video: createSerializedQueue()
      },
      outputDeviceId: 'speaker-old',
      p2p: {audio: p2pAudio}
    }) as CallInstance;

    await expect(instance.setOutputDeviceId('speaker-new')).rejects.toBe(error);

    expect(setBaseSink.mock.calls).toEqual([['speaker-new'], ['speaker-old']]);
    expect(setP2pSink.mock.calls).toEqual([['speaker-new'], ['speaker-old']]);
    expect((instance as any).outputDeviceId).toBe('speaker-old');
  });

  it('applies the committed sink when the real P2P audio element is created', async() => {
    const setBaseSink = vi.fn().mockResolvedValue(undefined);
    const setP2pSink = vi.fn().mockResolvedValue(undefined);
    const p2pAudio = {setSinkId: setP2pSink} as unknown as HTMLAudioElement;
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      elements: new Map([['base', {setSinkId: setBaseSink}]]),
      log: {warn: vi.fn()},
      mediaDeviceChangeGenerations: {audio: 0, output: 0, video: 0},
      mediaDeviceChangeQueues: {
        audio: createSerializedQueue(),
        output: createSerializedQueue(),
        video: createSerializedQueue()
      },
      outputDeviceId: 'speaker-saved',
      p2p: {audio: p2pAudio}
    }) as CallInstance;

    (instance as any).applyCurrentOutputDeviceToElement(p2pAudio);
    await (instance as any).mediaDeviceChangeQueues.output.enqueue(async() => {});

    expect(setBaseSink).not.toHaveBeenCalled();
    expect(setP2pSink).toHaveBeenCalledWith('speaker-saved');
  });
});

describe('mid-call camera device swap', () => {
  it('drops an older camera acquisition that resolves after the latest selection', async() => {
    const {getCurrentTrack, instance, manager, oldTrack, replaceTrack} = createVideoHarness();
    const trackA = makeTrack('video');
    const trackB = makeTrack('video');
    const acquireA = deferred<MediaStream>();
    const acquireB = deferred<MediaStream>();
    mocks.getStream.mockReturnValueOnce(acquireA.promise).mockReturnValueOnce(acquireB.promise);

    const changeA = instance.setInputVideoDeviceId('camera-a');
    const changeB = instance.setInputVideoDeviceId('camera-b');
    acquireB.resolve(makeStream(trackB));
    await expect(changeB).resolves.toBe(true);
    acquireA.resolve(makeStream(trackA));
    await expect(changeA).resolves.toBe(false);

    expect(replaceTrack).toHaveBeenCalledTimes(1);
    expect(replaceTrack).toHaveBeenCalledWith('video', oldTrack, trackB);
    expect(manager.addTrack).toHaveBeenCalledTimes(1);
    expect(getCurrentTrack()).toBe(trackB);
    expect(trackA.stop).toHaveBeenCalledTimes(1);
    instance.cleanup();
  });
});

describe('conference input attachment', () => {
  it('releases a stream when hangup wins while sender replacement is pending', async() => {
    const {instance, manager} = createHarness();
    const track = makeTrack();
    const replacement = deferred<void>();
    Object.assign(manager, {
      addStream: vi.fn(),
      appendToConference: vi.fn(() => replacement.promise),
      removeTrack: vi.fn()
    });

    const attachment = (instance as any).onInputStream(makeStream(track));
    await vi.waitFor(() => expect((manager as any).appendToConference).toHaveBeenCalled());
    instance.closing = true;
    replacement.resolve();
    await attachment;

    expect(track.stop).toHaveBeenCalledTimes(1);
    instance.cleanup();
  });

  it('removes and stops a newly added stream when sender replacement rejects', async() => {
    const {instance, manager} = createHarness();
    const track = makeTrack();
    const replacementError = new Error('initial sender rejected');
    Object.assign(manager, {
      addStream: vi.fn(),
      appendToConference: vi.fn().mockRejectedValue(replacementError),
      removeTrack: vi.fn()
    });

    await expect((instance as any).onInputStream(makeStream(track))).rejects.toBe(replacementError);

    expect((manager as any).removeTrack).toHaveBeenCalledWith(track);
    expect(track.stop).toHaveBeenCalledTimes(1);
    instance.cleanup();
  });
});

describe('P2P microphone device swap', () => {
  it('keeps the latest device when acquisitions resolve B before A', async() => {
    const oldTrack = makeTrack();
    const trackA = makeTrack();
    const trackB = makeTrack();
    const {instance, sender, state} = makeP2pInstance(oldTrack);
    const acquireA = deferred<MediaStream>();
    const acquireB = deferred<MediaStream>();
    mocks.getStream.mockReturnValueOnce(acquireA.promise).mockReturnValueOnce(acquireB.promise);

    const changeA = instance.setInputAudioDeviceId('mic-a');
    const changeB = instance.setInputAudioDeviceId('mic-b');
    acquireB.resolve(makeStream(trackB));
    await expect(changeB).resolves.toBe(true);
    acquireA.resolve(makeStream(trackA));
    await expect(changeA).resolves.toBe(false);

    expect(sender.replaceTrack).toHaveBeenCalledTimes(1);
    expect(sender.replaceTrack).toHaveBeenCalledWith(trackB);
    expect((state.streams.ownAudio as MediaStream).getAudioTracks()[0]).toBe(trackB);
    expect(trackA.stop).toHaveBeenCalledTimes(1);
  });

  it('releases a P2P microphone acquired while sender replacement outlives hangup', async() => {
    const oldTrack = makeTrack();
    const newTrack = makeTrack();
    const {instance, sender, state} = makeP2pInstance(oldTrack);
    const replacement = deferred<void>();
    sender.replaceTrack.mockImplementationOnce(async(track) => {
      sender.track = track;
      return replacement.promise;
    });
    mocks.getStream.mockResolvedValue(makeStream(newTrack));

    const change = instance.setInputAudioDeviceId('new-mic');
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack));
    (instance as any).p2p = undefined;
    replacement.resolve();

    await expect(change).resolves.toBe(true);
    expect(state.streams.ownAudio?.getAudioTracks()[0]).toBe(oldTrack);
    expect(newTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('does not publish a microphone acquired after the P2P call was muted', async() => {
    const oldTrack = makeTrack();
    const newTrack = makeTrack();
    const {instance, sender, state} = makeP2pInstance(oldTrack);
    const acquisition = deferred<MediaStream>();
    mocks.getStream.mockReturnValue(acquisition.promise);

    const change = instance.setInputAudioDeviceId('new-mic');
    await vi.waitFor(() => expect(mocks.getStream).toHaveBeenCalledTimes(1));
    await (instance as any).toggleStream('audio', false);
    const fallbackTrack = state.silence.getAudioTracks()[0];
    expect(sender.track).toBe(fallbackTrack);

    acquisition.resolve(makeStream(newTrack));
    await expect(change).resolves.toBe(false);

    expect(sender.track).toBe(fallbackTrack);
    expect(state.streams.ownAudio).toBe(state.silence);
    expect(newTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('does not commit a P2P microphone replacement after a concurrent mute', async() => {
    const oldTrack = makeTrack();
    const newTrack = makeTrack();
    const {instance, sender, state} = makeP2pInstance(oldTrack);
    const replacement = deferred<void>();
    sender.replaceTrack.mockImplementationOnce(async(track) => {
      sender.track = track;
      return replacement.promise;
    });
    mocks.getStream.mockResolvedValue(makeStream(newTrack));

    const change = instance.setInputAudioDeviceId('new-mic');
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack));

    await (instance as any).toggleStream('audio', false);
    const fallbackTrack = state.silence.getAudioTracks()[0];
    expect(sender.track).toBe(fallbackTrack);

    replacement.resolve();
    await expect(change).resolves.toBe(false);

    expect(sender.track).toBe(fallbackTrack);
    expect(state.streams.ownAudio).toBe(state.silence);
    expect(newTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('propagates an enable sender failure to the microphone UI action', async() => {
    const fallbackTrack = makeTrack();
    fallbackTrack.enabled = false;
    const newTrack = makeTrack();
    const {instance, sender} = makeP2pInstance(fallbackTrack);
    const replacementError = new Error('audio sender rejected');
    sender.replaceTrack.mockRejectedValue(replacementError);
    mocks.getStream.mockResolvedValue(makeStream(newTrack));

    await expect((instance as any).toggleStream('audio', true)).rejects.toBe(replacementError);

    expect(newTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('releases a newly enabled microphone when hangup wins during sender replacement', async() => {
    const fallbackTrack = makeTrack();
    fallbackTrack.enabled = false;
    const newTrack = makeTrack();
    const {instance, sender} = makeP2pInstance(fallbackTrack);
    const replacement = deferred<void>();
    sender.replaceTrack.mockReturnValueOnce(replacement.promise);
    mocks.getStream.mockResolvedValue(makeStream(newTrack));

    const enable = (instance as any).toggleStream('audio', true);
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack));
    (instance as any).p2pConnectionState = 'closed';
    (instance as any).p2p = undefined;
    replacement.resolve();

    await expect(enable).rejects.toThrow(/closed during sender replacement/);
    expect(newTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('propagates a mute fallback sender failure instead of reporting success', async() => {
    const oldTrack = makeTrack();
    const {instance, sender, state} = makeP2pInstance(oldTrack);
    const replacementError = new Error('fallback sender rejected');
    sender.replaceTrack.mockRejectedValue(replacementError);

    await expect(instance.toggleMuted()).rejects.toBe(replacementError);

    expect(sender.replaceTrack).toHaveBeenCalledWith(state.silence.getAudioTracks()[0]);
    expect(oldTrack.stop).not.toHaveBeenCalled();
    expect(oldTrack.enabled).toBe(false);
    expect(instance.dispatchEvent).toHaveBeenCalledWith('muted', true);
    expect(instance.dispatchEvent).toHaveBeenCalledWith('mediaState', expect.objectContaining({muted: true}));
  });
});

describe('P2P transport failure cleanup', () => {
  it('uses a monotonic clock for call ordering and connected duration', () => {
    let monotonicNow = 1000;
    const performanceNow = vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(5000000);
    const instance = new CallInstance({
      isOutgoing: true,
      interlocutorUserId: 123 as UserId,
      managers: {} as any
    });
    (instance.streamManager as any).stop = vi.fn();

    expect(instance.createdAt).toBe(1000);
    monotonicNow = 4000;
    (instance as any).onUpdate({
      '@type': 'updatePhoneCallConnectionState',
      connectionState: 'connected'
    });
    expect(instance.connectedAt).toBe(4000);

    wallClock.mockReturnValue(-5000000);
    monotonicNow = 6500;
    expect(instance.duration).toBe(2);

    instance.cleanup();
    performanceNow.mockRestore();
    wallClock.mockRestore();
  });

  it('publishes the server discard after the derived state becomes closed', async() => {
    vi.stubGlobal('MediaStream', class {});
    const ownAudioTrack = makeTrack();
    const ownVideoTrack = makeTrack('video');
    const fallbackAudioTrack = makeTrack();
    const fallbackVideoTrack = makeTrack('video');
    const discardCall = vi.fn().mockResolvedValue(undefined);
    const connection = {close: vi.fn()};
    const audioContext = {close: vi.fn().mockResolvedValue(undefined)};
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      connectedAt: Date.now() - 1000,
      id: 'failed-call',
      log: Object.assign(vi.fn(), {error: vi.fn()}),
      managers: {appCallsManager: {discardCall}},
      overrideConnectionState: vi.fn(),
      p2pConnectionState: 'connected',
      p2p: {
        audio: {srcObject: null},
        audioContext,
        blackPresentation: makeStream(makeTrack('video')),
        blackVideo: makeStream(fallbackVideoTrack),
        connection,
        silence: makeStream(fallbackAudioTrack),
        streams: {
          ownAudio: makeStream(ownAudioTrack),
          ownVideo: makeStream(ownVideoTrack)
        }
      }
    }) as CallInstance;

    (instance as any).onUpdate({
      '@type': 'updatePhoneCallConnectionState',
      connectionState: 'failed'
    });

    await vi.waitFor(() => expect(discardCall).toHaveBeenCalledTimes(1));
    expect(discardCall).toHaveBeenCalledWith(
      'failed-call',
      expect.any(Number),
      {_: 'phoneCallDiscardReasonDisconnect'},
      true
    );
    expect(ownAudioTrack.stop).toHaveBeenCalledTimes(1);
    expect(ownVideoTrack.stop).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect((instance as any).p2p).toBeUndefined();
  });
});

describe('P2P accept transaction', () => {
  function createAcceptHarness() {
    let closing = false;
    const generateDh = vi.fn().mockResolvedValue({
      a: new Uint8Array([1]),
      g_a: new Uint8Array([2]),
      g_a_hash: new Uint8Array([3]),
      p: new Uint8Array([4])
    });
    const acceptCall = vi.fn();
    const discardCall = vi.fn().mockResolvedValue(undefined);
    const hangUp = vi.fn(async() => {
      closing = true;
    });
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      _connectionState: CALL_STATE.PENDING,
      call: {
        _: 'phoneCallRequested',
        id: 'incoming-call',
        g_a_hash: new Uint8Array([9]),
        pFlags: {video: true}
      },
      dispatchResultableEvent: vi.fn(),
      hangUp,
      id: 'incoming-call',
      log: Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()}),
      managers: {
        appCallsManager: {acceptCall, discardCall, generateDh}
      },
      overrideConnectionState: vi.fn((state: CALL_STATE) => {
        (instance as any)._connectionState = state;
      }),
      protocol: {_: 'phoneCallProtocol'}
    }) as CallInstance;
    Object.defineProperty(instance, 'isClosing', {
      configurable: true,
      get: () => closing
    });

    return {
      acceptCall,
      close: () => closing = true,
      discardCall,
      generateDh,
      hangUp,
      instance
    };
  }

  it('lets the override own and await the complete DH plus accept RPC transaction', async() => {
    const harness = createAcceptHarness();
    const accepted = deferred<any>();
    harness.acceptCall.mockReturnValue(accepted.promise);
    (harness.instance as any).dispatchResultableEvent.mockImplementation((_name: string, accept: () => Promise<void>) => {
      return [(async() => {
        await accept();
      })()];
    });

    let settled = false;
    const transaction = harness.instance.acceptCall().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(harness.acceptCall).toHaveBeenCalledWith(
      'incoming-call',
      {_: 'phoneCallProtocol'},
      new Uint8Array([2]),
      true
    ));
    expect(settled).toBe(false);

    accepted.resolve({_: 'phoneCall', id: 'incoming-call', access_hash: 'hash'});
    await transaction;
    expect(settled).toBe(true);
    expect(harness.hangUp).not.toHaveBeenCalled();
  });

  it('compensates the exact accepted call and stays pending when close wins the RPC race', async() => {
    const harness = createAcceptHarness();
    const accepted = deferred<any>();
    const compensation = deferred<void>();
    harness.acceptCall.mockReturnValue(accepted.promise);
    harness.discardCall.mockReturnValue(compensation.promise);
    (harness.instance as any).dispatchResultableEvent.mockImplementation((_name: string, accept: () => Promise<void>) => {
      return [accept()];
    });

    let settled = false;
    const transaction = harness.instance.acceptCall().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(harness.acceptCall).toHaveBeenCalledTimes(1));
    harness.close();
    accepted.resolve({_: 'phoneCall', id: 'accepted-call', access_hash: 'accepted-hash'});
    await vi.waitFor(() => expect(harness.discardCall).toHaveBeenCalledWith(
      'accepted-call',
      0,
      {_: 'phoneCallDiscardReasonHangup'},
      true
    ));
    expect(settled).toBe(false);

    compensation.resolve();
    await transaction;
    expect(harness.hangUp).not.toHaveBeenCalled();
  });

  it('does not fall through to an unlocked accept when an override cancels', async() => {
    const harness = createAcceptHarness();
    (harness.instance as any).dispatchResultableEvent.mockReturnValue([Promise.resolve()]);

    await harness.instance.acceptCall();

    expect(harness.generateDh).not.toHaveBeenCalled();
    expect(harness.acceptCall).not.toHaveBeenCalled();
  });

  it('does not join and compensates when close wins an outgoing confirm RPC race', async() => {
    let closing = false;
    const confirmed = deferred<any>();
    const compensation = deferred<void>();
    const computeKey = vi.fn().mockResolvedValue({
      key: new Uint8Array([7]),
      key_fingerprint: 'fingerprint'
    });
    const confirmCall = vi.fn().mockReturnValue(confirmed.promise);
    const discardCall = vi.fn().mockReturnValue(compensation.promise);
    const joinCall = vi.fn();
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      _connectionState: CALL_STATE.PENDING,
      call: {
        _: 'phoneCallAccepted',
        g_b: new Uint8Array([5]),
        pFlags: {video: true}
      },
      dh: {
        a: new Uint8Array([1]),
        g_a: new Uint8Array([2]),
        p: new Uint8Array([3])
      },
      hangUp: vi.fn(),
      id: 'outgoing-call',
      joinCall,
      log: Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()}),
      managers: {
        appCallsManager: {computeKey, confirmCall, discardCall}
      },
      overrideConnectionState: vi.fn(),
      protocol: {_: 'phoneCallProtocol'}
    }) as CallInstance;
    Object.defineProperty(instance, 'isClosing', {
      configurable: true,
      get: () => closing
    });

    let settled = false;
    const transaction = instance.confirmCall().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(confirmCall).toHaveBeenCalledWith(
      'outgoing-call',
      {_: 'phoneCallProtocol'},
      new Uint8Array([2]),
      'fingerprint',
      true
    ));
    closing = true;
    confirmed.resolve({_: 'phoneCall', id: 'confirmed-call', access_hash: 'confirmed-hash'});
    await vi.waitFor(() => expect(discardCall).toHaveBeenCalledWith(
      'confirmed-call',
      0,
      {_: 'phoneCallDiscardReasonHangup'},
      true
    ));
    expect(joinCall).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    compensation.resolve();
    await transaction;
    expect(joinCall).not.toHaveBeenCalled();
  });
});

describe('P2P queued remote negotiation', () => {
  it('observes a promoted negotiation failure and disconnects the exact call', async() => {
    const negotiationError = new Error('queued remote description rejected');
    const firstOffer = {
      '@type': 'NegotiateChannels',
      exchangeId: 'first',
      contents: [{ssrc: '1'}]
    };
    const queuedOffer = {
      '@type': 'NegotiateChannels',
      exchangeId: 'queued',
      contents: [{ssrc: '2'}]
    };
    const connection = {
      createAnswer: vi.fn().mockResolvedValue({type: 'answer', sdp: 'v=0'}),
      localDescription: {type: 'answer', sdp: 'v=0'},
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(negotiationError),
      signalingState: 'stable'
    };
    const hangUp = vi.fn().mockResolvedValue(undefined);
    const log = Object.assign(vi.fn(), {error: vi.fn()});
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      bindLocalAudioToSharedRemoteOffer: vi.fn().mockResolvedValue(undefined),
      buildRemoteContentMids: vi.fn(() => ({})),
      buildRemoteSdp: vi.fn(() => 'v=0'),
      commitPendingIceCandidates: vi.fn().mockResolvedValue(undefined),
      getMediaMids: vi.fn(() => ({})),
      hangUp,
      isOutgoing: false,
      log,
      p2p: {
        appliedRemoteExchangeIds: new Set<string>(),
        handledRemoteExchangeIds: new Set<string>(),
        pendingCandidates: [],
        pendingRemoteNegotiation: firstOffer,
        queuedRemoteNegotiation: queuedOffer,
        remoteSetup: {ufrag: 'remote'},
        connection,
        transceivers: {}
      },
      parseAnswerContents: vi.fn(() => []),
      prepareTransceiversForRemoteOffer: vi.fn(),
      sendCallSignalingData: vi.fn().mockResolvedValue(undefined),
      sendLocalSetup: vi.fn(),
      shouldSendLocalOfferAfterRemoteAnswer: vi.fn(() => false),
      updateRemoteMediaStateFromOffer: vi.fn()
    }) as CallInstance;

    await (instance as any).applyRemoteNegotiation();

    await vi.waitFor(() => expect(hangUp).toHaveBeenCalledWith('phoneCallDiscardReasonDisconnect'));
    expect(connection.setRemoteDescription).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith('queued remote negotiation failed', negotiationError);
  });

  it('observes detached signaling send rejection', async() => {
    const sendError = new Error('phone.sendSignalingData rejected');
    const log = Object.assign(vi.fn(), {error: vi.fn()});
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      log,
      sendCallSignalingData: vi.fn().mockRejectedValue(sendError)
    }) as CallInstance;

    (instance as any).sendCallSignalingDataDetached(
      {'@type': 'MediaState'} as any,
      'signaling send failed'
    );

    await vi.waitFor(() => expect(log.error).toHaveBeenCalledWith('signaling send failed', sendError));
  });

  it('serializes and observes decrypted signaling processing failure', async() => {
    const processingError = new Error('remote signaling rejected');
    const hangUp = vi.fn().mockResolvedValue(undefined);
    const log = Object.assign(vi.fn(), {error: vi.fn()});
    const processDecryptQueue = vi.fn().mockRejectedValue(processingError);
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      decryptQueuePromise: Promise.resolve(),
      hangUp,
      log,
      processDecryptQueue
    }) as CallInstance;

    (instance as any).scheduleDecryptQueueProcessing();

    await vi.waitFor(() => expect(hangUp).toHaveBeenCalledWith('phoneCallDiscardReasonDisconnect'));
    expect(log.error).toHaveBeenCalledWith('P2P signaling processing failed', processingError);
  });
});

describe('P2P exclusive video transactions', () => {
  function makeHarness() {
    const videoFallbackTrack = makeTrack('video');
    const presentationFallbackTrack = makeTrack('video');
    const activeVideoTrack = makeTrack('video');
    const activePresentationTrack = makeTrack('video');
    videoFallbackTrack.enabled = false;
    presentationFallbackTrack.enabled = false;

    const videoFallback = makeStream(videoFallbackTrack);
    const presentationFallback = makeStream(presentationFallbackTrack);
    const activeVideo = makeStream(activeVideoTrack);
    const activePresentation = makeStream(activePresentationTrack);
    const makeSender = (initialTrack: FakeTrack) => {
      const sender = {
        track: initialTrack as MediaStreamTrack,
        replaceTrack: vi.fn(async(track: MediaStreamTrack) => {
          sender.track = track;
        })
      };
      return sender;
    };
    const videoSender = makeSender(videoFallbackTrack);
    const presentationSender = makeSender(presentationFallbackTrack);
    const videoTransceiver = {
      currentDirection: 'inactive',
      direction: 'inactive',
      mid: '1',
      sender: videoSender
    };
    const presentationTransceiver = {
      currentDirection: 'inactive',
      direction: 'inactive',
      mid: '2',
      sender: presentationSender
    };
    const state = {
      audio: {} as HTMLAudioElement,
      blackVideo: videoFallback,
      blackPresentation: presentationFallback,
      connection: {addTransceiver: vi.fn()},
      facingMode: 'user',
      isStarting: false,
      isUpdatingExclusiveVideo: false,
      senders: {
        video: videoSender,
        presentation: presentationSender
      },
      streams: {
        ownVideo: videoFallback,
        ownPresentation: presentationFallback
      },
      transceivers: {
        video: videoTransceiver,
        presentation: presentationTransceiver
      }
    };
    const instance = Object.assign(Object.create(CallInstance.prototype), {
      log: Object.assign(vi.fn(), {warn: vi.fn()}),
      p2p: state,
      p2pConnectionState: 'connected',
      sendLocalMediaState: vi.fn(),
      updateStreams: vi.fn(),
      videoElements: new Map()
    }) as CallInstance;

    return {
      activePresentation,
      activePresentationTrack,
      activeVideo,
      activeVideoTrack,
      instance,
      presentationFallback,
      presentationFallbackTrack,
      presentationSender,
      presentationTransceiver,
      state,
      videoFallback,
      videoFallbackTrack,
      videoSender,
      videoTransceiver
    };
  }

  it('rolls camera enable back when disabling screen sharing fails', async() => {
    const harness = makeHarness();
    const newVideoTrack = makeTrack('video');
    const newVideo = makeStream(newVideoTrack);
    const error = new Error('screen fallback rejected');
    harness.state.streams.ownPresentation = harness.activePresentation;
    harness.presentationSender.track = harness.activePresentationTrack;
    harness.presentationSender.replaceTrack.mockRejectedValueOnce(error);
    mocks.getUserStream.mockResolvedValueOnce(newVideo);

    await expect((harness.instance as any).toggleStream('video', true)).rejects.toBe(error);

    expect(harness.videoSender.replaceTrack.mock.calls).toEqual([
      [newVideoTrack],
      [harness.videoFallbackTrack]
    ]);
    expect(harness.presentationSender.replaceTrack).toHaveBeenCalledWith(harness.presentationFallbackTrack);
    expect(harness.state.streams.ownVideo).toBe(harness.videoFallback);
    expect(harness.state.streams.ownPresentation).toBe(harness.activePresentation);
    expect(harness.videoTransceiver.direction).toBe('inactive');
    expect(harness.state.isUpdatingExclusiveVideo).toBe(false);
    expect(newVideoTrack.stop).toHaveBeenCalledTimes(1);
    expect(harness.activePresentationTrack.stop).not.toHaveBeenCalled();
  });

  it('rolls screen enable back when disabling camera sharing fails', async() => {
    const harness = makeHarness();
    const newPresentationTrack = makeTrack('video');
    const newPresentation = makeStream(newPresentationTrack);
    const error = new Error('camera fallback rejected');
    harness.state.streams.ownVideo = harness.activeVideo;
    harness.videoSender.track = harness.activeVideoTrack;
    harness.videoSender.replaceTrack.mockRejectedValueOnce(error);
    mocks.getUserStream.mockResolvedValueOnce(newPresentation);

    await expect((harness.instance as any).toggleStream('presentation', true)).rejects.toBe(error);

    expect(harness.presentationSender.replaceTrack.mock.calls).toEqual([
      [newPresentationTrack],
      [harness.presentationFallbackTrack]
    ]);
    expect(harness.videoSender.replaceTrack).toHaveBeenCalledWith(harness.videoFallbackTrack);
    expect(harness.state.streams.ownPresentation).toBe(harness.presentationFallback);
    expect(harness.state.streams.ownVideo).toBe(harness.activeVideo);
    expect(harness.presentationTransceiver.direction).toBe('inactive');
    expect(harness.state.isUpdatingExclusiveVideo).toBe(false);
    expect(newPresentationTrack.stop).toHaveBeenCalledTimes(1);
    expect(harness.activeVideoTrack.stop).not.toHaveBeenCalled();
  });

  it.each(['video', 'presentation'] as const)(
    'releases a newly enabled %s stream when hangup wins during sender replacement',
    async(streamType) => {
      const harness = makeHarness();
      const newTrack = makeTrack('video');
      const replacement = deferred<void>();
      const sender = streamType === 'video' ? harness.videoSender : harness.presentationSender;
      sender.replaceTrack.mockReturnValueOnce(replacement.promise);
      mocks.getUserStream.mockResolvedValue(makeStream(newTrack));

      const enable = (harness.instance as any).toggleStream(streamType, true);
      await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack));
      (harness.instance as any).p2pConnectionState = 'closed';
      (harness.instance as any).p2p = undefined;
      replacement.resolve();

      await expect(enable).rejects.toThrow(/closed during sender replacement/);
      expect(newTrack.stop).toHaveBeenCalledTimes(1);
    }
  );
});
