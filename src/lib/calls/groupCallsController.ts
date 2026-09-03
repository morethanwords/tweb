import getGroupCallAudioAsset from '@components/groupCall/getAudioAsset';
import {DEBUG, MOUNT_CLASS_TO} from '@config/debug';
import {IS_CHROMIUM} from '@environment/userAgent';
import EventListenerBase from '@helpers/eventListenerBase';
import noop from '@helpers/noop';
import {GroupCallParticipant, GroupCallParticipantVideo, GroupCallParticipantVideoSourceGroup} from '@layer';
import {GroupCallId, GroupCallConnectionType} from '@appManagers/appGroupCallsManager';
import {AppManagers} from '@lib/managers';
import {logger} from '@lib/logger';
import rootScope from '@lib/rootScope';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import type GroupCallConnectionInstance from '@lib/calls/groupCallConnectionInstance';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import createMainStreamManager from '@lib/calls/helpers/createMainStreamManager';
import {
  findGroupCallChainUpdate
} from '@lib/calls/helpers/groupCallUpdates';
import sameInputGroupCall from '@lib/calls/helpers/sameInputGroupCall';
import {isSdpSafeSourceGroups, isSdpSafeString} from '@lib/calls/helpers/sdpSafety';
import senderKind from '@lib/calls/helpers/senderKind';
import {generateSsrc} from '@lib/calls/localConferenceDescription';
import {WebRTCLineType} from '@lib/calls/sdpBuilder';
import StreamManager from '@lib/calls/streamManager';
import {Ssrc} from '@lib/calls/types';
import {EncryptWorkerHost} from '@lib/calls/e2e/encryptWorkerHost';
import type {GroupParticipant} from '@lib/calls/e2e/tlTypes';
import type {InputGroupCall, Updates} from '@layer';
import {NULL_PEER_ID} from '@appManagers/constants';
import {toastNew} from '@components/toast';

const IS_MUTED = true;

// How long after ICE reaches `connected` we still allow the full RTCPeerConnection
// (which only flips to `connected` once DTLS completes) to come up before we treat
// the media transport as stalled. DTLS normally finishes in well under a second;
// 10s is generous and avoids false positives on slow networks.
const CONNECTION_ESTABLISH_TIMEOUT_MS = 10000;
const MEDIA_LIVENESS_INTERVAL_MS = 5000;
const OUTBOUND_MEDIA_BLACKHOLE_PROGRESS_SAMPLES = 3;
const OUTBOUND_MEDIA_MIN_PACKETS = 10;
const OUTBOUND_MEDIA_MIN_RMS = .01;
const OUTBOUND_MEDIA_BLACKHOLE_REASON = 'outbound-media-blackhole';

type ConferenceRtcStat = RTCStats & {
  kind?: string,
  mediaType?: string,
  packetsSent?: number,
  remoteId?: string,
  localId?: string,
  ssrc?: number,
  transportId?: string,
  mediaSourceId?: string,
  selectedCandidatePairId?: string,
  selected?: boolean,
  nominated?: boolean,
  state?: string,
  totalAudioEnergy?: number,
  totalSamplesDuration?: number
};

type ConferenceJoinOptions = {
  input: InputGroupCall;
  // Slug/invite-message joins keep `input` as their authorization. This is the
  // canonical identity resolved for preview and used only to validate every
  // response before promotion.
  expectedCanonicalInput?: InputGroupCall.inputGroupCall;
  selfUserId: bigint;
  chatId?: ChatId;
  muted?: boolean;
  joinVideo?: boolean;
  /** Present only for an automatic recovery that can be cancelled by a new call. */
  transitionGeneration?: number;
  /** Prevents an automatic media-blackhole recovery from rejoining in a loop. */
  outboundMediaRecoveryUsed?: boolean;
};
type ConferenceStartOptions = {
  chatId?: ChatId;
  selfUserId: bigint;
  muted?: boolean;
  joinVideo?: boolean;
};

class ConferenceTransitionCancelledError extends Error {}

export function makeSsrcsFromParticipant(participant: GroupCallParticipant) {
  // A source group's semantics goes into `a=ssrc-group:` verbatim and its
  // sources into every `a=ssrc:` line, the endpoint into the stream name — a
  // malformed one is dropped here rather than handed to the SDP builder.
  const isSafeVideo = (video: GroupCallParticipantVideo) => {
    return video && isSdpSafeSourceGroups(video.source_groups) && isSdpSafeString(video.endpoint);
  };
  const video = isSafeVideo(participant.video) ? participant.video : undefined;
  const presentation = isSafeVideo(participant.presentation) ? participant.presentation : undefined;
  return [
    makeSsrcFromParticipant(participant, 'audio', participant.source),
    video?.audio_source && makeSsrcFromParticipant(participant, 'audio', video.audio_source),
    video && makeSsrcFromParticipant(participant, 'video', video.source_groups, video.endpoint),
    presentation?.audio_source && makeSsrcFromParticipant(participant, 'audio', presentation.audio_source),
    presentation && makeSsrcFromParticipant(participant, 'video', presentation.source_groups, presentation.endpoint)
  ].filter(Boolean);
};

export function makeSsrcFromParticipant(participant: GroupCallParticipant, type: WebRTCLineType, source?: number | GroupCallParticipantVideoSourceGroup[], endpoint?: string): Ssrc {
  return generateSsrc(type, source, endpoint);
}

export function generateSelfVideo(source: Ssrc, audioSource?: number): GroupCallParticipantVideo {
  return source && {
    _: 'groupCallParticipantVideo',
    pFlags: {},
    endpoint: '',
    source_groups: source.sourceGroups,
    audio_source: audioSource
  };
}

