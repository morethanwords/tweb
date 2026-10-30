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
import GroupCallInstance from '@lib/calls/groupCallInstance';
import {hasCallInTab} from '@lib/calls/callAccount';
import deferredPromise from '@helpers/cancellablePromise';
import rootScope from '@lib/rootScope';

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

// * the managers of the controller made last: the call is joined on that account and recovers through it
let lastManagers: any;

function makeLegacyInstance() {
  const main = makeConnectionInstance(777);
  const created: any[] = [];
  const listeners = new Map<string, Array<(payload: any) => void>>();
  const instance: any = {
    managers: lastManagers,
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
  lastManagers = {appGroupCallsManager};
  Object.assign(controller as any, {audioAsset, log, managers: lastManagers});
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

  it('joins again as the channel picked in "Display me as...", once, keeping the capture', async() => {
    const {controller} = makeController();
    const {instance, main, created} = makeLegacyInstance();
    instance.myId = 1;
    main.options = {type: 'main'};
    controller.setCurrentGroupCall(instance);
    const channel = (-5000).toPeerId();

    await controller.changeGroupCallJoinAs(instance, channel);

    expect(instance.joinAsPeerId).toBe(channel);
    expect(created).toHaveLength(1);
    expect(instance.createConnectionInstance).toHaveBeenCalledWith(expect.objectContaining({
      streamManager: main.streamManager,
      options: expect.objectContaining({type: 'main', joinAs: channel, joinVideo: true, rejoin: true})
    }));

    // already shown as the channel: nothing to do
    await controller.changeGroupCallJoinAs(instance, channel);
    expect(created).toHaveLength(1);

    // back to the account: the join goes out without a join_as of its own
    await controller.changeGroupCallJoinAs(instance, 1 as PeerId);
    expect(instance.joinAsPeerId).toBeUndefined();
    expect(created).toHaveLength(2);
    expect(created[1].options.joinAs).toBeUndefined();
  });

  it('never switches a conference away from the account', async() => {
    const {controller} = makeController();
    const {instance, created} = makeLegacyInstance();
    instance.isConference = true;
    controller.setCurrentGroupCall(instance);

    await expect(controller.changeGroupCallJoinAs(instance, (-5000).toPeerId())).rejects.toThrow();
    expect(created).toHaveLength(0);
    expect(instance.joinAsPeerId).toBeUndefined();
  });
});

describe('"Display me as..." picked while the first join is out', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // * the controller's own steps a first join goes through, typed for the spies
  type FirstJoinInternals = {
    connectMainConnection: (
      instance: GroupCallInstance,
      streamManager: unknown,
      options: {beforeNegotiation?: () => void}
    ) => Promise<unknown>,
    reconnectMainConnection: (instance: GroupCallInstance) => Promise<void>,
    rejoinGroupCall: (instance: GroupCallInstance, reason: string) => Promise<void>,
    recoverGroupCall: (instance: GroupCallInstance, reason: string) => Promise<void>,
    joinGroupCallInternal: (
      chatId: ChatId,
      groupCallId: string,
      streamManager: unknown,
      muted: boolean,
      joinVideo: boolean,
      account: unknown
    ) => Promise<void>
  };

  /**
   * A first join whose phone.joinGroupCall answers when `negotiated` settles, the call current meanwhile;
   * `onNegotiated` runs as the answer comes, where the transport's watcher starts.
   */
  async function startFirstJoin(onNegotiated?: (joining: GroupCallInstance, internals: FirstJoinInternals) => void) {
    const {controller} = makeController();
    Object.assign(lastManagers.appGroupCallsManager, {
      getGroupCallFull: vi.fn(async() => ({_: 'groupCall', id: INPUT.id})),
      // * what a rejoin replays to its new connection
      getCachedParticipants: vi.fn(async() => new Map())
    });
    const internals = controller as unknown as FirstJoinInternals;
    const negotiated = deferredPromise<void>();
    vi.spyOn(internals, 'connectMainConnection').mockImplementation(async(joining, _streamManager, options) => {
      joining.connections.main = {
        options: {type: 'main', joinAs: joining.joinAsPeerId},
        closeConnectionAndStream: vi.fn()
      } as any;
      options.beforeNegotiation();
      await negotiated;
      onNegotiated?.(joining, internals);
    });
    // * the transport a rejoin builds anew
    const reconnect = vi.spyOn(internals, 'reconnectMainConnection').mockResolvedValue(undefined);
    const rejoin = vi.spyOn(internals, 'rejoinGroupCall');
    const account = {accountNumber: 1, managers: lastManagers, myId: (1).toPeerId()};
    const joining = internals.joinGroupCallInternal(99 as ChatId, INPUT.id, {stop: vi.fn()}, true, false, account);
    await flush();
    const instance = controller.groupCall;
    expect(instance).toBeInstanceOf(GroupCallInstance);
    return {controller, negotiated, reconnect, rejoin, joining, instance};
  }

  it('waits for the join to settle and then joins again as the pick', async() => {
    const {controller, negotiated, reconnect, rejoin, joining, instance} = await startFirstJoin();
    const channel = (-5000).toPeerId();

    const switching = controller.changeGroupCallJoinAs(instance, channel);
    await flush();
    // * a rejoin now would replace the connection being negotiated
    expect(rejoin).not.toHaveBeenCalled();

    negotiated.resolve();
    await joining;
    await switching;
    expect(rejoin).toHaveBeenCalledTimes(1);
    expect(rejoin).toHaveBeenCalledWith(instance, 'join-as');
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(instance.joinAsPeerId).toBe(channel);

    instance.cleanup();
  });

  it('rejoins after it a transport that had failed by the time the join was answered', async() => {
    const {negotiated, reconnect, rejoin, joining, instance} = await startFirstJoin((joining, internals) => {
      // * what the transport's watcher does when it starts on a connection whose ICE failed already
      void internals.recoverGroupCall(joining, 'ice-failed');
    });

    negotiated.resolve();
    await joining;

    // * asked during the join, held, and run once it settled - not folded into the join and lost
    expect(rejoin.mock.calls.map(([, reason]) => reason)).toEqual(['ice-failed', 'ice-failed']);
    expect(reconnect).toHaveBeenCalledTimes(1);
    await rejoin.mock.results[1].value;

    instance.cleanup();
  });

  it('asks for nothing once a join that failed has ended the call', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // * the call ending tells the chat (chat_update), which has no worker port here
    vi.spyOn(rootScope, 'dispatchEvent').mockImplementation(() => {});
    const {controller, negotiated, rejoin, joining, instance} = await startFirstJoin();

    const switching = controller.changeGroupCallJoinAs(instance, (-5000).toPeerId());
    negotiated.reject(new Error('GROUPCALL_INVALID'));
    await expect(joining).rejects.toThrow('GROUPCALL_INVALID');
    await switching;

    expect(rejoin).not.toHaveBeenCalled();
    expect(controller.groupCall).toBeNull();
  });
});

describe('a video chat that never joined', () => {
  it('cleans up without a transport: its player leaves the page and the tab holds no call', () => {
    const instance = new GroupCallInstance({id: 'never-joined' as any, chatId: 99 as any, managers: {} as any});
    expect(document.querySelector('.call-player')).not.toBeNull();
    expect(hasCallInTab()).toBe(true);

    instance.cleanup();

    expect(document.querySelector('.call-player')).toBeNull();
    expect(hasCallInTab()).toBe(false);
  });
});
