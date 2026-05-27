import {GroupCallParticipant, GroupCallParticipantVideoSourceGroup} from '@layer';
import type {logger} from '@lib/logger';
import {WebRTCLineType} from '@lib/calls/sdpBuilder';

export type GroupCallConnectionTransport = {
  candidates?: {
    generation: string,
    component: string,
    protocol: string,
    port: string,
    ip: string,
    foundation: string,
    id: string,
    priority: string,
    type: string,
    network: string,
    'rel-addr'?: string,
    'rel-port'?: string
  }[],
  xmlns?: string,
  ufrag: string,
  'rtcp-mux'?: boolean,
  pwd: string,
  fingerprints: {
    fingerprint: string,
    setup: string,
    hash: string
  }[]
};

export type Ssrc = {
  source: number,
  sourceGroups?: GroupCallParticipantVideoSourceGroup[],
  type: WebRTCLineType,
  endpoint?: string
};

export type RtcpFbs = {
  type: string,
  subtype?: string
};

export type PayloadType = {
  id: number,
  name: string,
  clockrate: number,
  channels?: number,
  parameters?: {
    [k in string]: string | number
  } | [],
  'rtcp-fbs'?: Array<RtcpFbs>
};

export type RtpHdrexts = {
  id: number,
  uri: string
};

export type Codec = AudioCodec | VideoCodec;

export type AudioCodec = {
  'payload-types': Array<PayloadType>,
  'rtp-hdrexts': Array<RtpHdrexts>
};

export type VideoCodec = {
  endpoint: string,
  'payload-types': Array<PayloadType>,
  'rtp-hdrexts': Array<RtpHdrexts>,
  server_sources?: number[]
};

export type UpdateGroupCallConnectionData = {
  transport: GroupCallConnectionTransport,
  audio?: AudioCodec,
  video: VideoCodec,
  screencast?: VideoCodec
};

export type UpgradeGroupCallConnectionPresentationData = Omit<UpdateGroupCallConnectionData, 'audio'>;

// * Peer-to-Peer — tgcalls v2 signaling protocol (NegotiateChannels)
export type P2PPayloadType = {
  id: number,
  name: string,
  clockrate: number,
  channels?: number,
  feedbackTypes?: Array<RtcpFbs>,
  parameters?: {
    [k in string]: string | number
  },
};

export type P2PSsrcGroup = {
  semantics: string,
  // strings on the wire per tgcalls; tolerate numbers too (telegram-tt emits numbers)
  ssrcs: (string | number)[]
};

export type P2PFingerprint = {
  hash: string,
  setup: string,
  fingerprint: string
};

// A single negotiated media channel (audio / camera video / screencast video).
export type P2PMediaContent = {
  type: 'audio' | 'video',
  ssrc: string,
  ssrcGroups?: P2PSsrcGroup[],
  payloadTypes?: P2PPayloadType[],
  rtpExtensions?: RtpHdrexts[]
};

export type CallSignalingData =
  CallSignalingData.candidates |
  CallSignalingData.initialSetup |
  CallSignalingData.negotiateChannels;
export namespace CallSignalingData {
  export type candidate = {
    sdpString: string,
    sdpMid?: string,
    sdpMLineIndex?: number,
    usernameFragment?: string
  };

  export type candidates = {
    '@type': 'Candidates',
    candidates: candidate[],
    exchangeId?: string,
    ufrag?: string
  };

  export type initialSetup = {
    '@type': 'InitialSetup',
    ufrag: string,
    pwd: string,
    renomination: boolean,
    fingerprints: P2PFingerprint[]
  };

  export type negotiateChannels = {
    '@type': 'NegotiateChannels',
    exchangeId: string,
    contents: P2PMediaContent[]
  };
}

export type CallMediaState = {
  '@type': 'MediaState',
  type?: 'input' | 'output',
  lowBattery: boolean,
  muted: boolean,
  screencastState: 'active' | 'inactive',
  videoRotation: number,
  videoState: CallMediaState['screencastState']
};

// Any message exchanged over the P2P call: signaling messages travel encrypted
// through phone.sendSignalingData, MediaState travels over the WebRTC data channel.
export type P2PMessage = CallSignalingData | CallMediaState;

export type DiffieHellmanInfo = DiffieHellmanInfo.a | DiffieHellmanInfo.b;

export namespace DiffieHellmanInfo {
  export type a = {
    a: Uint8Array,
    g_a: Uint8Array,
    g_a_hash: Uint8Array,
    p: Uint8Array,
  };

  export type b = {
    b: Uint8Array,
    g_b: Uint8Array,
    g_b_hash: Uint8Array,
    p: Uint8Array,
  };
}

export type CallType = 'video' | 'voice';
// * Peer-to-Peer end

declare global {
  /* interface HTMLMediaElement {
    e?: string;
  } */

  interface MediaStream {
    source?: string;
  }

  interface RTCPeerConnection {
    log: ReturnType<typeof logger>;
  }

  interface RTCDataChannel {
    log: ReturnType<typeof logger>;
  }

  interface HTMLAudioElement {
    connection?: RTCPeerConnection;
  }
}
