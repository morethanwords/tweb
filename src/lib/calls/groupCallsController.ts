import getGroupCallAudioAsset from '@components/groupCall/getAudioAsset';
import {MOUNT_CLASS_TO} from '@config/debug';
import EventListenerBase from '@helpers/eventListenerBase';
import {GroupCallParticipant, GroupCallParticipantVideo, GroupCallParticipantVideoSourceGroup} from '@layer';
import {GroupCallId, GroupCallConnectionType} from '@appManagers/appGroupCallsManager';
import {AppManagers} from '@lib/managers';
import {logger} from '@lib/logger';
import rootScope from '@lib/rootScope';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import createMainStreamManager from '@lib/calls/helpers/createMainStreamManager';
import senderKind from '@lib/calls/helpers/senderKind';
import {generateSsrc} from '@lib/calls/localConferenceDescription';
import {WebRTCLineType} from '@lib/calls/sdpBuilder';
import StreamManager from '@lib/calls/streamManager';
import {Ssrc} from '@lib/calls/types';
import {EncryptWorkerHost} from '@lib/calls/e2e/encryptWorkerHost';
import {randomBytes} from '@lib/calls/e2e/crypto';
import {PrivateKey} from '@lib/calls/e2e/keys';
import type {GroupParticipant} from '@lib/calls/e2e/tlTypes';
import type {InputGroupCall, Update, Updates} from '@layer';
import {NULL_PEER_ID} from '@appManagers/constants';

const IS_MUTED = true;

