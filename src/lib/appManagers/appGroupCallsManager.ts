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
import constraintSupported, { MyMediaTrackSupportedConstraints } from "../../environment/constraintSupport";
import { IS_SAFARI } from "../../environment/userAgent";
import { forEachReverse, indexOfAndSplice } from "../../helpers/array";
import simulateEvent from "../../helpers/dom/dispatchEvent";
import noop from "../../helpers/noop";
import { safeAssign, safeReplaceObject } from "../../helpers/object";
import { nextRandomUint } from "../../helpers/random";
import throttle from "../../helpers/schedulers/throttle";
import tsNow from "../../helpers/tsNow";
import { DataJSON, GroupCall, GroupCallParticipant, GroupCallParticipantVideo, GroupCallParticipantVideoSourceGroup, InputGroupCall, Peer, PhoneJoinGroupCall, PhoneJoinGroupCallPresentation, Update, Updates } from "../../layer";
import { GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS } from "../calls/constants";
import GROUP_CALL_STATE from "../calls/groupCallState";
import LocalConferenceDescription, { ConferenceEntry, generateSsrc } from "../calls/localConferenceDescription";
import SDP from "../calls/sdp";
import SDPMediaSection from "../calls/sdp/mediaSection";
import { WebRTCLineType } from "../calls/sdpBuilder";
import StreamManager, { StreamItem } from "../calls/streamManager";
import { Codec, Ssrc, UpdateGroupCallConnectionData } from "../calls/types";
import { fixLocalOffer, getStream, parseMediaSectionInfo } from "../calls/utils";
import { Logger, logger } from "../logger";
import apiManager from "../mtproto/mtprotoworker";
import { NULL_PEER_ID } from "../mtproto/mtproto_config";
import rootScope from "../rootScope";
import apiUpdatesManager from "./apiUpdatesManager";
import appChatsManager from "./appChatsManager";
import appPeersManager from "./appPeersManager";
import appUsersManager from "./appUsersManager";

export type GroupCallId = GroupCall['id'];
export type MyGroupCall = GroupCall | InputGroupCall;

export type ConnectionType = 'main' | 'presentation';

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

const ASSETS_PATH = 'assets/audio/';

const GET_PARTICIPANTS_LIMIT = 100;

let IS_MUTED = true;

export function processMediaSection(sdp: SDP, media: SDP['media'][0]) {
  const sectionInfo = parseMediaSectionInfo(sdp, media);

  const mediaType: Exclude<typeof media['mediaType'], 'application'> = media.mediaType as any;
  const entry: Ssrc = {
    source: sectionInfo.source,
    sourceGroups: sectionInfo.sourceGroups,
    type: mediaType
  };

  // do not change this value, otherwise onconnectionstatechange won't fire
  sectionInfo.fingerprint.setup = 'active';
  const payload: JoinGroupCallJsonPayload = {
    fingerprints: [sectionInfo.fingerprint],
    pwd: sectionInfo.pwd,
    ssrc: sectionInfo.source,
    'ssrc-groups': sectionInfo.sourceGroups || [],
    ufrag: sectionInfo.ufrag
  };
  const paramsDataJson = JSON.stringify(payload);

  const params: DataJSON = {
    _: 'dataJSON',
    data: paramsDataJson
  };

  return {
    params, 
    source: sectionInfo.source, 
    media, 
    sourceGroups: sectionInfo.sourceGroups, 
    entry
  };
}

export function filterServerCodecs(mainChannels: SDPMediaSection[], data: UpdateGroupCallConnectionData) {
  // ! Need to filter server's extmap for Firefox
  const performExtmap = (channel: typeof mainChannels[0]) => {
    const out: {[id: string]: string} = {};
    const extmap = channel.attributes.get('extmap');
    extmap.forEach((extmap) => {
      const id = extmap.key.split('/', 1)[0];
      out[id] = extmap.value;
    });

    return out;
  };

  const codecsToPerform: [Codec, 'audio' | 'video'][] = /* flatten([data, dataPresentation].filter(Boolean).map(data => {
    return  */['audio' as const, 'video' as const].filter(type => data[type]).map(type => ([data[type], type]));
  // }));

  codecsToPerform.forEach(([codec, type]) => {
    const channel = mainChannels.find(line => line.mediaType === type);
    if(!channel) {
      return;
    }

    const extmap = performExtmap(channel);
    forEachReverse(codec["rtp-hdrexts"], (value, index, arr) => {
      if(extmap[value.id] !== value.uri) {
        arr.splice(index, 1);
        console.log(`[sdp] filtered extmap:`, value, index, type);
      }
    });
  });
}

