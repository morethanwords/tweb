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

import type GroupCallConnectionInstance from '../calls/groupCallConnectionInstance';
import safeReplaceObject from '../../helpers/object/safeReplaceObject';
import {nextRandomUint} from '../../helpers/random';
import {DataJSON, GroupCall, GroupCallParticipant, GroupCallParticipantVideoSourceGroup, GroupCallStreamChannel, InputFileLocation, InputGroupCall, PhoneJoinGroupCall, PhoneJoinGroupCallPresentation, Update, Updates} from '../../layer';
import {logger} from '../logger';
import {NULL_PEER_ID} from '../mtproto/mtproto_config';
import {AppManager} from './manager';
import getPeerId from './utils/peers/getPeerId';
import {DcId} from '../../types';
import assumeType from '../../helpers/assumeType';
import {parseVideoStreamInfo} from '../calls/videoStreamInfo';

export type GroupCallId = GroupCall['id'];
export type MyGroupCall = GroupCall | InputGroupCall;

export type GroupCallConnectionType = 'main' | 'presentation';

export type JoinGroupCallJsonPayload = {
  fingerprints: {
    fingerprint: string;
    setup: string;
    hash: string;
  }[];
  pwd: string;
  ssrc: number;
  'ssrc-groups': GroupCallParticipantVideoSourceGroup.groupCallParticipantVideoSourceGroup[];
  ufrag: string;
};

const GET_PARTICIPANTS_LIMIT = 100;

export type GroupCallOutputSource = 'main' | 'presentation' | number;

export interface GroupCallRtmpState {
  channels: GroupCallStreamChannel[];
  dcId: DcId;
  time: number;
}

export interface CallRecordParams {
  name: string;
  recordVideo: boolean;
  videoHorizontal: boolean;
}

export class AppGroupCallsManager extends AppManager {
  private log: ReturnType<typeof logger>;

  private groupCalls: Map<GroupCallId, MyGroupCall>;
  private participants: Map<GroupCallId, Map<PeerId, GroupCallParticipant>>;
  private nextOffsets: Map<GroupCallId, string>;

  private cachedStreamChannels: Map<GroupCallId, Promise<GroupCallRtmpState>>;

  // private doNotDispatchParticipantUpdate: PeerId;

