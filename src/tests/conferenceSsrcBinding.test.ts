/*
 * Regression tests for the SSRC <-> identity bindings.
 *
 * Two structures are built from the same untrusted input and must never
 * disagree: `e2eUserBySsrc` decides which Ed25519 key verifies a frame, and the
 * ConferenceEntry for that SSRC carries the peerId deciding whose tile renders
 * it. If they diverge, authenticated media is attributed to the wrong person.
 *
 * Both bugs covered here were introduced by earlier fixes and found by review:
 *  - the entry lookup normalised the SSRC to unsigned while entriesBySource is
 *    keyed by the SIGNED int32 Telegram sends, so the rebind never ran for any
 *    source with the high bit set — half the SSRC space;
 *  - the capacity cap sat after the rebind branch, so at the ceiling the tile
 *    identity moved while the key mapping did not.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import GroupCallInstance, {e2eSourcesOf} from '@lib/calls/groupCallInstance';
import LocalConferenceDescription, {generateSsrc} from '@lib/calls/localConferenceDescription';

const CALL_ID = 'ssrc-test' as any;
const ALICE = BigInt(1001);
const BOB = BigInt(2002);
const CAROL = BigInt(3003);

describe('conference source-group validation', () => {
  const malformedGroup = [{
    _: 'groupCallParticipantVideoSourceGroup',
    semantics: 'SIM',
    sources: []
  }] as any;

  it('does not index an entry under undefined for an empty source group', () => {
    const description = new LocalConferenceDescription({} as RTCPeerConnection);
    const first = description.createEntry('video');
    const second = description.createEntry('video');

    expect(description.setEntrySource(first, malformedGroup)).toBeUndefined();
    expect(description.setEntrySource(second, malformedGroup)).toBeUndefined();
    expect(description.getEntryBySource(undefined as any)).toBeUndefined();
    expect(first.source).toBeUndefined();
    expect(second.source).toBeUndefined();
  });

  it('rejects the same malformed source group before creating an Ssrc', () => {
    expect(generateSsrc('video', malformedGroup)).toBeUndefined();
  });

  it('indexes a valid group by its first source and removes a replaced binding', () => {
    const description = new LocalConferenceDescription({} as RTCPeerConnection);
    const entry = description.createEntry('video');
    const group = [{
      _: 'groupCallParticipantVideoSourceGroup',
      semantics: 'FID',
      sources: [123, 456]
    }] as any;

    expect(description.setEntrySource(entry, group)).toBe(123);
    expect(description.getEntryBySource(123)).toBe(entry);
    expect(description.setEntrySource(entry, 789)).toBe(789);
    expect(description.getEntryBySource(123)).toBeUndefined();
    expect(description.getEntryBySource(789)).toBe(entry);
  });
});

function makeInstance() {
  const entries = new Map<number, {source: number; peerId: PeerId; direction: string}>();
  const setEntryPeerId = vi.fn((entry: any, peerId: PeerId) => {
    entry.peerId = peerId;
  });

  const managers: any = {
    appGroupCallsManager: {},
    appCallsManager: {},
    apiUpdatesManager: {processUpdateMessage: () => {}}
  };

  const description = {
    // Keyed by the SIGNED source, exactly like LocalConferenceDescription.
    getEntryBySource: (source: number) => entries.get(source),
    findEntry: (verify: (entry: any) => boolean) => [...entries.values()].find(verify),
    setEntryPeerId
  };

  const instance = new GroupCallInstance({id: CALL_ID, chatId: 0 as any, managers});
  // `description` is a getter reading through connections.main.
  (instance as any).connections = {
    main: {connection: {iceConnectionState: 'connected'}, streamManager: {stop: vi.fn()}, description}
  };
  const setSsrcUsers = vi.fn(async() => {});
  (instance as any).e2e = {setSsrcUsers, terminate: vi.fn(async() => {})};

  return {instance, entries, managers, setEntryPeerId, setSsrcUsers};
}

function installParticipantDescription(instance: GroupCallInstance) {
  const description = (instance as any).connections.main.description;
  description.createEntry = vi.fn();
  description.setEntrySource = vi.fn();
  (instance as any).connections.main.sources = {audio: {source: 1}};
  (instance as any).connections.main.requestNegotiation = vi.fn(async() => {});
  return description;
}

function attachResolutionWorker(instance: GroupCallInstance, active = true) {
  const listeners = new Map<string, Array<(event: any) => void>>();
  const worker = {
    addEventListener(kind: string, listener: (event: any) => void) {
      const current = listeners.get(kind) || [];
      current.push(listener);
      listeners.set(kind, current);
    },
    setSsrcUsers: vi.fn(async() => {}),
    terminate: vi.fn(async() => {})
  };
  instance.attachE2e(worker as any, ALICE);
  (instance as any).e2eActive = active;
  return {
    setSsrcUsers: worker.setSsrcUsers,
    emitRecvDiag(event: {ssrc: number; reason: 'unmapped'; sustained?: boolean}) {
      for(const listener of listeners.get('recvDiag') || []) listener(event);
    }
  };
}

describe('registerE2eUserSsrc', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('moves the tile identity with the key mapping for a NEGATIVE (high-bit) source', () => {
    // Telegram sends sources as signed int32, so anything >= 2^31 arrives
    // negative. Normalising before the entry lookup missed every one of them.
    const {instance, entries, setEntryPeerId} = makeInstance();
    const signedSource = -559038737; // 0xDEADBEEF as int32
    entries.set(signedSource, {source: signedSource, peerId: 1001 as PeerId, direction: 'recvonly'});

    instance.registerE2eUserSsrc(ALICE, signedSource);
    expect((instance as any).e2eUserBySsrc.get(signedSource >>> 0)).toBe(ALICE);

    instance.registerE2eUserSsrc(BOB, signedSource);

    // The entry must have been found and re-bound — the whole point of the fix.
    expect(setEntryPeerId).toHaveBeenCalledTimes(1);
    expect(entries.get(signedSource).peerId).toBe(Number(BOB));
    // And the key map moved with it.
    expect((instance as any).e2eUserBySsrc.get(signedSource >>> 0)).toBe(BOB);
  });

  it('keeps both structures in step for an ordinary positive source', () => {
    const {instance, entries, setEntryPeerId} = makeInstance();
    entries.set(12345, {source: 12345, peerId: 1001 as PeerId, direction: 'recvonly'});

    instance.registerE2eUserSsrc(ALICE, 12345);
    instance.registerE2eUserSsrc(BOB, 12345);

    expect(setEntryPeerId).toHaveBeenCalledTimes(1);
    expect((instance as any).e2eUserBySsrc.get(12345)).toBe(BOB);
  });

  it('does not half-apply a rebind when the table is at capacity', () => {
    // The cap must not fire on a rebind: a rebind cannot grow the map, and
    // returning early after moving the entry left the two structures
    // disagreeing — the exact state the rebind exists to prevent.
    const {instance, entries, setEntryPeerId} = makeInstance();
    const map: Map<number, bigint> = (instance as any).e2eUserBySsrc;
    for(let i = 0; i < 1024; i++) map.set(900000 + i, ALICE);
    map.set(777, ALICE);
    entries.set(777, {source: 777, peerId: 1001 as PeerId, direction: 'recvonly'});

    instance.registerE2eUserSsrc(BOB, 777);

    expect(setEntryPeerId).toHaveBeenCalledTimes(1);
    expect(entries.get(777).peerId).toBe(Number(BOB));
    // Both moved, or neither — never one.
    expect(map.get(777)).toBe(BOB);
  });

  it('reclaims dead mappings at the ceiling instead of wedging', () => {
    // A long call churns sources (video/screenshare toggles), so the table can
    // reach the cap with entries that belong to nobody. Refusing new sources
    // then would be permanent silence for whoever arrives next — reclaim first.
    const {instance} = makeInstance();
    const map: Map<number, bigint> = (instance as any).e2eUserBySsrc;
    for(let i = 0; i < 1024; i++) map.set(900000 + i, ALICE);
    // participantsSsrcs is empty: none of those sources belongs to a live peer.

    instance.registerE2eUserSsrc(BOB, 4242);

    expect(map.get(4242)).toBe(BOB);
    expect(map.size).toBeLessThan(1024);
  });

  it('still refuses a new source when the table is full of LIVE mappings', () => {
    const {instance, entries, setEntryPeerId} = makeInstance();
    const map: Map<number, bigint> = (instance as any).e2eUserBySsrc;
    const ssrcs: any[] = [];
    for(let i = 0; i < 1024; i++) {
      map.set(900000 + i, ALICE);
      ssrcs.push({source: 900000 + i});
    }
    // Every entry is backed by a participant we currently know about, so the
    // sweep must reclaim nothing and the bound has to hold.
    (instance as any).participantsSsrcs.set(1001 as PeerId, ssrcs);

    instance.registerE2eUserSsrc(BOB, 4242);

    expect(map.has(4242)).toBe(false);
    expect(setEntryPeerId).not.toHaveBeenCalled();
    expect(entries.has(4242)).toBe(false);
  });

  it('keeps live grouped SIM/FID sources during a pressure sweep', () => {
    const {instance} = makeInstance();
    const map: Map<number, bigint> = (instance as any).e2eUserBySsrc;
    const live = {
      source: 100,
      type: 'video',
      sourceGroups: [
        {semantics: 'SIM', sources: [100, 101]},
        {semantics: 'FID', sources: [100, 102]}
      ]
    } as any;
    (instance as any).participantsSsrcs.set(1001 as PeerId, [live]);
    for(const source of [100, 101, 102]) map.set(source, ALICE);
    for(let i = 0; i < 1021; ++i) map.set(900000 + i, ALICE);

    (instance as any).sweepE2eSsrcs();

    expect([...map.keys()].sort((a, b) => a - b)).toEqual([100, 101, 102]);
  });

  it('keeps a live source through a thinner stale participant row and pressure sweep', () => {
    const {instance, entries} = makeInstance();
    const map: Map<number, bigint> = (instance as any).e2eUserBySsrc;
    const audio = {source: 111, type: 'audio'} as any;
    const video = {source: 222, type: 'video', endpoint: 'camera'} as any;
    (instance as any).participantsSsrcs.set(Number(BOB) as PeerId, [audio, video]);
    map.set(111, BOB);
    map.set(222, BOB);
    for(let i = 0; i < 1022; ++i) map.set(900000 + i, ALICE);

    const audioEntry = {source: 111, peerId: Number(BOB), direction: 'recvonly', type: 'audio'};
    const videoEntry = {
      source: 222,
      peerId: Number(BOB),
      direction: 'recvonly',
      type: 'video',
      setDirection: vi.fn()
    };
    entries.set(111, audioEntry);
    entries.set(222, videoEntry);

    // This older roster row knows only about audio. It must not deactivate or
    // forget the camera row learned from a newer push.
    instance.onParticipantUpdate({
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: 111,
      date: 1
    } as any);
    (instance as any).sweepE2eSsrcs();

    expect(map.get(222)).toBe(BOB);
    expect((instance as any).participantsSsrcs.get(Number(BOB))).toEqual([audio, video]);
    expect(videoEntry.setDirection).not.toHaveBeenCalled();
  });

  it.each([
    {from: 'audio', to: 'video'},
    {from: 'video', to: 'audio'}
  ] as const)('allocates the right $to m-line when an inactive $from SSRC is reused', ({from, to}) => {
    const source = 31337;
    const auxiliaryAudioSource = 4242;
    const {instance} = makeInstance();
    const addTransceiver = vi.fn((_kind: string, init: RTCRtpTransceiverInit) => ({
      receiver: {},
      direction: init.direction
    }));
    const connection = {
      iceConnectionState: 'connected',
      addTransceiver
    } as any;
    const description = new LocalConferenceDescription(connection);
    const requestNegotiation = vi.fn(async() => {});
    (instance as any).connections.main = {
      connection,
      description,
      streamManager: {stop: vi.fn()},
      requestNegotiation,
      updateConstraints: false
    };
    vi.spyOn(instance, 'attachE2eRecvTransform').mockImplementation(() => {});

    const old = description.createEntry(from);
    description.setEntrySource(old, source);
    description.setEntryPeerId(old, Number(ALICE) as PeerId);
    old.setDirection('recvonly');
    old.setDirection('inactive');
    (instance as any).e2eAllocatedRecvEntries.add(
      (source >>> 0) * 2 + (from === 'video' ? 1 : 0)
    );

    if(to === 'video') {
      const audio = description.createEntry('audio');
      description.setEntrySource(audio, auxiliaryAudioSource);
      description.setEntryPeerId(audio, Number(BOB) as PeerId);
      audio.setDirection('recvonly');
    }
    const createEntry = vi.spyOn(description, 'createEntry');
    const participant = to === 'video' ? {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: auxiliaryAudioSource,
      video: {
        _: 'groupCallParticipantVideo',
        pFlags: {},
        endpoint: 'camera',
        source_groups: [{
          _: 'groupCallParticipantVideoSourceGroup',
          semantics: 'SIM',
          sources: [source]
        }]
      },
      date: 1
    } : {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source,
      date: 1
    };

    instance.onParticipantUpdate(participant as any);

    const replacement = description.getEntryBySource(source);
    expect(old.direction).toBe('inactive');
    expect(replacement).not.toBe(old);
    expect(replacement).toMatchObject({source, type: to, peerId: Number(BOB), direction: 'recvonly'});
    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(createEntry).toHaveBeenCalledWith(to);
    expect(addTransceiver).toHaveBeenCalledWith(to, {direction: 'recvonly'});
    expect(requestNegotiation).toHaveBeenCalledTimes(1);
    expect((instance as any).connections.main.updateConstraints).toBe(to === 'video');
    expect(instance.e2eUserBySsrc.get(source >>> 0)).toBe(BOB);
    expect((instance as any).e2eAllocatedRecvEntries).toContain(
      (source >>> 0) * 2 + (to === 'video' ? 1 : 0)
    );

    // Removing the old inactive entry later must not erase the replacement's
    // newer source index.
    description.deleteEntry(old);
    expect(description.getEntryBySource(source)).toBe(replacement);
  });

  it('does not allocate a ConferenceEntry or transceiver after SSRC capacity is exhausted', () => {
    const {instance} = makeInstance();
    const description = installParticipantDescription(instance);
    const map: Map<number, bigint> = (instance as any).e2eUserBySsrc;
    const liveSsrcs: any[] = [];
    for(let i = 0; i < 1024; ++i) {
      const source = 900000 + i;
      map.set(source, ALICE);
      liveSsrcs.push({source, type: 'audio'});
    }
    (instance as any).participantsSsrcs.set(1001 as PeerId, liveSsrcs);

    instance.onParticipantUpdate({
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: 4242,
      date: 1
    } as any);

    expect(description.createEntry).not.toHaveBeenCalled();
    expect(map.has(4242)).toBe(false);
    expect((instance as any).participantsSsrcs.get(Number(BOB))).toEqual([]);
  });

  it('bounds cumulative WebRTC allocations even after active mappings were reclaimed', () => {
    const {instance} = makeInstance();
    const description = installParticipantDescription(instance);
    const allocated: Set<number> = (instance as any).e2eAllocatedRecvEntries;
    for(let i = 0; i < 1024; ++i) allocated.add(800000 + i);
    // Active key map is empty — this is the churn case an active-only cap
    // misses because inactive ConferenceEntries/transceivers remain in SDP.
    expect((instance as any).e2eUserBySsrc.size).toBe(0);

    instance.onParticipantUpdate({
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: 4242,
      date: 1
    } as any);

    expect(description.createEntry).not.toHaveBeenCalled();
    expect((instance as any).e2eUserBySsrc.has(4242)).toBe(false);
    expect(allocated.size).toBe(1024);
  });

  it('removes every grouped source when its participant leaves', () => {
    const {instance} = makeInstance();
    installParticipantDescription(instance);
    const map: Map<number, bigint> = (instance as any).e2eUserBySsrc;
    const grouped = {
      source: 100,
      type: 'video',
      sourceGroups: [
        {semantics: 'SIM', sources: [100, 101]},
        {semantics: 'FID', sources: [100, 102]}
      ]
    } as any;
    (instance as any).participantsSsrcs.set(Number(BOB) as PeerId, [grouped]);
    for(const source of [100, 101, 102]) map.set(source, BOB);

    instance.onParticipantUpdate({
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {left: true},
      source: 100,
      date: 1
    } as any);

    expect(map.size).toBe(0);
  });

  it('never un-maps a live source just because one update omits it', () => {
    // The regression behind "participant seen but not heard": a roster row
    // computed before a "video on" push arrives after it and omits that source.
    // Registering must be additive — only `left` and the sweep remove mappings.
    const {instance} = makeInstance();
    const map: Map<number, bigint> = (instance as any).e2eUserBySsrc;

    instance.registerE2eUserSsrc(ALICE, 111); // audio
    instance.registerE2eUserSsrc(ALICE, 222); // video
    // A later, thinner update mentions only the audio source.
    instance.registerE2eUserSsrc(ALICE, 111);

    expect(map.get(111)).toBe(ALICE);
    expect(map.get(222)).toBe(ALICE);
  });

  it('retries a rejected remote-media negotiation on the next roster update', async() => {
    const {instance, entries} = makeInstance();
    installParticipantDescription(instance);
    (instance as any).e2e = undefined;
    const negotiationError = new Error('setRemoteDescription rejected');
    const requestNegotiation = vi.fn()
    .mockRejectedValueOnce(negotiationError)
    .mockResolvedValueOnce(undefined);
    (instance as any).connections.main.requestNegotiation = requestNegotiation;
    const entry = {
      source: 31337,
      peerId: Number(BOB) as PeerId,
      type: 'audio',
      direction: 'inactive',
      originalDirection: 'recvonly',
      setDirection(direction: string) {
        this.direction = direction;
      }
    };
    entries.set(31337, entry);
    const participant = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: 31337,
      date: 1
    } as any;

    instance.onParticipantUpdate(participant);
    await vi.waitFor(() => expect(requestNegotiation).toHaveBeenCalledTimes(1));
    instance.onParticipantUpdate(participant);
    await vi.waitFor(() => expect(requestNegotiation).toHaveBeenCalledTimes(2));
  });

  it('maps every simulcast layer and RTX source, not just the primary', () => {
    // generateSsrc collapses a video source_group list to sourceGroups[0].sources[0],
    // so registering ssrc.source alone covered ONE of a simulcast sender's
    // layers. The SFU switches layers on its own and retransmits over the
    // FID/RTX SSRCs, and the recv transform is fail-closed — every unmapped
    // layer is a frozen tile or silence with an "unmapped SSRC" breadcrumb.
    const {instance} = makeInstance();
    const map: Map<number, bigint> = (instance as any).e2eUserBySsrc;

    // Shape taken verbatim from a live call: primary + 2 simulcast layers, each
    // with its own retransmission SSRC.
    const ssrc = {
      type: 'video',
      source: -659129738,
      sourceGroups: [
        {_: 'groupCallParticipantVideoSourceGroup', semantics: 'FID', sources: [-659129738, 1859325672]},
        {_: 'groupCallParticipantVideoSourceGroup', semantics: 'SIM', sources: [-659129738, -852403325, -1083969573]},
        {_: 'groupCallParticipantVideoSourceGroup', semantics: 'FID', sources: [-852403325, -2098134055]},
        {_: 'groupCallParticipantVideoSourceGroup', semantics: 'FID', sources: [-1083969573, -364344942]}
      ]
    } as any;

    // Drive the REAL derivation — hand-flattening the list here would bypass
    // the very function under test and pass no matter what it does.
    const sources = e2eSourcesOf(ssrc);
    for(const source of sources) instance.registerE2eUserSsrc(BOB, source);

    // primary + 2 further SIM layers + 3 RTX SSRCs, deduped.
    expect(sources.length).toBe(6);
    for(const expected of [-659129738, -852403325, -1083969573, 1859325672, -2098134055, -364344942]) {
      expect(sources).toContain(expected);
      expect(map.get(expected >>> 0)).toBe(BOB);
    }
    expect(map.size).toBe(6);
  });

  it('syncs a whole source group to the worker exactly once', () => {
    // Each sync serializes the ENTIRE ssrc table into the worker's rpc queue,
    // behind crypto ops — per-source syncs turned one camera participant into
    // ~8 back-to-back full-table posts exactly at join time, delaying
    // applyBlock/receiveInbound when they matter most.
    const {instance, setSsrcUsers} = makeInstance();
    const ssrc = {
      type: 'video',
      source: -659129738,
      sourceGroups: [
        {_: 'groupCallParticipantVideoSourceGroup', semantics: 'FID', sources: [-659129738, 1859325672]},
        {_: 'groupCallParticipantVideoSourceGroup', semantics: 'SIM', sources: [-659129738, -852403325, -1083969573]},
        {_: 'groupCallParticipantVideoSourceGroup', semantics: 'FID', sources: [-852403325, -2098134055]},
        {_: 'groupCallParticipantVideoSourceGroup', semantics: 'FID', sources: [-1083969573, -364344942]}
      ]
    } as any;

    expect((instance as any).registerE2eUserSsrcGroup(BOB, ssrc)).toBe(true);

    expect(setSsrcUsers).toHaveBeenCalledTimes(1);
    expect((setSsrcUsers.mock.calls[0] as unknown[])[0]).toHaveLength(6);
    // A no-op re-registration must not re-post the table.
    expect((instance as any).registerE2eUserSsrcGroup(BOB, ssrc)).toBe(true);
    expect(setSsrcUsers).toHaveBeenCalledTimes(1);
  });

  it('tells a real mapping failure apart from media that belongs to nobody', () => {
    // Observed live: both participants of a 2-person call received a THIRD
    // audio stream whose SSRC matched neither of them. Dropping it is correct —
    // it is the fail-closed transform working — but the breadcrumb called it
    // "participant seen but not heard", which points at the wrong bug.
    const {instance} = makeInstance();
    (instance as any).participantsSsrcs.set(1001 as PeerId, [
      {source: 555, type: 'audio'},
      {source: 777, type: 'video', sourceGroups: [{semantics: 'SIM', sources: [777, 888]}]}
    ]);

    const known = (source: number) => (instance as any).isKnownParticipantSource(source);

    // Primary audio, primary video, and a simulcast layer all belong to a peer.
    expect(known(555)).toBe(true);
    expect(known(777)).toBe(true);
    expect(known(888)).toBe(true);

    // The stream from nobody.
    expect(known(48956587)).toBe(false);
  });

  it('recognises a known source that arrived as a negative int32', () => {
    const {instance} = makeInstance();
    (instance as any).participantsSsrcs.set(1001 as PeerId, [{source: -539607859, type: 'audio'}]);
    expect((instance as any).isKnownParticipantSource(-539607859 >>> 0)).toBe(true);
  });

  it('resolves an unmapped source and publishes only an authenticated member row', async() => {
    const signedSource = -539607859;
    const participant = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: signedSource,
      date: 1
    } as any;
    const {instance, entries, managers} = makeInstance();
    entries.set(signedSource, {
      source: signedSource,
      peerId: Number(BOB) as PeerId,
      direction: 'recvonly',
      type: 'audio'
    } as any);
    const getBySources = vi.fn(async() => [participant]);
    const saveApiParticipant = vi.fn(async() => {});
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: getBySources,
      saveApiParticipant
    };
    (instance as any).e2eStatus = {
      groupState: {participants: [{userId: BOB}]}
    };
    const {emitRecvDiag, setSsrcUsers} = attachResolutionWorker(instance);

    emitRecvDiag({ssrc: signedSource >>> 0, reason: 'unmapped'});

    await vi.waitFor(() => expect(instance.e2eUserBySsrc.get(signedSource >>> 0)).toBe(BOB));
    expect(saveApiParticipant).toHaveBeenCalledWith(CALL_ID, participant);
    expect(getBySources).toHaveBeenCalledWith(CALL_ID, [signedSource >>> 0]);
    expect(setSsrcUsers).toHaveBeenCalledWith([[signedSource >>> 0, BOB]]);
  });

  it('releases a negative first-sighting lookup and uses one later sustained retry', async() => {
    const {instance, managers} = makeInstance();
    const reportConferenceBug = vi.spyOn(instance as any, 'reportConferenceBug');
    const getBySources = vi.fn(async() => []);
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: getBySources,
      saveApiParticipant: vi.fn(async() => {})
    };
    (instance as any).e2eStatus = {groupState: {participants: [{userId: BOB}]}};
    const {emitRecvDiag} = attachResolutionWorker(instance);

    emitRecvDiag({ssrc: 31337, reason: 'unmapped'});

    await vi.waitFor(() => expect((instance as any).e2eSourceResolutionPromise).toBeUndefined());
    expect(getBySources).toHaveBeenCalledTimes(1);
    expect((instance as any).e2eSourceResolutions.size).toBe(0);

    emitRecvDiag({ssrc: 31337, reason: 'unmapped', sustained: true});

    await vi.waitFor(() => expect(getBySources).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect((instance as any).e2eSourceResolutionPromise).toBeUndefined());
    expect(reportConferenceBug).toHaveBeenCalledTimes(1);
    expect((instance as any).e2eSourceResolutions.size).toBe(0);
  });

  it('parks a row whose chain block lags and maps it once membership catches up', async() => {
    // The media path can beat BOTH the roster and the chain: the server names
    // an owner for the SSRC, but their block has not applied locally, so the
    // membership filter rejects the row. That deterministic "too early" miss
    // used to consume the whole 2-attempt budget — the stream was written off
    // seconds before it would have resolved. The resolution is parked instead
    // and re-armed by the group_state membership change.
    const signedSource = 60606;
    const participant = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: signedSource,
      date: 1
    } as any;
    const {instance, managers} = makeInstance();
    const reportConferenceBug = vi.spyOn(instance as any, 'reportConferenceBug');
    const getBySources = vi.fn(async() => [participant]);
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: getBySources,
      saveApiParticipant: vi.fn(async() => {}),
      refreshConferenceParticipants: vi.fn(async() => false)
    };
    // BOB is NOT in the group_state yet — the chain block is still in flight.
    (instance as any).e2eStatus = {groupState: {participants: [{userId: CAROL}]}};
    const {emitRecvDiag} = attachResolutionWorker(instance);

    emitRecvDiag({ssrc: signedSource, reason: 'unmapped'});
    await vi.waitFor(() => expect((instance as any).e2eSourceResolutionPromise).toBeUndefined());
    emitRecvDiag({ssrc: signedSource, reason: 'unmapped', sustained: true});
    await vi.waitFor(() => expect(getBySources).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect((instance as any).e2eSourceResolutionPromise).toBeUndefined());

    // Both attempts missed on membership — parked, not written off.
    expect(instance.e2eUserBySsrc.has(signedSource)).toBe(false);
    expect((instance as any).e2eSourceResolutions.size).toBe(1);
    expect(reportConferenceBug).not.toHaveBeenCalled();

    // BOB's block applies; the status-driven member sync re-arms the lookup.
    (instance as any).e2eStatus = {groupState: {participants: [{userId: CAROL}, {userId: BOB}]}};
    (instance as any).syncConferenceMembersFromStatus();

    await vi.waitFor(() => expect(instance.e2eUserBySsrc.get(signedSource)).toBe(BOB));
    expect((instance as any).e2eSourceResolutions.size).toBe(0);
  });

  it('ignores a targeted row when the ordinary path maps its source before the lookup returns', async() => {
    let resolveLookup!: (participants: any[]) => void;
    const lookup = new Promise<any[]>((resolve) => {
      resolveLookup = resolve;
    });
    const participant = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: 4242,
      date: 1
    } as any;
    const {instance, managers} = makeInstance();
    const saveApiParticipant = vi.fn(async() => {});
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: vi.fn(() => lookup),
      saveApiParticipant
    };
    (instance as any).e2eStatus = {
      groupState: {participants: [{userId: BOB}, {userId: CAROL}]}
    };
    const {emitRecvDiag} = attachResolutionWorker(instance);

    emitRecvDiag({ssrc: 4242, reason: 'unmapped'});
    instance.registerE2eUserSsrc(CAROL, 4242);
    resolveLookup([participant]);

    await vi.waitFor(() => expect((instance as any).e2eSourceResolutionPromise).toBeUndefined());
    expect(saveApiParticipant).not.toHaveBeenCalled();
    expect(instance.e2eUserBySsrc.get(4242)).toBe(CAROL);
  });

  it('does not directly apply a targeted row when its source maps during the save await', async() => {
    let resolveSave!: () => void;
    const save = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const participant = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: 4242,
      date: 1
    } as any;
    const {instance, managers} = makeInstance();
    const saveApiParticipant = vi.fn(() => save);
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: vi.fn(async() => [participant]),
      saveApiParticipant
    };
    (instance as any).e2eStatus = {
      groupState: {participants: [{userId: BOB}, {userId: CAROL}]}
    };
    const {emitRecvDiag} = attachResolutionWorker(instance);

    emitRecvDiag({ssrc: 4242, reason: 'unmapped'});
    await vi.waitFor(() => expect(saveApiParticipant).toHaveBeenCalledWith(CALL_ID, participant));
    instance.registerE2eUserSsrc(CAROL, 4242);
    resolveSave();

    await vi.waitFor(() => expect((instance as any).e2eSourceResolutionPromise).toBeUndefined());
    expect(instance.e2eUserBySsrc.get(4242)).toBe(CAROL);
  });

  it.each([
    {
      title: 'a row that does not contain the requested source',
      participant: {
        _: 'groupCallParticipant',
        peer: {_: 'peerUser', user_id: String(BOB)},
        pFlags: {},
        source: 9999,
        date: 1
      }
    },
    {
      title: 'a source claimed by a user outside the current e2e group',
      participant: {
        _: 'groupCallParticipant',
        peer: {_: 'peerUser', user_id: String(CAROL)},
        pFlags: {},
        source: 4242,
        date: 1
      }
    },
    {
      title: 'a self-flagged participant row',
      participant: {
        _: 'groupCallParticipant',
        peer: {_: 'peerUser', user_id: String(ALICE)},
        pFlags: {self: true},
        source: 4242,
        date: 1
      }
    },
    {
      title: 'our own user id even when the self flag is missing',
      participant: {
        _: 'groupCallParticipant',
        peer: {_: 'peerUser', user_id: String(ALICE)},
        pFlags: {},
        source: 4242,
        date: 1
      }
    }
  ])('rejects $title', async({participant}) => {
    const {instance, managers} = makeInstance();
    const getBySources = vi.fn(async() => [participant]);
    const saveApiParticipant = vi.fn(async() => {});
    managers.appGroupCallsManager = {getGroupCallParticipantsBySources: getBySources, saveApiParticipant};
    (instance as any).e2eStatus = {
      groupState: {participants: [{userId: ALICE}, {userId: BOB}]}
    };
    const {emitRecvDiag} = attachResolutionWorker(instance);

    emitRecvDiag({ssrc: 4242, reason: 'unmapped'});

    await vi.waitFor(() => expect((instance as any).e2eSourceResolutionPromise).toBeUndefined());
    expect(saveApiParticipant).not.toHaveBeenCalled();
    expect(instance.e2eUserBySsrc.has(4242)).toBe(false);
  });

  it('fails closed when two authenticated members claim one unresolved source', async() => {
    const participants = [BOB, CAROL].map((userId) => ({
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(userId)},
      pFlags: {},
      source: 4242,
      date: 1
    })) as any;
    const {instance, managers} = makeInstance();
    const reportConferenceBug = vi.spyOn(instance as any, 'reportConferenceBug');
    const saveApiParticipant = vi.fn(async() => {});
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: vi.fn(async() => participants),
      saveApiParticipant
    };
    (instance as any).e2eStatus = {
      groupState: {participants: [{userId: BOB}, {userId: CAROL}]}
    };
    const {emitRecvDiag} = attachResolutionWorker(instance);

    emitRecvDiag({ssrc: 4242, reason: 'unmapped'});

    await vi.waitFor(() => expect(reportConferenceBug).toHaveBeenCalledTimes(1));
    expect(saveApiParticipant).not.toHaveBeenCalled();
    expect(instance.e2eUserBySsrc.has(4242)).toBe(false);
  });

  it('coalesces duplicate diagnostics and retries a failed source lookup once', async() => {
    let resolveFirst!: (participants: any[]) => void;
    const first = new Promise<any[]>((resolve) => {
      resolveFirst = resolve;
    });
    const {instance, managers} = makeInstance();
    const reportConferenceBug = vi.spyOn(instance as any, 'reportConferenceBug');
    const getBySources = vi.fn()
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce([]);
    const saveApiParticipant = vi.fn(async() => {});
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: getBySources,
      saveApiParticipant
    };
    (instance as any).e2eStatus = {
      groupState: {participants: [{userId: BOB}]}
    };
    const {emitRecvDiag} = attachResolutionWorker(instance);

    emitRecvDiag({ssrc: 31337, reason: 'unmapped'});
    emitRecvDiag({ssrc: 31337, reason: 'unmapped', sustained: true});
    expect(getBySources).toHaveBeenCalledTimes(1);

    resolveFirst([]);
    await vi.waitFor(() => expect(getBySources).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(reportConferenceBug).toHaveBeenCalledTimes(1));
    expect(saveApiParticipant).not.toHaveBeenCalled();
    expect((instance as any).e2eSourceResolutions.size).toBe(0);
  });

  it('keeps one participant-source lookup in flight and batches the queued diagnostics', async() => {
    let resolveFirst!: (participants: any[]) => void;
    const first = new Promise<any[]>((resolve) => {
      resolveFirst = resolve;
    });
    const {instance, managers} = makeInstance();
    const getBySources = vi.fn()
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce([]);
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: getBySources,
      saveApiParticipant: vi.fn(async() => {})
    };
    (instance as any).e2eStatus = {groupState: {participants: [{userId: BOB}]}};
    const {emitRecvDiag} = attachResolutionWorker(instance);

    for(let source = 1; source <= 101; ++source) {
      emitRecvDiag({ssrc: source, reason: 'unmapped'});
    }
    expect(getBySources).toHaveBeenCalledTimes(1);
    expect(getBySources.mock.calls[0][1]).toEqual([1]);

    resolveFirst([]);
    await vi.waitFor(() => expect(getBySources).toHaveBeenCalledTimes(2));
    expect(getBySources.mock.calls[1][1]).toHaveLength(100);
  });

  it('does not start a source lookup before the accepted join activates e2e', () => {
    const {instance, managers} = makeInstance();
    const getBySources = vi.fn(async() => []);
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: getBySources,
      saveApiParticipant: vi.fn(async() => {})
    };
    const {emitRecvDiag} = attachResolutionWorker(instance, false);

    emitRecvDiag({ssrc: 4242, reason: 'unmapped'});

    expect(getBySources).not.toHaveBeenCalled();
  });

  it('ignores a source lookup that completes after cleanup', async() => {
    let resolveLookup!: (participants: any[]) => void;
    const lookup = new Promise<any[]>((resolve) => {
      resolveLookup = resolve;
    });
    const participant = {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: String(BOB)},
      pFlags: {},
      source: 4242,
      date: 1
    } as any;
    const {instance, managers} = makeInstance();
    const saveApiParticipant = vi.fn(async() => {});
    managers.appGroupCallsManager = {
      getGroupCallParticipantsBySources: vi.fn(() => lookup),
      saveApiParticipant
    };
    (instance as any).e2eStatus = {
      groupState: {participants: [{userId: BOB}]}
    };
    const {emitRecvDiag} = attachResolutionWorker(instance);

    emitRecvDiag({ssrc: 4242, reason: 'unmapped'});
    instance.cleanup();
    resolveLookup([participant]);
    await Promise.resolve();
    await Promise.resolve();

    expect(saveApiParticipant).not.toHaveBeenCalled();
  });

  it('is a no-op when the same user re-registers the same source', () => {
    const {instance, setSsrcUsers} = makeInstance();
    instance.registerE2eUserSsrc(ALICE, 55);
    const callsAfterFirst = setSsrcUsers.mock.calls.length;
    instance.registerE2eUserSsrc(ALICE, 55);
    expect(setSsrcUsers.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('legacy group call media allocation', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  // Conference sources are capped in registerE2eUserSsrcGroup; the legacy SFU
  // path had no bound at all, so one participant list could demand a decoder
  // per announced source without limit.
  function makeLegacyInstance(entryCount: number) {
    const {instance} = makeInstance();
    (instance as any).e2e = undefined;
    const description = installParticipantDescription(instance);
    description.entries = new Array(entryCount).fill({type: 'audio', direction: 'recvonly'});
    description.createEntry = vi.fn(() => ({
      type: 'audio',
      transceiver: {receiver: {}},
      setDirection: vi.fn(),
      setEndpoint: vi.fn(),
      createTransceiver: vi.fn()
    }));
    (instance as any).connections.main.connection = {iceConnectionState: 'connected', addTransceiver: vi.fn()};
    const report = vi.spyOn(instance as any, 'reportConferenceBug').mockImplementation(() => {});
    return {description, instance, report};
  }

  const bobRow = {
    _: 'groupCallParticipant',
    peer: {_: 'peerUser', user_id: String(BOB)},
    pFlags: {},
    source: 4242,
    date: 1
  } as any;

  it('allocates a decoder for a new source while under the cap', () => {
    const {description, instance, report} = makeLegacyInstance(1023);

    instance.onParticipantUpdate(bobRow);

    expect(description.createEntry).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it('stops allocating once the server announced more streams than the call can hold', () => {
    const {description, instance, report} = makeLegacyInstance(1024);

    instance.onParticipantUpdate(bobRow);

    expect(description.createEntry).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      'the call server announced more media streams than this call can hold',
      expect.objectContaining({source: 4242, entries: 1024})
    );
  });
});
