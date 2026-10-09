/*
 * Pure helpers for the tgcalls v2 P2P signaling engine: media-stream and ICE
 * candidate utilities, SDP parsing and content/SSRC building. All functions
 * here are `this`-free; everything that touches CallInstance state lives in
 * callInstance.ts.
 */

import {Logger} from '@lib/logger';
import {appSettings} from '@stores/appSettings';
import getStream from '@lib/calls/helpers/getStream';
import getVideoConstraints from '@lib/calls/helpers/getVideoConstraints';
import getScreenConstraints from '@lib/calls/helpers/getScreenConstraints';
import getScreenStream from '@lib/calls/helpers/getScreenStream';
import {
  findSdpLineValue as findLineValue,
  getSdpDirection,
  getSdpPort,
  parseExtmaps,
  parseFingerprints,
  parseFmtpParameters,
  parsePayloadTypes,
  parseSdpSections,
  parseSsrcGroups,
  parseSsrcs,
  summarizeSdp,
  parseBundleMids,
  SdpSection
} from '@lib/calls/p2P/sdpCommon';
import {P2PMediaContent, P2PMessage, P2PPayloadType, PayloadType, RtpHdrexts} from '@lib/calls/types';

export const IS_ECHO_CANCELLATION_SUPPORTED = navigator?.mediaDevices?.getSupportedConstraints().echoCancellation;
export const IS_NOISE_SUPPRESSION_SUPPORTED = navigator?.mediaDevices?.getSupportedConstraints().noiseSuppression;

// ===== Types =====

export type StreamType = 'audio' | 'video' | 'presentation';

export type Connection = {
  ip: string,
  ipv6?: string,
  port: number,
  username: string,
  password: string,
  isTurn: boolean,
  isStun: boolean
};

export type SsrcGroup = {
  semantics?: string,
  sources: (string | number)[]
};

export type ConferenceSsrc = {
  isVideo: boolean,
  isPresentation: boolean,
  isMain: boolean,
  isRemoved?: boolean,
  userId: string,
  endpoint: string,
  mid: string,
  sourceGroups: SsrcGroup[]
};

export type Conference = {
  audioPayloadTypes: PayloadType[],
  audioExtensions: RtpHdrexts[],
  videoPayloadTypes: PayloadType[],
  videoExtensions: RtpHdrexts[],
  ssrcs: ConferenceSsrc[]
};

export type MediaMids = {
  audio: string;
  video: string;
  presentation: string;
  data: string;
};

export type ActiveLocalMedia = {
  hasVideo: boolean;
  hasPresentation: boolean;
};

export type SsrcEntry = ConferenceSsrc & {
  direction?: RTCRtpTransceiverDirection;
  isLocalOnly?: boolean;
};

type CandidatesMessage = Extract<P2PMessage, {'@type': 'Candidates'}>;

export type QueuedCandidate = CandidatesMessage['candidates'][number] & Pick<CandidatesMessage, 'exchangeId' | 'ufrag'>;

// ===== Payload-type conversion =====

// Convert a signaling payload type (feedbackTypes) into the SDP-builder shape (rtcp-fbs).
export function payloadTypeToConference(payloadType: P2PPayloadType): PayloadType {
  return {
    'id': payloadType.id,
    'name': payloadType.name,
    'clockrate': payloadType.clockrate,
    'channels': payloadType.channels,
    'parameters': payloadType.parameters,
    'rtcp-fbs': payloadType.feedbackTypes
  };
}

// ===== Media-stream helpers =====

// The camera at 720p30 (the group-call constraints; native tgcalls captures
// 1280×720 at 30 fps too), on the device picked in "Speakers and Camera".
// `facingMode` only matters on mobile (front vs rear camera) — paired with an
// explicit `deviceId: {exact: ...}` it can produce OverconstrainedError on
// desktop where the chosen camera doesn't advertise a facingMode. Pick ONE:
// prefer the explicit deviceId, fall back to facingMode.
export function getP2pVideoConstraints(facing: VideoFacingModeEnum = 'user', deviceId?: string): MediaTrackConstraints {
  const constraints = getVideoConstraints(deviceId);
  if(!constraints.deviceId) {
    constraints.facingMode = facing;
  }

  return constraints;
}

