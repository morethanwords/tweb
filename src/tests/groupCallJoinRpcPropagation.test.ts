import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const joinMocks = vi.hoisted(() => ({
  processMediaSection: vi.fn(),
  filterServerCodecs: vi.fn()
}));

vi.mock('@lib/calls/helpers/processMediaSection', () => ({
  default: joinMocks.processMediaSection
}));

vi.mock('@lib/calls/helpers/filterServerCodecs', () => ({
  default: joinMocks.filterServerCodecs
}));

import sdp from '@/mock/webrtc/sdp';
import CallConnectionInstanceBase from '@lib/calls/callConnectionInstanceBase';
import GroupCallConnectionInstance from '@lib/calls/groupCallConnectionInstance';
import type {GroupCall, Update} from '@layer';
import deferred from './helpers/deferred';

function activeCall(id: string, accessHash: string): GroupCall.groupCall {
  return {
    _: 'groupCall',
    pFlags: {conference: true},
    id,
    access_hash: accessHash,
    participants_count: 1,
    unmuted_video_limit: 0,
    version: 1
  };
}

function chainUpdate(callId: string, marker: number): Update.updateGroupCallChainBlocks {
  return {
    _: 'updateGroupCallChainBlocks',
    call: {_: 'inputGroupCall', id: callId, access_hash: `hash-${callId}`},
    sub_chain_id: 0,
    blocks: [new Uint8Array([marker])],
    next_offset: marker
  };
}


function makeDirectJoinInstance(
  joinGroupCall: ReturnType<typeof vi.fn>,
  order: string[],
  createConferenceCall = vi.fn()
) {
  const groupCall = {
    id: 'pending',
    groupCall: undefined as GroupCall.groupCall | undefined,
    connections: {main: {description: {audio: undefined as unknown}}},
    toInputGroupCall() {
      return this.groupCall && {
        _: 'inputGroupCall' as const,
        id: this.groupCall.id,
        access_hash: this.groupCall.access_hash
      };
    },
    deliverAcceptedE2eJoinChainBlocks: vi.fn(async() => {
      order.push('chain');
      return true;
    })
  };
  const instance = new GroupCallConnectionInstance({
    streamManager: {} as any,
    log: Object.assign(vi.fn(), {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      bindPrefix: () => vi.fn()
    }) as any,
    groupCall: groupCall as any,
    type: 'main',
    options: {type: 'main'},
    managers: {appGroupCallsManager: {createConferenceCall, joinGroupCall}} as any
  });
  (instance as any).description = {
    entries: [],
    setData: vi.fn(() => order.push('sdp'))
  };
  return {createConferenceCall, groupCall, instance};
}