export class GroupCallsController extends EventListenerBase<{
  instance: (instance: GroupCallInstance, isRecovery?: boolean) => void
}> {
  private audioAsset: ReturnType<typeof getGroupCallAudioAsset>;
  private log: ReturnType<typeof logger>;
  private currentGroupCall: GroupCallInstance;
  private managers: AppManagers;
  private pendingConferenceJoin: {
    key: string,
    promise: Promise<GroupCallInstance>
  } | undefined;
  private recoveringConferences = new WeakSet<GroupCallInstance>();
  private conferenceRecoveryAuthorizations = new WeakMap<
    GroupCallInstance,
    Pick<ConferenceJoinOptions, 'input' | 'expectedCanonicalInput'>
  >();
  private conferenceTransitionGeneration = 0;
  private conferenceRecovery?: {generation: number, promise: Promise<void>};
  private conferenceTransitionReservations = 0;
  private pendingConferenceRecovery?: {instance: GroupCallInstance, reason: string};
  private outboundMediaRecoveryUsed = new WeakSet<GroupCallInstance>();

  public construct(managers: AppManagers) {
    this.managers = managers;
    this.audioAsset = getGroupCallAudioAsset();
    this.log = logger('GCC');

    rootScope.addEventListener('group_call_update', (groupCall) => {
      const {currentGroupCall} = this;
      if(currentGroupCall?.id === groupCall.id) {
        currentGroupCall.groupCall = groupCall;

        if(groupCall._ === 'groupCallDiscarded') {
          void currentGroupCall.hangUp(false, false, true).catch((err) => {
            this.log.error('cleanup after discarded group call failed', err);
          });
        }
      }
    });

    rootScope.addEventListener('group_call_participant', ({groupCallId, participant}) => {
      const {currentGroupCall} = this;
      if(currentGroupCall?.id === groupCallId) {
        currentGroupCall.onParticipantUpdate(participant);
      }
    });

    // A closed tab used to linger as a ghost participant until the server timed
    // it out — still listed, still holding a chain key in a conference. The
    // SharedWorker outlives this tab, so a leave posted from pagehide reaches
    // the server. Best-effort by design: not awaited, no UI teardown (the page
    // is going away), and never a discard.
    if(typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.leaveOnPageHide());
    }
  }

  private leaveOnPageHide(): void {
    const instance = this.currentGroupCall;
    if(!instance) return;
    const target = this.resolveLeaveTarget(instance, instance.connections.main);
    if(!target) return;
    void this.managers.appGroupCallsManager.leaveGroupCall(target.input, target.source).catch(noop);
  }

  // The server-side identity + audio source a leave for `instance` is addressed
  // with — the reference phone.joinGroupCall accepted when there is one.
  private resolveLeaveTarget(
    instance: GroupCallInstance,
    connectionInstance: GroupCallConnectionInstance | undefined,
    fallbackInput?: InputGroupCall
  ): {input: InputGroupCall, source: number} | undefined {
    const input = connectionInstance?.acceptedCallInput ?? fallbackInput ?? instance.toInputGroupCall();
    if(!input) return;
    const source = connectionInstance?.sources.audio?.source;
    return {input, source: typeof source === 'number' ? source : 0};
  }

  get groupCall() {
    return this.currentGroupCall;
  }

  public setCurrentGroupCall(groupCall: GroupCallInstance, isRecovery = false) {
    this.currentGroupCall = groupCall;

    if(groupCall) {
      this.dispatchEvent('instance', groupCall, isRecovery);
    }
  }

  /**
   * Reserve the call-transition window before its first asynchronous step.
   * While at least one reservation is held, conference liveness cannot start a
   * replacement join. An already-running recovery is cancelled and fully
   * cleaned up before the caller receives its release token.
   */
  public async reserveConferenceTransition(): Promise<() => void> {
    ++this.conferenceTransitionReservations;
    let released = false;
    const release = () => {
      if(released) return;
      released = true;
      --this.conferenceTransitionReservations;
      this.drainPendingConferenceRecovery();
    };

    try {
      await this.cancelCurrentConferenceRecovery();
      return release;
    } catch(err) {
      release();
      throw err;
    }
  }

  private async cancelCurrentConferenceRecovery(): Promise<void> {
    const recovery = this.conferenceRecovery;
    if(!recovery) return;
    ++this.conferenceTransitionGeneration;
    await recovery.promise;
  }

  private drainPendingConferenceRecovery(): void {
    if(this.conferenceTransitionReservations || this.pendingConferenceJoin || !this.pendingConferenceRecovery) return;

    const pending = this.pendingConferenceRecovery;
    this.pendingConferenceRecovery = undefined;
    void this.recoverConference(pending.instance, pending.reason);
  }

  public startConnectingSound() {
    this.stopConnectingSound();
    this.audioAsset.playWithTimeout({name: 'connect', loop: true}, 2500);
  }

  public stopConnectingSound() {
    this.audioAsset.stop();
    this.audioAsset.cancelDelayedPlay();
  }

  private hangUpAfterTransportFailure(instance: GroupCallInstance): void {
    void instance.hangUp().catch((err) => {
      this.log.warn('group call leave after transport failure failed', err);
    });
  }

  public async joinGroupCall(chatId: ChatId, groupCallId: GroupCallId, muted = IS_MUTED, rejoin?: boolean, joinVideo?: boolean) {
    this.audioAsset.createAudio();

    this.log(`joinGroupCall chatId=${chatId} id=${groupCallId} muted=${muted} rejoin=${rejoin}`);

    let streamManager: StreamManager;
    if(rejoin) {
      streamManager = this.currentGroupCall.connections.main.streamManager;
    } else {
      streamManager = await createMainStreamManager(muted, joinVideo);
    }

    return this.joinGroupCallInternal(chatId, groupCallId, streamManager, muted, rejoin, joinVideo)
    .then(() => {
      // have to refresh participants because of the new connection
      const {currentGroupCall} = this;
      if(!currentGroupCall) return;
      void currentGroupCall.participants.then((participants) => {
        if(this.currentGroupCall !== currentGroupCall || currentGroupCall.state === GROUP_CALL_STATE.CLOSED) {
          return;
        }

        participants.forEach((participant) => {
          if(!participant.pFlags.self) {
            currentGroupCall.onParticipantUpdate(participant);
          }
        });
      }).catch((err) => {
        // The transport join is already accepted. Initial roster hydration is
        // best-effort and will be refreshed by later participant updates, but
        // the worker-proxy rejection still needs an observer.
        this.log.warn('initial group call participant hydration failed', err);
      });
    });
  }

  private async joinGroupCallInternal(chatId: ChatId, groupCallId: GroupCallId, streamManager: StreamManager, muted: boolean, rejoin = false, joinVideo?: boolean) {
    const log = this.log.bindPrefix('joinGroupCallInternal');
    log('start', groupCallId);

    const type: GroupCallConnectionType = 'main';

    let {currentGroupCall} = this;
    if(currentGroupCall && rejoin) {
      // currentGroupCall.connections.main.connection = connection;
      currentGroupCall.handleUpdateGroupCallParticipants = false;
      currentGroupCall.updatingSdp = false;
      log('update currentGroupCall', groupCallId, currentGroupCall);
    } else {
      currentGroupCall = new GroupCallInstance({
        chatId,
        id: groupCallId,
        managers: this.managers
      });

      try {
        currentGroupCall.fixSafariAudio();

        currentGroupCall.addEventListener('state', (state) => {
          if(this.currentGroupCall === currentGroupCall && state === GROUP_CALL_STATE.CLOSED) {
            this.setCurrentGroupCall(null);
            this.stopConnectingSound();
            this.audioAsset.play({name: 'end'});
            rootScope.dispatchEvent('chat_update', currentGroupCall.chatId);
          }
        });

        currentGroupCall.groupCall = await this.managers.appGroupCallsManager.getGroupCallFull(groupCallId);

        const connectionInstance = currentGroupCall.createConnectionInstance({
          streamManager,
          type,
          options: {
            type,
            isMuted: muted,
            joinVideo,
            rejoin
          }
        });

        const connection = connectionInstance.createPeerConnection();
        let initialNegotiationCompleted = false;
        connection.addEventListener('negotiationneeded', () => {
          void connectionInstance.requestNegotiation().catch((err) => {
            // The explicit initial request below observes its own failure and
            // lets the join transaction roll back. Later dirty negotiations are
            // event-owned and must fail closed instead of rejecting unobserved.
            if(!initialNegotiationCompleted ||
               this.currentGroupCall !== currentGroupCall ||
               currentGroupCall.isClosing) {
              return;
            }
            log.error('group call runtime negotiation failed', err);
            this.hangUpAfterTransportFailure(currentGroupCall);
          });
        });

        connection.addEventListener('track', (event) => {
          log('ontrack', event);
          currentGroupCall.onTrack(event);
        });

        // Media-transport watchdog. GroupCallInstance.connectionState (and thus the
        // call UI) reports the ICE state ONLY, so a call where ICE reaches
        // `connected` but the RTCPeerConnection never does — the DTLS handshake
        // stalls, observed on restrictive networks / some VPNs — looks "connected"
        // while NO media ever flows: black video tiles, silence, the SFU data
        // channel never opens, no error anywhere. Watch the REAL connectionState
        // (which only flips to `connected` once DTLS completes) and, if it doesn't
        // get there shortly after ICE does, surface it and end the dead call
        // instead of leaving the user staring at a silent black call.
        let connectionWatchdog: number;
        const clearConnectionWatchdog = () => {
          if(connectionWatchdog) {
            clearTimeout(connectionWatchdog);
            connectionWatchdog = undefined;
          }
        };
        const armConnectionWatchdog = () => {
          clearConnectionWatchdog();
          connectionWatchdog = window.setTimeout(() => {
            connectionWatchdog = undefined;
            const {connectionState} = connection;
            if(connectionState === 'connected') return;
            if(this.currentGroupCall !== currentGroupCall) return;
            log.warn('media transport stall: ICE connected but connectionState =', connectionState, '— ending call');
            currentGroupCall.reportMediaTransportStall({connectionState, iceConnectionState: connection.iceConnectionState});
            this.hangUpAfterTransportFailure(currentGroupCall);
          }, CONNECTION_ESTABLISH_TIMEOUT_MS);
        };

        connection.addEventListener('connectionstatechange', () => {
          const {connectionState} = connection;
          if(connectionState === 'connected') {
            clearConnectionWatchdog();
          } else if(connectionState === 'failed') {
            // ICE can sit at `connected` while DTLS fails, so the ICE 'failed'
            // branch below never fires — end the call on a failed transport here.
            clearConnectionWatchdog();
            this.hangUpAfterTransportFailure(currentGroupCall);
          }
        });

        connection.addEventListener('iceconnectionstatechange', () => {
          currentGroupCall.dispatchEvent('state', currentGroupCall.state);

          const {iceConnectionState} = connection;
          if(iceConnectionState === 'disconnected' || iceConnectionState === 'checking' || iceConnectionState === 'new') {
            this.startConnectingSound();
          } else {
            this.stopConnectingSound();
          }

          switch(iceConnectionState) {
            case 'checking': {
              break;
            }

            case 'closed': {
              clearConnectionWatchdog();
              this.hangUpAfterTransportFailure(currentGroupCall);
              break;
            }

            case 'completed': {
              break;
            }

            case 'connected': {
              // ICE is up; give DTLS a bounded window to finish (see watchdog above).
              armConnectionWatchdog();

              if(!currentGroupCall.joined) {
                currentGroupCall.joined = true;
                this.audioAsset.play({name: 'start'});
                void this.managers.appGroupCallsManager.getGroupCallParticipants(groupCallId).catch((err) => {
                  log.warn('initial group call participant fetch failed', err);
                });
              }

              break;
            }

            case 'disconnected': {
              break;
            }

            case 'failed': {
              clearConnectionWatchdog();
              // TODO: replace with ICE restart
              this.hangUpAfterTransportFailure(currentGroupCall);
              // connection.restartIce();
              break;
            }

            case 'new': {
              break;
            }
          }
        });

        connectionInstance.createDescription();
        connectionInstance.createDataChannel();

        await connectionInstance.appendStreamToConference();

        this.setCurrentGroupCall(currentGroupCall);
        log('set currentGroupCall', groupCallId, currentGroupCall);

        this.startConnectingSound();

        await connectionInstance.requestNegotiation();
        initialNegotiationCompleted = true;
      } catch(err) {
        // The microphone (and camera) were captured before this join started
        // and nothing owns them yet when it fails here — the instance is not
        // current, so no UI could release them. Undo the whole join instead of
        // leaving the capture live until a reload.
        await this.rollbackFailedJoin({
          instance: currentGroupCall,
          connectionInstance: currentGroupCall.connections.main,
          streamManager
        });
        throw err;
      }
    }
  }

  // Undo everything a failed join built — close media, release the
  // microphone/camera, drop the instance — and compensate a
  // phone.joinGroupCall the server already accepted (it may have installed our
  // participant and source even though worker commit, SDP parsing or
  // remote-description setup failed afterwards). Compensates exactly once;
  // teardown first keeps capture closed while the best-effort leave is in
  // flight. Shared by the legacy and conference joins.
  private async rollbackFailedJoin(opts: {
    instance?: GroupCallInstance,
    connectionInstance?: GroupCallConnectionInstance,
    streamManager: StreamManager,
    acceptedCall?: InputGroupCall,
    discard?: boolean
  }): Promise<void> {
    const {instance, connectionInstance, streamManager} = opts;
    this.stopConnectingSound();
    if(!instance) {
      streamManager.stop();
      return;
    }

    const connectionTypes = Object.keys(instance.connections) as GroupCallConnectionType[];
    for(const type of connectionTypes) {
      instance.connections[type].closeConnectionAndStream(true);
    }
    // A join that failed before createConnectionInstance has no connection to
    // stop the stream through.
    if(!connectionTypes.length) streamManager.stop();
    if(this.currentGroupCall === instance) {
      instance.dispatchEvent('state', GROUP_CALL_STATE.CLOSED);
      if(this.currentGroupCall === instance) this.setCurrentGroupCall(null);
    }
    instance.cleanup();

    if(!connectionInstance?.joinAccepted) return;
    const target = this.resolveLeaveTarget(instance, connectionInstance, opts.acceptedCall);
    if(!target) return;
    try {
      if(opts.discard) {
        await this.managers.appGroupCallsManager.discardGroupCall(target.input);
      } else {
        await this.managers.appGroupCallsManager.leaveGroupCall(target.input, target.source);
      }
    } catch(leaveError) {
      this.log.warn('conference post-accept rollback failed', leaveError);
    }
  }

  // ===== TdE2E conference call entry points =====
  //
  // Fresh starts submit their zero block and SDP atomically through
  // phone.createConferenceCall(join=true). Joining an existing conference
  // first polls its current chain tip, then submits a self-add (or zero block
  // when the chain is empty) through phone.joinGroupCall.
  // The signing key is born in the worker and never leaves it; this thread only
  // learns the public key it advertises in the join payload.
  private async createConferenceCrypto(selfUserId: bigint) {
    const worker = new EncryptWorkerHost();
    let publicKey: Uint8Array;
    try {
      publicKey = await worker.createKey();
    } catch(err) {
      await worker.terminate().catch((): undefined => undefined);
      throw err;
    }

    const selfParticipant: GroupParticipant = {
      userId: selfUserId,
      publicKey,
      canAddUsers: true,
      canRemoveUsers: true,
      version: 0
    };

    return {publicKey, selfParticipant, worker};
  }

  public startConference(opts: ConferenceStartOptions): Promise<GroupCallInstance> {
    return this.runConferenceAttemptWithRetry(() => this.startConferenceAttempt(opts));
  }

  private async startConferenceAttempt(opts: ConferenceStartOptions): Promise<GroupCallInstance> {
    const {publicKey, selfParticipant, worker} = await this.createConferenceCrypto(opts.selfUserId);
    try {
      const zeroBlock = await worker.createZeroBlock({
        groupState: {participants: [selfParticipant], externalPermissions: 3}
      });
      return await this.joinConferenceCommon({
        createConference: true,
        worker,
        publicKey,
        selfUserId: opts.selfUserId,
        lastBlockServer: zeroBlock,
        chatId: opts.chatId,
        muted: opts.muted,
        joinVideo: opts.joinVideo
      });
    } catch(err) {
      await worker.terminate().catch((): undefined => undefined);
      throw err;
    }
  }

  public inviteConferenceParticipant(userId: UserId, video?: boolean): Promise<Updates> {
    const call = this.currentGroupCall?.toInputGroupCall();
    if(!call || !this.currentGroupCall.e2e) {
      return Promise.reject(new Error('No active conference call'));
    }
    return this.managers.appCallsManager.inviteConferenceCallParticipant(call, userId, video);
  }

  public declineConferenceInvite(messageId: number): Promise<Updates> {
    return this.managers.appCallsManager.declineConferenceCallInvite(messageId);
  }

  // Drive an incoming conference (we've been invited or have the invite link).
  // Fetches the latest block from the server, builds our self-add block,
  // then joins the SFU.
  public joinConference(opts: ConferenceJoinOptions): Promise<GroupCallInstance> {
    const key = this.conferenceInputKey(opts.input);
    const pending = this.pendingConferenceJoin;
    if(pending) {
      if(pending.key === key) return pending.promise;
      return Promise.reject(new Error('CONFERENCE_JOIN_IN_PROGRESS'));
    }

    const promise = this.runConferenceAttemptWithRetry(
      () => this.joinConferenceAttempt(opts),
      true
    ).finally(() => {
      if(this.pendingConferenceJoin?.promise === promise) {
        this.pendingConferenceJoin = undefined;
        this.drainPendingConferenceRecovery();
      }
    });
    this.pendingConferenceJoin = {key, promise};
    return promise;
  }

  private async runConferenceAttemptWithRetry(
    runAttempt: () => Promise<GroupCallInstance>,
    retryMembershipRace = false
  ): Promise<GroupCallInstance> {
    const maxAttempts = 3;
    for(let attempt = 0; ; attempt++) {
      try {
        return await runAttempt();
      } catch(err) {
        const errorType = this.apiErrorType(err);
        const isSsrcCollision = errorType === 'GROUPCALL_SSRC_DUPLICATE_MUCH';
        const isMembershipRace = retryMembershipRace && errorType?.startsWith('NOT_PARTICIPANT:');
        if((!isSsrcCollision && !isMembershipRace) || attempt >= maxAttempts - 1) {
          throw err;
        }
        this.log.warn(
          isSsrcCollision ?
            'conference join SSRC collision; rebuilding the whole media stack' :
            'conference membership changed during join; rebuilding the whole media stack',
          {attempt: attempt + 1}
        );
      }
    }
  }

  private async joinConferenceAttempt(opts: ConferenceJoinOptions): Promise<GroupCallInstance> {
    this.assertConferenceTransition(opts.transitionGeneration);
    // All three `InputGroupCall` variants are accepted by
    // `phone.getGroupCallChainBlocks` + `phone.joinGroupCall` server-side:
    //   - inputGroupCall(id, access_hash) — the canonical form we already have
    //   - inputGroupCallSlug(slug)        — invite-link join (no msg)
    //   - inputGroupCallInviteMessage(msg_id) — invite-message join
    // The latter two return the real id+access_hash inside the join response.
    // tdesktop: calls_group_call.cpp:4251 `inputCallSafe`.
    if(opts.input._ !== 'inputGroupCall' &&
       opts.input._ !== 'inputGroupCallSlug' &&
       opts.input._ !== 'inputGroupCallInviteMessage') {
      throw new Error(`joinConference: unsupported call ref kind ${(opts.input as any)._}`);
    }
    if(opts.input._ !== 'inputGroupCall' && !opts.expectedCanonicalInput) {
      throw new Error('joinConference: non-canonical authorization requires an expected canonical identity');
    }
    if(opts.input._ === 'inputGroupCall' && opts.expectedCanonicalInput &&
       !sameInputGroupCall(opts.input, opts.expectedCanonicalInput)) {
      throw new Error('joinConference: canonical input does not match its expected identity');
    }
    const {publicKey, selfParticipant, worker} = await this.createConferenceCrypto(opts.selfUserId);
    const initialOffsets: Partial<{0: number; 1: number}> = {};
    // Build the initial join block by polling the chain head and either making
    // a self-add block on top of it or a zero block if the chain is empty.
    const buildJoinBlock = async(): Promise<Uint8Array> => {
      const head = await this.fetchLastConferenceBlock(opts.input, opts.expectedCanonicalInput);
      initialOffsets[0] = head.nextOffset;
      return head.block ?
        worker.createSelfAddBlock({
          previousBlockServer: head.block,
          self: selfParticipant
        }) :
        worker.createZeroBlock({
          groupState: {participants: [selfParticipant], externalPermissions: 3}
        });
    };

    // On a chain race the worker is already initialised, so it signs the
    // replacement with its retained key.
    const rebuildJoinBlock = async(): Promise<Uint8Array> => {
      const head = await this.fetchLastConferenceBlock(opts.input, opts.expectedCanonicalInput);
      initialOffsets[0] = head.nextOffset;
      if(!head.block) {
        throw new Error('Conference chain stayed empty after CONF_WRITE_CHAIN_INVALID');
      }
      return worker.prepareRejoinBlock({
        previousBlockServer: head.block,
        self: selfParticipant
      });
    };

    try {
      // Always poll the chain head first. tdlib does this for both "create"
      // and "join" — see GroupCallManager.cpp:4445 try_join_group_call.
      const joinBlock = await buildJoinBlock();
      this.assertConferenceTransition(opts.transitionGeneration);

      return await this.joinConferenceCommon({
        input: opts.input,
        expectedCanonicalInput: opts.expectedCanonicalInput,
        worker,
        publicKey,
        selfUserId: opts.selfUserId,
        lastBlockServer: joinBlock,
        initialOffsets,
        rebuildBlock: rebuildJoinBlock,
        commitRebuiltBlock: async() => {
          await worker.commitRejoinBlock();
        },
        chatId: opts.chatId,
        muted: opts.muted,
        joinVideo: opts.joinVideo,
        transitionGeneration: opts.transitionGeneration,
        outboundMediaRecoveryUsed: opts.outboundMediaRecoveryUsed
      });
    } catch(e) {
      await worker.terminate().catch((): undefined => undefined);
      throw e;
    }
  }

  // Shared tail of both startConference and joinConference: spin up the
  // GroupCallInstance, attach the worker, drive joinGroupCallInternal with
  // the e2e extras (public_key + block).
  private async joinConferenceCommon(opts: {
    // Reference to the conference. `inputGroupCall` (id+access_hash) for the
    // creator and previously-resolved joinees; `inputGroupCallSlug` for fresh
    // invite-link joins (the actual id+access_hash come back in the join
    // response). `undefined` only in the legacy create-mode path.
    input?: InputGroupCall;
    createConference?: boolean;
    expectedCanonicalInput?: InputGroupCall.inputGroupCall;
    worker: EncryptWorkerHost;
    publicKey: Uint8Array;
    selfUserId: bigint;
    lastBlockServer: Uint8Array;
    initialOffsets?: Partial<{0: number; 1: number}>;
    chatId?: ChatId;
    muted?: boolean;
    joinVideo?: boolean;
    transitionGeneration?: number;
    outboundMediaRecoveryUsed?: boolean;
    // Optional rebuild callback — invoked by the connection layer when the
    // server returns CONF_WRITE_CHAIN_INVALID (chain advanced mid-flight).
    // Should refetch chain head + return a freshly-built block.
    rebuildBlock?: () => Promise<Uint8Array>;
    // Commit the exact rebuilt proposal inside the worker after the server
    // accepted it. This preserves packet sequence/replay state and never
    // re-exposes the private seed to the main thread.
    commitRebuiltBlock?: () => Promise<void>;
  }): Promise<GroupCallInstance> {
    this.audioAsset.createAudio();
    const streamManager = await createMainStreamManager(opts.muted ?? true, opts.joinVideo);
    try {
      this.assertConferenceTransition(opts.transitionGeneration);
    } catch(err) {
      streamManager.stop();
      throw err;
    }
    if(streamManager.audioInputError) {
      toastNew({langPackKey: 'NoMicrophoneAccess'});
    }
    if(streamManager.videoInputError) {
      toastNew({langPackKey: 'ConferenceCall.Media.CameraError'});
    }
    let instance: GroupCallInstance | undefined;
    let connectionInstance: GroupCallConnectionInstance | undefined;
    let joinedSuccessfully = false;

    try {
      // Pick a stable placeholder id for the instance until the real id arrives
      // in the join response. For id-form input we already know it; for slug or
      // create modes we use a synthetic id and let the join flow rewrite it.
      // For id-form input keep the id in its native (fetchLong) form so it stays
      // === the manager's cache key; slug/create modes get a synthetic sentinel
      // that the join response rewrites to the real id.
      const placeholderId = (opts.input && opts.input._ === 'inputGroupCall') ?
        opts.input.id :
        `pending-conf-${Date.now()}`;
      const createdInstance = new GroupCallInstance({
        chatId: opts.chatId ?? NULL_PEER_ID,
        id: placeholderId,
        managers: this.managers
      });
      instance = createdInstance;
      if(opts.outboundMediaRecoveryUsed) {
        this.outboundMediaRecoveryUsed.add(createdInstance);
      }
      if(opts.input && opts.input._ !== 'inputGroupCall') {
        this.conferenceRecoveryAuthorizations.set(createdInstance, {
          input: opts.input,
          expectedCanonicalInput: opts.expectedCanonicalInput
        });
      }
      createdInstance.addEventListener('conferenceRecoveryRequired', (reason) => {
        void this.recoverConference(createdInstance, reason);
      });
      instance.fixSafariAudio();
      instance.attachE2e(opts.worker, opts.selfUserId, opts.initialOffsets);

      connectionInstance = instance.createConnectionInstance({
        streamManager,
        type: 'main',
        options: {
          type: 'main',
          isMuted: opts.muted ?? true,
          joinVideo: opts.joinVideo,
          rejoin: false,
          e2ePublicKey: opts.publicKey,
          e2eBlock: opts.lastBlockServer,
          e2eCreateConference: opts.createConference,
          // Pass non-id-form input straight through. The default codepath
          // (getGroupCallInput) would synthesise id+access_hash from our
          // placeholder id, which the server rejects for invitees.
          e2eCallInput: (opts.input && opts.input._ !== 'inputGroupCall') ? opts.input : undefined,
          e2eExpectedCallInput: opts.expectedCanonicalInput,
          // Wire rebuild callback so the connection layer can recover from
          // CONF_WRITE_CHAIN_INVALID without tearing down the WebRTC stack.
          e2eRebuildBlock: opts.rebuildBlock,
          e2eCommitRebuiltBlock: opts.commitRebuiltBlock && (async() => {
            await opts.commitRebuiltBlock?.();
            instance.advanceE2eChainOffsets(opts.initialOffsets || {});
          }),
          e2eActivate: () => instance.activateE2e()
        }
      });

      // Hydrate the worker against the block we built/fetched; it signs with
      // the key it generated in createConferenceCrypto.
      await opts.worker.init({
        userId: opts.selfUserId,
        lastBlockServer: opts.lastBlockServer
      });

      instance.addEventListener('state', (state) => {
        if(this.currentGroupCall === instance && state === GROUP_CALL_STATE.CLOSED) {
          this.setCurrentGroupCall(null);
          this.stopConnectingSound();
          if(joinedSuccessfully && !this.recoveringConferences.has(instance)) {
            this.audioAsset.play({name: 'end'});
          }
          if(joinedSuccessfully) {
            void opts.worker.terminate().catch((): undefined => undefined);
          }
        }
      });

      // For id-form input we can hydrate the full call now. For slug-form input
      // the access_hash is still unknown — we hydrate after joinGroupCall echoes
      // back the real updateGroupCall with id+access_hash.
      if(opts.input && opts.input._ === 'inputGroupCall') {
        instance.groupCall = await this.managers.appGroupCallsManager
        .getGroupCallFull(opts.input.id)
        .catch((): GroupCallInstance['groupCall'] => undefined);
      }

      const connection = connectionInstance.createPeerConnection();
      connection.addEventListener('negotiationneeded', () => {
        void connectionInstance.requestNegotiation().catch((err) => {
          // The explicit initial request below observes the same Promise and
          // owns transaction rollback. Runtime negotiation failures must never
          // become an unhandled rejection or a permanently-active dead entry.
          if(!joinedSuccessfully || instance.isClosing || this.currentGroupCall !== instance) return;
          this.log.error('conference runtime negotiation failed', err);
          void this.recoverConference(instance, 'renegotiation-failed');
        });
      });
      connection.addEventListener('track', (event) => instance.onTrack(event));
      connection.addEventListener('iceconnectionstatechange', () => {
        instance.dispatchEvent('state', instance.state);
        // Mirror the legacy joinGroupCallInternal path (line ~192): bracket the
        // looping `connect` tone around the pre-connected ICE states. Without
        // this the tone plays forever even after we're fully joined — the UI
        // reports CONNECTED but the audio asset never stops.
        const {iceConnectionState} = connection;
        if(iceConnectionState === 'disconnected' || iceConnectionState === 'checking' || iceConnectionState === 'new') {
          this.startConnectingSound();
        } else {
          this.stopConnectingSound();
        }
        // On first transition to connected: fetch participants. The legacy
        // joinGroupCall path does this (line ~217) — without it the SFU
        // never sends us our own participant entry, leaving
        // `instance.participant` undefined and the UI in a half-broken
        // "no self info" state. Also play the join-success chime so the
        // user has audible feedback that media is live.
        if(iceConnectionState === 'connected' && !instance.joined) {
          instance.joined = true;
          if(opts.transitionGeneration === undefined) {
            this.audioAsset.play({name: 'start'});
          }
          instance.requestSelfParticipantHydration();
        }
      });

      connectionInstance.createDescription();
      connectionInstance.createDataChannel();

      // Senders: attach transform between createTransceiver and replaceTrack
      // — the only window Chrome's script-transform machinery accepts. The
      // streamManager hook fires synchronously in that gap; LocalConferenceDescription
      // iterates audio first so the kind sequence matches `types`.
      await connectionInstance.appendStreamToConference((sender) => {
        // sender.track isn't bound yet; infer kind from the transceiver's
        // receiver track (see senderKind). Main connection → default channel 0.
        instance.attachE2eSendTransform(sender, senderKind(connection, sender));
      }, true);

      // Receive-side e2e transforms are attached PER REMOTE SSRC in
      // GroupCallInstance.onParticipantUpdate, right after each recvonly
      // transceiver is created and BEFORE its decoder binds — the only window
      // Chrome accepts a recv transform. The SFU exposes no m-lines, only SSRCs
      // (one per remote stream); we mint one recvonly m-line per SSRC exactly
      // like a legacy voice chat. The previous model — pre-adding a single
      // multiplexed recvonly audio + video m-line here and hoping every
      // participant funnelled through it — was wrong: the SFU never reused
      // those mids, and a lone receiver fed many SSRCs is what made Chrome pump
      // ~5 frames then bypass the transform.
      //
      // This `track` listener is a defensive fallback only: the late-attach helper
      // no-ops when the receiver already carries a transform, so it does anything
      // at all only for a receiver that somehow wasn't attached at creation time
      // — which it reports, because a late attach is not reliably honoured and
      // that receiver's media may reach the decoder unauthenticated.
      connection.addEventListener('track', (event) => {
        const kind = event.track.kind === 'video' ? 'video' : 'audio';
        instance.attachE2eRecvTransformLate(event.receiver, kind);
      });

      const isRecovery = opts.transitionGeneration !== undefined;
      this.assertConferenceTransition(opts.transitionGeneration);
      if(!isRecovery) {
        this.setCurrentGroupCall(instance);
      }
      this.startConnectingSound();
      await connectionInstance.requestNegotiation();
      this.assertConferenceTransition(opts.transitionGeneration);
      joinedSuccessfully = true;
      if(isRecovery) {
        this.setCurrentGroupCall(instance, true);
        if(instance.joined) instance.requestSelfParticipantHydration();
        // Roster rows dispatched while `currentGroupCall` was null (the whole
        // recovery join, including the un-awaited activation-triggered walk)
        // were saved into the manager cache but never routed to this instance —
        // no recv transceivers, no e2e SSRC mappings. Replay the cache
        // deterministically instead of waiting for the next complete poll.
        void Promise.resolve()
        .then(() => this.managers.appGroupCallsManager.getCachedParticipants(instance.id))
        .then((cached) => {
          if(this.currentGroupCall !== instance || instance.isClosing) return;
          for(const participant of cached.values()) {
            if(participant.pFlags.self) continue;
            instance.onParticipantUpdate(participant);
          }
        })
        .catch((err) => {
          this.log.warn('cached participant replay after recovery failed', err);
        });
      }
      window.setTimeout(() => {
        if(this.currentGroupCall === instance && !instance.isClosing) {
          this.startConferenceLiveness(instance);
        }
      }, 0);
      return instance;
    } catch(err) {
      await this.rollbackFailedJoin({
        instance,
        connectionInstance,
        streamManager,
        acceptedCall: opts.input,
        discard: opts.createConference
      });
      await opts.worker.terminate().catch((): undefined => undefined);
      throw err;
    }
  }

  private startConferenceLiveness(instance: GroupCallInstance): void {
    const connection = instance.connections.main?.connection;
    if(!connection) return;

    let stopped = false;
    let transportTimer: number | undefined;
    let mediaTimer: number | undefined;
    let mediaProbePending = false;
    let selectedCandidatePairId: string | undefined;
    let routeChangeObserved = false;
    let previousOutboundPackets: number | undefined;
    let previousSourceEnergy: number | undefined;
    let previousSamplesDuration: number | undefined;
    let previousRemoteInboundTimestamp: number | undefined;
    let outboundProgressSamples = 0;

    const clearTimer = (timer: number | undefined) => {
      if(timer !== undefined) clearTimeout(timer);
    };
    const resetMediaActivity = () => {
      previousOutboundPackets = undefined;
      previousSourceEnergy = undefined;
      previousSamplesDuration = undefined;
      previousRemoteInboundTimestamp = undefined;
      outboundProgressSamples = 0;
    };
    const resetMediaEvidence = () => {
      selectedCandidatePairId = undefined;
      routeChangeObserved = false;
      resetMediaActivity();
    };
    const stopMediaProbe = () => {
      if(mediaTimer !== undefined) clearInterval(mediaTimer);
      mediaTimer = undefined;
      resetMediaEvidence();
    };
    const stop = () => {
      if(stopped) return;
      stopped = true;
      clearTimer(transportTimer);
      transportTimer = undefined;
      stopMediaProbe();
    };
    const recover = (reason: string) => {
      stop();
      void this.recoverConference(instance, reason);
    };
    const armTransportTimeout = (reason: string) => {
      clearTimer(transportTimer);
      transportTimer = window.setTimeout(() => {
        transportTimer = undefined;
        if(connection.connectionState !== 'connected') recover(reason);
      }, CONNECTION_ESTABLISH_TIMEOUT_MS);
    };
    const onConnectionState = () => {
      if(connection.connectionState === 'connected') {
        clearTimer(transportTimer);
        transportTimer = undefined;
      } else if(connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        recover(`connection-${connection.connectionState}`);
      }
    };
    const onIceState = () => {
      const {iceConnectionState} = connection;
      if(iceConnectionState === 'failed' || iceConnectionState === 'closed') {
        recover(`ice-${iceConnectionState}`);
      } else if(iceConnectionState === 'disconnected') {
        armTransportTimeout('ice-disconnected');
      } else if((iceConnectionState === 'connected' || iceConnectionState === 'completed') &&
        connection.connectionState !== 'connected') {
        armTransportTimeout('dtls-timeout');
      }
    };
    const isMediaTransportReady = () => {
      if(this.currentGroupCall !== instance || instance.isClosing) return false;
      if(connection.connectionState !== 'connected' ||
         (connection.iceConnectionState !== 'connected' && connection.iceConnectionState !== 'completed')) {
        return false;
      }

      return true;
    };
    const isMediaActivityEligible = () => {
      if(!isMediaTransportReady() || instance.isMuted) return false;

      return instance.description?.entries.some((entry) => {
        return entry.type === 'audio' && entry.direction === 'recvonly';
      }) ?? false;
    };
    const sampleMediaLiveness = async() => {
      if(stopped || mediaProbePending) return;
      if(!isMediaTransportReady()) {
        if(this.currentGroupCall !== instance || instance.isClosing) stop();
        else resetMediaActivity();
        return;
      }

      mediaProbePending = true;
      try {
        const report = await connection.getStats();
        if(stopped || !isMediaTransportReady()) {
          if(this.currentGroupCall !== instance || instance.isClosing) stop();
          else resetMediaActivity();
          return;
        }

        const audioSource = instance.connections.main?.sources.audio?.source;
        // The report can carry hundreds of entries on a big conference (one
        // recvonly m-line per remote SSRC). RTCStatsReport is a maplike —
        // collect the few stats this probe needs in ONE pass and look the rest
        // up by id, instead of cloning the whole report every 5s.
        let transport: ConferenceRtcStat | undefined;
        let fallbackPair: ConferenceRtcStat | undefined;
        let outbound: ConferenceRtcStat | undefined;
        const candidatePairsById = new Map<string, ConferenceRtcStat>();
        const mediaSourcesById = new Map<string, ConferenceRtcStat>();
        const remoteInboundCandidates: ConferenceRtcStat[] = [];
        report.forEach((value) => {
          const stat = value as ConferenceRtcStat;
          if(stat.type === 'transport') {
            if(!transport && stat.selectedCandidatePairId) transport = stat;
          } else if(stat.type === 'candidate-pair') {
            candidatePairsById.set(stat.id, stat);
            if(!fallbackPair && (stat.selected || (stat.nominated && stat.state === 'succeeded'))) {
              fallbackPair = stat;
            }
          } else if(stat.type === 'media-source') {
            mediaSourcesById.set(stat.id, stat);
          } else if(stat.type === 'outbound-rtp') {
            if(!outbound &&
              (stat.kind === 'audio' || stat.mediaType === 'audio') &&
              typeof stat.ssrc === 'number' &&
              typeof audioSource === 'number' &&
              (stat.ssrc >>> 0) === (audioSource >>> 0)) {
              outbound = stat;
            }
          } else if(stat.type === 'remote-inbound-rtp') {
            remoteInboundCandidates.push(stat);
          }
        });
        const selectedPair = transport?.selectedCandidatePairId ?
          candidatePairsById.get(transport.selectedCandidatePairId) :
          fallbackPair;
        if(!selectedPair) {
          resetMediaEvidence();
          return;
        }

        const pairId = selectedPair.id;
        if(selectedCandidatePairId === undefined) {
          selectedCandidatePairId = pairId;
          resetMediaActivity();
          return;
        }
        if(pairId !== selectedCandidatePairId) {
          selectedCandidatePairId = pairId;
          routeChangeObserved = true;
          resetMediaActivity();
          return;
        }
        // While the one-shot recovery latch is held, the probe keeps running in
        // observe-only mode: a fresh RTCP acknowledgement proves the rebuilt
        // transport carries media, and only then is the latch released so a
        // LATER route change can be detected and recovered again. A permanent
        // latch left the second network flip of a call with no detector at all
        // ("mic on, nobody hears me" with no breadcrumb).
        const recoveryLatched = this.outboundMediaRecoveryUsed.has(instance);
        if(!routeChangeObserved && !recoveryLatched) return;
        if(!isMediaActivityEligible()) {
          resetMediaActivity();
          return;
        }

        const mediaSource = outbound?.mediaSourceId && mediaSourcesById.get(outbound.mediaSourceId);
        if(!outbound || !mediaSource || mediaSource.type !== 'media-source' ||
           !Number.isFinite(outbound.packetsSent) ||
           !Number.isFinite(mediaSource.totalAudioEnergy) ||
           !Number.isFinite(mediaSource.totalSamplesDuration)) {
          resetMediaActivity();
          return;
        }

        const outboundStat = outbound;
        const remoteInbound = remoteInboundCandidates.find((stat) => {
          return stat.localId === outboundStat.id ||
            outboundStat.remoteId === stat.id ||
            (typeof stat.ssrc === 'number' && (stat.ssrc >>> 0) === (outboundStat.ssrc! >>> 0));
        });
        const packetsSent = outbound.packetsSent!;
        const sourceEnergy = mediaSource.totalAudioEnergy!;
        const samplesDuration = mediaSource.totalSamplesDuration!;
        const remoteInboundTimestamp = remoteInbound?.timestamp;
        const updateBaseline = () => {
          previousOutboundPackets = packetsSent;
          previousSourceEnergy = sourceEnergy;
          previousSamplesDuration = samplesDuration;
          previousRemoteInboundTimestamp = remoteInboundTimestamp;
        };

        if(previousOutboundPackets === undefined ||
           previousSourceEnergy === undefined ||
           previousSamplesDuration === undefined) {
          updateBaseline();
          return;
        }

        if(remoteInbound && (previousRemoteInboundTimestamp === undefined ||
           remoteInbound.timestamp > previousRemoteInboundTimestamp)) {
          // The SFU acknowledged media on this route.
          if(recoveryLatched) {
            this.log('conference media confirmed after blackhole recovery — re-arming the probe');
            this.outboundMediaRecoveryUsed.delete(instance);
          }
          // Keep watching for the NEXT route change instead of stopping the
          // probe forever; the steady-state sample above is a cheap early
          // return until one happens.
          resetMediaEvidence();
          return;
        }

        if(recoveryLatched) {
          // Never chain a second automatic rejoin off the first one before the
          // rebuilt transport has acknowledged anything — that is the rejoin
          // loop the latch exists to prevent. Keep sampling for the ack.
          updateBaseline();
          return;
        }

        const packetDelta = packetsSent - previousOutboundPackets!;
        const energyDelta = sourceEnergy - previousSourceEnergy!;
        const durationDelta = samplesDuration - previousSamplesDuration!;
        updateBaseline();
        const rms = durationDelta > 0 && energyDelta >= 0 ? Math.sqrt(energyDelta / durationDelta) : 0;
        if(packetDelta < OUTBOUND_MEDIA_MIN_PACKETS || rms < OUTBOUND_MEDIA_MIN_RMS) {
          outboundProgressSamples = 0;
          return;
        }

        if(++outboundProgressSamples < OUTBOUND_MEDIA_BLACKHOLE_PROGRESS_SAMPLES) return;

        recover(OUTBOUND_MEDIA_BLACKHOLE_REASON);
      } catch(err) {
        resetMediaEvidence();
        this.log.warn('conference media liveness sample failed', err);
      } finally {
        mediaProbePending = false;
      }
    };
    instance.addEventListener('state', (state) => {
      if(state === GROUP_CALL_STATE.CLOSED) stop();
    });
    connection.addEventListener('connectionstatechange', onConnectionState);
    connection.addEventListener('iceconnectionstatechange', onIceState);
    onConnectionState();
    onIceState();
    if(connection.connectionState !== 'connected' && transportTimer === undefined) {
      armTransportTimeout('connection-timeout');
    }
    if(IS_CHROMIUM) {
      // Armed even when the one-shot recovery latch is held: the probe then
      // runs observe-only until a fresh RTCP ack releases the latch (see
      // sampleMediaLiveness), restoring detection for later route changes.
      mediaTimer = window.setInterval(() => {
        void sampleMediaLiveness();
      }, MEDIA_LIVENESS_INTERVAL_MS);
      void sampleMediaLiveness();
    }
  }

  private recoverConference(instance: GroupCallInstance, reason: string): Promise<void> {
    if(reason === OUTBOUND_MEDIA_BLACKHOLE_REASON) {
      this.outboundMediaRecoveryUsed.add(instance);
    }
    if(this.recoveringConferences.has(instance) || this.currentGroupCall !== instance || instance.isClosing) {
      return Promise.resolve();
    }
    if(this.conferenceTransitionReservations || this.pendingConferenceJoin) {
      this.pendingConferenceRecovery = {instance, reason};
      return Promise.resolve();
    }
    const authorization = this.conferenceRecoveryAuthorizations.get(instance);
    const input = authorization?.input ?? instance.toInputGroupCall();
    const selfUserId = instance.selfUserId;
    if(!input || selfUserId === undefined) {
      this.log.error('cannot recover conference without canonical input/key identity', reason);
      return instance.hangUp(false, false, true).then(() => {
        toastNew({langPackKey: 'Error.AnError'});
      }).catch((err) => {
        // All recovery entry points are event/timer driven. Keep this terminal
        // fallback observable even when local cleanup itself rejects.
        this.log.error('conference cleanup without recovery identity failed', err);
        toastNew({langPackKey: 'Error.AnError'});
      });
    }

    const generation = ++this.conferenceTransitionGeneration;
    this.recoveringConferences.add(instance);
    const muted = instance.isMuted;
    const joinVideo = instance.isSharingVideo;
    const chatId = instance.chatId;
    const outboundMediaRecoveryUsed = this.outboundMediaRecoveryUsed.has(instance);
    this.log.warn('rejoining conference', {reason, id: instance.id});
    const promise = (async() => {
      try {
        await instance.hangUp(false, false, true);
        this.assertConferenceTransition(generation);
        if(this.currentGroupCall === instance) this.setCurrentGroupCall(null);
        await this.joinConference({
          input,
          ...(authorization?.expectedCanonicalInput ? {
            expectedCanonicalInput: authorization.expectedCanonicalInput
          } : {}),
          selfUserId,
          chatId,
          muted,
          joinVideo,
          transitionGeneration: generation,
          ...(outboundMediaRecoveryUsed ? {outboundMediaRecoveryUsed: true} : {})
        });
      } catch(err) {
        if(err instanceof ConferenceTransitionCancelledError) {
          this.log('conference rejoin cancelled by a newer call transition');
          if(this.currentGroupCall === instance) this.setCurrentGroupCall(null);
        } else {
          this.log.error('conference rejoin failed', err);
          toastNew({langPackKey: 'Error.AnError'});
        }
      } finally {
        this.recoveringConferences.delete(instance);
        if(this.conferenceRecovery?.generation === generation) {
          this.conferenceRecovery = undefined;
        }
      }
    })();
    this.conferenceRecovery = {generation, promise};
    return promise;
  }

  private assertConferenceTransition(generation?: number): void {
    if(generation !== undefined && generation !== this.conferenceTransitionGeneration) {
      throw new ConferenceTransitionCancelledError('Conference recovery was superseded');
    }
  }

  private conferenceInputKey(input: InputGroupCall): string {
    switch(input._) {
      case 'inputGroupCall': return `id:${input.id}`;
      case 'inputGroupCallSlug': return `slug:${input.slug}`;
      case 'inputGroupCallInviteMessage': return `message:${input.msg_id}`;
    }
  }

  private apiErrorType(error: unknown): string | undefined {
    if(error && typeof error === 'object' && 'type' in error) {
      const type = (error as {type?: unknown}).type;
      if(typeof type === 'string') return type;
    }
    return error instanceof Error ? error.message : undefined;
  }

  // Fetch the tip and confirmed next cursor of subchain 0. `block` is absent
  // when the server returned an empty chain, in which case the caller builds a
  // zero block. Mirrors tdlib's GetGroupCallLastBlockQuery flow.
  // Accepts either `inputGroupCall` or `inputGroupCallSlug`.
  private async fetchLastConferenceBlock(
    input: InputGroupCall,
    expectedCanonicalInput?: InputGroupCall.inputGroupCall
  ): Promise<{
    block?: Uint8Array,
    nextOffset: number
  }> {
    // sub_chain_id 0 is the block chain. offset=-1, limit=1 fetches the tip
    // (see schema: phone.getGroupCallChainBlocks → Updates).
    const updates = await this.managers.appCallsManager.getGroupCallChainBlocks(input, 0, -1, 1);
    // Surface the embedded updates through the normal pipeline so any side
    // effects (e.g. updateGroupCall) are applied to local state.
    await this.managers.apiUpdatesManager.processUpdateMessage(updates);
    const chainUpdate = findGroupCallChainUpdate(updates, 0, input, expectedCanonicalInput);
    if(!chainUpdate) {
      throw new Error('Conference chain response did not contain a matching block update');
    }
    const {blocks, next_offset: nextOffset} = chainUpdate;
    if(!Number.isSafeInteger(nextOffset) || nextOffset < 0 || nextOffset < blocks.length) {
      throw new Error('Conference chain response contained an invalid next_offset');
    }
    if(!blocks.length && nextOffset !== 0) {
      throw new Error('Conference chain response omitted a non-empty chain tip');
    }
    return {
      block: blocks[blocks.length - 1],
      nextOffset
    };
  }
}

const groupCallsController = new GroupCallsController();
DEBUG && (MOUNT_CLASS_TO.groupCallController = groupCallsController);
export default groupCallsController;
