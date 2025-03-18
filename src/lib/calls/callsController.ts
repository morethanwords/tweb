/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getCallAudioAsset, {CallAudioAssetName} from '../../components/call/getAudioAsset';
import {MOUNT_CLASS_TO} from '../../config/debug';
import IS_CALL_SUPPORTED from '../../environment/callSupport';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import insertInDescendSortedArray from '../../helpers/array/insertInDescendSortedArray';
import AudioAssetPlayer from '../../helpers/audioAssetPlayer';
import bytesCmp from '../../helpers/bytes/bytesCmp';
import EventListenerBase from '../../helpers/eventListenerBase';
import tsNow from '../../helpers/tsNow';
import {PhoneCallProtocol} from '../../layer';
import {CallId} from '../appManagers/appCallsManager';
import {AppManagers} from '../appManagers/managers';
import {logger} from '../logger';
import apiManagerProxy from '../mtproto/mtprotoworker';
import {NULL_PEER_ID} from '../mtproto/mtproto_config';
import rootScope from '../rootScope';
import CallInstance from './callInstance';
import CALL_STATE from './callState';

const CALL_REQUEST_TIMEOUT = 45e3;

export class CallsController extends EventListenerBase<{
  instance: (details: {hasCurrent: boolean, instance: CallInstance}) => void,
  accepting: (instance: CallInstance) => void, // это костыль. используется при параллельном вызове, чтобы заменить звонок в topbarCall
  incompatible: (userId: UserId) => void,
}> {
  private log: ReturnType<typeof logger>;
  private managers: AppManagers;
  private audioAsset: AudioAssetPlayer<CallAudioAssetName>;
  private instances: Map<CallId, CallInstance>;
  private sortedInstances: Array<CallInstance>;
  private tempId: number;

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

    rootScope.addEventListener('call_update', async(call) => {
      let instance = this.instances.get(call.id);

      if(instance) {
        instance.setPhoneCall(call);
      }

      switch(call._) {
        case 'phoneCallDiscarded': {
          if(instance) {
            instance.hangUp(call.reason, true);
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

            instance.confirmCall();
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
          if(!instance || instance.encryptionKey) {
            break;
          }

          const g_a = instance.dh.g_a = call.g_a_or_b;
          const dh = instance.dh;
          const g_a_hash = await apiManagerProxy.invokeCrypto('sha256', g_a);
          if(!bytesCmp(dh.g_a_hash, g_a_hash)) {
            this.log.error('Incorrect g_a_hash', dh.g_a_hash, g_a_hash);
            break;
          }

          const {key, key_fingerprint} = await this.managers.appCallsManager.computeKey(g_a, dh.b, dh.p);
          if(call.key_fingerprint !== key_fingerprint) {
            this.log.error('Incorrect key fingerprint', call.key_fingerprint, key_fingerprint, g_a, dh);
            instance.hangUp('phoneCallDiscardReasonDisconnect');
            break;
          }

          instance.encryptionKey = key;
          instance.joinCall();

          break;
        }
      }
    });

    rootScope.addEventListener('call_signaling', ({callId, data}) => {
      const instance = this.instances.get(callId);
      if(instance?.id !== callId) {
        return;
      }

      instance.onUpdatePhoneCallSignalingData(data);
    });
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
          if(!call.isOutgoing && !call.wasTryingToJoin) { // incoming call has been accepted on other device or ended
            this.audioAsset.stopSound();
          } else if(call.wasTryingToJoin && !hasConnected) { // something has happened during the key exchanging
            this.audioAsset.playSound('voip_failed.mp3');
          } else {
            this.audioAsset.playSound(call.discardReason._ === 'phoneCallDiscardReasonBusy' ? 'call_busy.mp3' : 'call_end.mp3');
          }
        } else if(state === CALL_STATE.PENDING) {
          this.audioAsset.playSound(call.isOutgoing ? 'call_outgoing.mp3' : 'call_incoming.mp3', true);
        } else if(state === CALL_STATE.EXCHANGING_KEYS) {
          this.audioAsset.playSoundIfDifferent('call_connect.mp3');
        } else if(state === CALL_STATE.CONNECTING) {
          if(call.duration) {
            this.audioAsset.playSound('voip_connecting.mp3', true);
          }
        } else {
          this.audioAsset.stopSound();
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

    call.requestInputSource(true, !!(isVideo && video_calls_available), false);

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

    // return;
    this.managers.appCallsManager.generateDh().then(async(dh) => {
      call.dh = dh;

      return this.managers.appCallsManager.requestCall(userId, call.protocol, call.dh.g_a_hash, isVideo && video_calls_available);
    }).then((phoneCall) => {
      call.overrideConnectionState(CALL_STATE.PENDING);
      call.setPhoneCall(phoneCall);
      call.setHangUpTimeout(CALL_REQUEST_TIMEOUT, 'phoneCallDiscardReasonHangup');
    });
  }
}

const callsController = new CallsController();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.callsController = callsController);
export default callsController;
