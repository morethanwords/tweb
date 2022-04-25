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

import AudioAssetPlayer from "../../helpers/audioAssetPlayer";
import safeReplaceObject from "../../helpers/object/safeReplaceObject";
import { nextRandomUint } from "../../helpers/random";
import tsNow from "../../helpers/tsNow";
import { GroupCall, GroupCallParticipant, GroupCallParticipantVideo, GroupCallParticipantVideoSourceGroup, InputGroupCall, Peer, PhoneJoinGroupCall, PhoneJoinGroupCallPresentation, Update, Updates } from "../../layer";
import GroupCallInstance from "../calls/groupCallInstance";
import GROUP_CALL_STATE from "../calls/groupCallState";
import createMainStreamManager from "../calls/helpers/createMainStreamManager";
import { generateSsrc } from "../calls/localConferenceDescription";
import { WebRTCLineType } from "../calls/sdpBuilder";
import StreamManager from "../calls/streamManager";
import { Ssrc } from "../calls/types";
import { logger } from "../logger";
import apiManager from "../mtproto/mtprotoworker";
import { NULL_PEER_ID } from "../mtproto/mtproto_config";
import rootScope from "../rootScope";
import { AppManager } from "./manager";

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

let IS_MUTED = true;

export type GroupCallOutputSource = 'main' | 'presentation' | number;

export type GroupCallAudioAssetName = "group_call_connect.mp3" | "group_call_end.mp3" | "group_call_start.mp3" | "voip_onallowtalk.mp3";

export class AppGroupCallsManager extends AppManager {
  private log: ReturnType<typeof logger>;
  
  private groupCalls: Map<GroupCallId, MyGroupCall>;
  private participants: Map<GroupCallId, Map<PeerId, GroupCallParticipant>>;
  private nextOffsets: Map<GroupCallId, string>;
  
  // private audioAsset: AudioAsset;
  
  private currentGroupCall: GroupCallInstance;
  private connectionAudio: HTMLAudioElement;
  private doNotDispatchParticipantUpdate: PeerId;
  private audioAsset: AudioAssetPlayer<GroupCallAudioAssetName>;

