/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import IS_CALL_SUPPORTED from "../../environment/callSupport";
import indexOfAndSplice from "../../helpers/array/indexOfAndSplice";
import insertInDescendSortedArray from "../../helpers/array/insertInDescendSortedArray";
import AudioAssetPlayer from "../../helpers/audioAssetPlayer";
import bytesCmp from "../../helpers/bytes/bytesCmp";
import compareVersion from "../../helpers/compareVersion";
import safeReplaceObject from "../../helpers/object/safeReplaceObject";
import { nextRandomUint } from "../../helpers/random";
import tsNow from "../../helpers/tsNow";
import { InputPhoneCall, MessagesDhConfig, PhoneCall, PhoneCallDiscardReason, PhoneCallProtocol, PhonePhoneCall } from "../../layer";
import CallInstance from "../calls/callInstance";
import CALL_STATE from "../calls/callState";
import getCallProtocol from "../calls/p2P/getCallProtocol";
import { logger } from "../logger";
import apiManager from "../mtproto/mtprotoworker";
import { NULL_PEER_ID } from "../mtproto/mtproto_config";
import rootScope from "../rootScope";
import apiUpdatesManager from "./apiUpdatesManager";
import appProfileManager from "./appProfileManager";
import appUsersManager from "./appUsersManager";

export type CallId = PhoneCall['id'];

export type MyPhoneCall = Exclude<PhoneCall, PhoneCall.phoneCallEmpty | PhoneCall.phoneCallDiscarded>;

const CALL_REQUEST_TIMEOUT = 45e3;

export type CallAudioAssetName = "call_busy.mp3" | "call_connect.mp3" | "call_end.mp3" | "call_incoming.mp3" | "call_outgoing.mp3" | "voip_failed.mp3" | "voip_connecting.mp3";

export class AppCallsManager {
  private log: ReturnType<typeof logger>;
  private calls: Map<CallId, MyPhoneCall>;
  private instances: Map<CallId, CallInstance>;
  private sortedInstances: Array<CallInstance>;
  private tempId: number;
  private audioAsset: AudioAssetPlayer<CallAudioAssetName>;
  
  constructor() {
    this.log = logger('CALLS');
    
    this.tempId = 0;
    this.calls = new Map();
    this.instances = new Map();
    this.sortedInstances = [];

    if(!IS_CALL_SUPPORTED) {
      return;
    }
    
    rootScope.addMultipleEventsListeners({
      updatePhoneCall: async(update) => {
        const call = this.saveCall(update.phone_call);

        let instance = this.instances.get(call.id);
        
        switch(call._) {
          case 'phoneCallDiscarded': {
            if(instance) {
              instance.hangUp(call.reason?._, true);
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
            const g_a_hash = await apiManager.invokeCrypto('sha256', g_a);
            if(!bytesCmp(dh.g_a_hash, g_a_hash)) {
              this.log.error('Incorrect g_a_hash', dh.g_a_hash, g_a_hash);
              break;
            }

            const {key, key_fingerprint} = await this.computeKey(g_a, dh.b, dh.p);
            if(call.key_fingerprint !== key_fingerprint) {
              this.log.error('Incorrect key fingerprint', call.key_fingerprint, key_fingerprint);
              break;
            }

            instance.encryptionKey = key;
            instance.joinCall();

            break;
          }
        }
      },
      
      updatePhoneCallSignalingData: (update) => {
        const instance = this.instances.get(update.phone_call_id);
        if(instance?.id !== update.phone_call_id) {
          return;
        }
        
        instance.onUpdatePhoneCallSignalingData(update);
      }
    });

    this.audioAsset = new AudioAssetPlayer<CallAudioAssetName>([
      'call_busy.mp3',
      'call_connect.mp3',
      'call_end.mp3',
      'call_incoming.mp3',
      'call_outgoing.mp3',
      'voip_failed.mp3'
    ]);
  }

  public get currentCall() {
    return this.sortedInstances[0];
  }

  public getCallByUserId(userId: UserId) {
    for(const [callId, instance] of this.instances) {
      if(instance.interlocutorUserId === userId) {
        return instance;
      }
    }
  }

  public async computeKey(g_b: Uint8Array, a: Uint8Array, p: Uint8Array) {
    return apiManager.invokeCrypto('compute-dh-key', g_b, a, p);
  }
  
  public saveCall(call: PhoneCall) {
    const isDiscarded = call._ === 'phoneCallDiscarded';
    const oldCall = this.calls.get(call.id);
    if(oldCall) {
      // if(shouldUpdate) {
      safeReplaceObject(oldCall, call);
      // }

      if(isDiscarded) {
        this.calls.delete(call.id);
      }
      
      call = oldCall;
    } else if(!isDiscarded) {
      this.calls.set(call.id, call as any);
    }

    return call;
  }
  
  public getCall(callId: CallId) {
    return this.calls.get(callId);
  }
  
  public getCallInput(id: CallId): InputPhoneCall {
    const call = this.getCall(id);
    return {
      _: 'inputPhoneCall',
      id: call.id,
      access_hash: call.access_hash
    };
  }
  
  private createCallInstance(options: {
    isOutgoing: boolean,
    interlocutorUserId: UserId,
    protocol?: PhoneCallProtocol
  }) {
    const call = new CallInstance({
      appCallsManager: this,
      apiManager,
      apiUpdatesManager,
      ...options,
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
            this.audioAsset.playSound(call.discardReason === 'phoneCallDiscardReasonBusy' ? 'call_busy.mp3' : 'call_end.mp3');
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
        rootScope.dispatchEvent('call_instance', {instance: call, hasCurrent: hasCurrent});
      }
    });

    return call;
  }