export function makeSsrcsFromParticipant(participant: GroupCallParticipant) {
  return [
    makeSsrcFromParticipant(participant, 'audio', participant.source),
    participant.video?.audio_source && makeSsrcFromParticipant(participant, 'audio', participant.video.audio_source),
    participant.video && makeSsrcFromParticipant(participant, 'video', participant.video.source_groups, participant.video.endpoint),
    participant.presentation?.audio_source && makeSsrcFromParticipant(participant, 'audio', participant.presentation.audio_source),
    participant.presentation && makeSsrcFromParticipant(participant, 'video', participant.presentation.source_groups, participant.presentation.endpoint)
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
  instance: (instance: GroupCallInstance) => void
}> {
  private audioAsset: ReturnType<typeof getGroupCallAudioAsset>;
  private log: ReturnType<typeof logger>;
  private currentGroupCall: GroupCallInstance;
  private managers: AppManagers;

  public construct(managers: AppManagers) {
    this.managers = managers;
    this.audioAsset = getGroupCallAudioAsset();
    this.log = logger('GCC');

    rootScope.addEventListener('group_call_update', (groupCall) => {
      const {currentGroupCall} = this;
      if(currentGroupCall?.id === groupCall.id) {
        currentGroupCall.groupCall = groupCall;

        if(groupCall._ === 'groupCallDiscarded') {
          currentGroupCall.hangUp(false, false, true);
        }
      }
    });

    rootScope.addEventListener('group_call_participant', ({groupCallId, participant}) => {
      const {currentGroupCall} = this;
      if(currentGroupCall?.id === groupCallId) {
        currentGroupCall.onParticipantUpdate(participant/* , this.doNotDispatchParticipantUpdate */);
      }
    });
  }

  get groupCall() {
    return this.currentGroupCall;
  }

  public setCurrentGroupCall(groupCall: GroupCallInstance) {
    this.currentGroupCall = groupCall;

    if(groupCall) {
      this.dispatchEvent('instance', groupCall);
    }
  }

  public startConnectingSound() {
    this.stopConnectingSound();
    this.audioAsset.playWithTimeout({name: 'connect', loop: true}, 2500);
  }

  public stopConnectingSound() {
    this.audioAsset.stop();
    this.audioAsset.cancelDelayedPlay();
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
      currentGroupCall.participants.then((participants) => {
        if(this.currentGroupCall !== currentGroupCall || currentGroupCall.state === GROUP_CALL_STATE.CLOSED) {
          return;
        }

        participants.forEach((participant) => {
          if(!participant.pFlags.self) {
            currentGroupCall.onParticipantUpdate(participant);
          }
        });
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
      connection.addEventListener('negotiationneeded', () => {
        connectionInstance.negotiate();
      });

      connection.addEventListener('track', (event) => {
        log('ontrack', event);
        currentGroupCall.onTrack(event);
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
            currentGroupCall.hangUp();
            break;
          }

          case 'completed': {
            break;
          }

          case 'connected': {
            if(!currentGroupCall.joined) {
              currentGroupCall.joined = true;
              this.audioAsset.play({name: 'start'});
              this.managers.appGroupCallsManager.getGroupCallParticipants(groupCallId);
            }

            break;
          }

          case 'disconnected': {
            break;
          }

          case 'failed': {
            // TODO: replace with ICE restart
            currentGroupCall.hangUp();
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

      connectionInstance.appendStreamToConference();

      this.setCurrentGroupCall(currentGroupCall);
      log('set currentGroupCall', groupCallId, currentGroupCall);

      this.startConnectingSound();

      return connectionInstance.negotiate();
    }
  }

  // ===== TdE2E conference call entry points =====
  //
  // Both initiator and joinee follow tdlib's canonical flow
  // (GroupCallManager.cpp:4445 try_join_group_call → do_join_group_call):
  //   1. ALWAYS poll subchain 0 (`phone.getGroupCallChainBlocks`, offset=-1,
  //      limit=1) to find the chain head.
  //   2. If empty → build a zero block (height 0). Otherwise → build a
  //      self-add block referencing the head.
  //   3. Submit via `phone.joinGroupCall(call, public_key, block, params)`.
  //
  // For `startConference` we first call `phone.createConferenceCall(flags=0)`
  // to mint the empty call (tdesktop: calls_group_common.cpp:483
  // `MakeConferenceCall`; iOS: TelegramEngine/Calls/GroupCalls.swift:3348
  // `_internal_createConferenceCall`) and then delegate to `joinConference`.
  //
  // We deliberately do NOT use the single-call `createConferenceCall(
  // flags=join|public_key|block|params)` shortcut that tdesktop's
  // `GroupCall::startConference` uses (calls_group_call.cpp:1730) — that
  // path is for migrating from an existing 1-on-1 / scheduled call, where
  // there's no separate "empty create" step.
  public async startConference(opts: {
    chatId?: ChatId;
    selfUserId: bigint;
    muted?: boolean;
    joinVideo?: boolean;
  }): Promise<GroupCallInstance> {
    // Step 1: create empty conference (flags=0). Returns updates carrying the
    // new inputGroupCall.
    const emptyUpdates = await this.managers.appCallsManager.createEmptyConferenceCall();
    this.managers.apiUpdatesManager.processUpdateMessage(emptyUpdates);
    const input = this.findInputGroupCallFromUpdates(emptyUpdates);
    if(!input || input._ !== 'inputGroupCall') {
      throw new Error('startConference: no inputGroupCall in createConferenceCall(flags=0) response');
    }

    // Step 2: join via the canonical flow. tdlib does NOT special-case
    // "just created my own conference" — it always polls the chain first
    // and decides zero-vs-self-add based on what comes back. This matters
    // because empty-create may leave the chain in a server-specific state
    // (e.g. an implicit chain head) that we discover via the poll.
    return this.joinConference({
      input,
      selfUserId: opts.selfUserId,
      chatId: opts.chatId,
      muted: opts.muted,
      joinVideo: opts.joinVideo
    });
  }

  // Drive an incoming conference (we've been invited or have the invite link).
  // Fetches the latest block from the server, builds our self-add block,
  // then joins the SFU.
  public async joinConference(opts: {
    input: InputGroupCall;
    selfUserId: bigint;
    chatId?: ChatId;
    muted?: boolean;
    joinVideo?: boolean;
  }): Promise<GroupCallInstance> {
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
    const seed = randomBytes(32);
    const tempSk = PrivateKey.fromSeed(seed);
    const publicKey = new Uint8Array(tempSk.publicKeyBytes);
    tempSk.destroy();

    // Same tdlib conventions as zero-block: version=0, perms = 3 (Add|Remove).
    const selfParticipant: GroupParticipant = {
      userId: opts.selfUserId,
      publicKey,
      canAddUsers: true,
      canRemoveUsers: true,
      version: 0
    };

    const worker = new EncryptWorkerHost();
    // Build (or rebuild) the join block by polling the chain head and either
    // making a self-add block on top of it OR a zero block if the chain is
    // empty. Used both for the initial submit AND for CONF_WRITE_CHAIN_INVALID
    // retries (where the chain may have advanced).
    const buildJoinBlock = async(): Promise<Uint8Array> => {
      const lastBlock = await this.fetchLastConferenceBlock(opts.input);
      return lastBlock ?
        worker.createSelfAddBlock({
          privateSeed: seed,
          previousBlockServer: lastBlock,
          self: selfParticipant
        }) :
        worker.createZeroBlock({
          privateSeed: seed,
          groupState: {participants: [selfParticipant], externalPermissions: 3}
        });
    };

    try {
      // Always poll the chain head first. tdlib does this for both "create"
      // and "join" — see GroupCallManager.cpp:4445 try_join_group_call.
      const joinBlock = await buildJoinBlock();

      return await this.joinConferenceCommon({
        input: opts.input,
        worker,
        seed,
        publicKey,
        selfUserId: opts.selfUserId,
        lastBlockServer: joinBlock,
        rebuildBlock: buildJoinBlock,
        chatId: opts.chatId,
        muted: opts.muted,
        joinVideo: opts.joinVideo
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
    worker: EncryptWorkerHost;
    seed: Uint8Array;
    publicKey: Uint8Array;
    selfUserId: bigint;
    lastBlockServer: Uint8Array;
    chatId?: ChatId;
    muted?: boolean;
    joinVideo?: boolean;
    // Optional rebuild callback — invoked by the connection layer when the
    // server returns CONF_WRITE_CHAIN_INVALID (chain advanced mid-flight).
    // Should refetch chain head + return a freshly-built block.
    rebuildBlock?: () => Promise<Uint8Array>;
  }): Promise<GroupCallInstance> {
    this.audioAsset.createAudio();
    const streamManager = await createMainStreamManager(opts.muted ?? true, opts.joinVideo);

    // Pick a stable placeholder id for the instance until the real id arrives
    // in the join response. For id-form input we already know it; for slug or
    // create modes we use a synthetic id and let the join flow rewrite it.
    // For id-form input keep the id in its native (fetchLong) form so it stays
    // === the manager's cache key; slug/create modes get a synthetic sentinel
    // that the join response rewrites to the real id.
    const placeholderId = (opts.input && opts.input._ === 'inputGroupCall') ?
      opts.input.id :
      `pending-conf-${Date.now()}`;
    const instance = new GroupCallInstance({
      chatId: opts.chatId ?? NULL_PEER_ID,
      id: placeholderId,
      managers: this.managers
    });
    instance.fixSafariAudio();
    instance.attachE2e(opts.worker, opts.selfUserId);

    // Hydrate the worker against the block we built/fetched.
    await opts.worker.init({
      userId: opts.selfUserId,
      privateSeed: opts.seed,
      lastBlockServer: opts.lastBlockServer
    });

    instance.addEventListener('state', (state) => {
      if(this.currentGroupCall === instance && state === GROUP_CALL_STATE.CLOSED) {
        this.setCurrentGroupCall(null);
        this.stopConnectingSound();
        this.audioAsset.play({name: 'end'});
        void opts.worker.terminate().catch((): undefined => undefined);
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

    const connectionInstance = instance.createConnectionInstance({
      streamManager,
      type: 'main',
      options: {
        type: 'main',
        isMuted: opts.muted ?? true,
        joinVideo: opts.joinVideo,
        rejoin: false,
        e2ePublicKey: opts.publicKey,
        e2eBlock: opts.lastBlockServer,
        // Pass non-id-form input straight through. The default codepath
        // (getGroupCallInput) would synthesise id+access_hash from our
        // placeholder id, which the server rejects for invitees.
        e2eCallInput: (opts.input && opts.input._ !== 'inputGroupCall') ? opts.input : undefined,
        // Wire rebuild callback so the connection layer can recover from
        // CONF_WRITE_CHAIN_INVALID without tearing down the WebRTC stack.
        e2eRebuildBlock: opts.rebuildBlock
      }
    });

    const connection = connectionInstance.createPeerConnection();
    connection.addEventListener('negotiationneeded', () => connectionInstance.negotiate());
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
        this.audioAsset.play({name: 'start'});
        void this.managers.appGroupCallsManager.getGroupCallParticipants(instance.id)
        .catch((err) => this.log.warn('getGroupCallParticipants on connect failed', err));
      }
    });

    connectionInstance.createDescription();
    connectionInstance.createDataChannel();

    // Senders: attach transform between createTransceiver and replaceTrack
    // — the only window Chrome's script-transform machinery accepts. The
    // streamManager hook fires synchronously in that gap; LocalConferenceDescription
    // iterates audio first so the kind sequence matches `types`.
    connectionInstance.appendStreamToConference((sender) => {
      // sender.track isn't bound yet; infer kind from the transceiver's
      // receiver track (see senderKind). Main connection → default channel 0.
      instance.attachE2eSendTransform(sender, senderKind(connection, sender));
    });

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
    // This `track` listener is a defensive fallback only: attachE2eRecvTransform
    // is idempotent (no-ops when the receiver already carries a transform), so
    // it fires meaningfully only for a receiver that somehow wasn't attached at
    // creation time.
    connection.addEventListener('track', (event) => {
      const kind = event.track.kind === 'video' ? 'video' : 'audio';
      instance.attachE2eRecvTransform(event.receiver, kind);
    });

    this.setCurrentGroupCall(instance);
    this.startConnectingSound();
    await connectionInstance.negotiate();
    return instance;
  }

  // Fetch the tip of subchain 0. Returns `undefined` if the chain is empty
  // (server returned zero blocks) — caller should build a zero block in that
  // case. Mirrors tdlib's `GetGroupCallLastBlockQuery` → `do_join_group_call`
  // (GroupCallManager.cpp:4513): empty → zero block, otherwise → self-add.
  // Accepts either `inputGroupCall` or `inputGroupCallSlug`.
  private async fetchLastConferenceBlock(input: InputGroupCall): Promise<Uint8Array | undefined> {
    // sub_chain_id 0 is the block chain. offset=-1, limit=1 fetches the tip
    // (see schema: phone.getGroupCallChainBlocks → Updates).
    const updates = await this.managers.appCallsManager.getGroupCallChainBlocks(input, 0, -1, 1);
    // Surface the embedded updates through the normal pipeline so any side
    // effects (e.g. updateGroupCall) are applied to local state.
    this.managers.apiUpdatesManager.processUpdateMessage(updates);
    const blocks = this.extractBlocksFromUpdates(updates);
    if(blocks.length === 0) return undefined;
    return blocks[blocks.length - 1];
  }

  // Extract chain blocks from an Updates wrapper. Per schema, phone.getGroupCallChainBlocks
  // returns Updates whose body contains an updateGroupCallChainBlocks with
  // `.blocks: Uint8Array[]`.
  private extractBlocksFromUpdates(updates: Updates): Uint8Array[] {
    if(updates._ !== 'updates' && updates._ !== 'updatesCombined') return [];
    for(const u of (updates as Updates.updates).updates) {
      if(u._ === 'updateGroupCallChainBlocks') return u.blocks;
    }
    return [];
  }

  private findInputGroupCallFromUpdates(updates: Updates): InputGroupCall | undefined {
    if(updates._ !== 'updates' && updates._ !== 'updatesCombined') return undefined;
    for(const u of (updates as Updates.updates).updates) {
      if(u._ === 'updateGroupCall' && u.call._ !== 'groupCallDiscarded') {
        return {_: 'inputGroupCall', id: u.call.id, access_hash: u.call.access_hash};
      }
    }
    return undefined;
  }
}

const groupCallsController = new GroupCallsController();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.groupCallController = groupCallsController);
export default groupCallsController;
