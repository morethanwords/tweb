/*
 * Regression cover for the "hidden e2e listener" class of conference bug.
 *
 * A TdE2E conference's blockchain is the access list — a participant in
 * `group_state` holds the current shared key whether or not the server lists
 * them on the SFU roster. `external_permissions` grants Add|Remove to
 * non-members, and `applyBlock` authorises a block's `setSharedKey` against the
 * POST-change state, so a self-add signed by ANY key both joins the chain and
 * mints the next shared key addressed to itself. A backend that appends such a
 * block and then omits the identity from `phone.getGroupParticipants` used to
 * get a silent listener: WebK accepted the block, adopted the key, and rendered
 * only the server-reported roster. Emoji verification didn't expose it either —
 * a cooperative hidden member completes commit/reveal like anyone else.
 *
 * The protocol's answer (core.telegram.org/api/end-to-end/group-calls#stale-
 * pruning-only-left, and tdlib Encryption.md's "the blockchain state must be
 * explicitly displayed in the UI, even when the server withholds information
 * about certain participants") has two halves, and these tests pin both:
 *   1. chain-only identities are SHOWN, immediately and until removal lands;
 *   2. they are REMOVED with `only_left`, in a block that rotates the key to
 *      the survivors only.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

// Stub the e2e worker host so importing GroupCallInstance (→ groupCallsController
// → encryptWorkerHost → `?worker`) doesn't try to spawn a real Web Worker.
vi.mock('@lib/calls/e2e/encryptWorkerHost', () => {
  class EncryptWorkerHost {
    public async terminate(): Promise<void> {}
  }
  return {EncryptWorkerHost};
});

import GroupCallInstance from '@lib/calls/groupCallInstance';
import {AppGroupCallsManager} from '@lib/appManagers/appGroupCallsManager';
import {
  conferenceUserIdToPeerId,
  findChainOnlyMembers,
  pruneGroupState
} from '@lib/calls/e2e/conferenceMembership';
import type {GroupParticipant, GroupState} from '@lib/calls/e2e/tlTypes';

const ALICE = BigInt(93001); // us
const CAROL = BigInt(93002); // honest, on the roster
const EVE = BigInt(93003); // backend-injected, withheld from the roster

const CALL_ID = '777' as any;
const FAKE_CALL = {_: 'groupCall', id: '777', access_hash: '888'} as any;

function participantFor(userId: bigint): GroupParticipant {
  return {
    userId,
    publicKey: new Uint8Array(32).fill(Number(userId % BigInt(251))),
    canAddUsers: true,
    canRemoveUsers: true,
    version: 0
  };
}

function groupStateOf(...userIds: bigint[]): GroupState {
  return {participants: userIds.map(participantFor), externalPermissions: 3};
}

// What the manager hands the tab: exact decimal user ids, not PeerIds.
function rosterOf(...userIds: bigint[]) {
  return userIds.map(String);
}

describe('findChainOnlyMembers', () => {
  it('flags an authenticated member the complete roster omits', () => {
    expect(findChainOnlyMembers({
      participants: groupStateOf(ALICE, CAROL, EVE).participants,
      rosterUserIds: rosterOf(ALICE, CAROL),
      selfUserId: ALICE
    })).toEqual([EVE]);
  });

  it('never flags ourselves — our own SFU row lags the chain on the invitee path', () => {
    expect(findChainOnlyMembers({
      participants: groupStateOf(ALICE, CAROL).participants,
      rosterUserIds: rosterOf(CAROL),
      selfUserId: ALICE
    })).toEqual([]);
  });

  it('flags nothing when the roster covers the chain', () => {
    expect(findChainOnlyMembers({
      participants: groupStateOf(ALICE, CAROL).participants,
      rosterUserIds: rosterOf(ALICE, CAROL),
      selfUserId: ALICE
    })).toEqual([]);
  });

  it('compares exact ids, so a hidden member cannot hide behind a rounding collision', () => {
    // PeerId is a JS number. Above 2^53 distinct int64 user ids share a double,
    // and the server picks BOTH the chain ids and the roster ids — so diffing in
    // PeerId space would let it park a junk roster row on the value the hidden
    // chain member rounds to and make it disappear again.
    const hidden = BigInt('9007199254740993'); // 2^53 + 1
    const decoy = BigInt('9007199254740992'); // 2^53 — same double
    expect(conferenceUserIdToPeerId(hidden)).toBe(conferenceUserIdToPeerId(decoy));

    expect(findChainOnlyMembers({
      participants: [participantFor(ALICE), participantFor(hidden)],
      rosterUserIds: rosterOf(ALICE, decoy),
      selfUserId: ALICE
    })).toEqual([hidden]);
  });

  it('dedupes so a malformed group_state cannot produce a repeated removal', () => {
    expect(findChainOnlyMembers({
      participants: [participantFor(EVE), participantFor(EVE)],
      rosterUserIds: rosterOf(ALICE),
      selfUserId: ALICE
    })).toEqual([EVE]);
  });
});

describe('pruneGroupState', () => {
  it('drops only the stale identities and preserves external_permissions', () => {
    const pruned = pruneGroupState(groupStateOf(ALICE, CAROL, EVE), [EVE]);
    expect(pruned.participants.map(({userId}) => userId)).toEqual([ALICE, CAROL]);
    // Lowering these would silently change the call's join policy; raising them
    // is rejected by authorizeSetGroupState anyway.
    expect(pruned.externalPermissions).toBe(3);
  });
});

// Let a detached removal (see `pruneConferenceMembers`) reach its RPC before we
// assert it did NOT happen.
const flushPending = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeConference() {
  const buildChangeStateBlock = vi.fn(async() => new Uint8Array([0xb6, 0x3d, 0x9a, 0x63]));
  const deleteConferenceCallParticipants = vi.fn(async() => ({}));
  const refreshConferenceParticipants = vi.fn();
  const cachedParticipants = new Map<PeerId, any>();

  const managers: any = {
    appGroupCallsManager: {
      refreshConferenceParticipants,
      getCachedParticipants: vi.fn(async() => cachedParticipants),
      getGroupCallFull: vi.fn(async() => FAKE_CALL),
      saveGroupCall: vi.fn(async() => {})
    },
    appCallsManager: {deleteConferenceCallParticipants},
    apiUpdatesManager: {processUpdateMessage: () => {}}
  };

  const instance = new GroupCallInstance({id: CALL_ID, chatId: 0 as any, managers});
  // connectionState + streamManager getters read through connections.main.
  (instance as any).connections = {
    main: {connection: {iceConnectionState: 'connected'}, streamManager: {stop: vi.fn()}}
  };
  (instance as any).groupCall = FAKE_CALL;
  (instance as any).e2e = {buildChangeStateBlock, terminate: vi.fn(async() => {})};
  (instance as any).selfUserId = ALICE;
  (instance as any).e2eStatus = {groupState: groupStateOf(ALICE, CAROL, EVE)};

  const reconcile = (rosterUserIds: string[]) =>
    (instance as any).reconcileConferenceMembership(rosterUserIds) as Promise<void>;

  // Jump every pending identity past the grace window without waiting it out.
  const expireGrace = () => {
    const staleSince: Map<string, number> = (instance as any).staleSince;
    staleSince.forEach((_, key) => staleSince.set(key, 0));
  };

  return {
    instance,
    reconcile,
    expireGrace,
    cachedParticipants,
    buildChangeStateBlock,
    deleteConferenceCallParticipants,
    refreshConferenceParticipants
  };
}

describe('AppGroupCallsManager.refreshConferenceParticipants — roster snapshot', () => {
  function makeManager() {
    const invokeApiSingleProcess = vi.fn(async(request: any) => request.processResult({
      participants: [
        {_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: ALICE.toString()}, pFlags: {self: true}, source: 1, date: 1},
        {_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: CAROL.toString()}, pFlags: {}, source: 2, date: 1}
      ],
      count: 2,
      next_offset: '',
      chats: [],
      users: []
    }));

    const manager = Object.create(AppGroupCallsManager.prototype) as AppGroupCallsManager;
    Object.assign(manager as any, {
      groupCalls: new Map([[CALL_ID, {_: 'groupCall', id: '777', access_hash: '888', participants_count: 2}]]),
      participants: new Map([[CALL_ID, new Map()]]),
      nextOffsets: new Map(),
      appChatsManager: {saveApiChats: vi.fn()},
      appUsersManager: {saveApiUsers: vi.fn()},
      rootScope: {dispatchEvent: vi.fn()},
      apiManager: {invokeApiSingleProcess}
    });
    return {manager, invokeApiSingleProcess};
  }

  it('resolves to what the server listed, so the tab can diff it against the chain', async() => {
    const {manager} = makeManager();

    await expect(manager.refreshConferenceParticipants(CALL_ID)).resolves.toEqual({
      complete: true,
      userIds: rosterOf(ALICE, CAROL)
    });
  });

  it('carries the snapshot as the resolved VALUE, not a closure written by processResult', async() => {
    const {manager, invokeApiSingleProcess} = makeManager();

    // invokeApiSingleProcess dedupes by (method, cacheKey) and hands a second
    // caller the in-flight promise WITHOUT re-running its processResult. A
    // snapshot published through a closure variable would come back undefined
    // there — and an undefined snapshot silently skips a round of membership
    // reconciliation, which is the whole point of this call.
    await manager.refreshConferenceParticipants(CALL_ID);
    const request = invokeApiSingleProcess.mock.calls[0][0] as any;

    expect(await request.processResult({
      participants: [{_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: CAROL.toString()}, pFlags: {}, source: 2, date: 1}],
      count: 1,
      next_offset: '',
      chats: [],
      users: []
    })).toEqual({complete: true, userIds: rosterOf(CAROL)});
  });

  it('uses its own dedup bucket so it cannot share a promise with the paginating fetch', async() => {
    const {manager, invokeApiSingleProcess} = makeManager();
    await manager.refreshConferenceParticipants(CALL_ID);

    const request = invokeApiSingleProcess.mock.calls[0][0] as any;
    // The default key is JSON.stringify(params), byte-identical to
    // getGroupCallParticipants' first page (same call, empty ids/sources,
    // offset ''). Sharing it makes whichever lands second skip its own
    // processResult entirely.
    expect(request.options?.cacheKey).toBe('refreshConferenceParticipants-' + CALL_ID);
  });

  it('reports an incomplete page as incomplete', async() => {
    const {manager, invokeApiSingleProcess} = makeManager();
    await manager.refreshConferenceParticipants(CALL_ID);
    const request = invokeApiSingleProcess.mock.calls[0][0] as any;

    // A full page with more to come: "absent" here only means "on a later page".
    const participants = Array.from({length: 100}, (_, i) => ({
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(90000 + i)},
      pFlags: {},
      source: i + 1,
      date: 1
    }));
    const snapshot = await request.processResult({
      participants,
      count: 250,
      next_offset: 'more',
      chats: [],
      users: []
    });

    expect(snapshot.complete).toBe(false);
    expect(snapshot.userIds).toHaveLength(100);
  });
});

describe('GroupCallInstance — chain-only conference members', () => {
  beforeEach(() => {
    (self as any).__conferenceBug = undefined;
    (self as any).__conferenceBugs = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // jsdom has no real <audio>.play(); the constructor's fixSafariAudio calls it.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('surfaces a member the roster withholds — immediately, before any removal', async() => {
    const {instance, reconcile, deleteConferenceCallParticipants} = makeConference();
    const seen: Array<{current: PeerId[], previous: PeerId[]}> = [];
    instance.addEventListener('membersWithAccess', (change) => seen.push(change));

    await reconcile(rosterOf(ALICE, CAROL));

    const evePeerId = conferenceUserIdToPeerId(EVE);
    expect(instance.memberWithAccessPeerIds).toEqual([evePeerId]);
    expect(instance.isMemberWithAccess(evePeerId)).toBe(true);
    expect(seen).toEqual([{current: [evePeerId], previous: []}]);
    // The row must be renderable through the ordinary participant path.
    await expect(instance.getParticipantByPeerId(evePeerId)).resolves.toMatchObject({
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: EVE.toString()},
      source: 0
    });
    // Disclosure happens first; removal waits out the grace window.
    expect(deleteConferenceCallParticipants).not.toHaveBeenCalled();
  });

  it('removes with only_left and rekeys to the survivors once the grace window passes', async() => {
    const {reconcile, expireGrace, buildChangeStateBlock, deleteConferenceCallParticipants} = makeConference();

    await reconcile(rosterOf(ALICE, CAROL));
    expireGrace();
    await reconcile(rosterOf(ALICE, CAROL));
    // The removal runs detached from the roster poller, so let it settle.
    await vi.waitFor(() => expect(deleteConferenceCallParticipants).toHaveBeenCalled());

    // The block is what rotates the key: buildChangesForNewState mints a fresh
    // shared key addressed to exactly these participants, so Eve's copy of the
    // current key stops working at this block.
    expect(buildChangeStateBlock).toHaveBeenCalledWith({
      newGroupState: {
        participants: [participantFor(ALICE), participantFor(CAROL)],
        externalPermissions: 3
      }
    });
    expect(deleteConferenceCallParticipants).toHaveBeenCalledWith({
      call: {_: 'inputGroupCall', id: '777', access_hash: '888'},
      ids: [EVE.toString()],
      block: new Uint8Array([0xb6, 0x3d, 0x9a, 0x63]),
      onlyLeft: true
    });
  });

  it('does not remove a chain member the SFU has simply not listed yet', async() => {
    const {reconcile, deleteConferenceCallParticipants} = makeConference();

    // A real joiner is on the chain the moment their block is accepted; the SFU
    // can list them a beat later. Repeated passes inside the window must not
    // kick them out of the call they just joined.
    await reconcile(rosterOf(ALICE, CAROL));
    await reconcile(rosterOf(ALICE, CAROL));
    await reconcile(rosterOf(ALICE, CAROL));
    await flushPending();

    expect(deleteConferenceCallParticipants).not.toHaveBeenCalled();
  });

  it('does not burn a block when the identity is already off the chain', async() => {
    const {instance, buildChangeStateBlock, deleteConferenceCallParticipants} = makeConference();
    // Another client (or an earlier attempt) pruned Eve first.
    (instance as any).e2eStatus = {groupState: groupStateOf(ALICE, CAROL)};

    await (instance as any).pruneConferenceMembers([EVE]);

    expect(buildChangeStateBlock).not.toHaveBeenCalled();
    expect(deleteConferenceCallParticipants).not.toHaveBeenCalled();
  });

  it('restarts the window when the member shows up on the roster again', async() => {
    const {instance, reconcile, expireGrace, deleteConferenceCallParticipants} = makeConference();

    await reconcile(rosterOf(ALICE, CAROL));
    expireGrace();
    // Eve turned out to be a real joiner: the next complete roster lists her.
    await reconcile(rosterOf(ALICE, CAROL, EVE));
    await flushPending();

    expect(instance.memberWithAccessPeerIds).toEqual([]);
    expect((instance as any).staleSince.size).toBe(0);
    expect(deleteConferenceCallParticipants).not.toHaveBeenCalled();
  });

  it('ignores a truncated roster page entirely', async() => {
    const {instance, refreshConferenceParticipants, deleteConferenceCallParticipants} = makeConference();
    refreshConferenceParticipants.mockResolvedValue({complete: false, userIds: rosterOf(ALICE)});

    await (instance as any).refreshConferenceParticipants();

    // "Absent from page 1" is not "absent from the call" — it must drive
    // neither the access list nor a removal.
    expect(instance.memberWithAccessPeerIds).toEqual([]);
    expect(deleteConferenceCallParticipants).not.toHaveBeenCalled();
    // The fetch still counts for the stall watchdog.
    expect((instance as any).lastParticipantsRefreshAt).toBeGreaterThan(0);
  });

  it('reconciles off a complete roster returned by the poller', async() => {
    const {instance, refreshConferenceParticipants} = makeConference();
    refreshConferenceParticipants.mockResolvedValue({complete: true, userIds: rosterOf(ALICE, CAROL)});

    await (instance as any).refreshConferenceParticipants();

    expect(instance.memberWithAccessPeerIds).toEqual([conferenceUserIdToPeerId(EVE)]);
  });

  it('keeps the identity visible and reports a bug when removal keeps being refused', async() => {
    const {instance, deleteConferenceCallParticipants} = makeConference();
    deleteConferenceCallParticipants.mockRejectedValue({type: 'GROUPCALL_INVALID'});

    (instance as any).publishMembersWithAccess([EVE]);
    for(let attempt = 0; attempt < 3; ++attempt) {
      await (instance as any).pruneConferenceMembers([EVE]);
    }

    // A relay that injects a member and then refuses to let it be pruned is the
    // hostile case — the user must be able to see both halves of it.
    expect(instance.memberWithAccessPeerIds).toEqual([conferenceUserIdToPeerId(EVE)]);
    expect((self as any).__conferenceBug?.reason).toMatch(/still hold the call key/i);
  });

  it('treats a chain race as benign and retries rather than reporting', async() => {
    const {instance, deleteConferenceCallParticipants} = makeConference();
    deleteConferenceCallParticipants.mockRejectedValue({type: 'CONF_WRITE_CHAIN_INVALID'});

    await (instance as any).pruneConferenceMembers([EVE]);

    expect((self as any).__conferenceBug).toBeUndefined();
    expect((instance as any).consecutivePruneFailures).toBe(1);
  });

  it('reconciles at join time, before the media connection exists', async() => {
    const {instance, reconcile, refreshConferenceParticipants} = makeConference();
    // attachE2e starts the pollers, and `worker.init`'s first `status` event
    // drives a roster refresh — both BEFORE createConnectionInstance sets
    // connections.main. Reading connectionState used to throw a TypeError here,
    // which killed the very first membership reconciliation of the call.
    (instance as any).connections = {};
    refreshConferenceParticipants.mockResolvedValue({complete: true, userIds: rosterOf(ALICE, CAROL)});

    await expect((instance as any).refreshConferenceParticipants()).resolves.toBeUndefined();
    expect(instance.memberWithAccessPeerIds).toEqual([conferenceUserIdToPeerId(EVE)]);

    await reconcile(rosterOf(ALICE, CAROL));
    expect(instance.memberWithAccessPeerIds).toEqual([conferenceUserIdToPeerId(EVE)]);
  });

  it('reports rather than silently merging two members that share one displayed peer', async() => {
    const {instance, reconcile} = makeConference();
    const hidden = BigInt('9007199254740993');
    const decoy = BigInt('9007199254740992');
    (instance as any).e2eStatus = {groupState: groupStateOf(ALICE, hidden, decoy)};

    await reconcile(rosterOf(ALICE));

    // Both are flagged for removal (that works off exact ids), but the roster
    // list is keyed by PeerId and can only carry one row for the pair.
    expect(instance.memberWithAccessPeerIds).toHaveLength(1);
    expect((self as any).__conferenceBug?.reason).toMatch(/share one displayed peer/i);
  });

  it('drops the chain-only set when the call is torn down', async() => {
    const {instance, reconcile} = makeConference();
    await reconcile(rosterOf(ALICE, CAROL));
    expect(instance.memberWithAccessPeerIds).toHaveLength(1);

    instance.cleanup();

    expect(instance.memberWithAccessPeerIds).toEqual([]);
    expect((instance as any).staleSince.size).toBe(0);
  });
});
