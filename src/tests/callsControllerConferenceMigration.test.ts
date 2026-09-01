import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => {
  type Listener = (...args: any[]) => unknown;

  const rootListeners = new Map<string, Set<Listener>>();
  const createdInstances: FakeCallInstance[] = [];

  class FakeCallInstance {
    public id: any;
    public dh: any;
    public protocol = {_: 'phoneCallProtocol'};
    public connectedAt: number | undefined;
    public discardReason: unknown;
    public isMuted = true;
    public isSharingVideo = false;
    public isOutgoing: boolean;
    public interlocutorUserId: UserId;
    public wasTryingToJoin = false;
    public sortIndex = 1;
    public connectionState = 1;
    public durationReads = 0;
    public hangUpCalls: unknown[][] = [];
    public stopPhoneCallCalls = 0;
    public confirmCall = vi.fn();
    public getEmojisFingerprint = vi.fn(() => ['unused']);

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
      for(const listener of this.listeners.get(name) || []) {
        listener(...args);
      }
    }

    public setPhoneCall(call: {id: string}): void {
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

    public setHangUpTimeout(): void {}
    public clearHangUpTimeout(): void {}
    public onUpdatePhoneCallSignalingData(): void {}

    public async hangUp(...args: unknown[]): Promise<void> {
      this.hangUpCalls.push(args);
      this.discardReason = args[0];
      this.connectionState = 6;
      this.dispatch('state', this.connectionState);
      ++this.stopPhoneCallCalls;
    }

    public get duration(): number {
      ++this.durationReads;
      return 42;
    }

    public get isClosing(): boolean {
      return this.connectionState === 5 || this.connectionState === 6;
    }
  }

  const audioAsset = {
    play: vi.fn(),
    playIfDifferent: vi.fn(),
    stop: vi.fn()
  };
  const joinConference = vi.fn();
  const runTransition = vi.fn((callback: () => Promise<void>) => callback());
  const resolveConferenceCall = vi.fn();
  const toastNew = vi.fn();
  const conferenceSupport = {value: true};
  const discardCall = vi.fn();
  const generateDh = vi.fn();
  const getProfile = vi.fn();
  const requestCall = vi.fn();
  const log = Object.assign(vi.fn(), {
    error: vi.fn(),
    warn: vi.fn()
  });

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
    audioAsset,
    conferenceSupport,
    createdInstances,
    discardCall,
    generateDh,
    getProfile,
    joinConference,
    log,
    resolveConferenceCall,
    requestCall,
    runTransition,
    rootListeners,
    rootScope,
    toastNew
  };
});

