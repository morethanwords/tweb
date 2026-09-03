/*
 * Call waiting and the tab going away.
 *
 * A second incoming 1-on-1 while another call is current used to be silent —
 * the ringtone follows `currentCall`, and a connected call sorts first — and
 * it rang out as "missed" although the callee was plainly busy. It now rings
 * quietly through a player of its own (the shared one may be busy with the
 * current call's tone) and falls silent the moment it stops pending. And a tab
 * closed with a call up now posts a best-effort discard, so the peer sees the
 * call end instead of a stall until the server times it out.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => {
  type Listener = (...args: any[]) => unknown;
  const rootListeners = new Map<string, Set<Listener>>();

  class FakeCallInstance {
    public id: any;
    public connectionState = 3;
    public sortIndex = 1;
    public isOutgoing: boolean;
    public interlocutorUserId: UserId;
    public connectedAt: number | undefined;
    public wasTryingToJoin = false;
    public discardReason: unknown;
    public duration = 0;
    public isSharingVideo = false;
    public isSharingScreen = false;
    public hangUp = vi.fn(async() => {});
    public setHangUpTimeout = vi.fn();
    public clearHangUpTimeout = vi.fn();
    private listeners = new Map<string, Set<Listener>>();

    constructor(options: {isOutgoing: boolean, interlocutorUserId: UserId}) {
      this.isOutgoing = options.isOutgoing;
      this.interlocutorUserId = options.interlocutorUserId;
    }

    public addEventListener(name: string, listener: Listener): void {
      let listeners = this.listeners.get(name);
      if(!listeners) {
        listeners = new Set();
        this.listeners.set(name, listeners);
      }
      listeners.add(listener);
    }

    private dispatch(name: string, ...args: unknown[]): void {
      for(const listener of this.listeners.get(name) || []) listener(...args);
    }

    public setPhoneCall(call: {id: string}): void {
      const previousId = this.id;
      this.id = call.id;
      if(previousId !== this.id) {
        this.dispatch('id', this.id, previousId);
      }
    }

    public overrideConnectionState(state: number): void {
      this.connectionState = state;
      this.dispatch('state', state);
    }

    public get isClosing(): boolean {
      return this.connectionState === 5 || this.connectionState === 6;
    }
  }

  const sharedAsset = {play: vi.fn(), playIfDifferent: vi.fn(), stop: vi.fn()};
  const waitingPlayers: Array<{assets: unknown, play: ReturnType<typeof vi.fn>, stop: ReturnType<typeof vi.fn>}> = [];
  class FakeAudioAssetPlayer {
    public play = vi.fn();
    public stop = vi.fn();
    constructor(public assets: unknown) {
      waitingPlayers.push(this);
    }
  }

  const groupCallsController = {groupCall: undefined as unknown, joinConference: vi.fn()};
  const rtmpCallsController = {currentCall: undefined as unknown};
  const rootScope = {
    myId: 77,
    addEventListener: vi.fn((name: string, listener: Listener) => {
      let listeners = rootListeners.get(name);
      if(!listeners) {
        listeners = new Set();
        rootListeners.set(name, listeners);
      }
      listeners.add(listener);
    }),
    dispatchEvent: vi.fn()
  };
  const log = Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()});
  return {
    FakeAudioAssetPlayer,
    FakeCallInstance,
    groupCallsController,
    log,
    rootScope,
    rtmpCallsController,
    sharedAsset,
    waitingPlayers
  };
});

vi.mock('@components/call/getAudioAsset', () => ({
  default: () => mocks.sharedAsset,
  CALL_AUDIO_ASSETS: {incoming: 'call_incoming.mp3'}
}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@config/debug', () => ({default: false, MOUNT_CLASS_TO: undefined}));
vi.mock('@environment/callSupport', () => ({default: true}));
vi.mock('@environment/conferenceCallSupport', () => ({default: true}));
vi.mock('@helpers/audioAssetPlayer', () => ({default: mocks.FakeAudioAssetPlayer}));
vi.mock('@lib/apiManagerProxy', () => ({default: {invokeCrypto: vi.fn()}}));
vi.mock('@lib/calls/callInstance', () => ({default: mocks.FakeCallInstance}));
vi.mock('@lib/calls/callTransitionCoordinator', () => ({
  default: {run: vi.fn((callback: () => Promise<void>) => callback())}
}));
vi.mock('@lib/calls/groupCallsController', () => ({default: mocks.groupCallsController}));
vi.mock('@lib/calls/rtmpCallsController', () => ({default: mocks.rtmpCallsController}));
vi.mock('@lib/logger', () => ({logger: () => mocks.log}));
vi.mock('@lib/rootScope', () => ({default: mocks.rootScope}));

import CALL_STATE from '@lib/calls/callState';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import {CallsController} from '@lib/calls/callsController';
import {CALL_WAITING_RING_VOLUME} from '@lib/calls/constants';

function makeController() {
  const controller = new CallsController();
  const discardCall = vi.fn(async() => {});
  controller.construct({appCallsManager: {discardCall}} as any);
  return {controller, discardCall};
}

function makeInstance(controller: CallsController, options: {isOutgoing: boolean, id: string, sortIndex?: number}) {
  const instance = (controller as any).createCallInstance({
    isOutgoing: options.isOutgoing,
    interlocutorUserId: 123 as UserId
  }) as InstanceType<typeof mocks.FakeCallInstance>;
  instance.sortIndex = options.sortIndex ?? 1;
  instance.setPhoneCall({id: options.id});
  return instance;
}

function makeConnectedCall(controller: CallsController) {
  const connected = makeInstance(controller, {isOutgoing: true, id: 'connected', sortIndex: 10});
  connected.connectedAt = 1;
  connected.duration = 42;
  connected.overrideConnectionState(CALL_STATE.CONNECTED);
  mocks.sharedAsset.play.mockClear();
  mocks.sharedAsset.stop.mockClear();
  return connected;
}

describe('CallsController call waiting', () => {
  beforeEach(() => {
    mocks.waitingPlayers.length = 0;
    mocks.sharedAsset.play.mockClear();
    mocks.sharedAsset.playIfDifferent.mockClear();
    mocks.sharedAsset.stop.mockClear();
    mocks.groupCallsController.groupCall = undefined;
    mocks.rtmpCallsController.currentCall = undefined;
  });

  it('rings a second incoming call quietly through its own player and stops when it closes', () => {
    const {controller} = makeController();
    const connected = makeConnectedCall(controller);

    const waiting = makeInstance(controller, {isOutgoing: false, id: 'waiting'});
    waiting.overrideConnectionState(CALL_STATE.PENDING);

    expect(controller.currentCall).toBe(connected);
    expect(mocks.waitingPlayers).toHaveLength(1);
    const [player] = mocks.waitingPlayers;
    expect(player.play).toHaveBeenCalledWith({name: 'incoming', loop: true, volume: CALL_WAITING_RING_VOLUME});
    // The shared player is the current call's; call waiting must not touch it.
    expect(mocks.sharedAsset.play).not.toHaveBeenCalled();
    expect(mocks.sharedAsset.stop).not.toHaveBeenCalled();

    waiting.overrideConnectionState(CALL_STATE.CLOSED);
    expect(player.stop).toHaveBeenCalledTimes(1);
    expect(mocks.sharedAsset.play).not.toHaveBeenCalled();
  });

  it('stops the waiting ring once the waiting call is answered', () => {
    const {controller} = makeController();
    const connected = makeConnectedCall(controller);
    const waiting = makeInstance(controller, {isOutgoing: false, id: 'waiting'});
    waiting.overrideConnectionState(CALL_STATE.PENDING);
    const [player] = mocks.waitingPlayers;

    // Accepting the waiting call ends the current one first, then the
    // exchange starts and the waiting call becomes current.
    connected.overrideConnectionState(CALL_STATE.CLOSED);
    expect(player.stop).not.toHaveBeenCalled();

    waiting.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);
    expect(player.stop).toHaveBeenCalledTimes(1);
    expect(mocks.sharedAsset.playIfDifferent).toHaveBeenCalledWith({name: 'connect'});
  });

  it('rings an incoming call quietly while a group call or a live stream is up', () => {
    const {controller} = makeController();
    mocks.groupCallsController.groupCall = {state: GROUP_CALL_STATE.MUTED};

    const incoming = makeInstance(controller, {isOutgoing: false, id: 'incoming'});
    incoming.overrideConnectionState(CALL_STATE.PENDING);

    expect(mocks.sharedAsset.play).toHaveBeenCalledWith({name: 'incoming', loop: true, volume: CALL_WAITING_RING_VOLUME});
    expect(mocks.waitingPlayers).toHaveLength(0);
  });

  it('rings an incoming call at full volume when nothing else is up', () => {
    const {controller} = makeController();

    const incoming = makeInstance(controller, {isOutgoing: false, id: 'incoming'});
    incoming.overrideConnectionState(CALL_STATE.PENDING);

    expect(mocks.sharedAsset.play).toHaveBeenCalledWith({name: 'incoming', loop: true, volume: 1});
    expect(mocks.waitingPlayers).toHaveLength(0);
  });
});

describe('CallsController on pagehide', () => {
  it('posts a best-effort discard for every call this tab owns', () => {
    const {controller, discardCall} = makeController();
    const connected = makeConnectedCall(controller);
    connected.isSharingVideo = true;
    const outgoing = makeInstance(controller, {isOutgoing: true, id: 'outgoing'});
    outgoing.overrideConnectionState(CALL_STATE.PENDING);
    const incoming = makeInstance(controller, {isOutgoing: false, id: 'incoming'});
    incoming.overrideConnectionState(CALL_STATE.PENDING);
    const closed = makeInstance(controller, {isOutgoing: true, id: 'closed'});
    closed.overrideConnectionState(CALL_STATE.CLOSED);

    window.dispatchEvent(new Event('pagehide'));

    expect(discardCall).toHaveBeenCalledTimes(2);
    expect(discardCall).toHaveBeenCalledWith('connected', 42, {_: 'phoneCallDiscardReasonHangup'}, true);
    // An outgoing call nobody answered is missed (tdesktop `Call::hangup`).
    expect(discardCall).toHaveBeenCalledWith('outgoing', 0, {_: 'phoneCallDiscardReasonMissed'}, false);
    // A ringing incoming call is left to the other devices, like tdesktop's
    // `isQuitPrevent`; nothing is torn down locally either.
    expect(discardCall).not.toHaveBeenCalledWith('incoming', expect.anything(), expect.anything(), expect.anything());
    expect(connected.hangUp).not.toHaveBeenCalled();
    expect(incoming.hangUp).not.toHaveBeenCalled();
  });
});
