/*
 * The rating prompt a 1-on-1 call ends with. The server asks for it with `need_rating` on the
 * call's phoneCallDiscarded; like iOS (`PresentationCall`: `callWasActive`), only a call that had
 * connected is offered — once — and it is rated by the input the instance kept, since the
 * discarded constructor carries no access hash. A call we hang up ourselves has left the
 * controller's map by the time the server's discarded update comes back, and must still be found.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => {
  type Listener = (...args: any[]) => unknown;

  const rootListeners = new Map<string, Set<Listener>>();

  class FakeCallInstance {
    public id: any;
    public call: any;
    public connectedAt: number | undefined;
    public discardReason: unknown;
    public isMuted = false;
    public isSharingVideo = false;
    public isSharingScreen = false;
    public isOutgoing: boolean;
    public interlocutorUserId: UserId;
    public wasTryingToJoin = false;
    public sortIndex = 1;
    public connectionState = 1;
    public duration = 42;
    public hangUpCalls: unknown[][] = [];

    private inputPhoneCall: any;
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
      for(const listener of this.listeners.get(name) || []) {
        listener(...args);
      }
    }

    // Like the real instance: the input is taken from the states that have an access hash and
    // outlives the discarded one, which has none.
    public setPhoneCall(call: {id: string, access_hash?: string}): void {
      this.call = call;
      if(call.access_hash) {
        this.inputPhoneCall = {_: 'inputPhoneCall', id: call.id, access_hash: call.access_hash};
      }

      const previousId = this.id;
      this.id = call.id;
      if(previousId !== this.id) {
        this.dispatch('id', this.id, previousId);
      }
    }

    public getInputPhoneCall() {
      return this.inputPhoneCall;
    }

    public overrideConnectionState(state?: number): void {
      if(state !== undefined) {
        this.connectionState = state;
      }
      this.dispatch('state', this.connectionState);
    }

    public setHangUpTimeout(): void {}
    public clearHangUpTimeout(): void {}
    public onUpdatePhoneCallSignalingData(): void {}

    public async hangUp(...args: unknown[]): Promise<void> {
      this.hangUpCalls.push(args);
      this.discardReason = args[0];
      this.connectionState = 6;
      this.dispatch('state', this.connectionState);
    }

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
      const results = Array.from(rootListeners.get(name) || [], (listener) => listener(...args));
      await Promise.all(results);
    })
  };

  return {
    FakeCallInstance,
    audioAsset: {play: vi.fn(), playIfDifferent: vi.fn(), stop: vi.fn()},
    joinConference: vi.fn(),
    resolveConferenceCall: vi.fn(),
    showRateCallPopup: vi.fn(),
    toastNew: vi.fn(),
    log: Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()}),
    rootListeners,
    rootScope
  };
});

vi.mock('@components/call/getAudioAsset', () => ({
  default: () => mocks.audioAsset
}));

vi.mock('@components/popups/rateCall', () => ({
  default: mocks.showRateCallPopup
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

vi.mock('@config/debug', () => ({
  default: false,
  MOUNT_CLASS_TO: undefined
}));

vi.mock('@environment/callSupport', () => ({
  default: true
}));

vi.mock('@environment/conferenceCallSupport', () => ({
  default: true
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {invokeCrypto: vi.fn()}
}));

vi.mock('@lib/calls/callInstance', () => ({
  default: mocks.FakeCallInstance
}));

vi.mock('@lib/calls/callTransitionCoordinator', () => ({
  default: {run: (callback: () => Promise<void>) => callback()}
}));

vi.mock('@lib/calls/groupCallsController', () => ({
  default: {joinConference: mocks.joinConference}
}));

vi.mock('@lib/calls/rtmpCallsController', () => ({
  default: {currentCall: undefined}
}));

vi.mock('@lib/logger', () => ({
  logger: () => mocks.log
}));

vi.mock('@lib/rootScope', () => ({
  default: mocks.rootScope
}));

import CALL_STATE from '@lib/calls/callState';
import {CallsController} from '@lib/calls/callsController';

type FakeCall = InstanceType<typeof mocks.FakeCallInstance>;

const CALL_ID = 'p2p-call';
const ACCESS_HASH = 'p2p-access-hash';
const INPUT_PHONE_CALL = {_: 'inputPhoneCall', id: CALL_ID, access_hash: ACCESS_HASH};

function createCall(options: {connected: boolean}) {
  const controller = new CallsController();
  controller.construct({
    appGroupCallsManager: {resolveConferenceCall: mocks.resolveConferenceCall}
  } as any);

  const instance = (controller as any).createCallInstance({
    isOutgoing: true,
    interlocutorUserId: 123 as UserId
  }) as FakeCall;
  instance.setPhoneCall({id: CALL_ID, access_hash: ACCESS_HASH});

  if(options.connected) {
    instance.connectedAt = 1;
    instance.overrideConnectionState(CALL_STATE.CONNECTED);
  } else {
    instance.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);
  }

  return {controller, instance};
}

function dispatchDiscarded(pFlags: {need_rating?: true, video?: true}, reason: object = {_: 'phoneCallDiscardReasonHangup'}) {
  return mocks.rootScope.dispatchEvent('call_update', {
    _: 'phoneCallDiscarded',
    pFlags,
    id: CALL_ID,
    reason,
    duration: 42
  });
}

/** The prompt waits for the call panel to go first; let that pass. */
async function settle() {
  await vi.advanceTimersByTimeAsync(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.rootListeners.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CallsController call rating', () => {
  it('asks to rate a connected call the other side ended', async() => {
    const {instance} = createCall({connected: true});

    await dispatchDiscarded({need_rating: true});
    expect(instance.hangUpCalls).toEqual([[{_: 'phoneCallDiscardReasonHangup'}, true]]);
    // not before the panel had its moment to close
    expect(mocks.showRateCallPopup).not.toHaveBeenCalled();

    await settle();
    expect(mocks.showRateCallPopup).toHaveBeenCalledTimes(1);
    expect(mocks.showRateCallPopup).toHaveBeenCalledWith({call: INPUT_PHONE_CALL, isVideo: false});
  });

  it('finds a call it hung up itself when the server’s discarded update comes back', async() => {
    const {controller, instance} = createCall({connected: true});

    await instance.hangUp('phoneCallDiscardReasonHangup');
    // closed and gone from the map before phone.discardCall answers
    expect(controller.getCallByUserId(123 as UserId)).toBeUndefined();

    await dispatchDiscarded({need_rating: true, video: true});
    await settle();

    expect(mocks.showRateCallPopup).toHaveBeenCalledTimes(1);
    expect(mocks.showRateCallPopup).toHaveBeenCalledWith({call: INPUT_PHONE_CALL, isVideo: true});
  });

  it('does not ask about a call that never connected', async() => {
    createCall({connected: false});
    await dispatchDiscarded({need_rating: true});

    const {instance} = createCall({connected: false});
    await instance.hangUp('phoneCallDiscardReasonHangup');
    await dispatchDiscarded({need_rating: true});

    await settle();
    expect(mocks.showRateCallPopup).not.toHaveBeenCalled();
  });

  it('does not ask unless the server does', async() => {
    createCall({connected: true});
    await dispatchDiscarded({});
    await settle();

    expect(mocks.showRateCallPopup).not.toHaveBeenCalled();
  });

  it('asks once however often the flag repeats', async() => {
    const {instance} = createCall({connected: true});
    await instance.hangUp('phoneCallDiscardReasonHangup');

    await dispatchDiscarded({need_rating: true});
    await dispatchDiscarded({need_rating: true});
    // the engine reporting its transport closed walks the instance to CLOSED once more
    instance.overrideConnectionState(CALL_STATE.CLOSED);
    await dispatchDiscarded({need_rating: true});
    await settle();

    expect(mocks.showRateCallPopup).toHaveBeenCalledTimes(1);
  });

  it('does not treat a handoff to a conference as a call to rate', async() => {
    createCall({connected: true});
    mocks.resolveConferenceCall.mockResolvedValue({_: 'groupCall', id: 'conference', access_hash: 'hash'});

    await dispatchDiscarded({need_rating: true}, {
      _: 'phoneCallDiscardReasonMigrateConferenceCall',
      slug: 'conference-slug'
    });
    await settle();

    expect(mocks.joinConference).toHaveBeenCalledTimes(1);
    expect(mocks.showRateCallPopup).not.toHaveBeenCalled();
  });

  it('stops waiting for the discarded update after a while', async() => {
    const {instance} = createCall({connected: true});
    await instance.hangUp('phoneCallDiscardReasonHangup');

    await vi.advanceTimersByTimeAsync(61e3);
    await dispatchDiscarded({need_rating: true});
    await settle();

    expect(mocks.showRateCallPopup).not.toHaveBeenCalled();
  });
});