export function getUserStream(streamType: StreamType, facing: VideoFacingModeEnum = 'user'): Promise<MediaStream> {
  if(streamType === 'presentation') {
    // Capped at 1080p30 with a 'text' content hint, exactly as a group call
    // shares its screen.
    return getScreenStream(getScreenConstraints(true));
  }

  // Honour the device picked in the in-call settings popup / "Speakers and
  // Camera" tab. Without this, toggling video off/on (or accepting an
  // incoming call) re-grabs the OS-default camera regardless of what the
  // user picked. Group calls already route their constraints through the
  // shared get*Constraints helpers — do the same for P2P so the two paths
  // stay in sync.
  const audioId = appSettings.callDevices?.microphoneId;
  const audio = streamType === 'audio' ? {
    echoCancellation: IS_ECHO_CANCELLATION_SUPPORTED ? true : undefined,
    noiseSuppression: IS_NOISE_SUPPRESSION_SUPPORTED ?
      (appSettings.callDevices?.noiseSuppression ?? true) :
      undefined,
    deviceId: audioId ? {exact: audioId} : undefined
  } : false;

  const video = streamType === 'video' ? getP2pVideoConstraints(facing) : false;

  // Stale-deviceId recovery and incremental retry live inside `getStream`.
  return getStream({audio, video});
}

export function getStreamTrack(stream: MediaStream | undefined) {
  return stream?.getTracks()[0];
}

export function hasLiveTrack(stream: MediaStream | undefined) {
  return getStreamTrack(stream)?.readyState === 'live';
}

