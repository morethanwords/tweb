/*
 * Unit tests for AppGroupCallsManager.joinGroupCall — focused on the
 * `resolvedCallId` / `resolvedAccessHash` promotion the controller depends on
 * for invite-link / invite-message joins (where the placeholder instance.id
 * needs to be rewritten once the server echoes back the real id+access_hash).
 */

import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppGroupCallsManager} from '@appManagers/appGroupCallsManager';
import {
  DataJSON,
  GroupCall,
  GroupCallParticipant,
  InputGroupCall,
  PhoneGroupCall,
  PhoneGroupParticipants,
  Update,
  Updates
} from '@layer';
import deferred from './helpers/deferred';

type JoinOptions = Parameters<AppGroupCallsManager['joinGroupCall']>[2];
type CreateOptions = Parameters<AppGroupCallsManager['createConferenceCall']>[1];


// Build a fake `updateGroupCallConnection` reply, optionally accompanied by
// an `updateGroupCall` carrying the resolved id+access_hash.
function buildUpdatesReply(includeGroupCall: {
  callId: string;
  accessHash: string;
  discarded?: boolean;
} | null): Updates.updates {
  const updates: Update[] = [
    {
      _: 'updateGroupCallConnection',
      pFlags: {},
      params: {_: 'dataJSON', data: '{"answer":"sdp"}'}
    }
  ];
  if(includeGroupCall) {
    const call: GroupCall = includeGroupCall.discarded ? {
      _: 'groupCallDiscarded',
      id: includeGroupCall.callId,
      access_hash: includeGroupCall.accessHash,
      duration: 0
    } : {
      _: 'groupCall',
      pFlags: {conference: true},
      id: includeGroupCall.callId,
      access_hash: includeGroupCall.accessHash,
      participants_count: 0,
      unmuted_video_limit: 0,
      version: 1
    };
    updates.push({
      _: 'updateGroupCall',
      pFlags: {},
      call
    });
  }
  return {
    _: 'updates',
    updates,
    users: [],
    chats: [],
    date: 0,
    seq: 0
  };
}

function activeGroupCall(id: string | number, accessHash: string): GroupCall.groupCall {
  return {
    _: 'groupCall',
    pFlags: {conference: true},
    id,
    access_hash: accessHash,
    participants_count: 0,
    unmuted_video_limit: 0,
    version: 1
  };
}

function groupCallParticipant(userId: number, source: number, self = false): GroupCallParticipant {
  return {
    _: 'groupCallParticipant',
    pFlags: self ? {self: true} : {},
    peer: {_: 'peerUser', user_id: userId},
    source,
    date: 1
  };
}

function groupParticipantsPage(
  participants: GroupCallParticipant[],
  nextOffset = '',
  count = participants.length,
  version = 1
): PhoneGroupParticipants {
  return {
    _: 'phone.groupParticipants',
    count,
    participants,
    next_offset: nextOffset,
    chats: [],
    users: [],
    version
  };
}

function phoneGroupCallResponse(
  call: GroupCall,
  participants: GroupCallParticipant[],
  nextOffset = ''
): PhoneGroupCall {
  return {
    _: 'phone.groupCall',
    call,
    participants,
    participants_next_offset: nextOffset,
    chats: [],
    users: []
  };
}

function groupCallUpdate(call: GroupCall.groupCall): Update.updateGroupCall {
  return {_: 'updateGroupCall', pFlags: {}, call};
}

function chainUpdate(callId: string | number, marker: number): Update.updateGroupCallChainBlocks {
  return {
    _: 'updateGroupCallChainBlocks',
    call: {_: 'inputGroupCall', id: callId, access_hash: `hash-${callId}`},
    sub_chain_id: 0,
    blocks: [new Uint8Array([marker])],
    next_offset: marker
  };
}

// Create a minimally-wired AppGroupCallsManager: only the fields the
// `joinGroupCall` body touches need to be real. Everything else is left undef.
function makeManager(opts: {
  apiResponse: Updates;
  inputPeerSelf?: any;
  processUpdateMessage?: (updates: Updates) => void;
}): AppGroupCallsManager {
  const manager = new AppGroupCallsManager();

  const apiManagerMock = {
    invokeApi: vi.fn(async(_method: string, _params: any) => opts.apiResponse)
  };
  const apiUpdatesManagerMock = {
    processUpdateMessage: vi.fn((updates: Updates) => {
      opts.processUpdateMessage?.(updates);
      const list = updates._ === 'updates' || updates._ === 'updatesCombined' ?
        updates.updates :
        updates._ === 'updateShort' ? [updates.update] : [];
      for(const update of list) {
        if(update._ === 'updateGroupCall') manager.saveGroupCall(update.call);
      }
    })
  };
  const appPeersManagerMock = {
    getInputPeerSelf: () => opts.inputPeerSelf ?? {_: 'inputPeerSelf'},
    getInputPeerById: (peerId: PeerId) => ({_: 'inputPeer', peerId})
  };

  // AppManager fields are `protected`, so reach in via `as any`.
  Object.assign(manager as any, {
    apiManager: apiManagerMock,
    apiUpdatesManager: apiUpdatesManagerMock,
    appPeersManager: appPeersManagerMock,
    appUsersManager: {saveApiUsers: vi.fn()},
    appChatsManager: {saveApiChats: vi.fn()},
    rootScope: {myId: 42 as PeerId, dispatchEvent: vi.fn()},
    // construct() isn't run here; mirror the per-call participant-state maps it
    // initialises, since joinGroupCall (and hangUp) reset them for re-join hygiene.
    cachedStreamChannels: new Map(),
    conferenceRosterFetches: new Map(),
    groupCalls: new Map(),
    nextOffsets: new Map(),
    participantFetchGenerations: new Map(),
    participantVersions: new Map(),
    participants: new Map(),
    log: Object.assign(() => {}, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    })
  });

  return manager;
}

const params: DataJSON = {_: 'dataJSON', data: '{"offer":"sdp"}'};

const baseOptions: JoinOptions = {
  type: 'main',
  isMuted: true,
  joinVideo: false,
  e2eCallInput: {_: 'inputGroupCallSlug', slug: 'fake-slug-for-test'},
  e2eExpectedCallInput: {
    _: 'inputGroupCall',
    id: '12345678901',
    access_hash: '99887766554433'
  }
};

