import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mediaMocks = vi.hoisted(() => ({
  getStream: vi.fn(),
  getScreenStream: vi.fn()
}));

vi.mock('@lib/calls/helpers/getStream', () => ({default: mediaMocks.getStream}));
vi.mock('@lib/calls/helpers/getScreenStream', () => ({default: mediaMocks.getScreenStream}));

import GroupCallInstance from '@lib/calls/groupCallInstance';
import CallInstanceBase from '@lib/calls/callInstanceBase';
import rootScope from '@lib/rootScope';
import deferred from './helpers/deferred';

class FakeTrack extends EventTarget {
  public enabled = true;
  public muted = false;
  public readyState: MediaStreamTrackState = 'live';

  constructor(public readonly kind: 'audio' | 'video' = 'video') {
    super();
  }

  public stop = vi.fn(() => {
    this.readyState = 'ended';
  });
}

function makeStream(track = new FakeTrack()) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => track.kind === 'video' ? [track] : [],
    getAudioTracks: () => track.kind === 'audio' ? [track] : []
  } as unknown as MediaStream;
}


const PRESENTATION_CALL = {
  _: 'inputGroupCall',
  id: 'runtime-media',
  access_hash: 'runtime-media-hash'
} as const;

function makeReadyInstance() {
  const managers: any = {
    appGroupCallsManager: {
      editParticipant: vi.fn(async() => {}),
      getCachedParticipants: vi.fn(async() => new Map()),
      leaveGroupCallPresentation: vi.fn(async() => {}),
      saveApiParticipant: vi.fn()
    },
    appCallsManager: {},
    apiUpdatesManager: {processUpdateMessage: vi.fn()}
  };
  const streamManager = {
    inputStream: {
      getAudioTracks: (): MediaStreamTrack[] => [],
      getVideoTracks: (): MediaStreamTrack[] => []
    },
    stop: vi.fn(),
    hasInputTrackKind: vi.fn((_kind: string) => true),
    removeTrack: vi.fn(),
    addTrack: vi.fn(),
    appendToConference: vi.fn(async() => {})
  };
  const main: any = {
    connection: {iceConnectionState: 'connected', getSenders: (): RTCRtpSender[] => []},
    streamManager,
    description: {},
    sources: {audio: {source: 1} as any, video: {source: 2} as any},
    addInputVideoStream: vi.fn(async() => {}),
    negotiate: vi.fn(async() => {}),
    closeConnectionAndStream: vi.fn()
  };
  main.requestNegotiation = vi.fn(() => main.negotiate());
  const instance = new GroupCallInstance({id: 'runtime-media' as any, chatId: 0 as any, managers});
  (instance as any).connections = {main};
  instance.participant = {
    _: 'groupCallParticipant',
    peer: {_: 'peerUser', user_id: '42'},
    pFlags: {self: true, muted: true, can_self_unmute: true},
    source: 1,
    date: 1
  } as any;
  instance.joined = true;

  return {instance, main, managers};
}

