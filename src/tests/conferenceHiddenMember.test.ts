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
  const buildRemoveParticipantsBlock = vi.fn(async() => ({
    block: new Uint8Array([0xb6, 0x3d, 0x9a, 0x63]),
    removedUserIds: [EVE]
  }));
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
  (instance as any).e2e = {buildRemoveParticipantsBlock, terminate: vi.fn(async() => {})};
  (instance as any).selfUserId = ALICE;
  (instance as any).e2eStatus = {groupState: groupStateOf(ALICE, CAROL, EVE)};

  const reconcile = (rosterUserIds: string[]) =>
    (instance as any).reconcileConferenceMembership(rosterUserIds) as Promise<void>;

  // Jump every pending identity past the grace window without waiting it out.
  const expireGrace = () => {
    const staleSince: Map<string, number> = (instance as any).staleSince;
    staleSince.forEach((_, key) => staleSince.set(key, performance.now() - 10001));
  };

  return {
    instance,
    reconcile,
    expireGrace,
    cachedParticipants,
    buildRemoveParticipantsBlock,
    deleteConferenceCallParticipants,
    refreshConferenceParticipants
  };
}

describe('AppGroupCallsManager.refreshConferenceParticipants — roster snapshot', () => {
  // Each call to the mock returns the next queued page.
  function makeManager(pages?: any[]) {
    const queue = pages ?? [{
      participants: [
        {_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: ALICE.toString()}, pFlags: {self: true}, source: 1, date: 1},
        {_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: CAROL.toString()}, pFlags: {}, source: 2, date: 1}
      ],
      count: 2,
      next_offset: '',
      chats: [] as any[],
      users: [] as any[]
    }];

    let page = 0;
    const invokeApi = vi.fn(async(_method: string, _params: any) => {
      return queue[Math.min(page++, queue.length - 1)];
    });

    const manager = Object.create(AppGroupCallsManager.prototype) as AppGroupCallsManager;
    Object.assign(manager as any, {
      groupCalls: new Map([[CALL_ID, {_: 'groupCall', id: '777', access_hash: '888', participants_count: 2}]]),
      participants: new Map([[CALL_ID, new Map()]]),
      nextOffsets: new Map(),
      conferenceRosterFetches: new Map(),
      participantFetchGenerations: new Map(),
      participantVersions: new Map(),
      participantRevisions: new WeakMap(),
      appChatsManager: {saveApiChats: vi.fn()},
      appUsersManager: {saveApiUsers: vi.fn()},
      rootScope: {dispatchEvent: vi.fn(), myId: 4242 as PeerId},
      apiManager: {invokeApi},
      log: Object.assign(() => {}, {warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn()})
    });
    return {manager, invokeApi};
  }

  function fullPage(from: number, nextOffset: string) {
    return {
      participants: Array.from({length: 100}, (_, i) => ({
        _: 'groupCallParticipant',
        peer: {_: 'peerUser', user_id: String(from + i)},
        pFlags: {},
        source: i + 1,
        date: 1
      })),
      count: 10000,
      next_offset: nextOffset,
      version: 1,
      chats: [] as any[],
      users: [] as any[]
    };
  }

  it('resolves to what the server listed, so the tab can diff it against the chain', async() => {
    const {manager} = makeManager();

    await expect(manager.refreshConferenceParticipants(CALL_ID)).resolves.toEqual({
      complete: true,
      userIds: rosterOf(ALICE, CAROL)
    });
  });

  it('de-dupes concurrent walks so the pollers cannot stack requests', async() => {
    const {manager, invokeApi} = makeManager();

    const [a, b] = await Promise.all([
      manager.refreshConferenceParticipants(CALL_ID),
      manager.refreshConferenceParticipants(CALL_ID)
    ]);

    expect(a).toEqual(b);
    expect(invokeApi).toHaveBeenCalledTimes(1);
  });

  it('pages until a short page, so completeness is observed rather than claimed', async() => {
    const {manager, invokeApi} = makeManager([
      fullPage(90000, 'page2'),
      {
        participants: [{_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: CAROL.toString()}, pFlags: {}, source: 5, date: 1}],
        count: 10000,
        next_offset: '',
        version: 1,
        chats: [] as any[],
        users: [] as any[]
      }
    ]);

    const snapshot = await manager.refreshConferenceParticipants(CALL_ID) as any;
    expect(invokeApi).toHaveBeenCalledTimes(2);
    expect(snapshot.complete).toBe(true);
    expect(snapshot.userIds).toHaveLength(101);
  });

  it.each([
    [100, [fullPage(10000, '')]],
    [200, [fullPage(10000, 'page2'), fullPage(10100, '')]]
  ] as const)(
    'treats an exact %i-member roster with an empty final cursor as complete',
    async(expectedCount, pages) => {
      const {manager, invokeApi} = makeManager([...pages]);

      const snapshot = await manager.refreshConferenceParticipants(CALL_ID) as any;

      expect(snapshot.complete).toBe(true);
      expect(snapshot.userIds).toHaveLength(expectedCount);
      expect(invokeApi).toHaveBeenCalledTimes(expectedCount / 100);
    }
  );

  it('a full page with an inflated count cannot switch reconciliation off', async() => {
    // The old gate compared page length against the server's own `count`, so
    // one full page alongside a bigger count kept the roster permanently
    // "incomplete" — and an incomplete roster drives neither disclosure nor
    // pruning. Paging removes that lever.
    const {manager} = makeManager([
      fullPage(90000, 'page2'),
      {
        participants: [] as any[],
        count: 999999,
        next_offset: '',
        version: 1,
        chats: [] as any[],
        users: [] as any[]
      }
    ]);

    const snapshot = await manager.refreshConferenceParticipants(CALL_ID) as any;
    expect(snapshot.complete).toBe(true);
  });

  it('refuses to claim completeness when the server never yields a short page', async() => {
    // A server answering every request with a full page and a fresh cursor must
    // not spin us forever, and must not get a complete roster either — an
    // incomplete one is safe, since it drives no removals.
    const pages = Array.from({length: 40}, (_, i) => fullPage(10000 + i * 100, 'p' + i));
    const {manager, invokeApi} = makeManager(pages);

    const snapshot = await manager.refreshConferenceParticipants(CALL_ID) as any;
    expect(snapshot.complete).toBe(false);
    expect(invokeApi.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it('refuses to claim completeness when the roster changed mid-walk', async() => {
    // Cursor paging over a list that is mutating can skip a participant
    // entirely — and an "absent" participant is marked left AND, if they are on
    // the chain, scheduled for only_left eviction. The server's own `version`
    // counter says the pages never coexisted, so the union is not a snapshot.
    const pageOne = fullPage(90000, 'page2');
    const pageTwo = {
      participants: [{_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: CAROL.toString()}, pFlags: {}, source: 5, date: 1}],
      count: 10000,
      next_offset: '',
      version: 2, // list moved under us
      chats: [] as any[],
      users: [] as any[]
    };
    const {manager} = makeManager([pageOne, pageTwo]);

    const snapshot = await manager.refreshConferenceParticipants(CALL_ID) as any;
    expect(snapshot.complete).toBe(false);
    expect((manager as any).participantVersions.get(CALL_ID)).toBe(2);
  });

  it('still applies each fetched page when the walk tears — SSRC delivery must not starve', async() => {
    // The walk is the ONLY delivery path for conference participant rows. On a
    // large churning roster every walk can tear mid-flight; withholding row
    // application until an untorn walk meant a late joiner's SSRCs never
    // reached the instance — no recv transceiver, no e2e mapping, their
    // audio/video never appeared. Pages are applied as they arrive; only
    // leave-reconciliation stays gated on completeness.
    const pageOne = fullPage(90000, 'page2');
    const pageTwo = {
      participants: [{_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: CAROL.toString()}, pFlags: {}, source: 5, date: 1}],
      count: 10000,
      next_offset: '',
      version: 2, // list moved under us
      chats: [] as any[],
      users: [] as any[]
    };
    const {manager} = makeManager([pageOne, pageTwo]);
    const dispatchEvent = (manager as any).rootScope.dispatchEvent as ReturnType<typeof vi.fn>;

    const snapshot = await manager.refreshConferenceParticipants(CALL_ID) as any;

    expect(snapshot.complete).toBe(false);
    const dispatchedRows = dispatchEvent.mock.calls.filter(([event]) => event === 'group_call_participant');
    // Both pages' rows were applied and dispatched despite the tear…
    expect(dispatchedRows.length).toBe(101);
    // …but no synthetic `left` rows were produced off the torn union.
    expect(dispatchedRows.some(([, payload]) => payload.participant.pFlags.left)).toBe(false);
  });

  it('drops a hydration self row whose source lags the live connection', async() => {
    // A dispatched self row runs the instance's source kill switch, which ends
    // the whole call. The includeSelf hydration must skip a server snapshot
    // that still shows a previous connection's self row and let the 5s loop
    // retry, not feed the stale row through.
    const selfPeerId = 4242 as PeerId;
    const makeSelfRow = (source: number) => ({
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(selfPeerId)},
      pFlags: {},
      source,
      date: 1
    });
    const stale = makeManager([{
      participants: [makeSelfRow(111)],
      count: 1,
      next_offset: '',
      version: 1,
      chats: [] as any[],
      users: [] as any[]
    }]);
    await stale.manager.refreshConferenceParticipants(CALL_ID, {includeSelf: true, selfSource: 222});
    const staleDispatches = (stale.manager as any).rootScope.dispatchEvent.mock.calls
    .filter(([event]: [string]) => event === 'group_call_participant');
    expect(staleDispatches).toEqual([]);

    const fresh = makeManager([{
      participants: [makeSelfRow(222)],
      count: 1,
      next_offset: '',
      version: 1,
      chats: [] as any[],
      users: [] as any[]
    }]);
    await fresh.manager.refreshConferenceParticipants(CALL_ID, {includeSelf: true, selfSource: 222});
    const freshDispatches = (fresh.manager as any).rootScope.dispatchEvent.mock.calls
    .filter(([event]: [string]) => event === 'group_call_participant');
    expect(freshDispatches.length).toBe(1);
    expect(freshDispatches[0][1].participant.pFlags.self).toBe(true);
    expect(freshDispatches[0][1].participant.source).toBe(222);
  });

  it('heals a version-gated push drop with a bounded participants resync', async() => {
    // A dropped stale push may have carried a joiner's only announcement, and a
    // legacy voice chat has no periodic roster poll to re-deliver it — the
    // joiner would stay invisible AND silent (no recv m-line) until a manual
    // rejoin. tdlib schedules a participants reload on any version mismatch;
    // the resync is that reload.
    const {manager, invokeApi} = makeManager([{
      participants: [{_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: CAROL.toString()}, pFlags: {}, source: 7, date: 1}],
      count: 1,
      next_offset: '',
      version: 6,
      chats: [] as any[],
      users: [] as any[]
    }]);
    (manager as any).participantVersions.set(CALL_ID, 5);

    (manager as any).processGroupCallParticipantsUpdate({
      _: 'updateGroupCallParticipants',
      call: {_: 'inputGroupCall', id: CALL_ID, access_hash: '888'},
      version: 4,
      participants: []
    });
    await (manager as any).participantsResyncs.get(CALL_ID);

    expect(invokeApi).toHaveBeenCalledWith('phone.getGroupParticipants', expect.objectContaining({offset: ''}));
    expect((manager as any).participantVersions.get(CALL_ID)).toBe(6);
    const dispatched = (manager as any).rootScope.dispatchEvent.mock.calls
    .filter(([event]: [string]) => event === 'group_call_participant');
    expect(dispatched.length).toBe(1);
    expect(dispatched[0][1].participant.source).toBe(7);
  });

  it('does not resync a conference on a gated push — the roster walk owns healing there', async() => {
    const {manager, invokeApi} = makeManager();
    ((manager as any).groupCalls.get(CALL_ID) as any).pFlags = {conference: true};
    (manager as any).participantVersions.set(CALL_ID, 5);

    (manager as any).processGroupCallParticipantsUpdate({
      _: 'updateGroupCallParticipants',
      call: {_: 'inputGroupCall', id: CALL_ID, access_hash: '888'},
      version: 4,
      participants: []
    });

    expect((manager as any).participantsResyncs?.size ?? 0).toBe(0);
    expect(invokeApi).not.toHaveBeenCalled();
  });

  it('never evicts the user from their own call, even without pFlags.self', async() => {
    // The leave-reconciliation used to identify us solely by `pFlags.self` on
    // the CACHED row — a server-supplied flag, on a row saveApiParticipant
    // overwrites wholesale. Once `left` rows stopped counting as presence, a
    // self row arriving without that flag made us synthesise a `left` for
    // ourselves: the user vanished from their own participant list.
    const {manager} = makeManager([{
      participants: [
        {_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: CAROL.toString()}, pFlags: {}, source: 2, date: 1}
      ],
      count: 1,
      next_offset: '',
      version: 1,
      chats: [] as any[],
      users: [] as any[]
    }]);

    // Our own cached row, WITHOUT pFlags.self — exactly the shape that broke it.
    const cached: Map<PeerId, any> = (manager as any).participants.get(CALL_ID);
    const selfPeerId = (manager as any).rootScope.myId;
    cached.set(selfPeerId, {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(selfPeerId)},
      pFlags: {},
      source: 1,
      date: 1
    });

    const saveApiParticipant = vi.spyOn(manager as any, 'saveApiParticipant');
    await manager.refreshConferenceParticipants(CALL_ID);

    // Nothing may synthesise a `left` for us.
    const selfLeft = saveApiParticipant.mock.calls.some(([, p]: any[]) =>
      String((p.peer as any).user_id) === String(selfPeerId) && p.pFlags?.left
    );
    expect(selfLeft).toBe(false);
  });

  it('does not count a `left` row as roster presence', async() => {
    // A `left` row is the SFU saying "gone", not the chain saying "no key". If
    // it counted as presence, an identity the server self-added to the chain and
    // then reported as `left` would never be disclosed and never pruned.
    const {manager} = makeManager([{
      participants: [
        {_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: ALICE.toString()}, pFlags: {self: true}, source: 1, date: 1},
        {_: 'groupCallParticipant', peer: {_: 'peerUser', user_id: CAROL.toString()}, pFlags: {left: true}, source: 2, date: 1}
      ],
      count: 2,
      next_offset: '',
      chats: [] as any[],
      users: [] as any[]
    }]);

    const snapshot = await manager.refreshConferenceParticipants(CALL_ID) as any;
    expect(snapshot.complete).toBe(true);
    expect(snapshot.userIds).toEqual(rosterOf(ALICE));
    expect(snapshot.userIds).not.toContain(CAROL.toString());
  });
});