describe('AppGroupCallsManager.joinGroupCall — resolvedCallId / resolvedAccessHash promotion', () => {
  it('attaches resolvedCallId + resolvedAccessHash when updates contain updateGroupCall', async() => {
    const reply = buildUpdatesReply({callId: '12345678901', accessHash: '99887766554433'});
    reply.updates.push(chainUpdate('12345678901', 1));
    const manager = makeManager({apiResponse: reply});

    const update = await manager.joinGroupCall('placeholder-id', params, baseOptions);

    expect(update._).toBe('updateGroupCallConnection');
    expect((update as any).resolvedCallId).toBe('12345678901');
    expect((update as any).resolvedAccessHash).toBe('99887766554433');
    expect((update as any).acceptedCallInput).toEqual({
      _: 'inputGroupCall',
      id: '12345678901',
      access_hash: '99887766554433'
    });
  });

  it('leaves resolvedCallId / resolvedAccessHash undefined when no updateGroupCall in response (legacy case)', async() => {
    const reply = buildUpdatesReply(null);
    const manager = makeManager({apiResponse: reply});

    // For the legacy case the controller must already know the id, so we
    // wouldn't be using `e2eCallInput`. Use the id-form input + a synthetic
    // group_call cache entry so `getGroupCallInput` succeeds.
    (manager as any).groupCalls = new Map<string, GroupCall>([
      ['42', {
        _: 'groupCall',
        pFlags: {},
        id: '42',
        access_hash: '7',
        participants_count: 0,
        unmuted_video_limit: 0,
        version: 1
      }]
    ]);

    const update = await manager.joinGroupCall('42', params, {
      type: 'main',
      isMuted: true,
      joinVideo: false
    });

    expect(update._).toBe('updateGroupCallConnection');
    expect((update as any).resolvedCallId).toBeUndefined();
    expect((update as any).resolvedAccessHash).toBeUndefined();
    expect((update as any).acceptedCallInput).toEqual({_: 'inputGroupCall', id: '42', access_hash: '7'});
  });

  it('fails closed and rolls back a slug join resolved only by a discarded call', async() => {
    const reply = buildUpdatesReply({callId: 'discarded-id', accessHash: 'discarded-hash', discarded: true});
    const manager = makeManager({apiResponse: reply});

    await expect(manager.joinGroupCall('placeholder-id', params, baseOptions))
    .rejects.toThrow('accepted non-canonical call did not match its preview identity');

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.leaveGroupCall', {
      call: baseOptions.e2eCallInput,
      source: 0
    });
  });

  it('does not use a lone unrelated updateGroupCall as slug resolution', async() => {
    const reply = buildUpdatesReply({callId: 'unrelated', accessHash: 'unrelated-hash'});
    const manager = makeManager({apiResponse: reply});
    const joinParams: DataJSON = {_: 'dataJSON', data: '{"ssrc":777}'};

    await expect(manager.joinGroupCall('placeholder-id', joinParams, baseOptions))
    .rejects.toThrow('accepted non-canonical call did not match its preview identity');

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.leaveGroupCall', {
      call: baseOptions.e2eCallInput,
      source: 777
    });
  });

  it('rolls back a slug join when the response has no canonical call update', async() => {
    const reply = buildUpdatesReply(null);
    const manager = makeManager({apiResponse: reply});

    await expect(manager.joinGroupCall('placeholder-id', params, baseOptions))
    .rejects.toThrow('accepted non-canonical call did not match its preview identity');

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.leaveGroupCall', {
      call: baseOptions.e2eCallInput,
      source: 0
    });
  });

  it('forwards `e2eCallInput` straight through as the `call` field (no synth from id)', async() => {
    // The whole point of `e2eCallInput`: invitee paths (slug / inviteMessage)
    // don't yet have an access_hash, so the manager must pass the override to
    // the server rather than calling `getGroupCallInput` with the placeholder
    // id (which would throw 'Group call not found').
    const reply = buildUpdatesReply({callId: 'resolved-1', accessHash: 'resolved-hash'});
    reply.updates.push(chainUpdate('resolved-1', 1));

    // Sniff the request that the apiManager mock receives.
    let sniffedRequest: any;
    const manager = new AppGroupCallsManager();
    Object.assign(manager as any, {
      apiManager: {
        invokeApi: async(_method: string, params: any) => {
          sniffedRequest = params;
          return reply;
        }
      },
      apiUpdatesManager: {
        processUpdateMessage: (updates: Updates) => {
          const list = updates._ === 'updates' || updates._ === 'updatesCombined' ? updates.updates : [];
          for(const update of list) {
            if(update._ === 'updateGroupCall') manager.saveGroupCall(update.call);
          }
        }
      },
      appPeersManager: {getInputPeerSelf: () => ({_: 'inputPeerSelf'})},
      // construct() isn't run here; mirror the maps joinGroupCall resets.
      conferenceRosterFetches: new Map(),
      nextOffsets: new Map(),
      participantFetchGenerations: new Map(),
      participantVersions: new Map(),
      participants: new Map(),
      groupCalls: new Map(),
      rootScope: {dispatchEvent: vi.fn()},
      log: Object.assign(() => {}, {warn: () => {}, error: () => {}, info: () => {}, debug: () => {}})
    });

    const inviteMessageInput = {_: 'inputGroupCallInviteMessage' as const, msg_id: 9999};
    await manager.joinGroupCall('placeholder-id', params, {
      type: 'main',
      isMuted: true,
      joinVideo: false,
      e2eCallInput: inviteMessageInput,
      e2eExpectedCallInput: {
        _: 'inputGroupCall',
        id: 'resolved-1',
        access_hash: 'resolved-hash'
      }
    });

    expect(sniffedRequest.call).toEqual(inviteMessageInput);
  });

  it('resolves a slug from the call linked by its chain update and excludes unrelated chains', async() => {
    const resolved = activeGroupCall('200', 'hash-200');
    const relevantChain = chainUpdate(200, 1);
    const unrelatedChain = chainUpdate('300', 2);
    const reply: Updates.updatesCombined = {
      _: 'updatesCombined',
      updates: [
        {
          _: 'updateGroupCallConnection',
          pFlags: {},
          params: {_: 'dataJSON', data: '{"answer":"sdp"}'}
        },
        groupCallUpdate(resolved),
        unrelatedChain,
        relevantChain
      ],
      users: [],
      chats: [],
      date: 0,
      seq_start: 0,
      seq: 0
    };
    const manager = makeManager({apiResponse: reply});

    const update = await manager.joinGroupCall('placeholder-id', params, {
      ...baseOptions,
      e2eExpectedCallInput: {_: 'inputGroupCall', id: '200', access_hash: 'hash-200'}
    }) as any;

    expect(update.resolvedCallId).toBe('200');
    expect(update.resolvedAccessHash).toBe('hash-200');
    expect(update.resolvedChainUpdates).toEqual([relevantChain]);
  });

  it.each([
    {order: 'older then newer', markers: [1, 2]},
    {order: 'newer then older', markers: [2, 1]}
  ])('rejects matching same-subchain chain updates in $order order before processing them', async({markers}) => {
    const resolved = activeGroupCall('200', 'hash-200');
    const ambiguousChains = markers.map((marker) => chainUpdate('200', marker));
    const reply: Updates.updatesCombined = {
      _: 'updatesCombined',
      updates: [{
        _: 'updateGroupCallConnection',
        pFlags: {},
        params: {_: 'dataJSON', data: '{"answer":"sdp"}'}
      }, groupCallUpdate(resolved), ...ambiguousChains],
      users: [],
      chats: [],
      date: 0,
      seq_start: 0,
      seq: 0
    };
    const rollbackReply: Updates.updates = {
      _: 'updates',
      updates: [],
      users: [],
      chats: [],
      date: 0,
      seq: 0
    };
    const manager = makeManager({apiResponse: reply});
    (manager as any).apiManager.invokeApi
    .mockResolvedValueOnce(reply)
    .mockResolvedValueOnce(rollbackReply);

    await expect(manager.joinGroupCall('placeholder-id', params, {
      ...baseOptions,
      e2eExpectedCallInput: {_: 'inputGroupCall', id: '200', access_hash: 'hash-200'}
    })).rejects.toThrow(
      'joinGroupCall: multiple matching updateGroupCallChainBlocks entries for subchain 0 in updatesCombined'
    );

    expect((manager as any).apiUpdatesManager.processUpdateMessage).toHaveBeenCalledTimes(1);
    expect((manager as any).apiUpdatesManager.processUpdateMessage).toHaveBeenCalledWith(rollbackReply);
    expect((manager as any).apiUpdatesManager.processUpdateMessage).not.toHaveBeenCalledWith(reply);
    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.leaveGroupCall', {
      call: {_: 'inputGroupCall', id: '200', access_hash: 'hash-200'},
      source: 0
    });
  });

  it('rejects mixed canonical call updates instead of guessing the slug resolution', async() => {
    const unrelated = activeGroupCall('100', 'hash-100');
    const resolved = activeGroupCall('200', 'hash-200');
    const reply = buildUpdatesReply(null);
    reply.updates.push(
      groupCallUpdate(unrelated),
      groupCallUpdate(resolved),
      chainUpdate('200', 1)
    );
    const manager = makeManager({apiResponse: reply});

    await expect(manager.joinGroupCall('placeholder-id', params, baseOptions))
    .rejects.toThrow('accepted non-canonical call did not match its preview identity');

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.leaveGroupCall', {
      call: baseOptions.e2eCallInput,
      source: 0
    });
  });

  it('does not infer slug identity from an internally-consistent foreign update pair', async() => {
    const reply = buildUpdatesReply({callId: 'foreign', accessHash: 'foreign-hash'});
    reply.updates.push(chainUpdate('foreign', 1));
    const manager = makeManager({apiResponse: reply});
    const options: JoinOptions = {
      type: 'main',
      e2eCallInput: {_: 'inputGroupCallSlug', slug: 'revocable-authorization'}
    };

    await expect(manager.joinGroupCall('placeholder-id', params, options))
    .rejects.toThrow('accepted non-canonical call did not match its preview identity');

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(1, 'phone.joinGroupCall',
      expect.objectContaining({call: options.e2eCallInput}));
  });

  it('extracts updateGroupCallConnection from updateShort safely', async() => {
    const connectionUpdate: Update.updateGroupCallConnection = {
      _: 'updateGroupCallConnection',
      pFlags: {},
      params: {_: 'dataJSON', data: '{"answer":"sdp"}'}
    };
    const manager = makeManager({
      apiResponse: {_: 'updateShort', update: connectionUpdate, date: 0}
    });

    const canonicalInput = {_: 'inputGroupCall' as const, id: '42', access_hash: '43'};
    (manager as any).groupCalls.set(canonicalInput.id, activeGroupCall(
      canonicalInput.id,
      canonicalInput.access_hash
    ));
    const update = await manager.joinGroupCall('42', params, {
      type: 'main',
      e2eCallInput: canonicalInput
    });

    expect(update).toBe(connectionUpdate);
    expect((update as any).acceptedCallInput).toEqual(canonicalInput);
  });

  it('rejects a malformed join response without a connection update', async() => {
    const manager = makeManager({apiResponse: {_: 'updatesTooLong'}});

    await expect(
      manager.joinGroupCall('placeholder-id', params, baseOptions)
    ).rejects.toThrow('joinGroupCall: no updateGroupCallConnection in updatesTooLong');

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.leaveGroupCall', {
      call: baseOptions.e2eCallInput,
      source: 0
    });
  });

  it('rolls back an accepted canonical join when update processing throws without masking the error', async() => {
    const reply = buildUpdatesReply(null);
    const processingError = new Error('update processing failed');
    const rollbackError = new Error('leave update processing failed');
    let processCalls = 0;
    const manager = makeManager({
      apiResponse: reply,
      processUpdateMessage: () => {
        throw processCalls++ ? rollbackError : processingError;
      }
    });
    const canonicalInput = {_: 'inputGroupCall' as const, id: '42', access_hash: '43'};
    const joinParams: DataJSON = {_: 'dataJSON', data: '{"ssrc":777}'};

    await expect(manager.joinGroupCall('42', joinParams, {
      type: 'main',
      e2eCallInput: canonicalInput
    })).rejects.toBe(processingError);

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.leaveGroupCall', {
      call: canonicalInput,
      source: 777
    });
    expect((manager as any).log.warn).not.toHaveBeenCalledWith(
      'joinGroupCall: accepted join rollback failed',
      expect.anything()
    );
    expect((manager as any).log.error).toHaveBeenCalledWith(
      'terminate group call update processing failed after RPC acceptance',
      rollbackError
    );
  });

  it('rolls back with the final same-id access hash when local processing fails', async() => {
    const requested = {_: 'inputGroupCall' as const, id: '42', access_hash: 'requested-hash'};
    const finalHash = 'final-hash';
    const reply = buildUpdatesReply(null);
    reply.updates.push(
      groupCallUpdate(activeGroupCall(requested.id, 'intermediate-hash')),
      groupCallUpdate(activeGroupCall(requested.id, finalHash))
    );
    const processingError = new Error('update processing failed');
    const rollbackReply = buildUpdatesReply(null);
    const manager = makeManager({apiResponse: reply});
    (manager as any).apiManager.invokeApi
    .mockResolvedValueOnce(reply)
    .mockResolvedValueOnce(rollbackReply);
    (manager as any).apiUpdatesManager.processUpdateMessage.mockImplementation((updates: Updates) => {
      if(updates === reply) throw processingError;
    });

    await expect(manager.joinGroupCall(requested.id, params, {
      type: 'main',
      e2eCallInput: requested
    })).rejects.toBe(processingError);

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.leaveGroupCall', {
      call: {_: 'inputGroupCall', id: requested.id, access_hash: finalHash},
      source: 0
    });
  });
});

