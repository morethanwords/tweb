import getCallAudioAsset from '@components/call/getAudioAsset';
import {MOUNT_CLASS_TO} from '@config/debug';
import IS_CALL_SUPPORTED from '@environment/callSupport';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import insertInDescendSortedArray from '@helpers/array/insertInDescendSortedArray';
import AudioAssetPlayer from '@helpers/audioAssetPlayer';
import bytesCmpConstTime from '@helpers/bytes/bytesCmpConstTime';
import EventListenerBase from '@helpers/eventListenerBase';
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
import IS_CONFERENCE_CALL_SUPPORTED from '@environment/conferenceCallSupport';
import groupCallsController from '@lib/calls/groupCallsController';
import {toastNew} from '@components/toast';
import getConferenceInviteErrorLangKey from '@lib/calls/conferenceInviteError';
import callTransitionCoordinator from '@lib/calls/callTransitionCoordinator';
import {groupCallToInput} from '@lib/calls/helpers/groupCallUpdates';
import {CALL_REQUEST_TIMEOUT} from '@lib/calls/constants';

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
    let instance = this.instances.get(call.id);

    if(instance?.isClosing && call._ !== 'phoneCallDiscarded') {
      // A request/accept/confirm response can be delivered through the
      // update channel before the manager proxy resolves to its caller-side
      // post-await guard. Never let that early delivery revive crypto/media
      // work for an instance whose close transaction already started.
      return;
    }

    if(instance) {
      instance.setPhoneCall(call);
    }

    switch(call._) {
      case 'phoneCallDiscarded': {
        if(instance) {
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
        if(instance) {
          /* if(!this.verifyProtocolCompatibility(call.protocol)) {
            instance.hangUp('phoneCallDiscardReasonDisconnect');
            rootScope.dispatchEvent('call_incompatible', instance.interlocutorUserId);
            break;
          } */

          await instance.confirmCall();
        }

        break;
      }

      case 'phoneCallRequested': {
        if(!instance) {
          /* if(!this.verifyProtocolCompatibility(call.protocol)) {
            rootScope.dispatchEvent('call_incompatible', call.admin_id);
            break;
          } */

          instance = this.createCallInstance({
            isOutgoing: false,
            interlocutorUserId: call.admin_id
          });

          instance.overrideConnectionState(CALL_STATE.PENDING);
          instance.setPhoneCall(call);
          instance.setHangUpTimeout(CALL_REQUEST_TIMEOUT, 'phoneCallDiscardReasonMissed');
        }

        break;
      }

      case 'phoneCall': {
        // `dh.g_a` is what getEmojisFingerprint hashes into the emoji SAS — the only
        // human-verifiable MITM defence of the call — so a server-relayed value must
        // never land there before it is checked against the commitment, and a failed
        // check has to be fatal instead of leaving a poisoned value behind.
        // `dh.g_a` being set already means there is nothing to accept (the caller
        // generated its own), and the in-flight flag closes the window that the two
        // awaits below open for a second, forged update.
        if(!instance || instance.encryptionKey || instance.dh?.g_a || instance.isVerifyingPeerG_a) {
          break;
        }

        instance.isVerifyingPeerG_a = true;

        const dh = instance.dh;
        const g_a = call.g_a_or_b;
        const g_a_hash = await apiManagerProxy.invokeCrypto('sha256', g_a);
        if(instance.isClosing) break;
        if(!bytesCmpConstTime(dh.g_a_hash, g_a_hash)) {
          this.log.error('Incorrect g_a_hash', dh.g_a_hash, g_a_hash);
          await instance.hangUp('phoneCallDiscardReasonDisconnect');
          break;
        }

        let key: Uint8Array, key_fingerprint: string;
        try {
          ({key, key_fingerprint} = await this.managers.appCallsManager.computeKey(g_a, dh.b, dh.p));
        } catch(err) {
          this.log.error('computeKey failed (invalid DH public value)', err, g_a, dh);
          await instance.hangUp('phoneCallDiscardReasonDisconnect');
          break;
        }
        if(instance.isClosing) break;
        // The server's long arrives as a JS number whenever it fits 53 bits
        // (fetchLong), the local one is always a decimal string — a strict
        // compare dropped one correct incoming call in a thousand.
        if(String(call.key_fingerprint) !== key_fingerprint) {
          this.log.error('Incorrect key fingerprint', call.key_fingerprint, key_fingerprint, g_a, dh);
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
          this.audioAsset.play({name: call.isOutgoing ? 'outgoing' : 'incoming', loop: true});
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
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.callsController = callsController);
export default callsController;
