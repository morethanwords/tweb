import getCallAudioAsset, {CALL_AUDIO_ASSETS} from '@components/call/getAudioAsset';
import DEBUG, {MOUNT_CLASS_TO} from '@config/debug';
import IS_CALL_SUPPORTED from '@environment/callSupport';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import insertInDescendSortedArray from '@helpers/array/insertInDescendSortedArray';
import AudioAssetPlayer from '@helpers/audioAssetPlayer';
import bytesCmpConstTime from '@helpers/bytes/bytesCmpConstTime';
import bytesToHex from '@helpers/bytes/bytesToHex';
import EventListenerBase from '@helpers/eventListenerBase';
import noop from '@helpers/noop';
import tsNow from '@helpers/tsNow';
import {PhoneCall, PhoneCallProtocol} from '@layer';
import {CallId} from '@appManagers/appCallsManager';
import {AppManagers} from '@lib/managers';
import {logger} from '@lib/logger';
import apiManagerProxy from '@lib/apiManagerProxy';
import {NULL_PEER_ID} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
import CallInstance from '@lib/calls/callInstance';
import CALL_STATE from '@lib/calls/callState';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import IS_CONFERENCE_CALL_SUPPORTED from '@environment/conferenceCallSupport';
import groupCallsController from '@lib/calls/groupCallsController';
import rtmpCallsController from '@lib/calls/rtmpCallsController';
import {toastNew} from '@components/toast';
import getConferenceInviteErrorLangKey from '@lib/calls/conferenceInviteError';
import callTransitionCoordinator from '@lib/calls/callTransitionCoordinator';
import {groupCallToInput} from '@lib/calls/helpers/groupCallUpdates';
import {CALL_PROTOCOL_LIBRARY_VERSIONS} from '@lib/calls/p2P/getCallProtocol';
import {CALL_REQUEST_TIMEOUT, CALL_WAITING_RING_VOLUME} from '@lib/calls/constants';

