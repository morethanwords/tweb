import {GroupCallParticipant, GroupCallParticipantVideoSourceGroup} from '../../layer';
import type {logger} from '../logger';
import {WebRTCLineType} from './sdpBuilder';

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

// * Peer-to-Peer
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

export type P2PAudioCodec = {
  payloadTypes: Array<P2PPayloadType>,
  rtpExtensions: Array<RtpHdrexts>,
  ssrc: string,
};

export type P2PVideoCodec = P2PAudioCodec & {
  ssrcGroups: {semantics: string, ssrcs: string[]}[]
};

export type CallSignalingData = CallSignalingData.candidates | CallSignalingData.initialSetup;
export namespace CallSignalingData {
  export type candidates = {
    '@type': 'Candidates',
    candidates: {
      sdpString: string
    }[]
  };

  export type initialSetup = {
    '@type': 'InitialSetup',
    audio: P2PAudioCodec,
    fingerprints: GroupCallConnectionTransport['fingerprints'],
    pwd: string,
    ufrag: string,
    video: P2PVideoCodec,
    screencast?: P2PVideoCodec
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