describe('GroupCallConnectionInstance join error propagation', () => {
  beforeEach(() => {
    joinMocks.processMediaSection.mockReset().mockReturnValue({
      entry: {type: 'audio'},
      media: {mediaType: 'audio'},
      source: 777,
      sourceGroups: undefined,
      params: {_: 'dataJSON', data: '{}'}
    });
    joinMocks.filterServerCodecs.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('observes a rejected presentation sender parameter update', async() => {
    vi.spyOn(CallConnectionInstanceBase.prototype, 'negotiate').mockResolvedValue(undefined);
    const parameterError = new Error('setParameters rejected');
    const warn = vi.fn();
    const sender = {
      getParameters: vi.fn(() => ({})),
      setParameters: vi.fn().mockRejectedValue(parameterError),
      track: {kind: 'video'}
    };
    const instance = {
      connection: {getTransceivers: () => [{sender}]},
      log: {warn},
      negotiating: undefined as Promise<void> | undefined,
      options: {type: 'presentation'},
      updateConstraints: false
    };

    await expect(GroupCallConnectionInstance.prototype.negotiate.call(instance as any))
    .resolves.toBeUndefined();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
      'setting presentation sender parameters failed',
      parameterError
    ));
  });

  it('runs a fresh offer when a queued request overlaps a direct negotiation', async() => {
    const {instance} = makeDirectJoinInstance(vi.fn(), []);
    const firstNegotiation = deferred<void>();
    const negotiateInternal = vi.spyOn(instance as any, 'negotiateInternal')
    .mockReturnValueOnce(firstNegotiation.promise)
    .mockResolvedValue(undefined);

    const direct = instance.negotiate();
    const queued = instance.requestNegotiation();
    await vi.waitFor(() => expect(negotiateInternal).toHaveBeenCalledTimes(1));
    firstNegotiation.resolve();

    await Promise.all([direct, queued]);
    expect(negotiateInternal).toHaveBeenCalledTimes(2);
  });

  it('runs exactly one more pass for a request arriving during a queue-owned rerun', async() => {
    const {instance} = makeDirectJoinInstance(vi.fn(), []);
    const firstNegotiation = deferred<void>();
    const secondNegotiation = deferred<void>();
    const negotiateInternal = vi.spyOn(instance as any, 'negotiateInternal')
    .mockReturnValueOnce(firstNegotiation.promise)
    .mockReturnValueOnce(secondNegotiation.promise)
    .mockResolvedValue(undefined);

    const queued = instance.requestNegotiation();
    await vi.waitFor(() => expect(negotiateInternal).toHaveBeenCalledTimes(1));
    expect(instance.requestNegotiation()).toBe(queued);
    firstNegotiation.resolve();

    await vi.waitFor(() => expect(negotiateInternal).toHaveBeenCalledTimes(2));
    expect(instance.requestNegotiation()).toBe(queued);
    secondNegotiation.resolve();

    await queued;
    expect(negotiateInternal).toHaveBeenCalledTimes(3);
  });

  it('accepts a fresh negotiation request after the previous queued pass rejects', async() => {
    const {instance} = makeDirectJoinInstance(vi.fn(), []);
    const negotiationError = new Error('setLocalDescription failed');
    const negotiateInternal = vi.spyOn(instance as any, 'negotiateInternal')
    .mockRejectedValueOnce(negotiationError)
    .mockResolvedValue(undefined);

    await expect(instance.requestNegotiation()).rejects.toBe(negotiationError);
    await expect(instance.requestNegotiation()).resolves.toBeUndefined();

    expect(negotiateInternal).toHaveBeenCalledTimes(2);
  });

  it('rejects negotiation with the original join RPC error', async() => {
    const joinError = Object.assign(new Error('GROUPCALL_INVALID'), {type: 'GROUPCALL_INVALID'});
    const connection = {
      iceConnectionState: 'new',
      iceGatheringState: 'complete',
      signalingState: 'have-local-offer',
      connectionState: 'new',
      createOffer: vi.fn(async() => ({type: 'offer' as const, sdp})),
      setLocalDescription: vi.fn(async() => {}),
      setRemoteDescription: vi.fn(async() => {})
    } as any;
    const log = Object.assign(vi.fn(), {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    }) as any;
    log.bindPrefix = () => log;
    const instance = new GroupCallConnectionInstance({
      connection,
      streamManager: {} as any,
      log,
      groupCall: {id: '700'} as any,
      type: 'main',
      options: {type: 'main', isMuted: true, joinVideo: false},
      managers: {} as any
    });
    (instance as any).description = {
      getEntryByMid: vi.fn(() => ({source: undefined}))
    };
    vi.spyOn(instance as any, 'invokeGroupCallConnection').mockRejectedValue(joinError);

    await expect(instance.negotiate()).rejects.toBe(joinError);
    expect(connection.setLocalDescription).toHaveBeenCalledTimes(1);
    expect(connection.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('promotes, commits and replays only the accepted call before activation', async() => {
    const order: string[] = [];
    const chainRace = Object.assign(new Error('CONF_WRITE_CHAIN_INVALID'), {type: 'CONF_WRITE_CHAIN_INVALID'});
    const resolved = activeCall('700', '701');
    const relevantChain = chainUpdate('700', 1);
    const foreignChain = chainUpdate('999', 1);
    const accepted = Object.assign({
      _: 'updateGroupCallConnection' as const,
      pFlags: {},
      params: {_: 'dataJSON' as const, data: '{}'}
    }, {
      acceptedCallInput: {_: 'inputGroupCall' as const, id: resolved.id, access_hash: resolved.access_hash},
      resolvedCallId: resolved.id,
      resolvedAccessHash: resolved.access_hash,
      resolvedGroupCall: resolved,
      resolvedChainUpdates: [foreignChain, relevantChain]
    });
    const joinGroupCall = vi.fn()
    .mockImplementationOnce(async() => {
      order.push('rpc-rejected');
      throw chainRace;
    })
    .mockImplementationOnce(async() => {
      order.push('rpc-accepted');
      return accepted;
    });
    const {groupCall, instance} = makeDirectJoinInstance(joinGroupCall, order);
    const rebuiltBlock = new Uint8Array([8]);

    await (instance as any).invokeGroupCallConnection({} as any, [{} as any], {
      type: 'main',
      e2eCallInput: {_: 'inputGroupCallSlug', slug: 'invite'},
      e2eBlock: new Uint8Array([7]),
      e2eRebuildBlock: vi.fn(async() => {
        order.push('rebuild');
        return rebuiltBlock;
      }),
      e2eCommitRebuiltBlock: vi.fn(async() => {
        expect(groupCall.id).toBe('700');
        expect(groupCall.groupCall).toBe(resolved);
        order.push('commit');
      }),
      e2eActivate: vi.fn(async() => {
        order.push('activate');
      })
    });

    expect(instance.joinAccepted).toBe(true);
    expect(instance.acceptedCallInput).toEqual({
      _: 'inputGroupCall',
      id: resolved.id,
      access_hash: resolved.access_hash
    });
    expect(joinGroupCall).toHaveBeenCalledTimes(2);
    expect((joinGroupCall.mock.calls[1][2] as any).e2eBlock).toBe(rebuiltBlock);
    expect(order).toEqual([
      'rpc-rejected',
      'rebuild',
      'rpc-accepted',
      'commit',
      'chain',
      'activate',
      'sdp'
    ]);
    expect(groupCall.deliverAcceptedE2eJoinChainBlocks).toHaveBeenCalledWith(
      relevantChain.sub_chain_id,
      relevantChain.blocks,
      relevantChain.next_offset
    );
  });

  it('replays an accepted canonical join slice before activation', async() => {
    const order: string[] = [];
    const resolved = activeCall('pending', '701');
    const relevantChain = chainUpdate('pending', 1);
    const accepted = Object.assign({
      _: 'updateGroupCallConnection' as const,
      pFlags: {},
      params: {_: 'dataJSON' as const, data: '{}'}
    }, {
      acceptedCallInput: {_: 'inputGroupCall' as const, id: resolved.id, access_hash: resolved.access_hash},
      resolvedCallId: resolved.id,
      resolvedAccessHash: resolved.access_hash,
      resolvedGroupCall: resolved,
      resolvedChainUpdates: [relevantChain]
    });
    const joinGroupCall = vi.fn(async() => {
      order.push('rpc-accepted');
      return accepted;
    });
    const {groupCall, instance} = makeDirectJoinInstance(joinGroupCall, order);

    await (instance as any).invokeGroupCallConnection({} as any, [{} as any], {
      type: 'main',
      e2eBlock: new Uint8Array([7]),
      e2eActivate: vi.fn(async() => {
        order.push('activate');
      })
    });

    expect(order).toEqual(['rpc-accepted', 'chain', 'activate', 'sdp']);
    expect(groupCall.deliverAcceptedE2eJoinChainBlocks).toHaveBeenCalledWith(
      relevantChain.sub_chain_id,
      relevantChain.blocks,
      relevantChain.next_offset
    );
  });

  it('routes a fresh start through atomic create', async() => {
    const order: string[] = [];
    const resolved = activeCall('700', '701');
    const relevantChain = chainUpdate('700', 1);
    const accepted = {
      _: 'updateGroupCallConnection' as const,
      pFlags: {},
      params: {_: 'dataJSON' as const, data: '{}'},
      acceptedCallInput: {_: 'inputGroupCall' as const, id: resolved.id, access_hash: resolved.access_hash},
      resolvedCallId: resolved.id,
      resolvedAccessHash: resolved.access_hash,
      resolvedGroupCall: resolved,
      resolvedChainUpdates: [relevantChain]
    };
    const joinGroupCall = vi.fn();
    const createConferenceCall = vi.fn(async() => {
      order.push('create-accepted');
      return accepted;
    });
    const {groupCall, instance} = makeDirectJoinInstance(joinGroupCall, order, createConferenceCall);

    await (instance as any).invokeGroupCallConnection({} as any, [{} as any], {
      type: 'main',
      e2eCreateConference: true,
      e2ePublicKey: new Uint8Array(32),
      e2eBlock: new Uint8Array([7]),
      e2eActivate: vi.fn(async() => {
        order.push('activate');
      })
    });

    expect(createConferenceCall).toHaveBeenCalledTimes(1);
    expect(joinGroupCall).not.toHaveBeenCalled();
    expect(instance.joinAccepted).toBe(true);
    expect(groupCall.id).toBe(resolved.id);
    expect(order).toEqual(['create-accepted', 'chain', 'activate', 'sdp']);
  });

  it('does not rebuild or retry an atomic create after a chain rejection', async() => {
    const order: string[] = [];
    const chainError = Object.assign(new Error('CONF_WRITE_CHAIN_INVALID'), {
      type: 'CONF_WRITE_CHAIN_INVALID'
    });
    const joinGroupCall = vi.fn();
    const createConferenceCall = vi.fn().mockRejectedValue(chainError);
    const {instance} = makeDirectJoinInstance(joinGroupCall, order, createConferenceCall);
    const rebuild = vi.fn(async() => new Uint8Array([8]));

    await expect((instance as any).invokeGroupCallConnection({} as any, [{} as any], {
      type: 'main',
      e2eCreateConference: true,
      e2ePublicKey: new Uint8Array(32),
      e2eBlock: new Uint8Array([7]),
      e2eRebuildBlock: rebuild
    })).rejects.toBe(chainError);

    expect(createConferenceCall).toHaveBeenCalledTimes(1);
    expect(joinGroupCall).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();
    expect(instance.joinAccepted).toBe(false);
  });

  it.each([
    {order: 'older then newer', markers: [1, 2]},
    {order: 'newer then older', markers: [2, 1]}
  ])('rejects ambiguous accepted same-subchain slices in $order order before replay', async({markers}) => {
    const order: string[] = [];
    const resolved = activeCall('pending', '701');
    const accepted = Object.assign({
      _: 'updateGroupCallConnection' as const,
      pFlags: {},
      params: {_: 'dataJSON' as const, data: '{}'}
    }, {
      acceptedCallInput: {_: 'inputGroupCall' as const, id: resolved.id, access_hash: resolved.access_hash},
      resolvedCallId: resolved.id,
      resolvedAccessHash: resolved.access_hash,
      resolvedGroupCall: resolved,
      resolvedChainUpdates: markers.map((marker) => chainUpdate('pending', marker))
    });
    const joinGroupCall = vi.fn(async() => {
      order.push('rpc-accepted');
      return accepted;
    });
    const {groupCall, instance} = makeDirectJoinInstance(joinGroupCall, order);
    const activate = vi.fn(async() => {
      order.push('activate');
    });

    await expect((instance as any).invokeGroupCallConnection({} as any, [{} as any], {
      type: 'main',
      e2eBlock: new Uint8Array([7]),
      e2eActivate: activate
    })).rejects.toThrow('Conference join response contained multiple chain slices for one subchain');

    expect(instance.joinAccepted).toBe(true);
    expect(groupCall.deliverAcceptedE2eJoinChainBlocks).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    expect(order).toEqual(['rpc-accepted']);
  });

  it('never commits or activates after a rejected join RPC', async() => {
    const order: string[] = [];
    const joinError = Object.assign(new Error('GROUPCALL_INVALID'), {type: 'GROUPCALL_INVALID'});
    const joinGroupCall = vi.fn(async() => {
      throw joinError;
    });
    const {instance} = makeDirectJoinInstance(joinGroupCall, order);
    const commit = vi.fn(async() => {});
    const activate = vi.fn(async() => {});

    await expect((instance as any).invokeGroupCallConnection({} as any, [{} as any], {
      type: 'main',
      e2eCallInput: {_: 'inputGroupCallSlug', slug: 'invite'},
      e2eBlock: new Uint8Array([7]),
      e2eRebuildBlock: vi.fn(async() => new Uint8Array([8])),
      e2eCommitRebuiltBlock: commit,
      e2eActivate: activate
    })).rejects.toBe(joinError);

    expect(instance.joinAccepted).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not continue SDP when post-accept e2e activation rejects', async() => {
    const order: string[] = [];
    const resolved = activeCall('700', '701');
    const accepted = {
      _: 'updateGroupCallConnection' as const,
      pFlags: {},
      params: {_: 'dataJSON' as const, data: '{}'},
      acceptedCallInput: {_: 'inputGroupCall' as const, id: resolved.id, access_hash: resolved.access_hash},
      resolvedCallId: resolved.id,
      resolvedAccessHash: resolved.access_hash,
      resolvedGroupCall: resolved
    };
    const joinGroupCall = vi.fn(async() => accepted);
    const {instance} = makeDirectJoinInstance(joinGroupCall, order);
    const activationError = new Error('buffered accepted block failed');

    await expect((instance as any).invokeGroupCallConnection({} as any, [{} as any], {
      type: 'main',
      e2eBlock: new Uint8Array([7]),
      e2eActivate: vi.fn(async() => {
        throw activationError;
      })
    })).rejects.toBe(activationError);

    // Server acceptance is observable to the controller, which performs the
    // single compensating leave. No answer SDP may be installed meanwhile.
    expect(instance.joinAccepted).toBe(true);
    expect(instance.acceptedCallInput).toEqual(accepted.acceptedCallInput);
    expect(joinGroupCall).toHaveBeenCalledTimes(1);
    expect(order).not.toContain('sdp');
  });
});