describe('AppGroupCallsManager.createConferenceCall', () => {
  const createOptions: CreateOptions = {
    type: 'main',
    isMuted: true,
    joinVideo: false,
    e2ePublicKey: new Uint8Array(32).fill(7),
    e2eBlock: new Uint8Array([8, 9])
  };

  it('creates and joins atomically, then normalizes the accepted response', async() => {
    const created = activeGroupCall('700', 'hash-700');
    const relevantChain = chainUpdate('700', 1);
    const foreignChain = chainUpdate('701', 2);
    const reply = buildUpdatesReply(null);
    reply.updates.push(groupCallUpdate(created), relevantChain, foreignChain);
    const manager = makeManager({apiResponse: reply});

    const update = await manager.createConferenceCall(params, createOptions) as any;

    expect((manager as any).apiManager.invokeApi).toHaveBeenCalledWith(
      'phone.createConferenceCall',
      {
        muted: true,
        video_stopped: true,
        join: true,
        random_id: expect.any(Number),
        public_key: createOptions.e2ePublicKey,
        block: createOptions.e2eBlock,
        params
      }
    );
    expect(update.acceptedCallInput).toEqual({
      _: 'inputGroupCall',
      id: created.id,
      access_hash: created.access_hash
    });
    expect(update.resolvedGroupCall).toBe(created);
    expect(update.resolvedChainUpdates).toEqual([relevantChain]);
    expect((manager as any).apiUpdatesManager.processUpdateMessage).toHaveBeenCalledWith(reply);
  });

  it.each([
    {hashes: ['old-hash', 'new-hash'], expectedHash: 'new-hash'},
    {hashes: ['new-hash', 'old-hash'], expectedHash: 'old-hash'}
  ])('uses the final active update identity for hashes $hashes', async({hashes, expectedHash}) => {
    const reply = buildUpdatesReply(null);
    reply.updates.push(...hashes.map((accessHash) => {
      return groupCallUpdate(activeGroupCall('700', accessHash));
    }));
    const manager = makeManager({apiResponse: reply});

    const update = await manager.createConferenceCall(params, createOptions) as any;

    expect(update.acceptedCallInput).toEqual({
      _: 'inputGroupCall',
      id: '700',
      access_hash: expectedHash
    });
    expect(update.resolvedAccessHash).toBe(expectedHash);
    expect(update.resolvedGroupCall.access_hash).toBe(expectedHash);
  });

  it.each([
    {label: 'active then discarded', discardedFirst: false},
    {label: 'discarded then active', discardedFirst: true}
  ])('rejects a response whose authoritative call is terminal: $label', async({discardedFirst}) => {
    const active = activeGroupCall('700', 'hash-700');
    const discarded: GroupCall.groupCallDiscarded = {
      _: 'groupCallDiscarded',
      id: active.id,
      access_hash: active.access_hash,
      duration: 0
    };
    const reply = buildUpdatesReply(null);
    const lifecycleUpdates: Update.updateGroupCall[] = [
      {_: 'updateGroupCall', pFlags: {}, call: discarded},
      groupCallUpdate(active)
    ];
    if(!discardedFirst) lifecycleUpdates.reverse();
    reply.updates.push(...lifecycleUpdates);
    const manager = makeManager({apiResponse: reply});

    await expect(manager.createConferenceCall(params, createOptions)).rejects.toThrow(
      'createConferenceCall: accepted group call is not active after update processing'
    );

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.discardGroupCall', {
      call: {_: 'inputGroupCall', id: active.id, access_hash: active.access_hash}
    });
  });

  it.each([
    {
      label: 'missing',
      connections: [] as Update.updateGroupCallConnection[],
      message: 'no updateGroupCallConnection'
    },
    {
      label: 'duplicate',
      connections: [
        {_: 'updateGroupCallConnection', pFlags: {}, params},
        {_: 'updateGroupCallConnection', pFlags: {}, params}
      ] as Update.updateGroupCallConnection[],
      message: 'multiple updateGroupCallConnection'
    }
  ])('discards the exact accepted call after a $label connection response', async({connections, message}) => {
    const created = activeGroupCall('700', 'hash-700');
    const reply: Updates.updates = {
      _: 'updates',
      updates: [groupCallUpdate(created), ...connections],
      users: [],
      chats: [],
      date: 0,
      seq: 0
    };
    const rollbackReply = buildUpdatesReply(null);
    const manager = makeManager({apiResponse: reply});
    (manager as any).apiManager.invokeApi
    .mockResolvedValueOnce(reply)
    .mockResolvedValueOnce(rollbackReply);

    await expect(manager.createConferenceCall(params, createOptions)).rejects.toThrow(message);

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.discardGroupCall', {
      call: {_: 'inputGroupCall', id: created.id, access_hash: created.access_hash}
    });
    expect((manager as any).apiUpdatesManager.processUpdateMessage).not.toHaveBeenCalledWith(reply);
  });

  it('discards after local processing fails and preserves that original error', async() => {
    const created = activeGroupCall('700', 'hash-700');
    const reply = buildUpdatesReply(null);
    reply.updates.push(groupCallUpdate(created));
    const rollbackReply = buildUpdatesReply(null);
    const processingError = new Error('accepted create processing failed');
    const manager = makeManager({apiResponse: reply});
    (manager as any).apiManager.invokeApi
    .mockResolvedValueOnce(reply)
    .mockResolvedValueOnce(rollbackReply);
    (manager as any).apiUpdatesManager.processUpdateMessage
    .mockImplementationOnce(() => { throw processingError; });

    await expect(manager.createConferenceCall(params, createOptions)).rejects.toBe(processingError);

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.discardGroupCall', {
      call: {_: 'inputGroupCall', id: created.id, access_hash: created.access_hash}
    });
  });

  it('does not compensate a create RPC that was never accepted', async() => {
    const rpcError = new Error('create rejected');
    const manager = makeManager({apiResponse: {_: 'updatesTooLong'}});
    (manager as any).apiManager.invokeApi.mockRejectedValueOnce(rpcError);

    await expect(manager.createConferenceCall(params, createOptions)).rejects.toBe(rpcError);

    expect((manager as any).apiManager.invokeApi).toHaveBeenCalledTimes(1);
    expect((manager as any).apiUpdatesManager.processUpdateMessage).not.toHaveBeenCalled();
  });
});