describe('GroupCallInstance — chain-only conference members', () => {
  beforeEach(() => {
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
    const {reconcile, expireGrace, buildRemoveParticipantsBlock, deleteConferenceCallParticipants} = makeConference();

    await reconcile(rosterOf(ALICE, CAROL));
    expireGrace();
    await reconcile(rosterOf(ALICE, CAROL));
    // The removal runs detached from the roster poller, so let it settle.
    await vi.waitFor(() => expect(deleteConferenceCallParticipants).toHaveBeenCalled());

    // The worker derives the trimmed state from its serialized current tip and
    // returns the exact ids represented by the resulting key rotation.
    expect(buildRemoveParticipantsBlock).toHaveBeenCalledWith({userIds: [EVE]});
    expect(deleteConferenceCallParticipants).toHaveBeenCalledWith({
      call: {_: 'inputGroupCall', id: '777', access_hash: '888'},
      ids: [EVE.toString()],
      block: new Uint8Array([0xb6, 0x3d, 0x9a, 0x63]),
      onlyLeft: true
    });
  });

  it('uses monotonic time for the removal grace when the wall clock moves backward', async() => {
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000);
    const monotonicClock = vi.spyOn(performance, 'now').mockReturnValue(50_000);
    try {
      const {reconcile, deleteConferenceCallParticipants} = makeConference();

      await reconcile(rosterOf(ALICE, CAROL));
      wallClock.mockReturnValue(1_000_000_000_000);
      monotonicClock.mockReturnValue(60_001);
      await reconcile(rosterOf(ALICE, CAROL));

      await vi.waitFor(() => expect(deleteConferenceCallParticipants).toHaveBeenCalledTimes(1));
    } finally {
      wallClock.mockRestore();
      monotonicClock.mockRestore();
    }
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
    const {instance, buildRemoveParticipantsBlock, deleteConferenceCallParticipants} = makeConference();
    // Another queued block (or an earlier attempt) pruned Eve first. The worker
    // observes that current state and reports a no-op.
    buildRemoveParticipantsBlock.mockResolvedValueOnce(undefined as any);

    await (instance as any).pruneConferenceMembers([EVE]);

    expect(buildRemoveParticipantsBlock).toHaveBeenCalledWith({userIds: [EVE]});
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
    const logError = vi.spyOn((instance as any).log, 'error');
    deleteConferenceCallParticipants.mockRejectedValue({type: 'GROUPCALL_INVALID'});

    (instance as any).publishMembersWithAccess([EVE]);
    for(let attempt = 0; attempt < 3; ++attempt) {
      await (instance as any).pruneConferenceMembers([EVE]);
    }

    // A relay that injects a member and then refuses to let it be pruned is the
    // hostile case — the user must be able to see both halves of it.
    expect(instance.memberWithAccessPeerIds).toEqual([conferenceUserIdToPeerId(EVE)]);
    expect(logError).toHaveBeenCalledWith(
      'CONFERENCE BUG —',
      expect.stringMatching(/still hold the call key/i),
      expect.objectContaining({reason: expect.stringMatching(/still hold the call key/i)})
    );
  });

  it('treats a chain race as benign and retries rather than reporting', async() => {
    const {instance, deleteConferenceCallParticipants} = makeConference();
    const logError = vi.spyOn((instance as any).log, 'error');
    deleteConferenceCallParticipants.mockRejectedValue({type: 'CONF_WRITE_CHAIN_INVALID'});

    await (instance as any).pruneConferenceMembers([EVE]);

    expect(logError).not.toHaveBeenCalled();
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
    const logError = vi.spyOn((instance as any).log, 'error');
    const hidden = BigInt('9007199254740993');
    const decoy = BigInt('9007199254740992');
    (instance as any).e2eStatus = {groupState: groupStateOf(ALICE, hidden, decoy)};

    await reconcile(rosterOf(ALICE));

    // Both are flagged for removal (that works off exact ids), but the roster
    // list is keyed by PeerId and can only carry one row for the pair.
    expect(instance.memberWithAccessPeerIds).toHaveLength(1);
    expect(logError).toHaveBeenCalledWith(
      'CONFERENCE BUG —',
      expect.stringMatching(/share one displayed peer/i),
      expect.objectContaining({reason: expect.stringMatching(/share one displayed peer/i)})
    );
  });

  it('leaves rather than spinning when the server disowns the call', async() => {
    // Observed live: every conference request answered GROUPCALL_INVALID while
    // the already-negotiated media kept flowing. The client logged and retried
    // forever, so the roster froze — and with a fail-closed recv transform,
    // anything a peer started afterwards was dropped ("I see their video but
    // hear nothing"), all under an encrypted-call UI whose access list could no
    // longer be verified.
    const {instance} = makeConference();
    const hangUp = vi.spyOn(instance, 'hangUp').mockImplementation(async() => {});
    const err = {type: 'GROUPCALL_INVALID'};

    for(let i = 0; i < 7; ++i) (instance as any).noteConferenceApiResult(err);
    expect(hangUp).not.toHaveBeenCalled();

    (instance as any).noteConferenceApiResult(err);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it('does not leave on ordinary transient failures', async() => {
    const {instance} = makeConference();
    const hangUp = vi.spyOn(instance, 'hangUp').mockImplementation(async() => {});

    for(let i = 0; i < 40; ++i) {
      (instance as any).noteConferenceApiResult({type: 'TIMEOUT'});
    }

    expect(hangUp).not.toHaveBeenCalled();
  });

  it('a single good answer clears the streak', async() => {
    const {instance} = makeConference();
    const hangUp = vi.spyOn(instance, 'hangUp').mockImplementation(async() => {});
    const err = {type: 'GROUPCALL_INVALID'};

    for(let i = 0; i < 7; ++i) (instance as any).noteConferenceApiResult(err);
    (instance as any).noteConferenceApiResult(); // one success
    for(let i = 0; i < 7; ++i) (instance as any).noteConferenceApiResult(err);

    expect(hangUp).not.toHaveBeenCalled();
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