describe('GroupCallInstance runtime media transactions', () => {
  const instances: GroupCallInstance[] = [];

  beforeEach(() => {
    mediaMocks.getStream.mockReset();
    mediaMocks.getScreenStream.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('AudioContext', class {});
    vi.stubGlobal('MediaStream', class {
      public getTracks(): MediaStreamTrack[] { return []; }
      public getAudioTracks(): MediaStreamTrack[] { return []; }
      public getVideoTracks(): MediaStreamTrack[] { return []; }
      public addTrack() {}
      public removeTrack() {}
    });
  });

  afterEach(() => {
    for(const instance of instances.splice(0)) instance.cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes readiness only after joined transport and canonical self participant', () => {
    const {instance} = makeReadyInstance();
    instances.push(instance);
    const states = vi.fn();
    instance.addEventListener('state', states);

    instance.joined = false;
    expect(instance.isMediaRuntimeReady).toBe(false);
    instance.joined = true;

    expect(instance.isMediaRuntimeReady).toBe(true);
    expect(states).toHaveBeenCalledTimes(2);
  });

  it('does not request camera permission before runtime media is ready', async() => {
    const {instance} = makeReadyInstance();
    instances.push(instance);
    instance.joined = false;

    await expect(instance.startVideoSharing()).rejects.toThrow(/not ready/);
    expect(mediaMocks.getStream).not.toHaveBeenCalled();
  });

  it('does not request camera or screen capture while muted by an admin', async() => {
    const {instance} = makeReadyInstance();
    instances.push(instance);
    delete instance.participant.pFlags.can_self_unmute;

    await expect(instance.startVideoSharing()).rejects.toThrow(/muted by an admin/);
    await expect(instance.startScreenSharing()).rejects.toThrow(/muted by an admin/);

    expect(mediaMocks.getStream).not.toHaveBeenCalled();
    expect(mediaMocks.getScreenStream).not.toHaveBeenCalled();
  });

  it('cancels camera acquisition when an admin mute arrives while permission is pending', async() => {
    const {instance} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    const acquisition = deferred<MediaStream>();
    mediaMocks.getStream.mockReturnValue(acquisition.promise);

    const start = instance.startVideoSharing();
    await vi.waitFor(() => expect(mediaMocks.getStream).toHaveBeenCalledTimes(1));
    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true}
    });
    acquisition.resolve(makeStream(track));

    await expect(start).rejects.toThrow(/media stopped being ready/);
    await (instance as any).adminMediaTeardownPromise;
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('cancels screen acquisition when an admin mute arrives while the picker is pending', async() => {
    const {instance} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    const acquisition = deferred<MediaStream>();
    mediaMocks.getScreenStream.mockReturnValue(acquisition.promise);

    const start = instance.startScreenSharing();
    await vi.waitFor(() => expect(mediaMocks.getScreenStream).toHaveBeenCalledTimes(1));
    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true}
    });
    acquisition.resolve(makeStream(track));

    await expect(start).rejects.toThrow(/cancelled before media became ready/);
    await (instance as any).adminMediaTeardownPromise;
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('does not block recovery hangUp behind an open screen-share picker', async() => {
    const {instance} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    const acquisition = deferred<MediaStream>();
    mediaMocks.getScreenStream.mockReturnValue(acquisition.promise);

    const start = instance.startScreenSharing();
    await vi.waitFor(() => expect(mediaMocks.getScreenStream).toHaveBeenCalledTimes(1));

    // Recovery tears the call down while the picker is still open. Its cleanup
    // must not queue behind getDisplayMedia: the transport is already closed,
    // so waiting on the user's dialog left a dead call until it was dismissed.
    await expect(instance.hangUp(false, false, true)).resolves.toBeUndefined();

    // The abandoned acquisition is released once the user finally acts.
    acquisition.resolve(makeStream(track));
    await expect(start).rejects.toThrow(/cancelled before media became ready/);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('recovers a server-accepted unmute that lost the race to a stale muted row', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    track.enabled = false;
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    let resolveEdit: () => void;
    managers.appGroupCallsManager.editParticipant.mockImplementation(() => new Promise<void>((resolve) => {
      resolveEdit = resolve;
    }));

    const unmute = instance.changeUserMuted(0 as PeerId, false);
    await vi.waitFor(() => expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1));

    // A stale self row computed before the server accepted the unmute lands
    // mid-RPC and replaces the cached row.
    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true, can_self_unmute: true}
    });
    resolveEdit!();
    await unmute;
    // The newest row wins for now — an admin mute racing the unmute must stay
    // fail-closed…
    expect(track.enabled).toBe(false);

    // …but the accepted unmute stays armed: the next consistent self row opens
    // capture instead of leaving a server-unmuted user transmitting silence.
    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, can_self_unmute: true}
    });
    expect(track.enabled).toBe(true);
  });

  it('does not open capture from a late row once the unmute intent expired', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    track.enabled = false;
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    let resolveEdit: () => void;
    managers.appGroupCallsManager.editParticipant.mockImplementation(() => new Promise<void>((resolve) => {
      resolveEdit = resolve;
    }));

    const unmute = instance.changeUserMuted(0 as PeerId, false);
    await vi.waitFor(() => expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1));
    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true, can_self_unmute: true}
    });
    resolveEdit!();
    await unmute;

    // A much later unmuted row must not surprise-open the microphone.
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => Date.now() + 60000);
    try {
      instance.onParticipantUpdate({
        ...instance.participant,
        pFlags: {self: true, can_self_unmute: true}
      });
    } finally {
      nowSpy.mockRestore();
    }
    expect(track.enabled).toBe(false);
  });

  it('rejects camera start and rolls the local stream back when negotiation fails', async() => {
    const {instance, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    const stream = makeStream(track);
    const negotiationError = new Error('camera negotiation failed');
    mediaMocks.getStream.mockResolvedValue(stream);
    main.negotiate.mockRejectedValue(negotiationError);
    const editParticipant = vi.spyOn(instance, 'editParticipant');

    await expect(instance.startVideoSharing()).rejects.toBe(negotiationError);

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(main.streamManager.removeTrack).toHaveBeenCalledWith(track);
    expect(main.streamManager.appendToConference).toHaveBeenCalledTimes(1);
    expect(editParticipant).not.toHaveBeenCalled();
  });

  it('restores the cached self participant when publishing camera state fails', async() => {
    const {instance, main, managers} = makeReadyInstance();
    instances.push(instance);
    const previousVideo = {_: 'groupCallParticipantVideo', pFlags: {}, endpoint: 'previous', source_groups: []} as any;
    instance.participant.video = previousVideo;
    const track = new FakeTrack();
    mediaMocks.getStream.mockResolvedValue(makeStream(track));
    const publishError = new Error('video state RPC failed');
    managers.appGroupCallsManager.editParticipant.mockRejectedValue(publishError);

    await expect(instance.startVideoSharing()).rejects.toBe(publishError);

    expect(instance.participant.video).toBe(previousVideo);
    expect(managers.appGroupCallsManager.saveApiParticipant).toHaveBeenCalledWith(instance.id, instance.participant);
    expect(main.streamManager.removeTrack).toHaveBeenCalledWith(track);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('observes an asynchronous camera participant rollback failure without masking the publish error', async() => {
    const {instance, main, managers} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    mediaMocks.getStream.mockResolvedValue(makeStream(track));
    const publishError = new Error('video state RPC failed');
    const rollbackError = new Error('participant rollback proxy failed');
    const rollback = deferred<void>();
    managers.appGroupCallsManager.editParticipant.mockRejectedValue(publishError);
    managers.appGroupCallsManager.saveApiParticipant.mockReturnValue(rollback.promise);
    const logError = vi.spyOn((instance as any).log, 'error');

    const start = instance.startVideoSharing();
    await vi.waitFor(() => expect(managers.appGroupCallsManager.saveApiParticipant).toHaveBeenCalledTimes(1));
    expect(track.stop).toHaveBeenCalledTimes(1);

    rollback.reject(rollbackError);
    await expect(start).rejects.toBe(publishError);
    expect(logError).toHaveBeenCalledWith('startVideoSharing participant rollback failed', rollbackError);
    expect(main.streamManager.removeTrack).toHaveBeenCalledWith(track);
  });

  it('rejects screen start, closes capture and compensates an accepted failed join', async() => {
    const {instance, managers} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    const stream = makeStream(track);
    const negotiationError = new Error('screen negotiation failed');
    mediaMocks.getScreenStream.mockResolvedValue(stream);

    const peerConnection = new EventTarget();
    const presentation = {
      joinAccepted: true,
      acceptedCallInput: PRESENTATION_CALL,
      createPeerConnection: vi.fn(() => peerConnection),
      createDescription: vi.fn(),
      addInputVideoStream: vi.fn(async() => {}),
      negotiate: vi.fn(async() => {
        throw negotiationError;
      }),
      closeConnectionAndStream: vi.fn(() => track.stop())
    } as any;
    vi.spyOn(instance, 'createConnectionInstance').mockImplementation(() => {
      (instance.connections as any).presentation = presentation;
      return presentation;
    });

    await expect(instance.startScreenSharing()).rejects.toBe(negotiationError);

    expect(presentation.closeConnectionAndStream).toHaveBeenCalledWith(true);
    expect(instance.connections.presentation).toBeUndefined();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).toHaveBeenCalledWith(PRESENTATION_CALL);
  });

  it('compensates an initial screen join accepted after stop detached the connection', async() => {
    const {instance, managers} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    mediaMocks.getScreenStream.mockResolvedValue(makeStream(track));
    let resolveNegotiation: () => void;
    const negotiation = new Promise<void>((resolve) => {
      resolveNegotiation = resolve;
    });
    const presentation = {
      joinAccepted: false,
      acceptedCallInput: PRESENTATION_CALL,
      createPeerConnection: vi.fn(() => new EventTarget()),
      createDescription: vi.fn(),
      addInputVideoStream: vi.fn(async() => {}),
      negotiate: vi.fn(() => negotiation),
      closeConnectionAndStream: vi.fn(() => track.stop())
    } as any;
    vi.spyOn(instance, 'createConnectionInstance').mockImplementation(() => {
      (instance.connections as any).presentation = presentation;
      return presentation;
    });

    const start = instance.startScreenSharing();
    await vi.waitFor(() => expect(instance.connections.presentation).toBe(presentation));
    const stop = instance.stopScreenSharing();
    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).not.toHaveBeenCalled();

    presentation.joinAccepted = true;
    resolveNegotiation!();
    await expect(start).rejects.toThrow(/cancelled/);
    await stop;

    expect(instance.connections.presentation).toBeUndefined();
    expect(presentation.closeConnectionAndStream).toHaveBeenCalledTimes(1);
    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).toHaveBeenCalledWith(PRESENTATION_CALL);
  });

  it('rebuilds only the missing presentation transport and preserves the active screen capture', async() => {
    const {instance, managers} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    const streamManager = {
      inputStream: {getVideoTracks: () => [track]},
      stop: vi.fn()
    };
    const previous = {
      streamManager,
      joinAccepted: true,
      acceptedCallInput: PRESENTATION_CALL,
      closeConnectionAndStream: vi.fn()
    } as any;
    (instance.connections as any).presentation = previous;

    const connection = new EventTarget();
    const replacement = {
      connection,
      streamManager,
      joinAccepted: true,
      acceptedCallInput: PRESENTATION_CALL,
      createPeerConnection: vi.fn(() => connection),
      createDescription: vi.fn(),
      appendInputStreamWithE2e: vi.fn(async() => {}),
      negotiate: vi.fn(async() => {}),
      requestNegotiation: vi.fn(async() => {}),
      closeConnectionAndStream: vi.fn()
    } as any;
    vi.spyOn(instance, 'createConnectionInstance').mockImplementation(() => {
      (instance.connections as any).presentation = replacement;
      return replacement;
    });

    await instance.recoverPresentationConnection(previous);

    expect(previous.closeConnectionAndStream).toHaveBeenCalledWith(false);
    expect(replacement.appendInputStreamWithE2e).toHaveBeenCalledTimes(1);
    expect(replacement.negotiate).toHaveBeenCalledTimes(1);
    expect(instance.connections.presentation).toBe(replacement);
    expect(track.stop).not.toHaveBeenCalled();
    expect(mediaMocks.getScreenStream).not.toHaveBeenCalled();
    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).not.toHaveBeenCalled();
  });

  it('recovers a current presentation whose transport fails and ignores stale transport events', async() => {
    const {instance} = makeReadyInstance();
    instances.push(instance);
    const connection = Object.assign(new EventTarget(), {
      connectionState: 'new',
      iceConnectionState: 'new'
    }) as unknown as RTCPeerConnection;
    const presentation = {
      connection,
      requestNegotiation: vi.fn().mockResolvedValue(undefined)
    } as any;
    (instance.connections as any).presentation = presentation;
    const recover = vi.spyOn(instance, 'recoverPresentationConnection').mockResolvedValue(undefined);
    (instance as any).bindPresentationRuntimeRecovery(presentation);

    (connection as any).connectionState = 'failed';
    connection.dispatchEvent(new Event('connectionstatechange'));
    await vi.waitFor(() => expect(recover).toHaveBeenCalledWith(presentation));

    delete instance.connections.presentation;
    (connection as any).iceConnectionState = 'closed';
    connection.dispatchEvent(new Event('iceconnectionstatechange'));
    await Promise.resolve();
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('finishes stale presentation compensation before a newer screen share joins', async() => {
    const {instance, managers} = makeReadyInstance();
    instances.push(instance);
    const oldTrack = new FakeTrack();
    const oldStreamManager = {
      inputStream: {getVideoTracks: () => [oldTrack]},
      stop: vi.fn()
    };
    const previous = {
      streamManager: oldStreamManager,
      joinAccepted: true,
      acceptedCallInput: PRESENTATION_CALL,
      closeConnectionAndStream: vi.fn()
    } as any;
    (instance.connections as any).presentation = previous;

    let resolveRecovery: () => void;
    const recoveryNegotiation = new Promise<void>((resolve) => {
      resolveRecovery = resolve;
    });
    const recoveryConnection = new EventTarget();
    const replacement = {
      connection: recoveryConnection,
      streamManager: oldStreamManager,
      joinAccepted: false,
      acceptedCallInput: PRESENTATION_CALL,
      createPeerConnection: vi.fn(() => recoveryConnection),
      createDescription: vi.fn(),
      appendInputStreamWithE2e: vi.fn(async() => {}),
      negotiate: vi.fn(() => recoveryNegotiation),
      closeConnectionAndStream: vi.fn()
    } as any;
    const newTrack = new FakeTrack();
    mediaMocks.getScreenStream.mockResolvedValue(makeStream(newTrack));
    const newConnectionTarget = new EventTarget();
    const newer = {
      connection: newConnectionTarget,
      streamManager: {inputStream: makeStream(newTrack)},
      joinAccepted: true,
      acceptedCallInput: PRESENTATION_CALL,
      createPeerConnection: vi.fn(() => newConnectionTarget),
      createDescription: vi.fn(),
      addInputVideoStream: vi.fn(async() => {}),
      negotiate: vi.fn(async() => {}),
      closeConnectionAndStream: vi.fn()
    } as any;
    vi.spyOn(instance, 'createConnectionInstance')
    .mockImplementationOnce(() => {
      (instance.connections as any).presentation = replacement;
      return replacement;
    })
    .mockImplementationOnce(() => {
      (instance.connections as any).presentation = newer;
      return newer;
    });

    const recovery = instance.recoverPresentationConnection(previous);
    await vi.waitFor(() => expect(replacement.negotiate).toHaveBeenCalledTimes(1));
    const stop = instance.stopScreenSharing();
    const start = instance.startScreenSharing();
    replacement.joinAccepted = true;
    resolveRecovery!();

    await expect(recovery).rejects.toThrow(/cancelled/);
    await stop;
    await start;

    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).toHaveBeenCalledTimes(1);
    expect(newer.negotiate).toHaveBeenCalledTimes(1);
    expect(
      managers.appGroupCallsManager.leaveGroupCallPresentation.mock.invocationCallOrder[0]
    ).toBeLessThan(newer.negotiate.mock.invocationCallOrder[0]);
    expect(instance.connections.presentation).toBe(newer);
  });

  it('compensates a presentation accepted after full conference recovery starts', async() => {
    const {instance, managers} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    const streamManager = {
      inputStream: {getVideoTracks: () => [track]},
      stop: vi.fn()
    };
    const previous = {
      streamManager,
      joinAccepted: true,
      acceptedCallInput: PRESENTATION_CALL,
      closeConnectionAndStream: vi.fn()
    } as any;
    (instance.connections as any).presentation = previous;
    let resolveNegotiation: () => void;
    const negotiation = new Promise<void>((resolve) => {
      resolveNegotiation = resolve;
    });
    const connection = new EventTarget();
    const replacement = {
      connection,
      streamManager,
      joinAccepted: false,
      acceptedCallInput: PRESENTATION_CALL,
      createPeerConnection: vi.fn(() => connection),
      createDescription: vi.fn(),
      appendInputStreamWithE2e: vi.fn(async() => {}),
      negotiate: vi.fn(() => negotiation),
      closeConnectionAndStream: vi.fn()
    } as any;
    vi.spyOn(instance, 'createConnectionInstance').mockImplementation(() => {
      (instance.connections as any).presentation = replacement;
      return replacement;
    });

    const recovery = instance.recoverPresentationConnection(previous);
    await vi.waitFor(() => expect(replacement.negotiate).toHaveBeenCalledTimes(1));
    const hangUp = instance.hangUp(false, false, true);
    replacement.joinAccepted = true;
    resolveNegotiation!();

    await expect(recovery).rejects.toThrow(/cancelled/);
    await hangUp;
    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).toHaveBeenCalledWith(PRESENTATION_CALL);
  });

  it('retries exact presentation cleanup without stranding full conference recovery', async() => {
    const {instance, managers} = makeReadyInstance();
    instances.push(instance);
    const leaveError = new Error('temporary presentation leave failure');
    managers.appGroupCallsManager.leaveGroupCallPresentation
    .mockRejectedValueOnce(leaveError)
    .mockResolvedValueOnce(undefined);
    const presentation = {
      joinAccepted: true,
      acceptedCallInput: PRESENTATION_CALL,
      closeConnectionAndStream: vi.fn()
    } as any;
    (instance.connections as any).presentation = presentation;

    await expect(instance.hangUp(false, false, true)).resolves.toBeUndefined();

    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).toHaveBeenCalledTimes(2);
    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).toHaveBeenCalledWith(PRESENTATION_CALL);
    expect(presentation.closeConnectionAndStream).toHaveBeenCalledTimes(1);
    expect(instance.connections.main.closeConnectionAndStream).toHaveBeenCalledTimes(1);
  });

  it('keeps unmute capture disabled until the participant RPC succeeds', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    track.enabled = false;
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    let resolveEdit: () => void;
    managers.appGroupCallsManager.editParticipant.mockImplementation(() => new Promise<void>((resolve) => {
      resolveEdit = resolve;
    }));

    const unmute = instance.changeUserMuted(0 as PeerId, false);
    await vi.waitFor(() => expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1));

    expect(track.enabled).toBe(false);
    resolveEdit!();
    await unmute;
    expect(track.enabled).toBe(true);
  });

  it('unmutes disabled capture when the cached participant row already says unmuted', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    track.enabled = false;
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    main.streamManager.hasInputTrackKind.mockImplementation((kind: string) => kind === 'audio');
    delete instance.participant.pFlags.muted;

    await instance.toggleMuted();

    expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledWith(
      'runtime-media',
      expect.anything(),
      {muted: false},
      false
    );
    expect(track.enabled).toBe(true);
  });

  it('reopens a muted microphone source before publishing unmute', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const states = vi.fn();
    instance.addEventListener('state', states);
    const oldTrack = new FakeTrack('audio');
    oldTrack.muted = true;
    const newTrack = new FakeTrack('audio');
    let currentTrack = oldTrack;
    main.streamManager.inputStream.getAudioTracks = () => [currentTrack as unknown as MediaStreamTrack];
    main.streamManager.hasInputTrackKind.mockImplementation((kind: string) => kind === 'audio');
    (main.streamManager as any).replaceInputAudio = vi.fn((stream: MediaStream) => {
      currentTrack = stream.getAudioTracks()[0] as unknown as FakeTrack;
    });
    const sender = {
      track: oldTrack as unknown as MediaStreamTrack,
      replaceTrack: vi.fn(async(track: MediaStreamTrack) => {
        sender.track = track;
      })
    };
    main.connection.getSenders = () => [sender as unknown as RTCRtpSender];
    mediaMocks.getStream.mockResolvedValue(makeStream(newTrack));

    await instance.toggleMuted();

    expect(mediaMocks.getStream).toHaveBeenCalledTimes(1);
    expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack);
    expect((main.streamManager as any).replaceInputAudio).toHaveBeenCalledWith(expect.anything(), oldTrack);
    expect(oldTrack.stop).toHaveBeenCalledTimes(1);
    expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledWith(
      'runtime-media',
      expect.anything(),
      {muted: false},
      false
    );
    expect(currentTrack).toBe(newTrack);
    expect(newTrack.enabled).toBe(true);

    const stateEventsBeforeSourceLoss = states.mock.calls.length;
    newTrack.muted = true;
    newTrack.dispatchEvent(new Event('mute'));
    expect(states).toHaveBeenCalledTimes(stateEventsBeforeSourceLoss + 1);
    expect(instance.isMuted).toBe(true);
  });

  it('does not publish unmute when the replacement microphone is still unavailable', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const oldTrack = new FakeTrack('audio');
    oldTrack.muted = true;
    const newTrack = new FakeTrack('audio');
    newTrack.muted = true;
    let currentTrack = oldTrack;
    main.streamManager.inputStream.getAudioTracks = () => [currentTrack as unknown as MediaStreamTrack];
    main.streamManager.hasInputTrackKind.mockImplementation((kind: string) => kind === 'audio');
    (main.streamManager as any).replaceInputAudio = vi.fn((stream: MediaStream) => {
      currentTrack = stream.getAudioTracks()[0] as unknown as FakeTrack;
    });
    const sender = {
      track: oldTrack as unknown as MediaStreamTrack,
      replaceTrack: vi.fn(async(track: MediaStreamTrack) => {
        sender.track = track;
      })
    };
    main.connection.getSenders = () => [sender as unknown as RTCRtpSender];
    mediaMocks.getStream.mockResolvedValue(makeStream(newTrack));

    await expect(instance.toggleMuted()).rejects.toThrow('Microphone capture is unavailable');

    expect(managers.appGroupCallsManager.editParticipant).not.toHaveBeenCalled();
    expect(currentTrack).toBe(newTrack);
    expect(newTrack.enabled).toBe(false);
  });

  it('keeps a muted microphone source fail-closed when reopening it fails', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    track.muted = true;
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    main.streamManager.hasInputTrackKind.mockImplementation((kind: string) => kind === 'audio');
    const acquisitionError = new Error('microphone reopen failed');
    mediaMocks.getStream.mockRejectedValue(acquisitionError);

    await expect(instance.toggleMuted()).rejects.toBe(acquisitionError);

    expect(track.enabled).toBe(false);
    expect(managers.appGroupCallsManager.editParticipant).not.toHaveBeenCalled();
  });

  it('keeps capture disabled and restores the muted row when unmute is rejected', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    track.enabled = false;
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    const editError = new Error('unmute rejected');
    managers.appGroupCallsManager.editParticipant.mockRejectedValue(editError);

    await expect(instance.changeUserMuted(0 as PeerId, false)).rejects.toBe(editError);

    expect(track.enabled).toBe(false);
    expect(instance.participant.pFlags.muted).toBe(true);
  });

  it('mutes capture before the participant RPC and keeps it fail-closed on rejection', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    main.streamManager.hasInputTrackKind.mockImplementation((kind: string) => kind === 'audio');
    delete instance.participant.pFlags.muted;
    const editError = new Error('mute rejected');
    let rejectEdit: (reason: Error) => void;
    managers.appGroupCallsManager.editParticipant.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejectEdit = reject;
    }));

    const mute = instance.changeUserMuted(0 as PeerId, true);
    await vi.waitFor(() => expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1));

    expect(track.enabled).toBe(false);
    rejectEdit!(editError);
    await expect(mute).rejects.toBe(editError);
    expect(track.enabled).toBe(false);
    expect(instance.participant.pFlags.muted).toBeUndefined();
    expect(managers.appGroupCallsManager.saveApiParticipant).toHaveBeenCalledWith(instance.id, instance.participant);
  });

  it('keeps a pending replacement microphone fail-closed when the mute RPC is rejected', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const oldTrack = new FakeTrack('audio');
    const newTrack = new FakeTrack('audio');
    let currentTrack = oldTrack;
    main.streamManager.inputStream.getAudioTracks = () => [currentTrack as unknown as MediaStreamTrack];
    main.streamManager.hasInputTrackKind.mockImplementation((kind: string) => kind === 'audio');
    (main.streamManager as any).replaceInputAudio = vi.fn((stream: MediaStream) => {
      currentTrack = stream.getAudioTracks()[0] as unknown as FakeTrack;
    });
    delete instance.participant.pFlags.muted;

    const replacement = deferred<void>();
    const sender = {
      track: oldTrack as unknown as MediaStreamTrack,
      replaceTrack: vi.fn((track: MediaStreamTrack) => {
        sender.track = track;
        return replacement.promise;
      })
    };
    main.connection.getSenders = () => [sender as unknown as RTCRtpSender];
    mediaMocks.getStream.mockResolvedValue(makeStream(newTrack));

    const muteEdit = deferred<void>();
    managers.appGroupCallsManager.editParticipant.mockReturnValue(muteEdit.promise);
    const deviceChange = instance.setInputAudioDeviceId('replacement-mic');
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack));

    const mute = instance.changeUserMuted(0 as PeerId, true);
    await vi.waitFor(() => expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1));
    expect(oldTrack.enabled).toBe(false);
    expect(newTrack.enabled).toBe(false);

    const editError = new Error('mute rejected');
    muteEdit.reject(editError);
    await expect(mute).rejects.toBe(editError);
    expect(oldTrack.enabled).toBe(false);
    expect(newTrack.enabled).toBe(false);

    replacement.resolve();
    await expect(deviceChange).resolves.toBe(true);
    expect(currentTrack).toBe(newTrack);
    expect(newTrack.enabled).toBe(false);
  });

  it('keeps capture disabled when a rejected mute is superseded by a thin unmuted row', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    delete instance.participant.pFlags.muted;
    const muteEdit = deferred<void>();
    managers.appGroupCallsManager.editParticipant.mockReturnValue(muteEdit.promise);

    const mute = instance.changeUserMuted(0 as PeerId, true);
    await vi.waitFor(() => expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1));
    expect(track.enabled).toBe(false);

    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, can_self_unmute: true}
    });
    muteEdit.reject(new Error('mute rejected'));
    await expect(mute).rejects.toThrow('mute rejected');

    expect(track.enabled).toBe(false);
  });

  it('reports effective microphone state independently from transport recovery', () => {
    const {instance, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    delete instance.participant.pFlags.muted;
    main.connection.iceConnectionState = 'disconnected';

    expect(instance.isMuted).toBe(false);
  });

  it('reports a live but source-muted microphone as muted', () => {
    const {instance, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    track.muted = true;
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    delete instance.participant.pFlags.muted;

    expect(instance.isMuted).toBe(true);
  });

  it('publishes capture state when the active microphone source mutes or recovers', () => {
    const {instance, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    delete instance.participant.pFlags.muted;
    const states = vi.fn();
    instance.addEventListener('state', states);

    expect(instance.isMuted).toBe(false);
    track.muted = true;
    track.dispatchEvent(new Event('mute'));
    expect(instance.isMuted).toBe(true);

    track.muted = false;
    track.dispatchEvent(new Event('unmute'));
    expect(instance.isMuted).toBe(false);
    expect(states).toHaveBeenCalledTimes(2);
  });

  it('does not roll a newer admin mute back when an older mute RPC rejects', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    main.streamManager.hasInputTrackKind.mockImplementation((kind: string) => kind === 'audio');
    delete instance.participant.pFlags.muted;
    let rejectEdit: (reason: Error) => void;
    managers.appGroupCallsManager.editParticipant.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejectEdit = reject;
    }));

    const mute = instance.changeUserMuted(0 as PeerId, true);
    await vi.waitFor(() => expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1));
    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true}
    });
    rejectEdit!(new Error('stale mute rejected'));
    await expect(mute).rejects.toThrow('stale mute rejected');

    expect(track.enabled).toBe(false);
    expect(instance.participant.pFlags.muted).toBe(true);
    expect(instance.participant.pFlags.can_self_unmute).toBeUndefined();
    expect(managers.appGroupCallsManager.saveApiParticipant).not.toHaveBeenCalled();
  });

  it('serializes self participant edits so an optimistic echo cannot hide a rejected mute', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    main.streamManager.hasInputTrackKind.mockImplementation((kind: string) => kind === 'audio');
    delete instance.participant.pFlags.muted;
    const muteEdit = deferred<void>();
    managers.appGroupCallsManager.editParticipant
    .mockReturnValueOnce(muteEdit.promise)
    .mockResolvedValue(undefined);

    const mute = instance.changeUserMuted(0 as PeerId, true);
    await vi.waitFor(() => expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1));
    const videoEdit = instance.editParticipant(instance.participant, {videoStopped: true});

    expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1);
    muteEdit.reject(new Error('mute rejected'));
    await expect(mute).rejects.toThrow('mute rejected');
    await videoEdit;

    expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(2);
    expect(track.enabled).toBe(false);
    expect(instance.participant.pFlags.muted).toBeUndefined();
  });

  it('keeps capture muted after the participant RPC succeeds', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack('audio');
    main.streamManager.inputStream.getAudioTracks = () => [track as unknown as MediaStreamTrack];
    delete instance.participant.pFlags.muted;

    await instance.changeUserMuted(0 as PeerId, true);

    expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1);
    expect(track.enabled).toBe(false);
    expect(instance.participant.pFlags.muted).toBe(true);
  });

  it('retries admin-mute media teardown and leaves the call if reconciliation keeps failing', async() => {
    vi.useFakeTimers();
    const {instance} = makeReadyInstance();
    instances.push(instance);
    const stopScreenSharing = vi.spyOn(instance, 'stopScreenSharing').mockRejectedValue(new Error('leave failed'));
    const stopVideoSharing = vi.spyOn(instance, 'stopVideoSharing').mockRejectedValue(new Error('replace failed'));
    const hangUp = vi.spyOn(instance, 'hangUp').mockResolvedValue();
    const dispatchState = vi.fn();
    instance.addEventListener('state', dispatchState);

    (instance.connections as any).presentation = {};
    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true}
    });
    const teardown = (instance as any).adminMediaTeardownPromise as Promise<void>;
    await vi.runAllTimersAsync();
    await teardown;

    expect(stopScreenSharing).toHaveBeenCalledTimes(3);
    expect(stopVideoSharing).toHaveBeenCalledTimes(3);
    expect(stopVideoSharing).toHaveBeenCalledWith(true, expect.any(Function));
    expect(hangUp).toHaveBeenCalledTimes(1);
    expect(dispatchState).toHaveBeenCalled();
  });

  it('cancels an old admin-mute retry after a newer authoritative unmute', async() => {
    vi.useFakeTimers();
    const {instance} = makeReadyInstance();
    instances.push(instance);
    let newerMediaLive = false;
    const stopVideoSharing = vi.spyOn(instance, 'stopVideoSharing')
    .mockRejectedValueOnce(new Error('temporary stopped-state publish failure'))
    .mockImplementation(async() => {
      // A stale retry reaching this branch would stop media that the user
      // started after the newer unmute row.
      newerMediaLive = false;
    });
    const hangUp = vi.spyOn(instance, 'hangUp').mockResolvedValue();

    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true}
    });
    const staleTeardown = (instance as any).adminMediaTeardownPromise as Promise<void>;
    await vi.waitFor(() => expect(stopVideoSharing).toHaveBeenCalledTimes(1));

    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true, can_self_unmute: true}
    });
    newerMediaLive = true;
    await vi.runAllTimersAsync();
    await staleTeardown;

    expect(stopVideoSharing).toHaveBeenCalledTimes(1);
    expect(newerMediaLive).toBe(true);
    expect(hangUp).not.toHaveBeenCalled();
  });

  it('does not publish a stale first admin camera teardown after a newer unmute starts media', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const oldTrack = new FakeTrack();
    const newTrack = new FakeTrack();
    let activeVideoTracks = [oldTrack];
    const staleReplacement = deferred<void>();
    main.streamManager.inputStream.getVideoTracks = () => activeVideoTracks as unknown as MediaStreamTrack[];
    main.streamManager.removeTrack.mockImplementation((track: FakeTrack) => {
      activeVideoTracks = activeVideoTracks.filter((candidate) => candidate !== track);
    });
    main.streamManager.appendToConference.mockReturnValueOnce(staleReplacement.promise);
    main.addInputVideoStream.mockImplementation(async(...args: unknown[]) => {
      const stream = args[0] as MediaStream;
      activeVideoTracks = stream.getVideoTracks() as unknown as FakeTrack[];
    });
    mediaMocks.getStream.mockResolvedValue(makeStream(newTrack));

    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true}
    });
    const staleTeardown = (instance as any).adminMediaTeardownPromise as Promise<void>;
    await vi.waitFor(() => expect(main.streamManager.appendToConference).toHaveBeenCalledTimes(1));

    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true, can_self_unmute: true}
    });
    await instance.startVideoSharing();
    staleReplacement.resolve();
    await staleTeardown;

    expect(newTrack.stop).not.toHaveBeenCalled();
    expect(managers.appGroupCallsManager.editParticipant.mock.calls.some(
      (call: any[]) => call[2]?.videoStopped === true
    )).toBe(false);
    expect(managers.appGroupCallsManager.editParticipant.mock.calls.some(
      (call: any[]) => call[2]?.videoStopped === false
    )).toBe(true);
  });

  it('retries the exact detached presentation leave after an admin mute', async() => {
    vi.useFakeTimers();
    const {instance, managers} = makeReadyInstance();
    instances.push(instance);
    const leaveError = new Error('temporary leave failure');
    managers.appGroupCallsManager.leaveGroupCallPresentation
    .mockRejectedValueOnce(leaveError)
    .mockResolvedValueOnce(undefined);
    const presentation = {
      joinAccepted: true,
      acceptedCallInput: PRESENTATION_CALL,
      closeConnectionAndStream: vi.fn()
    } as any;
    (instance.connections as any).presentation = presentation;
    const hangUp = vi.spyOn(instance, 'hangUp').mockResolvedValue();

    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true}
    });
    const teardown = (instance as any).adminMediaTeardownPromise as Promise<void>;
    await vi.runAllTimersAsync();
    await teardown;

    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).toHaveBeenCalledTimes(2);
    expect(managers.appGroupCallsManager.leaveGroupCallPresentation).toHaveBeenCalledWith(PRESENTATION_CALL);
    expect(presentation.closeConnectionAndStream).toHaveBeenCalledTimes(1);
    expect(hangUp).not.toHaveBeenCalled();
  });

  it('does not publish a camera start that was stopped during negotiation', async() => {
    const {instance, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    mediaMocks.getStream.mockResolvedValue(makeStream(track));
    main.streamManager.inputStream.getVideoTracks = () => [track as unknown as MediaStreamTrack];
    let resolveNegotiation: () => void;
    main.negotiate.mockImplementation(() => new Promise<void>((resolve) => {
      resolveNegotiation = resolve;
    }));
    const editParticipant = vi.spyOn(instance, 'editParticipant');

    const start = instance.startVideoSharing();
    await vi.waitFor(() => expect(main.negotiate).toHaveBeenCalledTimes(1));
    await instance.stopVideoSharing();
    resolveNegotiation!();
    await expect(start).rejects.toThrow(/cancelled/);

    expect(editParticipant).toHaveBeenCalledTimes(1);
    expect(editParticipant).toHaveBeenCalledWith(instance.participant, {videoStopped: true});
  });

  it('compensates a camera start accepted after an admin mute', async() => {
    const {instance, managers, main} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    main.streamManager.inputStream.getVideoTracks = () => track.readyState === 'live' ?
      [track as unknown as MediaStreamTrack] : [];
    mediaMocks.getStream.mockResolvedValue(makeStream(track));
    const acceptedStart = deferred<void>();
    managers.appGroupCallsManager.editParticipant
    .mockReturnValueOnce(acceptedStart.promise)
    .mockResolvedValue(undefined);

    const start = instance.startVideoSharing();
    await vi.waitFor(() => expect(managers.appGroupCallsManager.editParticipant).toHaveBeenCalledTimes(1));
    instance.onParticipantUpdate({
      ...instance.participant,
      pFlags: {self: true, muted: true}
    });
    acceptedStart.resolve();

    await expect(start).rejects.toThrow(/cancelled while publishing/);
    await (instance as any).adminMediaTeardownPromise;

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(managers.appGroupCallsManager.editParticipant.mock.calls.some(
      (call: any[]) => call[2]?.videoStopped === true
    )).toBe(true);
  });

  it('propagates every sender replacement as one observable promise', async() => {
    const {instance} = makeReadyInstance();
    instances.push(instance);
    const oldTrack = new FakeTrack() as unknown as MediaStreamTrack;
    const newTrack = new FakeTrack() as unknown as MediaStreamTrack;
    const replacementError = new Error('replaceTrack failed');
    const replaceA = vi.fn(async() => {});
    const replaceB = vi.fn(async() => {
      throw replacementError;
    });
    (instance.connections.main.connection as any).getSenders = () => [
      {track: oldTrack, replaceTrack: replaceA},
      {track: oldTrack, replaceTrack: replaceB}
    ];

    await expect((instance as any).replaceSenderTrack('video', oldTrack, newTrack)).rejects.toBe(replacementError);
    expect(replaceA).toHaveBeenCalledWith(newTrack);
    expect(replaceB).toHaveBeenCalledWith(newTrack);
  });

  it('observes output-track participant hydration rejection', async() => {
    const {instance, main, managers} = makeReadyInstance();
    instances.push(instance);
    const hydrationError = new Error('participant proxy failed');
    managers.appGroupCallsManager.getCachedParticipants.mockRejectedValue(hydrationError);
    (main.description as any).getEntryBySource = vi.fn(() => ({peerId: 42 as PeerId}));
    vi.spyOn(CallInstanceBase.prototype, 'tryAddTrack').mockReturnValue('77');
    const logWarn = vi.spyOn((instance as any).log, 'warn');

    instance.tryAddTrack({type: 'output'} as any);

    await vi.waitFor(() => expect(logWarn).toHaveBeenCalledWith(
      'output track participant hydration failed',
      hydrationError
    ));
  });

  it('does not dispatch a late output-track participant after cleanup', async() => {
    const {instance, main, managers} = makeReadyInstance();
    instances.push(instance);
    const hydration = deferred<Map<PeerId, any>>();
    const participant = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: '42'},
      pFlags: {},
      source: 77,
      date: 1
    };
    managers.appGroupCallsManager.getCachedParticipants.mockReturnValue(hydration.promise);
    (main.description as any).getEntryBySource = vi.fn(() => ({peerId: 42 as PeerId}));
    vi.spyOn(CallInstanceBase.prototype, 'tryAddTrack').mockReturnValue('77');
    const dispatch = vi.spyOn(rootScope, 'dispatchEvent');

    instance.tryAddTrack({type: 'output'} as any);
    instance.cleanup();
    hydration.resolve(new Map([[42 as PeerId, participant]]));
    await hydration.promise;
    await Promise.resolve();

    expect(dispatch).not.toHaveBeenCalledWith('group_call_participant', expect.anything());
  });

  it('keeps the old camera state intact when a device sender swap fails', async() => {
    const {instance, main} = makeReadyInstance();
    instances.push(instance);
    const oldTrack = new FakeTrack();
    const newTrack = new FakeTrack();
    main.streamManager.inputStream.getVideoTracks = () => [oldTrack as unknown as MediaStreamTrack];
    mediaMocks.getStream.mockResolvedValue(makeStream(newTrack));
    const replacementError = new Error('camera device sender rejected');
    const replace = vi.spyOn(instance as any, 'replaceSenderTrack')
    .mockRejectedValueOnce(replacementError)
    .mockResolvedValueOnce(undefined);

    await expect(instance.setInputVideoDeviceId('next-camera')).rejects.toBe(replacementError);

    expect(replace).toHaveBeenNthCalledWith(1, 'video', oldTrack, newTrack);
    expect(replace).toHaveBeenNthCalledWith(2, 'video', newTrack, oldTrack);
    expect(main.streamManager.removeTrack).not.toHaveBeenCalled();
    expect(main.streamManager.addTrack).not.toHaveBeenCalled();
    expect(newTrack.stop).toHaveBeenCalledTimes(1);
    expect(oldTrack.stop).not.toHaveBeenCalled();
  });
  it('requests screen capture without tab or system audio', async() => {
    const {instance} = makeReadyInstance();
    instances.push(instance);
    const track = new FakeTrack();
    mediaMocks.getScreenStream.mockResolvedValue(makeStream(track));

    // The rest of the presentation setup is not under test here.
    await instance.startScreenSharing().catch(() => {});

    expect(mediaMocks.getScreenStream).toHaveBeenCalledTimes(1);
    const constraints = mediaMocks.getScreenStream.mock.calls[0][0] as DisplayMediaStreamOptions;
    expect(constraints.video).toBeTruthy();
    expect(constraints.audio).toBeUndefined();
  });
});
