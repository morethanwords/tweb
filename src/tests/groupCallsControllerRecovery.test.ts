import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const callMocks = vi.hoisted(() => ({
  createMainStreamManager: vi.fn(),
  instances: [] as any[],
  negotiationError: undefined as unknown,
  joinAccepted: false,
  acceptedCallInput: undefined as any
}));

vi.mock('@lib/calls/helpers/createMainStreamManager', () => ({
  default: callMocks.createMainStreamManager
}));

vi.mock('@environment/userAgent', async(importOriginal) => {
  const actual = await importOriginal<typeof import('@environment/userAgent')>();
  return {...actual, IS_CHROMIUM: true};
});

vi.mock('@lib/calls/groupCallInstance', () => {
  class FakeGroupCallInstance {
    public id: string;
    public chatId: PeerId;
    public groupCall: any;
    public connections: Record<string, any> = {};
    public joined = false;
    public selfUserId: bigint;
    public isClosing = false;
    public isMuted = true;
    public isSharingVideo = false;
    public fixSafariAudio = vi.fn();
    public cleanup = vi.fn();
    public onTrack = vi.fn();
    public requestSelfParticipantHydration = vi.fn();
    public attachE2eSendTransform = vi.fn();
    public attachE2eRecvTransformLate = vi.fn();
    public hangUp = vi.fn(async() => {});
    private listeners = new Map<string, Array<(payload: any) => void>>();
    public addEventListener = vi.fn((event: string, listener: (payload: any) => void) => {
      const listeners = this.listeners.get(event) || [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
    });
    public dispatchEvent = vi.fn((event: string, payload: any) => {
      for(const listener of this.listeners.get(event) || []) listener(payload);
    });

    public toInputGroupCall() {
      return this.groupCall?._ === 'groupCall' ? {
        _: 'inputGroupCall' as const,
        id: this.groupCall.id,
        access_hash: this.groupCall.access_hash
      } : undefined;
    }

    constructor(options: {id: string, chatId: PeerId}) {
      this.id = options.id;
      this.chatId = options.chatId;
      callMocks.instances.push(this);
    }

    public attachE2e(_worker: unknown, selfUserId: bigint) {
      this.selfUserId = selfUserId;
    }

    public onParticipantUpdate = vi.fn();

    public createConnectionInstance({streamManager}: {streamManager: {stop: () => void}}) {
      const connection = {
        iceConnectionState: 'new',
        connectionState: 'new',
        addEventListener: vi.fn(),
        close: vi.fn()
      };
      const connectionInstance: any = {
        connection,
        joinAccepted: callMocks.joinAccepted,
        acceptedCallInput: callMocks.acceptedCallInput,
        sources: {audio: {source: 777}},
        createPeerConnection: vi.fn(() => connection),
        createDescription: vi.fn(),
        createDataChannel: vi.fn(),
        appendStreamToConference: vi.fn(),
        negotiate: vi.fn(async() => {
          if(callMocks.negotiationError !== undefined) throw callMocks.negotiationError;
          if(callMocks.acceptedCallInput?._ === 'inputGroupCall') {
            this.id = callMocks.acceptedCallInput.id;
            this.groupCall = {
              _: 'groupCall',
              id: callMocks.acceptedCallInput.id,
              access_hash: callMocks.acceptedCallInput.access_hash
            };
          }
        }),
        closeConnectionAndStream: vi.fn((stopStream: boolean) => {
          connection.close();
          if(stopStream) streamManager.stop();
        })
      };
      connectionInstance.requestNegotiation = vi.fn(() => connectionInstance.negotiate());
      this.connections.main = connectionInstance;
      return connectionInstance;
    }
  }

  return {default: FakeGroupCallInstance};
});

import {GroupCallsController} from '@lib/calls/groupCallsController';
import rootScope from '@lib/rootScope';
import type {InputGroupCall} from '@layer';

const INPUT: Extract<InputGroupCall, {_: 'inputGroupCall'}> = {
  _: 'inputGroupCall',
  id: '700',
  access_hash: '701'
};
const SLUG_INPUT: Extract<InputGroupCall, {_: 'inputGroupCallSlug'}> = {
  _: 'inputGroupCallSlug',
  slug: 'conference'
};
const SELF_USER_ID = BigInt(42);

function makeController() {
  const audioAsset = {
    createAudio: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    playWithTimeout: vi.fn(),
    cancelDelayedPlay: vi.fn()
  };
  const appGroupCallsManager = {
    getGroupCallFull: vi.fn(async() => ({
      _: 'groupCall',
      pFlags: {conference: true},
      id: INPUT.id,
      access_hash: INPUT.access_hash
    })),
    getGroupCallParticipants: vi.fn(async() => []),
    refreshConferenceParticipants: vi.fn(async() => ({complete: true, userIds: []})),
    hangUp: vi.fn(async() => {}),
    leaveGroupCall: vi.fn(async() => {}),
    discardGroupCall: vi.fn(async() => {})
  };
  const log = Object.assign(vi.fn(), {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    bindPrefix: () => vi.fn()
  });
  const managers = {
    appGroupCallsManager,
    apiUpdatesManager: {processUpdateMessage: vi.fn()}
  };
  const controller = new GroupCallsController();
  Object.assign(controller as any, {audioAsset, log, managers});
  return {audioAsset, appGroupCallsManager, controller, log};
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function makeLiveConferenceInstance(connection: any) {
  return {
    id: INPUT.id,
    chatId: 99 as PeerId,
    selfUserId: SELF_USER_ID,
    isClosing: false,
    joined: true,
    isMuted: true,
    isSharingVideo: false,
    connections: {main: {connection, sources: {audio: {source: 777}}}},
    toInputGroupCall: vi.fn(() => INPUT),
    addEventListener: vi.fn(),
    hangUp: vi.fn(async() => {})
  } as any;
}

function makeMediaReadyConferenceInstance(connection: any, options: {
  muted?: boolean,
  remoteParticipant?: boolean,
  track?: Partial<MediaStreamTrack>
} = {}) {
  const instance = makeLiveConferenceInstance(connection);
  const track = {
    enabled: true,
    muted: false,
    readyState: 'live',
    ...options.track
  };
  instance.isMuted = options.muted ?? false;
  instance.streamManager = {
    inputStream: {getAudioTracks: () => [track]}
  };
  instance.description = {
    entries: options.remoteParticipant === false ? [] : [{type: 'audio', direction: 'recvonly'}]
  };
  return instance;
}

type AudioStatsOptions = {
  packetsSent: number,
  pairId: string,
  totalAudioEnergy: number,
  totalSamplesDuration: number,
  remoteInboundTimestamp?: number,
  includeMediaSource?: boolean,
  includeSelectedPair?: boolean
};

function makeAudioStatsReport(options: AudioStatsOptions) {
  const outbound = {
    id: 'outbound-audio',
    type: 'outbound-rtp',
    kind: 'audio',
    ssrc: 777,
    packetsSent: options.packetsSent,
    mediaSourceId: 'audio-source',
    transportId: 'audio-transport'
  };
  const stats: any[] = [
    outbound,
    {
      id: 'audio-transport',
      type: 'transport',
      selectedCandidatePairId: options.pairId
    }
  ];
  if(options.includeMediaSource !== false) {
    stats.push({
      id: outbound.mediaSourceId,
      type: 'media-source',
      totalAudioEnergy: options.totalAudioEnergy,
      totalSamplesDuration: options.totalSamplesDuration
    });
  }
  if(options.includeSelectedPair !== false) {
    stats.push({id: options.pairId, type: 'candidate-pair'});
  }
  if(options.remoteInboundTimestamp !== undefined) {
    stats.push({
      id: 'remote-inbound-audio',
      type: 'remote-inbound-rtp',
      localId: outbound.id,
      ssrc: outbound.ssrc,
      timestamp: options.remoteInboundTimestamp
    });
  }
  return {
    forEach: (callback: (stat: any) => void) => stats.forEach(callback)
  };
}

function makeProgressingAudioStats(sample: number, options: Partial<AudioStatsOptions> = {}) {
  return makeAudioStatsReport({
    packetsSent: sample * 10,
    pairId: sample === 0 ? 'wifi-pair' : 'vpn-pair',
    totalAudioEnergy: sample * .01,
    totalSamplesDuration: sample,
    remoteInboundTimestamp: 100,
    ...options
  });
}

async function advanceMediaSamples(count: number) {
  for(let i = 0; i < count; ++i) {
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
  }
}

async function joinConferenceFixture(
  controller: GroupCallsController,
  options: {
    input?: InputGroupCall,
    expectedCanonicalInput?: InputGroupCall.inputGroupCall,
    transitionGeneration?: number,
    outboundMediaRecoveryUsed?: boolean
  } = {}
) {
  const streamManager = {inputError: undefined as Error | undefined, stop: vi.fn()};
  const worker = {
    init: vi.fn(async() => {}),
    terminate: vi.fn(async() => {})
  };
  callMocks.createMainStreamManager.mockResolvedValue(streamManager);

  return (controller as any).joinConferenceCommon({
    input: options.input ?? INPUT,
    expectedCanonicalInput: options.expectedCanonicalInput,
    worker,
    seed: new Uint8Array(32),
    publicKey: new Uint8Array(32),
    selfUserId: SELF_USER_ID,
    lastBlockServer: new Uint8Array([1]),
    chatId: 99 as PeerId,
    muted: true,
    joinVideo: false,
    transitionGeneration: options.transitionGeneration,
    outboundMediaRecoveryUsed: options.outboundMediaRecoveryUsed
  });
}

describe('GroupCallsController conference transactions', () => {
  beforeEach(() => {
    callMocks.instances.length = 0;
    callMocks.negotiationError = undefined;
    callMocks.joinAccepted = false;
    callMocks.acceptedCallInput = undefined;
    callMocks.createMainStreamManager.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('observes cleanup rejection after the server discards the group call', async() => {
    const {controller, log} = makeController();
    let groupCallUpdate: ((groupCall: any) => void) | undefined;
    vi.spyOn(rootScope, 'addEventListener').mockImplementation(((event: string, listener: any) => {
      if(event === 'group_call_update') groupCallUpdate = listener;
    }) as any);
    controller.construct((controller as any).managers);
    (controller as any).log = log;
    const cleanupError = new Error('presentation leave failed');
    const hangUp = vi.fn().mockRejectedValue(cleanupError);
    (controller as any).currentGroupCall = {id: 'discarded-call', hangUp};

    groupCallUpdate!({
      _: 'groupCallDiscarded',
      id: 'discarded-call',
      access_hash: 'discarded-hash',
      duration: 0
    });
    await flushPromises();

    expect(hangUp).toHaveBeenCalledWith(false, false, true);
    expect(log.error).toHaveBeenCalledWith(
      'cleanup after discarded group call failed',
      cleanupError
    );
  });

  it('rolls the complete stack back and preserves the original join error', async() => {
    const {audioAsset, controller} = makeController();
    const streamManager = {inputError: undefined as Error | undefined, stop: vi.fn()};
    const worker = {
      init: vi.fn(async() => {}),
      terminate: vi.fn(async() => {})
    };
    const joinError = Object.assign(new Error('GROUPCALL_INVALID'), {type: 'GROUPCALL_INVALID'});
    callMocks.createMainStreamManager.mockResolvedValue(streamManager);
    callMocks.negotiationError = joinError;

    const joining = (controller as any).joinConferenceCommon({
      input: INPUT,
      worker,
      seed: new Uint8Array(32),
      publicKey: new Uint8Array(32),
      selfUserId: SELF_USER_ID,
      lastBlockServer: new Uint8Array([1]),
      muted: true,
      joinVideo: false
    });

    await expect(joining).rejects.toBe(joinError);

    const instance = callMocks.instances[0];
    const connectionInstance = instance.connections.main;
    expect(connectionInstance.closeConnectionAndStream).toHaveBeenCalledWith(true);
    expect(connectionInstance.connection.close).toHaveBeenCalledTimes(1);
    expect(streamManager.stop).toHaveBeenCalledTimes(1);
    expect(instance.cleanup).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(controller.groupCall).toBeNull();
    expect(audioAsset.playWithTimeout).toHaveBeenCalledTimes(1);
    expect(audioAsset.stop).toHaveBeenCalled();
    expect(audioAsset.cancelDelayedPlay).toHaveBeenCalled();
  });

  it('leaves exactly once when negotiation fails after the server accepted join', async() => {
    const {appGroupCallsManager, controller, log} = makeController();
    const streamManager = {inputError: undefined as Error | undefined, stop: vi.fn()};
    const worker = {
      init: vi.fn(async() => {}),
      terminate: vi.fn(async() => {})
    };
    const sdpError = new Error('setRemoteDescription failed');
    const leaveError = new Error('leave failed');
    callMocks.createMainStreamManager.mockResolvedValue(streamManager);
    callMocks.negotiationError = sdpError;
    callMocks.joinAccepted = true;
    appGroupCallsManager.leaveGroupCall.mockRejectedValue(leaveError);

    await expect((controller as any).joinConferenceCommon({
      input: INPUT,
      worker,
      seed: new Uint8Array(32),
      publicKey: new Uint8Array(32),
      selfUserId: SELF_USER_ID,
      lastBlockServer: new Uint8Array([1]),
      muted: true,
      joinVideo: false
    })).rejects.toBe(sdpError);

    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledTimes(1);
    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledWith(INPUT, 777);
    expect(log.warn).toHaveBeenCalledWith('conference post-accept rollback failed', leaveError);
  });

  it('rolls a slug join back through the canonical identity retained at acceptance', async() => {
    const {appGroupCallsManager, controller} = makeController();
    const streamManager = {inputError: undefined as Error | undefined, stop: vi.fn()};
    const worker = {
      init: vi.fn(async() => {}),
      terminate: vi.fn(async() => {})
    };
    const sdpError = new Error('connection extraction failed');
    callMocks.createMainStreamManager.mockResolvedValue(streamManager);
    callMocks.negotiationError = sdpError;
    callMocks.joinAccepted = true;
    callMocks.acceptedCallInput = INPUT;

    await expect((controller as any).joinConferenceCommon({
      input: SLUG_INPUT,
      worker,
      seed: new Uint8Array(32),
      publicKey: new Uint8Array(32),
      selfUserId: SELF_USER_ID,
      lastBlockServer: new Uint8Array([1]),
      muted: true,
      joinVideo: false
    })).rejects.toBe(sdpError);

    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledWith(INPUT, 777);
  });

  it('discards exactly once when an atomic create fails after acceptance', async() => {
    const {appGroupCallsManager, controller} = makeController();
    const streamManager = {inputError: undefined as Error | undefined, stop: vi.fn()};
    const worker = {
      init: vi.fn(async() => {}),
      terminate: vi.fn(async() => {})
    };
    const sdpError = new Error('create answer failed');
    callMocks.createMainStreamManager.mockResolvedValue(streamManager);
    callMocks.negotiationError = sdpError;
    callMocks.joinAccepted = true;
    callMocks.acceptedCallInput = INPUT;

    await expect((controller as any).joinConferenceCommon({
      createConference: true,
      worker,
      seed: new Uint8Array(32),
      publicKey: new Uint8Array(32),
      selfUserId: SELF_USER_ID,
      lastBlockServer: new Uint8Array([1]),
      muted: true,
      joinVideo: false
    })).rejects.toBe(sdpError);

    expect(appGroupCallsManager.discardGroupCall).toHaveBeenCalledTimes(1);
    expect(appGroupCallsManager.discardGroupCall).toHaveBeenCalledWith(INPUT);
    expect(appGroupCallsManager.leaveGroupCall).not.toHaveBeenCalled();
  });

  it('wipes the main-thread seed before a pending worker init resolves', async() => {
    const {controller} = makeController();
    const streamManager = {inputError: undefined as Error | undefined, stop: vi.fn()};
    let resolveInit: () => void;
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });
    const worker = {
      init: vi.fn(() => initPromise),
      terminate: vi.fn(async() => {})
    };
    const joinError = new Error('stop after init');
    const seed = new Uint8Array(32).fill(7);
    callMocks.createMainStreamManager.mockResolvedValue(streamManager);
    callMocks.negotiationError = joinError;

    const joining = (controller as any).joinConferenceCommon({
      input: INPUT,
      worker,
      seed,
      publicKey: new Uint8Array(32),
      selfUserId: SELF_USER_ID,
      lastBlockServer: new Uint8Array([1]),
      muted: true,
      joinVideo: false
    });

    await flushPromises();
    expect([...seed]).toEqual(new Array(32).fill(0));
    resolveInit!();
    await expect(joining).rejects.toBe(joinError);
  });

  it('does not schedule joined-source probes while the transport stays connected', () => {
    const {controller} = makeController();
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockReturnValue(1 as any);
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn()
    };
    const instance = makeLiveConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();
  });

  it('recovers once after route change and three active outbound samples without fresh RTCP', async() => {
    vi.useFakeTimers();
    const {controller, log} = makeController();
    let sample = 0;
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn(async() => makeProgressingAudioStats(sample++))
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();
    await advanceMediaSamples(4);

    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();

    await advanceMediaSamples(1);
    await flushPromises();

    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledWith({
      input: INPUT,
      selfUserId: SELF_USER_ID,
      chatId: 99,
      muted: false,
      joinVideo: false,
      transitionGeneration: expect.any(Number),
      outboundMediaRecoveryUsed: true
    });
    expect(log.warn).toHaveBeenCalledWith('rejoining conference', {
      reason: 'outbound-media-blackhole',
      id: INPUT.id
    });

    await advanceMediaSamples(12);
    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledTimes(1);
  });

  it('retains a candidate-pair change observed while muted and recovers after active unmuted samples', async() => {
    vi.useFakeTimers();
    const {controller} = makeController();
    let sample = 0;
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn(async() => makeProgressingAudioStats(sample++))
    };
    const instance = makeMediaReadyConferenceInstance(connection, {muted: true});
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();
    await advanceMediaSamples(1);

    expect(connection.getStats).toHaveBeenCalledTimes(2);
    expect(joinSpy).not.toHaveBeenCalled();

    instance.isMuted = false;
    await advanceMediaSamples(4);
    await flushPromises();

    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledTimes(1);
    expect(joinSpy.mock.calls[0][0]).toMatchObject({outboundMediaRecoveryUsed: true});
  });

  it('keeps the media probe armed after fresh RTCP and keeps transport recovery active', async() => {
    vi.useFakeTimers();
    const {controller, log} = makeController();
    const listeners: Record<string, () => void> = {};
    let sample = 0;
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
      }),
      getStats: vi.fn(async() => {
        const currentSample = sample++;
        return makeProgressingAudioStats(currentSample, {
          remoteInboundTimestamp: currentSample < 3 ? 100 : 101
        });
      })
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();
    await advanceMediaSamples(3);
    await advanceMediaSamples(12);

    // The acknowledged route only resets the probe's evidence — sampling keeps
    // running (cheaply) so a LATER route change is still detected.
    expect(connection.getStats).toHaveBeenCalledTimes(16);
    expect(joinSpy).not.toHaveBeenCalled();

    connection.connectionState = 'failed';
    listeners.connectionstatechange();
    await flushPromises();

    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledTimes(1);
    expect(joinSpy.mock.calls[0][0]).not.toHaveProperty('outboundMediaRecoveryUsed');
    expect(log.warn).toHaveBeenCalledWith('rejoining conference', {
      reason: 'connection-failed',
      id: INPUT.id
    });
  });

  it('does not infer a blackhole before the selected candidate pair changes', async() => {
    vi.useFakeTimers();
    const {controller} = makeController();
    let sample = 0;
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn(async() => makeProgressingAudioStats(sample++, {pairId: 'wifi-pair'}))
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();
    await advanceMediaSamples(12);

    expect(connection.getStats).toHaveBeenCalledTimes(13);
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();
  });

  it('does not recover when outbound packet count stops advancing', async() => {
    vi.useFakeTimers();
    const {controller} = makeController();
    let sample = 0;
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn(async() => {
        const currentSample = sample++;
        return makeProgressingAudioStats(currentSample, {
          packetsSent: Math.min(currentSample, 1) * 10
        });
      })
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();
    await advanceMediaSamples(12);

    expect(connection.getStats).toHaveBeenCalledTimes(13);
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();
  });

  it('does not recover when post-route-change source energy stays below the RMS gate', async() => {
    vi.useFakeTimers();
    const {controller} = makeController();
    let sample = 0;
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn(async() => {
        const currentSample = sample++;
        return makeProgressingAudioStats(currentSample, {
          totalAudioEnergy: currentSample * .00001
        });
      })
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();
    await advanceMediaSamples(12);

    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['the linked media source', {includeMediaSource: false}],
    ['the selected candidate pair', {includeSelectedPair: false}]
  ])('does not recover when stats omit %s', async(_label, statsOverrides) => {
    vi.useFakeTimers();
    const {controller} = makeController();
    let sample = 0;
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn(async() => makeProgressingAudioStats(sample++, statsOverrides))
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();
    await advanceMediaSamples(12);

    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['solo', (instance: any) => {
      instance.description.entries = [];
    }],
    ['muted', (instance: any) => {
      instance.isMuted = true;
    }],
    ['with a dead local track', (instance: any) => {
      instance.streamManager.inputStream.getAudioTracks()[0].readyState = 'ended';
    }]
  ])('does not recover when the call is %s', async(_label, makeIneligible) => {
    vi.useFakeTimers();
    const {controller} = makeController();
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn(async() => makeProgressingAudioStats(0))
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    makeIneligible(instance);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await advanceMediaSamples(12);

    expect(connection.getStats).toHaveBeenCalledTimes(13);
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();
  });

  it('keeps sampling safely after getStats rejects without inferring a blackhole', async() => {
    vi.useFakeTimers();
    const {controller, log} = makeController();
    const statsError = new Error('stats unavailable');
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn().mockRejectedValue(statsError)
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();
    await advanceMediaSamples(8);

    expect(connection.getStats).toHaveBeenCalledTimes(9);
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('conference media liveness sample failed', statsError);
  });

  it('ignores a stale getStats result after the watched instance is replaced', async() => {
    vi.useFakeTimers();
    const {controller} = makeController();
    let resolveStats: (report: ReturnType<typeof makeAudioStatsReport>) => void;
    const pendingStats = new Promise<ReturnType<typeof makeAudioStatsReport>>((resolve) => {
      resolveStats = resolve;
    });
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn(() => pendingStats)
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();
    expect(connection.getStats).toHaveBeenCalledTimes(1);

    controller.setCurrentGroupCall({...instance, id: 'replacement'} as any);
    resolveStats!(makeProgressingAudioStats(0));
    await flushPromises();
    await advanceMediaSamples(8);

    expect(connection.getStats).toHaveBeenCalledTimes(1);
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();
  });

  it('keeps a latched replacement observe-only and re-arms recovery after a fresh ack', async() => {
    vi.useFakeTimers();
    const {controller} = makeController();
    let sample = 0;
    let pairId = 'pair-a';
    let remoteInboundTimestamp: number | undefined;
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn(),
      getStats: vi.fn(async() => makeProgressingAudioStats(sample++, {pairId, remoteInboundTimestamp}))
    };
    const instance = makeMediaReadyConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    (controller as any).outboundMediaRecoveryUsed.add(instance);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    await flushPromises();

    // Route change + active outbound + no RTCP — the full blackhole pattern —
    // must NOT chain a second automatic rejoin while the latch is held.
    await advanceMediaSamples(1);
    pairId = 'pair-b';
    await advanceMediaSamples(5);
    expect(joinSpy).not.toHaveBeenCalled();
    expect((controller as any).outboundMediaRecoveryUsed.has(instance)).toBe(true);

    // A fresh RTCP acknowledgement proves the rebuilt transport carries media
    // and releases the one-shot latch.
    remoteInboundTimestamp = 100;
    await advanceMediaSamples(1);
    expect((controller as any).outboundMediaRecoveryUsed.has(instance)).toBe(false);

    // A LATER route change that blackholes is detected and recovered again.
    remoteInboundTimestamp = undefined;
    await advanceMediaSamples(1);
    pairId = 'pair-c';
    await advanceMediaSamples(5);
    await flushPromises();

    expect(joinSpy).toHaveBeenCalledTimes(1);
    expect(joinSpy.mock.calls[0][0]).toMatchObject({outboundMediaRecoveryUsed: true});
  });

  it('recovers immediately when the peer connection fails', async() => {
    const {controller, log} = makeController();
    const listeners: Record<string, () => void> = {};
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
      })
    };
    const instance = makeLiveConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    connection.connectionState = 'failed';
    listeners.connectionstatechange();

    await vi.waitFor(() => expect(joinSpy).toHaveBeenCalledTimes(1));
    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('rejoining conference', {
      reason: 'connection-failed',
      id: INPUT.id
    });
  });

  it('routes a canonical conference recovery request into one controlled rejoin', async() => {
    const {controller} = makeController();
    const instance = await joinConferenceFixture(controller);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);

    instance.dispatchEvent('conferenceRecoveryRequired', 'chain-forbidden');
    instance.dispatchEvent('conferenceRecoveryRequired', 'chain-forbidden');

    await vi.waitFor(() => expect(joinSpy).toHaveBeenCalledTimes(1));
    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(instance.hangUp).toHaveBeenCalledWith(false, false, true);
    expect(joinSpy).toHaveBeenCalledWith({
      input: INPUT,
      selfUserId: SELF_USER_ID,
      chatId: 99,
      muted: true,
      joinVideo: false,
      transitionGeneration: expect.any(Number)
    });
  });

  it('uses the canonical identity promoted by the accepted join during recovery', async() => {
    const {controller} = makeController();
    const promotedInput: InputGroupCall.inputGroupCall = {
      ...INPUT,
      access_hash: 'rotated-access-hash'
    };
    callMocks.acceptedCallInput = promotedInput;
    const instance = await joinConferenceFixture(controller);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);

    instance.dispatchEvent('conferenceRecoveryRequired', 'chain-forbidden');

    await vi.waitFor(() => expect(joinSpy).toHaveBeenCalledTimes(1));
    expect(instance.toInputGroupCall()).toEqual(promotedInput);
    expect(joinSpy).toHaveBeenCalledWith({
      input: promotedInput,
      selfUserId: SELF_USER_ID,
      chatId: 99,
      muted: true,
      joinVideo: false,
      transitionGeneration: expect.any(Number)
    });
  });

  it('replays cached participant rows into a recovery replacement after publication', async() => {
    // Rows dispatched while `currentGroupCall` was null (the whole recovery
    // join) were saved into the manager cache but never routed to the new
    // instance — no recv transceivers, no e2e SSRC mappings until the next
    // complete poll. The replacement must replay the cache deterministically.
    const {controller, appGroupCallsManager} = makeController();
    const remoteRow = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: '555'},
      pFlags: {},
      source: 5,
      date: 1
    };
    const selfRow = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: '42'},
      pFlags: {self: true},
      source: 1,
      date: 1
    };
    (appGroupCallsManager as any).getCachedParticipants = vi.fn(async() => new Map([
      [555 as PeerId, remoteRow],
      [42 as PeerId, selfRow]
    ]));
    const generation = 3;
    (controller as any).conferenceTransitionGeneration = generation;

    const replacement = await joinConferenceFixture(controller, {transitionGeneration: generation});
    const updateSpy = replacement.onParticipantUpdate as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledWith(remoteRow));

    // Self is hydrated through its own guarded path, never replayed raw.
    expect(updateSpy).not.toHaveBeenCalledWith(selfRow);
  });

  it('marks a recovery replacement and suppresses its duplicate start chime', async() => {
    const {audioAsset, controller} = makeController();
    const generation = 4;
    const instanceEvents: Array<[any, boolean | undefined]> = [];
    controller.addEventListener('instance', (instance, isRecovery) => {
      instanceEvents.push([instance, isRecovery]);
    });
    (controller as any).conferenceTransitionGeneration = generation;

    const instance = await joinConferenceFixture(controller, {transitionGeneration: generation});
    const connection = instance.connections.main.connection;
    const onIceState = connection.addEventListener.mock.calls
    .find(([event]: [string]) => event === 'iceconnectionstatechange')?.[1];
    if(!onIceState) throw new Error('ICE state listener was not installed');

    expect(instanceEvents).toEqual([[instance, true]]);
    connection.iceConnectionState = 'connected';
    onIceState();

    expect(audioAsset.play).not.toHaveBeenCalledWith({name: 'start'});
  });

  it('publishes only the recovery attempt whose negotiation committed', async() => {
    const {controller} = makeController();
    const generation = 5;
    const events: Array<[any, boolean | undefined]> = [];
    controller.addEventListener('instance', (instance, isRecovery) => {
      events.push([instance, isRecovery]);
    });
    (controller as any).conferenceTransitionGeneration = generation;
    const firstError = new Error('first recovery attempt failed');
    callMocks.negotiationError = firstError;

    await expect(joinConferenceFixture(controller, {transitionGeneration: generation}))
    .rejects.toBe(firstError);
    expect(events).toEqual([]);

    callMocks.negotiationError = undefined;
    const replacement = await joinConferenceFixture(controller, {transitionGeneration: generation});

    expect(events).toEqual([[replacement, true]]);
  });

  it('preserves slug authorization and its canonical identity during recovery', async() => {
    const {controller} = makeController();
    callMocks.acceptedCallInput = INPUT;
    const instance = await joinConferenceFixture(controller, {
      input: SLUG_INPUT,
      expectedCanonicalInput: INPUT
    });
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);

    instance.dispatchEvent('conferenceRecoveryRequired', 'membership-lost');

    await vi.waitFor(() => expect(joinSpy).toHaveBeenCalledTimes(1));
    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledWith({
      input: SLUG_INPUT,
      expectedCanonicalInput: INPUT,
      selfUserId: SELF_USER_ID,
      chatId: 99,
      muted: true,
      joinVideo: false,
      transitionGeneration: expect.any(Number)
    });
  });

  it('defers a conference recovery request until the transition reservation releases', async() => {
    const {controller} = makeController();
    const instance = await joinConferenceFixture(controller);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    const release = await controller.reserveConferenceTransition();

    instance.dispatchEvent('conferenceRecoveryRequired', 'membership-lost');
    await flushPromises();

    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();

    release();
    release();

    await vi.waitFor(() => expect(joinSpy).toHaveBeenCalledTimes(1));
    expect(instance.hangUp).toHaveBeenCalledTimes(1);
  });

  it('defers recovery until the initial conference join transaction settles', async() => {
    const {controller} = makeController();
    let resolveInitialJoin: (instance: any) => void;
    const initialJoin = new Promise<any>((resolve) => {
      resolveInitialJoin = resolve;
    });
    const replacement = {id: INPUT.id} as any;
    const attempt = vi.spyOn(controller as any, 'joinConferenceAttempt')
    .mockReturnValueOnce(initialJoin)
    .mockResolvedValueOnce(replacement);
    const instance = makeLiveConferenceInstance({connectionState: 'connected'});

    const joining = controller.joinConference({input: INPUT, selfUserId: SELF_USER_ID});
    controller.setCurrentGroupCall(instance);
    await (controller as any).recoverConference(instance, 'membership-lost');
    await flushPromises();

    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(attempt).toHaveBeenCalledTimes(1);

    resolveInitialJoin!(instance);
    await expect(joining).resolves.toBe(instance);

    await vi.waitFor(() => expect(attempt).toHaveBeenCalledTimes(2));
    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(attempt.mock.calls[1][0]).toMatchObject({
      input: INPUT,
      selfUserId: SELF_USER_ID,
      transitionGeneration: expect.any(Number)
    });
  });

  it.each(['replaced', 'closing'] as const)(
    'drops a deferred conference recovery when its instance is %s before release',
    async(staleState) => {
      const {controller} = makeController();
      const instance = await joinConferenceFixture(controller);
      const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
      const release = await controller.reserveConferenceTransition();

      instance.dispatchEvent('conferenceRecoveryRequired', 'membership-lost');
      if(staleState === 'replaced') {
        controller.setCurrentGroupCall({...instance, id: 'replacement'} as any);
      } else {
        instance.isClosing = true;
      }
      release();
      await flushPromises();

      expect(instance.hangUp).not.toHaveBeenCalled();
      expect(joinSpy).not.toHaveBeenCalled();
    }
  );

  it('drains a deferred conference recovery only after the final nested reservation releases', async() => {
    const {controller} = makeController();
    const instance = await joinConferenceFixture(controller);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    const releaseOuter = await controller.reserveConferenceTransition();
    const releaseInner = await controller.reserveConferenceTransition();

    instance.dispatchEvent('conferenceRecoveryRequired', 'membership-lost');
    releaseOuter();
    await flushPromises();

    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();

    releaseInner();
    await vi.waitFor(() => expect(joinSpy).toHaveBeenCalledTimes(1));
    expect(instance.hangUp).toHaveBeenCalledTimes(1);
  });

  it('recovers when ICE remains disconnected through the grace period', async() => {
    vi.useFakeTimers();
    const {controller, log} = makeController();
    const listeners: Record<string, () => void> = {};
    const connection = {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      addEventListener: vi.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
      })
    };
    const instance = makeLiveConferenceInstance(connection);
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    connection.connectionState = 'disconnected';
    connection.iceConnectionState = 'disconnected';
    listeners.iceconnectionstatechange();

    await vi.advanceTimersByTimeAsync(9999);
    expect(joinSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('rejoining conference', {
      reason: 'ice-disconnected',
      id: INPUT.id
    });
  });

  it('cancels an in-flight recovery before another call can start', async() => {
    const {controller} = makeController();
    let finishHangUp: () => void;
    const hangUpPending = new Promise<void>((resolve) => {
      finishHangUp = resolve;
    });
    const instance = {
      id: INPUT.id,
      chatId: 99 as PeerId,
      selfUserId: SELF_USER_ID,
      isClosing: false,
      isMuted: true,
      isSharingVideo: false,
      toInputGroupCall: vi.fn(() => INPUT),
      hangUp: vi.fn(() => hangUpPending)
    } as any;
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    const recovery = (controller as any).recoverConference(instance, 'test-race') as Promise<void>;
    await flushPromises();
    const reservation = controller.reserveConferenceTransition();
    finishHangUp!();

    const [, release] = await Promise.all([recovery, reservation]);
    release();

    expect(joinSpy).not.toHaveBeenCalled();
    expect(controller.groupCall).toBeNull();
  });

  it('blocks replacement recovery until the reserved transition releases', async() => {
    const {controller} = makeController();
    let finishHangUp: () => void;
    const hangUpPending = new Promise<void>((resolve) => {
      finishHangUp = resolve;
    });
    const recoveringInstance = {
      id: INPUT.id,
      chatId: 99 as PeerId,
      selfUserId: SELF_USER_ID,
      isClosing: false,
      isMuted: true,
      isSharingVideo: false,
      toInputGroupCall: vi.fn(() => INPUT),
      hangUp: vi.fn(() => hangUpPending)
    } as any;
    const replacementInstance = {
      ...recoveringInstance,
      id: '701',
      hangUp: vi.fn(async() => {})
    } as any;
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(recoveringInstance);

    const recovery = (controller as any).recoverConference(recoveringInstance, 'test-race') as Promise<void>;
    const reservation = controller.reserveConferenceTransition();
    finishHangUp!();
    const release = await reservation;
    await recovery;

    controller.setCurrentGroupCall(replacementInstance);
    await (controller as any).recoverConference(replacementInstance, 'during-transition');
    expect(replacementInstance.hangUp).not.toHaveBeenCalled();
    expect(joinSpy).not.toHaveBeenCalled();

    release();
    await (controller as any).recoverConference(replacementInstance, 'after-transition');
    expect(replacementInstance.hangUp).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledTimes(1);
  });

  it('waits for provisional conference media cleanup before granting a reservation', async() => {
    const {controller} = makeController();
    const streamManager = {inputError: undefined as Error | undefined, stop: vi.fn()};
    let finishInit: () => void;
    const initPending = new Promise<void>((resolve) => {
      finishInit = resolve;
    });
    const worker = {
      init: vi.fn(() => initPending),
      terminate: vi.fn(async() => {})
    };
    callMocks.createMainStreamManager.mockResolvedValue(streamManager);
    const generation = 1;
    (controller as any).conferenceTransitionGeneration = generation;

    const joining = (controller as any).joinConferenceCommon({
      input: INPUT,
      worker,
      seed: new Uint8Array(32),
      publicKey: new Uint8Array(32),
      selfUserId: SELF_USER_ID,
      lastBlockServer: new Uint8Array([1]),
      transitionGeneration: generation
    }) as Promise<unknown>;
    const recovery = joining.then(
      (): void => undefined,
      (): void => undefined
    );
    (controller as any).conferenceRecovery = {generation, promise: recovery};
    await vi.waitFor(() => expect(worker.init).toHaveBeenCalledTimes(1));

    let reservationGranted = false;
    const reservation = controller.reserveConferenceTransition().then((release) => {
      reservationGranted = true;
      return release;
    });
    await flushPromises();
    expect(reservationGranted).toBe(false);

    finishInit!();
    await expect(joining).rejects.toThrow('Conference recovery was superseded');
    const release = await reservation;
    const instance = callMocks.instances[0];
    expect(instance.connections.main.closeConnectionAndStream).toHaveBeenCalledWith(true);
    expect(instance.cleanup).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    release();
  });

  it('keeps nested reservations active until the final idempotent release', async() => {
    const {controller} = makeController();
    const instance = {
      id: INPUT.id,
      chatId: 99 as PeerId,
      selfUserId: SELF_USER_ID,
      isClosing: false,
      isMuted: true,
      isSharingVideo: false,
      toInputGroupCall: vi.fn(() => INPUT),
      hangUp: vi.fn(async() => {})
    } as any;
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    const releaseOuter = await controller.reserveConferenceTransition();
    const releaseInner = await controller.reserveConferenceTransition();
    releaseOuter();
    releaseOuter();

    await (controller as any).recoverConference(instance, 'nested-transition');
    expect(instance.hangUp).not.toHaveBeenCalled();

    releaseInner();
    await (controller as any).recoverConference(instance, 'released-transition');
    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledTimes(1);
  });

  it('recovers when ICE stays new and the initial transport timeout expires', async() => {
    const {controller} = makeController();
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockReturnValue(1 as any);
    const connection = {
      connectionState: 'new',
      iceConnectionState: 'new',
      addEventListener: vi.fn()
    };
    const instance = makeLiveConferenceInstance(connection);
    instance.joined = false;
    const joinSpy = vi.spyOn(controller, 'joinConference').mockResolvedValue({} as any);
    controller.setCurrentGroupCall(instance);

    (controller as any).startConferenceLiveness(instance);
    const transportTimeout = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 10000)?.[0];
    if(typeof transportTimeout !== 'function') throw new Error('initial transport timeout was not scheduled');
    await transportTimeout();
    await flushPromises();
    await flushPromises();

    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledTimes(1);
  });

  it('retries SSRC_DUPLICATE as a fresh join attempt', async() => {
    const {controller} = makeController();
    const collision = {type: 'GROUPCALL_SSRC_DUPLICATE_MUCH'};
    const joined = {id: INPUT.id} as any;
    const attempt = vi.spyOn(controller as any, 'joinConferenceAttempt')
    .mockRejectedValueOnce(collision)
    .mockResolvedValueOnce(joined);

    await expect(controller.joinConference({input: INPUT, selfUserId: SELF_USER_ID})).resolves.toBe(joined);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('retries an Error-message membership race as a fresh join attempt', async() => {
    const {controller} = makeController();
    const membershipRace = new Error('NOT_PARTICIPANT: our public key is not in group_state');
    const joined = {id: INPUT.id} as any;
    const attempt = vi.spyOn(controller as any, 'joinConferenceAttempt')
    .mockRejectedValueOnce(membershipRace)
    .mockResolvedValueOnce(joined);

    await expect(controller.joinConference({input: INPUT, selfUserId: SELF_USER_ID})).resolves.toBe(joined);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('limits Error-message membership retries to three fresh join attempts', async() => {
    const {controller} = makeController();
    const firstError = new Error('NOT_PARTICIPANT: first membership race');
    const secondError = new Error('NOT_PARTICIPANT: second membership race');
    const finalError = new Error('NOT_PARTICIPANT: final membership race');
    const attempt = vi.spyOn(controller as any, 'joinConferenceAttempt')
    .mockRejectedValueOnce(firstError)
    .mockRejectedValueOnce(secondError)
    .mockRejectedValueOnce(finalError);

    await expect(controller.joinConference({input: INPUT, selfUserId: SELF_USER_ID})).rejects.toBe(finalError);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('single-flights concurrent joins for the same conference', async() => {
    const {controller} = makeController();
    let resolveAttempt: (instance: any) => void;
    const attemptPromise = new Promise<any>((resolve) => {
      resolveAttempt = resolve;
    });
    const attempt = vi.spyOn(controller as any, 'joinConferenceAttempt').mockReturnValue(attemptPromise);

    const first = controller.joinConference({input: INPUT, selfUserId: SELF_USER_ID});
    const second = controller.joinConference({input: {...INPUT}, selfUserId: SELF_USER_ID});

    expect(second).toBe(first);
    expect(attempt).toHaveBeenCalledTimes(1);
    const joined = {id: INPUT.id} as any;
    resolveAttempt!(joined);
    await expect(first).resolves.toBe(joined);
    await expect(second).resolves.toBe(joined);
  });

  it('starts a fresh conference with one zero-block create transaction', async() => {
    const {appGroupCallsManager, controller} = makeController();
    const seed = new Uint8Array(32).fill(7);
    const publicKey = new Uint8Array(32).fill(8);
    const zeroBlock = new Uint8Array([9]);
    const worker = {
      createZeroBlock: vi.fn(async() => zeroBlock),
      terminate: vi.fn(async() => {})
    };
    const selfParticipant = {
      userId: SELF_USER_ID,
      publicKey,
      canAddUsers: true,
      canRemoveUsers: true,
      version: 0
    };
    vi.spyOn(controller as any, 'createConferenceCrypto').mockReturnValue({
      publicKey,
      seed,
      selfParticipant,
      worker
    });
    const created = {id: INPUT.id} as any;
    const common = vi.spyOn(controller as any, 'joinConferenceCommon').mockResolvedValue(created);

    await expect(controller.startConference({
      selfUserId: SELF_USER_ID,
      muted: true,
      joinVideo: false
    })).resolves.toBe(created);

    expect(worker.createZeroBlock).toHaveBeenCalledWith({
      privateSeed: seed,
      groupState: {participants: [selfParticipant], externalPermissions: 3}
    });
    expect(common).toHaveBeenCalledWith({
      createConference: true,
      worker,
      seed,
      publicKey,
      selfUserId: SELF_USER_ID,
      lastBlockServer: zeroBlock,
      chatId: undefined,
      muted: true,
      joinVideo: false
    });
    expect(appGroupCallsManager.getGroupCallFull).not.toHaveBeenCalled();
    expect(appGroupCallsManager.discardGroupCall).not.toHaveBeenCalled();
    expect([...seed]).toEqual(new Array(32).fill(0));
  });

  it('rebuilds a fresh conference stack after an SSRC collision', async() => {
    const {controller} = makeController();
    const collision = {type: 'GROUPCALL_SSRC_DUPLICATE_MUCH'};
    const joined = {id: INPUT.id} as any;
    const attempt = vi.spyOn(controller as any, 'startConferenceAttempt')
    .mockRejectedValueOnce(collision)
    .mockResolvedValueOnce(joined);

    await expect(controller.startConference({selfUserId: SELF_USER_ID})).resolves.toBe(joined);

    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not compensate an atomic create before its RPC is accepted', async() => {
    const {appGroupCallsManager, controller} = makeController();
    const seed = new Uint8Array(32).fill(7);
    const worker = {
      createZeroBlock: vi.fn(async() => new Uint8Array([9])),
      terminate: vi.fn(async() => {})
    };
    vi.spyOn(controller as any, 'createConferenceCrypto').mockReturnValue({
      publicKey: new Uint8Array(32),
      seed,
      selfParticipant: {userId: SELF_USER_ID},
      worker
    });
    const createError = new Error('create rejected');
    vi.spyOn(controller as any, 'joinConferenceCommon').mockRejectedValue(createError);

    await expect(controller.startConference({selfUserId: SELF_USER_ID})).rejects.toBe(createError);

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(appGroupCallsManager.discardGroupCall).not.toHaveBeenCalled();
    expect(appGroupCallsManager.leaveGroupCall).not.toHaveBeenCalled();
    expect([...seed]).toEqual(new Array(32).fill(0));
  });

  it('rejects a different concurrent join before creating another stack', async() => {
    const {controller} = makeController();
    let resolveAttempt: (instance: any) => void;
    const attemptPromise = new Promise<any>((resolve) => {
      resolveAttempt = resolve;
    });
    const attempt = vi.spyOn(controller as any, 'joinConferenceAttempt').mockReturnValue(attemptPromise);

    const first = controller.joinConference({input: INPUT, selfUserId: SELF_USER_ID});
    const different = controller.joinConference({
      input: {_: 'inputGroupCallSlug', slug: 'another-conference'},
      selfUserId: SELF_USER_ID
    });

    await expect(different).rejects.toThrow('CONFERENCE_JOIN_IN_PROGRESS');
    expect(attempt).toHaveBeenCalledTimes(1);
    resolveAttempt!({id: INPUT.id});
    await first;
  });
});

describe('GroupCallsController legacy join rollback', () => {
  beforeEach(() => {
    callMocks.instances.length = 0;
    callMocks.negotiationError = undefined;
    callMocks.joinAccepted = false;
    callMocks.acceptedCallInput = undefined;
    callMocks.createMainStreamManager.mockReset();
    // The legacy state listener announces the closed call to the chat list
    // through the (absent here) worker port.
    vi.spyOn(rootScope, 'dispatchEvent').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The microphone is captured before the join starts. Until the instance is
  // current there is no UI that could release it, so a failed join must undo
  // the capture itself — it used to stay live until a reload.
  it('releases the captured microphone when the call cannot even be fetched', async() => {
    const {appGroupCallsManager, controller} = makeController();
    const streamManager = {stop: vi.fn()};
    callMocks.createMainStreamManager.mockResolvedValue(streamManager);
    const fetchError = new Error('GROUPCALL_INVALID');
    appGroupCallsManager.getGroupCallFull.mockRejectedValueOnce(fetchError);

    await expect(controller.joinGroupCall(99 as ChatId, INPUT.id as any, true)).rejects.toBe(fetchError);

    expect(streamManager.stop).toHaveBeenCalledTimes(1);
    expect(callMocks.instances[0].cleanup).toHaveBeenCalledTimes(1);
    expect(controller.groupCall).toBeFalsy();
    expect(appGroupCallsManager.leaveGroupCall).not.toHaveBeenCalled();
  });

  it('tears the transport down and leaves once when negotiation fails after the server accepted the join', async() => {
    const {appGroupCallsManager, controller} = makeController();
    const streamManager = {stop: vi.fn()};
    callMocks.createMainStreamManager.mockResolvedValue(streamManager);
    const sdpError = new Error('setRemoteDescription failed');
    callMocks.negotiationError = sdpError;
    callMocks.joinAccepted = true;
    callMocks.acceptedCallInput = INPUT;

    await expect(controller.joinGroupCall(99 as ChatId, INPUT.id as any, true)).rejects.toBe(sdpError);

    const instance = callMocks.instances[0];
    const connectionInstance = instance.connections.main;
    expect(connectionInstance.closeConnectionAndStream).toHaveBeenCalledWith(true);
    expect(streamManager.stop).toHaveBeenCalledTimes(1);
    expect(instance.cleanup).toHaveBeenCalledTimes(1);
    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledTimes(1);
    expect(appGroupCallsManager.leaveGroupCall).toHaveBeenCalledWith(INPUT, 777);
    expect(controller.groupCall).toBeFalsy();
  });
});
