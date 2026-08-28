import type {AppGroupCallsManager, GroupCallConnectionType, GroupCallId, GroupCallOutputSource} from '@appManagers/appGroupCallsManager';
import {IS_SAFARI} from '@environment/userAgent';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import safeAssign from '@helpers/object/safeAssign';
import throttle from '@helpers/schedulers/throttle';
import {GroupCall, GroupCallParticipant, InputGroupCall} from '@layer';
import {logger} from '@lib/logger';
import {NULL_PEER_ID} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
import CallInstanceBase, {TryAddTrackOptions} from '@lib/calls/callInstanceBase';
import GroupCallConnectionInstance from '@lib/calls/groupCallConnectionInstance';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import getScreenConstraints from '@lib/calls/helpers/getScreenConstraints';
import getScreenStream from '@lib/calls/helpers/getScreenStream';
import getStream from '@lib/calls/helpers/getStream';
import getVideoConstraints from '@lib/calls/helpers/getVideoConstraints';
import stopTrack from '@lib/calls/helpers/stopTrack';
import localConferenceDescription from '@lib/calls/localConferenceDescription';
import {WebRTCLineType} from '@lib/calls/sdpBuilder';
import StreamManager from '@lib/calls/streamManager';
import {Ssrc} from '@lib/calls/types';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {AppManagers} from '@lib/managers';
import {generateSelfVideo, makeSsrcFromParticipant, makeSsrcsFromParticipant} from '@lib/calls/groupCallsController';
import type {EncryptWorkerHost} from '@lib/calls/e2e/encryptWorkerHost';
import type {CallStatusSnapshot} from '@lib/calls/e2e/encryptWorkerProtocol';
import {
  conferenceUserIdToPeerId,
  findChainOnlyMembers,
  pruneGroupState
} from '@lib/calls/e2e/conferenceMembership';

// If a conference poller hasn't reached the server in this long while the call
// is alive, the watchdog forces recovery. Comfortably past the poll cadences
// (chain 1.5s, participants 5s) so transient network hiccups don't trip it.
const E2E_SYNC_STALL_MS = 15000;
// How often the watchdog checks for the stall above.
const E2E_WATCHDOG_INTERVAL_MS = 5000;

// How long a chain member must stay absent from COMPLETE SFU rosters before we
// remove it from the blockchain.
//
// tdesktop prunes on the first complete roster (`checkStaleParticipants`), but
// it only ever compares after re-requesting the participant list. Our roster
// poll is on a timer, so the same immediacy would race a real joiner: their
// block reaches the chain the moment `phone.joinGroupCall` accepts it, and the
// SFU can list them a beat later — pruning that window kicks people out of the
// call they just joined. The row is published as "has access" the instant it's
// detected, so the disclosure requirement is met immediately; only the removal
// waits out this window.
const CONFERENCE_STALE_GRACE_MS = 10000;
// Floor between removal attempts. A rejected removal (chain raced ahead — or a
// server that refuses to prune) must not turn the 5s roster poll into an RPC
// loop.
const CONFERENCE_PRUNE_RETRY_MS = 15000;
// Consecutive removal failures before we surface a breadcrumb. A server that
// keeps rejecting the removal while the identity keeps holding the call key is
// exactly the case the user needs told about.
const CONFERENCE_PRUNE_FAILURES_BEFORE_REPORT = 3;

