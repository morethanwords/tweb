/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {GroupCallConnectionType, GroupCallId, GroupCallOutputSource} from '../appManagers/appGroupCallsManager';
import {IS_SAFARI} from '../../environment/userAgent';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import safeAssign from '../../helpers/object/safeAssign';
import throttle from '../../helpers/schedulers/throttle';
import {GroupCall, GroupCallParticipant} from '../../layer';
import {logger} from '../logger';
import {NULL_PEER_ID} from '../mtproto/mtproto_config';
import rootScope from '../rootScope';
import CallInstanceBase, {TryAddTrackOptions} from './callInstanceBase';
import GroupCallConnectionInstance from './groupCallConnectionInstance';
import GROUP_CALL_STATE from './groupCallState';
import getScreenConstraints from './helpers/getScreenConstraints';
import getScreenStream from './helpers/getScreenStream';
import getStream from './helpers/getStream';
import getVideoConstraints from './helpers/getVideoConstraints';
import stopTrack from './helpers/stopTrack';
import localConferenceDescription from './localConferenceDescription';
import {WebRTCLineType} from './sdpBuilder';
import StreamManager from './streamManager';
import {Ssrc} from './types';
import getPeerId from '../appManagers/utils/peers/getPeerId';
import {AppManagers} from '../appManagers/managers';
import {generateSelfVideo, makeSsrcFromParticipant, makeSsrcsFromParticipant} from './groupCallsController';

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

  private managers: AppManagers;

  constructor(options: {
    id: GroupCallInstance['id'],
    chatId: GroupCallInstance['chatId'],
    isSpeakingMap?: GroupCallInstance['isSpeakingMap'],
    connections?: GroupCallInstance['connections'],
    managers: AppManagers
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
    return this.managers.appGroupCallsManager.getCachedParticipants(this.id);
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

  public async getParticipantByPeerId(peerId: PeerId) {
    return NULL_PEER_ID === peerId ? this.participant : (await this.participants).get(peerId);
  }

  public toggleMuted() {
    return this.requestAudioSource(true).then(() => this.changeUserMuted(NULL_PEER_ID));
  }

  public async changeUserMuted(peerId: PeerId, muted?: boolean) {
    const participant = await this.getParticipantByPeerId(peerId);
    if(NULL_PEER_ID === peerId && participant.pFlags.can_self_unmute) {
      muted = muted === undefined ? !participant.pFlags.muted : muted;
    }

    return this.editParticipant(participant, {muted});
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
      managers: this.managers,
      ...options
    });
  }

  public changeRaiseHand(raise: boolean) {
    return this.editParticipant(this.participant, {raiseHand: raise});
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
    return this.startScreenSharingPromise ??= this.startScreenSharingInternal().finally(() => {
      this.startScreenSharingPromise = undefined;
    });
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
    this.managers.appGroupCallsManager.saveApiParticipant(this.id, this.participant);

    return this.managers.appGroupCallsManager.leaveGroupCallPresentation(this.id);
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

      await this.editParticipant(this.participant, {
        videoPaused: false,
        videoStopped: false
      });
    } catch(err) {
      this.log.error('startVideoSharing error', err, constraints);
    }
  }

  public startVideoSharing() {
    return this.startVideoSharingPromise ??= this.startVideoSharingInternal().finally(() => {
      this.startVideoSharingPromise = undefined;
    });
  }

  public async stopVideoSharing() {
    const connectionInstance = this.connections.main;
    const track = connectionInstance.streamManager.inputStream.getVideoTracks()[0];
    if(!track) {
      return;
    }

    stopTrack(track);
    connectionInstance.streamManager.appendToConference(connectionInstance.description); // clear sender track

    await this.editParticipant(this.participant, {
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
      const d = discard || (this.joined ? this.connections.main.sources.audio.source : undefined);
      this.managers.appGroupCallsManager.hangUp(this.id, d);
    }
  }

  public tryAddTrack(options: Omit<TryAddTrackOptions, 'streamManager'>) {
    const {description} = this;
    const source = super.tryAddTrack(options);

    if(options.type === 'output') {
      const entry = description.getEntryBySource(+source);
      this.getParticipantByPeerId(entry.peerId).then((participant) => {
        if(participant) {
          rootScope.dispatchEvent('group_call_participant', {groupCallId: this.id, participant});
        }
      });
    }

    return source;
  }

  public async editParticipant(participant: GroupCallParticipant, options: Partial<{
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

    // let processUpdate = true;
    if(participant) {
      // const {currentGroupCall} = this;
      // const isCurrentCall = currentGroupCall?.id === groupCallId;
      const isCurrentCall = true;
      const isUpdatingMeInCurrentCall = isCurrentCall && participant.pFlags.self;

      if(isUpdatingMeInCurrentCall) {
        if(options.muted !== undefined && !this.isSharingAudio) {
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
          else participant.video = generateSelfVideo(this.connections.main.sources.video);
        }

        if(!participant.pFlags.muted && participant.pFlags.can_self_unmute) {
          this.setMuted(false);
        }

        this.dispatchEvent('state', this.state);
      }

      // rootScope.dispatchEvent('group_call_participant', {groupCallId, participant});

      /* if(participant.pFlags.self) {
        processUpdate = false;
      } */
    }

    return this.managers.appGroupCallsManager.editParticipant(this.id, participant, options);
  }

  public onParticipantUpdate(participant: GroupCallParticipant, doNotDispatchParticipantUpdate?: PeerId) {
    const connectionInstance = this.connections.main;
    const {connection, description} = connectionInstance;

    const peerId = getPeerId(participant.peer);
    const hasLeft = !!participant.pFlags.left;
    const oldSsrcs = this.participantsSsrcs.get(peerId) || [];

    if(participant.presentation && !hasLeft) {
      const {source} = makeSsrcFromParticipant(participant, 'video', participant.presentation.source_groups, participant.presentation.endpoint);
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

    const ssrcs = hasLeft ? [] : makeSsrcsFromParticipant(participant);

    if(!hasLeft) {
      this.participantsSsrcs.set(peerId, ssrcs);
    } else {
      this.participantsSsrcs.delete(peerId);
    }

    // const TEST_OLD = false;

    const modifiedTypes: Set<WebRTCLineType> = new Set();
    oldSsrcs.forEach((oldSsrc) => {
      const oldSource = oldSsrc.source;
      const newSsrc = ssrcs.find((ssrc) => ssrc.source === oldSource);
      if(!newSsrc) {
        this.unpinSource(oldSource);

        const oldEntry = description.getEntryBySource(oldSource);
        if(oldEntry && oldEntry.direction !== 'inactive') {
          oldEntry.setDirection('inactive');
          modifiedTypes.add(oldEntry.type);
        }
      }
    });

    ssrcs.forEach((ssrc) => {
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
