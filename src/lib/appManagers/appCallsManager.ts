import {getEnvironment} from '@environment/utils';
import safeReplaceObject from '@helpers/object/safeReplaceObject';
import {nextRandomUint} from '@helpers/random';
import {
  DataJSON,
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
    this.log('generateDh');
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
    this.log('requestCall', userId, {video});
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
    this.log('discardCall', callId, {duration, reason: reason?._, video});
    if(!this.getCall(callId)) {
      this.log.warn('discardCall: unknown call', callId);
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

  // ===== TdE2E conference call MTProto methods =====
  //
  // Thin wrappers over the phone.* conference methods. They live here (vs. a
  // dedicated ConferenceCallsManager) because the wire is shared with the
  // 1-on-1 layer — the SAME `phone.discardCall` with `phoneCallDiscardReasonMigrateConferenceCall`
  // is the migration trigger, and conference state piggy-backs on existing
  // `updatePhoneCall` flows.

  // Create an EMPTY conference call (flags=0, no e2e fields). Returns Updates
  // containing the new `updateGroupCall`. Used as step 1 of the
  // create-then-join flow (matches tdesktop's `MakeConferenceCall` +
  // iOS's `_internal_createConferenceCall`).
  public createEmptyConferenceCall(): Promise<Updates> {
    this.log('createEmptyConferenceCall');
    return this.apiManager.invokeApi('phone.createConferenceCall', {
      random_id: nextRandomUint(32)
    });
  }

  // Single-call create+join variant (flags=join|public_key|block|params).
  // Used by tdesktop's `GroupCall::startConference` ONLY for migration from
  // an existing 1-on-1 / scheduled call. Server returns `CONF_WRITE_CHAIN_INVALID`
  // when called outside that context — use `createEmptyConferenceCall` +
  // `joinGroupCall` for fresh conferences instead.
  public async createAndJoinConferenceCall(opts: {
    publicKey: Uint8Array;
    block: Uint8Array;
    params: DataJSON;
    muted?: boolean;
    videoStopped?: boolean;
  }): Promise<Updates> {
    this.log('createAndJoinConferenceCall', {muted: opts.muted, videoStopped: opts.videoStopped});
    return this.apiManager.invokeApi('phone.createConferenceCall', {
      muted: opts.muted,
      video_stopped: opts.videoStopped,
      join: true,
      random_id: nextRandomUint(32),
      public_key: opts.publicKey,
      block: opts.block,
      params: opts.params
    });
  }

  // Invite a user to a conference. Returns Updates which include the user-side
  // `updatePhoneCallRequested` for the invitee.
  public async inviteConferenceCallParticipant(
    call: InputGroupCall,
    userId: UserId,
    video?: boolean
  ): Promise<Updates> {
    this.log('inviteConferenceCallParticipant', 'id' in call ? call.id : call._, userId, {video});
    return this.apiManager.invokeApi('phone.inviteConferenceCallParticipant', {
      video,
      call,
      user_id: this.appUsersManager.getUserInput(userId)
    });
  }

  // Decline an invitation we received. msgId is the service message id that
  // carried the invite.
  public declineConferenceCallInvite(msgId: number): Promise<Updates> {
    this.log('declineConferenceCallInvite', msgId);
    return this.apiManager.invokeApi('phone.declineConferenceCallInvite', {
      msg_id: msgId
    });
  }

  // Remove participants from a conference. `block` is a server-format change-
  // state block (built by the caller via `E2eCall.buildChangeStateBlock`).
  public deleteConferenceCallParticipants(opts: {
    call: InputGroupCall;
    ids: Array<string | number>;
    block: Uint8Array;
    onlyLeft?: boolean;
    kick?: boolean;
  }): Promise<Updates> {
    this.log('deleteConferenceCallParticipants', 'id' in opts.call ? opts.call.id : opts.call._, {ids: opts.ids, kick: opts.kick, onlyLeft: opts.onlyLeft});
    return this.apiManager.invokeApi('phone.deleteConferenceCallParticipants', {
      only_left: opts.onlyLeft,
      kick: opts.kick,
      call: opts.call,
      ids: opts.ids,
      block: opts.block
    });
  }

  // Broadcast a serialized GroupBroadcast (emoji commit/reveal) to every
  // participant. The server echoes back via `updateGroupCallChainBlocks`.
  public sendConferenceCallBroadcast(
    call: InputGroupCall,
    block: Uint8Array
  ): Promise<Updates> {
    this.log('sendConferenceCallBroadcast', 'id' in call ? call.id : call._, {bytes: block?.length});
    return this.apiManager.invokeApi('phone.sendConferenceCallBroadcast', {
      call,
      block
    });
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