describe('AppGroupCallsManager participant fetch generations and versions', () => {
  it('resolves an unsigned WebRTC SSRC through the signed Telegram source filter', async() => {
    const id = 'source-resolution-call';
    const signedSource = -559038737;
    const participant = groupCallParticipant(42, signedSource);
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, activeGroupCall(id, 'source-resolution-hash'));
    (manager as any).apiManager.invokeApi.mockResolvedValueOnce(groupParticipantsPage([participant]));

    await expect(manager.getGroupCallParticipantsBySources(id, [signedSource >>> 0, signedSource >>> 0]))
    .resolves.toEqual([participant]);

    expect((manager as any).apiManager.invokeApi).toHaveBeenCalledWith(
      'phone.getGroupParticipants',
      {
        call: {_: 'inputGroupCall', id, access_hash: 'source-resolution-hash'},
        ids: [],
        sources: [signedSource],
        offset: '',
        limit: 100
      }
    );
    expect((manager as any).appChatsManager.saveApiChats).toHaveBeenCalledWith([]);
    expect((manager as any).appUsersManager.saveApiUsers).toHaveBeenCalledWith([]);
    expect(manager.getCachedParticipants(id).size).toBe(0);
    expect((manager as any).participantVersions.has(id)).toBe(false);
  });

  it('ignores a source lookup from an invalidated participant generation', async() => {
    const id = 'stale-source-resolution-call';
    const pending = deferred<PhoneGroupParticipants>();
    const participant = groupCallParticipant(42, 4242);
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, activeGroupCall(id, 'stale-source-resolution-hash'));
    (manager as any).apiManager.invokeApi.mockReturnValueOnce(pending.promise);

    const lookup = manager.getGroupCallParticipantsBySources(id, [4242]);
    (manager as any).invalidateParticipantFetches(id);
    pending.resolve(groupParticipantsPage([participant]));

    await expect(lookup).resolves.toEqual([]);
    expect((manager as any).appChatsManager.saveApiChats).not.toHaveBeenCalled();
    expect((manager as any).appUsersManager.saveApiUsers).not.toHaveBeenCalled();
  });

  it('does not reject a targeted source slice by the global participant version', async() => {
    const id = 'old-source-resolution-call';
    const participant = groupCallParticipant(42, 4242);
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, activeGroupCall(id, 'old-source-resolution-hash'));
    (manager as any).participantVersions.set(id, 2);
    (manager as any).apiManager.invokeApi.mockResolvedValueOnce(
      groupParticipantsPage([participant], '', 1, 1)
    );

    await expect(manager.getGroupCallParticipantsBySources(id, [4242])).resolves.toEqual([participant]);
    expect((manager as any).appChatsManager.saveApiChats).toHaveBeenCalledWith([]);
    expect((manager as any).appUsersManager.saveApiUsers).toHaveBeenCalledWith([]);
    expect((manager as any).participantVersions.get(id)).toBe(2);
  });

  it('keeps an old include-self roster walk from mutating the rejoined call or deleting its new walk', async() => {
    const id = 'roster-generation-call';
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, activeGroupCall(id, 'roster-generation-hash'));
    const stalePage = deferred<PhoneGroupParticipants>();
    const freshPage = deferred<PhoneGroupParticipants>();
    const joinRpc = deferred<Updates>();
    let rosterRequestCount = 0;
    (manager as any).apiManager.invokeApi.mockImplementation((method: string) => {
      if(method === 'phone.getGroupParticipants') {
        return rosterRequestCount++ === 0 ? stalePage.promise : freshPage.promise;
      }
      if(method === 'phone.joinGroupCall') {
        return joinRpc.promise;
      }
      throw new Error(`Unexpected method ${method}`);
    });

    const staleWalk = manager.refreshConferenceParticipants(id, {includeSelf: true});
    expect(rosterRequestCount).toBe(1);

    const joining = manager.joinGroupCall(id, params, {
      type: 'main',
      isMuted: true,
      joinVideo: false
    });

    // A replacement walk may begin while the join RPC is still pending. The
    // generation bump must therefore happen before invokeApi, not after await.
    const freshWalk = manager.refreshConferenceParticipants(id, {includeSelf: true});
    expect(rosterRequestCount).toBe(2);

    stalePage.resolve(groupParticipantsPage([groupCallParticipant(42, 111, true)]));
    await expect(staleWalk).resolves.toBe(false);
    expect((manager as any).appChatsManager.saveApiChats).not.toHaveBeenCalled();
    expect((manager as any).appUsersManager.saveApiUsers).not.toHaveBeenCalled();
    expect(manager.getCachedParticipants(id).size).toBe(0);

    // The old walk's finally must use promise identity: it must not delete the
    // newer generation's in-flight walk and accidentally start a third request.
    expect(manager.refreshConferenceParticipants(id, {includeSelf: true})).toBe(freshWalk);
    expect(rosterRequestCount).toBe(2);

    joinRpc.resolve(buildUpdatesReply(null));
    await joining;
    freshPage.resolve(groupParticipantsPage([groupCallParticipant(42, 222, true)]));
    await expect(freshWalk).resolves.toEqual({complete: true, userIds: ['42']});
    expect(manager.getCachedParticipants(id).get(42 as PeerId)?.source).toBe(222);
    expect((manager as any).appChatsManager.saveApiChats).toHaveBeenCalledTimes(1);
    expect((manager as any).appUsersManager.saveApiUsers).toHaveBeenCalledTimes(1);
  });

  it('keeps an old recovery getGroupCall page from restoring self or its cursor after a main rejoin', async() => {
    const id = 'full-generation-call';
    const cachedCall = activeGroupCall(id, 'full-generation-hash');
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, cachedCall);
    const fullResponses = [deferred<PhoneGroupCall>(), deferred<PhoneGroupCall>()];
    const fullRequests: any[] = [];
    const joinRpc = deferred<Updates>();
    (manager as any).apiManager.invokeApiSingleProcess = vi.fn((request: any) => {
      const response = fullResponses[fullRequests.length];
      fullRequests.push(request);
      return response.promise.then((result) => request.processResult(result));
    });
    (manager as any).apiManager.invokeApi.mockImplementation((method: string) => {
      if(method === 'phone.joinGroupCall') return joinRpc.promise;
      throw new Error(`Unexpected method ${method}`);
    });

    // The ordinary cached fast path remains untouched; only forced recovery
    // requests enter the generation-specific single-flight bucket.
    await expect(manager.getGroupCallFull(id)).resolves.toBe(cachedCall);
    expect(fullRequests).toHaveLength(0);

    const staleFull = manager.getGroupCallFull(id, true);
    expect(fullRequests).toHaveLength(1);
    const joining = manager.joinGroupCall(id, params, {
      type: 'main',
      isMuted: true,
      joinVideo: false
    });
    const freshFull = manager.getGroupCallFull(id, true);
    expect(fullRequests).toHaveLength(2);
    expect(JSON.parse(fullRequests[0].options.cacheKey)).toEqual([id, 0, 100]);
    expect(JSON.parse(fullRequests[1].options.cacheKey)).toEqual([id, 1, 100]);

    const staleCall = activeGroupCall(id, 'full-generation-hash');
    staleCall.participants_count = 1;
    fullResponses[0].resolve(phoneGroupCallResponse(
      staleCall,
      [groupCallParticipant(42, 111, true)],
      'stale-next'
    ));
    await expect(staleFull).resolves.toBe(cachedCall);
    expect(manager.getCachedParticipants(id).size).toBe(0);
    expect((manager as any).nextOffsets.has(id)).toBe(false);
    expect((manager as any).appChatsManager.saveApiChats).not.toHaveBeenCalled();
    expect((manager as any).appUsersManager.saveApiUsers).not.toHaveBeenCalled();

    joinRpc.resolve(buildUpdatesReply(null));
    await joining;
    const freshCall = activeGroupCall(id, 'full-generation-hash');
    freshCall.participants_count = 1;
    fullResponses[1].resolve(phoneGroupCallResponse(
      freshCall,
      [groupCallParticipant(42, 222, true)],
      'fresh-next'
    ));
    await expect(freshFull).resolves.toBe(cachedCall);
    expect(manager.getCachedParticipants(id).get(42 as PeerId)?.source).toBe(222);
    expect((manager as any).nextOffsets.get(id)).toBe('fresh-next');
  });

  it('does not let an old pagination page restore its cursor or participant rows after a main rejoin', async() => {
    const id = 'pagination-generation-call';
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, activeGroupCall(id, 'pagination-generation-hash'));
    const pageResponses = [deferred<PhoneGroupParticipants>(), deferred<PhoneGroupParticipants>()];
    const pageRequests: any[] = [];
    (manager as any).apiManager.invokeApiSingleProcess = vi.fn((request: any) => {
      const response = pageResponses[pageRequests.length];
      pageRequests.push(request);
      return response.promise.then((result) => request.processResult(result));
    });

    const staleFetch = manager.getGroupCallParticipants(id);
    expect(pageRequests).toHaveLength(1);

    await manager.joinGroupCall(id, params, {
      type: 'main',
      isMuted: true,
      joinVideo: false
    });

    const freshFetch = manager.getGroupCallParticipants(id);
    expect(pageRequests).toHaveLength(2);
    expect(JSON.parse(pageRequests[0].options.cacheKey)).toEqual([id, 0, '']);
    expect(JSON.parse(pageRequests[1].options.cacheKey)).toEqual([id, 1, '']);

    // Resolve the stale page while the replacement page is still pending. The
    // old cursor snapshot is also undefined, so cursor identity alone cannot
    // distinguish the two generations.
    pageResponses[0].resolve(groupParticipantsPage([groupCallParticipant(42, 111, true)]));
    const staleResult = await staleFetch;
    expect((manager as any).nextOffsets.has(id)).toBe(false);
    expect(staleResult.participants.size).toBe(0);

    pageResponses[1].resolve(groupParticipantsPage(
      [groupCallParticipant(42, 222, true)],
      'fresh-next',
      2
    ));
    const freshResult = await freshFetch;
    expect((manager as any).nextOffsets.get(id)).toBe('fresh-next');
    expect(freshResult.isEnd).toBe(false);
    expect(freshResult.participants.get(42 as PeerId)?.source).toBe(222);
  });

  it('does not let a late v2 pagination page overwrite a v3 participant push in the same generation', async() => {
    const id = 'pagination-version-call';
    const call: InputGroupCall.inputGroupCall = {
      _: 'inputGroupCall',
      id,
      access_hash: 'pagination-version-hash'
    };
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, activeGroupCall(id, String(call.access_hash)));
    (manager as any).participantVersions.set(id, 1);
    const page = deferred<PhoneGroupParticipants>();
    (manager as any).apiManager.invokeApiSingleProcess = vi.fn((request: any) => {
      return page.promise.then((result) => request.processResult(result));
    });

    const fetch = manager.getGroupCallParticipants(id);
    expect((manager as any).apiManager.invokeApiSingleProcess).toHaveBeenCalledTimes(1);

    const adminMute = {
      ...groupCallParticipant(42, 333, true),
      pFlags: {self: true, muted: true},
      date: 3
    } as GroupCallParticipant;
    (manager as any).processGroupCallParticipantsUpdate({
      _: 'updateGroupCallParticipants',
      call,
      participants: [adminMute],
      version: 3
    });

    page.resolve(groupParticipantsPage([{
      ...adminMute,
      pFlags: {self: true, can_self_unmute: true},
      date: 2
    }], 'stale-next', 2, 2));
    await fetch;

    const cached = manager.getCachedParticipants(id).get(42 as PeerId);
    expect(cached?.pFlags).toEqual({self: true, muted: true});
    expect(cached?.date).toBe(3);
    expect((manager as any).participantVersions.get(id)).toBe(3);
    expect((manager as any).nextOffsets.has(id)).toBe(false);
    expect((manager as any).appChatsManager.saveApiChats).not.toHaveBeenCalled();
    expect((manager as any).appUsersManager.saveApiUsers).not.toHaveBeenCalled();
  });

  it('does not let a late v2 getGroupCall page overwrite v3 rows, call state, or cursor', async() => {
    const id = 'full-version-call';
    const call: InputGroupCall.inputGroupCall = {
      _: 'inputGroupCall',
      id,
      access_hash: 'full-version-hash'
    };
    const cachedCall = activeGroupCall(id, String(call.access_hash));
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, cachedCall);
    (manager as any).participantVersions.set(id, 1);
    const full = deferred<PhoneGroupCall>();
    (manager as any).apiManager.invokeApiSingleProcess = vi.fn((request: any) => {
      return full.promise.then((result) => request.processResult(result));
    });

    const fetch = manager.getGroupCallFull(id, true);
    expect((manager as any).apiManager.invokeApiSingleProcess).toHaveBeenCalledTimes(1);

    const adminMute = {
      ...groupCallParticipant(42, 333, true),
      pFlags: {self: true, muted: true},
      date: 3
    } as GroupCallParticipant;
    (manager as any).processGroupCallParticipantsUpdate({
      _: 'updateGroupCallParticipants',
      call,
      participants: [adminMute],
      version: 3
    });

    const staleCall = activeGroupCall(id, String(call.access_hash));
    staleCall.version = 2;
    staleCall.participants_count = 99;
    full.resolve(phoneGroupCallResponse(staleCall, [{
      ...adminMute,
      pFlags: {self: true, can_self_unmute: true},
      date: 2
    }], 'stale-next'));
    await expect(fetch).resolves.toBe(cachedCall);

    const cached = manager.getCachedParticipants(id).get(42 as PeerId);
    expect(cached?.pFlags).toEqual({self: true, muted: true});
    expect(cached?.date).toBe(3);
    expect(cachedCall.version).toBe(3);
    expect(cachedCall.participants_count).toBe(0);
    expect((manager as any).participantVersions.get(id)).toBe(3);
    expect((manager as any).nextOffsets.has(id)).toBe(false);
    expect((manager as any).appChatsManager.saveApiChats).not.toHaveBeenCalled();
    expect((manager as any).appUsersManager.saveApiUsers).not.toHaveBeenCalled();
  });

  it('ignores a strictly older active call update while accepting an equal-version batch', () => {
    const id = 'active-call-version';
    const call: InputGroupCall.inputGroupCall = {
      _: 'inputGroupCall',
      id,
      access_hash: 'active-call-version-hash'
    };
    const cachedCall = activeGroupCall(id, String(call.access_hash));
    cachedCall.participants_count = 3;
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, cachedCall);
    (manager as any).participantVersions.set(id, 1);
    (manager as any).processGroupCallParticipantsUpdate({
      _: 'updateGroupCallParticipants',
      call,
      participants: [],
      version: 3
    });

    const staleCall = activeGroupCall(id, String(call.access_hash));
    staleCall.version = 2;
    staleCall.participants_count = 99;
    expect(manager.saveGroupCall(staleCall)).toBe(cachedCall);
    expect(cachedCall.version).toBe(3);
    expect(cachedCall.participants_count).toBe(3);

    const equalCall = activeGroupCall(id, String(call.access_hash));
    equalCall.version = 3;
    equalCall.participants_count = 4;
    equalCall.pFlags.join_muted = true;
    expect(manager.saveGroupCall(equalCall)).toBe(cachedCall);
    expect(cachedCall.participants_count).toBe(4);
    expect(cachedCall.pFlags.join_muted).toBe(true);
  });

  it('does not invalidate the main participant generation for presentation join or leave', async() => {
    const id = 'presentation-generation-call';
    const call: InputGroupCall.inputGroupCall = {
      _: 'inputGroupCall',
      id,
      access_hash: 'presentation-generation-hash'
    };
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    (manager as any).groupCalls.set(id, activeGroupCall(id, String(call.access_hash)));
    const rosterFetch = Promise.resolve(false);
    (manager as any).participantFetchGenerations.set(id, 7);
    (manager as any).nextOffsets.set(id, 'main-cursor');
    (manager as any).conferenceRosterFetches.set(id, rosterFetch);

    await manager.joinGroupCall(id, params, {type: 'presentation'});
    await manager.leaveGroupCallPresentation(call);

    expect((manager as any).participantFetchGenerations.get(id)).toBe(7);
    expect((manager as any).nextOffsets.get(id)).toBe('main-cursor');
    expect((manager as any).conferenceRosterFetches.get(id)).toBe(rosterFetch);
  });
});

