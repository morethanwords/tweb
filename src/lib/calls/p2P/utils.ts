/*
 * Pure helpers for the tgcalls v2 P2P signaling engine: media-stream and ICE
 * candidate utilities, SDP parsing and content/SSRC building. All functions
 * here are `this`-free; everything that touches CallInstance state lives in
 * callInstance.ts.
 */

import {Logger} from '@lib/logger';
import {appSettings} from '@stores/appSettings';
import getStream from '@lib/calls/helpers/getStream';
import {
  findSdpLineValue as findLineValue,
  getSdpDirection,
  getSdpPort,
  parseExtmaps,
  parseFingerprints,
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

type CandidatesMessage = Extract<P2PMessage, { '@type': 'Candidates' }>;

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

export function getUserStream(streamType: StreamType, facing: VideoFacingModeEnum = 'user') {
  if(streamType === 'presentation') {
    return (navigator.mediaDevices as any).getDisplayMedia({
      audio: false,
      video: true
    });
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

  // `facingMode` only matters on mobile (front vs rear camera) — paired with
  // an explicit `deviceId: {exact: ...}` it can produce OverconstrainedError
  // on desktop where the chosen camera doesn't advertise a facingMode. Pick
  // ONE: prefer the explicit deviceId, fall back to facingMode.
  const videoId = appSettings.callDevices?.cameraId;
  const video = streamType === 'video' ? (
    videoId ?
      {deviceId: {exact: videoId}} :
      {facingMode: facing}
  ) : false;

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
  candidate: QueuedCandidate,
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
  isPresentation = false,
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

export function parseInitialSetup(sdp: string): Extract<P2PMessage, { '@type': 'InitialSetup' }> {
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
  fallbackContent?: P2PMediaContent,
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

export function filterRemoteVideoPayloadTypes(content: P2PMediaContent | undefined) {
  const payloadTypes = content?.payloadTypes;
  if(!payloadTypes?.length) {
    return undefined;
  }

  const supportedCodecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];
  const supportedNames = new Set(supportedCodecs.map((codec) => {
    return codec.mimeType.split('/')[1]?.toUpperCase();
  }).filter(Boolean));
  const preferredCodec = payloadTypes.find((payloadType) => {
    return payloadType.name.toUpperCase() === 'VP8' && supportedNames.has('VP8');
  }) || payloadTypes.find((payloadType) => {
    return payloadType.name.toUpperCase() !== 'RTX' && supportedNames.has(payloadType.name.toUpperCase());
  });

  if(!preferredCodec) {
    return undefined;
  }

  const result = [preferredCodec];
  const rtxPayload = payloadTypes.find((payloadType) => {
    return payloadType.name.toUpperCase() === 'RTX' && Number(payloadType.parameters?.apt) === preferredCodec.id;
  });
  if(rtxPayload) {
    result.push(rtxPayload);
  }

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
