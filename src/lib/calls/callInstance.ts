/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ctx from '../../environment/ctx';
import {IS_SAFARI} from '../../environment/userAgent';
import assumeType from '../../helpers/assumeType';
import safeAssign from '../../helpers/object/safeAssign';
import debounce from '../../helpers/schedulers/debounce';
import {GroupCallParticipantVideoSourceGroup, PhoneCall, PhoneCallDiscardReason, PhoneCallProtocol, Update} from '../../layer';
import {emojiFromCodePoints} from '../../vendor/emoji';
import type {AppCallsManager, CallId} from '../appManagers/appCallsManager';
import type {AppManagers} from '../appManagers/managers';
import {logger} from '../logger';
import apiManagerProxy from '../mtproto/mtprotoworker';
import CallConnectionInstance from './callConnectionInstance';
import CallInstanceBase from './callInstanceBase';
import callsController from './callsController';
import CALL_STATE from './callState';
import {GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS} from './constants';
import parseSignalingData from './helpers/parseSignalingData';
import stopTrack from './helpers/stopTrack';
import localConferenceDescription, {ConferenceEntry, generateSsrc} from './localConferenceDescription';
import getCallProtocol from './p2P/getCallProtocol';
import getRtcConfiguration from './p2P/getRtcConfiguration';
import P2PEncryptor from './p2P/p2PEncryptor';
import {p2pParseCandidate, P2PSdpBuilder} from './p2P/p2PSdpBuilder';
import {parseSdp} from './sdp/utils';
import {WebRTCLineType} from './sdpBuilder';
import StreamManager from './streamManager';
import {AudioCodec, CallMediaState, CallSignalingData, DiffieHellmanInfo, P2PAudioCodec, P2PVideoCodec, VideoCodec} from './types';