describe('AppGroupCallsManager.editParticipant acceptance boundary', () => {
  it('does not report an accepted mute RPC as rejected when local update processing fails', async() => {
    const reply = buildUpdatesReply(null);
    const processError = new Error('local update processing failed');
    const manager = makeManager({
      apiResponse: reply,
      processUpdateMessage: () => {
        throw processError;
      }
    });
    (manager as any).groupCalls = new Map([
      ['42', activeGroupCall('42', 'hash-42')]
    ]);
    (manager as any).apiManager.invokeApiSingle = vi.fn(async() => reply);
    const saveApiParticipant = vi.spyOn(manager, 'saveApiParticipant').mockImplementation(() => {});
    const participant = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: '42'},
      pFlags: {self: true, muted: true, can_self_unmute: true},
      source: 1,
      date: 1
    } as any;

    await expect(manager.editParticipant('42', participant, {muted: true}, false)).resolves.toBeUndefined();

    expect(saveApiParticipant).toHaveBeenCalledWith('42', participant);
    expect((manager as any).log.error).toHaveBeenCalledWith(
      'edit group call participant update processing failed after RPC acceptance',
      processError
    );
  });

  it('does not overwrite a newer admin mute with an older accepted self-unmute snapshot', async() => {
    const reply = buildUpdatesReply(null);
    const rpc = deferred<Updates>();
    const dispatchEvent = vi.fn();
    const manager = makeManager({apiResponse: reply});
    Object.assign(manager as any, {
      groupCalls: new Map([['42', activeGroupCall('42', 'hash-42')]]),
      rootScope: {dispatchEvent}
    });
    (manager as any).apiManager.invokeApiSingle = vi.fn(() => rpc.promise);
    const originalParticipant = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: '42'},
      pFlags: {self: true, muted: true, can_self_unmute: true},
      source: 1,
      date: 1
    } as any;
    manager.saveApiParticipant('42', originalParticipant);
    dispatchEvent.mockClear();

    const acceptedUnmuteSnapshot = {
      ...originalParticipant,
      pFlags: {self: true, can_self_unmute: true}
    };
    const edit = manager.editParticipant('42', acceptedUnmuteSnapshot, {muted: false}, false);
    await vi.waitFor(() => expect((manager as any).apiManager.invokeApiSingle).toHaveBeenCalledTimes(1));

    manager.saveApiParticipant('42', {
      ...originalParticipant,
      pFlags: {self: true, muted: true},
      date: 2
    });
    rpc.resolve(reply);
    await edit;

    const cachedParticipant = (manager as any).participants.get('42').get(42 as PeerId);
    expect(cachedParticipant.pFlags).toEqual({self: true, muted: true});
    expect(cachedParticipant.date).toBe(2);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('does not replay an older self-unmute update after a newer admin-mute push', async() => {
    const call: InputGroupCall.inputGroupCall = {
      _: 'inputGroupCall',
      id: '42',
      access_hash: 'hash-42'
    };
    const staleUnmute = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: '42'},
      pFlags: {self: true, can_self_unmute: true},
      source: 1,
      date: 2
    } as GroupCallParticipant;
    const staleReply: Updates.updates = {
      _: 'updates',
      updates: [{
        _: 'updateGroupCallParticipants',
        call,
        participants: [staleUnmute],
        version: 2
      }],
      users: [],
      chats: [],
      date: 0,
      seq: 0
    };
    const rpc = deferred<Updates>();
    const manager = makeManager({apiResponse: staleReply});
    (manager as any).apiUpdatesManager.processUpdateMessage.mockImplementation((updates: Updates) => {
      const update = (updates as Updates.updates).updates[0];
      if(update._ === 'updateGroupCallParticipants') {
        (manager as any).processGroupCallParticipantsUpdate(update);
      }
    });
    (manager as any).groupCalls.set(call.id, activeGroupCall(call.id, String(call.access_hash)));
    (manager as any).participantVersions.set(call.id, 1);
    (manager as any).apiManager.invokeApiSingle = vi.fn(() => rpc.promise);
    const initialParticipant = {
      ...staleUnmute,
      pFlags: {self: true, muted: true, can_self_unmute: true},
      date: 1
    } as GroupCallParticipant;
    manager.saveApiParticipant(call.id, initialParticipant);

    const edit = manager.editParticipant(call.id, staleUnmute, {muted: false}, false);
    await vi.waitFor(() => expect((manager as any).apiManager.invokeApiSingle).toHaveBeenCalledTimes(1));

    const adminMute = {
      ...initialParticipant,
      pFlags: {self: true, muted: true},
      date: 3
    } as GroupCallParticipant;
    (manager as any).processGroupCallParticipantsUpdate({
      _: 'updateGroupCallParticipants',
      call,
      participants: [adminMute],
      version: 3
    });

    rpc.resolve(staleReply);
    await edit;

    const cachedParticipant = manager.getCachedParticipants(call.id).get(42 as PeerId);
    expect(cachedParticipant?.pFlags).toEqual({self: true, muted: true});
    expect(cachedParticipant?.date).toBe(3);
    expect((manager as any).participantVersions.get(call.id)).toBe(3);
    expect((manager as any).log.warn).toHaveBeenCalledWith(
      'updateGroupCallParticipants: ignored stale version',
      {id: call.id, version: 2, currentVersion: 3}
    );

    (manager as any).processGroupCallParticipantsUpdate({
      _: 'updateGroupCallParticipants',
      call,
      participants: [{...adminMute, date: 4}],
      version: 3
    });
    expect(manager.getCachedParticipants(call.id).get(42 as PeerId)?.date).toBe(4);
  });
});