  constructor() {
    super();

    this.log = logger('GROUP-CALLS');
    
    this.groupCalls = new Map();
    this.participants = new Map();
    this.nextOffsets = new Map();
    
    rootScope.addMultipleEventsListeners({
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

    rootScope.addEventListener('group_call_update', (groupCall) => {
      if(groupCall._ === 'groupCallDiscarded') {
        const {currentGroupCall} = this;
        if(currentGroupCall?.id === groupCall.id) {
          currentGroupCall.hangUp(false, false, true);
        }

        this.participants.delete(groupCall.id);
      }
    });

    this.audioAsset = new AudioAssetPlayer<GroupCallAudioAssetName>([
      'group_call_connect.mp3',
      'group_call_end.mp3',
      'group_call_start.mp3',
      'voip_onallowtalk.mp3'
    ]);
  }

  get groupCall() {
    return this.currentGroupCall;
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
    const {currentGroupCall} = this;
    const participants = this.getCachedParticipants(groupCallId);

    const peerId = this.appPeersManager.getPeerId(participant.peer);

    const oldParticipant = participants.get(peerId);
    const hasLeft = participant.pFlags.left;
    if(!oldParticipant && hasLeft) {
      return;
    }

    // * fix missing flag
    if(!participant.pFlags.muted && !participant.pFlags.can_self_unmute) {
      participant.pFlags.can_self_unmute = true;
    }

    const isCurrentGroupCall = currentGroupCall?.id === groupCallId;

    if(oldParticipant) {
      safeReplaceObject(oldParticipant, participant);
      participant = oldParticipant;
    } else {
      participants.set(peerId, participant);
    }

    if(isCurrentGroupCall) {
      currentGroupCall.onParticipantUpdate(participant, this.doNotDispatchParticipantUpdate);
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
          rootScope.dispatchEvent('group_call_update', groupCall);
        }
      }
    // }
    
    if(hasLeft) {
      participants.delete(peerId);
    }

    if(oldParticipant && this.doNotDispatchParticipantUpdate !== peerId) {
      rootScope.dispatchEvent('group_call_participant', {
        groupCallId,
        participant
      });
    }
  }

  public saveApiParticipants(groupCallId: GroupCallId, apiParticipants: GroupCallParticipant[], skipCounterUpdating?: boolean) {
    if((apiParticipants as any).saved) return;
    (apiParticipants as any).saved = true;
    apiParticipants.forEach(p => this.saveApiParticipant(groupCallId, p, skipCounterUpdating));
  }

  public async editParticipant(groupCallId: GroupCallId, participant: GroupCallParticipant, options: Partial<{
    muted: boolean,
    volume: number,
    raiseHand: boolean,
    videoStopped: boolean,
    videoPaused: boolean,
    presentationPaused: boolean
  }>) {
    if(!Object.keys(options).length) {
      return;
    }

    let processUpdate = true;
    if(participant) {
      const {currentGroupCall} = this;
      const isCurrentCall = currentGroupCall?.id === groupCallId;
      const isUpdatingMeInCurrentCall = isCurrentCall && participant.pFlags.self;

      if(isUpdatingMeInCurrentCall) {
        if(options.muted !== undefined && !currentGroupCall.isSharingAudio) {
          delete options.muted;

          if(!Object.keys(options).length) {
            return;
          }
        }
      }

      // if(isCurrentCall) {
        const muted = options.muted;
        if(muted !== undefined) {
          /* const isAdmin = appChatsManager.hasRights(currentGroupCall.chatId, 'manage_call');
          if(isAdmin) {
            if(muted) {
              participant.pFlags.muted = true;
              delete participant.pFlags.can_self_unmute;
            } else {
              participant.pFlags.can_self_unmute = true;
            }
          } else  */if(participant.pFlags.self) {
            if(muted) {
              participant.pFlags.muted = true;
            } else if(participant.pFlags.can_self_unmute) {
              delete participant.pFlags.muted;
            }
          }/*  else {
            if(muted) {
              participant.pFlags.muted_by_you = true;
            } else {
              delete participant.pFlags.muted_by_you;
            }
          } */
        }
      // }

      /* const a: [keyof GroupCallParticipant['pFlags'], keyof typeof options][] = [
        ['muted', 'muted']
      ];

      a.forEach(([key, optionKey]) => {
        const value = options[optionKey];
        if(value === undefined) {
          return;
        }

        if(value) {
          participant.pFlags[key] = true;
        } else {
          delete participant.pFlags[key];
        }
      }); */

      if(options.raiseHand !== undefined) {
        if(options.raiseHand) participant.raise_hand_rating = '1';
        else delete participant.raise_hand_rating;
      }

      if(isUpdatingMeInCurrentCall) {
        if(options.videoStopped !== undefined) {
          if(options.videoStopped) delete participant.video;
          else participant.video = this.generateSelfVideo(currentGroupCall.connections.main.sources.video);
        }

        if(!participant.pFlags.muted && participant.pFlags.can_self_unmute) {
          currentGroupCall.setMuted(false);
        }

        currentGroupCall.dispatchEvent('state', currentGroupCall.state);
      }

      rootScope.dispatchEvent('group_call_participant', {groupCallId, participant});

      /* if(participant.pFlags.self) {
        processUpdate = false;
      } */
    }

    const peerId = participant.pFlags.self ? NULL_PEER_ID : this.appPeersManager.getPeerId(participant.peer);
    const updates = await apiManager.invokeApiSingle('phone.editGroupCallParticipant', {
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
    if(!processUpdate) this.doNotDispatchParticipantUpdate = this.appPeersManager.getPeerId(participant.peer);
    this.apiUpdatesManager.processUpdateMessage(updates);
    if(!processUpdate) this.doNotDispatchParticipantUpdate = undefined;
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
    return apiManager.invokeApiSingleProcess({
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
      rootScope.dispatchEvent('group_call_update', call as any);
    }

    return call;
  }
  
  public startConnectingSound() {
    this.stopConnectingSound();
    this.audioAsset.playSoundWithTimeout('group_call_connect.mp3', true, 2500);
  }
  
  public stopConnectingSound() {
    this.audioAsset.stopSound();
    this.audioAsset.cancelDelayedPlay();
  }

  public setCurrentGroupCall(groupCall: GroupCallInstance) {
    this.currentGroupCall = groupCall;

    if(groupCall) {
      rootScope.dispatchEvent('group_call_instance', groupCall);
    }
    /* TdLibController.clientUpdate({
      '@type': 'clientUpdateGroupCall',
      call
    }); */
  }

  public async createGroupCall(chatId: ChatId, scheduleDate?: number, title?: string) {
    const updates = await apiManager.invokeApi('phone.createGroupCall', {
      peer: this.appPeersManager.getInputPeerById(chatId.toPeerId(true)),
      random_id: nextRandomUint(32),
      schedule_date: scheduleDate,
      title
    });

    this.apiUpdatesManager.processUpdateMessage(updates);

    const update = (updates as Updates.updates).updates.find(update => update._ === 'updateGroupCall') as Update.updateGroupCall;
    return update.call;
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

    return this.joinGroupCallInternal(chatId, groupCallId, streamManager, muted, rejoin, joinVideo);
  }

  public async joinGroupCallInternal(chatId: ChatId, groupCallId: GroupCallId, streamManager: StreamManager, muted: boolean, rejoin = false, joinVideo?: boolean) {
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
        appGroupCallsManager: this,
        apiUpdatesManager: this.apiUpdatesManager,
        appPeersManager: this.appPeersManager
      });

      currentGroupCall.fixSafariAudio();

      currentGroupCall.addEventListener('state', (state) => {
        if(this.currentGroupCall === currentGroupCall && state === GROUP_CALL_STATE.CLOSED) {
          this.setCurrentGroupCall(null);
          this.stopConnectingSound();
          this.audioAsset.playSound('group_call_end.mp3');
          rootScope.dispatchEvent('chat_update', currentGroupCall.chatId);
        }
      });

      currentGroupCall.groupCall = await this.getGroupCallFull(groupCallId);

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
              this.audioAsset.playSound('group_call_start.mp3');
  
              this.getGroupCallParticipants(groupCallId).then(({participants}) => {
                this.saveApiParticipants(groupCallId, [...participants.values()]);
              });
            }
            
            break;
          }
          
          case 'disconnected': {
            break;
          }
          
          case 'failed': {
            //TODO: replace with ICE restart
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
  
  public getGroupCallInput(id: GroupCallId): InputGroupCall {
    const groupCall = this.getGroupCall(id);
    return {
      _: 'inputGroupCall',
      id: groupCall.id,
      access_hash: groupCall.access_hash
    };
  }

  public generateSelfVideo(source: Ssrc, audioSource?: number): GroupCallParticipantVideo {
    return source && {
      _: 'groupCallParticipantVideo',
      pFlags: {},
      endpoint: '',
      source_groups: source.sourceGroups,
      audio_source: audioSource
    };
  }
  
  public generateSelfParticipant(): GroupCallParticipant {
    const mainSources = this.currentGroupCall.connections.main.sources;
    const presentationSources = this.currentGroupCall.connections.presentation?.sources;
    return {
      _: 'groupCallParticipant',
      pFlags: {
        can_self_unmute: true,
        self: true
      },
      source: mainSources.audio.source,
      video: this.generateSelfVideo(mainSources.video),
      presentation: presentationSources && this.generateSelfVideo(presentationSources.video, presentationSources.audio?.source),
      date: tsNow(true),
      peer: this.appPeersManager.getOutputPeer(rootScope.myId)
    };
  }

  public makeSsrcsFromParticipant = (participant: GroupCallParticipant) => {
    return [
      this.makeSsrcFromParticipant(participant, 'audio', participant.source),
      participant.video?.audio_source && this.makeSsrcFromParticipant(participant, 'audio', participant.video.audio_source),
      participant.video && this.makeSsrcFromParticipant(participant, 'video', participant.video.source_groups, participant.video.endpoint),
      participant.presentation?.audio_source && this.makeSsrcFromParticipant(participant, 'audio', participant.presentation.audio_source),
      participant.presentation && this.makeSsrcFromParticipant(participant, 'video', participant.presentation.source_groups, participant.presentation.endpoint)
    ].filter(Boolean);
  };

  public makeSsrcFromParticipant(participant: GroupCallParticipant, type: WebRTCLineType, source?: number | GroupCallParticipantVideoSourceGroup[], endpoint?: string): Ssrc {
    return generateSsrc(type, source, endpoint);
  }

  public async getGroupCallParticipants(id: GroupCallId) {
    const {nextOffset, setNextOffset} = this.prepareToSavingNextOffset(id);

    if(nextOffset !== '') {
      await apiManager.invokeApiSingleProcess({
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

  public async hangUp(groupCallId: GroupCallId, discard = false, rejoin = false) {
    this.log(`hangUp start id=${groupCallId} discard=${discard} rejoin=${rejoin}`);
    const {currentGroupCall} = this;
    if(currentGroupCall?.id !== groupCallId) return;

    currentGroupCall.hangUp(discard, rejoin);
  }

  public toggleMuted(muted?: boolean) {
    return this.changeUserMuted(NULL_PEER_ID, muted);
  }
  
  public changeUserMuted(peerId: PeerId, muted?: boolean) {
    const {currentGroupCall} = this;
    if(!currentGroupCall) return;

    const participant = currentGroupCall.getParticipantByPeerId(peerId);
    if(NULL_PEER_ID === peerId && participant.pFlags.can_self_unmute) {
      muted = muted === undefined ? !participant.pFlags.muted : muted;
    }

    return this.editParticipant(currentGroupCall.id, participant, {muted});
  }
}