export default class CallInstance extends CallInstanceBase<{
  state: (state: CALL_STATE) => void,
  id: (id: CallId, prevId: CallId) => void,
  muted: (muted: boolean) => void,
  mediaState: (mediaState: CallMediaState) => void,
  acceptCallOverride: () => Promise<boolean>,
}> {
  public dh: Partial<DiffieHellmanInfo.a & DiffieHellmanInfo.b>;
  public id: CallId;
  public call: PhoneCall;
  public interlocutorUserId: UserId;
  public protocol: PhoneCallProtocol;
  public isOutgoing: boolean;
  public encryptionKey: Uint8Array;
  public connectionInstance: CallConnectionInstance;
  public encryptor: P2PEncryptor;
  public decryptor: P2PEncryptor;
  public candidates: RTCIceCandidate[];

  public offerReceived: boolean;
  public offerSent: boolean;

  public createdParticipantEntries: boolean;
  public release: () => Promise<void>;
  public _connectionState: CALL_STATE;

  public createdAt: number;
  public connectedAt: number;
  public discardReason: PhoneCallDiscardReason;

  private managers: AppManagers;

  private hangUpTimeout: number;

  private mediaStates: {
    input: CallMediaState,
    output?: CallMediaState
  };

  private sendMediaState: () => Promise<void>;

  private decryptQueue: Uint8Array[];

  private getEmojisFingerprintPromise: Promise<CallInstance['emojisFingerprint']>;
  private emojisFingerprint: [string, string, string, string];

  private wasStartingScreen: boolean;
  private wasStartingVideo: boolean;
  public wasTryingToJoin: boolean;

  public streamManager: StreamManager;

  constructor(options: {
    isOutgoing: boolean,
    interlocutorUserId: UserId,
    managers: CallInstance['managers'],
    protocol?: PhoneCallProtocol
  }) {
    super();

    this.log = logger('CALL');

    if(!this.protocol) {
      this.protocol = getCallProtocol();
    }

    safeAssign(this, options);

    this.createdAt = Date.now();
    this.offerReceived = false;
    this.offerSent = false;
    this.decryptQueue = [];
    this.candidates = [];

    this.addEventListener('state', (state) => {
      this.log('state', CALL_STATE[state]);

      if(state === CALL_STATE.CLOSED) {
        this.cleanup();
      }
    });

    const streamManager = this.streamManager = new StreamManager(GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS);
    streamManager.direction = 'sendrecv';
    streamManager.types.push('screencast');
    if(!this.isOutgoing) {
      streamManager.locked = true;
      streamManager.canCreateConferenceEntry = false;
    }

    let mediaState: CallMediaState = {
      '@type': 'MediaState',
      'type': 'input',
      'lowBattery': false,
      'muted': true,
      'screencastState': 'inactive',
      'videoRotation': 0,
      'videoState': 'inactive'
    };

    const self = this;
    mediaState = new Proxy(mediaState, {
      set: function(target, key, value) {
        // @ts-ignore
        target[key] = value;
        self.setMediaState(mediaState);
        self.sendMediaState();
        return true;
      }
    });

    this.mediaStates = {
      input: mediaState
    };

    this.sendMediaState = debounce(this._sendMediaState.bind(this), 0, false, true);
  }

  get connectionState() {
    const {_connectionState, connectionInstance} = this;
    if(_connectionState !== undefined) {
      return _connectionState;
    } else if(!connectionInstance) {
      return CALL_STATE.CONNECTING;
    } else {
      const {iceConnectionState} = connectionInstance.connection;
      if(iceConnectionState === 'closed') {
        return CALL_STATE.CLOSED;
      } else if(iceConnectionState !== 'connected' && (!IS_SAFARI || iceConnectionState !== 'completed')) {
        return CALL_STATE.CONNECTING;
      } else {
        return CALL_STATE.CONNECTED;
      }
    }
  }

  get sortIndex() {
    const connectionState = this.connectionState;
    const state = CALL_STATE.CLOSED - connectionState + 1;
    let index = state * 10000000000000;
    index += 2147483647000 - (connectionState === CALL_STATE.PENDING && this.isOutgoing ? 0 : this.createdAt);
    return index;
  }

  public getVideoElement(type: CallMediaState['type']) {
    if(type === 'input') return this.elements.get('main');
    else {
      const mediaState = this.getMediaState('output');
      if(!mediaState) {
        return;
      }

      const type: WebRTCLineType = mediaState.videoState === 'active' ? 'video' : (mediaState.screencastState === 'active' ? 'screencast' : undefined);
      if(!type) {
        return;
      }

      const entry = this.description.findEntry((entry) => entry.type === type);
      if(!entry) {
        return;
      }

      return this.elements.get('' + entry.recvEntry.source);
    }
  }

  public async startScreenSharingInternal() {
    try {
      this.wasStartingScreen = true;
      this.wasStartingVideo = false;
      this.streamManager.types = ['audio', 'screencast'];
      await this.requestScreen();
    } catch(err) {
      this.log.error('startScreenSharing error', err);
    }
  }

  public async toggleScreenSharing() {
    if(this.isSharingVideo) {
      await this.stopVideoSharing();
    }

    if(this.isSharingScreen) {
      return this.stopVideoSharing();
    } else {
      return this.startScreenSharingInternal();
    }
  }

  public async startVideoSharingInternal() {
    try {
      this.wasStartingScreen = false;
      this.wasStartingVideo = true;
      this.streamManager.types = ['audio', 'video'];
      await this.requestInputSource(false, true, false);
    } catch(err) {
      this.log.error('startVideoSharing error', err);
    }
  }

  public async stopVideoSharing() {
    const mediaState = this.getMediaState('input');
    mediaState.videoState = mediaState.screencastState = 'inactive';

    const {streamManager, description} = this;
    const track = streamManager.inputStream.getVideoTracks()[0];
    if(track) {
      stopTrack(track);
      streamManager.appendToConference(description); // clear sender track
    }
  }

  public async toggleVideoSharing() {
    if(this.isSharingScreen) {
      await this.stopVideoSharing();
    }

    if(this.isSharingVideo) {
      return this.stopVideoSharing();
    } else {
      return this.startVideoSharingInternal();
    }
  }

  public getMediaState(type: CallMediaState['type']) {
    return this.mediaStates[type];
  }

  public setMediaState(mediaState: CallMediaState) {
    this.mediaStates[mediaState.type] = mediaState;
    this.dispatchEvent('mediaState', mediaState);
  }

  public isSharingVideoType(type: 'video' | 'screencast') {
    try {
      const hasVideoTrack = super.isSharingVideo;
      return hasVideoTrack && !!((this.wasStartingScreen && type === 'screencast') || (this.wasStartingVideo && type === 'video'));

      // ! it will be used before the track appears
      // return !!this.description.entries.find((entry) => entry.type === type && entry.transceiver.sender.track.enabled);
    } catch(err) {
      return false;
    }
  }

  public get isSharingVideo() {
    return this.isSharingVideoType('video');
  }

  public get isSharingScreen() {
    return this.isSharingVideoType('screencast');
  }

  public get isMuted() {
    const audioTrack = this.streamManager.inputStream.getAudioTracks()[0];
    return !audioTrack?.enabled;
  }

  public get isClosing() {
    const {connectionState} = this;
    return connectionState === CALL_STATE.CLOSING || connectionState === CALL_STATE.CLOSED;
  }

  public get description(): localConferenceDescription {
    return this.connectionInstance?.description;
  }

  public setHangUpTimeout(timeout: number, reason: Parameters<CallInstance['hangUp']>[0]) {
    this.clearHangUpTimeout();
    this.hangUpTimeout = ctx.setTimeout(() => {
      this.hangUpTimeout = undefined;
      this.hangUp(reason);
    }, timeout);
  }

  public clearHangUpTimeout() {
    if(this.hangUpTimeout !== undefined) {
      clearTimeout(this.hangUpTimeout);
      this.hangUpTimeout = undefined;
    }
  }

  public setPhoneCall(phoneCall: PhoneCall) {
    this.call = phoneCall;

    const {id} = phoneCall;
    if(this.id !== id) {
      const prevId = this.id;
      this.id = id;
      this.dispatchEvent('id', id, prevId);
    }
  }

  public async acceptCall() {
    const canAccept = (await Promise.all(this.dispatchResultableEvent('acceptCallOverride')))[0] ?? true;
    if(this.isClosing || !canAccept) {
      return;
    }

    // this.clearHangUpTimeout();
    this.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);

    const call = this.call as PhoneCall.phoneCallRequested;
    this.requestInputSource(true, !!call.pFlags.video, false);

    const g_a_hash = call.g_a_hash;
    this.managers.appCallsManager.generateDh().then(async(dh) => {
      this.dh = { // ! it is correct
        g_a_hash,
        b: dh.a,
        g_b: dh.g_a,
        g_b_hash: dh.g_a_hash,
        p: dh.p
      };

      return this.managers.apiManager.invokeApi('phone.acceptCall', {
        peer: await this.managers.appCallsManager.getCallInput(this.id),
        protocol: this.protocol,
        g_b: this.dh.g_b
      });
    }).then(async(phonePhoneCall) => {
      await this.managers.appCallsManager.savePhonePhoneCall(phonePhoneCall);
    }).catch((err) => {
      this.log.error('accept call error', err);
      // if(err.type === 'CALL_PROTOCOL_COMPAT_LAYER_INVALID') {

      // }

      this.hangUp('phoneCallDiscardReasonHangup');
    });
  }

  public joinCall() {
    this.log('joinCall');

    this.getEmojisFingerprint();

    this.overrideConnectionState();

    const {isOutgoing, encryptionKey, streamManager} = this;

    const configuration = getRtcConfiguration(this.call as PhoneCall.phoneCall);
    this.log('joinCall configuration', configuration);
    if(!configuration) return;

    const connectionInstance = this.connectionInstance = new CallConnectionInstance({
      call: this,
      streamManager,
      log: this.log.bindPrefix('connection')
    });

    const connection = connectionInstance.createPeerConnection(configuration);
    connection.addEventListener('iceconnectionstatechange', () => {
      const state = this.connectionState;
      if(this.connectedAt === undefined && state === CALL_STATE.CONNECTED) {
        this.connectedAt = Date.now();
      }

      this.dispatchEvent('state', state);
    });
    connection.addEventListener('negotiationneeded', () => {
      connectionInstance.negotiate();
    });
    connection.addEventListener('icecandidate', (event) => {
      const {candidate} = event;
      connection.log('onicecandidate', candidate);
      if(candidate?.candidate) {
        this.sendIceCandidate(candidate);
      }
    });
    connection.addEventListener('track', (event) => {
      const {track} = event;
      connection.log('ontrack', track);
      this.onTrack(event);
    });

    const description = connectionInstance.createDescription();

    this.encryptor = new P2PEncryptor(isOutgoing, encryptionKey);
    this.decryptor = new P2PEncryptor(!isOutgoing, encryptionKey);

    this.log('currentCall', this);

    if(isOutgoing) {
      connectionInstance.appendStreamToConference();
    }

    this.createDataChannel();

    this.processDecryptQueue();
  }

  private createDataChannelEntry() {
    const dataChannelEntry = this.description.createEntry('application');
    dataChannelEntry.setDirection('sendrecv');
    dataChannelEntry.sendEntry = dataChannelEntry.recvEntry = dataChannelEntry;
  }

  private createDataChannel() {
    if(this.connectionInstance.dataChannel) {
      return;
    }

    const channel = this.connectionInstance.createDataChannel({
      id: 0,
      negotiated: true
    });
    channel.addEventListener('message', (e) => {
      this.applyDataChannelData(JSON.parse(e.data));
    });
    channel.addEventListener('open', () => {
      this.sendMediaState();
    });
  }

  private applyDataChannelData(data: CallMediaState) {
    switch(data['@type']) {
      case 'MediaState': {
        data.type = 'output';
        this.log('got output media state', data);
        this.setMediaState(data);
        break;
      }

      default:
        this.log.error('unknown data channel data:', data);
        break;
    }
  }

  private _sendMediaState() {
    const {connectionInstance} = this;
    if(!connectionInstance) return;

    const mediaState = {...this.getMediaState('input')};
    // mediaState.videoRotation = 90;
    delete mediaState.type;
    this.log('sendMediaState', mediaState);

    connectionInstance.sendDataChannelData(mediaState);
  }

  public async sendCallSignalingData(data: CallSignalingData) {
    /* if(data['@type'] === 'InitialSetup') {
      this.filterNotVP8(data);
    } */

    const json = JSON.stringify(data);
    const arr = new TextEncoder().encode(json);
    const {bytes} = await this.encryptor.encryptRawPacket(arr);

    this.log('sendCallSignalingData', this.id, json);
    await this.managers.apiManager.invokeApi('phone.sendSignalingData', {
      peer: await this.managers.appCallsManager.getCallInput(this.id),
      data: bytes
    });
  }

  public sendIceCandidate(iceCandidate: RTCIceCandidate) {
    this.log('sendIceCandidate', iceCandidate);
    const {candidate, sdpMLineIndex} = iceCandidate;
    if(sdpMLineIndex !== 0) {
      return;
    }

    const parsed = p2pParseCandidate(candidate);
    // const parsed = {sdpString: candidate};
    /* if(parsed.address.ip !== '') {
      return;
    } */

    this.sendCallSignalingData({
      '@type': 'Candidates',
      'candidates': [parsed]
    });
  }

  public async confirmCall() {
    const {protocol, id, call} = this;
    const dh = this.dh as DiffieHellmanInfo.a;

    // this.clearHangUpTimeout();
    this.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);
    const {key, key_fingerprint} = await this.managers.appCallsManager.computeKey((call as PhoneCall.phoneCallAccepted).g_b, dh.a, dh.p);

    const phonePhoneCall = await this.managers.apiManager.invokeApi('phone.confirmCall', {
      peer: await this.managers.appCallsManager.getCallInput(id),
      protocol: protocol,
      g_a: dh.g_a,
      key_fingerprint: key_fingerprint
    });

    this.encryptionKey = key;
    await this.managers.appCallsManager.savePhonePhoneCall(phonePhoneCall);
    this.joinCall();
  }

  public getEmojisFingerprint() {
    if(this.emojisFingerprint) return this.emojisFingerprint;
    if(this.getEmojisFingerprintPromise) return this.getEmojisFingerprintPromise;
    return this.getEmojisFingerprintPromise = apiManagerProxy.invokeCrypto('get-emojis-fingerprint', this.encryptionKey, this.dh.g_a).then((codePoints) => {
      this.getEmojisFingerprintPromise = undefined;
      return this.emojisFingerprint = codePoints.map((codePoints) => emojiFromCodePoints(codePoints)) as [string, string, string, string];
    });
  }

  private unlockStreamManager() {
    this.connectionInstance.streamManager.locked = false;
    this.connectionInstance.appendStreamToConference();
  }

  private async doTheMagic() {
    this.connectionInstance.appendStreamToConference();

    const connection = this.connectionInstance.connection;

    let answer = await connection.createAnswer();

    this.log('[sdp] local', answer.type, answer.sdp);
    await connection.setLocalDescription(answer);

    connection.getTransceivers().filter((transceiver) => transceiver.direction === 'recvonly').forEach((transceiver) => {
      const entry = this.connectionInstance.description.getEntryByMid(transceiver.mid);
      entry.transceiver = entry.recvEntry.transceiver = transceiver;
      transceiver.direction = 'sendrecv';
    });

    const isAnswer = false;

    const description = this.description;
    const bundle = description.entries.map((entry) => entry.mid);
    const sdpDescription: RTCSessionDescriptionInit = {
      type: isAnswer ? 'answer' : 'offer',
      sdp: description.generateSdp({
        bundle,
        entries: description.entries.filter((entry) => bundle.includes(entry.mid)),
        // isAnswer: isAnswer
        isAnswer: !isAnswer
      })
    };

    await connection.setRemoteDescription(sdpDescription);

    answer = await connection.createAnswer();

    await connection.setLocalDescription(answer);

    const initialSetup = parseSignalingData(parseSdp(answer.sdp));
    this.log('[InitialSetup] send 1');
    this.sendCallSignalingData(initialSetup);

    this.unlockStreamManager();
  }

  public overrideConnectionState(state?: CALL_STATE) {
    this._connectionState = state;
    this.dispatchEvent('state', this.connectionState);
  }

  public get duration() {
    return this.connectedAt !== undefined ? (Date.now() - this.connectedAt) / 1000 | 0 : 0;
  }

  protected onInputStream(stream: MediaStream): void {
    super.onInputStream(stream);

    const videoTrack = stream.getVideoTracks()[0];
    if(videoTrack) {
      const state = this.getMediaState('input');

      // handle starting camera
      if(!this.wasStartingScreen && !this.wasStartingVideo) {
        this.wasStartingVideo = true;
      }

      if(this.isSharingVideo) {
        state.videoState = 'active';
      } else if(this.isSharingScreen) {
        state.screencastState = 'active';
      }

      videoTrack.addEventListener('ended', () => {
        this.stopVideoSharing();
      }, {once: true});
    }

    if(stream.getAudioTracks().length) {
      this.onMutedChange();
    }
  }

  private onMutedChange() {
    const isMuted = this.isMuted;
    this.dispatchEvent('muted', isMuted);

    const state = this.getMediaState('input');
    state.muted = isMuted;
  }

  public toggleMuted(): Promise<void> {
    return this.requestAudioSource(true).then(() => {
      this.setMuted();
      this.onMutedChange();
    });
  }

  public async hangUp(
    discardReason?: PhoneCallDiscardReason | Exclude<PhoneCallDiscardReason['_'], PhoneCallDiscardReason.phoneCallDiscardReasonMigrateConferenceCall['_']>,
    discardedByOtherParty?: boolean
  ) {
    if(this.isClosing) {
      return;
    }

    discardReason = typeof(discardReason) === 'string' ? {_: discardReason} : discardReason;
    assumeType<PhoneCallDiscardReason>(discardReason);

    this.discardReason = discardReason;
    this.log('hangUp', discardReason);
    this.overrideConnectionState(CALL_STATE.CLOSED);

    if(this.connectionInstance) {
      this.connectionInstance.closeConnectionAndStream(true);
    }

    if(discardReason && !discardedByOtherParty) {
      let hasVideo = false;
      for(const type in this.mediaStates) {
        const mediaState = this.mediaStates[type as 'input' | 'output'];
        hasVideo = mediaState.videoState === 'active' || mediaState.screencastState === 'active' || hasVideo;
      }

      await this.managers.appCallsManager.discardCall(this.id, this.duration, discardReason, hasVideo);
    }
  }

  private performCodec(_codec: P2PAudioCodec | P2PVideoCodec) {
    const payloadTypes: AudioCodec['payload-types'] = _codec.payloadTypes.map((payloadType) => {
      return {
        ...payloadType,
        'rtcp-fbs': payloadType.feedbackTypes
      }
    });

    const codec: AudioCodec = {
      'rtp-hdrexts': _codec.rtpExtensions,
      'payload-types': payloadTypes
    };

    return codec;
  }

  private setDataToDescription(data: CallSignalingData.initialSetup) {
    this.description.setData({
      transport: {
        'pwd': data.pwd,
        'ufrag': data.ufrag,
        'fingerprints': data.fingerprints,
        'rtcp-mux': true
      },
      audio: this.performCodec(data.audio),
      video: data.video ? this.performCodec(data.video) as VideoCodec : undefined,
      screencast: data.screencast ? this.performCodec(data.screencast) as VideoCodec : undefined
    });
  }

  private filterNotVP8(initialSetup: CallSignalingData.initialSetup) {
    if(!this.isOutgoing) { // only VP8 works now
      [initialSetup.video, initialSetup.screencast].filter(Boolean).forEach((codec) => {
        const payloadTypes = codec.payloadTypes;
        const idx = payloadTypes.findIndex((payloadType) => payloadType.name === 'VP8');
        const vp8PayloadType = payloadTypes[idx];
        const rtxIdx = payloadTypes.findIndex((payloadType) => +payloadType.parameters?.apt === vp8PayloadType.id);
        codec.payloadTypes = [payloadTypes[idx], payloadTypes[rtxIdx]];
      });
    }
  }

  public async applyCallSignalingData(data: CallSignalingData) {
    this.log('applyCallSignalingData', this, data);

    const {connection, description} = this.connectionInstance;

    switch(data['@type']) {
      case 'InitialSetup': {
        this.log('[sdp] InitialSetup', data);

        this.filterNotVP8(data);
        this.setDataToDescription(data);

        const performSsrcGroups = (ssrcGroups: P2PVideoCodec['ssrcGroups']): GroupCallParticipantVideoSourceGroup[] => {
          return ssrcGroups.map((ssrcGroup) => {
            return {
              _: 'groupCallParticipantVideoSourceGroup',
              semantics: ssrcGroup.semantics,
              sources: ssrcGroup.ssrcs.map((source) => +source)
            };
          });
        };

        const ssrcs = [
          generateSsrc('audio', +data.audio.ssrc),
          data.video ? generateSsrc('video', performSsrcGroups(data.video.ssrcGroups)) : undefined,
          data.screencast ? generateSsrc('screencast', performSsrcGroups(data.screencast.ssrcGroups)) : undefined
        ].filter(Boolean);

        ssrcs.forEach((ssrc) => {
          let entry = description.getEntryBySource(ssrc.source);
          if(entry) {
            return;
          }

          const sendRecvEntry = description.findFreeSendRecvEntry(ssrc.type, false);
          entry = new ConferenceEntry(sendRecvEntry.mid, ssrc.type);
          entry.setDirection('sendrecv');
          sendRecvEntry.recvEntry = entry;

          description.setEntrySource(entry, ssrc.sourceGroups || ssrc.source);
        });

        this.createDataChannelEntry();

        const isAnswer = this.offerSent;
        this.offerSent = false;

        const bundle = description.entries.map((entry) => entry.mid);
        const sdpDescription: RTCSessionDescriptionInit = {
          type: isAnswer ? 'answer' : 'offer',
          sdp: description.generateSdp({
            bundle,
            entries: description.entries.filter((entry) => bundle.includes(entry.mid)),
            // isAnswer: isAnswer
            isAnswer: !isAnswer
          })
        };

        this.log('[sdp] remote', sdpDescription.sdp);

        await connection.setRemoteDescription(sdpDescription);

        await this.tryToReleaseCandidates();

        if(!isAnswer) {
          await this.doTheMagic();
        }

        break;
      }

      case 'Candidates': {
        for(const candidate of data.candidates) {
          const init: RTCIceCandidateInit = P2PSdpBuilder.generateCandidate(candidate);
          init.sdpMLineIndex = 0;
          const iceCandidate = new RTCIceCandidate(init);
          this.candidates.push(iceCandidate);
        }

        await this.tryToReleaseCandidates();
        break;
      }

      default: {
        this.log.error('unrecognized signaling data', data);
      }
    }
  }

  public async tryToReleaseCandidates() {
    const {connectionInstance} = this;
    if(!connectionInstance) {
      return;
    }

    const {connection} = connectionInstance;
    if(connection.remoteDescription) {
      const promises: Promise<void>[] = this.candidates.map((candidate) => this.addIceCandidate(connection, candidate));
      this.candidates.length = 0;

      await Promise.all(promises);
    } else {
      this.log('[candidates] postpone');
    }
  }

  private async addIceCandidate(connection: RTCPeerConnection, candidate: RTCIceCandidate) {
    this.log('[candidate] start', candidate);
    try {
      // if(!candidate.address) return;
      await connection.addIceCandidate(candidate);
      this.log('[candidate] add', candidate);
    } catch(e) {
      this.log.error('[candidate] error', candidate, e);
    }
  }

  private async processDecryptQueue() {
    const {encryptor} = this;
    if(!encryptor) {
      this.log.warn('got encrypted signaling data before the encryption key');
      return;
    }

    const length = this.decryptQueue.length;
    if(!length) {
      return;
    }

    const queue = this.decryptQueue.slice();
    this.decryptQueue.length = 0;

    for(const data of queue) {
      const decryptedData = await encryptor.decryptRawPacket(data);
      if(!decryptedData) {
        continue;
      }

      // this.log('[update] updateNewCallSignalingData', update, decryptedData);

      const str = new TextDecoder().decode(decryptedData);
      try {
        const signalingData: CallSignalingData = JSON.parse(str);
        this.log('[update] updateNewCallSignalingData', signalingData);
        this.applyCallSignalingData(signalingData);
      } catch(err) {
        this.log.error('wrong signaling data', str);
        this.hangUp('phoneCallDiscardReasonDisconnect');
        callsController.dispatchEvent('incompatible', this.interlocutorUserId);
      }
    }
  }

  public onUpdatePhoneCallSignalingData(data: Uint8Array) {
    this.decryptQueue.push(data);
    this.processDecryptQueue();
  }
}
