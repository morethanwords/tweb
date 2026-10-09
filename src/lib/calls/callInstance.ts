/*
 * 1-on-1 phone call. CallInstance owns the call lifecycle (DH key exchange,
 * accept/confirm, signaling transport) and the tgcalls v2 (13.0.0) P2P engine:
 * RTCPeerConnection setup, ICE, SDP negotiation and media streams. The engine
 * is a port of Telegram Web A (telegram-tt) src/lib/vibecalls/phone/phoneCall.ts —
 * its state lives in `this.p2p` (created in joinPhoneCall, cleared in
 * stopPhoneCall; `!this.p2p` means the engine has not been started / is stopped).
 */

import gzipCompress from '@helpers/gzipCompress';
import updateSenderParameters, {preferScreencastResolution} from '@lib/calls/helpers/updateSenderParameters';
import gzipUncompress from '@helpers/gzipUncompress';
import ctx from '@environment/ctx';
import assumeType from '@helpers/assumeType';
import safeAssign from '@helpers/object/safeAssign';
import {InputPhoneCall, PhoneCall, PhoneCallDiscardReason, PhoneCallProtocol, PhoneConnection} from '@layer';
import {emojiFromCodePoints} from '@vendor/emoji';
import type {CallId} from '@appManagers/appCallsManager';
import type {AppManagers} from '@lib/managers';
import {logger} from '@lib/logger';
import apiManagerProxy from '@lib/apiManagerProxy';
import CallInstanceBase from '@lib/calls/callInstanceBase';
import getAudioConstraints from '@lib/calls/helpers/getAudioConstraints';
import getStream from '@lib/calls/helpers/getStream';
import shouldMirrorVideoTrack from '@lib/calls/helpers/shouldMirrorVideoTrack';
import callsController from '@lib/calls/callsController';
import CALL_STATE from '@lib/calls/callState';
import {
  P2P_MAX_PENDING_CANDIDATES,
  P2P_SIGNALING_MAX_INFLATED_BYTES,
  P2P_SIGNALING_MAX_QUEUED_PACKETS
} from '@lib/calls/constants';
import getCallProtocol from '@lib/calls/p2P/getCallProtocol';
import P2PEncryptor from '@lib/calls/p2P/p2PEncryptor';
import ByteBuf from '@lib/calls/p2P/byteBuf';
import {isSctpPacket, SctpSignaling} from '@lib/calls/p2P/sctpSignaling';
import {black, silence} from '@lib/calls/p2P/fallbackMedia';
import P2PConnectionRecovery, {P2PRecoveryTrigger} from '@lib/calls/p2P/connectionRecovery';
import P2PCallStats, {P2PCallStatsReport} from '@lib/calls/p2P/callStats';
import watchLowBattery from '@lib/calls/p2P/lowBattery';
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
  getP2pVideoConstraints,
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
import {isSdpSafeContents, isSdpSafeSetup, isSdpSafeString} from '@lib/calls/helpers/sdpSafety';

const ICE_CANDIDATE_POOL_SIZE = 10;
// Native tgcalls' Opus ceiling for 1:1 calls (v2/InstanceV2Impl.cpp).
const P2P_AUDIO_MAX_BITRATE = 32 * 1024;
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

// A remote ICE candidate waiting for the negotiation it belongs to, stamped
// with how many remote exchanges had been applied when it was queued — the
// way to tell a candidate that arrived early from one whose exchange was
// superseded and would otherwise wait forever.
type PendingCandidate = QueuedCandidate & {appliedExchanges: number};

type HangUpReason = Parameters<CallInstance['hangUp']>[0];