export async function getScreenStream() {
  const options: DisplayMediaStreamConstraints = {
    video: {
      // @ts-ignore
      // cursor: 'always',
      width: {max: 1920},
      height: {max: 1080},
      frameRate: {max: 30}
    },
    audio: true
  };

  const screenStream = await navigator.mediaDevices.getDisplayMedia(options);

  return screenStream;
}

export function createPeerConnection(log?: Logger) {
  if(!log) {
    log = logger('RTCPeerConnection');
  }

  log('constructor');

  const options = {
    optional: [
      {googHighStartBitrate: true}, 
      {googHighBitrate: true}, 
      {googPayloadPadding: true}, 
      {googSkipEncodingUnusedStreams: true}, 
      {googScreencastMinBitrate: 100}, 
      {googVeryHighBitrate: true}, 
      {googDscp: true}
    ]
  };

  const config: RTCConfiguration = { 
    iceServers: [], 
    iceTransportPolicy: 'all', 
    bundlePolicy: 'max-bundle', 
    rtcpMuxPolicy: 'require', 
    iceCandidatePoolSize: 0, 
    // sdpSemantics: "unified-plan", 
    // extmapAllowMixed: true,
  };

  // @ts-ignore
  const connection = new RTCPeerConnection(config/* , options */);
  connection.addEventListener('track', (event) => {
    log('ontrack', event);
  });
  connection.addEventListener('signalingstatechange', () => {
    log('onsignalingstatechange', connection.signalingState);
  });
  connection.addEventListener('connectionstatechange', () => {
    log('onconnectionstatechange', connection.connectionState);
  });
  connection.addEventListener('negotiationneeded', () => { // * will be fired every time input device changes
    log('onnegotiationneeded', connection.signalingState);
  });
  connection.addEventListener('icecandidate', (event) => {
    log('onicecandidate', event);
  });
  connection.addEventListener('iceconnectionstatechange', () => {
    log('oniceconnectionstatechange', connection.iceConnectionState);
  });
  connection.addEventListener('datachannel', () => {
    log('ondatachannel');
  });

  connection.log = log;

  return {connection};
}

export function createDataChannel(connection: RTCPeerConnection, log?: Logger) {
  // return;

  if(!log) {
    log = logger('RTCDataChannel');
  }

  const channel = connection.createDataChannel('data', {
    /* id: 0,
    negotiated: true */
  });

  channel.addEventListener('message', (e) => {
    log('onmessage', e);
    // const {data} = e;
    // this.p2pApplyCallDataChannelData(JSON.parse(data));
  });
  channel.addEventListener('open', () => {
    log('onopen');

    /* const { currentCall } = this;
    if (!currentCall) return;

    const { callId } = currentCall;

    const mediaState = this.p2pGetMediaState(callId, 'input');
    if (!mediaState) return;

    this.p2pSendMediaState(callId, mediaState); */
  });
  channel.addEventListener('close', () => {
    log('onclose');
  });

  channel.log = log;

  return channel;
}

export type GroupCallOutputSource = 'main' | 'presentation' | number;

export class GroupCallInstance {
  public id: GroupCallId;
  public chatId: ChatId;
  public handleUpdateGroupCallParticipants: boolean;
  public updatingSdp: boolean;
  public isSpeakingMap: Map<any, any>;
  public connections: {[k in ConnectionType]?: GroupCallConnectionInstance};
  public groupCall: GroupCall;
  public participant: GroupCallParticipant;
  public log: ReturnType<typeof logger>;
  
  // will be set with negotiation
  public joined: boolean;
  
  private outputDeviceId: string;

  private player: HTMLElement;
  private elements: Map<string, HTMLMediaElement>;

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

    const player = this.player = document.createElement('div');
    player.classList.add('group-call-player');
    player.style.display = 'none';
    player.dataset.groupCallId = '' + this.id;
    document.body.append(player);

