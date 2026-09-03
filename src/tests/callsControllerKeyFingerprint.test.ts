/*
 * Incoming 1-on-1 call: the server's `key_fingerprint` is an int64 that
 * fetchLong hands over as a JS number whenever it fits 53 bits, while the
 * locally computed fingerprint is always a decimal string. A strict compare
 * dropped one correct incoming call in a thousand as "Incorrect key
 * fingerprint".
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => {
  type Listener = (...args: any[]) => unknown;
  const rootListeners = new Map<string, Set<Listener>>();

  class FakeCallInstance {
    public id: any;
    public dh: any;
    public encryptionKey: Uint8Array | undefined;
    public isVerifyingPeerG_a = false;
    public protocol = {_: 'phoneCallProtocol'};
    public connectionState = 3;
    public sortIndex = 1;
    public isOutgoing: boolean;
    public interlocutorUserId: UserId;
    public joinCall = vi.fn();
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

    public setPhoneCall(call: {id: string}): void {
      const previousId = this.id;
      this.id = call.id;
      if(previousId !== this.id) {
        for(const listener of this.listeners.get('id') || []) listener(this.id, previousId);
      }
    }

    public overrideConnectionState(): void {}
    public onUpdatePhoneCallSignalingData(): void {}

    public get isClosing(): boolean {
      return false;
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
  const invokeCrypto = vi.fn();
  const log = Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()});
  return {FakeCallInstance, invokeCrypto, log, rootScope};
});

vi.mock('@components/call/getAudioAsset', () => ({
  default: () => ({play: vi.fn(), playIfDifferent: vi.fn(), stop: vi.fn()})
}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@config/debug', () => ({default: false, MOUNT_CLASS_TO: undefined}));
vi.mock('@environment/callSupport', () => ({default: true}));
vi.mock('@environment/conferenceCallSupport', () => ({default: true}));
vi.mock('@lib/apiManagerProxy', () => ({default: {invokeCrypto: mocks.invokeCrypto}}));
vi.mock('@lib/calls/callInstance', () => ({default: mocks.FakeCallInstance}));
vi.mock('@lib/calls/callTransitionCoordinator', () => ({
  default: {run: vi.fn((callback: () => Promise<void>) => callback())}
}));
vi.mock('@lib/calls/groupCallsController', () => ({default: {joinConference: vi.fn()}}));
vi.mock('@lib/calls/rtmpCallsController', () => ({default: {currentCall: undefined}}));
vi.mock('@lib/logger', () => ({logger: () => mocks.log}));
vi.mock('@lib/rootScope', () => ({default: mocks.rootScope}));

import {CallsController} from '@lib/calls/callsController';

const G_A_HASH = new Uint8Array(32).fill(7);
const G_A = new Uint8Array(256).fill(9);
const KEY = new Uint8Array(256).fill(4);
// Fits 53 bits: fetchLong delivers such a value as a number, not a string.
const FINGERPRINT = 4503599627370495;

function makeIncomingCall(id: string, computedFingerprint: string) {
  const controller = new CallsController();
  const computeKey = vi.fn(async() => ({key: KEY, key_fingerprint: computedFingerprint}));
  controller.construct({appCallsManager: {computeKey}} as any);
  const instance = (controller as any).createCallInstance({
    isOutgoing: false,
    interlocutorUserId: 123 as UserId
  }) as InstanceType<typeof mocks.FakeCallInstance>;
  instance.setPhoneCall({id});
  instance.dh = {g_a_hash: G_A_HASH, b: new Uint8Array([2]), p: new Uint8Array([11])};
  return {computeKey, instance};
}

function dispatchPhoneCall(id: string) {
  return mocks.rootScope.dispatchEvent('call_update', {
    _: 'phoneCall',
    id,
    g_a_or_b: G_A,
    key_fingerprint: FINGERPRINT
  });
}

describe('CallsController incoming key fingerprint check', () => {
  beforeEach(() => {
    mocks.invokeCrypto.mockReset();
    mocks.invokeCrypto.mockResolvedValue(G_A_HASH);
  });

  it('accepts a numeric server fingerprint that matches the computed one', async() => {
    const {computeKey, instance} = makeIncomingCall('incoming-match', String(FINGERPRINT));

    await dispatchPhoneCall('incoming-match');

    expect(computeKey).toHaveBeenCalledWith(G_A, instance.dh.b, instance.dh.p);
    expect(instance.hangUp).not.toHaveBeenCalled();
    expect(instance.joinCall).toHaveBeenCalledTimes(1);
    expect(instance.encryptionKey).toBe(KEY);
    expect(instance.dh.g_a).toBe(G_A);
  });

  it('still hangs up when the fingerprints differ', async() => {
    const {instance} = makeIncomingCall('incoming-mismatch', String(FINGERPRINT + 1));

    await dispatchPhoneCall('incoming-mismatch');

    expect(instance.joinCall).not.toHaveBeenCalled();
    expect(instance.hangUp).toHaveBeenCalledWith('phoneCallDiscardReasonDisconnect');
    expect(instance.encryptionKey).toBeUndefined();
    expect(instance.dh.g_a).toBeUndefined();
  });

  it('never hands the private exponent to the error log', async() => {
    // Error-level logs are kept in production. The fingerprint mismatch and
    // the computeKey failure used to log `dh` (with the callee's `b`) and the
    // raw public value; only what the peer sent in the clear may appear.
    mocks.log.error.mockClear();
    const {computeKey, instance} = makeIncomingCall('incoming-secrets', String(FINGERPRINT + 1));
    await dispatchPhoneCall('incoming-secrets');

    computeKey.mockRejectedValueOnce(new Error('bad g_a'));
    const {instance: failing} = makeIncomingCall('incoming-secrets-2', String(FINGERPRINT));
    failing.dh = instance.dh;
    (failing as any).managers = undefined;
    await dispatchPhoneCall('incoming-secrets-2');

    expect(mocks.log.error).toHaveBeenCalled();
    for(const args of mocks.log.error.mock.calls) {
      for(const arg of args) {
        expect(arg).not.toBe(instance.dh);
        expect(arg).not.toBe(instance.dh.b);
        expect(arg).not.toBe(G_A);
        if(arg && typeof arg === 'object') {
          expect(Object.values(arg)).not.toContain(instance.dh.b);
        }
      }
    }
  });
});
