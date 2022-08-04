/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import forEachReverse from '../../helpers/array/forEachReverse';
import throttle from '../../helpers/schedulers/throttle';
import {GroupCallConnectionType, JoinGroupCallJsonPayload} from '../appManagers/appGroupCallsManager';
import {AppManagers} from '../appManagers/managers';
import rootScope from '../rootScope';
import CallConnectionInstanceBase, {CallConnectionInstanceOptions} from './callConnectionInstanceBase';
import GroupCallInstance from './groupCallInstance';
import filterServerCodecs from './helpers/filterServerCodecs';
import fixLocalOffer from './helpers/fixLocalOffer';
import processMediaSection from './helpers/processMediaSection';
import {ConferenceEntry} from './localConferenceDescription';
import SDP from './sdp';
import SDPMediaSection from './sdp/mediaSection';
import {WebRTCLineType} from './sdpBuilder';
import {UpdateGroupCallConnectionData} from './types';

export default class GroupCallConnectionInstance extends CallConnectionInstanceBase {
  private groupCall: GroupCallInstance;
  public updateConstraints?: boolean;
  private type: GroupCallConnectionType;
  private options: {
    type: Extract<GroupCallConnectionType, 'main'>,
    isMuted?: boolean,
    joinVideo?: boolean,
    rejoin?: boolean
  } | {
    type: Extract<GroupCallConnectionType, 'presentation'>,
  };

  private updateConstraintsInterval: number;
  public negotiateThrottled: () => void;

  private managers: AppManagers;

  constructor(options: CallConnectionInstanceOptions & {
    groupCall: GroupCallConnectionInstance['groupCall'],
    type: GroupCallConnectionInstance['type'],
    options: GroupCallConnectionInstance['options'],
    managers: AppManagers
  }) {
    super(options);

    this.negotiateThrottled = throttle(this.negotiate.bind(this), 0, false);
  }

  public createPeerConnection() {
    return this.connection || super.createPeerConnection({
      iceServers: [],
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 0
      // sdpSemantics: "unified-plan",
      // extmapAllowMixed: true,
    });
  }

  public createDataChannel() {
    if(this.dataChannel) {
      return this.dataChannel;
    }

    const dataChannel = super.createDataChannel();

    dataChannel.addEventListener('open', () => {
      this.maybeUpdateRemoteVideoConstraints();
    });

    dataChannel.addEventListener('close', () => {
      if(this.updateConstraintsInterval) {
        clearInterval(this.updateConstraintsInterval);
        this.updateConstraintsInterval = undefined;
      }
    });

    return dataChannel;
  }

  public createDescription() {
    if(this.description) {
      return this.description;
    }

    const description = super.createDescription();

    /* const perType = 0;
    const types = ['audio' as const, 'video' as const];
    const count = types.length * perType;
    const init: RTCRtpTransceiverInit = {direction: 'recvonly'};
    types.forEach((type) => {
      for(let i = 0; i < perType; ++i) {
        description.createEntry(type).createTransceiver(connection, init);
      }
    }); */

    return description;
  }

  public appendStreamToConference() {
    super.appendStreamToConference();/* .then(() => {
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

    const processedChannels = mainChannels.map((section) => {
      const processed = processMediaSection(localSdp, section);

      this.sources[processed.entry.type as 'video' | 'audio'] = processed.entry;

      return processed;
    });

    const audioChannel = processedChannels.find((channel) => channel.media.mediaType === 'audio');
    const videoChannel = processedChannels.find((channel) => channel.media.mediaType === 'video');
    let {source, params} = audioChannel || {};
    const useChannel = videoChannel || audioChannel;

    const channels: {[type in WebRTCLineType]?: typeof audioChannel} = {
      audio: audioChannel,
      video: videoChannel
    };

    description.entries.forEach((entry) => {
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

    const update = await this.managers.appGroupCallsManager.joinGroupCall(groupCallId, params, options);

    const data: UpdateGroupCallConnectionData = JSON.parse(update.params.data);

    data.audio = data.audio || groupCall.connections.main.description.audio;
    description.setData(data);
    filterServerCodecs(mainChannels, data);

    return data;
  }

  protected async negotiateInternal() {
    const {connection, description} = this;
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

    const mainChannels = localSdp.media.filter((media) => {
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
      const mediaSection = _parsedSdp.media.find((section) => section.oa.get('mid').oa === entry.mid);
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

    entriesToDelete.forEach((entry) => {
      description.deleteEntry(entry);
    });

    log(`[sdp] setRemoteDescription signaling=${connection.signalingState} ice=${connection.iceConnectionState} gathering=${connection.iceGatheringState} connection=${connection.connectionState}`, answerDescription.sdp);
    await connection.setRemoteDescription(answerDescription);

    log('end');
  }

  public negotiate() {
    let promise = this.negotiating;
    if(promise) {
      return promise;
    }

    promise = super.negotiate();

    if(this.updateConstraints) {
      promise.then(() => {
        this.maybeUpdateRemoteVideoConstraints();
        this.updateConstraints = false;
      });
    }

    if(this.options.type === 'presentation') {
      promise.then(() => {
        this.connection.getTransceivers().find((transceiver) => {
          if(transceiver.sender?.track?.kind === 'video') {
            transceiver.sender.setParameters({
              ...transceiver.sender.getParameters(),
              degradationPreference: 'maintain-resolution'
            });
          }
        });
      });
    }

    return promise;
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

    this.sendDataChannelData(obj);

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
}