  public savePhonePhoneCall(phonePhoneCall: PhonePhoneCall) {
    appUsersManager.saveApiUsers(phonePhoneCall.users);
    return this.saveCall(phonePhoneCall.phone_call);
  }

  public generateDh() {
    return apiManager.invokeApi('messages.getDhConfig', {
      version: 0,
      random_length: 256
    }).then(async(dhConfig) => {
      return apiManager.invokeCrypto('generate-dh', dhConfig as MessagesDhConfig.messagesDhConfig);
    });
  }
  
  public startCallInternal(userId: UserId, isVideo: boolean) {
    this.log('p2pStartCallInternal', userId, isVideo);
    
    const fullInfo = appProfileManager.getCachedFullUser(userId);
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
    this.generateDh().then(dh => {
      call.dh = dh;

      return apiManager.invokeApi('phone.requestCall', {
        user_id: appUsersManager.getUserInput(userId),
        protocol: call.protocol,
        video: isVideo && video_calls_available,
        random_id: nextRandomUint(32),
        g_a_hash: call.dh.g_a_hash
      });
    }).then(result => {
      const phoneCall = this.savePhonePhoneCall(result);
      call.overrideConnectionState(CALL_STATE.PENDING);
      call.setPhoneCall(phoneCall);
      call.setHangUpTimeout(CALL_REQUEST_TIMEOUT, 'phoneCallDiscardReasonHangup');
    });
  }

  private verifyProtocolCompatibility(protocol: PhoneCallProtocol) {
    const my = getCallProtocol();
    const myVersion = my.library_versions[0];
    return !protocol.library_versions.find(version => {
      return compareVersion(myVersion, version) > 0;
    });
  }

  public async discardCall(callId: CallId, duration: number, reason: PhoneCallDiscardReason['_'], video?: boolean) {
    if(!this.getCall(callId)) {
      return;
    }

    const updates = await apiManager.invokeApi('phone.discardCall', {
      video,
      peer: this.getCallInput(callId),
      duration,
      reason: {
        _: reason
      },
      connection_id: '0'
    });

    apiUpdatesManager.processUpdateMessage(updates);
  }
}

const appCallsManager = new AppCallsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appCallsManager = appCallsManager);
export default appCallsManager;