export function stopStream(stream?: MediaStream, except?: MediaStream) {
  if(!stream || stream === except) {
    return;
  }

  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

// ===== ICE servers / candidates =====

export function buildIceServers(connections: Connection[], isP2p: boolean) {
  const servers: RTCIceServer[] = [];

  connections.forEach((connection) => {
    const urls: string[] = [];
    if(connection.isTurn) {
      urls.push(buildIceServerUrl('turn', connection.ip, connection.port));
      if(connection.ipv6) {
        urls.push(buildIceServerUrl('turn', connection.ipv6, connection.port));
      }
    }
    if(isP2p && connection.isStun) {
      urls.push(buildIceServerUrl('stun', connection.ip, connection.port));
      if(connection.ipv6) {
        urls.push(buildIceServerUrl('stun', connection.ipv6, connection.port));
      }
    }

    if(!urls.length) {
      return;
    }

    servers.push({
      urls,
      username: connection.username,
      credential: connection.password
    });
  });

  return servers;
}

function buildIceServerUrl(protocol: 'stun' | 'turn', host: string, port: number) {
  const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `${protocol}:${formattedHost}:${port}`;
}

export async function addIceCandidate(log: Logger, connection: RTCPeerConnection, candidate: RTCIceCandidateInit) {
  try {
    await connection.addIceCandidate(candidate);
  } catch(error) {
    log.warn('failed to add ICE candidate', {
      candidate,
      remoteSdpSummary: getRemoteSdpSummary(connection),
      errorName: error instanceof Error ? error.name : undefined,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function tryAddCandidate(
  log: Logger,
  connection: RTCPeerConnection,
  candidate: QueuedCandidate
) {
  const sdpString = normalizeCandidateComponent(candidate.sdpString);
  if(!sdpString) {
    return;
  }

  const rtcCandidate: RTCIceCandidateInit = {
    candidate: sdpString,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: getCandidateUfrag(candidate)
  };

  if(
    !rtcCandidate.sdpMid &&
    (rtcCandidate.sdpMLineIndex === undefined || rtcCandidate.sdpMLineIndex === null)
  ) {
    const fallbackMLineIndex = getLegacyCandidateMLineIndex(connection);
    if(fallbackMLineIndex === undefined) {
      log('drop ICE candidate without media id', {
        candidate: rtcCandidate,
        remoteSdpSummary: getRemoteSdpSummary(connection)
      });
      return;
    }

    rtcCandidate.sdpMLineIndex = fallbackMLineIndex;
  }

  await addIceCandidate(log, connection, rtcCandidate);
}

export function getCandidateUfrag(candidate: QueuedCandidate) {
  return candidate.ufrag || candidate.usernameFragment || undefined;
}

export function getRemoteDescriptionUfrags(connection: RTCPeerConnection) {
  const sdp = connection.remoteDescription?.sdp;
  if(!sdp) {
    return new Set<string>();
  }

  const sections = parseSdpSections(sdp);
  const ufrags = new Set<string>();
  sections.forEach((section) => {
    const ufrag = findLineValue(sections, 'a=ice-ufrag:', section);
    if(ufrag) {
      ufrags.add(ufrag);
    }
  });

  return ufrags;
}

export function getRemoteDescriptionMids(connection: RTCPeerConnection) {
  const sdp = connection.remoteDescription?.sdp;
  if(!sdp) {
    return [];
  }

  const sections = parseSdpSections(sdp);
  return sections.filter((section) => {
    return section.kind !== 'session';
  }).map((section, index) => {
    return {
      index,
      kind: section.kind,
      mid: section.mid,
      port: getSdpPort(section),
      ufrag: findLineValue(sections, 'a=ice-ufrag:', section)
    };
  });
}

export function getRemoteSdpSummary(connection: RTCPeerConnection) {
  const sdp = connection.remoteDescription?.sdp;
  return sdp ? summarizeSdp(sdp) : undefined;
}

export function normalizeCandidateComponent(sdpString?: string) {
  if(!sdpString) {
    return undefined;
  }

  const component = sdpString.match(/^candidate:\S+ (\d+) /)?.[1];
  if(component === '2') {
    return undefined;
  }

  return sdpString;
}

export function getLegacyCandidateMLineIndex(connection: RTCPeerConnection) {
  const sdp = connection.remoteDescription?.sdp;
  if(!sdp) {
    return undefined;
  }

  const mediaSections = parseSdpSections(sdp).filter((section) => {
    return section.kind !== 'session';
  });
  const activeMediaSections = mediaSections.filter((section) => {
    return getSdpPort(section) !== 0;
  });
  const activeRtpMediaSections = activeMediaSections.filter((section) => {
    return section.kind === 'audio' || section.kind === 'video';
  });

  if(activeMediaSections.length === 1) {
    return mediaSections.indexOf(activeMediaSections[0]);
  }

  if(activeRtpMediaSections.length === 1 && activeMediaSections.every((section) => {
    return section.kind === 'application' || section === activeRtpMediaSections[0];
  })) {
    return mediaSections.indexOf(activeRtpMediaSections[0]);
  }

  return undefined;
}

// ===== SDP / content parsing =====

export function getDefaultAudioPayloadTypes(): Conference['audioPayloadTypes'] {
  return [{
    id: 111,
    name: 'opus',
    clockrate: 48000,
    channels: 2,
    parameters: {
      minptime: 10,
      useinbandfec: 1
    }
  }];
}

export function getDefaultVideoPayloadTypes(): Conference['videoPayloadTypes'] {
  return [{
    id: 96,
    name: 'VP8',
    clockrate: 90000,
    channels: 0
  }];
}

export function orderMediaContents(contents: P2PMediaContent[]) {
  const audioContent = contents.find((content) => content.type === 'audio');
  const videoContents = contents.filter((content) => content.type === 'video');
  return [audioContent, videoContents[0], videoContents[1]];
}

export function buildSsrc(
  content: P2PMediaContent | undefined,
  mid: string,
  isVideo: boolean,
  isPresentation = false
): SsrcEntry {
  if(!content) {
    return {
      isVideo,
      isPresentation,
      isMain: false,
      isRemoved: true,
      userId: '0',
      endpoint: mid,
      mid,
      sourceGroups: []
    };
  }

  const ssrcGroups = content.ssrcGroups || [];
  const sourceGroups: SsrcGroup[] = ssrcGroups.length ? ssrcGroups.map((group) => {
    return {
      semantics: group.semantics,
      sources: group.ssrcs
    };
  }) : [{
    sources: [Number(content.ssrc)]
  }];

  return {
    isVideo,
    isPresentation,
    isMain: false,
    userId: '0',
    endpoint: mid,
    mid,
    sourceGroups
  };
}

export function parseInitialSetup(sdp: string): Extract<P2PMessage, {'@type': 'InitialSetup'}> {
  const sections = parseSdpSections(sdp);
  const ufrag = findLineValue(sections, 'a=ice-ufrag:');
  const pwd = findLineValue(sections, 'a=ice-pwd:');
  const fingerprints = parseFingerprints(sections);
  const iceOptions = findLineValue(sections, 'a=ice-options:');

  if(!ufrag || !pwd || !fingerprints.length) {
    throw Error('Failed parsing SDP transport setup');
  }

  return {
    '@type': 'InitialSetup',
    ufrag,
    pwd,
    'renomination': Boolean(iceOptions?.split(' ').includes('renomination')),
    fingerprints
  };
}

export function parseMediaContent(
  section: SdpSection,
  type: P2PMediaContent['type'],
  fallbackContent?: P2PMediaContent
): P2PMediaContent {
  const ssrcGroups = parseSsrcGroups(section);
  const ssrc = ssrcGroups[0]?.ssrcs[0] || parseSsrcs(section)[0] || Number(fallbackContent?.ssrc);

  if(!ssrc) {
    throw Error('Failed parsing SDP media SSRC');
  }

  return {
    type,
    ssrc: fallbackContent?.ssrc || String(ssrc),
    ssrcGroups: fallbackContent ? fallbackContent.ssrcGroups || [] : ssrcGroups,
    payloadTypes: parsePayloadTypes(section),
    rtpExtensions: parseExtmaps(section)
  };
}

export function parseMediaContents(sdp: string, mids: MediaMids, activeMedia?: ActiveLocalMedia): P2PMediaContent[] {
  const sections = parseSdpSections(sdp);
  const contents: P2PMediaContent[] = [];
  const audioSection = sections.find((section) => section.mid === mids.audio);
  const videoSection = sections.find((section) => section.mid === mids.video);
  const presentationSection = sections.find((section) => section.mid === mids.presentation);

  if(audioSection) {
    contents.push(parseMediaContent(audioSection, 'audio'));
  }
  if(videoSection && activeMedia?.hasVideo !== false) {
    contents.push(parseMediaContent(videoSection, 'video'));
  }
  if(presentationSection && activeMedia?.hasPresentation !== false) {
    contents.push(parseMediaContent(presentationSection, 'video'));
  }

  return contents;
}

export function parseMediaContentMids(sdp: string, contents: P2PMediaContent[]) {
  const sections = parseSdpSections(sdp);
  const midsBySsrc: Record<string, string> = {};

  contents.forEach((content) => {
    const section = sections.find((item) => {
      return item.mid && parseSsrcs(item).includes(Number(content.ssrc));
    });
    if(section?.mid) {
      midsBySsrc[content.ssrc] = section.mid;
    }
  });

  return midsBySsrc;
}

// ===== Video codec selection =====

// What the browser can encode and decode, from RTCRtpSender/RTCRtpReceiver
// .getCapabilities('video'). Kept as a plain shape so the selection is testable.
export type VideoCodecCapability = {mimeType: string, sdpFmtpLine?: string};
export type VideoCodecCapabilities = {
  send: VideoCodecCapability[],
  receive: VideoCodecCapability[]
};

export function getVideoCodecCapabilities(): VideoCodecCapabilities {
  const get = (source: {getCapabilities?: (kind: string) => RTCRtpCapabilities | null} | undefined) => {
    try {
      return source?.getCapabilities?.('video')?.codecs || [];
    } catch{
      return [];
    }
  };

  return {
    send: get(typeof(RTCRtpSender) !== 'undefined' ? RTCRtpSender : undefined),
    receive: get(typeof(RTCRtpReceiver) !== 'undefined' ? RTCRtpReceiver : undefined)
  };
}

const RTX_CODEC = 'RTX';
// Redundancy/FEC "codecs": never chosen as the media codec, kept alongside it
// when both ends support them (webrtc's media engine advertises red + ulpfec,
// and flexfec-03 behind a field trial — native tgcalls offers whatever its
// engine lists, v2/ContentNegotiation.cpp copyCodecsFromChannelManager).
const FEC_CODECS = new Set(['RED', 'ULPFEC', 'FLEXFEC-03']);

// webrtc api/video_codecs/h264_profile_level_id.cc kProfilePatterns: the
// profile is profile_idc plus a mask over the profile-iop constraint bits
// (MSB first, 'x' = don't care). Two H.264 formats interoperate when their
// profiles and packetization modes match; levels may differ (the peer and
// the browser both set level-asymmetry-allowed).
const H264_PROFILE_PATTERNS: [profileIdc: number, iopPattern: string, profile: string][] = [
  [0x42, 'x1xx0000', 'constrained-baseline'],
  [0x4D, '1xxx0000', 'constrained-baseline'],
  [0x58, '11xx0000', 'constrained-baseline'],
  [0x42, 'x0xx0000', 'baseline'],
  [0x58, '10xx0000', 'baseline'],
  [0x4D, '0x0x0000', 'main'],
  [0x64, '00000000', 'high'],
  [0x64, '00001100', 'constrained-high'],
  [0xF4, '00000000', 'predictive-high-444']
];

export function getH264Profile(profileLevelId: string | undefined): string | undefined {
  // No profile-level-id means Constrained Baseline (RFC 6184 / webrtc default).
  const id = profileLevelId ?? '42e01f';
  if(!/^[0-9a-f]{6}$/i.test(id)) {
    return undefined;
  }

  const profileIdc = parseInt(id.slice(0, 2), 16);
  const profileIop = parseInt(id.slice(2, 4), 16);
  const pattern = H264_PROFILE_PATTERNS.find(([idc, iopPattern]) => {
    return idc === profileIdc && [...iopPattern].every((bit, index) => {
      return bit === 'x' || +bit === ((profileIop >> (7 - index)) & 1);
    });
  });

  return pattern?.[2];
}

// Codec parameters keyed in lower case, so the browser's capabilities and the
// peer's JSON compare whatever case either uses.
function toLowerCaseParameters(parameters: Record<string, string | number> | undefined) {
  const result: Record<string, string> = {};
  Object.entries(parameters || {}).forEach(([key, value]) => {
    result[key.toLowerCase()] = String(value);
  });
  return result;
}

function parseFmtpLine(line: string | undefined) {
  return toLowerCaseParameters(parseFmtpParameters(line));
}

function getPayloadParameters(payloadType: P2PPayloadType) {
  return toLowerCaseParameters(payloadType.parameters as Record<string, string | number>);
}

function getCapabilityName(capability: VideoCodecCapability) {
  return capability.mimeType.split('/')[1]?.toUpperCase();
}

// The format-defining fmtp parameters per codec (webrtc IsSameCodecSpecific).
function isSameVideoFormat(name: string, a: Record<string, string>, b: Record<string, string>) {
  const same = (key: string, fallback: string) => (a[key] ?? fallback) === (b[key] ?? fallback);
  switch(name) {
    case 'H264': {
      const profile = getH264Profile(a['profile-level-id']);
      return !!profile && profile === getH264Profile(b['profile-level-id']) && same('packetization-mode', '0');
    }
    case 'VP9':
      return same('profile-id', '0');
    case 'AV1':
      return same('profile', '0');
    case 'H265':
      return same('profile-id', '1') && same('tier-flag', '0');
    default:
      return true;
  }
}

function isVideoFormatSupported(
  name: string,
  parameters: Record<string, string>,
  capabilities: VideoCodecCapability[]
) {
  return capabilities.some((capability) => {
    return getCapabilityName(capability) === name &&
      isSameVideoFormat(name, parameters, parseFmtpLine(capability.sdpFmtpLine));
  });
}

// The pre-2026-10 selection: VP8 (or else the first codec the browser can
// decode) plus its RTX, nothing else. Still what a peer that offers no other
// usable codec gets, byte for byte.
function selectLegacyVideoPayloadTypes(payloadTypes: P2PPayloadType[], capabilities: VideoCodecCapabilities) {
  const supportedNames = new Set(capabilities.receive.map(getCapabilityName).filter(Boolean));
  const preferredCodec = payloadTypes.find((payloadType) => {
    return payloadType.name.toUpperCase() === 'VP8' && supportedNames.has('VP8');
  }) || payloadTypes.find((payloadType) => {
    return payloadType.name.toUpperCase() !== RTX_CODEC && supportedNames.has(payloadType.name.toUpperCase());
  });

  if(!preferredCodec) {
    return undefined;
  }

  const result = [preferredCodec];
  const rtxPayload = payloadTypes.find((payloadType) => {
    return payloadType.name.toUpperCase() === RTX_CODEC && Number(payloadType.parameters?.apt) === preferredCodec.id;
  });
  if(rtxPayload) {
    result.push(rtxPayload);
  }

  return result;
}

/**
 * The peer's video payload types this browser can both send and receive, for
 * the remote description we build out of its NegotiateChannels.
 *
 * - Every codec the browser can encode AND decode is kept (H.264 matched by
 *   profile and packetization-mode), in the peer's order — except that H.264
 *   goes ahead of VP8 when both are usable: the order is the preference, the
 *   browser sends the first codec of it, and native peers encode and decode
 *   H.264 in hardware (v2/InstanceV2Impl.cpp: H.265, then H.264 first).
 * - Each kept codec keeps its RTX; red/ulpfec/flexfec only when the peer lists
 *   them and the browser supports them both ways.
 * - `allowed`: on an answer, the payload types of our own offer — the peer can
 *   only accept what we offered, anything else would fail setRemoteDescription.
 * - When VP8 is the only usable codec, the result is what it always was.
 */
export function filterRemoteVideoPayloadTypes(
  content: P2PMediaContent | undefined,
  options: {
    capabilities?: VideoCodecCapabilities,
    allowed?: Pick<P2PPayloadType, 'id' | 'name'>[]
  } = {}
): P2PPayloadType[] | undefined {
  let payloadTypes = content?.payloadTypes;
  if(options.allowed && payloadTypes) {
    payloadTypes = payloadTypes.filter((payloadType) => options.allowed.some((allowed) => {
      return allowed.id === payloadType.id && allowed.name.toUpperCase() === payloadType.name.toUpperCase();
    }));
  }

  if(!payloadTypes?.length) {
    return undefined;
  }

  const capabilities = options.capabilities || getVideoCodecCapabilities();
  const isSupported = (payloadType: P2PPayloadType) => {
    const name = payloadType.name.toUpperCase();
    const parameters = getPayloadParameters(payloadType);
    return isVideoFormatSupported(name, parameters, capabilities.send) &&
      isVideoFormatSupported(name, parameters, capabilities.receive);
  };
  const getRtx = (payloadType: P2PPayloadType) => payloadTypes.find((item) => {
    return item.name.toUpperCase() === RTX_CODEC && Number(item.parameters?.apt) === payloadType.id;
  });

  const codecs = payloadTypes.filter((payloadType) => {
    const name = payloadType.name.toUpperCase();
    return name !== RTX_CODEC && !FEC_CODECS.has(name) && isSupported(payloadType);
  });

  if(!codecs.length || codecs.every((payloadType) => payloadType.name.toUpperCase() === 'VP8')) {
    return selectLegacyVideoPayloadTypes(payloadTypes, capabilities);
  }

  const firstVp8Index = codecs.findIndex((payloadType) => payloadType.name.toUpperCase() === 'VP8');
  if(firstVp8Index !== -1) {
    const h264 = codecs.filter((payloadType, index) => index > firstVp8Index && payloadType.name.toUpperCase() === 'H264');
    h264.forEach((payloadType) => codecs.splice(codecs.indexOf(payloadType), 1));
    codecs.splice(firstVp8Index, 0, ...h264);
  }

  const canSendRtx = isSupported({id: 0, name: RTX_CODEC, clockrate: 90000});
  const result: P2PPayloadType[] = [];
  const pushWithRtx = (payloadType: P2PPayloadType) => {
    result.push(payloadType);
    const rtx = canSendRtx && getRtx(payloadType);
    if(rtx) {
      result.push(rtx);
    }
  };

  codecs.forEach(pushWithRtx);
  payloadTypes.filter((payloadType) => FEC_CODECS.has(payloadType.name.toUpperCase()) && isSupported(payloadType))
  .forEach(pushWithRtx);

  return result;
}

function summarizeValidationMLine(section: SdpSection, bundleMids: Set<string>) {
  return {
    kind: section.kind,
    mid: section.mid,
    port: getSdpPort(section),
    direction: getSdpDirection(section),
    hasRtcpMux: section.lines.includes('a=rtcp-mux'),
    hasBundleOnly: section.lines.includes('a=bundle-only'),
    isBundled: Boolean(section.mid && bundleMids.has(section.mid))
  };
}

export function validateRemoteAnswerSdp(log: Logger, offerSdp: string | undefined, answerSdp: string) {
  if(!offerSdp) {
    return;
  }

  const offerBundleMids = new Set(parseBundleMids(offerSdp) || []);
  const answerBundleMids = new Set(parseBundleMids(answerSdp) || []);
  const offerSections = parseSdpSections(offerSdp).filter((section) => section.kind !== 'session');
  const answerSections = parseSdpSections(answerSdp).filter((section) => section.kind !== 'session');
  const mLines = offerSections.map((offerSection, index) => {
    const answerSection = answerSections[index];
    return {
      index,
      offer: summarizeValidationMLine(offerSection, offerBundleMids),
      answer: answerSection ? summarizeValidationMLine(answerSection, answerBundleMids) : undefined
    };
  });
  const issues = mLines.flatMap(({answer, index, offer}) => {
    if(!answer) {
      return [`m-line ${index} is missing in answer`];
    }

    const result: string[] = [];
    if(answer.mid !== offer.mid) {
      result.push(`m-line ${index} mid mismatch`);
    }
    if(answer.port !== 0 && !answer.isBundled) {
      result.push(`m-line ${index} is active but not bundled`);
    }
    if(offer.port === 0 && !offer.hasBundleOnly && answer.port !== 0) {
      result.push(`m-line ${index} answer activates rejected offer section`);
    }
    if(answer.port !== 0 && answer.hasBundleOnly) {
      result.push(`m-line ${index} active answer m-line has bundle-only`);
    }
    if(answer.port !== 0 && (answer.kind === 'audio' || answer.kind === 'video') && !answer.hasRtcpMux) {
      result.push(`m-line ${index} is active RTP without rtcp-mux`);
    }
    if(answer.port !== 0 && answer.kind === 'video' && answer.direction !== 'recvonly' &&
      answer.direction !== 'sendrecv') {
      result.push(`m-line ${index} active video direction is ${answer.direction || 'missing'}`);
    }
    if(answer.port !== 0 && offer.port !== 0 && !offer.isBundled) {
      result.push(`m-line ${index} answers an unbundled offer section`);
    }

    return result;
  });
  const data = {
    mLines,
    issues
  };

  if(issues.length) {
    log.warn('remote answer SDP validation failed', data);
  } else {
    log('remote answer SDP validation passed', data);
  }
}

// ===== Summaries / debug =====

export function summarizeTrack(track: MediaStreamTrack | undefined) {
  if(!track) {
    return undefined;
  }

  return {
    id: track.id,
    kind: track.kind,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
    label: track.label
  };
}

export function summarizeContents(contents: P2PMediaContent[]) {
  return contents.map((content, index) => {
    return {
      index,
      type: content.type,
      ssrc: content.ssrc,
      ssrcGroups: content.ssrcGroups?.map((group) => {
        return {
          semantics: group.semantics,
          count: group.ssrcs.length
        };
      }) || [],
      payloads: content.payloadTypes?.map((payload) => {
        return `${payload.id}:${payload.name}`;
      }) || [],
      extensions: content.rtpExtensions?.map((extension) => {
        return `${extension.id}:${extension.uri}`;
      }) || []
    };
  });
}