export class CallsController extends EventListenerBase<{
  instance: (details: {hasCurrent: boolean, instance: CallInstance}) => void,
  accepting: (instance: CallInstance) => void, // это костыль. используется при параллельном вызове, чтобы заменить звонок в topbarCall
  incompatible: (userId: UserId) => void,
  conferenceMigration: (details: {
    instance: CallInstance,
    state: 'started' | 'completed' | 'failed'
  }) => void,
}> {
  private log: ReturnType<typeof logger>;
  private managers: AppManagers;
  private audioAsset: ReturnType<typeof getCallAudioAsset>;
  // Call waiting rings through its own player: the shared one may be busy with
  // the current call's outgoing / connect tone, and stopping that tone with the
  // waiting call would silence the call that is actually being made.
  private callWaitingAudioAsset: AudioAssetPlayer<Record<'incoming', string>>;
  private callWaitingInstance: CallInstance;
  private instances: Map<CallId, CallInstance>;
  private sortedInstances: Array<CallInstance>;
  private tempId: number;
  private migratingCalls = new WeakSet<CallInstance>();

  public construct(managers: AppManagers) {
    this.managers = managers;
    this.log = logger('CC');

    if(!IS_CALL_SUPPORTED) {
      return;
    }

    this.audioAsset = getCallAudioAsset();
    this.tempId = 0;
    this.instances = new Map();
    this.sortedInstances = [];

    if(typeof(window) !== 'undefined') {
      // The tab can go away with a call up. The SharedWorker outlives it while
      // any other tab exists, so a fire-and-forget discard through the manager
      // still reaches the server and the peer sees the call end instead of a
      // stall until the server times it out.
      window.addEventListener('pagehide', () => this.discardAllOnUnload());
    }

    rootScope.addEventListener('call_update', (call) => {
      void this.handleCallUpdate(call).catch((err) => {
        this.log.error('call update processing failed', err, call);

        const instance = this.instances.get(call.id);
        if(!instance || instance.isClosing) {
          return;
        }

        const discardedByOtherParty = call._ === 'phoneCallDiscarded';
        const reason = discardedByOtherParty ?
          call.reason || 'phoneCallDiscardReasonDisconnect' :
          'phoneCallDiscardReasonDisconnect';
        void instance.hangUp(reason, discardedByOtherParty).catch((hangUpError) => {
          this.log.error('call update failure cleanup failed', hangUpError, call);
        });
      });
    });

    rootScope.addEventListener('call_signaling', ({callId, data}) => {
      const instance = this.instances.get(callId);
      if(instance?.id !== callId) {
        return;
      }

      instance.onUpdatePhoneCallSignalingData(data);
    });

    // Conference chain delivery (sub_chain_id 0 = blocks, 1 = broadcasts)
    // is handled by `GroupCallInstance.attachE2e` for the active instance.
  }

  private async handleCallUpdate(call: PhoneCall): Promise<void> {
    const instance = this.instances.get(call.id);

    if(instance?.isClosing && call._ !== 'phoneCallDiscarded') {
      // A request/accept/confirm response can be delivered through the
      // update channel before the manager proxy resolves to its caller-side
      // post-await guard. Never let that early delivery revive crypto/media
      // work for an instance whose close transaction already started.
      return;
    }

    // `setPhoneCall` replaces the state the exchange reads (g_a_hash, g_b, the
    // connections), so every state that has a direction or an order is checked
    // against the instance before it is taken — tdesktop `checkCallCommonFields`,
    // tdlib's per-state gating in `do_update_call`. A mismatching update is
    // ignored, never a reason to hang up.
    switch(call._) {
      case 'phoneCallDiscarded': {
        if(instance) {
          instance.setPhoneCall(call);
          // Server-initiated migration to a conference call: the 1-on-1
          // is being ended specifically so both parties can rejoin via
          // the new GroupCall. Hand off via the conference path (which
          // suppresses the "call ended" audio and preserves media intent)
          // instead of the normal hangUp. The support gate guarantees the
          // browser can attach the per-receiver encryption transforms.
          if(call.reason?._ === 'phoneCallDiscardReasonMigrateConferenceCall') {
            if(IS_CONFERENCE_CALL_SUPPORTED) {
              await this.migrateToConference(instance, call.reason.slug);
            } else {
              // This is still a transport handoff attempt, even though this
              // browser cannot complete it. Do not play a normal "call
              // ended" / "failed" tone on top of the capability toast.
              this.migratingCalls.add(instance);
              await instance.hangUp(call.reason, true);
              toastNew({langPackKey: 'ConferenceCall.Unsupported'});
            }
            break;
          }
          await instance.hangUp(call.reason, true);
        }

        break;
      }

      case 'phoneCallAccepted': {
        if(!instance) {
          break;
        }

        // Only the caller confirms, and only once it holds `a` (tdesktop:
        // "Unexpected phoneCallAccepted for an incoming call"; tdlib takes it
        // in WaitRequestResult alone). Anything else must not touch the
        // exchange — before this gate the callee crashed on `dh.a` and hung up.
        if(!instance.isOutgoing || !instance.dh?.a) {
          this.log.warn('ignoring phoneCallAccepted for a call that is not awaiting acceptance', call.id);
          break;
        }

        if(!this.isProtocolCompatible(call.protocol)) {
          this.log.warn('callee speaks no protocol version this client does', call.id);
          await instance.hangUp('phoneCallDiscardReasonDisconnect');
          this.dispatchEvent('incompatible', instance.interlocutorUserId);
          break;
        }

        instance.setPhoneCall(call);
        await instance.confirmCall();
        break;
      }

      case 'phoneCallRequested': {
        if(instance || !this.isIncomingCallRequestPlausible(call)) {
          break;
        }

        if(!this.isProtocolCompatible(call.protocol)) {
          // tdesktop finds this out only once tgcalls refuses to create the
          // instance after the key exchange (ERROR_INCOMPATIBLE → finish(Failed),
          // i.e. phoneCallDiscardReasonDisconnect). The request already tells:
          // end it with the same reason instead of ringing for a call that
          // cannot connect.
          this.log.warn('caller speaks no protocol version this client does', call.id);
          void this.managers.appCallsManager.discardCall(
            call.id,
            0,
            {_: 'phoneCallDiscardReasonDisconnect'},
            call.pFlags.video
          ).catch((err) => {
            this.log.error('discarding an incompatible call request failed', err);
          });
          this.dispatchEvent('incompatible', call.admin_id);
          break;
        }

        const incoming = this.createCallInstance({
          isOutgoing: false,
          interlocutorUserId: call.admin_id
        });

        incoming.overrideConnectionState(CALL_STATE.PENDING);
        incoming.setPhoneCall(call);
        // Unanswered is "missed" — unless another call is still up when the
        // timer fires, which is what "busy" means to the caller.
        incoming.setHangUpTimeout(CALL_REQUEST_TIMEOUT, () => {
          return this.isOtherCallActive(incoming) ? 'phoneCallDiscardReasonBusy' : 'phoneCallDiscardReasonMissed';
        });

        // tdesktop sends this before ringing (calls_call.cpp startIncoming): it
        // is what turns the caller's "waiting" into "ringing".
        void this.managers.appCallsManager.receivedCall(call.id).catch((err) => {
          this.log.error('phone.receivedCall failed', err);
        });
        break;
      }

      case 'phoneCall': {
        if(!instance) {
          break;
        }

        // The caller derived the key from phone.confirmCall's answer; the
        // update only mirrors it.
        if(instance.isOutgoing) {
          instance.setPhoneCall(call);
          break;
        }

        // `dh.g_a` is what getEmojisFingerprint hashes into the emoji SAS — the only
        // human-verifiable MITM defence of the call — so a server-relayed value must
        // never land there before it is checked against the commitment, and a failed
        // check has to be fatal instead of leaving a poisoned value behind.
        // `dh.g_a` being set already means there is nothing to accept, and the
        // in-flight flag closes the window that the two awaits below open for a
        // second, forged update.
        if(instance.encryptionKey || instance.dh?.g_a || instance.isVerifyingPeerG_a) {
          break;
        }

        // Not accepted yet, so there is no `b` to derive a key with: tdlib
        // takes phoneCall in WaitAcceptResult / WaitConfirmResult alone.
        if(!instance.dh?.b) {
          this.log.warn('ignoring phoneCall for a call that has not been accepted', call.id);
          break;
        }

        instance.setPhoneCall(call);
        instance.isVerifyingPeerG_a = true;

        // Only what the peer sent in the clear may be logged: `dh` holds the
        // private exponent, and error-level logs are kept in production.
        const dh = instance.dh;
        const g_a = call.g_a_or_b;
        const g_a_hash = await apiManagerProxy.invokeCrypto('sha256', g_a);
        if(instance.isClosing) break;
        if(!bytesCmpConstTime(dh.g_a_hash, g_a_hash)) {
          this.log.error('Incorrect g_a_hash', {expected: bytesToHex(dh.g_a_hash), actual: bytesToHex(g_a_hash)});
          await instance.hangUp('phoneCallDiscardReasonDisconnect');
          break;
        }

        let key: Uint8Array, key_fingerprint: string;
        try {
          ({key, key_fingerprint} = await this.managers.appCallsManager.computeKey(g_a, dh.b, dh.p));
        } catch(err) {
          this.log.error('computeKey failed (invalid DH public value)', err, {g_a_length: g_a?.length});
          await instance.hangUp('phoneCallDiscardReasonDisconnect');
          break;
        }
        if(instance.isClosing) break;
        // The server's long arrives as a JS number whenever it fits 53 bits
        // (fetchLong), the local one is always a decimal string — a strict
        // compare dropped one correct incoming call in a thousand.
        if(String(call.key_fingerprint) !== key_fingerprint) {
          this.log.error('Incorrect key fingerprint', {expected: key_fingerprint, actual: String(call.key_fingerprint)});
          await instance.hangUp('phoneCallDiscardReasonDisconnect');
          break;
        }

        // Authenticated against both the commitment and the key fingerprint — only
        // now may it drive the SAS.
        instance.dh.g_a = g_a;
        instance.encryptionKey = key;
        instance.joinCall();

        break;
      }

      default: {
        instance?.setPhoneCall(call);
        break;
      }
    }
  }

  /**
   * `Instance::handleCallUpdate` (calls_instance.cpp:676): a request that names
   * someone else as the callee, or ourselves as the caller, is not ours to ring
   * for, and one older than the ring window is already over ("Ignoring too old
   * call").
   */
  private isIncomingCallRequestPlausible(call: PhoneCall.phoneCallRequested) {
    const myId = rootScope.myId;
    if(call.participant_id.toPeerId() !== myId || call.admin_id.toPeerId() === myId) {
      this.log.warn('ignoring a call request not addressed to this account', call.id);
      return false;
    }

    if(call.date + CALL_REQUEST_TIMEOUT / 1000 < tsNow(true)) {
      this.log.warn('ignoring a call request that is too old', call.id);
      return false;
    }

    return true;
  }

  // This client speaks exactly the tgcalls versions in getCallProtocol; a peer
  // whose list has none of them cannot be connected to whatever happens next.
  private isProtocolCompatible(protocol: PhoneCallProtocol) {
    return !!protocol?.library_versions?.some((version) => CALL_PROTOCOL_LIBRARY_VERSIONS.includes(version));
  }

  /**
   * Whether a call other than `exclude` is up — another 1-on-1, a group call
   * or a live stream. What "busy" means to an incoming call or invitation.
   */
  public isOtherCallActive(exclude?: CallInstance) {
    const {currentCall} = this;
    const {groupCall} = groupCallsController;
    return !!(
      (currentCall && currentCall !== exclude) ||
      rtmpCallsController.currentCall ||
      (groupCall && groupCall.state !== GROUP_CALL_STATE.CLOSED)
    );
  }

  /**
   * `#?call=<id>` — a tab opened from the notification of a call that rang
   * while no tab of this account was open. The manager still holds the call
   * while it rings; anything else (answered, discarded, already ringing here)
   * is no reason to open a popup.
   */
  public async ringRequestedCall(callId: CallId) {
    if(!this.instances) {
      return;
    }

    const call = await this.managers.appCallsManager.getCall(callId);
    if(call?._ !== 'phoneCallRequested' || this.instances.has(call.id)) {
      return;
    }

    rootScope.dispatchEvent('call_update', call);
  }

  private discardAllOnUnload() {
    for(const instance of this.instances.values()) {
      const state = instance.connectionState;
      if(instance.isClosing) {
        continue;
      }

      // A ringing incoming call is not this tab's alone: the other devices keep
      // ringing, and tdesktop leaves it on quit too (`isQuitPrevent`).
      if(!instance.isOutgoing && state === CALL_STATE.PENDING) {
        continue;
      }

      // tdesktop `Call::hangup`: an outgoing call nobody answered is missed.
      const reason = state === CALL_STATE.PENDING || state === CALL_STATE.REQUESTING ?
        'phoneCallDiscardReasonMissed' :
        'phoneCallDiscardReasonHangup';
      void this.managers.appCallsManager.discardCall(
        instance.id,
        instance.duration,
        {_: reason},
        instance.isSharingVideo || instance.isSharingScreen
      ).catch(noop);
    }
  }

  // A second incoming call while another call is current (call waiting): it
  // has to be heard, quietly, and fall silent as soon as it stops pending —
  // answered here (it becomes current), answered elsewhere, or given up on.
  private setCallWaitingRinging(instance: CallInstance, ringing: boolean) {
    if(ringing) {
      this.callWaitingInstance = instance;
      this.callWaitingAudioAsset ??= new AudioAssetPlayer({incoming: CALL_AUDIO_ASSETS.incoming});
      this.callWaitingAudioAsset.play({name: 'incoming', loop: true, volume: CALL_WAITING_RING_VOLUME});
    } else if(this.callWaitingInstance === instance) {
      this.callWaitingInstance = undefined;
      this.callWaitingAudioAsset.stop();
    }
  }

  public get currentCall() {
    return this.sortedInstances?.[0];
  }

  public getCallByUserId(userId: UserId) {
    for(const [callId, instance] of this.instances) {
      if(instance.interlocutorUserId === userId) {
        return instance;
      }
    }
  }

  private createCallInstance(options: {
    isOutgoing: boolean,
    interlocutorUserId: UserId,
    protocol?: PhoneCallProtocol
  }) {
    const call = new CallInstance({
      managers: this.managers,
      ...options
    });

    call.addEventListener('state', (state) => {
      const currentCall = this.currentCall;
      if(state === CALL_STATE.CLOSED) {
        this.instances.delete(call.id);
        indexOfAndSplice(this.sortedInstances, call);
      } else {
        insertInDescendSortedArray(this.sortedInstances, call, 'sortIndex');
      }

      if(state === CALL_STATE.EXCHANGING_KEYS) {
        call.wasTryingToJoin = true;
      }

      const hasConnected = call.connectedAt !== undefined;
      if(state === CALL_STATE.EXCHANGING_KEYS || (state === CALL_STATE.CONNECTING && hasConnected)) {
        call.setHangUpTimeout(CALL_REQUEST_TIMEOUT, 'phoneCallDiscardReasonDisconnect');
      } else {
        call.clearHangUpTimeout();
      }

      this.setCallWaitingRinging(
        call,
        !call.isOutgoing && state === CALL_STATE.PENDING && !!currentCall && currentCall !== call
      );

      if(currentCall === call || !currentCall) {
        if(state === CALL_STATE.CLOSED) {
          if(this.migratingCalls.has(call)) {
            // A migration is a transport handoff, not a user-visible call end.
            // Keep the controller-wide asset quiet while the conference joins.
            this.audioAsset.stop();
          } else if(!call.isOutgoing && !call.wasTryingToJoin) { // incoming call has been accepted on other device or ended
            this.audioAsset.stop();
          } else if(call.wasTryingToJoin && !hasConnected) { // something has happened during the key exchanging
            this.audioAsset.play({name: 'failed'});
          } else {
            // `discardReason` is only set by hangUp, and a CLOSED transition can
            // arrive without it — a transport failure derives CLOSED straight
            // from the engine state. Dereferencing it unconditionally threw
            // there, and EventListenerBase swallows listener errors, so the
            // end-of-call sound was silently skipped instead of anything
            // visible breaking.
            this.audioAsset.play(call.discardReason?._ === 'phoneCallDiscardReasonBusy' ? {name: 'busy'} : {name: 'end'});
          }
        } else if(state === CALL_STATE.PENDING) {
          // Incoming during a group call or a live stream: audible, but under
          // the conversation.
          this.audioAsset.play({
            name: call.isOutgoing ? 'outgoing' : 'incoming',
            loop: true,
            volume: !call.isOutgoing && this.isOtherCallActive(call) ? CALL_WAITING_RING_VOLUME : 1
          });
        } else if(state === CALL_STATE.EXCHANGING_KEYS) {
          this.audioAsset.playIfDifferent({name: 'connect'});
        } else if(state === CALL_STATE.CONNECTING) {
          if(call.duration) {
            this.audioAsset.play({name: 'connect', loop: true});
          }
        } else {
          this.audioAsset.stop();
        }
      }
    });

    call.addEventListener('id', (id, prevId) => {
      if(prevId !== undefined) {
        this.instances.delete(prevId);
      }

      const hasCurrent = !!this.currentCall;
      this.instances.set(id, call);

      if(prevId === undefined) {
        this.dispatchEvent('instance', {instance: call, hasCurrent: hasCurrent});
      }
    });

    return call;
  }

  public async startCallInternal(userId: UserId, isVideo: boolean) {
    this.log('p2pStartCallInternal', userId, isVideo);

    const fullInfo = await this.managers.appProfileManager.getProfile(userId);
    if(!fullInfo) return;

    const {video_calls_available} = fullInfo.pFlags;

    const call = this.createCallInstance({
      isOutgoing: true,
      interlocutorUserId: userId
    });

    call.overrideConnectionState(CALL_STATE.REQUESTING);
    call.setPhoneCall({
      _: 'phoneCallWaiting',
      access_hash: '',
      admin_id: NULL_PEER_ID,
      date: tsNow(true),
      id: --this.tempId,
      participant_id: userId,
      protocol: call.protocol,
      pFlags: {
        video: isVideo || undefined
      }
    });

    try {
      const dh = await this.managers.appCallsManager.generateDh();
      if(call.isClosing) return;

      call.dh = dh;

      const phoneCall = await this.managers.appCallsManager.requestCall(
        userId,
        call.protocol,
        call.dh.g_a_hash,
        isVideo && video_calls_available
      );
      if(call.isClosing) {
        if(phoneCall._ !== 'phoneCallEmpty' && phoneCall._ !== 'phoneCallDiscarded') {
          // requestCall was accepted after a local close won the race. The
          // manager has already saved the exact echoed id/access_hash, so
          // discard it before the global transition may release.
          await this.managers.appCallsManager.discardCall(
            phoneCall.id,
            0,
            {_: 'phoneCallDiscardReasonHangup'},
            isVideo && video_calls_available
          );
        }
        return;
      }

      call.overrideConnectionState(CALL_STATE.PENDING);
      call.setPhoneCall(phoneCall);
      call.setHangUpTimeout(CALL_REQUEST_TIMEOUT, 'phoneCallDiscardReasonHangup');
    } catch(err) {
      this.log.error('outgoing call DH/setup error', err);
      if(!call.isClosing) {
        try {
          await call.hangUp('phoneCallDiscardReasonHangup');
        } catch(hangUpError) {
          this.log.error('outgoing call cleanup failed', hangUpError);
        }
      }
    }
  }

  // ===== 1-on-1 → conference migration =====
  //
  // Called when a 1-on-1 PhoneCall is discarded with the migrate reason. We
  // stop the P2P engine but DO NOT play the "call ended" tone, and we
  // carry over only media intent (mute/video). P2P duration and its emoji
  // fingerprint do not describe the new conference security context and must
  // not leak into it. The migration reason's
  // slug is then resolved to the canonical call and joined through the same
  // controller path as an invite link.
  //
  private migrateToConference(instance: CallInstance, slug: string): Promise<void> {
    return callTransitionCoordinator.run(() => this.migrateToConferenceInternal(instance, slug));
  }

  private async migrateToConferenceInternal(instance: CallInstance, slug: string): Promise<void> {
    this.log('migrateToConference', instance.id);
    const wasMuted = instance.isMuted;
    const wasVideo = instance.isSharingVideo;

    // Tear down the 1-on-1 without sending discard or playing audio. The
    // server already discarded the call; instance.hangUp with no reason
    // skips the API call but still walks the state machine to CLOSED.
    this.migratingCalls.add(instance);
    this.dispatchEvent('conferenceMigration', {instance, state: 'started'});
    let completed = false;
    try {
      await instance.hangUp(undefined, true);
      const resolved = await this.managers.appGroupCallsManager.resolveConferenceCall({
        _: 'inputGroupCallSlug',
        slug
      });
      if(resolved._ === 'groupCallDiscarded') {
        toastNew({langPackKey: 'InviteExpired'});
        return;
      }
      await groupCallsController.joinConference({
        input: {_: 'inputGroupCallSlug', slug},
        expectedCanonicalInput: groupCallToInput(resolved),
        selfUserId: BigInt(rootScope.myId),
        chatId: NULL_PEER_ID,
        muted: wasMuted,
        joinVideo: wasVideo
      });
      completed = true;
    } catch(err) {
      this.log.error('migrateToConference: conference join failed', err);
      toastNew({langPackKey: getConferenceInviteErrorLangKey(err)});
    } finally {
      this.dispatchEvent('conferenceMigration', {
        instance,
        state: completed ? 'completed' : 'failed'
      });
    }
  }
}

const callsController = new CallsController();
DEBUG && (MOUNT_CLASS_TO.callsController = callsController);
export default callsController;