describe('AppGroupCallsManager phone.getGroupCall saving', () => {
  it('keeps the server participants_count authoritative while importing just-joined rows', async() => {
    const call = activeGroupCall('resolved-id', 'resolved-hash');
    call.participants_count = 1;
    const response = phoneGroupCallResponse(call, [{
      _: 'groupCallParticipant',
      pFlags: {just_joined: true},
      peer: {_: 'peerUser', user_id: 7},
      date: 0,
      source: 1
    }], 'next');
    const manager = new AppGroupCallsManager();
    Object.assign(manager as any, {
      apiManager: {invokeApi: async() => response},
      appUsersManager: {saveApiUsers: () => {}},
      appChatsManager: {saveApiChats: () => {}},
      rootScope: {dispatchEvent: () => {}},
      conferenceRosterFetches: new Map(),
      groupCalls: new Map(),
      participants: new Map(),
      nextOffsets: new Map(),
      participantFetchGenerations: new Map(),
      participantVersions: new Map()
    });
    const staleRosterFetch = Promise.resolve(false);
    (manager as any).conferenceRosterFetches.set(call.id, staleRosterFetch);
    (manager as any).nextOffsets.set(call.id, 'stale-next');

    const resolved = await manager.resolveConferenceCall({_: 'inputGroupCallSlug', slug: 'conference'});

    if(resolved._ !== 'groupCall') throw new Error('Expected an active group call');
    expect(resolved.participants_count).toBe(1);
    expect((manager as any).nextOffsets.get('resolved-id')).toBe('next');
    expect((manager as any).participants.get('resolved-id').size).toBe(1);
    expect((manager as any).participantFetchGenerations.get('resolved-id')).toBe(1);
    expect((manager as any).conferenceRosterFetches.has('resolved-id')).toBe(false);
  });
});

