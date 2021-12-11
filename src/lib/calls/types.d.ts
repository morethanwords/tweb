import { GroupCallParticipant, GroupCallParticipantVideoSourceGroup } from "../../layer";
import type { logger } from "../logger";
import { WebRTCLineType } from "./sdpBuilder";

export type GroupCallConnectionTransport = {
  candidates: {
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
  xmlns: string,
  ufrag: string,
  'rtcp-mux': boolean,
  pwd: string,
  fingerprints: {
    fingerprint: string,
    setup: string,
    hash: string
  }[]
};

export type Ssrc = {
  // isRemoved?: boolean,
  source: number,
  sourceGroups?: GroupCallParticipantVideoSourceGroup[],
  type: WebRTCLineType,
  endpoint?: string,
  // isMain?: boolean,
  // doNotOffer?: boolean,
  // transceiver?: RTCRtpTransceiver
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
  video: VideoCodec
};

export type UpgradeGroupCallConnectionPresentationData = Omit<UpdateGroupCallConnectionData, 'audio'>;

export type SdpConference = {
  sessionId: number,
  transport: GroupCallConnectionTransport,
  ssrcs: Ssrc[]
};

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