export default class GroupCallInstance extends CallInstanceBase<{
  state: (state: GROUP_CALL_STATE) => void,
  pinned: (source?: GroupCallOutputSource) => void,
  // Fired whenever the e2e worker reports a new snapshot — UI listens for
  // verification phase + emoji fingerprint changes. Only fires when this
  // instance is a conference (i.e. `e2e` is set).
  e2eStatus: (status: CallStatusSnapshot) => void,
  // Fired when the set of authenticated e2e members that the SFU roster does
  // NOT list changes. These identities hold the current shared key, so the UI
  // must show them (see conferenceMembership.ts). `previous` lets the roster
  // list retire the rows it added.
  membersWithAccess: (change: {current: PeerId[], previous: PeerId[]}) => void,
}> {
  public id: GroupCallId;
  public chatId: ChatId;
  public handleUpdateGroupCallParticipants: boolean;
  public updatingSdp: boolean;
  public isSpeakingMap: Map<any, any>;
  public connections: {[k in GroupCallConnectionType]?: GroupCallConnectionInstance};
  public groupCall: GroupCall;
  public participant: GroupCallParticipant;

  // ===== E2E (conference) mode =====
  // When set, this instance is a TdE2E-encrypted conference call rather than
  // a legacy voice chat. The worker owns the private key + per-frame crypto;
  // the SFU plumbing below stays identical. `selfUserId` identifies us in the
  // e2e group_state (matches our PrivateKey's publicKey).
  public e2e?: EncryptWorkerHost;
  public selfUserId?: bigint;
  // Latest snapshot from the worker (height, group state, emoji fingerprint).
  public e2eStatus?: CallStatusSnapshot;
  // ssrc → e2e user_id mapping. Populated from SFU signaling so the recv
  // RTCRtpScriptTransform knows who sent each frame for Ed25519 verify.
  public e2eUserBySsrc: Map<number, bigint> = new Map();

  // will be set with negotiation
  public joined: boolean;

  private pinnedSources: Array<GroupCallOutputSource>;
  private participantsSsrcs: Map<PeerId, Ssrc[]>;
  private hadAutoPinnedSources: Set<GroupCallOutputSource>;
  private dispatchPinnedThrottled: () => void;
  private startVideoSharingPromise: Promise<void>;
  private startScreenSharingPromise: Promise<void>;

  private managers: AppManagers;

  constructor(options: {
    id: GroupCallInstance['id'],
    chatId: GroupCallInstance['chatId'],
    isSpeakingMap?: GroupCallInstance['isSpeakingMap'],
    connections?: GroupCallInstance['connections'],
    managers: AppManagers
  }) {
    super();

    safeAssign(this, options);

    if(!this.log) {
      this.log = logger('GROUP-CALL');
    }

    if(!this.connections) {
      this.connections = {};
    }

    if(!this.isSpeakingMap) {
      this.isSpeakingMap = new Map();
    }

    this.pinnedSources = [];
    this.participantsSsrcs = new Map();
    this.hadAutoPinnedSources = new Set();
    this.dispatchPinnedThrottled = throttle(() => {
      this.dispatchEvent('pinned', this.pinnedSource);
    }, 0, false);

    this.addEventListener('state', (state) => {
      if(state === GROUP_CALL_STATE.CLOSED) {
        this.cleanup();
      }
    });
  }

  public cleanup(): void {
    this.stopE2eChainPolling();
    this.membersWithAccess.clear();
    this.staleSince.clear();
    // Terminate the e2e worker so its Web Worker thread exits. Best-effort —
    // the controller may have already done so via its own state listener,
    // but a double-terminate is harmless (encryptWorkerHost guards).
    if(this.e2e) {
      void this.e2e.terminate().catch((): undefined => undefined);
      this.e2e = undefined;
    }
    super.cleanup();
  }

  // ===== E2E (conference) hookup =====
  //
  // Called by GroupCallsController.startConference / joinConference after
  // the worker has been initialised. The instance subscribes to worker
  // status events + relays inbound chain blocks from rootScope, and
  // automatically flushes outbound emoji broadcasts via the conference
  // MTProto channel.
  public attachE2e(worker: EncryptWorkerHost, selfUserId: bigint): void {
    this.e2e = worker;
    this.selfUserId = selfUserId;

    worker.addEventListener('status', (ev) => {
      this.e2eStatus = ev.status;
      this.dispatchEvent('e2eStatus', ev.status);

      // Conference membership lives on the e2e blockchain — the SFU doesn't push
      // `updateGroupCallParticipants` for conferences the way it does for legacy
      // voice chats. Every applied chain block re-emits this status, so when the
      // group_state member set changes (someone joined/left), re-sync the SFU
      // participant roster + count off it. Cheap string-key diff avoids
      // re-polling on unrelated status churn (e.g. emoji verification phases).
      const members = (ev.status?.groupState?.participants || [])
      .map((p) => p.userId.toString())
      .sort()
      .join(',');
      if(members !== this.prevConferenceMembers) {
        this.prevConferenceMembers = members;
        void this.refreshConferenceParticipants();
      }
    });
    worker.addEventListener('pendingOutbound', () => {
      void this.flushE2eOutbound();
    });
    worker.addEventListener('callFailed', (ev) => {
      this.log.error('e2e: callFailed — hanging up; reason:', ev?.message);
      this.hangUp(true);
    });

    // Recv-transform breadcrumb (deduped worker-side). A sustained `unmapped`
    // is the "seen but not heard" failure: an inbound SSRC the e2e map never
    // learned, so its frames stay encrypted → silence. `mappedUser` shows what
    // WE pushed for that SSRC — '(none)' means the participant update that
    // should have registered it never ran (the conference-sync stall above).
    worker.addEventListener('recvDiag', (ev) => {
      const mappedUser = this.e2eUserBySsrc.get(ev.ssrc >>> 0);
      this.log.warn(
        'e2e recv diagnostic:', ev.reason, ev.sustained ? '(SUSTAINED)' : '',
        'ssrc', ev.ssrc >>> 0,
        'mappedUser', mappedUser !== undefined ? mappedUser.toString() : '(none)',
        ev.message || ''
      );
      // Sustained ⇒ a real stuck stream (not a transient at-join blip): the
      // "seen but not heard" symptom. Surface it to the user.
      if(ev.sustained) {
        this.reportConferenceBug(
          ev.reason === 'unmapped' ?
            'inbound media undecryptable — unmapped SSRC (participant seen but not heard)' :
            'inbound media failed to decrypt (stale key?)',
          {
            ssrc: ev.ssrc >>> 0,
            mappedUser: mappedUser !== undefined ? mappedUser.toString() : null,
            message: ev.message
          }
        );
      }
    });

    // Inbound chain delivery — sub_chain_id 0 is the block chain, 1 is the
    // verification broadcast channel. The server pushes these updates when it
    // can, but we also poll because conference push delivery is best-effort
    // (tdlib: TdE2E::Call::joined → shortPoll(0); shortPoll(1)).
    rootScope.addEventListener('group_call_chain_blocks', ({callId, subChainId, blocks, nextOffset}) => {
      if(callId !== this.id || !this.e2e) return;
      void this.deliverE2eChainBlocks(subChainId, blocks);
      // Advance the poll cursor past what this push delivered. The cursor
      // otherwise only moves on poll responses (pollE2eChain), so a burst of
      // pushes leaves it stale and the next poll re-fetches — and re-delivers —
      // blocks the push already applied. deliverE2eChainBlocks is idempotent
      // now, so this just shrinks the redundant-fetch window; Math.max guards
      // against out-of-order pushes (the broadcast subchain delivers unordered).
      if(typeof nextOffset === 'number' && (subChainId === 0 || subChainId === 1)) {
        this.e2eChainOffsets[subChainId] = Math.max(this.e2eChainOffsets[subChainId], nextOffset);
      }
    });

    this.startE2eChainPolling();
  }

  // ===== TdE2E chain polling =====
  //
  // Mirrors tdlib's per-subchain polling (TdE2E::Call::shortPoll). Both
  // subchains advance independently; we keep the next-offset cursor per
  // subchain and re-issue `phone.getGroupCallChainBlocks` on a slow tick.
  // The push from `updateGroupCallChainBlocks` advances the cursor too.
  private e2eChainPollInterval: ReturnType<typeof setInterval> | undefined;
  private e2eChainOffsets: {0: number; 1: number} = {0: 0, 1: 0};

  // Conference participant reconciliation (see refreshConferenceParticipants).
  // `prevConferenceMembers` is the last e2e group_state member set we synced;
  // the periodic timer is a backstop for changes the blockchain doesn't surface
  // promptly (e.g. an ungraceful disconnect that the SFU drops before a removal
  // block lands). `refreshingConferenceParticipants` de-dupes overlapping runs.
  private prevConferenceMembers = '';
  private conferenceParticipantsInterval: ReturnType<typeof setInterval> | undefined;
  private refreshingConferenceParticipants = false;

  // ===== Chain-only members (blockchain ↔ SFU roster reconciliation) =====
  //
  // Authenticated e2e members that a COMPLETE SFU roster doesn't list. They
  // hold the current shared key, so tdlib's Encryption.md requires us to show
  // them; the protocol additionally requires removing them and rotating the key
  // (`only_left` pruning). See conferenceMembership.ts for the full rationale.
  //
  // Client-side synthetic participants: never saved into the manager cache,
  // never dispatched as `group_call_participant`, `source: 0` so no SSRC map
  // ever sees them.
  private membersWithAccess: Map<PeerId, GroupCallParticipant> = new Map();
  // user_id → when we first saw it missing, for the grace window.
  private staleSince: Map<string, number> = new Map();
  private pruningConferenceMembers = false;
  private lastPruneAttemptAt = 0;
  private consecutivePruneFailures = 0;
  // Set once the media path could not be secured — see failE2eTransform.
  private failedE2eTransform = false;

  // ===== Conference-sync watchdog =====
  //
  // Both conference pollers (pollE2eChain, refreshConferenceParticipants) bail
  // SILENTLY when our cached `groupCall` is missing/discarded — getGroupCallInput
  // throws without it. If that state persists, media keeps flowing but the call
  // stops learning about unmutes/joins: a participant who unmutes is seen (SFU
  // speaking signal is plaintext) but not heard — their audio SSRC never enters
  // the e2e recv map, so the recv transform drops them (silence). Observed
  // live: a ~19-minute stall that only cleared on a manual re-join. These track
  // when each poller last actually REACHED the server; the watchdog re-hydrates
  // `groupCall` and re-kicks the pollers when either goes stale.
  private lastChainPollAt = 0;
  private lastParticipantsRefreshAt = 0;
  private lastPollBailReason = '';
  private e2eWatchdogInterval: ReturnType<typeof setInterval> | undefined;
  private recoveringConferenceSync = false;
  // Cooldown (per reason) for the user-facing bug breadcrumb — see reportConferenceBug.
  private reportedBugAt: Map<string, number> = new Map();

  private startE2eChainPolling(): void {
    if(this.e2eChainPollInterval) return;
    // Seed the watchdog clocks so it grants a full stall window before the
    // first successful poll lands (invitee/slug joins hydrate `groupCall`
    // lazily — see pollE2eChain).
    this.lastChainPollAt = this.lastParticipantsRefreshAt = Date.now();
    const tick = (): void => { void this.pollE2eChain(); };
    // Immediate kick — tdlib does this in `joined()`.
    tick();
    // Steady-state interval: 1500ms is a balance between latency for emoji
    // verification (commit/reveal needs both peers' broadcasts) and load.
    this.e2eChainPollInterval = setInterval(tick, 1500);

    // Backstop SFU participant poll. The blockchain-change trigger (in the
    // worker `status` handler) covers the common join/leave case; this catches
    // anything that changes the SFU roster without a chain delta. 5s matches
    // the official Android conference poll cadence.
    if(!this.conferenceParticipantsInterval) {
      this.conferenceParticipantsInterval = setInterval(() => {
        void this.refreshConferenceParticipants();
      }, 5000);
    }

    // Watchdog: detect + self-heal a silent poller stall (see field comment).
    if(!this.e2eWatchdogInterval) {
      this.e2eWatchdogInterval = setInterval(() => {
        this.e2eWatchdogTick();
      }, E2E_WATCHDOG_INTERVAL_MS);
    }
  }

  private stopE2eChainPolling(): void {
    if(this.e2eChainPollInterval) {
      clearInterval(this.e2eChainPollInterval);
      this.e2eChainPollInterval = undefined;
    }
    if(this.conferenceParticipantsInterval) {
      clearInterval(this.conferenceParticipantsInterval);
      this.conferenceParticipantsInterval = undefined;
    }
    if(this.e2eWatchdogInterval) {
      clearInterval(this.e2eWatchdogInterval);
      this.e2eWatchdogInterval = undefined;
    }
  }

  // Reconcile the SFU participant roster + count for a conference. No-op for
  // legacy voice chats (gated on `this.e2e`) and while closed. The heavy
  // lifting (fresh fetch, leave reconciliation, count) lives in the manager;
  // here we just guard against overlapping runs and a torn-down call.
  private async refreshConferenceParticipants(): Promise<void> {
    if(!this.e2e || this.refreshingConferenceParticipants) return;
    if(this.connectionState === 'closed') return;
    this.refreshingConferenceParticipants = true;
    try {
      // `false` => the manager bailed (no cached groupCall), so the roster sync
      // isn't actually running. Only stamp the watchdog clock on a real fetch.
      const fetched = await this.managers.appGroupCallsManager.refreshConferenceParticipants(this.id);
      if(!fetched) {
        return;
      }

      this.lastParticipantsRefreshAt = Date.now();
      // A truncated page can't tell "absent" from "on the next page", so it must
      // never drive the access list or a removal.
      if(fetched.complete) {
        await this.reconcileConferenceMembership(fetched.userIds);
      }
    } catch(err) {
      this.log.warn('refreshConferenceParticipants', err);
    } finally {
      this.refreshingConferenceParticipants = false;
    }
  }

  /**
   * Compare authenticated e2e membership against the complete SFU roster.
   *
   * The blockchain is the access list: a participant in `group_state` holds the
   * current shared key whether or not the server lists them. So anyone on the
   * chain but off the roster is (a) surfaced to the user right away and (b)
   * scheduled for the protocol's `only_left` removal, which rotates the key
   * away from them. Doing only (b) would leave the user blind whenever the
   * removal is refused; doing only (a) would leave the key shared forever.
   */
  private async reconcileConferenceMembership(rosterUserIds: string[]): Promise<void> {
    const {e2eStatus, selfUserId} = this;
    if(!this.e2e || !e2eStatus || selfUserId === undefined) return;
    if(this.connectionState === 'closed') return;

    const chainOnly = findChainOnlyMembers({
      participants: e2eStatus.groupState.participants,
      rosterUserIds,
      selfUserId
    });

    // Publish BEFORE the grace window: an identity with call access is shown
    // the moment it's known, and stays shown until the removal AND its rotated
    // key have actually been accepted (this recomputes off group_state, so the
    // row clears itself once the removal block lands).
    this.publishMembersWithAccess(chainOnly);

    // Age each identity. Rebuilding the map drops anyone who reappeared on the
    // roster, so a member who flaps starts their window over rather than
    // accumulating time towards removal.
    const now = Date.now();
    const staleSince = new Map<string, number>();
    const prunable: bigint[] = [];
    for(const userId of chainOnly) {
      const key = userId.toString();
      const since = this.staleSince.get(key) ?? now;
      staleSince.set(key, since);
      if(now - since >= CONFERENCE_STALE_GRACE_MS) {
        prunable.push(userId);
      }
    }
    this.staleSince = staleSince;

    if(!prunable.length || this.pruningConferenceMembers) return;
    if(now - this.lastPruneAttemptAt < CONFERENCE_PRUNE_RETRY_MS) return;

    // Detached on purpose: this runs inside the roster poller's
    // `refreshingConferenceParticipants` guard, and a removal RPC that never
    // settles (dead connection) would otherwise wedge the roster refresh for
    // the rest of the call. `pruningConferenceMembers` guards overlap instead.
    void this.pruneConferenceMembers(prunable);
  }

  // Swap in the chain-only set and tell the UI, but only on a real change —
  // this runs on every roster poll.
  private publishMembersWithAccess(userIds: bigint[]): void {
    const next = new Map<PeerId, GroupCallParticipant>();
    for(const userId of userIds) {
      const peerId = conferenceUserIdToPeerId(userId);
      // The roster list is keyed by PeerId, so two chain ids that round to the
      // same one (only possible above 2^53 — see conferenceMembership.ts) can
      // only ever be ONE row. Removal still covers both, since that works off
      // exact ids, but one identity would go undisclosed until it lands. Real
      // user ids are nowhere near that range, so this means the server is
      // feeding us ids no real account has: say so rather than show one row.
      if(next.has(peerId)) {
        this.reportConferenceBug(
          'two e2e members share one displayed peer — one of them cannot be shown',
          {peerId, userIds: userIds.map(String)}
        );
        continue;
      }

      // Reuse the existing synthetic so the row keeps its identity (and its
      // sort index) across polls.
      next.set(peerId, this.membersWithAccess.get(peerId) ?? this.makeMemberWithAccess(userId));
    }

    const previous = [...this.membersWithAccess.keys()];
    if(next.size === previous.length && previous.every((peerId) => next.has(peerId))) {
      return;
    }

    this.membersWithAccess = next;
    if(next.size) {
      this.log.warn(
        'conference: e2e members absent from the SFU roster —', [...next.keys()],
        '— they hold the current call key; showing them and scheduling removal'
      );
    }

    this.dispatchEvent('membersWithAccess', {current: [...next.keys()], previous});
  }

  // The roster UI renders chain-only members through the same row widget as
  // real participants (tdesktop does the same via `updateStateWithAccess`), so
  // give it the minimal participant shape: muted, no video, `date: 0` so the
  // descending sort parks them below everyone actually connected.
  private makeMemberWithAccess(userId: bigint): GroupCallParticipant {
    return {
      _: 'groupCallParticipant',
      peer: {_: 'peerUser', user_id: userId.toString()},
      pFlags: {muted: true, can_self_unmute: true},
      source: 0,
      date: 0
    };
  }

  // Build + submit the `only_left` removal. The block carries both the trimmed
  // group_state and a fresh shared key addressed only to the survivors, so the
  // removed identity can't decrypt anything past it.
  private async pruneConferenceMembers(userIds: bigint[]): Promise<void> {
    const input = this.toInputGroupCall();
    // Re-check both here, not just at the reconcile call site: this runs
    // detached, so anything thrown escapes as an unhandled rejection rather
    // than reaching a caller.
    if(!input || !this.e2e || !this.e2eStatus) return;

    // Re-derive against the CURRENT chain tip: it may have advanced since the
    // roster diff, and another client (or an earlier attempt) may already have
    // removed these identities. Submitting a state that changes nothing would
    // burn a block and rotate the key for no reason.
    const {groupState} = this.e2eStatus;
    const newGroupState = pruneGroupState(groupState, userIds);
    if(newGroupState.participants.length === groupState.participants.length) {
      return;
    }

    this.pruningConferenceMembers = true;
    this.lastPruneAttemptAt = Date.now();
    const ids = userIds.map(String);
    try {
      const block = await this.e2e.buildChangeStateBlock({newGroupState});

      await this.managers.appCallsManager.deleteConferenceCallParticipants({
        call: input,
        ids,
        block,
        onlyLeft: true
      });

      this.consecutivePruneFailures = 0;
      this.log('conference: removed stale e2e members + rotated the key —', ids);
    } catch(err) {
      const type = (err as ApiError)?.type as string | undefined;
      ++this.consecutivePruneFailures;

      // The chain moved under us between build and submit (someone joined or
      // another client pruned first). Benign — our own state advances with the
      // new block and the next pass rebuilds on top of it.
      if(type === 'CONF_WRITE_CHAIN_INVALID' || type === 'BLOCK_INVALID') {
        this.log('conference: removal raced the chain, retrying next pass —', type);
      } else if(type === 'GROUPCALL_FORBIDDEN') {
        // Same trigger tdesktop rejoins on (calls_group_call.cpp:844) — our
        // equivalent re-hydrates the call and re-kicks both pollers.
        this.log.warn('conference: removal forbidden, recovering —', type);
        void this.recoverConferenceSync();
      } else {
        this.log.error('conference: removal failed', err);
      }

      // Persistent refusal while the identity keeps holding the key is the
      // shape a hostile relay would take, so make sure it leaves a trace.
      if(this.consecutivePruneFailures >= CONFERENCE_PRUNE_FAILURES_BEFORE_REPORT) {
        this.reportConferenceBug(
          'could not remove e2e members that are absent from the call roster (they still hold the call key)',
          {ids, error: type || String(err), attempts: this.consecutivePruneFailures}
        );
      }
    } finally {
      this.pruningConferenceMembers = false;
    }
  }

  /** Peers on the e2e chain that the SFU roster doesn't list. */
  public get memberWithAccessPeerIds(): PeerId[] {
    return [...this.membersWithAccess.keys()];
  }

  /** Whether this row is a chain-only member rather than a real participant. */
  public isMemberWithAccess(peerId: PeerId): boolean {
    return this.membersWithAccess.has(peerId);
  }

  private async pollE2eChain(): Promise<void> {
    if(!this.e2e) return;
    // Lazy-hydrate `groupCall` for invitee paths (slug / inviteMessage join):
    // the join response carries `updateGroupCall` with the real id+access_hash
    // and the manager caches it, but the instance's own `groupCall` reference
    // wasn't set during joinConferenceCommon (we didn't have the id yet).
    // Pull from the cache here once it lands.
    if(!this.groupCall) {
      const cached = await this.managers.appGroupCallsManager
      .getGroupCall(this.id)
      .catch((): undefined => undefined);
      if(cached && cached._ === 'groupCall') {
        this.groupCall = cached;
        // For invitee/slug joins the real groupCall (with participants_count,
        // title, …) only lands here, AFTER the topbar/popup first rendered off
        // an undefined ref (showing the "1" fallback count). The hydration
        // itself fires no event, so nudge a re-render — otherwise the count
        // stays frozen at 1 until the next unrelated state/participant change.
        this.dispatchEvent('state', this.state);
      }
    }
    const input = this.toInputGroupCall();
    if(!input) {
      // The silent stall the watchdog exists for. Trace it on transition.
      this.notePollBail(this.groupCall ? 'groupCall discarded' : 'groupCall missing');
      return;
    }
    this.notePollBail('');
    // We've reached the polling stage — stamp the watchdog clock at issue time
    // (not completion) so a slow response doesn't look like a stall.
    this.lastChainPollAt = Date.now();

    // Poll both subchains in parallel. Each returns the slice from
    // `offset` onward; we advance `offset` by the number of blocks returned.
    await Promise.all([0, 1].map(async(sub) => {
      const subChainId = sub as 0 | 1;
      try {
        const updates = await this.managers.appCallsManager.getGroupCallChainBlocks(
          input,
          subChainId,
          this.e2eChainOffsets[subChainId],
          // limit must be > 0 — server doesn't auto-pick a default. Pull a
          // generous window so we catch any backlog from a brief disconnect
          // but small enough to stay cheap.
          16
        );
        if(updates._ !== 'updates' && updates._ !== 'updatesCombined') return;
        for(const u of (updates as any).updates) {
          if(u._ !== 'updateGroupCallChainBlocks') continue;
          if(u.sub_chain_id !== subChainId) continue;
          if(u.blocks?.length) {
            await this.deliverE2eChainBlocks(subChainId, u.blocks);
          }
          if(typeof u.next_offset === 'number') {
            this.e2eChainOffsets[subChainId] = u.next_offset;
          }
        }
      } catch(err) {
        // Transient errors are expected (network blips, brief auth churn).
        // Log and let the next tick retry.
        this.log.warn('pollE2eChain: subchain', subChainId, err);
      }
    }));
  }

  // Transition-logged bail tracing for pollE2eChain — logs once when the chain
  // poll starts (or stops) being unable to reach the server, not every tick.
  private notePollBail(reason: string): void {
    if(reason === this.lastPollBailReason) return;
    const wasBailing = !!this.lastPollBailReason;
    this.lastPollBailReason = reason;
    if(reason) this.log.warn('pollE2eChain: not polling —', reason);
    else if(wasBailing) this.log('pollE2eChain: reached server, resuming');
  }

  // Runs on E2E_WATCHDOG_INTERVAL_MS. If either conference poller hasn't reached
  // the server within E2E_SYNC_STALL_MS while the call is alive, force recovery.
  private e2eWatchdogTick(): void {
    if(!this.e2e || this.connectionState === 'closed' || this.recoveringConferenceSync) return;
    const now = Date.now();
    const chainStall = now - this.lastChainPollAt;
    const participantsStall = now - this.lastParticipantsRefreshAt;
    if(chainStall < E2E_SYNC_STALL_MS && participantsStall < E2E_SYNC_STALL_MS) return;

    this.log.warn(
      'conference sync stalled — chainPoll', Math.round(chainStall / 1000) + 's ago,',
      'participants', Math.round(participantsStall / 1000) + 's ago;',
      'lastBail:', this.lastPollBailReason || '(none)', '— forcing recovery'
    );
    this.reportConferenceBug('conference sync stalled (pollers not reaching the server)', {
      chainStallSec: Math.round(chainStall / 1000),
      participantsStallSec: Math.round(participantsStall / 1000),
      lastBail: this.lastPollBailReason || '(none)'
    });
    void this.recoverConferenceSync();
  }

  // User-facing breadcrumb for the "I can't hear someone / had to re-join" class
  // of conference bug. Goes STRAIGHT to console (survives prod minify; not behind
  // the DEBUG-gated logger) plus a `window.__conferenceBug(s)` marker the user can
  // inspect any time — so they know to run downloadLogs() and send the file.
  // Also logged to the ring buffer (this.log.error) so it lands in that export.
  // Deduped per reason with a 1-minute cooldown so a persistent stall can't spam.
  private reportConferenceBug(reason: string, details: Record<string, unknown>): void {
    const now = Date.now();
    if(now - (this.reportedBugAt.get(reason) || 0) < 60000) return;
    this.reportedBugAt.set(reason, now);

    const payload = {reason, at: new Date(now).toISOString(), callId: String(this.id), ...details};
    this.log.error('CONFERENCE BUG —', reason, payload);
    try {
      console.warn(
        '%c⚠ TELEGRAM CONFERENCE BUG',
        'background:#c0392b;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px',
        `\n${reason}\n→ run downloadLogs() and send the file`,
        payload
      );
      const g = self as any;
      (g.__conferenceBugs ??= []).push(payload);
      g.__conferenceBug = payload;
    } catch{}
  }

  // Public surface for the controller's media-transport watchdog
  // (groupCallsController): ICE reached `connected` but the RTCPeerConnection
  // never did, i.e. the DTLS handshake didn't complete, so no audio/video ever
  // flows. Reuses the same user-visible breadcrumb + ring-buffer log path.
  public reportMediaTransportStall(details: Record<string, unknown>): void {
    this.reportConferenceBug('media transport stalled — ICE connected but DTLS did not complete (no audio/video)', details);
  }

  // Re-hydrate `groupCall` (the dependency both pollers silently bail on) and
  // re-kick them. Re-seeds the manager cache from our own copy first, because
  // once the manager loses the call `getGroupCallInput` throws and getGroupCallFull
  // can't bootstrap. Guarded against overlapping runs.
  private async recoverConferenceSync(): Promise<void> {
    if(this.recoveringConferenceSync) return;
    this.recoveringConferenceSync = true;
    try {
      if(this.groupCall && this.groupCall._ === 'groupCall') {
        await this.managers.appGroupCallsManager.saveGroupCall(this.groupCall)
        .catch((err) => this.log.warn('recoverConferenceSync: saveGroupCall', err));
      }

      const fresh = await this.managers.appGroupCallsManager.getGroupCallFull(this.id, true)
      .catch((err): undefined => {
        this.log.warn('recoverConferenceSync: getGroupCallFull failed', err);
        return undefined;
      });
      if(fresh && fresh._ === 'groupCall') {
        this.groupCall = fresh;
      }

      // Re-kick both pollers now that the cache should be warm. They stamp the
      // watchdog clocks themselves on success, quieting the next tick.
      await Promise.all([this.pollE2eChain(), this.refreshConferenceParticipants()]);
    } finally {
      this.recoveringConferenceSync = false;
    }
  }

  private async flushE2eOutbound(): Promise<void> {
    if(!this.e2e) return;
    const input = this.toInputGroupCall();
    if(!input) return;
    let messages: Uint8Array[];
    try {
      messages = await this.e2e.pullOutbound();
    } catch(err) {
      this.log.error('flushE2eOutbound: pullOutbound failed', err);
      return;
    }
    for(const bytes of messages) {
      try {
        await this.managers.appCallsManager.sendConferenceCallBroadcast(input, bytes);
      } catch(err) {
        this.log.error('flushE2eOutbound: sendConferenceCallBroadcast failed', err);
      }
    }
  }

  private async deliverE2eChainBlocks(subChainId: number, blocks: Uint8Array[]): Promise<void> {
    if(!this.e2e) return;
    if(subChainId === 0) {
      for(const block of blocks) {
        try {
          await this.e2e.applyBlock({serverBlock: block});
        } catch(err) {
          this.log.error('deliverE2eChainBlocks: applyBlock failed', err);
        }
      }
    } else if(subChainId === 1) {
      for(const b of blocks) {
        try {
          await this.e2e.receiveInbound({serverMessage: b});
        } catch(err) {
          this.log.error('deliverE2eChainBlocks: receiveInbound failed', err);
        }
      }
    } else {
      this.log.warn('deliverE2eChainBlocks: unknown sub_chain_id', subChainId);
    }
  }

  // Attach a recv transform to ONE receiver. Used by the pre-emptive
  // `addTransceiver` path in groupCallsController — receivers must have
  // their transform attached BEFORE the codec produces a frame, or Chrome
  // silently bypasses them (the parallel createEncodedStreams API throws
  // "Too late to create encoded streams" for the same condition).
  public attachE2eRecvTransform(
    receiver: RTCRtpReceiver,
    kind: 'audio' | 'video',
    channelId = 0
  ): void {
    if(!this.e2e || (receiver as any).transform) return;
    try {
      receiver.transform = this.e2e.newRtcScriptTransform({direction: 'recv', channelId, kind});
    } catch(err) {
      this.failE2eTransform('recv', err);
    }
  }

  /**
   * Fallback for a remote track whose receiver never got a recv transform at
   * transceiver-creation time (the normal attach point — see onParticipantUpdate).
   *
   * Attaching one now is best-effort ONLY: Chrome binds the decoder before the
   * `track` event fires and silently bypasses a transform attached after that,
   * so frames from this receiver may never pass through our decryption at all.
   * That is security-relevant, not just broken audio — media the relay puts on
   * an SSRC it never signalled would reach the decoder without being
   * authenticated. The bypass isn't observable from here, so at least make the
   * condition loud instead of silent.
   */
  public attachE2eRecvTransformLate(receiver: RTCRtpReceiver, kind: 'audio' | 'video'): void {
    // Attached at creation time — the expected path, nothing to say.
    if(!this.e2e || (receiver as any).transform) return;

    this.reportConferenceBug(
      'inbound media track appeared with no e2e transform attached at creation — it cannot be authenticated',
      {kind}
    );
    this.attachE2eRecvTransform(receiver, kind);
  }

  // A conference whose media path is missing our transforms is not end-to-end
  // encrypted, whatever the badge in the header says: outbound frames would
  // reach the SFU as plaintext, and inbound frames would reach the decoder
  // unauthenticated. There is no safe degraded mode, so an attach failure ends
  // the call rather than quietly downgrading it — the previous behaviour was to
  // log and carry on, which shipped the user's microphone in the clear.
  //
  // Leaving (not discarding) is the proportionate response: our client can't
  // secure its own media, but everyone else's call is unaffected. Deferred a
  // microtask because this fires from inside the sender/transceiver setup loop,
  // which must not have the connections torn down under it.
  private failE2eTransform(direction: 'send' | 'recv', err: unknown): void {
    this.log.error(`attachE2e${direction === 'send' ? 'Send' : 'Recv'}Transform`, err);
    this.reportConferenceBug(
      'end-to-end encryption could not be attached to the media path — leaving the call',
      {direction, error: (err as Error)?.message || String(err)}
    );
    // Attach runs per sender/receiver, so one broken environment fails it many
    // times over; tear down once.
    if(this.failedE2eTransform) return;
    this.failedE2eTransform = true;
    queueMicrotask(() => void this.hangUp());
  }

  // Attach a send transform to ONE sender. Called from the streamManager's
  // `onSenderCreated` hook so we slot the transform between addTransceiver
  // and replaceTrack — the only window where Chrome will accept it without
  // silently dropping frames.
  public attachE2eSendTransform(
    sender: RTCRtpSender,
    kind: 'audio' | 'video',
    channelId = 0
  ): void {
    if(!this.e2e || (sender as any).transform) return;
    try {
      sender.transform = this.e2e.newRtcScriptTransform({direction: 'send', channelId, kind});
    } catch(err) {
      this.failE2eTransform('send', err);
    }
  }

  // ssrc ↔ user_id mapping is populated externally as the SFU signals
  // participants. Push the full table to the worker so its recv transform
  // can dispatch each frame by `frame.getMetadata().synchronizationSource`.
  public registerE2eUserSsrc(userId: bigint, ssrc: number): void {
    const normalized = ssrc >>> 0;
    if(this.e2eUserBySsrc.get(normalized) === userId) return;
    this.e2eUserBySsrc.set(normalized, userId);
    this.syncSsrcMapToWorker();
  }

  // Replace the SSRC table on the worker side. Cheap enough on every
  // change — the table is small (one entry per active participant).
  private syncSsrcMapToWorker(): void {
    if(!this.e2e) return;
    const entries: Array<[number, bigint]> = [];
    for(const [ssrc, userId] of this.e2eUserBySsrc) entries.push([ssrc, userId]);
    void this.e2e.setSsrcUsers(entries).catch((err) => {
      this.log.warn('syncSsrcMapToWorker failed', err);
    });
  }

  // Convenience: build an InputGroupCall from our cached groupCall payload.
  // Returns undefined for discarded calls (no access_hash).
  public toInputGroupCall(): InputGroupCall | undefined {
    const c = this.groupCall;
    if(!c || c._ === 'groupCallDiscarded') return undefined;
    return {_: 'inputGroupCall', id: c.id, access_hash: c.access_hash};
  }

  get connectionState() {
    // Optional: `connections.main` only exists from createConnectionInstance
    // onward, but the conference pollers start earlier — attachE2e kicks them
    // off, and `worker.init` emits its first `status` (→ roster refresh →
    // membership reconciliation) before the connection is built. Dereferencing
    // blindly threw a TypeError there, which surfaced as an unhandled rejection
    // in the poller and skipped the FIRST reconciliation of the call. Undefined
    // reads as "not closed" below and as CONNECTING in `state`, which is what
    // that window actually is.
    return this.connections.main?.connection?.iceConnectionState;
  }

  get state() {
    const {connectionState} = this;
    if(connectionState === 'closed') {
      return GROUP_CALL_STATE.CLOSED;
    } else if(connectionState !== 'connected' && (!IS_SAFARI || connectionState !== 'completed')) {
      return GROUP_CALL_STATE.CONNECTING;
    } else {
      const {participant} = this;
      // Conference invitee paths may reach `connected` before the server
      // sends our self-participant update (the SFU lists us in the next
      // `phone.getGroupCallParticipants` reply, which lands after the SDP
      // exchange completes). Treat "connected but no self yet" as MUTED —
      // we asked to join muted, and waiting for the participant payload
      // is purely informational.
      if(!participant) {
        return GROUP_CALL_STATE.MUTED;
      }
      if(!participant.pFlags.can_self_unmute) {
        return GROUP_CALL_STATE.MUTED_BY_ADMIN;
      } else if(participant.pFlags.muted) {
        return GROUP_CALL_STATE.MUTED;
      } else {
        return GROUP_CALL_STATE.UNMUTED;
      }
    }
  }

  get participants() {
    return this.managers.appGroupCallsManager.getCachedParticipants(this.id);
  }

  get isSharingScreen() {
    return !!this.connections.presentation;
  }

  get pinnedSource() {
    return this.pinnedSources[this.pinnedSources.length - 1];
  }

  public get isMuted() {
    return this.state !== GROUP_CALL_STATE.UNMUTED;
  }

  public get isClosing() {
    const {state} = this;
    return state === GROUP_CALL_STATE.CLOSED;
  }

  public get streamManager(): StreamManager {
    return this.connections.main.streamManager;
  }

  public get description(): localConferenceDescription {
    return this.connections.main.description;
  }

  public pinSource(source: GroupCallOutputSource) {
    indexOfAndSplice(this.pinnedSources, source);
    this.pinnedSources.push(source);
    this.dispatchPinnedThrottled();
  }

  public unpinSource(source: GroupCallOutputSource) {
    this.hadAutoPinnedSources.delete(source);
    indexOfAndSplice(this.pinnedSources, source);
    this.dispatchPinnedThrottled();
  }

  public unpinAll() {
    this.pinnedSources.length = 0;
    this.dispatchPinnedThrottled();
  }

  public async getParticipantByPeerId(peerId: PeerId) {
    if(NULL_PEER_ID === peerId) {
      return this.participant;
    }

    // Real SFU rows win: once a chain-only member finally shows up on the
    // roster, their live state takes over the row in place.
    return (await this.participants).get(peerId) ?? this.membersWithAccess.get(peerId);
  }

  public toggleMuted() {
    return this.requestAudioSource(true).then(() => this.changeUserMuted(NULL_PEER_ID));
  }

  public async changeUserMuted(peerId: PeerId, muted?: boolean) {
    const participant = await this.getParticipantByPeerId(peerId);
    if(NULL_PEER_ID === peerId && participant.pFlags.can_self_unmute) {
      muted = muted === undefined ? !participant.pFlags.muted : muted;
    }

    return this.editParticipant(participant, {muted});
  }

  public getElement(endpoint: GroupCallOutputSource) {
    return super.getElement(endpoint);
  }

  public getVideoElementFromParticipantByType(participant: GroupCallParticipant, type: 'video' | 'presentation') {
    let source: GroupCallOutputSource;
    if(participant.pFlags.self) {
      const connectionType: GroupCallConnectionType = type === 'video' ? 'main' : 'presentation';
      source = connectionType;
    } else {
      const codec = participant[type];
      source = codec.source_groups[0].sources[0];
    }

    const element = this.getElement(source) as HTMLVideoElement;
    if(!element) return;

    const clone = element.cloneNode() as typeof element;
    clone.srcObject = element.srcObject;
    return {video: clone, source};
  }

  public createConnectionInstance(options: {
    streamManager: StreamManager,
    type: GroupCallConnectionType,
    options: GroupCallConnectionInstance['options'],
  }) {
    return this.connections[options.type] = new GroupCallConnectionInstance({
      groupCall: this,
      log: this.log.bindPrefix(options.type),
      managers: this.managers,
      ...options
    });
  }

  public changeRaiseHand(raise: boolean) {
    return this.editParticipant(this.participant, {raiseHand: raise});
  }

  public async startScreenSharingInternal() {
    try {
      const type: GroupCallConnectionType = 'presentation';

      const stream = await getScreenStream(getScreenConstraints());
      // The screen-picker can stay open for seconds; the user can hang up
      // before it resolves. hangUp() already walked this.connections and never
      // saw the presentation connection (it didn't exist yet), so building it
      // now would leave the screen capture live forever — release and bail.
      if(this.isClosing) {
        stream.getTracks().forEach((t) => stopTrack(t));
        return;
      }
      const streamManager = new StreamManager();

      const connectionInstance = this.createConnectionInstance({
        streamManager,
        type,
        options: {
          type
        }
      });

      const connection = connectionInstance.createPeerConnection();
      connection.addEventListener('negotiationneeded', () => {
        connectionInstance.negotiate();
      });

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if(this.connections.presentation) { // maybe user has stopped screensharing through browser's ui
          this.stopScreenSharing();
        }
      }, {once: true});

      connectionInstance.createDescription();
      connectionInstance.addInputVideoStream(stream);
    } catch(err) {
      this.log.error('start screen sharing error', err);
    }
  }

  public startScreenSharing() {
    return this.startScreenSharingPromise ??= this.startScreenSharingInternal().finally(() => {
      this.startScreenSharingPromise = undefined;
    });
  }

  public stopScreenSharing() {
    const connectionInstance = this.connections.presentation;
    if(!connectionInstance) {
      return Promise.resolve();
    }

    delete this.connections.presentation;
    this.unpinSource('presentation');
    connectionInstance.closeConnectionAndStream(true);

    delete this.participant.presentation;
    this.managers.appGroupCallsManager.saveApiParticipant(this.id, this.participant);

    return this.managers.appGroupCallsManager.leaveGroupCallPresentation(this.id);
  }

  public toggleScreenSharing() {
    if(this.isSharingScreen) {
      return this.stopScreenSharing();
    } else {
      return this.startScreenSharing();
    }
  }

  public async startVideoSharingInternal() {
    const constraints: MediaStreamConstraints = {
      video: getVideoConstraints()
    };

    try {
      const stream = await getStream(constraints, false);
      // The call can be hung up during the `getUserMedia` window. After that
      // cleanup() has already run streamManager.stop(), so adding this stream
      // would leak the camera (LED stuck on) — release it instead.
      if(this.isClosing) {
        stream.getTracks().forEach((t) => stopTrack(t));
        return;
      }
      const connectionInstance = this.connections.main;
      connectionInstance.addInputVideoStream(stream);

      await this.editParticipant(this.participant, {
        videoPaused: false,
        videoStopped: false
      });
    } catch(err) {
      this.log.error('startVideoSharing error', err, constraints);
    }
  }

  public startVideoSharing() {
    return this.startVideoSharingPromise ??= this.startVideoSharingInternal().finally(() => {
      this.startVideoSharingPromise = undefined;
    });
  }

  public async stopVideoSharing() {
    const connectionInstance = this.connections.main;
    const track = connectionInstance.streamManager.inputStream.getVideoTracks()[0];
    if(!track) {
      return;
    }

    stopTrack(track);
    // `stopTrack` only flips `readyState` to "ended"; the StreamItem and the
    // track stay in `streamManager` until the asynchronous `ended` event
    // listener fires later. We do it synchronously here so that:
    //   1. `isSharingVideo` (which reads streamManager.items) flips to
    //      `false` immediately — without this, a fast follow-up
    //      toggleVideoSharing() click reads stale `true` and ends up calling
    //      stopVideoSharing() again instead of startVideoSharing(), and the
    //      toggle "does nothing".
    //   2. `appendToConference` below iterates `inputStream.getTracks()` to
    //      pick a replacement; if the stopped track is still listed, it
    //      replaces senders with the stopped track instead of `undefined`
    //      (the "clear sender" comment) — and remote sees a frozen frame
    //      until the next negotiation. Removing it makes `findIndex` return
    //      -1, so `appendToConference` correctly clears the sender.
    // The async `ended` listener still fires later; removeTrack is idempotent.
    connectionInstance.streamManager.removeTrack(track);
    connectionInstance.streamManager.appendToConference(connectionInstance.description); // clear sender track

    await this.editParticipant(this.participant, {
      videoStopped: true
    });
  }

  public toggleVideoSharing() {
    if(this.isSharingVideo) {
      return this.stopVideoSharing();
    } else {
      return this.startVideoSharing();
    }
  }

  // CallInstanceBase hook for mid-call device swap. Walks every connection
  // we own (main + presentation) so screen-sharing keeps working when the
  // user picks a different camera while presenting. Quietly skips
  // connections that aren't up yet — the next negotiation will pick up the
  // new track from streamManager.appendToConference instead.
  protected replaceSenderTrack(
    kind: 'audio' | 'video',
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack
  ): void {
    for(const type in this.connections) {
      const connectionInstance = this.connections[type as GroupCallConnectionType];
      const connection = connectionInstance?.connection;
      if(!connection) continue;
      for(const sender of connection.getSenders()) {
        if(sender.track === oldTrack) {
          sender.replaceTrack(newTrack).catch((err) => this.log?.warn?.('replaceSenderTrack', err));
        }
      }
    }
  }


  public async hangUp(discard = false, rejoin = false, isDiscarded = false) {
    for(const type in this.connections) {
      const connection = this.connections[type as GroupCallConnectionType];
      connection.closeConnectionAndStream(!rejoin);
    }

    this.dispatchEvent('state', this.state);

    if(isDiscarded) {
      return;
    }

    if(!rejoin) {
      let d: Parameters<AppGroupCallsManager['hangUp']>[1];
      try {
        d = discard || (/* this.joined ?  */this.connections.main.sources.audio.source/*  : undefined */);
      } catch(err) {
        d = 0;
      }

      this.managers.appGroupCallsManager.hangUp(this.id, d);
    }
  }

  public tryAddTrack(options: Omit<TryAddTrackOptions, 'streamManager'>) {
    const {description} = this;
    const source = super.tryAddTrack(options);

    if(options.type === 'output') {
      const entry = description.getEntryBySource(+source);
      this.getParticipantByPeerId(entry.peerId).then((participant) => {
        if(participant) {
          rootScope.dispatchEvent('group_call_participant', {groupCallId: this.id, participant});
        }
      });
    }

    return source;
  }

  public async editParticipant(participant: GroupCallParticipant, options: Partial<{
    muted: boolean,
    volume: number,
    raiseHand: boolean,
    videoStopped: boolean,
    videoPaused: boolean,
    presentationPaused: boolean
  }>) {
    if(!Object.keys(options).length) {
      return;
    }

    // let processUpdate = true;
    if(participant) {
      // const {currentGroupCall} = this;
      // const isCurrentCall = currentGroupCall?.id === groupCallId;
      const isCurrentCall = true;
      const isUpdatingMeInCurrentCall = isCurrentCall && participant.pFlags.self;

      if(isUpdatingMeInCurrentCall) {
        if(options.muted !== undefined && !this.isSharingAudio) {
          delete options.muted;

          if(!Object.keys(options).length) {
            return;
          }
        }
      }

      // if(isCurrentCall) {
      const muted = options.muted;
      if(muted !== undefined) {
        /* const isAdmin = appChatsManager.hasRights(currentGroupCall.chatId, 'manage_call');
          if(isAdmin) {
            if(muted) {
              participant.pFlags.muted = true;
              delete participant.pFlags.can_self_unmute;
            } else {
              participant.pFlags.can_self_unmute = true;
            }
          } else  */if(participant.pFlags.self) {
          if(muted) {
            participant.pFlags.muted = true;
          } else if(participant.pFlags.can_self_unmute) {
            delete participant.pFlags.muted;
          }
        }/*  else {
            if(muted) {
              participant.pFlags.muted_by_you = true;
            } else {
              delete participant.pFlags.muted_by_you;
            }
          } */
      }
      // }

      /* const a: [keyof GroupCallParticipant['pFlags'], keyof typeof options][] = [
        ['muted', 'muted']
      ];

      a.forEach(([key, optionKey]) => {
        const value = options[optionKey];
        if(value === undefined) {
          return;
        }

        if(value) {
          participant.pFlags[key] = true;
        } else {
          delete participant.pFlags[key];
        }
      }); */

      if(options.raiseHand !== undefined) {
        if(options.raiseHand) participant.raise_hand_rating = '1';
        else delete participant.raise_hand_rating;
      }

      if(isUpdatingMeInCurrentCall) {
        if(options.videoStopped !== undefined) {
          if(options.videoStopped) delete participant.video;
          else participant.video = generateSelfVideo(this.connections.main.sources.video);
        }

        if(!participant.pFlags.muted && participant.pFlags.can_self_unmute) {
          this.setMuted(false);
        }

        this.dispatchEvent('state', this.state);
      }

      // rootScope.dispatchEvent('group_call_participant', {groupCallId, participant});

      /* if(participant.pFlags.self) {
        processUpdate = false;
      } */
    }

    return this.managers.appGroupCallsManager.editParticipant(this.id, participant, options);
  }

  public onParticipantUpdate(participant: GroupCallParticipant, doNotDispatchParticipantUpdate?: PeerId) {
    const connectionInstance = this.connections.main;
    const {connection, description} = connectionInstance;

    const peerId = getPeerId(participant.peer);
    const hasLeft = !!participant.pFlags.left;
    const oldSsrcs = this.participantsSsrcs.get(peerId) || [];

    if(participant.presentation && !hasLeft) {
      const {source} = makeSsrcFromParticipant(participant, 'video', participant.presentation.source_groups, participant.presentation.endpoint);
      if(!this.hadAutoPinnedSources.has(source)) {
        this.hadAutoPinnedSources.add(source);
        this.pinSource(participant.pFlags.self ? 'presentation' : source);
      }
    }

    if(participant.pFlags.self) {
      this.participant = participant;

      if(connectionInstance.sources.audio.source !== participant.source) {
        this.hangUp();
      }

      let mute = false;
      if(!participant.pFlags.can_self_unmute) {
        this.stopScreenSharing();
        this.stopVideoSharing();
        mute = true;
      } else if(participant.pFlags.muted) {
        mute = true;
      }

      if(mute) {
        this.setMuted(true);
      }

      if(doNotDispatchParticipantUpdate !== peerId) {
        this.dispatchEvent('state', this.state);
      }

      return;
    }

    const ssrcs = hasLeft ? [] : makeSsrcsFromParticipant(participant);

    if(!hasLeft) {
      this.participantsSsrcs.set(peerId, ssrcs);
    } else {
      this.participantsSsrcs.delete(peerId);
    }

    // For e2e conferences: map every SFU SSRC for this participant to their
    // Telegram user_id so recv RTCRtpScriptTransform handlers can look up
    // the correct Ed25519 public key for signature verification. The
    // TdE2E "user_id" IS the Telegram user_id — same value namespace.
    if(this.e2e && participant.peer?._ === 'peerUser') {
      const userId = BigInt(participant.peer.user_id);
      if(hasLeft) {
        let changed = false;
        for(const ssrc of oldSsrcs) {
          if(ssrc.source && this.e2eUserBySsrc.delete(ssrc.source >>> 0)) changed = true;
        }
        if(changed) this.syncSsrcMapToWorker();
      } else {
        for(const ssrc of ssrcs) {
          if(ssrc.source) this.registerE2eUserSsrc(userId, ssrc.source);
        }
      }
    }

    // const TEST_OLD = false;

    const modifiedTypes: Set<WebRTCLineType> = new Set();
    oldSsrcs.forEach((oldSsrc) => {
      const oldSource = oldSsrc.source;
      const newSsrc = ssrcs.find((ssrc) => ssrc.source === oldSource);
      if(!newSsrc) {
        this.unpinSource(oldSource);

        const oldEntry = description.getEntryBySource(oldSource);
        if(oldEntry && oldEntry.direction !== 'inactive') {
          oldEntry.setDirection('inactive');
          modifiedTypes.add(oldEntry.type);
        }
      }
    });

    ssrcs.forEach((ssrc) => {
      let entry = description.getEntryBySource(ssrc.source);
      if(entry) {
        if(entry.direction === 'inactive') {
          entry.setDirection(entry.originalDirection);
          modifiedTypes.add(entry.type);
        }

        return;
      }

      entry = description.createEntry(ssrc.type);
      description.setEntrySource(entry, ssrc.sourceGroups || ssrc.source);
      description.setEntryPeerId(entry, peerId);

      // if(TEST_OLD) {
      //   description.bundleMids.push(entry.mid);
      //   entry.setDirection('recvonly');
      // } else {
      ssrc.type === 'video' && entry.setEndpoint(ssrc.endpoint);
      entry.createTransceiver(connection, {direction: 'recvonly'});

      // Conference (e2e) only: attach the receive-side RTCRtpScriptTransform
      // RIGHT NOW — in the gap between createTransceiver and the next
      // negotiate() that binds the decoder. This is the only window Chrome
      // accepts a recv transform, mirroring the sender-side constraint.
      // Attaching it later (in the connection's `track` event, after the
      // decoder has produced its first frame) makes Chrome silently bypass it
      // — frames reach the decoder still encrypted and the peer hears noise
      // (the long-standing "recv pumps ~5 frames then halts" symptom). One
      // transceiver per SSRC (this loop) ⇒ one decoder + one transform per
      // remote stream, exactly like the legacy SFU path: the server signals
      // only SSRCs, we mint the m-lines. No-op for legacy voice chats —
      // attachE2eRecvTransform returns early unless `this.e2e` is set.
      this.attachE2eRecvTransform(entry.transceiver.receiver, entry.type === 'video' ? 'video' : 'audio');
      // }

      modifiedTypes.add(entry.type);
    });

    /* if(TEST_OLD) {
      this.setRemoteOffer({
        connection,
        description,
        ssrcs
      });
    } else  */if(modifiedTypes.size) {
      if(modifiedTypes.has('video')) {
        connectionInstance.updateConstraints = true;
      }

      connectionInstance.negotiateThrottled();
    }
  }
}