describe('AppGroupCallsManager RTMP state cache', () => {
  it('returns the cleanup-tracked rejection so callers can observe it without a detached rejection', async() => {
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    const fetchError = new Error('RTMP state fetch failed');
    const rawFetch = deferred<never>();
    vi.spyOn(manager, '_fetchRtmpState').mockReturnValue(rawFetch.promise);
    const call: InputGroupCall.inputGroupCall = {
      _: 'inputGroupCall',
      id: 'rtmp-call',
      access_hash: 'rtmp-call-hash'
    };

    const fetch = manager.fetchRtmpState(call);
    const cachedFetch = manager.fetchRtmpState(call);
    const rejection = expect(fetch).rejects.toBe(fetchError);

    expect(cachedFetch).toBe(fetch);
    rawFetch.reject(fetchError);
    await rejection;
  });
});

describe('AppGroupCallsManager accepted termination cleanup', () => {
  const mutationCases: Array<{
    context: string,
    run: (manager: AppGroupCallsManager, call: InputGroupCall.inputGroupCall) => Promise<unknown>
  }> = [{
    context: 'leave group call presentation',
    run: (manager, call) => manager.leaveGroupCallPresentation(call)
  }, {
    context: 'terminate group call',
    run: (manager, call) => manager.leaveGroupCall(call, 777)
  }, {
    context: 'terminate group call',
    run: (manager, call) => manager.discardGroupCall(call)
  }, {
    context: 'start group call recording',
    run: (manager, call) => manager.startRecording(call, {
      name: 'recording',
      recordVideo: true,
      videoHorizontal: true
    })
  }, {
    context: 'stop group call recording',
    run: (manager, call) => manager.stopRecording(call)
  }, {
    context: 'toggle group call settings',
    run: (manager, call) => {
      (manager as any).groupCalls = new Map([[call.id, activeGroupCall(call.id, String(call.access_hash))]]);
      return manager.toggleGroupCallSettings(call.id, {joinMuted: true});
    }
  }];
  const acceptedTerminationCases = mutationCases.slice(0, 3);
  const directUpdateProcessingCases = mutationCases.slice(3);

  it('does not report an accepted presentation leave as rejected when update processing fails', async() => {
    const processingError = new Error('local presentation update processing failed');
    const manager = makeManager({
      apiResponse: buildUpdatesReply(null),
      processUpdateMessage: () => {
        throw processingError;
      }
    });
    const call: InputGroupCall.inputGroupCall = {
      _: 'inputGroupCall',
      id: 'presentation-call',
      access_hash: 'presentation-hash'
    };

    await expect(manager.leaveGroupCallPresentation(call)).resolves.toBeUndefined();

    expect((manager as any).apiManager.invokeApi).toHaveBeenCalledWith(
      'phone.leaveGroupCallPresentation',
      {call}
    );
    expect((manager as any).log.error).toHaveBeenCalledWith(
      'leave group call presentation update processing failed after RPC acceptance',
      processingError
    );
  });

  it('keeps an accepted leave successful and clears caches when update processing throws', async() => {
    const processingError = new Error('local update processing failed');
    const manager = makeManager({
      apiResponse: buildUpdatesReply(null),
      processUpdateMessage: () => {
        throw processingError;
      }
    });
    const call: InputGroupCall.inputGroupCall = {
      _: 'inputGroupCall',
      id: 'terminated-call',
      access_hash: 'terminated-hash'
    };
    (manager as any).nextOffsets.set(call.id, 'finished');
    (manager as any).participants.set(call.id, new Map([[1, {peer: {_: 'peerUser', user_id: 1}}]]));
    (manager as any).participantFetchGenerations.set(call.id, 4);
    (manager as any).conferenceRosterFetches.set(call.id, Promise.resolve(false));

    await expect(manager.leaveGroupCall(call, 777)).resolves.toBeUndefined();

    expect((manager as any).nextOffsets.has(call.id)).toBe(false);
    expect((manager as any).participants.has(call.id)).toBe(false);
    expect((manager as any).participantFetchGenerations.get(call.id)).toBe(5);
    expect((manager as any).conferenceRosterFetches.has(call.id)).toBe(false);
    expect((manager as any).log.error).toHaveBeenCalledWith(
      'terminate group call update processing failed after RPC acceptance',
      processingError
    );
  });

  it.each(acceptedTerminationCases)(
    'does not reject an accepted $context mutation on local processing failure',
    async({context, run}) => {
      const processingError = new Error(`${context} local processing failed`);
      const manager = makeManager({
        apiResponse: buildUpdatesReply(null),
        processUpdateMessage: () => {
          throw processingError;
        }
      });
      const call: InputGroupCall.inputGroupCall = {
        _: 'inputGroupCall',
        id: 'accepted-mutation',
        access_hash: 'accepted-mutation-hash'
      };

      await expect(run(manager, call)).resolves.toBeUndefined();

      expect((manager as any).apiManager.invokeApi).toHaveBeenCalledTimes(1);
      expect((manager as any).log.error).toHaveBeenCalledWith(
        `${context} update processing failed after RPC acceptance`,
        processingError
      );
    }
  );

  it.each(directUpdateProcessingCases)(
    'propagates a local $context update-processing failure',
    async({context, run}) => {
      const processingError = new Error(`${context} local processing failed`);
      const manager = makeManager({
        apiResponse: buildUpdatesReply(null),
        processUpdateMessage: () => {
          throw processingError;
        }
      });
      const call: InputGroupCall.inputGroupCall = {
        _: 'inputGroupCall',
        id: 'accepted-mutation',
        access_hash: 'accepted-mutation-hash'
      };

      await expect(run(manager, call)).rejects.toBe(processingError);

      expect((manager as any).apiManager.invokeApi).toHaveBeenCalledTimes(1);
      expect((manager as any).apiUpdatesManager.processUpdateMessage).toHaveBeenCalledWith(
        buildUpdatesReply(null)
      );
    }
  );

  it.each(mutationCases)(
    'preserves a pre-accept $context RPC rejection',
    async({run}) => {
      const manager = makeManager({apiResponse: buildUpdatesReply(null)});
      const rpcError = new Error('RPC rejected before acceptance');
      (manager as any).apiManager.invokeApi.mockRejectedValueOnce(rpcError);
      const call: InputGroupCall.inputGroupCall = {
        _: 'inputGroupCall',
        id: 'rejected-mutation',
        access_hash: 'rejected-mutation-hash'
      };

      await expect(run(manager, call)).rejects.toBe(rpcError);

      expect((manager as any).apiUpdatesManager.processUpdateMessage).not.toHaveBeenCalled();
    }
  );
});

