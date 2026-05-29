/*
 * 1-on-1 phone call. CallInstance owns the call lifecycle (DH key exchange,
 * accept/confirm, signaling transport) and the tgcalls v2 (13.0.0) P2P engine:
 * RTCPeerConnection setup, ICE, SDP negotiation and media streams. The engine
 * is a port of Telegram Web A (telegram-tt) src/lib/vibecalls/phone/phoneCall.ts —
 * its state lives in `this.p2p` (created in joinPhoneCall, cleared in
 * stopPhoneCall; `!this.p2p` means the engine has not been started / is stopped).
 */

import {gunzipSync, gzipSync} from 'fflate';
import ctx from '@environment/ctx';
import assumeType from '@helpers/assumeType';
import safeAssign from '@helpers/object/safeAssign';
import {PhoneCall, PhoneCallDiscardReason, PhoneCallProtocol, PhoneConnection} from '@layer';
import {emojiFromCodePoints} from '@vendor/emoji';
import type {CallId} from '@appManagers/appCallsManager';
import type {AppManagers} from '@lib/managers';
import {logger} from '@lib/logger';
import apiManagerProxy from '@lib/apiManagerProxy';
import CallInstanceBase from '@lib/calls/callInstanceBase';
import getStream from '@lib/calls/helpers/getStream';
import shouldMirrorVideoTrack from '@lib/calls/helpers/shouldMirrorVideoTrack';
import callsController from '@lib/calls/callsController';
import CALL_STATE from '@lib/calls/callState';
import {GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS} from '@lib/calls/constants';
import getCallProtocol from '@lib/calls/p2P/getCallProtocol';
import P2PEncryptor from '@lib/calls/p2P/p2PEncryptor';
import ByteBuf from '@lib/calls/p2P/byteBuf';
import {isSctpPacket, SctpSignaling} from '@lib/calls/p2P/sctpSignaling';
import {black, silence} from '@lib/calls/p2P/fallbackMedia';
import {
  ActiveLocalMedia,
  buildIceServers,
  buildSsrc,
  Conference,
  Connection,
  filterRemoteVideoPayloadTypes,
  getCandidateUfrag,
  getDefaultAudioPayloadTypes,
  getDefaultVideoPayloadTypes,
  getRemoteDescriptionMids,
  getRemoteDescriptionUfrags,
  getStreamTrack,
  getUserStream,
  hasLiveTrack,
  MediaMids,
  normalizeCandidateComponent,
  orderMediaContents,
  parseInitialSetup,
  parseMediaContent,
  parseMediaContents,
  parseMediaContentMids,
  payloadTypeToConference,
  QueuedCandidate,
  SsrcEntry,
  stopStream,
  StreamType,
  summarizeContents,
  summarizeTrack,
  tryAddCandidate,
  validateRemoteAnswerSdp
} from '@lib/calls/p2P/utils';
import {
  getSdpDirection,
  getSdpPort,
  parseBundleMids,
  parseExtmaps,
  parsePayloadTypes,
  parseSdpSections,
  summarizeSdp,
  SdpSection
} from '@lib/calls/p2P/sdpCommon';
import {SDPBuilder} from '@lib/calls/sdpBuilder';
import StreamManager from '@lib/calls/streamManager';
import {CallMediaState, DiffieHellmanInfo, P2PMediaContent, P2PMessage} from '@lib/calls/types';

const ICE_CANDIDATE_POOL_SIZE = 10;
const DEFAULT_AUDIO_MID = '0';
const DEFAULT_VIDEO_MID = '1';
const DEFAULT_PRESENTATION_MID = '2';
const DEFAULT_DATA_MID = '3';
const DATA_CHANNEL_ID = 0;

type RemoteMediaState = {
  isMuted: boolean;
  videoState: CallMediaState['videoState'];
  videoRotation: CallMediaState['videoRotation'];
  screencastState: CallMediaState['screencastState'];
  isBatteryLow: boolean;
};

type LocalMediaParameters = {
  audioPayloadTypes: Conference['audioPayloadTypes'];
  audioExtensions: Conference['audioExtensions'];
  videoPayloadTypes: Conference['videoPayloadTypes'];
  videoExtensions: Conference['videoExtensions'];
};

// Live state of the P2P engine: the RTCPeerConnection, its transceivers/senders,
// the media streams and all the negotiation bookkeeping. Created in joinPhoneCall,
// cleared in stopPhoneCall.
type State = {
  connection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  isStarting?: boolean;
  isMakingOffer?: boolean;
  isUpdatingExclusiveVideo?: boolean;
  remoteSetup?: Extract<P2PMessage, { '@type': 'InitialSetup' }>;
  pendingRemoteNegotiation?: Extract<P2PMessage, { '@type': 'NegotiateChannels' }>;
  queuedRemoteNegotiation?: Extract<P2PMessage, { '@type': 'NegotiateChannels' }>;
  pendingLocalExchangeId?: string;
  localCandidateExchangeId?: string;
  pendingLocalContentMids?: Record<string, string>;
  pendingRemoteContentMids?: Record<string, string>;
  appliedRemoteExchangeId?: string;
  appliedRemoteExchangeIds: Set<string>;
  appliedRemoteUfrag?: string;
  isApplyingRemoteNegotiation?: boolean;
  handledRemoteExchangeIds: Set<string>;
  pendingCandidates: QueuedCandidate[];
  transceivers: {
    audio: RTCRtpTransceiver;
    remoteAudio?: RTCRtpTransceiver;
    video?: RTCRtpTransceiver;
    presentation?: RTCRtpTransceiver;
    remoteVideo?: RTCRtpTransceiver;
    remotePresentation?: RTCRtpTransceiver;
  };
  senders: {
    audio: RTCRtpSender;
    video?: RTCRtpSender;
    presentation?: RTCRtpSender;
  };
  streams: {
    video?: MediaStream;
    audio?: MediaStream;
    presentation?: MediaStream;
    ownAudio?: MediaStream;
    ownVideo?: MediaStream;
    ownPresentation?: MediaStream;
  };
  audioContext: AudioContext;
  silence: MediaStream;
  blackVideo: MediaStream;
  blackPresentation: MediaStream;
  remoteMediaState: RemoteMediaState;
  audio: HTMLAudioElement;
  facingMode?: VideoFacingModeEnum;
  exchangeId: number;
  lastLocalSetupKey?: string;
};

