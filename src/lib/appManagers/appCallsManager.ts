/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {getEnvironment} from '../../environment/utils';
import safeReplaceObject from '../../helpers/object/safeReplaceObject';
import {nextRandomUint} from '../../helpers/random';
import {InputPhoneCall, MessagesDhConfig, PhoneCall, PhoneCallDiscardReason, PhoneCallProtocol, PhonePhoneCall} from '../../layer';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';
import appTabsManager from './appTabsManager';
import {AppManager} from './manager';

export type CallId = PhoneCall['id'];

export type MyPhoneCall = Exclude<PhoneCall, PhoneCall.phoneCallEmpty | PhoneCall.phoneCallDiscarded>;

export class AppCallsManager extends AppManager {
  private calls: Map<CallId, MyPhoneCall>;

  protected after() {
    this.calls = new Map();

    if(!getEnvironment().IS_CALL_SUPPORTED) {
      return;
    }

    this.apiUpdatesManager.addMultipleEventsListeners({
      updatePhoneCall: (update) => {
        this.saveCall(update.phone_call);
      },

      updatePhoneCallSignalingData: (update) => {
        this.rootScope.dispatchEvent('call_signaling', {callId: update.phone_call_id, data: update.data});
      }
    });
  }

  public computeKey(g_b: Uint8Array, a: Uint8Array, p: Uint8Array) {
    return this.cryptoWorker.invokeCrypto('compute-dh-key', g_b, a, p);
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

    const tabs = appTabsManager.getTabs();
    tabs.sort((a, b) => a.state.idleStartTime - b.state.idleStartTime);
    const tab = tabs.find((tab) => tab.state.accountNumber === this.getAccountNumber());
    const anyTab = tabs[0];
    // this.rootScope.dispatchEvent('call_update', call);

    if(tab) {
      MTProtoMessagePort.getInstance<false>().invokeVoid('event', {
        name: 'call_update',
        args: [call],
        accountNumber: this.getAccountNumber()
      }, tab.source);
    } else if(anyTab && call._ !== 'phoneCallEmpty' && call._ !== 'phoneCallDiscarded') {
      MTProtoMessagePort.getInstance<false>().invokeVoid('callNotification', {
        callerId: call.admin_id,
        callId: call.id,
        accountNumber: this.getAccountNumber()
      });
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

  public savePhonePhoneCall(phonePhoneCall: PhonePhoneCall) {
    this.appUsersManager.saveApiUsers(phonePhoneCall.users);
    return this.saveCall(phonePhoneCall.phone_call);
  }

  public generateDh() {
    return this.apiManager.invokeApi('messages.getDhConfig', {
      version: 0,
      random_length: 256
    }).then((dhConfig) => {
      return this.cryptoWorker.invokeCrypto('generate-dh', dhConfig as MessagesDhConfig.messagesDhConfig);
    });
  }

  // private verifyProtocolCompatibility(protocol: PhoneCallProtocol) {
  //   const my = getCallProtocol();
  //   const myVersion = my.library_versions[0];
  //   return !protocol.library_versions.find((version) => {
  //     return compareVersion(myVersion, version) > 0;
  //   });
  // }

  public async requestCall(userId: UserId, protocol: PhoneCallProtocol, g_a_hash: Uint8Array, video?: boolean) {
    const phonePhoneCall = await this.apiManager.invokeApi('phone.requestCall', {
      user_id: this.appUsersManager.getUserInput(userId),
      protocol: protocol,
      video: video,
      random_id: nextRandomUint(32),
      g_a_hash: g_a_hash
    });

    return this.savePhonePhoneCall(phonePhoneCall);
  }

  public async discardCall(
    callId: CallId,
    duration: number,
    reason: PhoneCallDiscardReason,
    video?: boolean
  ) {
    if(!this.getCall(callId)) {
      return;
    }

    const updates = await this.apiManager.invokeApi('phone.discardCall', {
      video,
      peer: this.getCallInput(callId),
      duration,
      reason,
      connection_id: '0'
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }
}