describe('AppGroupCallsManager accepted create compensation', () => {
  it('discards the exact accepted group call when local create processing fails', async() => {
    const call = activeGroupCall('created-call', 'created-call-hash');
    const response: Updates.updateShort = {
      _: 'updateShort',
      update: groupCallUpdate(call),
      date: 1
    };
    const processingError = new Error('local create update processing failed');
    let processCalls = 0;
    const manager = makeManager({
      apiResponse: response,
      processUpdateMessage: () => {
        if(processCalls++ === 0) throw processingError;
      }
    });

    await expect(manager.createGroupCall(7 as ChatId)).rejects.toBe(processingError);

    expect((manager as any).apiManager.invokeApi).toHaveBeenNthCalledWith(2, 'phone.discardGroupCall', {
      call: {_: 'inputGroupCall', id: call.id, access_hash: call.access_hash}
    });
  });
});

describe('AppGroupCallsManager participant rows', () => {
  function fullRow(userId: number, extra: Partial<GroupCallParticipant> = {}): GroupCallParticipant {
    return {...groupCallParticipant(userId, 100), ...extra};
  }

  function minRow(userId: number, extra: Partial<GroupCallParticipant> = {}): GroupCallParticipant {
    return {...groupCallParticipant(userId, 100), ...extra, pFlags: {min: true, ...extra.pFlags}};
  }

  it('keeps the viewer-personal fields of a cached row when a min row arrives', () => {
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    manager.saveGroupCall(activeGroupCall('rows', 'hash'));
    manager.saveApiParticipant('rows', fullRow(7, {pFlags: {muted_by_you: true}, volume: 5000}));

    manager.saveApiParticipant('rows', minRow(7, {pFlags: {muted: true}, volume: 10000}));

    const cached = manager.getCachedParticipants('rows').get(7 as PeerId);
    expect(cached.pFlags.muted).toBe(true);
    expect(cached.pFlags.muted_by_you).toBe(true);
    expect(cached.pFlags.volume_by_admin).toBeUndefined();
    expect(cached.volume).toBe(5000);
  });

  it('applies an admin-set volume from a min row and lets a full row replace the personal fields', () => {
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    manager.saveGroupCall(activeGroupCall('rows', 'hash'));
    manager.saveApiParticipant('rows', fullRow(7, {pFlags: {volume_by_admin: true}, volume: 3000}));

    manager.saveApiParticipant('rows', minRow(7, {volume: 8000}));
    expect(manager.getCachedParticipants('rows').get(7 as PeerId).volume).toBe(8000);

    manager.saveApiParticipant('rows', fullRow(7));
    const cached = manager.getCachedParticipants('rows').get(7 as PeerId);
    expect(cached.volume).toBeUndefined();
    expect(cached.pFlags.volume_by_admin).toBeUndefined();
    expect(cached.pFlags.muted_by_you).toBeUndefined();
  });

  it('clamps participants_count at zero and takes the count an updateGroupCall carries', () => {
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    manager.saveGroupCall(activeGroupCall('count', 'hash'));
    // A poll row carries no `just_joined`, so its join was never counted.
    manager.saveApiParticipant('count', fullRow(7));

    manager.saveApiParticipant('count', fullRow(7, {pFlags: {left: true}}));
    expect((manager.getGroupCall('count') as GroupCall.groupCall).participants_count).toBe(0);

    manager.saveGroupCall({...activeGroupCall('count', 'hash'), participants_count: 3, version: 2});
    expect((manager.getGroupCall('count') as GroupCall.groupCall).participants_count).toBe(3);
  });
});

describe('AppGroupCallsManager RTMP state migrations', () => {
  const call: InputGroupCall.inputGroupCall = {_: 'inputGroupCall', id: 'rtmp', access_hash: 'rtmp-hash'};

  function makeRtmpManager(answer: (dcId: number) => Promise<unknown>) {
    const manager = makeManager({apiResponse: buildUpdatesReply(null)});
    vi.spyOn(manager, 'getGroupCallFull').mockResolvedValue({
      ...activeGroupCall('rtmp', 'rtmp-hash'),
      stream_dc_id: 2
    });
    const invokeApi = vi.fn((_method: string, _params: unknown, options: {dcId: number}) => answer(options.dcId));
    (manager as any).apiManager = {invokeApi};
    return {manager, invokeApi};
  }

  const migrate = (dcId: number) => Object.assign(new Error(`CALL_MIGRATE_${dcId}`), {type: `CALL_MIGRATE_${dcId}`});

  it('follows a migration to the named DC', async() => {
    const {manager, invokeApi} = makeRtmpManager(async(dcId) => {
      if(dcId === 2) throw migrate(4);
      return {channels: []};
    });

    await expect(manager._fetchRtmpState(call)).resolves.toMatchObject({dcId: 4});
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });

  it('stops when the server names the DC it just answered from', async() => {
    const {manager, invokeApi} = makeRtmpManager(async() => {
      throw migrate(2);
    });

    await expect(manager._fetchRtmpState(call)).rejects.toMatchObject({type: 'CALL_MIGRATE_2'});
    expect(invokeApi).toHaveBeenCalledTimes(1);
  });

  it('bounds a chain of migrations', async() => {
    const {manager, invokeApi} = makeRtmpManager(async(dcId) => {
      throw migrate(dcId + 1);
    });

    await expect(manager._fetchRtmpState(call)).rejects.toMatchObject({type: 'CALL_MIGRATE_6'});
    expect(invokeApi).toHaveBeenCalledTimes(4);
  });

  it('rejects a bare CALL_MIGRATE_ instead of crashing on it', async() => {
    const {manager, invokeApi} = makeRtmpManager(async() => {
      throw Object.assign(new Error('CALL_MIGRATE_'), {type: 'CALL_MIGRATE_'});
    });

    await expect(manager._fetchRtmpState(call)).rejects.toMatchObject({type: 'CALL_MIGRATE_'});
    expect(invokeApi).toHaveBeenCalledTimes(1);
  });
});