// An update emitted by the P2P engine and routed back into the UI.
type Update =
  {'@type': 'updatePhoneCallConnectionState', connectionState: RTCPeerConnectionState} |
  ({'@type': 'updatePhoneCallMediaState'} & RemoteMediaState);

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
  // One P2PEncryptor per call handles BOTH directions — encrypt and decrypt use
  // complementary `x` key-derivation offsets internally, so a single instance
  // (constructed with this peer's real isOutgoing) is correct for send + receive.
  public encryptor: P2PEncryptor;

  // SCTP framing for the 13.0.0 signaling protocol; undefined when the call
  // negotiated network_signaling_nosctp (then the encrypted blob is sent raw).
  private sctp: SctpSignaling | undefined;

  public createdParticipantEntries: boolean;
  public release: () => Promise<void>;
  public _connectionState: CALL_STATE;

  public createdAt: number;
  public connectedAt: number;
  public discardReason: PhoneCallDiscardReason;

  // Kept only to satisfy CallInstanceBase (its cleanup() stops it); the P2P
  // engine owns the actual RTCPeerConnection, streams and tracks.
  public streamManager: StreamManager;

  public wasTryingToJoin: boolean;

  private managers: AppManagers;
  private hangUpTimeout: number;

  private joined: boolean;
  private p2pConnectionState: RTCPeerConnectionState;
  private outputMediaState: CallMediaState;
  private videoElements: Map<CallMediaState['type'], HTMLVideoElement>;

  private decryptQueue: Uint8Array[];

  private getEmojisFingerprintPromise: Promise<CallInstance['emojisFingerprint']>;
  private emojisFingerprint: [string, string, string, string];

  // Live tgcalls v2 P2P engine state; undefined until joinPhoneCall, cleared by
  // stopPhoneCall. `!this.p2p` means the engine is not running.
  private p2p: State;

  // CallInstanceBase hook for mid-call device swap. We walk our single
  // RTCPeerConnection's senders and rebind whichever is currently shipping
  // the old track. Quietly no-ops if the engine isn't running.
  protected replaceSenderTrack(
    kind: 'audio' | 'video',
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack
  ): void {
    const connection = this.p2p?.connection;
    if(!connection) return;
    for(const sender of connection.getSenders()) {
      if(sender.track === oldTrack || (sender.track?.kind === kind && !sender.track)) {
        sender.replaceTrack(newTrack).catch((err) => this.log?.warn?.('replaceSenderTrack', err));
      }
    }
  }

  // Override the base-class mid-call camera swap. The base impl mutates
  // `streamManager.inputStream`, but for P2P calls `streamManager` is just a
  // placeholder kept around for `CallInstanceBase.cleanup()` — the real
  // media state lives on `this.p2p` (own streams, transceivers, senders).
  // Without this override the picker call early-returns at `!oldTrack`
  // because streamManager has no input tracks.
  //
  // The post-await `!this.p2p` check is critical for camera-release: the
  // user can hang up during the (~200ms) `getUserMedia` window, after which
  // `stopPhoneCall` nulls `this.p2p`. Without this guard the next line
  // would dereference the cleared p2p, throw, and leave `newStream` LIVE —
  // camera LED stays on after the call ends.
  public async setInputVideoDeviceId(deviceId: string): Promise<void> {
    if(!this.p2p || !this.isSharingVideo) return;
    const sender = this.p2p.senders.video;
    if(!sender) return;

    let newStream: MediaStream;
    try {
      newStream = await getStream({
        video: deviceId ? {deviceId: {exact: deviceId}} : true
      });
    } catch(err) {
      this.log?.warn?.('setInputVideoDeviceId getUserMedia failed', err);
      return;
    }

    if(!this.p2p || this.isClosing) {
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }

    const newTrack = newStream.getVideoTracks()[0];
    const oldStream = this.p2p.streams.ownVideo;
    const oldTrack = oldStream?.getVideoTracks()[0];
    if(!newTrack || !oldTrack) {
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }

    try {
      await sender.replaceTrack(newTrack);
    } catch(err) {
      this.log?.warn?.('setInputVideoDeviceId replaceTrack failed', err);
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }

    // The `replaceTrack` itself was async — re-check after it resolves.
    if(!this.p2p || this.isClosing) {
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }

    // Stop the OLD getUserMedia stream so the camera light goes out — but
    // not the reused black/silence fallbacks the engine keeps around.
    if(oldStream && oldStream !== this.p2p.blackVideo && oldStream !== this.p2p.blackPresentation) {
      oldStream.getTracks().forEach((t) => t.stop());
    }

    this.p2p.streams.ownVideo = newStream;

    // Re-point the local <video> the popup is showing at the new stream so
    // the user sees the swap immediately. getVideoElement('input') normally
    // updates srcObject lazily on mediaState changes; doing it inline avoids
    // the next render gap.
    const inputEl = this.videoElements.get('input');
    if(inputEl) {
      inputEl.srcObject = newStream;
    }

    this.updateStreams();
    this.sendLocalMediaState();
  }

  // Mirrors setInputVideoDeviceId for the microphone. The base impl uses
  // streamManager.replaceInputAudio which the P2P engine ignores; we need
  // to swap the real sender track and update `p2p.streams.ownAudio`. Same
  // `!this.p2p` guard after each await — without it a hang-up during the
  // device picker resolution leaks the just-acquired mic stream.
  public async setInputAudioDeviceId(deviceId: string): Promise<void> {
    if(!this.p2p || this.isMuted) return;
    const sender = this.p2p.senders.audio;
    if(!sender) return;

    let newStream: MediaStream;
    try {
      newStream = await getStream({
        audio: deviceId ? {deviceId: {exact: deviceId}} : true
      });
    } catch(err) {
      this.log?.warn?.('setInputAudioDeviceId getUserMedia failed', err);
      return;
    }

    if(!this.p2p || this.isClosing) {
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }

    const newTrack = newStream.getAudioTracks()[0];
    const oldStream = this.p2p.streams.ownAudio;
    const oldTrack = oldStream?.getAudioTracks()[0];
    if(!newTrack || !oldTrack) {
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }

    try {
      await sender.replaceTrack(newTrack);
    } catch(err) {
      this.log?.warn?.('setInputAudioDeviceId replaceTrack failed', err);
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }

    if(!this.p2p || this.isClosing) {
      newStream.getTracks().forEach((t) => t.stop());
      return;
    }

    if(oldStream && oldStream !== this.p2p.silence) {
      oldStream.getTracks().forEach((t) => t.stop());
    }

    this.p2p.streams.ownAudio = newStream;
    this.updateStreams();
    this.sendLocalMediaState();
  }

  // Serializes data-channel signaling messages so they are processed in order.
  private dataChannelSignalingMessagePromise: Promise<void>;

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
    this.joined = false;
    this.decryptQueue = [];
    this.dataChannelSignalingMessagePromise = Promise.resolve();
    this.videoElements = new Map();
    this.streamManager = new StreamManager(GROUP_CALL_AMPLITUDE_ANALYSE_INTERVAL_MS);

    this.addEventListener('state', (state) => {
      this.log('state', CALL_STATE[state]);

      if(state === CALL_STATE.CLOSED) {
        this.cleanup();
      }
    });
  }

  get connectionState() {
    if(this._connectionState !== undefined) {
      return this._connectionState;
    }

    switch(this.p2pConnectionState) {
      case 'connected':
        return CALL_STATE.CONNECTED;
      case 'failed':
      case 'closed':
        return CALL_STATE.CLOSED;
      default:
        return CALL_STATE.CONNECTING;
    }
  }

  get sortIndex() {
    const connectionState = this.connectionState;
    const state = CALL_STATE.CLOSED - connectionState + 1;
    let index = state * 10000000000000;
    index += 2147483647000 - (connectionState === CALL_STATE.PENDING && this.isOutgoing ? 0 : this.createdAt);
    return index;
  }

  // The P2P engine owns the RTCPeerConnection — there is no LocalConferenceDescription.
  public get description(): any {
    return undefined;
  }

  // Media is acquired by the P2P engine; skip CallInstanceBase's stream pre-prompt.
  public requestInputSource() {
    return Promise.resolve();
  }

  public getVideoElement(type: CallMediaState['type']) {
    const streams = this.getStreams();
    if(!streams) {
      return undefined;
    }

    const stream = type === 'input' ?
      (this.isSharingScreen ? streams.ownPresentation : streams.ownVideo) :
      (streams.presentation || streams.video);
    if(!stream) {
      return undefined;
    }

    let element = this.videoElements.get(type);
    if(!element) {
      element = document.createElement('video');
      element.autoplay = true;
      element.muted = true;
      element.setAttribute('playsinline', 'true');
      // Mirror ONLY our own self-view (`type === 'input'`), never the remote
      // peer's video — same rule as callInstanceBase.tryAddTrack and every
      // other client (iOS/tgcalls, FaceTime, …). The flip is a local "looking
      // in a mirror" convenience; the wire carries un-mirrored frames, so the
      // peer sees us as in real life. Mirroring their feed would invert any
      // text they hold up. Rear-facing own camera (`facingMode === 'environment'`)
      // stays un-mirrored — handled by shouldMirrorVideoTrack.
      const track = stream.getVideoTracks()[0];
      if(type === 'input' && shouldMirrorVideoTrack(track)) {
        element.classList.add('call-video-mirror');
      }
      this.videoElements.set(type, element);
    }

    if(element.srcObject !== stream) {
      element.srcObject = stream;
    }

    return element;
  }

  public toggleScreenSharing() {
    return this.toggleStream('presentation').then(() => {
      this.dispatchEvent('mediaState', this.getMediaState('input'));
    });
  }

  public toggleVideoSharing() {
    return this.toggleStream('video').then(() => {
      this.dispatchEvent('mediaState', this.getMediaState('input'));
    });
  }

  private getOwnTrackEnabled(streamType: StreamType) {
    const streams = this.getStreams();
    const stream = streamType === 'audio' ? streams?.ownAudio :
      (streamType === 'video' ? streams?.ownVideo : streams?.ownPresentation);
    return !!stream?.getTracks()[0]?.enabled;
  }

  public getMediaState(type: CallMediaState['type']): CallMediaState {
    if(type === 'output') {
      return this.outputMediaState;
    }

    return {
      '@type': 'MediaState',
      'type': 'input',
      'muted': this.isMuted,
      'lowBattery': false,
      'screencastState': this.isSharingScreen ? 'active' : 'inactive',
      'videoRotation': 0,
      'videoState': this.isSharingVideo ? 'active' : 'inactive'
    };
  }

  public setMediaState(mediaState: CallMediaState) {
    this.outputMediaState = mediaState;
    this.dispatchEvent('mediaState', mediaState);
  }

  public get isSharingVideo() {
    return this.getOwnTrackEnabled('video');
  }

  public get isSharingScreen() {
    return this.getOwnTrackEnabled('presentation');
  }

  public get isMuted() {
    return !this.getOwnTrackEnabled('audio');
  }

  public get isClosing() {
    const {connectionState} = this;
    return connectionState === CALL_STATE.CLOSING || connectionState === CALL_STATE.CLOSED;
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

    this.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);

    const call = this.call as PhoneCall.phoneCallRequested;
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
      this.hangUp('phoneCallDiscardReasonHangup');
    });
  }

  public async confirmCall() {
    const {protocol, id, call} = this;
    const dh = this.dh as DiffieHellmanInfo.a;

    this.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);
    const {key, key_fingerprint} = await this.managers.appCallsManager.computeKey(
      (call as PhoneCall.phoneCallAccepted).g_b,
      dh.a,
      dh.p
    );

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

  public joinCall() {
    if(this.joined) {
      return;
    }

    this.log('joinCall');
    this.joined = true;

    this.getEmojisFingerprint();

    const call = this.call as PhoneCall.phoneCall;
    const {isOutgoing, encryptionKey} = this;

    this.encryptor = new P2PEncryptor(isOutgoing, encryptionKey);
    this.sctp = this.getCustomParam('network_signaling_nosctp') ? undefined : new SctpSignaling();

    const connections: Connection[] = (call.connections || [])
    .filter((connection): connection is PhoneConnection.phoneConnectionWebrtc => {
      return connection._ === 'phoneConnectionWebrtc';
    })
    .map((connection) => ({
      ip: connection.ip,
      ipv6: connection.ipv6,
      port: +connection.port,
      username: connection.username,
      password: connection.password,
      isTurn: !!connection.pFlags.turn,
      isStun: !!connection.pFlags.stun
    }));

    this.joinPhoneCall(
      connections,
      !!call.pFlags.video,
      !!call.pFlags.p2p_allowed
    ).catch((err) => {
      this.log.error('joinPhoneCall error', err);
      this.hangUp('phoneCallDiscardReasonDisconnect');
    });

    // clear the EXCHANGING_KEYS override → connectionState now follows the p2p engine
    this.overrideConnectionState();

    this.processDecryptQueue();
  }

  public async sendCallSignalingData(data: P2PMessage) {
    const json = JSON.stringify(data);
    // 13.0.0 (v3): gzip the JSON payload inside the encrypted packet.
    const gzipped = gzipSync(new TextEncoder().encode(json));
    const {bytes} = await this.encryptor.encryptRawPacket(gzipped);

    this.log('sendCallSignalingData', this.id, json);

    if(this.sctp) {
      // wrap the encrypted blob in an SCTP DATA packet (or an INIT during handshake)
      const packet = this.sctp.wrapPayload(ByteBuf.wrap(bytes));
      if(packet) {
        await this.sendSignalingRaw(packet);
      }

      await this.drainSctp();
    } else {
      await this.sendSignalingRaw(bytes);
    }
  }

  private async sendSignalingRaw(packet: number[] | Uint8Array) {
    await this.managers.apiManager.invokeApi('phone.sendSignalingData', {
      peer: await this.managers.appCallsManager.getCallInput(this.id),
      data: packet instanceof Uint8Array ? packet : new Uint8Array(packet)
    });
  }

  // Flush SCTP control packets (INIT/COOKIE/SACK/heartbeat) produced as a side effect.
  private async drainSctp() {
    if(!this.sctp) {
      return;
    }

    for(const packet of this.sctp.drainPackets()) {
      await this.sendSignalingRaw(packet);
    }
  }

  private getCustomParam(key: string) {
    const customParameters = (this.call as PhoneCall.phoneCall)?.custom_parameters;
    if(customParameters?._ !== 'dataJSON') {
      return undefined;
    }

    try {
      return JSON.parse(customParameters.data)?.[key];
    } catch(err) {
      return undefined;
    }
  }

  private onUpdate(update: Update) {
    switch(update['@type']) {
      case 'updatePhoneCallConnectionState': {
        this.p2pConnectionState = update.connectionState;
        if(update.connectionState === 'connected' && this.connectedAt === undefined) {
          this.connectedAt = Date.now();
        }

        // a live engine state supersedes the EXCHANGING_KEYS override
        this._connectionState = undefined;
        this.dispatchEvent('state', this.connectionState);

        if(update.connectionState === 'failed') {
          this.hangUp('phoneCallDiscardReasonDisconnect');
        }
        break;
      }

      case 'updatePhoneCallMediaState': {
        this.setMediaState({
          '@type': 'MediaState',
          'type': 'output',
          'muted': update.isMuted,
          'lowBattery': update.isBatteryLow,
          'screencastState': update.screencastState === 'active' ? 'active' : 'inactive',
          'videoRotation': update.videoRotation || 0,
          'videoState': update.videoState === 'active' ? 'active' : 'inactive'
        });
        break;
      }
    }
  }

  public getEmojisFingerprint() {
    if(this.emojisFingerprint) return this.emojisFingerprint;
    if(this.getEmojisFingerprintPromise) return this.getEmojisFingerprintPromise;
    return this.getEmojisFingerprintPromise = apiManagerProxy.invokeCrypto(
      'get-emojis-fingerprint',
      this.encryptionKey,
      this.dh.g_a
    ).then((codePoints) => {
      this.getEmojisFingerprintPromise = undefined;
      return this.emojisFingerprint = codePoints.map(
        (codePoints) => emojiFromCodePoints(codePoints)
      ) as [string, string, string, string];
    });
  }

  public overrideConnectionState(state?: CALL_STATE) {
    this._connectionState = state;
    this.dispatchEvent('state', this.connectionState);
  }

  public get duration() {
    return this.connectedAt !== undefined ? (Date.now() - this.connectedAt) / 1000 | 0 : 0;
  }

  public toggleMuted(): Promise<void> {
    return this.toggleStream('audio').then(() => {
      this.dispatchEvent('muted', this.isMuted);
      this.dispatchEvent('mediaState', this.getMediaState('input'));
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

    const hasVideo = this.isSharingVideo || this.isSharingScreen;

    this.overrideConnectionState(CALL_STATE.CLOSED);

    try {
      this.stopPhoneCall();
    } catch(err) {
      this.log.error('stopPhoneCall error', err);
    }

    if(discardReason && !discardedByOtherParty) {
      await this.managers.appCallsManager.discardCall(this.id, this.duration, discardReason, hasVideo);
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
      // a v3 packet may be SCTP-wrapped and carry several encrypted payloads
      const incoming = ByteBuf.wrap(data);
      const bodies = this.sctp && isSctpPacket(incoming) ? this.sctp.receive(incoming) : [incoming];

      for(const body of bodies) {
        const decryptedData = await encryptor.decryptRawPacket(body);
        if(!decryptedData) {
          continue;
        }

        // 13.0.0 (v3): the payload is gzipped (magic 1f 8b); older protocols send it raw
        const payload = decryptedData[0] === 0x1F && decryptedData[1] === 0x8B ?
          gunzipSync(decryptedData) : decryptedData;
        const str = new TextDecoder().decode(payload);
        let signalingData: P2PMessage;
        try {
          signalingData = JSON.parse(str);
        } catch(err) {
          this.log.error('wrong signaling data', str);
          this.hangUp('phoneCallDiscardReasonDisconnect');
          callsController.dispatchEvent('incompatible', this.interlocutorUserId);
          continue;
        }

        this.log('[update] updateNewCallSignalingData', signalingData);
        this.processSignalingMessage(signalingData);
      }
    }

    // SCTP receive() may have produced SACK/ACK packets that must go back to the peer
    await this.drainSctp();
  }

  public onUpdatePhoneCallSignalingData(data: Uint8Array) {
    this.decryptQueue.push(data);
    this.processDecryptQueue();
  }

  // ===== tgcalls v2 P2P engine =====
  // Connection setup + signaling negotiation, folded in from the former
  // p2P/p2pCall.ts module. The engine reads/writes `this.p2p`; signaling goes out
  // through this.sendCallSignalingData and engine updates come back via this.onUpdate.

  private getStreams() {
    return this.p2p?.streams;
  }

  private updateStreams() {
    if(!this.p2p) return;

    this.onUpdate({
      ...this.p2p.remoteMediaState,
      '@type': 'updatePhoneCallMediaState'
    });
  }

  private getSender(streamType: StreamType) {
    if(!this.p2p) return undefined;

    if(streamType === 'audio') return this.p2p.senders.audio;
    if(streamType === 'video') return this.p2p.senders.video;
    return this.p2p.senders.presentation;
  }

  private getTransceiver(streamType: StreamType) {
    if(!this.p2p) return undefined;

    if(streamType === 'audio') return this.p2p.transceivers.audio;
    if(streamType === 'video') return this.p2p.transceivers.video;
    return this.p2p.transceivers.presentation;
  }

  private setLocalVideoTransceiver(
    streamType: Extract<StreamType, 'video' | 'presentation'>,
    transceiver: RTCRtpTransceiver,
  ) {
    if(!this.p2p) return;

    if(streamType === 'video') {
      this.p2p.transceivers.video = transceiver;
      this.p2p.senders.video = transceiver.sender;
    } else {
      this.p2p.transceivers.presentation = transceiver;
      this.p2p.senders.presentation = transceiver.sender;
    }
  }

  private setOwnStream(streamType: StreamType, stream: MediaStream) {
    if(!this.p2p) return;

    if(streamType === 'audio') {
      this.p2p.streams.ownAudio = stream;
    } else if(streamType === 'video') {
      this.p2p.streams.ownVideo = stream;
    } else {
      this.p2p.streams.ownPresentation = stream;
    }
  }

  private getOwnStream(streamType: StreamType) {
    if(!this.p2p) return undefined;

    if(streamType === 'audio') return this.p2p.streams.ownAudio;
    if(streamType === 'video') return this.p2p.streams.ownVideo;
    return this.p2p.streams.ownPresentation;
  }

  private getFallbackStream(streamType: StreamType) {
    if(!this.p2p) return undefined;

    if(streamType === 'audio') return this.p2p.silence;
    if(streamType === 'video') return this.p2p.blackVideo;
    return this.p2p.blackPresentation;
  }

  public async switchCameraInput() {
    if(!this.p2p || !this.p2p.facingMode) {
      return;
    }

    const sender = this.getSender('video');
    if(!sender) {
      this.log('switch camera skipped: missing sender');
      return;
    }

    const nextFacingMode = this.p2p.facingMode === 'environment' ? 'user' : 'environment';

    let newStream: MediaStream | undefined;
    try {
      newStream = await getUserStream('video', nextFacingMode);
      const newTrack = getStreamTrack(newStream);
      if(!newTrack) {
        stopStream(newStream);
        return;
      }

      const oldStream = this.p2p.streams.ownVideo;
      await sender.replaceTrack(newTrack);
      this.p2p.facingMode = nextFacingMode;
      this.p2p.streams.ownVideo = newStream;
      stopStream(oldStream, this.p2p.blackVideo);
      this.updateStreams();
      this.sendLocalMediaState();
    } catch{
      stopStream(newStream);
      this.log('switch camera failed');
      // Ignore camera switch failures; the previous track stays active.
    }
  }

  private async toggleStream(streamType: StreamType, value: boolean | undefined = undefined) {
    if(!this.p2p) return;

    const stream = this.getOwnStream(streamType);
    const track = getStreamTrack(stream);
    const sender = this.getSender(streamType);

    if(!track || (streamType === 'audio' && !sender)) {
      this.log('toggle skipped: missing track or sender', {
        streamType,
        track: summarizeTrack(track),
        hasSender: Boolean(sender)
      });
      return;
    }

    const shouldEnable = value === undefined ? !track.enabled : value;

    try {
      let hasChanged = false;
      let shouldRenegotiate = false;
      if(shouldEnable && !track.enabled) {
        const facingMode = streamType === 'video' ? this.p2p.facingMode || 'user' : undefined;
        const newStream = await getUserStream(streamType, facingMode);
        const newTrack = getStreamTrack(newStream);
        if(!newTrack) {
          stopStream(newStream);
          return;
        }

        try {
          newTrack.onended = () => {
            void this.toggleStream(streamType, false);
          };

          let transceiver = this.getTransceiver(streamType);
          const shouldCreateVideoTransceiver = streamType !== 'audio' &&
            (!sender || !transceiver || transceiver.currentDirection === 'stopped');
          if(shouldCreateVideoTransceiver) {
            transceiver = this.p2p.connection.addTransceiver(newTrack, {
              direction: 'sendrecv',
              streams: [newStream]
            });
            this.setLocalVideoTransceiver(streamType, transceiver);
            shouldRenegotiate = true;
          } else {
            await sender!.replaceTrack(newTrack);
          }
          if(transceiver && streamType !== 'audio') {
            shouldRenegotiate ||= !transceiver.mid || transceiver.currentDirection === 'inactive';
            transceiver.direction = 'sendrecv';
          }
          this.setOwnStream(streamType, newStream);
        } catch(err) {
          stopStream(newStream);
          throw err;
        }
        hasChanged = true;

        if(streamType === 'video') {
          this.p2p.facingMode = facingMode;
          this.p2p.isUpdatingExclusiveVideo = true;
          await this.toggleStream('presentation', false);
          this.p2p.isUpdatingExclusiveVideo = false;
        } else if(streamType === 'presentation') {
          this.p2p.isUpdatingExclusiveVideo = true;
          await this.toggleStream('video', false);
          this.p2p.isUpdatingExclusiveVideo = false;
        }
      } else if(!shouldEnable && track.enabled) {
        const fallback = this.getFallbackStream(streamType);
        const fallbackTrack = getStreamTrack(fallback);
        if(!fallback || !fallbackTrack) {
          return;
        }

        if(!sender) {
          return;
        }

        try {
          await sender.replaceTrack(fallbackTrack);
        } catch(err) {
          this.log('toggle failed replacing stream with fallback', {
            error: err instanceof Error ? err.message : String(err),
            streamType
          });
          return;
        }

        stopStream(stream, fallback);
        this.setOwnStream(streamType, fallback);
        hasChanged = true;
      }

      if(!hasChanged) {
        return;
      }

      this.updateStreams();
      this.sendLocalMediaState();
      shouldRenegotiate = shouldRenegotiate &&
        !this.p2p.isStarting &&
        !this.p2p.isUpdatingExclusiveVideo &&
        (streamType === 'video' || streamType === 'presentation');
      if(shouldRenegotiate) {
        void this.sendOffer();
      }
    } catch(err) {
      this.log('toggle failed', {
        streamType,
        shouldEnable,
        error: err instanceof Error ? {
          name: err.name,
          message: err.message
        } : String(err)
      });
      // Ignore media device failures; the current sender track stays active.
    }
  }

  private async joinPhoneCall(
    connections: Connection[],
    shouldStartVideo: boolean,
    isP2p: boolean,
  ) {
    const {isOutgoing} = this;
    const conn = new RTCPeerConnection({
      iceServers: buildIceServers(connections, isP2p),
      iceTransportPolicy: isP2p ? 'all' : 'relay',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: ICE_CANDIDATE_POOL_SIZE
    });

    const audioContext = new AudioContext();
    const silentStream = silence(audioContext);
    const blackVideo = black({width: 640, height: 480});
    const blackPresentation = black({width: 640, height: 480});
    const audioTrack = getStreamTrack(silentStream);

    if(!audioTrack) {
      throw Error('Failed creating phone call placeholder tracks');
    }

    const audioTransceiver = conn.addTransceiver(audioTrack, {
      direction: 'sendrecv',
      streams: [silentStream]
    });

    const dataChannel = isOutgoing ? conn.createDataChannel('data', {
      id: DATA_CHANNEL_ID
    }) : undefined;

    const audio = new Audio();
    audio.autoplay = true;
    this.log('join', {
      isOutgoing,
      shouldStartVideo,
      iceTransportPolicy: isP2p ? 'all' : 'relay',
      iceServers: connections.map((connection) => {
        return {
          isTurn: connection.isTurn,
          isStun: connection.isStun,
          port: connection.port
        };
      })
    });

    this.p2p = {
      audio,
      audioContext,
      connection: conn,
      isStarting: true,
      handledRemoteExchangeIds: new Set<string>(),
      pendingCandidates: [],
      appliedRemoteExchangeIds: new Set<string>(),
      streams: {
        ownVideo: blackVideo,
        ownAudio: silentStream,
        ownPresentation: blackPresentation
      },
      remoteMediaState: {
        isBatteryLow: false,
        screencastState: 'inactive',
        videoState: 'inactive',
        videoRotation: 0,
        isMuted: true
      },
      blackVideo,
      blackPresentation,
      silence: silentStream,
      dataChannel,
      transceivers: {
        audio: audioTransceiver
      },
      senders: {
        audio: audioTransceiver.sender
      },
      exchangeId: Math.floor(Math.random() * 0xFFFFFFFF)
    };

    conn.onicecandidate = (event) => {
      if(!event.candidate || !this.p2p) {
        return;
      }

      const serializedCandidate = event.candidate.toJSON();
      const sdpString = normalizeCandidateComponent(serializedCandidate.candidate);
      if(!sdpString) {
        return;
      }

      this.sendCallSignalingData({
        '@type': 'Candidates',
        'exchangeId': this.p2p.pendingLocalExchangeId || this.p2p.localCandidateExchangeId,
        'ufrag': serializedCandidate.usernameFragment || undefined,
        'candidates': [{
          sdpString,
          sdpMid: serializedCandidate.sdpMid || undefined,
          sdpMLineIndex: serializedCandidate.sdpMLineIndex ?? undefined,
          usernameFragment: serializedCandidate.usernameFragment || undefined
        }]
      });
    };

    conn.onconnectionstatechange = () => {
      this.log('connection state changed', {
        connectionState: conn.connectionState,
        iceConnectionState: conn.iceConnectionState,
        signalingState: conn.signalingState
      });
      this.onUpdate({
        '@type': 'updatePhoneCallConnectionState',
        'connectionState': conn.connectionState
      });
    };

    conn.ontrack = (event) => {
      if(!this.p2p) return;

      if(conn.iceConnectionState === 'connected' || conn.iceConnectionState === 'completed') {
        this.onUpdate({
          '@type': 'updatePhoneCallConnectionState',
          'connectionState': 'connected'
        });
      }

      const stream = event.streams[0] || new MediaStream([event.track]);
      if(event.track.kind === 'audio') {
        if(event.transceiver !== this.p2p.transceivers.audio) {
          this.p2p.transceivers.remoteAudio = event.transceiver;
        }
        this.p2p.audio.srcObject = stream;
        this.p2p.audio.muted = false;
        this.p2p.audio.setAttribute('playsinline', 'true');
        this.p2p.audio.play().catch((err) => {
          this.log('audio playback failed', {
            error: err instanceof Error ? err.message : String(err)
          });
        });
        event.track.onunmute = () => {
          if(!this.p2p) return;

          this.p2p.audio.srcObject = stream;
          this.p2p.audio.play().catch((err) => {
            this.log('audio playback after unmute failed', {
              error: err instanceof Error ? err.message : String(err)
            });
          });
        };
        this.p2p.streams.audio = stream;
      } else if(
        event.transceiver === this.p2p.transceivers.remoteVideo || this.isRemoteContentTransceiver(event.transceiver, false)
      ) {
        this.p2p.transceivers.remoteVideo = event.transceiver;
        this.p2p.remoteMediaState.videoState = 'active';
        this.p2p.streams.video = stream;
      } else if(
        event.transceiver === this.p2p.transceivers.remotePresentation ||
        this.isRemoteContentTransceiver(event.transceiver, true)
      ) {
        this.p2p.transceivers.remotePresentation = event.transceiver;
        this.p2p.remoteMediaState.screencastState = 'active';
        this.p2p.streams.presentation = stream;
      } else {
        this.log('remote video track ignored: unknown transceiver', {
          track: summarizeTrack(event.track),
          mid: event.transceiver.mid
        });
      }

      this.updateStreams();
    };

    conn.oniceconnectionstatechange = () => {
      if(conn.iceConnectionState === 'connected' || conn.iceConnectionState === 'completed') {
        this.onUpdate({
          '@type': 'updatePhoneCallConnectionState',
          'connectionState': 'connected'
        });
      }
      if(!this.p2p || !isOutgoing || conn.iceConnectionState !== 'failed') {
        return;
      }

      this.log('ICE restart requested');
      conn.restartIce();
      void this.sendOffer();
    };

    conn.ondatachannel = (event) => {
      if(event.channel.label === 'data') {
        this.attachDataChannel(event.channel);
      }
    };

    if(dataChannel) {
      this.attachDataChannel(dataChannel);
    }

    await this.toggleStream('audio', true);

    if(shouldStartVideo) {
      await this.toggleStream('video', true);
    }

    if(this.p2p) {
      this.p2p.isStarting = false;
    }

    if(isOutgoing) {
      await this.sendOffer();
    }
  }

  private stopPhoneCall() {
    if(!this.p2p) return;

    stopStream(this.p2p.streams.ownVideo);
    stopStream(this.p2p.streams.ownPresentation);
    stopStream(this.p2p.streams.ownAudio);
    stopStream(this.p2p.blackVideo);
    stopStream(this.p2p.blackPresentation);
    stopStream(this.p2p.silence);
    this.p2p.dataChannel?.close();
    this.p2p.connection.close();
    this.p2p.audio.srcObject = new MediaStream();
    this.p2p.audioContext.close().catch(() => {});
    this.p2p = undefined;
  }

  private isRemoteContentTransceiver(transceiver: RTCRtpTransceiver, isPresentation: boolean) {
    if(!this.p2p || !transceiver.mid) {
      return false;
    }

    const [, mainVideoContent, presentationContent] = orderMediaContents(this.p2p.pendingRemoteNegotiation?.contents || []);
    const content = isPresentation ? presentationContent : mainVideoContent;
    return Boolean(content && this.p2p.pendingRemoteContentMids?.[content.ssrc] === transceiver.mid);
  }

  private attachDataChannel(dataChannel: RTCDataChannel) {
    if(!this.p2p) return;

    this.p2p.dataChannel = dataChannel;
    dataChannel.onopen = () => {
      this.sendLocalMediaState();
    };
    dataChannel.onclose = () => undefined;
    dataChannel.onerror = () => {
      this.log('data channel error', {
        id: dataChannel.id,
        readyState: dataChannel.readyState
      });
    };
    dataChannel.onmessage = (event) => {
      if(typeof event.data !== 'string') {
        this.log('data channel non-string message', {
          dataType: typeof event.data
        });
        return;
      }

      let message: P2PMessage;
      try {
        message = JSON.parse(event.data);
      } catch(err) {
        this.log('data channel message parse failed', {
          dataLength: event.data.length,
          dataType: typeof event.data,
          error: err instanceof Error ? err.message : String(err)
        });
        return;
      }

      this.enqueueDataChannelSignalingMessage(message).catch((err) => {
        this.log('data channel signaling message failed', {
          error: err instanceof Error ? err.message : String(err),
          messageType: message['@type']
        });
      });
    };
  }

  private enqueueDataChannelSignalingMessage(message: P2PMessage) {
    this.dataChannelSignalingMessagePromise = this.dataChannelSignalingMessagePromise
    .catch(() => {})
    .then(() => this.processSignalingMessage(message));

    return this.dataChannelSignalingMessagePromise;
  }

  private sendLocalMediaState() {
    if(!this.p2p || this.p2p.dataChannel?.readyState !== 'open') return;

    const ownAudioTrack = getStreamTrack(this.p2p.streams.ownAudio);
    const ownVideoTrack = getStreamTrack(this.p2p.streams.ownVideo);
    const ownPresentationTrack = getStreamTrack(this.p2p.streams.ownPresentation);

    const message: CallMediaState = {
      '@type': 'MediaState',
      'videoRotation': 0,
      'muted': !ownAudioTrack?.enabled,
      'lowBattery': false,
      'videoState': ownVideoTrack?.enabled ? 'active' : 'inactive',
      'screencastState': ownPresentationTrack?.enabled ? 'active' : 'inactive'
    };

    this.p2p.dataChannel.send(JSON.stringify(message));
  }

  private getMediaMids(): MediaMids {
    if(!this.p2p) {
      return {
        audio: DEFAULT_AUDIO_MID,
        video: DEFAULT_VIDEO_MID,
        presentation: DEFAULT_PRESENTATION_MID,
        data: DEFAULT_DATA_MID
      };
    }

    const localDescriptionSdp = this.p2p.connection.localDescription?.sdp;
    const localDataMid = localDescriptionSdp ?
      parseSdpSections(localDescriptionSdp).find((section) => section.kind === 'application')?.mid :
      undefined;

    return {
      audio: this.p2p.transceivers.audio.mid || DEFAULT_AUDIO_MID,
      video: this.p2p.transceivers.video?.mid || DEFAULT_VIDEO_MID,
      presentation: this.p2p.transceivers.presentation?.mid || DEFAULT_PRESENTATION_MID,
      data: localDataMid || DEFAULT_DATA_MID
    };
  }

  private sendLocalDescription(
    description: RTCSessionDescription | RTCSessionDescriptionInit | undefined, exchangeId?: string,
  ) {
    if(!this.p2p || !description?.sdp) return;

    const contents = parseMediaContents(description.sdp, this.getMediaMids(), this.getActiveLocalMedia());
    const localExchangeId = exchangeId || String(++this.p2p.exchangeId);

    if(description.type === 'offer') {
      this.p2p.pendingLocalContentMids = parseMediaContentMids(description.sdp, contents);
    }
    this.p2p.localCandidateExchangeId = localExchangeId;
    this.log('send local negotiation', {
      exchangeId: localExchangeId,
      type: description.type,
      signalingState: this.p2p.connection.signalingState,
      contents: summarizeContents(contents),
      contentMids: this.p2p.pendingLocalContentMids,
      sdp: summarizeSdp(description.sdp),
      transceivers: this.summarizeTransceivers()
    });
    this.sendLocalSetup(description);
    this.p2p.pendingLocalExchangeId = localExchangeId;
    this.sendCallSignalingData({
      '@type': 'NegotiateChannels',
      'exchangeId': localExchangeId,
      contents
    });
  }

  private sendLocalMediaOffer() {
    if(!this.p2p?.connection.localDescription?.sdp) {
      return;
    }

    const {localDescription} = this.p2p.connection;
    const contents = parseMediaContents(localDescription.sdp, this.getMediaMids(), this.getActiveLocalMedia());
    if(!contents.length) {
      return;
    }

    const exchangeId = String(++this.p2p.exchangeId);
    this.p2p.pendingLocalExchangeId = exchangeId;
    this.p2p.localCandidateExchangeId = exchangeId;
    this.p2p.pendingLocalContentMids = parseMediaContentMids(localDescription.sdp, contents);
    this.log('send local media negotiation', {
      exchangeId,
      type: localDescription.type,
      contents: summarizeContents(contents),
      contentMids: this.p2p.pendingLocalContentMids,
      sdp: summarizeSdp(localDescription.sdp),
      transceivers: this.summarizeTransceivers()
    });
    this.sendCallSignalingData({
      '@type': 'NegotiateChannels',
      exchangeId,
      contents
    });
  }

  private async sendOffer() {
    if(!this.p2p || this.p2p.isMakingOffer || this.p2p.connection.signalingState === 'closed') {
      return;
    }

    const {connection} = this.p2p;
    this.p2p.isMakingOffer = true;
    this.log('create offer', {
      signalingState: connection.signalingState,
      transceivers: this.summarizeTransceivers()
    });

    try {
      const offer = await connection.createOffer();
      if(!this.p2p) {
        return;
      }

      const exchangeId = String(++this.p2p.exchangeId);
      this.p2p.localCandidateExchangeId = exchangeId;
      await connection.setLocalDescription(offer);
      this.sendLocalDescription(connection.localDescription || undefined, exchangeId);
    } catch{
      this.log('create offer failed', {
        signalingState: connection.signalingState
      });
      // Negotiation errors are recovered by the next signaling exchange or hang-up.
    } finally {
      if(this.p2p) {
        this.p2p.isMakingOffer = false;
      }
    }
  }

  private async applyRemoteNegotiation() {
    if(!this.p2p || !this.p2p.remoteSetup || !this.p2p.pendingRemoteNegotiation?.contents.length) {
      return;
    }
    if(this.p2p.isApplyingRemoteNegotiation) {
      this.log('remote negotiation already applying', {
        exchangeId: this.p2p.pendingRemoteNegotiation.exchangeId
      });
      return;
    }

    const {
      connection, remoteSetup, pendingLocalExchangeId, pendingRemoteNegotiation
    } = this.p2p;
    const isAnswer = pendingRemoteNegotiation.exchangeId === pendingLocalExchangeId;
    if(isAnswer && connection.signalingState !== 'have-local-offer') {
      this.log('apply logical remote answer', {
        exchangeId: pendingRemoteNegotiation.exchangeId,
        signalingState: connection.signalingState,
        contents: summarizeContents(pendingRemoteNegotiation.contents)
      });
      this.p2p.pendingLocalExchangeId = undefined;
      this.p2p.pendingLocalContentMids = undefined;
      this.p2p.handledRemoteExchangeIds.add(pendingRemoteNegotiation.exchangeId);
      this.p2p.pendingRemoteNegotiation = undefined;
      return;
    }
    if(!isAnswer) {
      this.prepareTransceiversForRemoteOffer(pendingRemoteNegotiation.contents);
      this.p2p.pendingRemoteContentMids = this.buildRemoteContentMids(pendingRemoteNegotiation.contents);
    }
    const sdp = this.buildRemoteSdp(remoteSetup, pendingRemoteNegotiation.contents, isAnswer);
    this.log('apply remote negotiation', {
      exchangeId: pendingRemoteNegotiation.exchangeId,
      type: isAnswer ? 'answer' : 'offer',
      signalingState: connection.signalingState,
      contents: summarizeContents(pendingRemoteNegotiation.contents),
      sdp: summarizeSdp(sdp),
      transceivers: this.summarizeTransceivers()
    });

    this.p2p.isApplyingRemoteNegotiation = true;
    try {
      if(!isAnswer && connection.signalingState === 'have-local-offer' && !this.isOutgoing) {
        this.log('rollback local offer for remote offer glare', {
          exchangeId: pendingRemoteNegotiation.exchangeId
        });
        await connection.setLocalDescription({type: 'rollback'});
        this.p2p.pendingLocalExchangeId = undefined;
      }

      if(isAnswer && connection.signalingState !== 'have-local-offer') {
        this.log('ignore remote answer in wrong signaling state', {
          exchangeId: pendingRemoteNegotiation.exchangeId,
          signalingState: connection.signalingState
        });
        return;
      }
      if(!isAnswer && connection.signalingState !== 'stable') {
        this.log('ignore remote offer in wrong signaling state', {
          exchangeId: pendingRemoteNegotiation.exchangeId,
          signalingState: connection.signalingState
        });
        return;
      }

      if(!isAnswer) {
        this.log('prepared transceivers for remote offer', {
          exchangeId: pendingRemoteNegotiation.exchangeId,
          transceivers: this.summarizeTransceivers()
        });
      }

      if(isAnswer) {
        validateRemoteAnswerSdp(this.log, connection.localDescription?.sdp, sdp);
      }

      await connection.setRemoteDescription({type: isAnswer ? 'answer' : 'offer', sdp});
      this.p2p.appliedRemoteExchangeId = pendingRemoteNegotiation.exchangeId;
      this.p2p.appliedRemoteExchangeIds.add(pendingRemoteNegotiation.exchangeId);
      this.p2p.appliedRemoteUfrag = remoteSetup.ufrag;
      this.log('remote description applied', {
        exchangeId: pendingRemoteNegotiation.exchangeId,
        type: isAnswer ? 'answer' : 'offer',
        ufrag: remoteSetup.ufrag,
        signalingState: connection.signalingState,
        transceivers: this.summarizeTransceivers()
      });
      if(!isAnswer) {
        this.updateRemoteMediaStateFromOffer(pendingRemoteNegotiation.contents);
        await this.bindLocalAudioToSharedRemoteOffer();
      }
      await this.commitPendingIceCandidates();

      if(isAnswer) {
        this.p2p.pendingLocalExchangeId = undefined;
        this.p2p.pendingLocalContentMids = undefined;
      } else {
        const answer = await connection.createAnswer();
        if(!this.p2p) {
          return;
        }

        this.p2p.localCandidateExchangeId = pendingRemoteNegotiation.exchangeId;
        await connection.setLocalDescription(answer);

        const localDescription = connection.localDescription || undefined;
        const contents = localDescription?.sdp ?
          this.parseAnswerContents(localDescription.sdp, pendingRemoteNegotiation.contents, this.getMediaMids()) : [];

        this.updateRemoteMediaStateFromOffer(contents);
        this.log('send local answer negotiation', {
          exchangeId: pendingRemoteNegotiation.exchangeId,
          contents: summarizeContents(contents),
          sdp: localDescription?.sdp ? summarizeSdp(localDescription.sdp) : undefined,
          transceivers: this.summarizeTransceivers()
        });
        this.sendLocalSetup(localDescription);
        this.sendCallSignalingData({
          '@type': 'NegotiateChannels',
          'exchangeId': pendingRemoteNegotiation.exchangeId,
          contents
        });

        if(this.shouldSendLocalOfferAfterRemoteAnswer()) {
          this.log('send local media offer after remote answer', {
            exchangeId: pendingRemoteNegotiation.exchangeId,
            transceivers: this.summarizeTransceivers()
          });
          this.sendLocalMediaOffer();
        }
      }

      this.p2p.handledRemoteExchangeIds.add(pendingRemoteNegotiation.exchangeId);
    } finally {
      if(this.p2p) {
        if(this.p2p.pendingRemoteNegotiation?.exchangeId === pendingRemoteNegotiation.exchangeId) {
          this.p2p.pendingRemoteNegotiation = undefined;
          this.p2p.pendingRemoteContentMids = undefined;
        }
        this.p2p.isApplyingRemoteNegotiation = false;
        if(!this.p2p.pendingLocalExchangeId && !this.p2p.pendingRemoteNegotiation && this.p2p.queuedRemoteNegotiation) {
          this.p2p.pendingRemoteNegotiation = this.p2p.queuedRemoteNegotiation;
          this.p2p.queuedRemoteNegotiation = undefined;
        }
        if(this.p2p.pendingRemoteNegotiation) {
          void this.applyRemoteNegotiation();
        }
      }
    }
  }

  private sendLocalSetup(description: RTCSessionDescription | RTCSessionDescriptionInit | undefined) {
    if(!this.p2p || !description?.sdp) return;

    const setup = parseInitialSetup(description.sdp);
    const setupKey = JSON.stringify(setup);
    if(this.p2p.lastLocalSetupKey === setupKey) {
      return;
    }

    this.p2p.lastLocalSetupKey = setupKey;
    this.log('send initial setup', {
      setup: {
        ufrag: setup.ufrag,
        fingerprintCount: setup.fingerprints.length,
        renomination: setup.renomination
      }
    });
    this.sendCallSignalingData(setup);
  }

  private getActiveLocalMedia(): ActiveLocalMedia {
    return {
      hasVideo: Boolean(getStreamTrack(this.p2p?.streams.ownVideo)?.enabled),
      hasPresentation: Boolean(getStreamTrack(this.p2p?.streams.ownPresentation)?.enabled)
    };
  }

  private prepareTransceiversForRemoteOffer(contents: P2PMediaContent[]) {
    if(!this.p2p) {
      return;
    }

    const hasRemoteAudio = contents.some((content) => content.type === 'audio');
    const hasRemoteVideo = contents.filter((content) => content.type === 'video').length;
    const shouldUseSharedAudioSection = hasRemoteAudio && !this.p2p.transceivers.audio.mid;
    if(shouldUseSharedAudioSection) {
      this.p2p.transceivers.audio.direction = 'sendrecv';
    } else if(hasRemoteAudio && !this.setRemoteTransceiverDirection('remoteAudio', 'audio', 'recvonly')) {
      this.p2p.transceivers.remoteAudio = this.p2p.connection.addTransceiver('audio', {direction: 'recvonly'});
    }
    if(hasRemoteVideo >= 1 && !this.setRemoteTransceiverDirection('remoteVideo', 'video', 'recvonly')) {
      this.p2p.transceivers.remoteVideo = this.p2p.connection.addTransceiver('video', {direction: 'recvonly'});
    }
    if(hasRemoteVideo >= 2 && !this.setRemoteTransceiverDirection('remotePresentation', 'video', 'recvonly')) {
      this.p2p.transceivers.remotePresentation = this.p2p.connection.addTransceiver('video', {direction: 'recvonly'});
    }
    if(!hasRemoteAudio || shouldUseSharedAudioSection) {
      this.setRemoteTransceiverDirection('remoteAudio', 'audio', 'inactive');
    }
    if(hasRemoteVideo < 1) {
      this.setRemoteTransceiverDirection('remoteVideo', 'video', 'inactive');
    }
    if(hasRemoteVideo < 2) {
      this.setRemoteTransceiverDirection('remotePresentation', 'video', 'inactive');
    }
  }

  private setRemoteTransceiverDirection(
    name: 'remoteAudio' | 'remoteVideo' | 'remotePresentation',
    kind: 'audio' | 'video',
    direction: RTCRtpTransceiverDirection,
  ) {
    if(!this.p2p?.transceivers[name]) {
      return false;
    }

    try {
      const transceiver = this.p2p.transceivers[name];
      if(transceiver.receiver.track.kind !== kind) {
        return false;
      }

      transceiver.direction = direction;
      return true;
    } catch{
      return false;
    }
  }

  private buildRemoteContentMids(contents: P2PMediaContent[]) {
    if(!this.p2p) {
      return {};
    }

    const [audioContent, mainVideoContent, presentationContent] = orderMediaContents(contents);
    const result: Record<string, string> = {};
    if(audioContent) {
      result[audioContent.ssrc] = this.p2p.transceivers.audio.mid ?
        (this.p2p.transceivers.remoteAudio?.mid || audioContent.ssrc) : this.getMediaMids().audio;
    }
    if(mainVideoContent) {
      result[mainVideoContent.ssrc] = this.p2p.transceivers.remoteVideo?.mid || mainVideoContent.ssrc;
    }
    if(presentationContent) {
      result[presentationContent.ssrc] = this.p2p.transceivers.remotePresentation?.mid || presentationContent.ssrc;
    }

    return result;
  }

  private updateRemoteMediaStateFromOffer(contents: P2PMediaContent[]) {
    if(!this.p2p) {
      return;
    }

    const remoteVideoCount = contents.filter((content) => content.type === 'video').length;
    this.p2p.remoteMediaState.videoState = remoteVideoCount >= 1 ? 'active' : 'inactive';
    this.p2p.remoteMediaState.screencastState = remoteVideoCount >= 2 ? 'active' : 'inactive';
    this.updateStreams();
  }

  private shouldSendLocalOfferAfterRemoteAnswer() {
    if(!this.p2p || this.isOutgoing || this.p2p.pendingLocalExchangeId) {
      return false;
    }

    return Boolean(getStreamTrack(this.p2p.streams.ownAudio)?.enabled ||
      getStreamTrack(this.p2p.streams.ownVideo)?.enabled ||
      getStreamTrack(this.p2p.streams.ownPresentation)?.enabled);
  }

  private async bindLocalAudioToSharedRemoteOffer() {
    if(!this.p2p || this.p2p.transceivers.audio.mid) {
      return;
    }

    const audioTrack = this.p2p.senders.audio.track;
    if(!audioTrack?.enabled) {
      return;
    }

    const audioMid = this.getMediaMids().audio;
    const transceiver = this.p2p.connection.getTransceivers().find((item) => {
      return item.mid === audioMid && item.receiver.track.kind === 'audio';
    });
    if(!transceiver || transceiver === this.p2p.transceivers.audio) {
      return;
    }

    await transceiver.sender.replaceTrack(audioTrack);
    transceiver.direction = 'sendrecv';
    this.p2p.transceivers.audio = transceiver;
    this.p2p.senders.audio = transceiver.sender;
    this.p2p.transceivers.remoteAudio = undefined;
    this.log('bound local audio to shared remote offer transceiver', {
      mid: transceiver.mid,
      track: summarizeTrack(audioTrack),
      transceivers: this.summarizeTransceivers()
    });
  }

  private buildRemoteSdp(
    setup: Extract<P2PMessage, { '@type': 'InitialSetup' }>,
    contents: P2PMediaContent[],
    isAnswer: boolean,
  ) {
    const mids = this.getMediaMids();
    const orderedContents = orderMediaContents(contents);
    const [audioContent, mainVideoContent, presentationContent] = orderedContents;
    const videoPayloadSource = mainVideoContent || presentationContent;
    const localMediaParameters = this.getLocalMediaParameters(mids);
    const remoteContentMids = this.p2p?.pendingRemoteContentMids || {};
    const shouldUseSharedAudioSection = !isAnswer && Boolean(audioContent) && !this.p2p?.transceivers.audio.mid;
    const remoteAudioMid = shouldUseSharedAudioSection || isAnswer ?
      mids.audio : (audioContent ? remoteContentMids[audioContent.ssrc] : mids.audio);
    const remoteVideoMid = isAnswer ?
      mids.video : (mainVideoContent ? remoteContentMids[mainVideoContent.ssrc] : mids.video);
    const remotePresentationMid = isAnswer ?
      mids.presentation : (presentationContent ? remoteContentMids[presentationContent.ssrc] : mids.presentation);
    const localOfferSdp = this.p2p?.connection.localDescription?.type === 'offer' ?
      this.p2p.connection.localDescription.sdp : undefined;
    const sharedAudioDirection: RTCRtpTransceiverDirection | undefined = shouldUseSharedAudioSection ?
      'sendrecv' : undefined;
    const entries: SsrcEntry[] = isAnswer ?
      this.buildAnswerSsrcs(contents, mids) :
      [
        {
          ...buildSsrc(audioContent, remoteAudioMid, false),
          direction: sharedAudioDirection
        },
        buildSsrc(mainVideoContent, remoteVideoMid, true),
        buildSsrc(presentationContent, remotePresentationMid, true, true)
      ];
    if(!isAnswer && this.shouldAddLocalAudioOfferSection(entries, mids)) {
      entries.push({
        ...buildSsrc(undefined, mids.audio, false),
        isLocalOnly: true,
        isRemoved: false
      });
    }

    return SDPBuilder.fromP2p({
      setup,
      mids,
      isAnswer,
      entries,
      audioPayloadTypes: audioContent?.payloadTypes?.map(payloadTypeToConference) ||
        localMediaParameters.audioPayloadTypes,
      audioExtensions: audioContent?.rtpExtensions || localMediaParameters.audioExtensions,
      videoPayloadTypes: filterRemoteVideoPayloadTypes(videoPayloadSource)?.map(payloadTypeToConference) ||
        localMediaParameters.videoPayloadTypes,
      videoExtensions: videoPayloadSource?.rtpExtensions || localMediaParameters.videoExtensions,
      sectionOrder: isAnswer ? this.getLocalOfferSections() : this.getEstablishedSections(),
      bundleMids: isAnswer && localOfferSdp ? parseBundleMids(localOfferSdp) : undefined,
      shouldKeepRemoteReceiveSection: (section) => this.shouldKeepRemoteReceiveSection(section)
    });
  }

  private getLocalOfferSections() {
    if(!this.p2p?.connection.localDescription?.sdp || this.p2p.connection.localDescription.type !== 'offer') {
      return undefined;
    }

    return parseSdpSections(this.p2p.connection.localDescription.sdp).filter((section) => section.kind !== 'session');
  }

  private getEstablishedSections() {
    const sdp = this.p2p?.connection.remoteDescription?.sdp || this.p2p?.connection.localDescription?.sdp;
    if(!sdp) {
      return undefined;
    }

    return parseSdpSections(sdp).filter((section) => section.kind !== 'session');
  }

  private getLocalMediaParameters(mids: MediaMids): LocalMediaParameters {
    const sections = this.p2p?.connection.localDescription?.sdp ?
      parseSdpSections(this.p2p.connection.localDescription.sdp) : [];
    const audioSection = sections.find((section) => section.mid === mids.audio);
    const videoSection = sections.find((section) => section.mid === mids.video) ||
      sections.find((section) => section.mid === mids.presentation);

    return {
      audioPayloadTypes: audioSection?.kind === 'audio' ?
        parsePayloadTypes(audioSection).map(payloadTypeToConference) : getDefaultAudioPayloadTypes(),
      audioExtensions: audioSection?.kind === 'audio' ? parseExtmaps(audioSection) : [],
      videoPayloadTypes: videoSection?.kind === 'video' ?
        parsePayloadTypes(videoSection).map(payloadTypeToConference) : getDefaultVideoPayloadTypes(),
      videoExtensions: videoSection?.kind === 'video' ? parseExtmaps(videoSection) : []
    };
  }

  private shouldAddLocalAudioOfferSection(entries: SsrcEntry[], mids: MediaMids) {
    const audioTrack = this.p2p?.transceivers.audio.sender.track;
    const sections = this.getEstablishedSections() || [];
    return Boolean(audioTrack?.enabled) &&
      !entries.some((entry) => entry.mid === mids.audio && !entry.isRemoved) &&
      !sections.some((section) => section.mid === mids.audio);
  }

  private buildAnswerSsrcs(contents: P2PMediaContent[], mids: MediaMids): SsrcEntry[] {
    let videoIndex = 0;

    return contents.map((content) => {
      const mid = this.p2p?.pendingLocalContentMids?.[content.ssrc] ||
        (content.type === 'audio' ? mids.audio : (videoIndex++ ? mids.presentation : mids.video));
      return buildSsrc(content, mid, content.type === 'video', mid === mids.presentation);
    });
  }

  private parseAnswerContents(sdp: string, offeredContents: P2PMediaContent[], mids: MediaMids) {
    const sections = parseSdpSections(sdp);
    const audioSection = sections.find((section) => section.mid === mids.audio);
    const videoSections = [
      sections.find((section) => section.mid === mids.video),
      sections.find((section) => section.mid === mids.presentation)
    ].filter(Boolean);
    let videoIndex = 0;

    return offeredContents.map((content) => {
      const remoteMid = this.p2p?.pendingRemoteContentMids?.[content.ssrc];
      const section = remoteMid ? sections.find((item) => item.mid === remoteMid) :
        (content.type === 'audio' ? audioSection : videoSections[videoIndex++]);
      if(!section || getSdpPort(section) === 0) {
        return undefined;
      }

      const direction = getSdpDirection(section);
      if(direction !== 'recvonly' && direction !== 'sendrecv') {
        return undefined;
      }

      const acceptedContent = parseMediaContent(section, content.type, content);
      if(!acceptedContent.payloadTypes?.length) {
        return undefined;
      }

      return acceptedContent;
    }).filter(Boolean);
  }

  private shouldKeepRemoteReceiveSection(section: SdpSection) {
    if(!this.p2p || getSdpDirection(section) !== 'recvonly') {
      return false;
    }

    const mid = section.mid;
    if(section.kind === 'audio') {
      return mid === this.p2p.transceivers.remoteAudio?.mid && hasLiveTrack(this.p2p.streams.audio);
    }

    if(section.kind === 'video') {
      return (mid === this.p2p.transceivers.remoteVideo?.mid && hasLiveTrack(this.p2p.streams.video)) ||
        (mid === this.p2p.transceivers.remotePresentation?.mid && hasLiveTrack(this.p2p.streams.presentation));
    }

    return false;
  }

  private summarizeTransceivers() {
    if(!this.p2p) {
      return [];
    }

    return [
      {name: 'audio', transceiver: this.p2p.transceivers.audio},
      {name: 'remoteAudio', transceiver: this.p2p.transceivers.remoteAudio},
      {name: 'video', transceiver: this.p2p.transceivers.video},
      {name: 'remoteVideo', transceiver: this.p2p.transceivers.remoteVideo},
      {name: 'presentation', transceiver: this.p2p.transceivers.presentation},
      {name: 'remotePresentation', transceiver: this.p2p.transceivers.remotePresentation}
    ].map(({name, transceiver}) => {
      if(!transceiver) {
        return {
          name
        };
      }

      return {
        name,
        mid: transceiver.mid,
        direction: transceiver.direction,
        currentDirection: transceiver.currentDirection,
        senderTrack: summarizeTrack(transceiver.sender.track || undefined),
        receiverTrack: summarizeTrack(transceiver.receiver.track || undefined)
      };
    });
  }

  private async processSignalingMessage(message: P2PMessage) {
    if(!this.p2p || !message) return;

    switch(message['@type']) {
      case 'MediaState': {
        const videoState = message.videoState === 'inactive' && hasLiveTrack(this.p2p.streams.video) ?
          'active' : message.videoState;
        const screencastState = message.screencastState === 'inactive' && hasLiveTrack(this.p2p.streams.presentation) ?
          'active' : message.screencastState;
        this.p2p.remoteMediaState = {
          isMuted: message.muted,
          isBatteryLow: message.lowBattery,
          videoState,
          videoRotation: message.videoRotation,
          screencastState
        };
        this.updateStreams();
        break;
      }
      case 'Candidates': {
        this.log('received ICE candidates', {
          exchangeId: message.exchangeId,
          ufrag: message.ufrag,
          pendingRemoteExchangeId: this.p2p.pendingRemoteNegotiation?.exchangeId,
          remoteDescriptionMids: getRemoteDescriptionMids(this.p2p.connection),
          count: message.candidates.length
        });
        this.p2p.pendingCandidates.push(...message.candidates.map((candidate) => {
          return {
            ...candidate,
            exchangeId: message.exchangeId,
            ufrag: message.ufrag || candidate.usernameFragment
          };
        }));
        await this.commitPendingIceCandidates();
        break;
      }
      case 'InitialSetup': {
        this.p2p.remoteSetup = message;
        await this.applyRemoteNegotiation();
        break;
      }
      case 'NegotiateChannels': {
        if(this.p2p.handledRemoteExchangeIds.has(message.exchangeId)) {
          this.log('ignore duplicate remote negotiation', {
            exchangeId: message.exchangeId
          });
          return;
        }
        if(this.p2p.isApplyingRemoteNegotiation && this.p2p.pendingRemoteNegotiation?.exchangeId === message.exchangeId) {
          this.log('ignore in-flight duplicate remote negotiation', {
            exchangeId: message.exchangeId
          });
          return;
        }
        if(this.p2p.pendingLocalExchangeId && message.exchangeId !== this.p2p.pendingLocalExchangeId) {
          if(this.isOutgoing) {
            this.p2p.queuedRemoteNegotiation = message;
            this.log('queue remote offer until local answer is applied', {
              exchangeId: message.exchangeId,
              pendingLocalExchangeId: this.p2p.pendingLocalExchangeId
            });
            return;
          }

          this.p2p.pendingLocalExchangeId = undefined;
        }

        this.p2p.pendingRemoteNegotiation = message;
        await this.applyRemoteNegotiation();
        break;
      }
    }
  }

  private async commitPendingIceCandidates() {
    if(!this.p2p || !this.p2p.pendingCandidates.length) {
      return;
    }

    const {connection, pendingCandidates} = this.p2p;
    const candidatesToAdd: QueuedCandidate[] = [];
    const queuedCandidates: QueuedCandidate[] = [];

    pendingCandidates.forEach((candidate) => {
      const decision = this.getCandidateCommitDecision(candidate);
      this.log('ICE candidate routing', {
        decision,
        exchangeId: candidate.exchangeId,
        ufrag: getCandidateUfrag(candidate),
        pendingRemoteExchangeId: this.p2p?.pendingRemoteNegotiation?.exchangeId,
        appliedRemoteExchangeId: this.p2p?.appliedRemoteExchangeId,
        remoteDescriptionMids: getRemoteDescriptionMids(connection)
      });

      if(decision === 'add') {
        candidatesToAdd.push(candidate);
      } else if(decision === 'queue') {
        queuedCandidates.push(candidate);
      }
    });

    this.p2p.pendingCandidates = queuedCandidates;

    await Promise.all(candidatesToAdd.map((candidate) => {
      return tryAddCandidate(this.log, connection, candidate);
    }));
  }

  private getCandidateCommitDecision(candidate: QueuedCandidate): 'add' | 'queue' | 'drop' {
    if(!this.p2p?.connection.remoteDescription) {
      return 'queue';
    }

    const candidateExchangeId = candidate.exchangeId;
    const candidateUfrag = getCandidateUfrag(candidate);
    const remoteUfrags = getRemoteDescriptionUfrags(this.p2p.connection);
    const isCurrentUfrag = !candidateUfrag ||
      remoteUfrags.has(candidateUfrag) ||
      candidateUfrag === this.p2p.appliedRemoteUfrag;

    if(candidateExchangeId) {
      if(this.p2p.appliedRemoteExchangeIds.has(candidateExchangeId)) {
        return isCurrentUfrag ? 'add' : 'drop';
      }

      if(
        candidateExchangeId === this.p2p.pendingLocalExchangeId ||
        candidateExchangeId === this.p2p.pendingRemoteNegotiation?.exchangeId ||
        candidateExchangeId === this.p2p.queuedRemoteNegotiation?.exchangeId
      ) {
        return 'queue';
      }

      if(this.p2p.handledRemoteExchangeIds.has(candidateExchangeId)) {
        return 'drop';
      }

      return 'queue';
    }

    if(isCurrentUfrag) {
      return 'add';
    }

    return 'queue';
  }
}
