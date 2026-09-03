import {getEnvironment} from '@environment/utils';
import safeReplaceObject from '@helpers/object/safeReplaceObject';
import {nextRandomUint} from '@helpers/random';
import {
  InputGroupCall,
  InputPhoneCall,
  MessagesDhConfig,
  PhoneCall,
  PhoneCallDiscardReason,
  PhoneCallProtocol,
  PhonePhoneCall,
  Updates
} from '@layer';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import appTabsManager from '@appManagers/appTabsManager';
import {AppManager} from '@appManagers/manager';

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
        this.log('signaling data', update.phone_call_id, update.data?.length);
        this.rootScope.dispatchEvent('call_signaling', {callId: update.phone_call_id, data: update.data});
      },

      // Conference call chain delivery — both new blocks and emoji broadcasts
      // flow through `updateGroupCallChainBlocks`. The `sub_chain_id`
      // distinguishes the main chain (blocks) from the broadcast channel.
      updateGroupCallChainBlocks: (update) => {
        if(update.call._ !== 'inputGroupCall') return;
        this.log('chain blocks', update.call.id, {subChainId: update.sub_chain_id, blocks: update.blocks?.length, nextOffset: update.next_offset});
        this.rootScope.dispatchEvent('group_call_chain_blocks', {
          callId: update.call.id,
          subChainId: update.sub_chain_id,
          blocks: update.blocks,
          nextOffset: update.next_offset
        });
      }
    });
  }

  public computeKey(g_b: Uint8Array, a: Uint8Array, p: Uint8Array) {
    this.log('computeKey (DH)');
    return this.cryptoWorker.invokeCrypto('compute-dh-key', g_b, a, p);
  }

  public saveCall(call: PhoneCall) {
    const isDiscarded = call._ === 'phoneCallDiscarded';
    this.log('saveCall', call.id, call._, isDiscarded ? (call as PhoneCall.phoneCallDiscarded).reason?._ : undefined);
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

    // A ringing request must reach exactly one tab (one popup, one ringtone):
    // the least idle tab of this account. Every later state of the call goes
    // to ALL tabs of the account, like call_signaling — only the tab that owns
    // the CallInstance acts on it, the rest ignore an unknown call id. Routing
    // those by idle time as well lost phoneCallDiscarded / phoneCall whenever
    // the user focused another tab mid-call: the ringing tab rang out the full
    // timeout, the key exchange never completed.
    if(call._ !== 'phoneCallRequested') {
      this.rootScope.dispatchEvent('call_update', call);
      return call;
    }

    const tabs = appTabsManager.getTabs();
    tabs.sort((a, b) => a.state.idleStartTime - b.state.idleStartTime);
    const tab = tabs.find((tab) => tab.state.accountNumber === this.getAccountNumber());
    const anyTab = tabs[0];

    if(tab) {
      MTProtoMessagePort.getInstance<false>().invokeVoid('event', {
        name: 'call_update',
        args: [call],
        accountNumber: this.getAccountNumber()
      }, tab.source);
    } else if(anyTab) {
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

  /**
   * A request/accept RPC has already changed server state before its returned
   * peers and call are saved locally. If that local processing throws, close
   * the exact call echoed by the RPC so it cannot survive as an unreachable
   * server-side P2P call.
   */
  private async saveAcceptedPhonePhoneCall(
    phonePhoneCall: PhonePhoneCall,
    video?: boolean
  ): Promise<PhoneCall> {
    try {
      return this.savePhonePhoneCall(phonePhoneCall);
    } catch(error) {
      const call = phonePhoneCall.phone_call;
      if(call._ !== 'phoneCallEmpty' && call._ !== 'phoneCallDiscarded') {
        try {
          await this.discardCallInput(
            {_: 'inputPhoneCall', id: call.id, access_hash: call.access_hash},
            0,
            {_: 'phoneCallDiscardReasonHangup'},
            video
          );
        } catch(rollbackError) {
          this.log.warn('accepted P2P call rollback failed', rollbackError);
        }
      }
      throw error;
    }
  }

  public generateDh() {
    this.log('generateDh');
    return this.apiManager.invokeApi('messages.getDhConfig', {
      version: 0,
      random_length: 256
    }).then((dhConfig) => {
      return this.cryptoWorker.invokeCrypto('generate-dh', dhConfig as MessagesDhConfig.messagesDhConfig);
    });
  }

  public sendSignalingData(callId: CallId, data: Uint8Array) {
    this.log('sendSignalingData', callId, {bytes: data.length});
    return this.apiManager.invokeApi('phone.sendSignalingData', {
      peer: this.getCallInput(callId),
      data
    });
  }

  // Acknowledges an incoming request: until a device sends this the caller
  // sees "waiting", not "ringing". tdesktop sends it before it rings
  // (calls_call.cpp startIncoming), tdlib right on phoneCallRequested.
  public receivedCall(callId: CallId) {
    this.log('receivedCall', callId);
    return this.apiManager.invokeApi('phone.receivedCall', {
      peer: this.getCallInput(callId)
    });
  }

  public async requestCall(userId: UserId, protocol: PhoneCallProtocol, g_a_hash: Uint8Array, video?: boolean) {
    this.log('requestCall', userId, {video});
    const phonePhoneCall = await this.apiManager.invokeApi('phone.requestCall', {
      user_id: this.appUsersManager.getUserInput(userId),
      protocol: protocol,
      video: video,
      random_id: nextRandomUint(32),
      g_a_hash: g_a_hash
    });

    return this.saveAcceptedPhonePhoneCall(phonePhoneCall, video);
  }

  public async acceptCall(callId: CallId, protocol: PhoneCallProtocol, g_b: Uint8Array, video?: boolean) {
    this.log('acceptCall', callId);
    const phonePhoneCall = await this.apiManager.invokeApi('phone.acceptCall', {
      peer: this.getCallInput(callId),
      protocol,
      g_b
    });

    return this.saveAcceptedPhonePhoneCall(phonePhoneCall, video);
  }

  public async confirmCall(
    callId: CallId,
    protocol: PhoneCallProtocol,
    g_a: Uint8Array,
    keyFingerprint: string,
    video?: boolean
  ) {
    this.log('confirmCall', callId);
    const phonePhoneCall = await this.apiManager.invokeApi('phone.confirmCall', {
      peer: this.getCallInput(callId),
      protocol,
      g_a,
      key_fingerprint: keyFingerprint
    });

    return this.saveAcceptedPhonePhoneCall(phonePhoneCall, video);
  }

  public async discardCall(
    callId: CallId,
    duration: number,
    reason: PhoneCallDiscardReason,
    video?: boolean
  ) {
    this.log('discardCall', callId, {duration, reason: reason?._, video});
    if(!this.getCall(callId)) {
      this.log.warn('discardCall: unknown call', callId);
      return;
    }

    return this.discardCallInput(this.getCallInput(callId), duration, reason, video);
  }

  private async discardCallInput(
    peer: InputPhoneCall,
    duration: number,
    reason: PhoneCallDiscardReason,
    video?: boolean
  ): Promise<void> {
    const updates = await this.apiManager.invokeApi('phone.discardCall', {
      video,
      peer,
      duration,
      reason,
      connection_id: '0'
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }

  // ===== TdE2E conference call MTProto methods =====
  //
  // Thin wrappers over the phone.* conference methods. They live here (vs. a
  // dedicated ConferenceCallsManager) because the wire is shared with the
  // 1-on-1 layer — the SAME `phone.discardCall` with `phoneCallDiscardReasonMigrateConferenceCall`
  // is the migration trigger, and conference state piggy-backs on existing
  // `updatePhoneCall` flows.

  // Invite a user to a conference. Returns Updates which include the user-side
  // `updatePhoneCallRequested` for the invitee.
  public async inviteConferenceCallParticipant(
    call: InputGroupCall,
    userId: UserId,
    video?: boolean
  ): Promise<Updates> {
    this.log('inviteConferenceCallParticipant', 'id' in call ? call.id : call._, userId, {video});
    const updates = await this.apiManager.invokeApi('phone.inviteConferenceCallParticipant', {
      video,
      call,
      user_id: this.appUsersManager.getUserInput(userId)
    });
    try {
      this.apiUpdatesManager.processUpdateMessage(updates);
    } catch(error) {
      this.log.error('invite conference participant update processing failed after RPC acceptance', error);
    }
    return updates;
  }

  // Decline an invitation we received. msgId is the service message id that
  // carried the invite.
  public async declineConferenceCallInvite(msgId: number): Promise<Updates> {
    this.log('declineConferenceCallInvite', msgId);
    const updates = await this.apiManager.invokeApi('phone.declineConferenceCallInvite', {
      msg_id: msgId
    });
    try {
      this.apiUpdatesManager.processUpdateMessage(updates);
    } catch(error) {
      this.log.error('decline conference invite update processing failed after RPC acceptance', error);
    }
    return updates;
  }

  // Remove participants from a conference. `block` is a LOCAL-format change-
  // state block (built by the worker via `buildRemoveParticipantsBlock`) — like
  // every other client→server `block` field, e.g. `phone.joinGroupCall`; only
  // chain deliveries coming BACK from the server use the +1 server magic.
  //
  // The block must both drop the participants named in `ids` AND carry the
  // rotated shared key for the survivors (buildChangesForNewState emits the
  // setGroupState + setSharedKey pair together) — removing without rekeying
  // would leave the removed identity's copy of the current key valid.
  // `onlyLeft` is the stale-pruning form used by the roster reconciliation;
  // `kick` is an admin removing someone still connected.
  public async deleteConferenceCallParticipants(opts: {
    call: InputGroupCall;
    ids: Array<string | number>;
    block: Uint8Array;
    onlyLeft?: boolean;
    kick?: boolean;
  }): Promise<Updates> {
    this.log('deleteConferenceCallParticipants', 'id' in opts.call ? opts.call.id : opts.call._, {ids: opts.ids, kick: opts.kick, onlyLeft: opts.onlyLeft});
    const updates = await this.apiManager.invokeApi('phone.deleteConferenceCallParticipants', {
      only_left: opts.onlyLeft,
      kick: opts.kick,
      call: opts.call,
      ids: opts.ids,
      block: opts.block
    });
    try {
      this.apiUpdatesManager.processUpdateMessage(updates);
    } catch(error) {
      this.log.error('delete conference participants update processing failed after RPC acceptance', error);
    }
    return updates;
  }

  // Broadcast a serialized GroupBroadcast (emoji commit/reveal) to every
  // participant. The server echoes back via `updateGroupCallChainBlocks`.
  public async sendConferenceCallBroadcast(
    call: InputGroupCall,
    block: Uint8Array
  ): Promise<Updates> {
    this.log('sendConferenceCallBroadcast', 'id' in call ? call.id : call._, {bytes: block?.length});
    const updates = await this.apiManager.invokeApi('phone.sendConferenceCallBroadcast', {
      call,
      block
    });
    try {
      this.apiUpdatesManager.processUpdateMessage(updates);
    } catch(error) {
      this.log.error('send conference broadcast update processing failed after RPC acceptance', error);
    }
    return updates;
  }

  // Fetch a window of historical blocks from the conference chain — used on
  // late join (after a reconnect) or when a block update is missed.
  public getGroupCallChainBlocks(
    call: InputGroupCall,
    subChainId: number,
    offset: number,
    limit: number
  ) {
    this.log('getGroupCallChainBlocks', 'id' in call ? call.id : call._, {subChainId, offset, limit});
    return this.apiManager.invokeApi('phone.getGroupCallChainBlocks', {
      call,
      sub_chain_id: subChainId,
      offset,
      limit
    });
  }
}
