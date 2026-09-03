/*
 * The 1-on-1 update handler takes each phone-call state only from the party
 * and at the point of the exchange it belongs to — tdesktop
 * `checkCallCommonFields` / "Unexpected phoneCallAccepted for an incoming
 * call", tdlib's per-state `do_update_call`. Before these gates a misrouted or
 * forged update crashed on `dh.a` / `dh.g_a_hash` and the crash handler hung
 * the call up as if the user had. An incoming request is also checked for
 * being addressed to this account, recent and speakable before it rings, and
 * a `#?call=` link only re-rings a request that is still pending.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => {
  type Listener = (...args: any[]) => unknown;
  const rootListeners = new Map<string, Set<Listener>>();
  const createdInstances: FakeCallInstance[] = [];

  class FakeCallInstance {
    public id: any;
    public call: any;
    public dh: any;
    public encryptionKey: Uint8Array | undefined;
    public isVerifyingPeerG_a = false;
    public protocol = {_: 'phoneCallProtocol'};
    public connectionState = 3;
    public sortIndex = 1;
    public isOutgoing: boolean;
    public interlocutorUserId: UserId;
    public hangUpTimeoutReason: unknown;
    public phoneCalls: unknown[] = [];
    public confirmCall = vi.fn(async() => {});
    public joinCall = vi.fn();
    public hangUp = vi.fn(async() => {});
    public setHangUpTimeout = vi.fn((timeout: number, reason: unknown) => {
      this.hangUpTimeoutReason = reason;
    });
    public clearHangUpTimeout = vi.fn();
    private listeners = new Map<string, Set<Listener>>();

    constructor(options: {isOutgoing: boolean, interlocutorUserId: UserId}) {
      this.isOutgoing = options.isOutgoing;
      this.interlocutorUserId = options.interlocutorUserId;
      createdInstances.push(this);
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
      this.phoneCalls.push(call);
      this.call = call;
      const previousId = this.id;
      this.id = call.id;
      if(previousId !== this.id) {
        this.dispatch('id', this.id, previousId);
      }
    }

    public overrideConnectionState(state?: number): void {
      if(state !== undefined) {
        this.connectionState = state;
      }
      this.dispatch('state', this.connectionState);
    }

    public onUpdatePhoneCallSignalingData(): void {}

    public get isClosing(): boolean {
      return this.connectionState === 5 || this.connectionState === 6;
    }
  }

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
    dispatchEvent: vi.fn(async(name: string, ...args: unknown[]) => {
      await Promise.all(Array.from(rootListeners.get(name) || [], (listener) => listener(...args)));
    })
  };
  const log = Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()});
  return {FakeCallInstance, createdInstances, log, rootListeners, rootScope};
});

vi.mock('@components/call/getAudioAsset', () => ({
  CALL_AUDIO_ASSETS: {incoming: 'call_incoming.mp3'},
  default: () => ({play: vi.fn(), playIfDifferent: vi.fn(), stop: vi.fn()})
}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@config/debug', () => ({default: false, MOUNT_CLASS_TO: undefined}));
vi.mock('@environment/callSupport', () => ({default: true}));
vi.mock('@environment/conferenceCallSupport', () => ({default: true}));
vi.mock('@lib/apiManagerProxy', () => ({default: {invokeCrypto: vi.fn()}}));
vi.mock('@lib/calls/callInstance', () => ({default: mocks.FakeCallInstance}));
vi.mock('@lib/calls/callTransitionCoordinator', () => ({
  default: {run: vi.fn((callback: () => Promise<void>) => callback())}
}));
vi.mock('@lib/calls/groupCallsController', () => ({default: {joinConference: vi.fn()}}));
vi.mock('@lib/calls/rtmpCallsController', () => ({default: {currentCall: undefined}}));
vi.mock('@lib/logger', () => ({logger: () => mocks.log}));
vi.mock('@lib/rootScope', () => ({default: mocks.rootScope}));

import CALL_STATE from '@lib/calls/callState';
import {CallsController} from '@lib/calls/callsController';

const MY_ID = 77;
const CALLER_ID = 5;
const CALL_ID = 'call-1';

function requested(over: Record<string, unknown> = {}) {
  return {
    _: 'phoneCallRequested',
    id: CALL_ID,
    access_hash: '1',
    admin_id: CALLER_ID,
    participant_id: MY_ID,
    date: Math.floor(Date.now() / 1000),
    g_a_hash: new Uint8Array(32),
    protocol: {_: 'phoneCallProtocol', library_versions: ['13.0.0']},
    pFlags: {},
    ...over
  };
}

function accepted(over: Record<string, unknown> = {}) {
  return {
    _: 'phoneCallAccepted',
    id: CALL_ID,
    g_b: new Uint8Array(256).fill(3),
    protocol: {_: 'phoneCallProtocol', library_versions: ['13.0.0']},
    pFlags: {},
    ...over
  };
}

function makeController() {
  const controller = new CallsController();
  const managers = {
    appCallsManager: {
      computeKey: vi.fn(),
      discardCall: vi.fn(async() => {}),
      getCall: vi.fn(),
      receivedCall: vi.fn(async() => true)
    }
  };
  controller.construct(managers as any);
  const incompatible = vi.fn();
  controller.addEventListener('incompatible', incompatible);
  return {controller, incompatible, managers};
}

function makeInstance(controller: CallsController, isOutgoing: boolean, id = CALL_ID) {
  const instance = (controller as any).createCallInstance({
    isOutgoing,
    interlocutorUserId: CALLER_ID as UserId
  }) as InstanceType<typeof mocks.FakeCallInstance>;
  instance.setPhoneCall({id});
  return instance;
}

function dispatch(call: unknown) {
  return mocks.rootScope.dispatchEvent('call_update', call);
}

describe('CallsController update gating', () => {
  beforeEach(() => {
    mocks.rootListeners.clear();
    mocks.createdInstances.length = 0;
    mocks.log.warn.mockClear();
    mocks.log.error.mockClear();
  });

  it('ignores phoneCallAccepted for an incoming call', async() => {
    const {controller} = makeController();
    const instance = makeInstance(controller, false);
    instance.dh = {g_a_hash: new Uint8Array(32), b: new Uint8Array([2]), p: new Uint8Array([11])};
    const before = instance.call;

    await dispatch(accepted());

    expect(instance.confirmCall).not.toHaveBeenCalled();
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(instance.call).toBe(before);
    expect(mocks.log.warn).toHaveBeenCalled();
    expect(mocks.log.error).not.toHaveBeenCalled();
  });

  it('ignores phoneCallAccepted before the caller holds its exponent', async() => {
    const {controller} = makeController();
    const instance = makeInstance(controller, true);

    await dispatch(accepted());

    expect(instance.confirmCall).not.toHaveBeenCalled();
    expect(instance.hangUp).not.toHaveBeenCalled();
  });

  it('confirms an accepted outgoing call', async() => {
    const {controller, incompatible} = makeController();
    const instance = makeInstance(controller, true);
    instance.dh = {a: new Uint8Array([2]), g_a: new Uint8Array([3]), g_a_hash: new Uint8Array(32), p: new Uint8Array([11])};

    const call = accepted();
    await dispatch(call);

    expect(instance.call).toBe(call);
    expect(instance.confirmCall).toHaveBeenCalledTimes(1);
    expect(incompatible).not.toHaveBeenCalled();
  });

  it('ends the call when the callee speaks no protocol version this client does', async() => {
    const {controller, incompatible} = makeController();
    const instance = makeInstance(controller, true);
    instance.dh = {a: new Uint8Array([2]), g_a: new Uint8Array([3]), g_a_hash: new Uint8Array(32), p: new Uint8Array([11])};

    await dispatch(accepted({protocol: {_: 'phoneCallProtocol', library_versions: ['2.4.4', '12.0.0']}}));

    expect(instance.confirmCall).not.toHaveBeenCalled();
    expect(instance.hangUp).toHaveBeenCalledWith('phoneCallDiscardReasonDisconnect');
    expect(incompatible).toHaveBeenCalledWith(CALLER_ID);
  });

  it('ignores phoneCall for an incoming call that has not been accepted', async() => {
    const {controller, managers} = makeController();
    const instance = makeInstance(controller, false);

    await dispatch({_: 'phoneCall', id: CALL_ID, g_a_or_b: new Uint8Array(256), key_fingerprint: 1});

    expect(managers.appCallsManager.computeKey).not.toHaveBeenCalled();
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(instance.joinCall).not.toHaveBeenCalled();
    expect(mocks.log.warn).toHaveBeenCalled();
    expect(mocks.log.error).not.toHaveBeenCalled();
  });

  it('only records phoneCall for the caller, who already holds the key', async() => {
    const {controller, managers} = makeController();
    const instance = makeInstance(controller, true);
    instance.dh = {a: new Uint8Array([2]), g_a: new Uint8Array([3]), g_a_hash: new Uint8Array(32), p: new Uint8Array([11])};
    instance.encryptionKey = new Uint8Array(256);

    const call = {_: 'phoneCall', id: CALL_ID, g_a_or_b: new Uint8Array(256), key_fingerprint: 1};
    await dispatch(call);

    expect(instance.call).toBe(call);
    expect(managers.appCallsManager.computeKey).not.toHaveBeenCalled();
    expect(instance.hangUp).not.toHaveBeenCalled();
  });
});

describe('CallsController incoming request', () => {
  beforeEach(() => {
    mocks.rootListeners.clear();
    mocks.createdInstances.length = 0;
    mocks.log.warn.mockClear();
  });

  it('rings, acknowledges the request and times out as missed', async() => {
    const {controller, managers} = makeController();

    await dispatch(requested());

    expect(mocks.createdInstances).toHaveLength(1);
    const instance = mocks.createdInstances[0];
    expect(instance.isOutgoing).toBe(false);
    expect(instance.interlocutorUserId).toBe(CALLER_ID);
    expect(instance.connectionState).toBe(CALL_STATE.PENDING);
    expect(managers.appCallsManager.receivedCall).toHaveBeenCalledWith(CALL_ID);
    expect(typeof instance.hangUpTimeoutReason).toBe('function');
    expect((instance.hangUpTimeoutReason as () => string)()).toBe('phoneCallDiscardReasonMissed');
  });

  it('times out as busy while another call is still up', async() => {
    const {controller} = makeController();
    const connected = makeInstance(controller, true, 'other');
    connected.sortIndex = 10;
    connected.overrideConnectionState(CALL_STATE.CONNECTED);

    await dispatch(requested());

    const instance = mocks.createdInstances[1];
    expect(controller.currentCall).toBe(connected);
    expect((instance.hangUpTimeoutReason as () => string)()).toBe('phoneCallDiscardReasonBusy');

    connected.overrideConnectionState(CALL_STATE.CLOSED);
    expect((instance.hangUpTimeoutReason as () => string)()).toBe('phoneCallDiscardReasonMissed');
  });

  it('ignores a request addressed to another account or coming from this one', async() => {
    const {controller, managers} = makeController();

    await dispatch(requested({participant_id: 78}));
    await dispatch(requested({admin_id: MY_ID}));

    expect(mocks.createdInstances).toHaveLength(0);
    expect(managers.appCallsManager.receivedCall).not.toHaveBeenCalled();
    expect(managers.appCallsManager.discardCall).not.toHaveBeenCalled();
    expect(mocks.log.warn).toHaveBeenCalledTimes(2);
    expect(controller.currentCall).toBeUndefined();
  });

  it('ignores a request that is too old to still be ringing', async() => {
    const {managers} = makeController();

    await dispatch(requested({date: Math.floor(Date.now() / 1000) - 60}));

    expect(mocks.createdInstances).toHaveLength(0);
    expect(managers.appCallsManager.receivedCall).not.toHaveBeenCalled();
    expect(managers.appCallsManager.discardCall).not.toHaveBeenCalled();
  });

  it('ends a request from a caller that speaks no protocol version this client does', async() => {
    const {incompatible, managers} = makeController();

    await dispatch(requested({
      pFlags: {video: true},
      protocol: {_: 'phoneCallProtocol', library_versions: ['2.4.4', '12.0.0']}
    }));

    expect(mocks.createdInstances).toHaveLength(0);
    expect(managers.appCallsManager.receivedCall).not.toHaveBeenCalled();
    expect(managers.appCallsManager.discardCall).toHaveBeenCalledWith(
      CALL_ID,
      0,
      {_: 'phoneCallDiscardReasonDisconnect'},
      true
    );
    expect(incompatible).toHaveBeenCalledWith(CALLER_ID);
  });

  it('does not ring twice for a redelivered request', async() => {
    const {managers} = makeController();

    await dispatch(requested());
    await dispatch(requested());

    expect(mocks.createdInstances).toHaveLength(1);
    expect(managers.appCallsManager.receivedCall).toHaveBeenCalledTimes(1);
  });
});

describe('CallsController.ringRequestedCall', () => {
  beforeEach(() => {
    mocks.rootListeners.clear();
    mocks.createdInstances.length = 0;
    mocks.rootScope.dispatchEvent.mockClear();
  });

  it('rings a request the manager still holds', async() => {
    const {controller, managers} = makeController();
    const call = requested();
    managers.appCallsManager.getCall.mockResolvedValue(call);

    await controller.ringRequestedCall(CALL_ID);

    expect(mocks.rootScope.dispatchEvent).toHaveBeenCalledWith('call_update', call);
    expect(mocks.createdInstances).toHaveLength(1);
  });

  it('does nothing for a call that is gone, no longer pending, or already ringing here', async() => {
    const {controller, managers} = makeController();

    managers.appCallsManager.getCall.mockResolvedValue(undefined);
    await controller.ringRequestedCall(CALL_ID);

    managers.appCallsManager.getCall.mockResolvedValue({_: 'phoneCall', id: CALL_ID});
    await controller.ringRequestedCall(CALL_ID);

    makeInstance(controller, false);
    managers.appCallsManager.getCall.mockResolvedValue(requested());
    await controller.ringRequestedCall(CALL_ID);

    expect(mocks.rootScope.dispatchEvent).not.toHaveBeenCalled();
    expect(mocks.createdInstances).toHaveLength(1);
  });
});