    this.elements = new Map();
    this.pinnedSources = [];
    this.participantsSsrcs = new Map();
    this.hadAutoPinnedSources = new Set();
    this.dispatchPinnedThrottled = throttle(() => {
      rootScope.dispatchEvent('group_call_pinned', {instance: this, source: this.pinnedSource});
    }, 0, false);

    // possible Safari fix
    const audio = new Audio();
    audio.play().catch(noop);
    audio.autoplay = true;
    audio.volume = 1.0;
    this.player.append(audio);
    this.elements.set('audio', audio);
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

  get isSharingAudio() {
    return !!this.connections.main.streamManager.hasInputTrackKind('audio');
  }

  get isSharingScreen() {
    return !!this.connections.presentation;
  }

  get isSharingVideo() {
    return !!this.connections.main.streamManager.hasInputTrackKind('video');
  }

  get pinnedSource() {
    return this.pinnedSources[this.pinnedSources.length - 1];
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
    return appGroupCallsManager.toggleMuted();
  }

  public getElement(endpoint: GroupCallOutputSource) {
    return this.elements.get('' + endpoint);
  }

  public getVideoElementFromParticipantByType(participant: GroupCallParticipant, type: 'video' | 'presentation') {
    let source: GroupCallOutputSource;
    if(participant.pFlags.self) {
      const connectionType: ConnectionType = type === 'video' ? 'main' : 'presentation';
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
    type: ConnectionType,
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
      const type: ConnectionType = 'presentation';

      const stream = await getScreenStream();
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
      video: appGroupCallsManager.getVideoConstraints()
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

    connectionInstance.stopTrack(track);
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
      const connection = this.connections[type as ConnectionType];
      connection.closeConnectionAndStream(!rejoin);
    }

    rootScope.dispatchEvent('group_call_state', this);

    this.player.textContent = '';
    this.player.remove();

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

  public onTrack(event: RTCTrackEvent) {
    this.tryAddTrack(event.streams[0], event.track, 'output');
  }

  public saveInputVideoStream(stream: MediaStream, type: ConnectionType) {
    const track = stream.getVideoTracks()[0];
    this.tryAddTrack(stream, track, 'input', type);
  }

  public tryAddTrack(stream: MediaStream, track: MediaStreamTrack, type: StreamItem['type'], source: string = StreamManager.getSource(stream, type)) {
    this.log('tryAddTrack', stream, track, type, source);

    const isOutput = type === 'output';

    const {connections, player, elements} = this;
    const {streamManager, description} = connections.main;
    
    const tagName = track.kind as StreamItem['kind'];
    const isVideo = tagName === 'video';

    const elementEndpoint = isVideo ? source : tagName;
    let element = elements.get(elementEndpoint);

    if(isVideo) {
      track.addEventListener('ended', () => {
        this.log('[track] onended');
        elements.delete(elementEndpoint);
        // element.remove();
      }, {once: true});
    }
    
    if(isOutput) {
      streamManager.addTrack(stream, track, type);
    }

    const useStream = isVideo ? stream : streamManager.outputStream;
    if(!element) {
      element = document.createElement(tagName);
      element.autoplay = true;
      element.srcObject = useStream;
      element.volume = 1.0;

      if((element as any).sinkId !== 'undefined') {
        const {outputDeviceId} = this;
        if(outputDeviceId) {
          (element as any).setSinkId(outputDeviceId);
        }
      }
      
      if(!isVideo) {
        player.appendChild(element);
      }
      // audio.play();

      elements.set(elementEndpoint, element);
    } else {
      if(element.paused) {
        element.play().catch(noop);
      }

      if(element.srcObject !== useStream) {
        element.srcObject = useStream;
      }
    }

    if(isOutput) {
      const entry = description.getEntryBySource(+source);
      const participant = this.participants.get(entry.peerId);
      if(participant) {
        rootScope.dispatchEvent('group_call_participant', {groupCallId: this.id, participant});
      }
    }
  }

  public setMuted(muted: boolean) {
    this.connections.main.connection.getSenders().forEach(({track}) => {
      if(track?.kind === 'audio') {
        track.enabled = !muted;
      }
    });
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
        rootScope.dispatchEvent('group_call_state', this);
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

export class GroupCallConnectionInstance {
  private groupCall: GroupCallInstance;
  public connection: RTCPeerConnection;
  public streamManager: StreamManager;
  private dataChannel: RTCDataChannel;
  public description: LocalConferenceDescription;
  public sources?: {
    audio: Ssrc,
    video?: Ssrc,
  };
  private negotiating?: boolean;
  public updateConstraints?: boolean;
  private type: ConnectionType;
  private log: ReturnType<typeof logger>;
  private options: {
    type: Extract<ConnectionType, 'main'>, 
    isMuted?: boolean, 
    joinVideo?: boolean, 
    rejoin?: boolean
  } | {
    type: Extract<ConnectionType, 'presentation'>,
  };

  private updateConstraintsInterval: number;
  public negotiateThrottled: () => void;

  constructor(options: {
    groupCall: GroupCallConnectionInstance['groupCall'],
    streamManager: GroupCallConnectionInstance['streamManager'],
    type: GroupCallConnectionInstance['type'],
    options: GroupCallConnectionInstance['options'],
    connection?: GroupCallConnectionInstance['connection'],
    log?: GroupCallConnectionInstance['log']
  }) {
    safeAssign(this, options);

    if(!this.log) {
      this.log = this.connection?.log || logger('GC-CONNECTION');
    }

    this.sources = {} as any;

    this.negotiateThrottled = throttle(this.negotiate.bind(this), 0, false);
  }

  public createPeerConnection() {
    return this.connection || (this.connection = createPeerConnection(this.log.bindPrefix('connection')).connection);
  }

  public createDataChannel() {
    if(this.dataChannel) {
      return this.dataChannel;
    }

    const dataChannel = createDataChannel(this.connection, this.log.bindPrefix('data'));

    dataChannel.addEventListener('open', () => {
      this.maybeUpdateRemoteVideoConstraints();
    });

    dataChannel.addEventListener('close', () => {
      if(this.updateConstraintsInterval) {
        clearInterval(this.updateConstraintsInterval);
        this.updateConstraintsInterval = undefined;
      }
    });

    return this.dataChannel = dataChannel;
  }

  public createDescription() {
    if(this.description) {
      return this.description;
    }

    const description = this.description = new LocalConferenceDescription(this.connection);

    /* const perType = 0;
    const types = ['audio' as const, 'video' as const];
    const count = types.length * perType;
    const init: RTCRtpTransceiverInit = {direction: 'recvonly'};
    types.forEach(type => {
      for(let i = 0; i < perType; ++i) {
        description.createEntry(type).createTransceiver(connection, init);
      }
    }); */

    return description;
  }

  public appendStreamToConference() {
    this.streamManager.appendToConference(this.description);/* .then(() => {
      currentGroupCall.connections.main.negotiating = false;
      this.startNegotiation({
        type: type,
        isMuted: muted,
        rejoin
      });
    }); */
  }

  private async invokeJoinGroupCall(localSdp: SDP, mainChannels: SDPMediaSection[], options: GroupCallConnectionInstance['options']) {
    const {groupCall, description} = this;
    const groupCallId = groupCall.id;

    const processedChannels = mainChannels.map(section => {
      const processed = processMediaSection(localSdp, section);

      this.sources[processed.entry.type as 'video' | 'audio'] = processed.entry;
      
      return processed;
    });

    let promise: Promise<Updates>;
    const audioChannel = processedChannels.find(channel => channel.media.mediaType === 'audio');
    const videoChannel = processedChannels.find(channel => channel.media.mediaType === 'video');
    let {source, params} = audioChannel || {};
    const useChannel = videoChannel || audioChannel;

    const channels: {[type in WebRTCLineType]?: typeof audioChannel} = {
      audio: audioChannel,
      video: videoChannel
    };

    description.entries.forEach(entry => {
      if(entry.direction === 'sendonly') {
        const channel = channels[entry.type];
        if(!channel) return;

        description.setEntrySource(entry, channel.sourceGroups || channel.source);
        description.setEntryPeerId(entry, rootScope.myId);
      }
    });

    // overwrite ssrc with audio in video params
    if(params !== useChannel.params) {
      const data: JoinGroupCallJsonPayload = JSON.parse(useChannel.params.data);
      // data.ssrc = source || data.ssrc - 1; // audio channel can be missed in screensharing
      if(source) data.ssrc = source;
      else delete data.ssrc;
      params = {
        _: 'dataJSON',
        data: JSON.stringify(data)
      };
    }
    
    const groupCallInput = appGroupCallsManager.getGroupCallInput(groupCallId);
    if(options.type === 'main') {
      const request: PhoneJoinGroupCall = {
        call: groupCallInput,
        join_as: {_: 'inputPeerSelf'},
        params,
        muted: options.isMuted,
        video_stopped: !options.joinVideo
      };

      promise = apiManager.invokeApi('phone.joinGroupCall', request);
      this.log(`[api] joinGroupCall id=${groupCallId}`, request);
    } else {
      const request: PhoneJoinGroupCallPresentation = {
        call: groupCallInput,
        params,
      };

      promise = apiManager.invokeApi('phone.joinGroupCallPresentation', request);
      this.log(`[api] joinGroupCallPresentation id=${groupCallId}`, request);
    }

    const updates = await promise;
    apiUpdatesManager.processUpdateMessage(updates);
    const update = (updates as Updates.updates).updates.find(update => update._ === 'updateGroupCallConnection') as Update.updateGroupCallConnection;

    const data: UpdateGroupCallConnectionData = JSON.parse(update.params.data);

    data.audio = data.audio || groupCall.connections.main.description.audio;
    description.setData(data);
    filterServerCodecs(mainChannels, data);

    return data;
  }

  public async negotiate() {
    const {groupCall, connection, description} = this;
    const {id: groupCallId} = groupCall;

    if(this.negotiating) {
      return;
    }

    this.negotiating = true;

    const isNewConnection = connection.iceConnectionState === 'new' && !description.getEntryByMid('0').source;
    const log = this.log.bindPrefix('startNegotiation');
    log('start');
    
    const originalOffer = await connection.createOffer({iceRestart: false});

    if(isNewConnection && this.dataChannel) {
      const dataChannelEntry = description.createEntry('application');
      dataChannelEntry.setDirection('sendrecv');
    }

    const {sdp: localSdp, offer} = fixLocalOffer({
      offer: originalOffer, 
      data: description
    });

    log('[sdp] setLocalDescription', offer.sdp);
    await connection.setLocalDescription(offer);

    const mainChannels = localSdp.media.filter(media => {
      return media.mediaType !== 'application' && media.isSending;
    });

    if(isNewConnection) {
      try {
        await this.invokeJoinGroupCall(localSdp, mainChannels, this.options);
      } catch(e) {
        this.log.error('[tdweb] joinGroupCall error', e);
      }
    }
    
    /* if(!data) {
      log('abort 0');
      this.closeConnectionAndStream(connection, streamManager);
      return;
    } */

    /* if(connection.iceConnectionState !== 'new') {
      log(`abort 1 connectionState=${connection.iceConnectionState}`);
      this.closeConnectionAndStream(connection, streamManager);
      return;
    } */
    /* if(this.currentGroupCall !== currentGroupCall || connectionHandler.connection !== connection) {
      log('abort', this.currentGroupCall, currentGroupCall);
      this.closeConnectionAndStream(connection, streamManager);
      return;
    } */
    
    const isAnswer = true;
    // const _bundleMids = bundleMids.slice();
    const entriesToDelete: ConferenceEntry[] = [];
    const bundle = localSdp.bundle;
    forEachReverse(bundle, (mid, idx, arr) => {
      const entry = description.getEntryByMid(mid);
      if(entry.shouldBeSkipped(isAnswer)) {
        arr.splice(idx, 1);
        entriesToDelete.push(entry);
      }
    });

    /* forEachReverse(description.entries, (entry, idx, arr) => {
      const mediaSection = _parsedSdp.media.find(section => section.oa.get('mid').oa === entry.mid);
      const deleted = !mediaSection;
      // const deleted = !_bundleMids.includes(entry.mid); // ! can't use it because certain mid can be missed in bundle
      if(deleted) {
        arr.splice(idx, 1);
      }
    }); */

    const entries = localSdp.media.map((section) => {
      const mid = section.mid;
      let entry = description.getEntryByMid(mid);
      if(!entry) {
        entry = new ConferenceEntry(mid, section.mediaType);
        entry.setDirection('inactive');
      }

      return entry;
    });

    const answerDescription: RTCSessionDescriptionInit = {
      type: 'answer',
      sdp: description.generateSdp({
        bundle, 
        entries, 
        isAnswer
      })
    };

    entriesToDelete.forEach(entry => {
      description.deleteEntry(entry);
    });

    log(`[sdp] setRemoteDescription signaling=${connection.signalingState} ice=${connection.iceConnectionState} gathering=${connection.iceGatheringState} connection=${connection.connectionState}`, answerDescription.sdp);
    await connection.setRemoteDescription(answerDescription);

    this.negotiating = false;

    if(this.updateConstraints) {
      this.maybeUpdateRemoteVideoConstraints();
      this.updateConstraints = false;
    }

    log('end', groupCallId);
  }

  public maybeUpdateRemoteVideoConstraints() {
    if(this.dataChannel.readyState !== 'open') {
      return;
    }

    this.log('maybeUpdateRemoteVideoConstraints');
    
    // * https://github.com/TelegramMessenger/tgcalls/blob/6f2746e04c9b040f8c8dfc64d916a1853d09c4ce/tgcalls/group/GroupInstanceCustomImpl.cpp#L2549
    type VideoConstraints = {minHeight?: number, maxHeight: number};
    const obj: {
      colibriClass: 'ReceiverVideoConstraints',
      constraints: {[endpoint: string]: VideoConstraints},
      defaultConstraints: VideoConstraints,
      onStageEndpoints: string[]
    } = {
      colibriClass: 'ReceiverVideoConstraints',
      constraints: {},
      defaultConstraints: {maxHeight: 0},
      onStageEndpoints: []
    };

    for(const entry of this.description.entries) {
      if(entry.direction !== 'recvonly' || entry.type !== 'video') {
        continue;
      }

      const {endpoint} = entry;
      obj.onStageEndpoints.push(endpoint);
      obj.constraints[endpoint] = {
        minHeight: 180,
        maxHeight: 720
      };
    }

    this.dataChannel.send(JSON.stringify(obj));

    if(!obj.onStageEndpoints.length) {
      if(this.updateConstraintsInterval) {
        clearInterval(this.updateConstraintsInterval);
        this.updateConstraintsInterval = undefined;
      }
    } else if(!this.updateConstraintsInterval) {
      this.updateConstraintsInterval = window.setInterval(this.maybeUpdateRemoteVideoConstraints.bind(this), 5000);
    }
  }
  
  public addInputVideoStream(stream: MediaStream) {
    // const {sources} = this;
    // if(sources?.video) {
      // const source = this.sources.video.source;
      // stream.source = '' + source;
      this.groupCall.saveInputVideoStream(stream, this.type);
    // }

    this.streamManager.addStream(stream, 'input');
    this.appendStreamToConference(); // replace sender track
  }

  public closeConnection() {
    const {connection} = this;
    if(!connection) {
      return;
    }

    try {
      connection.log('close');
      connection.close();
    } catch(e) {
      this.log.error(e);
    }
  }

  public stopTrack(track: MediaStreamTrack) {
    track.stop();
    simulateEvent(track, 'ended');
  }

  public stopStreamManager() {
    const {streamManager} = this;
    if(!streamManager) {
      return;
    }

    try {
      const tracks = streamManager.inputStream.getTracks().concat(streamManager.outputStream.getTracks());
      tracks.forEach(track => {
        this.stopTrack(track);
      });
    } catch(e) {
      this.log.error(e);
    }
  }

  public closeConnectionAndStream(stopStream: boolean) {
    this.closeConnection();
    stopStream && this.stopStreamManager();
  }
}

export class AppGroupCallsManager {
  private log: ReturnType<typeof logger>;
  
  private groupCalls: Map<GroupCallId, MyGroupCall>;
  private participants: Map<GroupCallId, Map<PeerId, GroupCallParticipant>>;
  private nextOffsets: Map<GroupCallId, string>;
  
  private audio: HTMLAudioElement;
  
  private currentGroupCall: GroupCallInstance;
  private connectionAudio: HTMLAudioElement;
  private doNotDispatchParticipantUpdate: PeerId;

  constructor() {
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

    rootScope.addEventListener('group_call_state', (instance) => {
      if(this.currentGroupCall?.id === instance.id && instance.state === GROUP_CALL_STATE.CLOSED) {
        this.setCurrentGroupCall(null);
        this.stopConnectingSound(null);
        this.playSound('group_call_end.mp3');
        rootScope.dispatchEvent('chat_update', instance.chatId);
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

    const peerId = appPeersManager.getPeerId(participant.peer);

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

        rootScope.dispatchEvent('group_call_state', currentGroupCall);
      }

      rootScope.dispatchEvent('group_call_participant', {groupCallId, participant});

      /* if(participant.pFlags.self) {
        processUpdate = false;
      } */
    }

    const peerId = participant.pFlags.self ? NULL_PEER_ID : appPeersManager.getPeerId(participant.peer);
    const updates = await apiManager.invokeApiSingle('phone.editGroupCallParticipant', {
      call: appGroupCallsManager.getGroupCallInput(groupCallId),
      participant: peerId === NULL_PEER_ID ? appPeersManager.getInputPeerSelf() : appPeersManager.getInputPeerById(peerId),
      muted: options.muted,
      volume: options.volume,
      raise_hand: options.raiseHand,
      video_paused: options.videoPaused,
      video_stopped: options.videoStopped,
      presentation_paused: options.presentationPaused
    });
    
    // do not replace with peerId because it can be null
    if(!processUpdate) this.doNotDispatchParticipantUpdate = appPeersManager.getPeerId(participant.peer);
    apiUpdatesManager.processUpdateMessage(updates);
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
        appUsersManager.saveApiUsers(groupCall.users);
        appChatsManager.saveApiChats(groupCall.chats);
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
  
  public playSound(sound: string) {
    try {
      const audio = this.audio || (this.audio = new Audio());
      audio.src = ASSETS_PATH + sound;
      audio.play();
    } catch(e) {
      this.log.error('playSound', sound, e);
    }
  }
  
  public startConnectingSound(connection: RTCPeerConnection) {
    this.stopConnectingSound(null);
    
    setTimeout(() => {
      const {currentGroupCall} = this;
      if(currentGroupCall && 
        currentGroupCall.connections.main.connection === connection && 
        (connection.iceConnectionState === 'checking' || connection.iceConnectionState === 'new') &&
        this.connectionAudio?.connection !== connection) {
        const audio = new Audio(ASSETS_PATH + 'group_call_connect.mp3');
        audio.loop = true;
        audio.connection = connection;
        
        this.connectionAudio = audio;
        
        audio.play();
      }
    }, 2500);
  }
  
  public stopConnectingSound(connection: RTCPeerConnection) {
    const {connectionAudio} = this;
    if(connectionAudio?.connection !== connection) return;
    
    this.connectionAudio = null;
    connectionAudio.pause();
  }

  public setCurrentGroupCall(groupCall: GroupCallInstance) {
    this.currentGroupCall = groupCall;
    /* TdLibController.clientUpdate({
      '@type': 'clientUpdateGroupCall',
      call
    }); */
  }

  public getVideoConstraints(): MediaTrackConstraints {
    return {
      width: {min: 1280, max: 1920/* , ideal: 1920 */},
      height: {min: 720, max: 1080/* , ideal: 1080 */},
      frameRate: {min: 24, max: 30}
    };
  }

  public getAudioConstraints(): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {
      channelCount: 2
    };

    const desirable: (keyof MyMediaTrackSupportedConstraints)[] = [
      'noiseSuppression',
      'echoCancellation',
      'autoGainControl'
    ];

    desirable.forEach(constraint => {
      if(constraintSupported(constraint)) {
        // @ts-ignore
        constraints[constraint] = true;
      }
    });

    return constraints;
  }

  public async createGroupCall(chatId: ChatId, scheduleDate?: number, title?: string) {
    const updates = await apiManager.invokeApi('phone.createGroupCall', {
      peer: appPeersManager.getInputPeerById(chatId.toPeerId(true)),
      random_id: nextRandomUint(32),
      schedule_date: scheduleDate,
      title
    });

    apiUpdatesManager.processUpdateMessage(updates);

    const update = (updates as Updates.updates).updates.find(update => update._ === 'updateGroupCall') as Update.updateGroupCall;
    return update.call;
  }
  
  public async joinGroupCall(chatId: ChatId, groupCallId: GroupCallId, muted = IS_MUTED, rejoin?: boolean, joinVideo?: boolean) {
    if(!this.audio) {
      this.audio = new Audio();
      this.audio.play();
    }

    this.log(`joinGroupCall chatId=${chatId} id=${groupCallId} muted=${muted} rejoin=${rejoin}`);
    
    let streamManager: StreamManager;
    if(rejoin) {
      streamManager = this.currentGroupCall.connections.main.streamManager;
    } else {
      const constraints: MediaStreamConstraints = {
        audio: this.getAudioConstraints(),
        video: joinVideo && this.getVideoConstraints()
      };

      streamManager = new StreamManager(GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS);
      
      try {
        const stream = await getStream(constraints, muted);
        streamManager.addStream(stream, 'input');
      } catch(err) {
        this.log.error('joinGroupCall getStream error', err, constraints);
        streamManager.inputStream = new MediaStream();
      }
    }

    return this.joinGroupCallInternal(chatId, groupCallId, streamManager, muted, rejoin, joinVideo);
  }

  public async joinGroupCallInternal(chatId: ChatId, groupCallId: GroupCallId, streamManager: StreamManager, muted: boolean, rejoin = false, joinVideo?: boolean) {
    const log = this.log.bindPrefix('joinGroupCallInternal');
    log('start', groupCallId);

    const type: ConnectionType = 'main';

    let {currentGroupCall} = this;
    if(currentGroupCall && rejoin) {
      // currentGroupCall.connections.main.connection = connection;
      currentGroupCall.handleUpdateGroupCallParticipants = false;
      currentGroupCall.updatingSdp = false;
      log('update currentGroupCall', groupCallId, currentGroupCall);
    } else {
      currentGroupCall = new GroupCallInstance({
        chatId,
        id: groupCallId
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
        if(!rejoin) {
          this.startConnectingSound(connection);
        }
  
        connectionInstance.negotiate();
      });

      connection.addEventListener('track', (event) => {
        log('ontrack', event);
        currentGroupCall.onTrack(event);
      });
  
      connection.addEventListener('iceconnectionstatechange', () => {
        rootScope.dispatchEvent('group_call_state', currentGroupCall);
        
        const {iceConnectionState} = connection;
        if(iceConnectionState !== 'connected' && iceConnectionState !== 'closed') {
          this.stopConnectingSound(connection);
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
            const {currentGroupCall} = this;
            if(currentGroupCall && currentGroupCall.connections.main.connection === connection && !currentGroupCall.joined) {
              currentGroupCall.joined = true;
              this.playSound('group_call_start.mp3');
  
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
      peer: appPeersManager.getOutputPeer(rootScope.myId)
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
  
          appChatsManager.saveApiChats(groupCallParticipants.chats);
          appUsersManager.saveApiUsers(groupCallParticipants.users);
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

  // private attachScreenStream(screenStream: MediaStream, connection: RTCPeerConnection) {
  //   let replaced = false;
  //   /* connection.getSenders().forEach(x => {
  //       if (x.track.kind === 'video') {
  //           x.replaceTrack(screenStream.getVideoTracks()[0]);
  //           replaced = true;
  //       }
  //   }); */
  //   if(!replaced) {
  //     screenStream.getTracks().forEach(track => {
  //       connection.addTrack(track, screenStream);
  //     });
  //   }

  //   /* const inputMediaState = this.p2pGetMediaState(id, 'input');
  //   if (inputMediaState && inputMediaState.videoState !== 'active') {
  //       this.p2pVideoEnabled(true);
  //   } */
  // }

  /* public async stopScreenSharing() {
    const { currentCall } = this;
    if (!currentCall) return;

    const { connection, inputStream, screenStream } = currentCall;
    if (!connection) return;
    if (!screenStream) return;

    const videoTracks = inputStream.getVideoTracks();
    const videoTrack = videoTracks.length > 0 ? videoTracks[0] : null

    connection.getSenders().forEach(x => {
        if (x.track.kind === 'video') {
            x.replaceTrack(videoTrack);
        }
    })

    screenStream.getTracks().forEach(x => {
        x.stop();
    });

    const inputVideo = document.getElementById('call-input-video');
    if (inputVideo) {
        inputVideo.srcObject = inputStream;
    }

    currentCall.screenStream = null;

    if (!videoTrack || videoTrack.readyState !== 'live') {
        this.p2pVideoEnabled(false);
    }
  } */
}

const appGroupCallsManager = new AppGroupCallsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appGroupCallsManager = appGroupCallsManager);
export default appGroupCallsManager;