// Live state of the P2P engine: the RTCPeerConnection, its transceivers/senders,
// the media streams and all the negotiation bookkeeping. Created in joinPhoneCall,
// cleared in stopPhoneCall.
type State = {
  connection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  isStarting?: boolean;
  isMakingOffer?: boolean;
  isUpdatingExclusiveVideo?: boolean;
  remoteSetup?: Extract<P2PMessage, {'@type': 'InitialSetup'}>;
  pendingRemoteNegotiation?: Extract<P2PMessage, {'@type': 'NegotiateChannels'}>;
  queuedRemoteNegotiation?: Extract<P2PMessage, {'@type': 'NegotiateChannels'}>;
  pendingLocalExchangeId?: string;
  localCandidateExchangeId?: string;
  pendingLocalContentMids?: Record<string, string>;
  pendingRemoteContentMids?: Record<string, string>;
  appliedRemoteExchangeId?: string;
  appliedRemoteExchangeIds: Set<string>;
  // Our offers replaced before their answer came (supersedePendingLocalExchange).
  supersededLocalExchangeIds: Set<string>;
  appliedRemoteUfrag?: string;
  isApplyingRemoteNegotiation?: boolean;
  handledRemoteExchangeIds: Set<string>;
  pendingCandidates: PendingCandidate[];
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
  // Transport recovery (ICE restarts), telemetry, and the low-battery watch;
  // all three are stopped by stopPhoneCall.
  recovery: P2PConnectionRecovery;
  stats: P2PCallStats;
  stopWatchingBattery?: () => void;
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
  acceptCallOverride: (accept: () => Promise<void>) => Promise<void>,
  // Connection quality, 0..4 — native tgcalls' signal bars (see p2P/callStats).
  signalBars: (bars: number) => void,
}> {
  public dh: Partial<DiffieHellmanInfo.a & DiffieHellmanInfo.b>;
  public id: CallId;
  public call: PhoneCall;
  public interlocutorUserId: UserId;
  public protocol: PhoneCallProtocol;
  public isOutgoing: boolean;
  public encryptionKey: Uint8Array;
  // Guards the peer-g_a verification in CallsController: it spans two awaits, and
  // without a flag a second (forged) `phoneCall` update could race through them.
  public isVerifyingPeerG_a: boolean;
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

  // Connection quality of the running call, 0..4 (native tgcalls' signal
  // bars); undefined until the first stats sample. Changes are dispatched as
  // `signalBars`.
  public signalBars: number | undefined;

  private managers: AppManagers;
  private hangUpTimeout: number;
  private hangUpStarted = false;

  // phone.saveCallDebug / setCallRating need the call's access hash, which
  // the final phoneCallDiscarded no longer carries — keep the last one seen.
  private inputPhoneCall: InputPhoneCall.inputPhoneCall | undefined;
  private isLowBattery = false;
  // The state the engine last announced. ICE events re-derive the same
  // CONNECTING over and over, and the controller re-arms its reconnect
  // timeout on every CONNECTING it hears — so engine updates announce changes
  // only.
  private lastDispatchedState: CALL_STATE | undefined;
  // The stopped engine's stats log, uploaded after the hang-up.
  private callStatsReport: P2PCallStatsReport | undefined;

  private joined: boolean;
  private p2pConnectionState: RTCPeerConnectionState;
  private outputMediaState: CallMediaState;
  private videoElements: Map<CallMediaState['type'], HTMLVideoElement>;

  private decryptQueue: Uint8Array[];
  private decryptQueuePromise: Promise<void>;

  private getEmojisFingerprintPromise: Promise<CallInstance['emojisFingerprint']>;
  private emojisFingerprint: [string, string, string, string];

  // Live tgcalls v2 P2P engine state; undefined until joinPhoneCall, cleared by
  // stopPhoneCall. `!this.p2p` means the engine is not running.
  private p2p: State;

  // P2P keeps its real local streams outside StreamManager, so device swaps
  // share the base class generation/queue but commit into the live p2p state.
  // Acquisitions may overlap; sender replacement is serialized per kind.
  //
  // A muted microphone stays in the sender (mute only disables it), so a
  // microphone picked while muted is swapped in too — disabled, like the one
  // it replaces. Only while there is no microphone at all (the placeholder
  // before the first capture) is the choice left to that capture.
  private async replaceP2pInputDevice(
    kind: 'audio' | 'video',
    constraints: MediaStreamConstraints
  ): Promise<boolean> {
    const initialState = this.p2p;
    if(!initialState || (kind === 'audio' ? !this.hasLocalMicrophone() : !this.isSharingVideo)) return true;

    return this.runInputDeviceSwap({
      kind,
      constraints,
      acquisitionFailureLogLevel: 'warn',
      release: (stream) => stopStream(stream),
      shouldAbandon: (site, generation) => {
        if(site === 'acquired') {
          if(this.p2p !== initialState || this.isClosing) return true;
          if(!this.isMediaDeviceChangeCurrent(kind, generation)) return false;
          return undefined;
        }
        if(site === 'queued') {
          if(!this.isMediaDeviceChangeCurrent(kind, generation)) return false;
          if(this.p2p !== initialState || this.isClosing) return true;
          return undefined;
        }
        if(site === 'failed') {
          if(!this.isMediaDeviceChangeCurrent(kind, generation)) return false;
          if(this.p2p !== initialState || this.isClosing) return true;
          return undefined;
        }
        // 'swapped': a replaced/closed call must never be rolled back into.
        if(this.p2p !== initialState || this.isClosing) return true;
        if(!this.isMediaDeviceChangeCurrent(kind, generation)) return false;
        return undefined;
      },
      resolveSwap: (newTrack) => {
        const state = initialState;
        const sender = state.senders[kind];
        const oldStream = kind === 'audio' ? state.streams.ownAudio : state.streams.ownVideo;
        const oldTrack = oldStream?.getTracks().find((track) => track.kind === kind);
        if(!sender || !oldTrack) return undefined;
        return {
          oldTrack,
          swap: () => sender.replaceTrack(newTrack),
          rollback: async() => {
            // Only restore a sender that still belongs to this p2p state and
            // still carries the replacement track.
            if(this.p2p === state && !this.isClosing && sender.track === newTrack) {
              await sender.replaceTrack(oldTrack);
            }
          }
        };
      },
      // A rejected single-sender replaceTrack leaves the old track in place
      // per spec — compensating would only double the churn.
      rollbackOnSwapFailure: false,
      getPendingAudioEnabled: () => !this.isMuted,
      commit: (newStream, newTrack) => {
        const state = initialState;
        const oldStream = kind === 'audio' ? state.streams.ownAudio : state.streams.ownVideo;
        const fallback = kind === 'audio' ? state.silence : state.blackVideo;
        stopStream(oldStream, fallback);
        if(kind === 'audio') {
          state.streams.ownAudio = newStream;
          this.releaseOnTrackEnded('audio', newTrack);
        } else {
          state.streams.ownVideo = newStream;
          const inputElement = this.videoElements.get('input');
          if(inputElement) inputElement.srcObject = newStream;
        }

        this.updateStreams();
        this.sendLocalMediaState();
      }
    });
  }

  public setInputVideoDeviceId(deviceId: string): Promise<boolean> {
    return this.replaceP2pInputDevice('video', {
      video: getP2pVideoConstraints(this.p2p?.facingMode, deviceId)
    });
  }

  public setInputAudioDeviceId(deviceId: string): Promise<boolean> {
    return this.replaceP2pInputDevice('audio', {
      audio: getAudioConstraints(deviceId)
    });
  }

  protected getOutputDeviceElements(): Iterable<HTMLMediaElement> {
    const elements = [...super.getOutputDeviceElements()];
    if(this.p2p?.audio) elements.push(this.p2p.audio);
    return elements;
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

    this.createdAt = performance.now();
    this.joined = false;
    this.decryptQueue = [];
    this.decryptQueuePromise = Promise.resolve();
    this.dataChannelSignalingMessagePromise = Promise.resolve();
    this.videoElements = new Map();
    this.streamManager = new StreamManager();

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

    // A failed transport is being recovered (p2P/connectionRecovery): the call
    // reconnects until that gives up or the controller's reconnect timeout
    // hangs up — both through hangUp, which overrides the state to CLOSED.
    switch(this.p2pConnectionState) {
      case 'connected':
        return CALL_STATE.CONNECTED;
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
      'lowBattery': this.isLowBattery,
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

  public get isSharingAudio() {
    return this.getOwnTrackEnabled('audio');
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

  // The reason may be decided when the timer fires: an unanswered incoming
  // call is "missed" — unless another call is still up by then, which makes
  // it "busy".
  public setHangUpTimeout(timeout: number, reason: HangUpReason | (() => HangUpReason)) {
    this.clearHangUpTimeout();
    this.hangUpTimeout = ctx.setTimeout(() => {
      this.hangUpTimeout = undefined;
      void this.hangUp(typeof(reason) === 'function' ? reason() : reason).catch((err) => {
        this.log.error('timed P2P hangup failed', err);
      });
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

    // The placeholder of an outgoing call before phone.requestCall answers has
    // a temporary id and no hash.
    const accessHash = (phoneCall as PhoneCall.phoneCall).access_hash;
    if(accessHash && accessHash !== '0') {
      this.inputPhoneCall = {_: 'inputPhoneCall', id: phoneCall.id, access_hash: accessHash};
    }

    const {id} = phoneCall;
    if(this.id !== id) {
      const prevId = this.id;
      this.id = id;
      this.dispatchEvent('id', id, prevId);
    }
  }

  // The call as phone.* methods address it — kept after phoneCallDiscarded,
  // which has no access hash, for the post-call rating and debug log.
  public getInputPhoneCall(): InputPhoneCall | undefined {
    return this.inputPhoneCall;
  }

  public async acceptCall() {
    if(this.isClosing) return;

    let acceptPromise: Promise<void> | undefined;
    const accept = () => acceptPromise ||= this.acceptCallInternal();
    const overrides = this.dispatchResultableEvent('acceptCallOverride', accept);
    if(overrides.length) {
      // The override owns the transaction. AppImManager uses this to run both
      // leave-current-call and the full accept RPC under one global call-switch
      // reservation; falling through here would accept outside that lock.
      await Promise.all(overrides);
      return;
    }

    await accept();
  }

  private async acceptCallInternal(): Promise<void> {
    if(this.isClosing) return;

    this.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);

    const call = this.call as PhoneCall.phoneCallRequested;
    const {g_a_hash} = call;
    try {
      const dh = await this.managers.appCallsManager.generateDh();
      if(this.isClosing) return;

      this.dh = { // ! it is correct
        g_a_hash,
        b: dh.a,
        g_b: dh.g_a,
        g_b_hash: dh.g_a_hash,
        p: dh.p
      };

      const acceptedCall = await this.managers.appCallsManager.acceptCall(
        this.id,
        this.protocol,
        this.dh.g_b,
        call.pFlags.video
      );
      if(this.isClosing && acceptedCall._ !== 'phoneCallEmpty' && acceptedCall._ !== 'phoneCallDiscarded') {
        // The server accepted while a local hangup was already closing this
        // instance. Compensate the exact echoed call instead of publishing a
        // late accepted state that can overlap the next global transition.
        await this.managers.appCallsManager.discardCall(
          acceptedCall.id,
          0,
          {_: 'phoneCallDiscardReasonHangup'},
          call.pFlags.video
        );
      }
    } catch(err) {
      this.log.error('accept call error', err);
      if(!this.isClosing) {
        try {
          await this.hangUp('phoneCallDiscardReasonHangup');
        } catch(hangUpError) {
          this.log.error('hang up after accept call error failed', hangUpError);
        }
      }
    }
  }

  public async confirmCall() {
    if(this.isClosing) return;

    // A redelivered phoneCallAccepted (getDifference, a second tab's copy of
    // the update) must not run the exchange twice: the second
    // phone.confirmCall fails on the server and that would drop a call that is
    // already connecting. tdesktop bails the same way (`confirmAcceptedCall`:
    // ExchangingKeys || _instance).
    if(this.encryptionKey || this.joined || this.connectionState === CALL_STATE.EXCHANGING_KEYS) {
      this.log.warn('ignoring a repeated phoneCallAccepted', this.id);
      return;
    }

    const {protocol, id} = this;
    const call = this.call as PhoneCall.phoneCallAccepted;
    const dh = this.dh as DiffieHellmanInfo.a;

    this.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);

    try {
      // g_b is the peer value relayed by the server; computeKey rejects a
      // degenerate/out-of-range one before it can force the call key.
      const {key, key_fingerprint} = await this.managers.appCallsManager.computeKey(
        call.g_b,
        dh.a,
        dh.p
      );
      if(this.isClosing) return;

      const confirmedCall = await this.managers.appCallsManager.confirmCall(
        id,
        protocol,
        dh.g_a,
        key_fingerprint,
        call.pFlags.video
      );
      if(this.isClosing) {
        if(confirmedCall._ !== 'phoneCallEmpty' && confirmedCall._ !== 'phoneCallDiscarded') {
          await this.managers.appCallsManager.discardCall(
            confirmedCall.id,
            0,
            {_: 'phoneCallDiscardReasonHangup'},
            call.pFlags.video
          );
        }
        return;
      }

      this.encryptionKey = key;
      this.joinCall();
    } catch(err) {
      this.log.error('confirmCall error', err);
      if(!this.isClosing) {
        try {
          await this.hangUp('phoneCallDiscardReasonHangup');
        } catch(hangUpError) {
          this.log.error('hang up after confirm call error failed', hangUpError);
        }
      }
    }
  }

  public joinCall() {
    if(this.joined) {
      return;
    }

    this.log('joinCall');
    this.joined = true;

    void Promise.resolve(this.getEmojisFingerprint()).catch((err) => {
      this.log.error('emoji fingerprint derivation failed', err);
    });

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

    void this.joinPhoneCall(
      connections,
      !!call.pFlags.video,
      !!call.pFlags.p2p_allowed
    ).catch(async(err) => {
      this.log.error('joinPhoneCall error', err);
      try {
        await this.hangUp('phoneCallDiscardReasonDisconnect');
      } catch(hangUpError) {
        this.log.error('hang up after joinPhoneCall failure failed', hangUpError);
      }
    });

    // clear the EXCHANGING_KEYS override → connectionState now follows the p2p engine
    this.overrideConnectionState();

    this.scheduleDecryptQueueProcessing();
  }

  public async sendCallSignalingData(data: P2PMessage) {
    const json = JSON.stringify(data);
    // 13.0.0 (v3): gzip the JSON payload inside the encrypted packet.
    const gzipped = gzipCompress(new TextEncoder().encode(json));
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
    await this.managers.appCallsManager.sendSignalingData(
      this.id,
      packet instanceof Uint8Array ? packet : new Uint8Array(packet)
    );
  }

  private sendCallSignalingDataDetached(data: P2PMessage, context: string): void {
    void this.sendCallSignalingData(data).catch((err) => {
      this.log.error(context, err);
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
        // hangUp owns the end of the call: a late engine event must not lift
        // its CLOSED override.
        if(this.hangUpStarted) {
          break;
        }

        const previousConnectionState = this.p2pConnectionState;
        this.p2pConnectionState = update.connectionState;
        if(update.connectionState === 'connected' && this.connectedAt === undefined) {
          this.connectedAt = performance.now();
        }

        // a live engine state supersedes the EXCHANGING_KEYS override
        this._connectionState = undefined;

        if(update.connectionState === 'failed' && previousConnectionState !== 'failed') {
          // Not the end of the call any more: the recovery restarts ICE, and
          // the call reads as CONNECTING (reconnecting) meanwhile.
          this.log.warn('P2P transport failed, recovering', {
            hasConnected: this.connectedAt !== undefined,
            iceConnectionState: this.p2p?.connection.iceConnectionState
          });
        }

        this.dispatchStateIfChanged();

        if(update.connectionState === 'closed') {
          // A locally-closed transport may arrive after the call is already
          // discarded. Release media idempotently without publishing a second
          // server mutation.
          try {
            this.stopPhoneCall();
          } catch(err) {
            this.log.error('stopPhoneCall error', err);
          }
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
    const promise = apiManagerProxy.invokeCrypto(
      'get-emojis-fingerprint',
      this.encryptionKey,
      this.dh.g_a
    ).then((codePoints) => {
      if(this.getEmojisFingerprintPromise === promise) {
        this.getEmojisFingerprintPromise = undefined;
      }
      return this.emojisFingerprint = codePoints.map(
        (codePoints) => emojiFromCodePoints(codePoints)
      ) as [string, string, string, string];
    }).catch((err) => {
      // Crypto-worker/proxy failures can be transient. Keep concurrent callers
      // coalesced onto this rejection, but do not poison the SAS for the rest
      // of the call: reopening the popup must be able to retry derivation.
      if(this.getEmojisFingerprintPromise === promise) {
        this.getEmojisFingerprintPromise = undefined;
      }
      throw err;
    });
    this.getEmojisFingerprintPromise = promise;
    return promise;
  }

  public overrideConnectionState(state?: CALL_STATE) {
    this._connectionState = state;
    this.dispatchState(this.connectionState);
  }

  private dispatchStateIfChanged() {
    const connectionState = this.connectionState;
    if(connectionState !== this.lastDispatchedState) {
      this.dispatchState(connectionState);
    }
  }

  private dispatchState(connectionState: CALL_STATE) {
    this.lastDispatchedState = connectionState;
    // Bars describe a live transport: a reconnect starts over from no value,
    // rather than from the last reading of the path that just broke (the
    // stats keep polling meanwhile, see createP2pStats).
    if(connectionState !== CALL_STATE.CONNECTED) {
      this.signalBars = undefined;
    }
    this.dispatchEvent('state', connectionState);
  }

  public get duration() {
    return this.connectedAt !== undefined ? (performance.now() - this.connectedAt) / 1000 | 0 : 0;
  }

  public toggleMuted(): Promise<void> {
    return this.toggleStream('audio').finally(() => {
      this.dispatchEvent('muted', this.isMuted);
      this.dispatchEvent('mediaState', this.getMediaState('input'));
    });
  }

  public async hangUp(
    discardReason?: PhoneCallDiscardReason | Exclude<PhoneCallDiscardReason['_'], PhoneCallDiscardReason.phoneCallDiscardReasonMigrateConferenceCall['_']>,
    discardedByOtherParty?: boolean
  ) {
    if(this.hangUpStarted) {
      return;
    }
    this.hangUpStarted = true;

    discardReason = typeof(discardReason) === 'string' ? {_: discardReason} : discardReason;
    assumeType<PhoneCallDiscardReason>(discardReason);

    this.discardReason = discardReason;
    this.log('hangUp', discardReason);

    const hasVideo = this.isSharingVideo || this.isSharingScreen;

    const stats = this.p2p?.stats;
    if(stats) {
      stats.addEvent(`hang up: ${discardReason?._ ?? 'none'}${discardedByOtherParty ? ' (by the peer)' : ''}`);
      if(discardReason?._ === 'phoneCallDiscardReasonDisconnect' && this.p2pConnectionState !== 'connected') {
        stats.setFailed();
      }
    }

    this.overrideConnectionState(CALL_STATE.CLOSED);

    try {
      this.stopPhoneCall();
    } catch(err) {
      this.log.error('stopPhoneCall error', err);
    }

    try {
      if(discardReason && !discardedByOtherParty) {
        await this.managers.appCallsManager.discardCall(this.id, this.duration, discardReason, hasVideo);
      }
    } finally {
      this.uploadCallStats();
    }
  }

  // phone.saveCallDebug with the native stats log, and the gzipped full log
  // when the server asks for it (`false`) — what Telegram iOS does after every
  // call that got connected (OngoingCallContext.swift stop). Detached: the
  // upload must never hold up or fail a hang-up.
  private uploadCallStats() {
    const report = this.callStatsReport;
    this.callStatsReport = undefined;
    const inputPhoneCall = this.inputPhoneCall;
    if(!report || !inputPhoneCall || this.connectedAt === undefined) {
      return;
    }

    void (async() => {
      try {
        const isEnough = await this.managers.appCallsManager.saveCallDebug(inputPhoneCall, report.json);
        if(isEnough !== false) {
          return;
        }

        const gzipped = gzipCompress(new TextEncoder().encode(report.text));
        const blob = new Blob([gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) as ArrayBuffer], {
          type: 'application/gzip'
        });
        await this.managers.appCallsManager.saveCallLog(inputPhoneCall, blob);
      } catch(err) {
        this.log.warn('uploading the call debug log failed', err);
      }
    })();
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

        // 13.0.0 (v3): the payload is gzipped (magic 1f 8b); older protocols send it raw.
        // Inflate through the size-bounded streaming path: gunzipSync sizes its
        // output by the trailer's ISIZE, so the peer could make a 1 MiB packet
        // reserve gigabytes. tgcalls caps the inflated size the same way.
        const payload = decryptedData[0] === 0x1F && decryptedData[1] === 0x8B ?
          gzipUncompress(decryptedData, false, P2P_SIGNALING_MAX_INFLATED_BYTES) as Uint8Array :
          decryptedData;
        const str = new TextDecoder().decode(payload);
        let signalingData: P2PMessage;
        try {
          signalingData = JSON.parse(str);
        } catch(err) {
          this.log.error('wrong signaling data', str);
          try {
            await this.hangUp('phoneCallDiscardReasonDisconnect');
          } catch(hangUpError) {
            this.log.error('hang up after invalid signaling data failed', hangUpError);
          }
          callsController.dispatchEvent('incompatible', this.interlocutorUserId);
          continue;
        }

        this.log('[update] updateNewCallSignalingData', signalingData);
        await this.processSignalingMessage(signalingData);
      }
    }

    // SCTP receive() may have produced SACK/ACK packets that must go back to the peer
    await this.drainSctp();
  }

  public onUpdatePhoneCallSignalingData(data: Uint8Array) {
    this.decryptQueue.push(data);

    // Packets wait here only until the key is derived (and while the previous
    // batch decrypts); the peer must not be able to grow that wait forever.
    const overflow = this.decryptQueue.length - P2P_SIGNALING_MAX_QUEUED_PACKETS;
    if(overflow > 0) {
      this.decryptQueue.splice(0, overflow);
      this.log.warn('dropping the oldest queued signaling packets', {overflow});
    }

    this.scheduleDecryptQueueProcessing();
  }

  private scheduleDecryptQueueProcessing(): void {
    const processing = this.decryptQueuePromise.catch(() => {}).then(() => {
      return this.processDecryptQueue();
    });
    this.decryptQueuePromise = processing;
    void processing.catch((err) => {
      this.log.error('P2P signaling processing failed', err);
      void this.hangUp('phoneCallDiscardReasonDisconnect').catch((hangUpError) => {
        this.log.error('hang up after P2P signaling failure failed', hangUpError);
      });
    });
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
    transceiver: RTCRtpTransceiver
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

    const initialState = this.p2p;
    const stream = this.getOwnStream(streamType);
    const track = getStreamTrack(stream);
    const sender = this.getSender(streamType);

    if(!track || (streamType === 'audio' && !sender)) {
      this.log('toggle skipped: missing track or sender', {
        streamType,
        track: summarizeTrack(track),
        hasSender: Boolean(sender)
      });
      throw new Error(`Could not toggle ${streamType}: missing local track or sender`);
    }

    const shouldEnable = value === undefined ? !track.enabled : value;
    if(streamType === 'audio' && this.hasLocalMicrophone(track)) {
      // Mute keeps the microphone capturing and in the sender and only stops
      // sending it — native tgcalls disables the outgoing channel and keeps
      // the device running (v2/InstanceV2Impl.cpp setIsMuted). Re-opening the
      // device on every unmute clipped the first syllables and restarted echo
      // cancellation and gain control cold. A picker swap still in flight
      // follows the same flag.
      if(shouldEnable === track.enabled) {
        return;
      }

      track.enabled = shouldEnable;
      this.pendingInputAudioTracks.forEach((pendingTrack) => {
        pendingTrack.enabled = shouldEnable;
      });
      this.log(shouldEnable ? 'microphone unmuted' : 'microphone muted');
      this.updateStreams();
      this.sendLocalMediaState();
      return;
    }

    if(streamType === 'audio' && shouldEnable !== track.enabled) {
      // Opening the microphone (the first time, or after the last one ended)
      // and falling back to the placeholder change the capture itself: they
      // supersede any picker transaction that acquired or installed a track
      // from the previous capture state.
      this.beginMediaDeviceChange('audio');
    }

    try {
      let hasChanged = false;
      let shouldRenegotiate = false;
      if(shouldEnable && !track.enabled) {
        const facingMode = streamType === 'video' ? this.p2p.facingMode || 'user' : undefined;
        const newStream = await getUserStream(streamType, facingMode);
        const newTrack = getStreamTrack(newStream);
        if(!newTrack) {
          stopStream(newStream);
          throw new Error(`Could not enable ${streamType}: media capture returned no track`);
        }

        let isNewStreamStopped = false;
        const stopNewStream = () => {
          if(isNewStreamStopped) return;
          isNewStreamStopped = true;
          stopStream(newStream);
        };

        try {
          if(this.p2p !== initialState || this.isClosing) {
            throw new Error(`Could not enable ${streamType}: call closed during media capture`);
          }

          this.releaseOnTrackEnded(streamType, newTrack);

          let transceiver = this.getTransceiver(streamType);
          const previousDirection = transceiver?.direction;
          const previousFacingMode = initialState.facingMode;
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
          // stopPhoneCall clears `this.p2p` and only stops streams already
          // registered in its state. If hangup wins while replaceTrack is
          // pending, this newly-acquired stream is otherwise orphaned and can
          // keep the microphone/camera/screen capture indicator alive.
          if(this.p2p !== initialState || this.isClosing) {
            throw new Error(`Could not enable ${streamType}: call closed during sender replacement`);
          }
          if(transceiver && streamType !== 'audio') {
            shouldRenegotiate ||= !transceiver.mid || transceiver.currentDirection === 'inactive';
            transceiver.direction = 'sendrecv';
          }
          this.setOwnStream(streamType, newStream);
          if(streamType === 'audio') {
            // A microphone that ended while muted is still registered.
            stopStream(stream, initialState.silence);
          }

          if(streamType === 'video' || streamType === 'presentation') {
            const enabledSender = this.getSender(streamType);
            initialState.isUpdatingExclusiveVideo = true;
            try {
              await this.toggleStream(streamType === 'video' ? 'presentation' : 'video', false);
              if(this.p2p !== initialState || this.isClosing) {
                throw new Error(`Could not enable ${streamType}: call closed during exclusive media update`);
              }
            } catch(err) {
              // End the new capture before attempting an async sender rollback.
              // Even a stuck/rejected rollback can no longer leave camera and
              // screen capture live at the same time.
              stopNewStream();

              // The newly-enabled sender is already live at this point, while
              // the opposite sender rejected its fallback. Restore our exact
              // previous stream/direction as well as stopping capture, so the
              // engine state cannot retain a half-committed exclusive stream.
              if(this.p2p === initialState) {
                if(enabledSender) {
                  try {
                    await enabledSender.replaceTrack(track);
                  } catch(rollbackError) {
                    this.log('exclusive stream rollback failed', {
                      streamType,
                      error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                    });
                  }
                }
                if(transceiver) transceiver.direction = previousDirection || 'inactive';
                this.setOwnStream(streamType, stream);
                initialState.facingMode = previousFacingMode;
              }
              throw err;
            } finally {
              initialState.isUpdatingExclusiveVideo = false;
            }
          }
        } catch(err) {
          stopNewStream();
          throw err;
        }
        hasChanged = true;

        if(streamType === 'video') {
          this.p2p.facingMode = facingMode;
        } else if(streamType === 'presentation') {
          void this.applySenderParameters();
        }
      } else if(!shouldEnable && track.enabled) {
        if(streamType === 'audio') {
          // Fail closed before waiting for sender.replaceTrack. Include a
          // device replacement already handed to the sender but not committed.
          track.enabled = false;
          this.pendingInputAudioTracks.forEach((pendingTrack) => {
            pendingTrack.enabled = false;
          });
        }
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
          throw err;
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
      throw err;
    }
  }

  // A microphone track (not the silent placeholder) that has not ended: it
  // stays in the sender whether the call is muted or not.
  private hasLocalMicrophone(track = getStreamTrack(this.p2p?.streams.ownAudio)) {
    return !!track && track !== getStreamTrack(this.p2p?.silence) && track.readyState !== 'ended';
  }

  // A capture the browser ends on its own (device unplugged, permission
  // revoked, sharing stopped from the browser's own UI) is turned off the
  // regular way.
  private releaseOnTrackEnded(streamType: StreamType, track: MediaStreamTrack) {
    track.onended = () => {
      void this.toggleStream(streamType, false).catch((err) => {
        this.log('track-ended toggle failed', {streamType, error: err});
      });
    };
  }

  // Sender settings that SDP cannot carry, re-applied after each local
  // description in case a sender was only just negotiated:
  // * shared screens keep their resolution and give up frame rate under
  //   congestion, so text stays legible — native sets MAINTAIN_RESOLUTION on
  //   its screencast channel (v2/InstanceV2Impl.cpp OutgoingVideoChannel), and
  //   the group-call presentation connection does the same;
  // * the microphone is capped at native's 32 kbit/s Opus maximum
  //   (v2/InstanceV2Impl.cpp `32 * 1024`): with transport-cc on the audio
  //   m-line and no maxaveragebitrate, Chrome lets the bandwidth allocation
  //   push Opus towards 510 kbit/s, taking the room video needs.
  private async applySenderParameters() {
    const senders = this.p2p?.senders;
    const presentation = senders?.presentation;
    await Promise.all([
      presentation?.track?.enabled && updateSenderParameters(presentation, preferScreencastResolution),
      updateSenderParameters(senders?.audio?.track ? senders.audio : undefined, (parameters) => {
        const encoding = parameters.encodings?.[0];
        if(!encoding || encoding.maxBitrate === P2P_AUDIO_MAX_BITRATE) return false;
        encoding.maxBitrate = P2P_AUDIO_MAX_BITRATE;
        return true;
      })
    ].map((promise) => Promise.resolve(promise).catch((err) => {
      this.log.warn('setting sender parameters failed', err);
    })));
  }

  private async joinPhoneCall(
    connections: Connection[],
    shouldStartVideo: boolean,
    isP2p: boolean
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
      supersededLocalExchangeIds: new Set<string>(),
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
      exchangeId: Math.floor(Math.random() * 0xFFFFFFFF),
      recovery: this.createP2pRecovery(conn),
      stats: this.createP2pStats(conn)
    };

    this.p2p.recovery.start();
    this.p2p.stats.start();
    this.p2p.stats.addEvent(`start: ${isOutgoing ? 'outgoing' : 'incoming'}${shouldStartVideo ? ', video' : ''}, ${isP2p ? 'p2p allowed' : 'relay only'}`);
    this.p2p.stopWatchingBattery = watchLowBattery((isLow) => {
      this.isLowBattery = isLow;
      this.log('battery is low', isLow);
      this.sendLocalMediaState();
    });

    // This element can be created while the constructor is still applying a
    // saved sink. Queue behind that transaction and read the committed id only
    // then, so a failed/stale saved id cannot leak into the P2P endpoint and a
    // successful one is not missed by the creation race.
    this.applyCurrentOutputDeviceToElement(this.p2p.audio);

    conn.onicecandidate = (event) => {
      if(!event.candidate || !this.p2p) {
        return;
      }

      const serializedCandidate = event.candidate.toJSON();
      const sdpString = normalizeCandidateComponent(serializedCandidate.candidate);
      if(!sdpString) {
        return;
      }

      this.sendCallSignalingDataDetached({
        '@type': 'Candidates',
        'exchangeId': this.p2p.pendingLocalExchangeId || this.p2p.localCandidateExchangeId,
        'ufrag': serializedCandidate.usernameFragment || undefined,
        'candidates': [{
          sdpString,
          sdpMid: serializedCandidate.sdpMid || undefined,
          sdpMLineIndex: serializedCandidate.sdpMLineIndex ?? undefined,
          usernameFragment: serializedCandidate.usernameFragment || undefined
        }]
      }, 'sending P2P ICE candidate failed');
    };

    conn.onconnectionstatechange = () => {
      this.log('connection state changed', {
        connectionState: conn.connectionState,
        iceConnectionState: conn.iceConnectionState,
        signalingState: conn.signalingState
      });
      this.p2p?.stats.addEvent(`connection ${conn.connectionState}`);
      this.onUpdate({
        '@type': 'updatePhoneCallConnectionState',
        'connectionState': conn.connectionState
      });
      if(this.p2p?.connection === conn) {
        this.p2p.recovery.setConnectionState(conn.connectionState, conn.iceConnectionState);
      }
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
        this.p2p.audio.muted = false;
        this.p2p.audio.setAttribute('playsinline', 'true');
        // Same playback as a group call's remote audio: play now, again when
        // the track resumes, and on the next gesture if autoplay refused.
        this.playRemoteAudio(this.p2p.audio, stream, event.track);
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
      this.onIceConnectionStateChange(conn);
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

  private onIceConnectionStateChange(connection: RTCPeerConnection) {
    const p2p = this.p2p;
    if(!p2p || p2p.connection !== connection) {
      return;
    }

    const {iceConnectionState} = connection;
    const isConnected = iceConnectionState === 'connected' || iceConnectionState === 'completed';
    this.log('ICE connection state changed', {
      iceConnectionState,
      connectionState: connection.connectionState,
      signalingState: connection.signalingState
    });
    p2p.stats.addEvent(`ice ${iceConnectionState}`);
    p2p.stats.setConnected(isConnected);

    if(isConnected) {
      this.onUpdate({
        '@type': 'updatePhoneCallConnectionState',
        'connectionState': 'connected'
      });
    }

    p2p.recovery.setIceConnectionState(iceConnectionState);
  }

  private createP2pRecovery(connection: RTCPeerConnection) {
    return new P2PConnectionRecovery({
      isOutgoing: this.isOutgoing,
      log: this.log,
      restart: (trigger) => this.restartP2pIce(connection, trigger),
      giveUp: () => {
        void this.hangUp('phoneCallDiscardReasonDisconnect').catch((err) => {
          this.log.error('hang up after P2P transport failure failed', err);
        });
      },
      onEvent: (event) => this.p2p?.stats.addEvent(event)
    });
  }

  private createP2pStats(connection: RTCPeerConnection) {
    return new P2PCallStats({
      getStats: () => connection.getStats(),
      hasVideo: () => this.isSharingVideo,
      onSignalBars: (bars) => {
        // A reading taken while reconnecting is the broken path's: it would be
        // shown the moment the call reads connected again.
        if(this.connectionState !== CALL_STATE.CONNECTED || bars === this.signalBars) {
          return;
        }

        this.signalBars = bars;
        this.dispatchEvent('signalBars', bars);
      },
      log: this.log
    });
  }

  // One ICE restart for the recovery: the new local credentials go out in a
  // new InitialSetup (sendLocalSetup sends one whenever the ufrag changes)
  // followed by an offer. A tweb peer answers the offer; a native V2 peer takes
  // the credentials straight from the InitialSetup (SetRemoteIceParameters) and
  // answers the offer with unchanged ones of its own.
  private restartP2pIce(connection: RTCPeerConnection, trigger: P2PRecoveryTrigger): boolean {
    const p2p = this.p2p;
    if(!p2p || p2p.connection !== connection || this.isClosing || connection.signalingState === 'closed') {
      return true;
    }

    // Not over a negotiation in flight; and before the peer's InitialSetup
    // there is nothing to restart against. Asked again shortly.
    if(
      p2p.isStarting ||
      p2p.isMakingOffer ||
      p2p.isApplyingRemoteNegotiation ||
      connection.signalingState === 'have-remote-offer' ||
      !p2p.remoteSetup
    ) {
      this.log('ICE restart postponed', {
        trigger,
        signalingState: connection.signalingState,
        isMakingOffer: !!p2p.isMakingOffer,
        isApplyingRemoteNegotiation: !!p2p.isApplyingRemoteNegotiation,
        hasRemoteSetup: !!p2p.remoteSetup
      });
      return false;
    }

    this.log('restarting ICE', {
      trigger,
      iceConnectionState: connection.iceConnectionState,
      connectionState: connection.connectionState,
      signalingState: connection.signalingState
    });
    connection.restartIce();
    void this.sendOffer();
    return true;
  }

  private stopPhoneCall() {
    if(!this.p2p) return;

    // The engine fakes of older tests carry none of these.
    this.p2p.recovery?.stop();
    this.p2p.stopWatchingBattery?.();
    if(this.p2p.stats) {
      this.p2p.stats.stop();
      this.callStatsReport = this.p2p.stats.getReport();
    }

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
      'lowBattery': this.isLowBattery,
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
    description: RTCSessionDescription | RTCSessionDescriptionInit | undefined, exchangeId?: string
  ) {
    if(!this.p2p || !description?.sdp) return;

    const contents = parseMediaContents(description.sdp, this.getMediaMids(), this.getActiveLocalMedia());
    const localExchangeId = exchangeId || String(++this.p2p.exchangeId);

    if(description.type === 'offer') {
      this.p2p.pendingLocalContentMids = parseMediaContentMids(description.sdp, contents);
      this.supersedePendingLocalExchange(localExchangeId);
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
    this.sendCallSignalingDataDetached({
      '@type': 'NegotiateChannels',
      'exchangeId': localExchangeId,
      contents
    }, 'sending local P2P negotiation failed');
  }

  // A new local offer replaces one still waiting for its answer (an ICE
  // restart over an unanswered offer, say), or glare rolls ours back. Should
  // that answer still come, it answers a description that is gone — and with
  // another exchange pending it would be taken for an offer. It is ignored;
  // the candidates the peer tags with it are judged by their ufrag alone.
  private supersedePendingLocalExchange(exchangeId?: string) {
    const previous = this.p2p?.pendingLocalExchangeId;
    if(previous && previous !== exchangeId) {
      this.log('local negotiation superseded', {exchangeId: previous, by: exchangeId});
      this.p2p.supersededLocalExchangeIds?.add(previous);
    }
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
    this.sendCallSignalingDataDetached({
      '@type': 'NegotiateChannels',
      exchangeId,
      contents
    }, 'sending local P2P media negotiation failed');
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
      void this.applySenderParameters();
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
        this.sendCallSignalingDataDetached({
          '@type': 'NegotiateChannels',
          'exchangeId': pendingRemoteNegotiation.exchangeId,
          contents
        }, 'sending P2P negotiation answer failed');
        void this.applySenderParameters();

        if(this.shouldSendLocalOfferAfterRemoteAnswer()) {
          // The callee of a video call starts its camera before the caller's
          // offer arrives (joinPhoneCall), on a transceiver that offer has no
          // section for: the answer cannot carry it, and re-announcing the
          // answer's contents would leave the caller without our video. Only
          // a fresh offer adds its m-line.
          const shouldOffer = this.hasUnnegotiatedLocalMedia();
          this.log('send local media offer after remote answer', {
            exchangeId: pendingRemoteNegotiation.exchangeId,
            createOffer: shouldOffer,
            transceivers: this.summarizeTransceivers()
          });
          if(shouldOffer) {
            void this.sendOffer();
          } else {
            this.sendLocalMediaOffer();
          }
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
          void this.applyRemoteNegotiation().catch((err) => {
            // The caller awaits the negotiation that was current on entry, but
            // a queued offer is promoted from this finally block and otherwise
            // has no observer. A failed remote description leaves this peer
            // connection unusable, so close the exact P2P call after logging.
            this.log.error('queued remote negotiation failed', err);
            void this.hangUp('phoneCallDiscardReasonDisconnect').catch((hangUpError) => {
              this.log.error('hang up after queued remote negotiation failed', hangUpError);
            });
          });
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
    this.sendCallSignalingDataDetached(setup, 'sending initial P2P setup failed');
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
    direction: RTCRtpTransceiverDirection
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

  // A camera or screen being sent on a transceiver no description has given a
  // mid yet.
  private hasUnnegotiatedLocalMedia() {
    if(!this.p2p) {
      return false;
    }

    const {transceivers, streams} = this.p2p;
    return (!!transceivers.video && !transceivers.video.mid && !!getStreamTrack(streams.ownVideo)?.enabled) ||
      (!!transceivers.presentation && !transceivers.presentation.mid && !!getStreamTrack(streams.ownPresentation)?.enabled);
  }

  private shouldSendLocalOfferAfterRemoteAnswer() {
    if(!this.p2p || this.isOutgoing || this.p2p.pendingLocalExchangeId) {
      return false;
    }

    return Boolean(this.hasLocalMicrophone() ||
      getStreamTrack(this.p2p.streams.ownVideo)?.enabled ||
      getStreamTrack(this.p2p.streams.ownPresentation)?.enabled);
  }

  private async bindLocalAudioToSharedRemoteOffer() {
    if(!this.p2p || this.p2p.transceivers.audio.mid) {
      return;
    }

    // Muted or not: mute only disables the track, it stays the call's audio.
    const audioTrack = this.p2p.senders.audio.track;
    if(!this.hasLocalMicrophone(audioTrack)) {
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
    setup: Extract<P2PMessage, {'@type': 'InitialSetup'}>,
    contents: P2PMediaContent[],
    isAnswer: boolean
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
      // Every video codec both ends can use, H.264 ahead of VP8; an answer can
      // only hold what our offer had.
      videoPayloadTypes: filterRemoteVideoPayloadTypes(videoPayloadSource, {
        allowed: isAnswer && localOfferSdp ? localMediaParameters.videoPayloadTypes : undefined
      })?.map(payloadTypeToConference) || localMediaParameters.videoPayloadTypes,
      videoExtensions: videoPayloadSource?.rtpExtensions || localMediaParameters.videoExtensions,
      sectionOrder: isAnswer ? this.getLocalOfferSections() : this.getEstablishedSections(),
      bundleMids: isAnswer && localOfferSdp ? parseBundleMids(localOfferSdp) : undefined,
      shouldKeepRemoteReceiveSection: (section) => this.shouldKeepRemoteReceiveSection(section),
      getEstablishedRemoteSources: isAnswer ? this.getEstablishedRemoteSources() : undefined
    });
  }

  // The peer's outgoing sources per mid, from the remote description in force:
  // what our next remote answer has to keep describing (see SDPBuilder.addP2p).
  private getEstablishedRemoteSources() {
    const sdp = this.p2p?.connection.remoteDescription?.sdp;
    const sources = new Map<string, string[]>();
    if(!sdp) {
      return (): string[] | undefined => undefined;
    }

    parseSdpSections(sdp).forEach((section) => {
      const direction = getSdpDirection(section);
      if(!section.mid || getSdpPort(section) === 0 || (direction !== 'sendrecv' && direction !== 'sendonly')) {
        return;
      }

      const lines = section.lines.filter((line) => line.startsWith('a=ssrc:') || line.startsWith('a=ssrc-group:'));
      if(lines.length) {
        sources.set(section.mid, lines);
      }
    });

    return (mid: string) => sources.get(mid);
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
    return this.hasLocalMicrophone(audioTrack) &&
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
        const appliedExchanges = this.p2p.appliedRemoteExchangeIds.size;
        this.p2p.pendingCandidates.push(...message.candidates.map((candidate): PendingCandidate => {
          return {
            ...candidate,
            exchangeId: message.exchangeId,
            ufrag: message.ufrag || candidate.usernameFragment,
            appliedExchanges
          };
        }));

        const overflow = this.p2p.pendingCandidates.length - P2P_MAX_PENDING_CANDIDATES;
        if(overflow > 0) {
          this.p2p.pendingCandidates.splice(0, overflow);
          this.log.warn('dropping the oldest pending ICE candidates', {overflow});
        }

        await this.commitPendingIceCandidates();
        break;
      }
      case 'InitialSetup': {
        // This is peer-controlled JSON, so the TypeScript shape proves nothing
        // at runtime. Validate both the types and the values before keeping the
        // setup: arrays/objects are especially dangerous because interpolation
        // invokes toString(), which can turn an array element containing CR/LF
        // into a second SDP line.
        if(!isSdpSafeSetup(message)) {
          this.log.error('InitialSetup has invalid transport fields — dropping');
          break;
        }

        // New credentials are the peer's ICE restart (its offer follows);
        // the same ones again — native V2 re-sends its setup when ours
        // changes — only replace an identical value.
        const previousSetup = this.p2p.remoteSetup;
        if(previousSetup && previousSetup.ufrag !== message.ufrag) {
          this.log('peer restarted ICE', {ufrag: message.ufrag, previousUfrag: previousSetup.ufrag});
          this.p2p.stats?.addEvent('peer restarted ICE');
          this.p2p.recovery?.onRemoteRestart();
        }

        this.p2p.remoteSetup = message;
        await this.applyRemoteNegotiation();
        break;
      }
      case 'NegotiateChannels': {
        // Peer-controlled JSON again, and every field of it — codec names,
        // fmtp, rtcp-fb, extmap URIs, ssrc groups and the ssrcs that double as
        // mids — is interpolated into the SDP by SDPBuilder.addP2p. Rejected
        // the way an unsafe InitialSetup is: dropped, never negotiated.
        if(!isSdpSafeString(message.exchangeId) || !isSdpSafeContents(message.contents)) {
          this.log.error('NegotiateChannels has invalid media fields — dropping');
          break;
        }

        if(this.p2p.handledRemoteExchangeIds.has(message.exchangeId)) {
          this.log('ignore duplicate remote negotiation', {
            exchangeId: message.exchangeId
          });
          return;
        }
        if(this.p2p.supersededLocalExchangeIds?.has(message.exchangeId)) {
          this.log('ignore answer to a superseded local negotiation', {
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

          // Glare: the caller wins, our offer is rolled back — and the answer
          // the caller may still send to it, once it gets to it, is stale.
          this.supersedePendingLocalExchange(message.exchangeId);
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
    const candidatesToAdd: PendingCandidate[] = [];
    const queuedCandidates: PendingCandidate[] = [];

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

  private getCandidateCommitDecision(candidate: PendingCandidate): 'add' | 'queue' | 'drop' {
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

      // The peer's candidates for its answer to an offer we replaced: still
      // its ICE session unless its credentials have moved on since. Ones that
      // match the setup it sent last wait for the description carrying it.
      if(this.p2p.supersededLocalExchangeIds?.has(candidateExchangeId)) {
        if(isCurrentUfrag) return 'add';
        return candidateUfrag && candidateUfrag === this.p2p.remoteSetup?.ufrag ? 'queue' : 'drop';
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

      // Nothing has claimed this exchange, and a newer one has been applied
      // since the candidate was queued: its negotiation was superseded (or
      // never existed) and the candidate would otherwise wait forever.
      if(this.p2p.appliedRemoteExchangeIds.size > candidate.appliedExchanges) {
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
