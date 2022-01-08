/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { IS_SAFARI } from "../../environment/userAgent";
import { indexOfAndSplice } from "../../helpers/array";
import { safeAssign } from "../../helpers/object";
import throttle from "../../helpers/schedulers/throttle";
import { GroupCall, GroupCallParticipant, Updates } from "../../layer";
import apiUpdatesManager from "../appManagers/apiUpdatesManager";
import appGroupCallsManager, { GroupCallConnectionType, GroupCallId, GroupCallOutputSource } from "../appManagers/appGroupCallsManager";
import appPeersManager from "../appManagers/appPeersManager";
import { logger } from "../logger";
import apiManager from "../mtproto/apiManager";
import { NULL_PEER_ID } from "../mtproto/mtproto_config";
import rootScope from "../rootScope";
import CallInstanceBase, { TryAddTrackOptions } from "./callInstanceBase";
import GroupCallConnectionInstance from "./groupCallConnectionInstance";
import GROUP_CALL_STATE from "./groupCallState";
import getScreenConstraints from "./helpers/getScreenConstraints";
import getScreenStream from "./helpers/getScreenStream";
import getStream from "./helpers/getStream";
import getVideoConstraints from "./helpers/getVideoConstraints";
import stopTrack from "./helpers/stopTrack";
import localConferenceDescription from "./localConferenceDescription";
import { WebRTCLineType } from "./sdpBuilder";
import StreamManager from "./streamManager";
import { Ssrc } from "./types";