vi.mock('@components/call/getAudioAsset', () => ({
  default: () => mocks.audioAsset
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

vi.mock('@config/debug', () => ({
  MOUNT_CLASS_TO: undefined
}));

vi.mock('@environment/callSupport', () => ({
  default: true
}));

vi.mock('@environment/conferenceCallSupport', () => ({
  get default() {
    return mocks.conferenceSupport.value;
  }
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {invokeCrypto: vi.fn()}
}));

vi.mock('@lib/calls/callInstance', () => ({
  default: mocks.FakeCallInstance
}));

vi.mock('@lib/calls/callTransitionCoordinator', () => ({
  default: {run: mocks.runTransition}
}));

vi.mock('@lib/calls/groupCallsController', () => ({
  default: {joinConference: mocks.joinConference}
}));

vi.mock('@lib/logger', () => ({
  logger: () => mocks.log
}));

vi.mock('@lib/rootScope', () => ({
  default: mocks.rootScope
}));

import CALL_STATE from '@lib/calls/callState';
import {CallsController} from '@lib/calls/callsController';
import deferred from './helpers/deferred';


function createMigrationHarness(options: {
  connected: boolean,
  muted: boolean,
  video: boolean
}) {
  const controller = new CallsController();
  controller.construct({
    appGroupCallsManager: {
      resolveConferenceCall: mocks.resolveConferenceCall
    }
  } as any);

  const instance = (controller as any).createCallInstance({
    isOutgoing: true,
    interlocutorUserId: 123 as UserId
  }) as InstanceType<typeof mocks.FakeCallInstance>;
  instance.isMuted = options.muted;
  instance.isSharingVideo = options.video;
  instance.setPhoneCall({id: 'p2p-call'});

  if(options.connected) {
    instance.connectedAt = Date.now();
    instance.overrideConnectionState(CALL_STATE.CONNECTED);
  } else {
    instance.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);
  }

  mocks.audioAsset.play.mockClear();
  mocks.audioAsset.playIfDifferent.mockClear();
  mocks.audioAsset.stop.mockClear();

  return {controller, instance};
}

async function dispatchMigration(): Promise<void> {
  await mocks.rootScope.dispatchEvent('call_update', {
    _: 'phoneCallDiscarded',
    id: 'p2p-call',
    reason: {
      _: 'phoneCallDiscardReasonMigrateConferenceCall',
      slug: 'conference-slug'
    }
  });
}

beforeEach(() => {
  mocks.rootListeners.clear();
  mocks.createdInstances.length = 0;
  vi.clearAllMocks();
  mocks.conferenceSupport.value = true;
  mocks.discardCall.mockResolvedValue(undefined);
  mocks.generateDh.mockResolvedValue({
    a: new Uint8Array([1]),
    g_a: new Uint8Array([2]),
    g_a_hash: new Uint8Array([3]),
    p: new Uint8Array([4])
  });
  mocks.getProfile.mockResolvedValue({pFlags: {video_calls_available: true}});
  mocks.resolveConferenceCall.mockResolvedValue({
    _: 'groupCall',
    id: 'conference-id',
    access_hash: 'conference-access-hash'
  });
  mocks.joinConference.mockResolvedValue(undefined);
});

describe('CallsController outgoing P2P transaction', () => {
  function createOutgoingHarness() {
    const controller = new CallsController();
    controller.construct({
      appCallsManager: {
        discardCall: mocks.discardCall,
        generateDh: mocks.generateDh,
        requestCall: mocks.requestCall
      },
      appProfileManager: {getProfile: mocks.getProfile}
    } as any);
    return controller;
  }

  it('holds startCallInternal through requestCall and compensates a late accepted call after close', async() => {
    const controller = createOutgoingHarness();
    const request = deferred<any>();
    const compensation = deferred<void>();
    mocks.requestCall.mockReturnValue(request.promise);
    mocks.discardCall.mockReturnValue(compensation.promise);

    let settled = false;
    const start = controller.startCallInternal(123 as UserId, true).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(mocks.requestCall).toHaveBeenCalledTimes(1));
    const instance = mocks.createdInstances[0];
    await instance.hangUp('phoneCallDiscardReasonHangup');

    expect(settled).toBe(false);
    request.resolve({
      _: 'phoneCallWaiting',
      id: 'accepted-call',
      access_hash: 'accepted-hash'
    });
    await vi.waitFor(() => expect(mocks.discardCall).toHaveBeenCalledWith(
      'accepted-call',
      0,
      {_: 'phoneCallDiscardReasonHangup'},
      true
    ));
    expect(settled).toBe(false);

    compensation.resolve();
    await start;
    expect(instance.connectionState).toBe(CALL_STATE.CLOSED);
    expect(instance.id).not.toBe('accepted-call');
  });

  it('does not issue requestCall when close wins during DH generation', async() => {
    const controller = createOutgoingHarness();
    const dh = deferred<any>();
    mocks.generateDh.mockReturnValue(dh.promise);

    const start = controller.startCallInternal(123 as UserId, false);
    await vi.waitFor(() => expect(mocks.createdInstances).toHaveLength(1));
    await mocks.createdInstances[0].hangUp('phoneCallDiscardReasonHangup');
    dh.resolve({
      a: new Uint8Array([1]),
      g_a: new Uint8Array([2]),
      g_a_hash: new Uint8Array([3]),
      p: new Uint8Array([4])
    });

    await start;
    expect(mocks.requestCall).not.toHaveBeenCalled();
  });

  it('ignores an accepted update delivered before a closing caller-side guard resumes', async() => {
    const controller = createOutgoingHarness();
    const instance = (controller as any).createCallInstance({
      isOutgoing: true,
      interlocutorUserId: 123 as UserId
    }) as InstanceType<typeof mocks.FakeCallInstance>;
    instance.setPhoneCall({id: 'closing-call'});
    // Keep the instance mapped to model an update posted just before the close
    // state listener removes it, while the public lifecycle already reports a
    // closing state.
    instance.connectionState = CALL_STATE.CLOSING;

    await mocks.rootScope.dispatchEvent('call_update', {
      _: 'phoneCallAccepted',
      id: 'closing-call'
    });

    expect(instance.confirmCall).not.toHaveBeenCalled();
  });

  it('observes rejected call-update work and retries fail-closed cleanup', async() => {
    const controller = createOutgoingHarness();
    const instance = (controller as any).createCallInstance({
      isOutgoing: true,
      interlocutorUserId: 123 as UserId
    }) as InstanceType<typeof mocks.FakeCallInstance>;
    instance.setPhoneCall({id: 'discarded-call'});

    const error = new Error('first cleanup failed');
    const originalHangUp = instance.hangUp.bind(instance);
    const hangUp = vi.spyOn(instance, 'hangUp')
      .mockRejectedValueOnce(error)
      .mockImplementation(originalHangUp);
    const listener = Array.from(mocks.rootListeners.get('call_update')!)[0];
    const call = {
      _: 'phoneCallDiscarded',
      id: 'discarded-call',
      reason: {_: 'phoneCallDiscardReasonBusy'}
    };

    expect(listener(call)).toBeUndefined();

    await vi.waitFor(() => expect(hangUp).toHaveBeenCalledTimes(2));
    expect(hangUp).toHaveBeenNthCalledWith(1, call.reason, true);
    expect(hangUp).toHaveBeenNthCalledWith(2, call.reason, true);
    expect(mocks.log.error).toHaveBeenCalledWith('call update processing failed', error, call);
  });
});

describe('CallsController P2P to conference migration', () => {
  it.each([
    {connected: true, muted: false, video: true},
    {connected: false, muted: true, video: false}
  ])('hands off media intent without a CLOSED tone ($connected)', async(options) => {
    const {controller, instance} = createMigrationHarness(options);
    const migrationStates: string[] = [];
    controller.addEventListener('conferenceMigration', ({state}) => migrationStates.push(state));

    await dispatchMigration();

    expect(instance.hangUpCalls).toEqual([[undefined, true]]);
    expect(instance.stopPhoneCallCalls).toBe(1);
    expect(mocks.audioAsset.play).not.toHaveBeenCalled();
    expect(mocks.audioAsset.stop).toHaveBeenCalledTimes(1);
    expect(mocks.joinConference).toHaveBeenCalledWith({
      input: {
        _: 'inputGroupCallSlug',
        slug: 'conference-slug'
      },
      expectedCanonicalInput: {
        _: 'inputGroupCall',
        id: 'conference-id',
        access_hash: 'conference-access-hash'
      },
      selfUserId: BigInt(77),
      chatId: 0,
      muted: options.muted,
      joinVideo: options.video
    });
    expect(instance.durationReads).toBe(0);
    expect(instance.getEmojisFingerprint).not.toHaveBeenCalled();
    expect(mocks.runTransition).toHaveBeenCalledTimes(1);
    expect((controller as any).migratedCallSnapshot).toBeUndefined();
    expect((controller as any).consumeMigratedCallSnapshot).toBeUndefined();
    expect(migrationStates).toEqual(['started', 'completed']);
  });

  it('uses the invalid-invite message when the migration slug is dead', async() => {
    const {controller} = createMigrationHarness({connected: true, muted: true, video: false});
    const migrationStates: string[] = [];
    controller.addEventListener('conferenceMigration', ({state}) => migrationStates.push(state));
    mocks.resolveConferenceCall.mockRejectedValue({type: 'INVITE_SLUG_INVALID'});

    await dispatchMigration();

    expect(mocks.joinConference).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'InviteExpired'});
    expect(mocks.audioAsset.play).not.toHaveBeenCalled();
    expect(migrationStates).toEqual(['started', 'failed']);
  });

  it('keeps the handoff state active while the conference join is pending', async() => {
    const {controller} = createMigrationHarness({connected: true, muted: false, video: true});
    const migrationStates: string[] = [];
    controller.addEventListener('conferenceMigration', ({state}) => migrationStates.push(state));
    let finishJoin!: () => void;
    mocks.joinConference.mockImplementation(() => new Promise<void>((resolve) => {
      finishJoin = resolve;
    }));

    const migration = dispatchMigration();
    await vi.waitFor(() => expect(migrationStates).toEqual(['started']));
    await vi.waitFor(() => expect(mocks.joinConference).toHaveBeenCalledTimes(1));

    finishJoin();
    await migration;
    expect(migrationStates).toEqual(['started', 'completed']);
  });

  it('suppresses the normal CLOSED tone when migration is unsupported', async() => {
    mocks.conferenceSupport.value = false;
    const {instance} = createMigrationHarness({connected: true, muted: false, video: false});

    await dispatchMigration();

    expect(instance.hangUpCalls).toEqual([[
      {
        _: 'phoneCallDiscardReasonMigrateConferenceCall',
        slug: 'conference-slug'
      },
      true
    ]]);
    expect(mocks.audioAsset.play).not.toHaveBeenCalled();
    expect(mocks.audioAsset.stop).toHaveBeenCalledTimes(1);
    expect(mocks.joinConference).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'ConferenceCall.Unsupported'});
  });
});
