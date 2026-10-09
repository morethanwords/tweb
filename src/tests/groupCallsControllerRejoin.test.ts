/*
 * A legacy group call (voice chat) used to end on ICE `failed` / connection
 * `failed` ("TODO: replace with ICE restart") and on a stalled DTLS handshake.
 * The SFU is ICE-lite and its credentials come from phone.joinGroupCall, so
 * recovery is a rejoin: the main connection is rebuilt in place — same
 * instance, same capture — on failure, on `disconnected` lasting past the
 * grace period, and when phone.checkGroupCall says the server forgot our
 * source while we reconnect (iOS / tdesktop). Bounded, then the call is left.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const callMocks = vi.hoisted(() => ({
  createMainStreamManager: vi.fn()
}));

vi.mock('@lib/calls/helpers/createMainStreamManager', () => ({
  default: callMocks.createMainStreamManager
}));

vi.mock('@environment/userAgent', async(importOriginal) => {
  const actual = await importOriginal<typeof import('@environment/userAgent')>();
  return {...actual, IS_CHROMIUM: true};
});

vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

import {GroupCallsController} from '@lib/calls/groupCallsController';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';

const INPUT = {_: 'inputGroupCall' as const, id: '900', access_hash: '901'};

class FakeConnection extends EventTarget {
  public connectionState: RTCPeerConnectionState = 'connected';
  public iceConnectionState: RTCIceConnectionState = 'connected';
  public close = vi.fn();

  public set(ice: RTCIceConnectionState, connection: RTCPeerConnectionState = ice === 'completed' ? 'connected' : ice as RTCPeerConnectionState) {
    this.iceConnectionState = ice;
    this.connectionState = connection;
    this.dispatchEvent(new Event('iceconnectionstatechange'));
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}

function makeConnectionInstance(source: number, connection = new FakeConnection()) {
  const connectionInstance: any = {
    connection,
    streamManager: {id: 'capture'},
    sources: {audio: {source}},
    createPeerConnection: vi.fn(() => connection),
    createDescription: vi.fn(),
    createDataChannel: vi.fn(),
    appendStreamToConference: vi.fn(async() => {}),
    requestNegotiation: vi.fn(async() => {}),
    closeConnection: vi.fn(),
    closeConnectionAndStream: vi.fn()
  };
  return connectionInstance;
}

function makeLegacyInstance() {
  const main = makeConnectionInstance(777);
  const created: any[] = [];
  const listeners = new Map<string, Array<(payload: any) => void>>();
  const instance: any = {
    id: INPUT.id,
    chatId: 99,
    joined: true,
    isMuted: false,
    isSharingVideo: true,
    connections: {main},
    participants: Promise.resolve(new Map([
      [1, {pFlags: {self: true}}],
      [2, {pFlags: {}, source: 2}]
    ])),
    isClosing: false,
    isConference: false,
    get state() {
      return GROUP_CALL_STATE.CONNECTING;
    },
    toInputGroupCall: () => INPUT,
    hangUp: vi.fn(async() => {}),
    onParticipantUpdate: vi.fn(),
    onTrack: vi.fn(),
    reportMediaTransportStall: vi.fn(),
    beginMainRejoin: vi.fn(),
    finishMainRejoin: vi.fn(async() => {}),
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn((event: string, listener: (payload: any) => void) => {
      listeners.set(event, [...(listeners.get(event) || []), listener]);
    }),
    removeEventListener: vi.fn((event: string, listener: (payload: any) => void) => {
      listeners.set(event, (listeners.get(event) || []).filter((l) => l !== listener));
    }),
    prepareMainConnectionRejoin: vi.fn(function(this: any) {
      return this.connections.main;
    }),
    createConnectionInstance: vi.fn(function(this: any, {options}: any) {
      const connectionInstance = makeConnectionInstance(1000 + created.length);
      connectionInstance.connection.set('new', 'new');
      connectionInstance.options = options;
      created.push(connectionInstance);
      this.connections.main = connectionInstance;
      return connectionInstance;
    })
  };
  return {instance, main, created, listeners};
}

function makeController() {
  const audioAsset = {
    createAudio: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    playWithTimeout: vi.fn(),
    cancelDelayedPlay: vi.fn()
  };
  const appGroupCallsManager = {
    getGroupCallParticipants: vi.fn(async() => ({participants: [] as any[], isEnd: true})),
    checkGroupCall: vi.fn(async(): Promise<number[]> => [777])
  };
  const log = Object.assign(vi.fn(), {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    bindPrefix: () => Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn()})
  });
  const controller = new GroupCallsController();
  Object.assign(controller as any, {audioAsset, log, managers: {appGroupCallsManager}});
  return {controller, appGroupCallsManager, log, audioAsset};
}

async function flush() {
  for(let i = 0; i < 6; ++i) await Promise.resolve();
}

describe('legacy group call transport recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rebuilds the main connection in place when ICE fails, keeping the capture and the call', async() => {
    const {controller, appGroupCallsManager} = makeController();
    const {instance, main, created} = makeLegacyInstance();
    instance.connections.presentation = {id: 'screen'};
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);

    main.connection.set('failed');
    await flush();

    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(instance.prepareMainConnectionRejoin).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    const replacement = created[0];
    // Same capture, the camera stays announced, the old transport is closed
    // only after the new one is current, and its stream is kept.
    expect(instance.createConnectionInstance).toHaveBeenCalledWith(expect.objectContaining({
      streamManager: main.streamManager,
      options: expect.objectContaining({type: 'main', isMuted: false, joinVideo: true, rejoin: true})
    }));
    expect(main.closeConnection).toHaveBeenCalledTimes(1);
    expect(main.closeConnectionAndStream).not.toHaveBeenCalled();
    expect(replacement.requestNegotiation).toHaveBeenCalledTimes(1);

    await flush();
    // The new connection gets the roster replayed and the screen share rejoined.
    expect(instance.onParticipantUpdate).toHaveBeenCalledTimes(1);
    expect(instance.onParticipantUpdate).toHaveBeenCalledWith({pFlags: {}, source: 2});
    expect(appGroupCallsManager.getGroupCallParticipants).toHaveBeenCalledWith(INPUT.id);
    // The presentation self-recovery was held for the whole rejoin and the
    // screen share is rebuilt only after the new main join.
    expect(instance.beginMainRejoin).toHaveBeenCalledTimes(1);
    expect(instance.finishMainRejoin).toHaveBeenCalledWith(true);
    expect(instance.beginMainRejoin.mock.invocationCallOrder[0])
    .toBeLessThan(replacement.requestNegotiation.mock.invocationCallOrder[0]);
    expect(instance.finishMainRejoin.mock.invocationCallOrder[0])
    .toBeGreaterThan(replacement.requestNegotiation.mock.invocationCallOrder[0]);
    // Shown as connecting from the swap on, even if the old ICE was connected.
    expect(instance.dispatchEvent).toHaveBeenCalledWith('state', GROUP_CALL_STATE.CONNECTING);
  });

  it('rejoins when the connection stays disconnected past the grace period, not before', async() => {
    const {controller} = makeController();
    const {instance, main, created} = makeLegacyInstance();
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);

    main.connection.set('disconnected');
    await vi.advanceTimersByTimeAsync(9000);
    main.connection.set('connected');
    await vi.advanceTimersByTimeAsync(20000);
    expect(created).toHaveLength(0);

    main.connection.set('disconnected');
    await vi.advanceTimersByTimeAsync(10000);
    expect(created).toHaveLength(1);
    expect(instance.hangUp).not.toHaveBeenCalled();
  });

  it('asks the server whether it still knows our source while reconnecting, and rejoins when it does not', async() => {
    const {controller, appGroupCallsManager} = makeController();
    const {instance, main, created} = makeLegacyInstance();
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);

    main.connection.set('disconnected');
    await vi.advanceTimersByTimeAsync(4000);
    expect(appGroupCallsManager.checkGroupCall).toHaveBeenCalledWith(INPUT, [777]);
    expect(created).toHaveLength(0);

    // Still known: keep waiting, ask again 4 s later.
    appGroupCallsManager.checkGroupCall.mockResolvedValueOnce([]);
    await vi.advanceTimersByTimeAsync(4000);
    expect(appGroupCallsManager.checkGroupCall).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(1);
  });

  it('treats a failed check as inconclusive and never checks a connection that was not connected yet', async() => {
    const {controller, appGroupCallsManager} = makeController();
    const {instance, main, created} = makeLegacyInstance();
    main.connection.set('checking', 'connecting');
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);
    await vi.advanceTimersByTimeAsync(5000);
    expect(appGroupCallsManager.checkGroupCall).not.toHaveBeenCalled();

    main.connection.set('connected');
    appGroupCallsManager.checkGroupCall.mockRejectedValue(new Error('no method'));
    main.connection.set('disconnected');
    await vi.advanceTimersByTimeAsync(4000);
    expect(appGroupCallsManager.checkGroupCall).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(0);
  });

  it('gives up after the rejoin budget and leaves the call', async() => {
    const {controller, log} = makeController();
    const {instance, main} = makeLegacyInstance();
    instance.createConnectionInstance.mockImplementation(() => {
      throw new Error('join rejected');
    });
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);

    main.connection.set('failed');
    await vi.advanceTimersByTimeAsync(10000);

    expect(instance.createConnectionInstance).toHaveBeenCalledTimes(3);
    expect(instance.hangUp).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('group call transport did not recover — leaving', expect.anything());
  });

  it('resets the budget once a rebuilt transport connects', async() => {
    const {controller} = makeController();
    const {instance, main, created} = makeLegacyInstance();
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);

    main.connection.set('failed');
    await flush();
    expect(created).toHaveLength(1);
    expect((controller as any).groupCallRejoinAttempts.get(instance)).toBe(1);

    created[0].connection.set('connected');
    expect((controller as any).groupCallRejoinAttempts.get(instance)).toBeUndefined();

    // The watcher of the old connection is gone; the new one recovers.
    main.connection.set('failed');
    await flush();
    expect(created).toHaveLength(1);
    created[0].connection.set('failed');
    await flush();
    expect(created).toHaveLength(2);
    expect(instance.hangUp).not.toHaveBeenCalled();
  });

  it('runs one rejoin for overlapping failure signals', async() => {
    const {controller} = makeController();
    const {instance, main, created} = makeLegacyInstance();
    let resolveNegotiation!: () => void;
    instance.createConnectionInstance.mockImplementationOnce(function(this: any, {options}: any) {
      const connectionInstance = makeConnectionInstance(2000);
      connectionInstance.connection.set('new', 'new');
      connectionInstance.options = options;
      connectionInstance.requestNegotiation = vi.fn(() => new Promise<void>((resolve) => resolveNegotiation = resolve));
      created.push(connectionInstance);
      this.connections.main = connectionInstance;
      return connectionInstance;
    });
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);

    main.connection.set('failed');
    await flush();
    void (controller as any).recoverGroupCall(instance, 'renegotiation-failed');
    await flush();
    expect(created).toHaveLength(1);
    resolveNegotiation();
    await flush();
    expect(created).toHaveLength(1);
  });

  it('routes a requested rejoin through the same deduplicated, budgeted path', async() => {
    const {controller} = makeController();
    const {instance, main, created} = makeLegacyInstance();
    let resolveNegotiation!: () => void;
    instance.createConnectionInstance.mockImplementationOnce(function(this: any, {options}: any) {
      const connectionInstance = makeConnectionInstance(3000);
      connectionInstance.connection.set('new', 'new');
      connectionInstance.options = options;
      connectionInstance.requestNegotiation = vi.fn(() => new Promise<void>((resolve) => resolveNegotiation = resolve));
      created.push(connectionInstance);
      this.connections.main = connectionInstance;
      return connectionInstance;
    });
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);

    const requested = controller.joinGroupCall(99 as ChatId, INPUT.id as any, true, true);
    await flush();
    main.connection.set('failed');
    await flush();
    expect(created).toHaveLength(1);
    expect((controller as any).groupCallRejoinAttempts.get(instance)).toBe(1);

    resolveNegotiation();
    await expect(requested).resolves.toBeUndefined();
    expect(created).toHaveLength(1);
    await expect(controller.joinGroupCall(99 as ChatId, 'another-call' as any, true, true))
    .rejects.toThrow('No current group call to rejoin');
  });

  it('shows the call as connecting from the moment the old transport is swapped out', async() => {
    const {controller} = makeController();
    const {instance, main} = makeLegacyInstance();
    controller.setCurrentGroupCall(instance);
    let dispatchedAtSwap: unknown[];
    instance.createConnectionInstance.mockImplementationOnce(function(this: any, {options}: any) {
      const connectionInstance = makeConnectionInstance(4000);
      connectionInstance.options = options;
      this.connections.main = connectionInstance;
      dispatchedAtSwap = instance.dispatchEvent.mock.calls.slice();
      return connectionInstance;
    });

    // A rejoin while the old ICE still reads `connected`.
    void controller.joinGroupCall(99 as ChatId, INPUT.id as any, true, true);
    await flush();

    expect(main.connection.iceConnectionState).toBe('connected');
    expect(dispatchedAtSwap).toEqual([]);
    expect(instance.dispatchEvent.mock.calls[0]).toEqual(['state', GROUP_CALL_STATE.CONNECTING]);
  });

  it('stops before the connect tone and the join when the call is hung up while connecting', async() => {
    const {controller, audioAsset} = makeController();
    const {instance, main, created} = makeLegacyInstance();
    let resolveAppend!: () => void;
    instance.createConnectionInstance.mockImplementationOnce(function(this: any, {options}: any) {
      const connectionInstance = makeConnectionInstance(5000);
      connectionInstance.options = options;
      connectionInstance.appendStreamToConference = vi.fn(() => new Promise<void>((resolve) => resolveAppend = resolve));
      created.push(connectionInstance);
      this.connections.main = connectionInstance;
      return connectionInstance;
    });
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);

    main.connection.set('failed');
    await flush();
    expect(created).toHaveLength(1);
    audioAsset.playWithTimeout.mockClear();

    instance.isClosing = true;
    resolveAppend();
    await vi.advanceTimersByTimeAsync(10000);

    expect(audioAsset.playWithTimeout).not.toHaveBeenCalled();
    expect(created[0].requestNegotiation).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
  });

  it('rebuilds a conference asked to rejoin as a conference, never as a legacy call', async() => {
    const {controller} = makeController();
    const {instance} = makeLegacyInstance();
    instance.isConference = true;
    controller.setCurrentGroupCall(instance);
    const recoverConference = vi.spyOn(controller as any, 'recoverConference').mockResolvedValue(undefined);

    await controller.joinGroupCall(99 as ChatId, INPUT.id as any, true, true);

    expect(recoverConference).toHaveBeenCalledWith(instance, 'requested');
    expect(instance.prepareMainConnectionRejoin).not.toHaveBeenCalled();
  });

  it('drops its listeners once the connection it watched is replaced', async() => {
    const {controller} = makeController();
    const {instance, main, created, listeners} = makeLegacyInstance();
    const removed = vi.spyOn(main.connection, 'removeEventListener');
    controller.setCurrentGroupCall(instance);
    (controller as any).startTransportLiveness(instance);
    expect(listeners.get('state')).toHaveLength(1);

    main.connection.set('failed');
    await flush();
    expect(created).toHaveLength(1);

    // The old watcher is gone from the long-lived instance and from its
    // connection; only the replacement's watcher listens.
    expect(removed.mock.calls.map(([event]) => event).sort()).toEqual(['connectionstatechange', 'iceconnectionstatechange']);
    expect(listeners.get('state')).toHaveLength(1);
  });
});