export default class GroupCallInstance extends CallInstanceBase<{
  state: (state: GROUP_CALL_STATE) => void,
  pinned: (source?: GroupCallOutputSource) => void,
}> {
  public id: GroupCallId;
  public chatId: ChatId;
  public handleUpdateGroupCallParticipants: boolean;
  public updatingSdp: boolean;
  public isSpeakingMap: Map<any, any>;
  public connections: {[k in GroupCallConnectionType]?: GroupCallConnectionInstance};
  public groupCall: GroupCall;
  public participant: GroupCallParticipant;
  
  // will be set with negotiation
  public joined: boolean;
  
  private pinnedSources: Array<GroupCallOutputSource>;
  private participantsSsrcs: Map<PeerId, Ssrc[]>;
  private hadAutoPinnedSources: Set<GroupCallOutputSource>;
  private dispatchPinnedThrottled: () => void;
  private startVideoSharingPromise: Promise<void>;
  private startScreenSharingPromise: Promise<void>;

  constructor(options: {
    id: GroupCallInstance['id'],
    chatId: GroupCallInstance['chatId'],
    isSpeakingMap?: GroupCallInstance['isSpeakingMap'],
    connections?: GroupCallInstance['connections']
  }) {
    super();

    safeAssign(this, options);

    if(!this.log) {
      this.log = logger('GROUP-CALL');
    }

    if(!this.connections) {
      this.connections = {};
    }

    if(!this.isSpeakingMap) {
      this.isSpeakingMap = new Map();
    }

    this.pinnedSources = [];
    this.participantsSsrcs = new Map();
    this.hadAutoPinnedSources = new Set();
    this.dispatchPinnedThrottled = throttle(() => {
      this.dispatchEvent('pinned', this.pinnedSource);
    }, 0, false);

    this.addEventListener('state', (state) => {
      if(state === GROUP_CALL_STATE.CLOSED) {
        this.cleanup();
      }
    });
  }

  get connectionState() {
    return this.connections.main.connection.iceConnectionState;
  }

  get state() {
    const {connectionState} = this;
    if(connectionState === 'closed') {
      return GROUP_CALL_STATE.CLOSED;
    } else if(connectionState !== 'connected' && (!IS_SAFARI || connectionState !== 'completed')) {
      return GROUP_CALL_STATE.CONNECTING;
    } else {
      const {participant} = this;
      if(!participant.pFlags.can_self_unmute) {
        return GROUP_CALL_STATE.MUTED_BY_ADMIN;
      } else if(participant.pFlags.muted) {
        return GROUP_CALL_STATE.MUTED;
      } else {
        return GROUP_CALL_STATE.UNMUTED;
      }
    }
  }

  get participants() {
    return appGroupCallsManager.getCachedParticipants(this.id);
  }

  get isSharingScreen() {
    return !!this.connections.presentation;
  }

  get pinnedSource() {
    return this.pinnedSources[this.pinnedSources.length - 1];
  }

  public get isMuted() {
    return this.state !== GROUP_CALL_STATE.UNMUTED;
  }

  public get isClosing() {
    const {state} = this;
    return state === GROUP_CALL_STATE.CLOSED;
  }

  public get streamManager(): StreamManager {
    return this.connections.main.streamManager;
  }

  public get description(): localConferenceDescription {
    return this.connections.main.description;
  }

  public pinSource(source: GroupCallOutputSource) {
    indexOfAndSplice(this.pinnedSources, source);
    this.pinnedSources.push(source);
    this.dispatchPinnedThrottled();
  }

  public unpinSource(source: GroupCallOutputSource) {
    this.hadAutoPinnedSources.delete(source);
    indexOfAndSplice(this.pinnedSources, source);
    this.dispatchPinnedThrottled();
  }

  public unpinAll() {
    this.pinnedSources.length = 0;
    this.dispatchPinnedThrottled();
  }

  public getParticipantByPeerId(peerId: PeerId) {
    return NULL_PEER_ID === peerId ? this.participant : this.participants.get(peerId);
  }

  public toggleMuted() {
    return this.requestAudioSource(true).then(() => appGroupCallsManager.toggleMuted());
  }

  public getElement(endpoint: GroupCallOutputSource) {
    return super.getElement(endpoint);
  }

  public getVideoElementFromParticipantByType(participant: GroupCallParticipant, type: 'video' | 'presentation') {
    let source: GroupCallOutputSource;
    if(participant.pFlags.self) {
      const connectionType: GroupCallConnectionType = type === 'video' ? 'main' : 'presentation';
      source = connectionType;
    } else {
      const codec = participant[type];
      source = codec.source_groups[0].sources[0];
    }

    const element = this.getElement(source) as HTMLVideoElement;
    if(!element) return;

    const clone = element.cloneNode() as typeof element;
    clone.srcObject = element.srcObject;
    clone.setAttribute('playsinline', 'true');
    clone.muted = true;
    return {video: clone, source};
  }

  public createConnectionInstance(options: {
    streamManager: StreamManager,
    type: GroupCallConnectionType,
    options: GroupCallConnectionInstance['options'],
  }) {
    return this.connections[options.type] = new GroupCallConnectionInstance({
      groupCall: this,
      log: this.log.bindPrefix(options.type),
      ...options
    });
  }

  public changeRaiseHand(raise: boolean) {
    return appGroupCallsManager.editParticipant(this.id, this.participant, {raiseHand: raise});
  }

  public async startScreenSharingInternal() {
    try {
      const type: GroupCallConnectionType = 'presentation';

      const stream = await getScreenStream(getScreenConstraints());
      const streamManager = new StreamManager();
      
      const connectionInstance = this.createConnectionInstance({
        streamManager,
        type,
        options: {
          type
        }
      });
      
      const connection = connectionInstance.createPeerConnection();
      connection.addEventListener('negotiationneeded', () => {
        connectionInstance.negotiate();
      });

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if(this.connections.presentation) { // maybe user has stopped screensharing through browser's ui
          this.stopScreenSharing();
        }
      }, {once: true});
      
      connectionInstance.createDescription();
      connectionInstance.addInputVideoStream(stream);
    } catch(err) {
      this.log.error('start screen sharing error', err);
    }
  }

  public startScreenSharing() {
    return this.startScreenSharingPromise || (this.startScreenSharingPromise = this.startScreenSharingInternal().finally(() => {
      this.startScreenSharingPromise = undefined;
    }));
  }

  public stopScreenSharing() {
    const connectionInstance = this.connections.presentation;
    if(!connectionInstance) {
      return Promise.resolve();
    }

    delete this.connections.presentation;
    this.unpinSource('presentation');
    connectionInstance.closeConnectionAndStream(true);

    delete this.participant.presentation;
    appGroupCallsManager.saveApiParticipant(this.id, this.participant);

    return apiManager.invokeApi('phone.leaveGroupCallPresentation', {
      call: appGroupCallsManager.getGroupCallInput(this.id)
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public toggleScreenSharing() {
    if(this.isSharingScreen) {
      return this.stopScreenSharing();
    } else {
      return this.startScreenSharing();
    }
  }

  public async startVideoSharingInternal() {
    const constraints: MediaStreamConstraints = {
      video: getVideoConstraints()
    };

    try {
      const stream = await getStream(constraints, false);
      const connectionInstance = this.connections.main;
      connectionInstance.addInputVideoStream(stream);

      await appGroupCallsManager.editParticipant(this.id, this.participant, {
        videoPaused: false,
        videoStopped: false
      });
    } catch(err) {
      this.log.error('startVideoSharing error', err, constraints);
    }
  }

  public startVideoSharing() {
    return this.startVideoSharingPromise || (this.startVideoSharingPromise = this.startVideoSharingInternal().finally(() => {
      this.startVideoSharingPromise = undefined;
    }));
  }

  public async stopVideoSharing() {
    const connectionInstance = this.connections.main;
    const track = connectionInstance.streamManager.inputStream.getVideoTracks()[0];
    if(!track) {
      return;
    }

    stopTrack(track);
    connectionInstance.streamManager.appendToConference(connectionInstance.description); // clear sender track

    await appGroupCallsManager.editParticipant(this.id, this.participant, {
      videoStopped: true
    });
  }

  public toggleVideoSharing() {
    if(this.isSharingVideo) {
      return this.stopVideoSharing();
    } else {
      return this.startVideoSharing();
    }
  }

  public async hangUp(discard = false, rejoin = false, isDiscarded = false) {
    for(const type in this.connections) {
      const connection = this.connections[type as GroupCallConnectionType];
      connection.closeConnectionAndStream(!rejoin);
    }

    this.dispatchEvent('state', this.state);

    if(isDiscarded) {
      return;
    }
    
    if(!rejoin) {
      let promise: Promise<Updates>;
      const groupCallInput = appGroupCallsManager.getGroupCallInput(this.id);

      if(discard) {
        this.log(`[api] discardGroupCall id=${this.id}`);
        promise = apiManager.invokeApi('phone.discardGroupCall', {
          call: groupCallInput
        });
      } else if(this.joined) {
        this.log(`[api] leaveGroupCall id=${this.id}`);
        const connectionInstance = this.connections.main;
        promise = apiManager.invokeApi('phone.leaveGroupCall', {
          call: groupCallInput,
          source: connectionInstance.sources.audio.source
        });
      } else {
        this.log(`[api] id=${this.id} payload=null`);
        promise = apiManager.invokeApi('phone.joinGroupCall', {
          call: groupCallInput,
          join_as: {_: 'inputPeerSelf'},
          muted: true,
          video_stopped: true,
          params: {
            _: 'dataJSON',
            data: ''
          }
        });
      }

      const updates = await promise;
      apiUpdatesManager.processUpdateMessage(updates);
    }
  }

  public tryAddTrack(options: Omit<TryAddTrackOptions, 'streamManager'>) {
    const {description} = this;
    const source = super.tryAddTrack(options);
    
    if(options.type === 'output') {
      const entry = description.getEntryBySource(+source);
      const participant = this.participants.get(entry.peerId);
      if(participant) {
        rootScope.dispatchEvent('group_call_participant', {groupCallId: this.id, participant});
      }
    }

    return source;
  }

  public onParticipantUpdate(participant: GroupCallParticipant, doNotDispatchParticipantUpdate?: PeerId) {
    const connectionInstance = this.connections.main;
    const {connection, description} = connectionInstance;

    const peerId = appPeersManager.getPeerId(participant.peer);
    const hasLeft = !!participant.pFlags.left;
    const oldSsrcs = this.participantsSsrcs.get(peerId) || [];

    if(participant.presentation && !hasLeft) {
      const {source} = appGroupCallsManager.makeSsrcFromParticipant(participant, 'video', participant.presentation.source_groups, participant.presentation.endpoint);
      if(!this.hadAutoPinnedSources.has(source)) {
        this.hadAutoPinnedSources.add(source);
        this.pinSource(participant.pFlags.self ? 'presentation' : source);
      }
    }

    if(participant.pFlags.self) {
      this.participant = participant;

      if(connectionInstance.sources.audio.source !== participant.source) {
        this.hangUp();
      }

      let mute = false;
      if(!participant.pFlags.can_self_unmute) {
        this.stopScreenSharing();
        this.stopVideoSharing();
        mute = true;
      } else if(participant.pFlags.muted) {
        mute = true;
      }

      if(mute) {
        this.setMuted(true);
      }

      if(doNotDispatchParticipantUpdate !== peerId) {
        this.dispatchEvent('state', this.state);
      }

      return;
    }

    const ssrcs = hasLeft ? [] : appGroupCallsManager.makeSsrcsFromParticipant(participant);

    if(!hasLeft) {
      this.participantsSsrcs.set(peerId, ssrcs);
    } else {
      this.participantsSsrcs.delete(peerId);
    }

    // const TEST_OLD = false;

    const modifiedTypes: Set<WebRTCLineType> = new Set();
    oldSsrcs.forEach(oldSsrc => {
      const oldSource = oldSsrc.source;
      const newSsrc = ssrcs.find(ssrc => ssrc.source === oldSource);
      if(!newSsrc) {
        this.unpinSource(oldSource);

        const oldEntry = description.getEntryBySource(oldSource);
        if(oldEntry && oldEntry.direction !== 'inactive') {
          oldEntry.setDirection('inactive');
          modifiedTypes.add(oldEntry.type);
        }
      }
    });

    ssrcs.forEach(ssrc => {
      let entry = description.getEntryBySource(ssrc.source);
      if(entry) {
        if(entry.direction === 'inactive') {
          entry.setDirection(entry.originalDirection);
          modifiedTypes.add(entry.type);
        }

        return;
      }

      entry = description.createEntry(ssrc.type);
      description.setEntrySource(entry, ssrc.sourceGroups || ssrc.source);
      description.setEntryPeerId(entry, peerId);

      // if(TEST_OLD) {
      //   description.bundleMids.push(entry.mid);
      //   entry.setDirection('recvonly');
      // } else {
        ssrc.type === 'video' && entry.setEndpoint(ssrc.endpoint);
        entry.createTransceiver(connection, {direction: 'recvonly'});
      // }

      modifiedTypes.add(entry.type);
    });

    /* if(TEST_OLD) {
      this.setRemoteOffer({
        connection,
        description,
        ssrcs
      });
    } else  */if(modifiedTypes.size) {
      if(modifiedTypes.has('video')) {
        connectionInstance.updateConstraints = true;
      }

      connectionInstance.negotiateThrottled();
    }
  }
}