  protected after() {
    this.log = logger('GROUP-CALLS');

    this.groupCalls = new Map();
    this.participants = new Map();
    this.nextOffsets = new Map();

    this.cachedStreamChannels = new Map();

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateGroupCall: (update) => {
        this.saveGroupCall(update.call, update.chat_id);
      },

      updateGroupCallParticipants: (update) => {
        this.saveGroupCall(update.call);

        // this.getGroupCallFull(update.call.id, true); // ! WARNING TEMP

        const groupCallId = update.call.id;
        this.saveApiParticipants(groupCallId, update.participants);
      }
    });

    this.rootScope.addEventListener('group_call_update', (groupCall) => {
      if(groupCall._ === 'groupCallDiscarded') {
        this.participants.delete(groupCall.id);
      }
    });
  }

  public getCachedParticipants(groupCallId: GroupCallId) {
    let participants = this.participants.get(groupCallId);
    if(!participants) {
      this.participants.set(groupCallId, participants = new Map());
    }

    return participants;
  }

  private prepareToSavingNextOffset(groupCallId: GroupCallId) {
    const nextOffsetsMap = this.nextOffsets;

    const setNextOffset = (newNextOffset: string) => {
      if(nextOffsetsMap.get(groupCallId) === nextOffset) {
        nextOffsetsMap.set(groupCallId, newNextOffset);
      }
    };

    const nextOffset = nextOffsetsMap.get(groupCallId);
    return {
      nextOffset,
      setNextOffset
    };
  }

  public saveApiParticipant(groupCallId: GroupCallId, participant: GroupCallParticipant, skipCounterUpdating?: boolean) {
    const participants = this.getCachedParticipants(groupCallId);

    const peerId = getPeerId(participant.peer);

    const oldParticipant = participants.get(peerId);
    const hasLeft = participant.pFlags.left;
    if(!oldParticipant && hasLeft) {
      return;
    }

    // * fix missing flag
    if(!participant.pFlags.muted && !participant.pFlags.can_self_unmute) {
      participant.pFlags.can_self_unmute = true;
    }

    if(oldParticipant) {
      safeReplaceObject(oldParticipant, participant);
      participant = oldParticipant;
    } else {
      participants.set(peerId, participant);
    }

    // if(!skipCounterUpdating) {
    const groupCall = this.getGroupCall(groupCallId);
    if(groupCall?._ === 'groupCall') {
      let modified = false;
      if(hasLeft) {
        --groupCall.participants_count;
        modified = true;
      } else if(participant.pFlags.just_joined && !oldParticipant && !participant.pFlags.self) {
        ++groupCall.participants_count;
        modified = true;
      }

      if(modified) {
        this.rootScope.dispatchEvent('group_call_update', groupCall);
      }
    }
    // }

    if(hasLeft) {
      participants.delete(peerId);
    }

    if(oldParticipant || true/*  && this.doNotDispatchParticipantUpdate !== peerId */) {
      this.rootScope.dispatchEvent('group_call_participant', {
        groupCallId,
        participant
      });
    }
  }

  public saveApiParticipants(groupCallId: GroupCallId, apiParticipants: GroupCallParticipant[], skipCounterUpdating?: boolean) {
    if((apiParticipants as any).saved) return;
    (apiParticipants as any).saved = true;
    apiParticipants.forEach((p) => this.saveApiParticipant(groupCallId, p, skipCounterUpdating));
  }

  public async editParticipant(groupCallId: GroupCallId, participant: GroupCallParticipant, options: Partial<{
    muted: boolean,
    volume: number,
    raiseHand: boolean,
    videoStopped: boolean,
    videoPaused: boolean,
    presentationPaused: boolean
  }>) {
    this.saveApiParticipant(groupCallId, participant);

    const peerId = participant.pFlags.self ? NULL_PEER_ID : getPeerId(participant.peer);
    const updates = await this.apiManager.invokeApiSingle('phone.editGroupCallParticipant', {
      call: this.getGroupCallInput(groupCallId),
      participant: peerId === NULL_PEER_ID ? this.appPeersManager.getInputPeerSelf() : this.appPeersManager.getInputPeerById(peerId),
      muted: options.muted,
      volume: options.volume,
      raise_hand: options.raiseHand,
      video_paused: options.videoPaused,
      video_stopped: options.videoStopped,
      presentation_paused: options.presentationPaused
    });

    // do not replace with peerId because it can be null
    // if(!processUpdate) this.doNotDispatchParticipantUpdate = getPeerId(participant.peer);
    this.apiUpdatesManager.processUpdateMessage(updates);
    // if(!processUpdate) this.doNotDispatchParticipantUpdate = undefined;
  }

  public getGroupCall(id: GroupCallId) {
    return this.groupCalls.get(id);
  }

  public async getGroupCallFull(id: GroupCallId, override?: boolean): Promise<GroupCall> {
    const call = this.getGroupCall(id);
    if(call && call._ !== 'inputGroupCall' && !override) {
      return call;
    }

    const limit = this.getCachedParticipants(id).size ? 0 : GET_PARTICIPANTS_LIMIT;
    return this.apiManager.invokeApiSingleProcess({
      method: 'phone.getGroupCall',
      params: {
        call: this.getGroupCallInput(id),
        limit
      },
      processResult: (groupCall) => {
        // ? maybe I should save group call after participants so I can avoid passing the 'skipCounterUpdating' flag ?
        this.appUsersManager.saveApiUsers(groupCall.users);
        this.appChatsManager.saveApiChats(groupCall.chats);
        this.saveApiParticipants(id, groupCall.participants, true);
        const call = this.saveGroupCall(groupCall.call) as GroupCall;

        if(limit && this.nextOffsets.get(id) === undefined) {
          this.nextOffsets.set(id, groupCall.participants_next_offset);
        }

        return call;
      }
    });
  }

  public saveGroupCall(call: MyGroupCall, chatId?: ChatId) {
    const oldCall = this.groupCalls.get(call.id);
    const shouldUpdate = call._ !== 'inputGroupCall' && (!oldCall || oldCall._ !== 'groupCallDiscarded');
    if(oldCall) {
      if(shouldUpdate) {
        safeReplaceObject(oldCall, call);
      }

      call = oldCall;
    } else {
      this.groupCalls.set(call.id, call);
    }

    if(shouldUpdate) {
      this.rootScope.dispatchEvent('group_call_update', call as any);
    }

    return call;
  }

  public async createGroupCall(chatId: ChatId, scheduleDate?: number, title?: string, rtmp = false) {
    const updates = await this.apiManager.invokeApi('phone.createGroupCall', {
      peer: this.appPeersManager.getInputPeerById(chatId.toPeerId(true)),
      random_id: nextRandomUint(32),
      schedule_date: scheduleDate,
      title,
      rtmp_stream: rtmp
    });

    this.apiUpdatesManager.processUpdateMessage(updates);

    const update = (updates as Updates.updates).updates.find((update) => update._ === 'updateGroupCall') as Update.updateGroupCall;
    return update.call;
  }

  public getGroupCallInput(id: GroupCallId): InputGroupCall {
    const groupCall = this.getGroupCall(id);
    if(!groupCall) throw new Error(`Group call ${id} not found`);
    return {
      _: 'inputGroupCall',
      id: groupCall.id,
      access_hash: groupCall.access_hash
    };
  }

  // public generateSelfParticipant(): GroupCallParticipant {
  //   const mainSources = this.currentGroupCall.connections.main.sources;
  //   const presentationSources = this.currentGroupCall.connections.presentation?.sources;
  //   return {
  //     _: 'groupCallParticipant',
  //     pFlags: {
  //       can_self_unmute: true,
  //       self: true
  //     },
  //     source: mainSources.audio.source,
  //     video: this.generateSelfVideo(mainSources.video),
  //     presentation: presentationSources && this.generateSelfVideo(presentationSources.video, presentationSources.audio?.source),
  //     date: tsNow(true),
  //     peer: this.appPeersManager.getOutputPeer(rootScope.myId)
  //   };
  // }

  public async getGroupCallParticipants(id: GroupCallId) {
    const {nextOffset, setNextOffset} = this.prepareToSavingNextOffset(id);

    if(nextOffset !== '') {
      await this.apiManager.invokeApiSingleProcess({
        method: 'phone.getGroupParticipants',
        params: {
          call: this.getGroupCallInput(id),
          ids: [],
          sources: [],
          offset: nextOffset || '',
          limit: GET_PARTICIPANTS_LIMIT
        },
        processResult: (groupCallParticipants) => {
          const newNextOffset = groupCallParticipants.count === groupCallParticipants.participants.length ? '' : groupCallParticipants.next_offset;

          this.appChatsManager.saveApiChats(groupCallParticipants.chats);
          this.appUsersManager.saveApiUsers(groupCallParticipants.users);
          this.saveApiParticipants(id, groupCallParticipants.participants);

          setNextOffset(newNextOffset);
        }
      });
    }

    return {
      participants: this.getCachedParticipants(id),
      isEnd: this.nextOffsets.get(id) === ''
    };
  }

  public hangUp(id: GroupCallId, discard?: boolean | number) {
    const groupCallInput = this.getGroupCallInput(id);
    let promise: Promise<Updates>;
    if(typeof(discard) === 'boolean' && discard) {
      promise = this.apiManager.invokeApi('phone.discardGroupCall', {
        call: groupCallInput
      });
    } else if(typeof(discard) === 'number') {
      promise = this.apiManager.invokeApi('phone.leaveGroupCall', {
        call: groupCallInput,
        source: discard
      });
    } else {
      promise = this.apiManager.invokeApi('phone.joinGroupCall', {
        call: groupCallInput,
        join_as: this.appPeersManager.getInputPeerSelf(),
        muted: true,
        video_stopped: true,
        params: {
          _: 'dataJSON',
          data: ''
        }
      });
    }

    return promise.then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public async joinGroupCall(groupCallId: GroupCallId, params: DataJSON, options: GroupCallConnectionInstance['options']) {
    const groupCallInput = this.getGroupCallInput(groupCallId);
    let promise: Promise<Updates>;
    if(options.type === 'main') {
      const request: PhoneJoinGroupCall = {
        call: groupCallInput,
        join_as: this.appPeersManager.getInputPeerSelf(),
        params,
        muted: options.isMuted,
        video_stopped: !options.joinVideo
      };

      promise = this.apiManager.invokeApi('phone.joinGroupCall', request);
      this.log(`[api] joinGroupCall id=${groupCallId}`, request);
    } else {
      const request: PhoneJoinGroupCallPresentation = {
        call: groupCallInput,
        params
      };

      promise = this.apiManager.invokeApi('phone.joinGroupCallPresentation', request);
      this.log(`[api] joinGroupCallPresentation id=${groupCallId}`, request);
    }

    const updates = await promise;
    this.apiUpdatesManager.processUpdateMessage(updates);

    const update = (updates as Updates.updates).updates.find((update) => update._ === 'updateGroupCallConnection') as Update.updateGroupCallConnection;
    return update;
  }

  public leaveGroupCallPresentation(groupCallId: GroupCallId) {
    return this.apiManager.invokeApi('phone.leaveGroupCallPresentation', {
      call: this.getGroupCallInput(groupCallId)
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public async _fetchRtmpState(call: InputGroupCall, retry = 0, dcId?: DcId): Promise<GroupCallRtmpState> {
    const full = await this.getGroupCallFull(call.id);
    if(full._ === 'groupCallDiscarded') {
      throw new Error('Group call discarded');
    }

    dcId ??= full.stream_dc_id || await this.apiManager.getBaseDcId();

    try {
      const res = await this.apiManager.invokeApi('phone.getGroupCallStreamChannels', {call}, {dcId});
      return {
        channels: res.channels,
        dcId,
        time: Date.now()
      };
    } catch(error) {
      assumeType<ApiError>(error);

      if(error.type?.indexOf('CALL_MIGRATE') === 0) {
        const dcId = +error.type.match(/^(CALL_MIGRATE_)(\d+)/)[2] as DcId;
        return this._fetchRtmpState(call, retry, dcId);
      }

      if(error.type === 'GROUPCALL_INVALID' && retry < 3) {
        // this sometimes happens for some reason. retry
        return this._fetchRtmpState(call, retry + 1);
      }

      throw error;
    }
  }

  public fetchRtmpState(call: InputGroupCall, overwrite?: boolean) {
    const cached = this.cachedStreamChannels.get(call.id);
    if(cached && !overwrite) {
      return cached;
    }

    const promise = this._fetchRtmpState(call);
    promise.finally(() => {
      setTimeout(() => {
        if(this.cachedStreamChannels.get(call.id) === promise) {
          this.cachedStreamChannels.delete(call.id);
        }
      }, 1000);
    });
    this.cachedStreamChannels.set(call.id, promise);
    return promise;
  }

  public fetchRtmpPart(location: InputFileLocation.inputGroupCallStream, dcId: number) {
    // return Promise.reject(makeError('TIME_TOO_BIG'));
    return this.apiFileManager.requestFilePart({
      dcId,
      location,
      offset: 0,
      limit: 512 * 1024,
      priority: 32,
      floodMaxTimeout: 0
    }).then((result) => {
      if(!result.bytes.length) {
        return;
      }

      const info = parseVideoStreamInfo(result.bytes);
      return info;
    });
  }

  public fetchRtmpUrl(peerId: PeerId, revoke = false) {
    return this.apiManager.invokeApi('phone.getGroupCallStreamRtmpUrl', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      revoke
    });
  }

  public async startRecording(call: InputGroupCall, params: CallRecordParams) {
    const updates = await this.apiManager.invokeApi('phone.toggleGroupCallRecord', {
      start: true,
      call,
      video: params.recordVideo,
      video_portrait: params.videoHorizontal,
      title: params.name || undefined
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }

  public async stopRecording(call: InputGroupCall) {
    const updates = await this.apiManager.invokeApi('phone.toggleGroupCallRecord', {
      start: false,
      call
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }
}
