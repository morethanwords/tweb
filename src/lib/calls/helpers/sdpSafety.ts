/*
 * Guards for strings that get interpolated into an SDP we hand to the browser.
 *
 * SDP is line-oriented: a CR or LF inside an attribute value ends that line
 * early and everything after it is parsed as further SDP. On the P2P (1-on-1)
 * path the remote peer supplies ufrag / pwd / fingerprint directly, so without
 * this the peer writes our session description rather than just their half of
 * it (sdpBuilder addTransport interpolates all of them verbatim).
 *
 * These fields have no legitimate use for a line break, so a violation is a
 * signalling error to reject — not something to sanitise and carry on with.
 */

import type {GroupCallParticipantVideoSourceGroup} from '@layer';
import type {GroupCallConnectionTransport, P2PMediaContent, P2PMessage, UpdateGroupCallConnectionData} from '@lib/calls/types';

type InitialSetup = Extract<P2PMessage, {'@type': 'InitialSetup'}>;

export function isSdpSafeString(value: unknown): value is string {
  return typeof value === 'string' && !/[\r\n\0]/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptySdpString(value: unknown): value is string {
  return isSdpSafeString(value) && value.length > 0;
}

/**
 * Runtime validation for the peer-controlled InitialSetup JSON.
 *
 * This deliberately validates types as well as line safety. Template-string
 * interpolation calls Array#toString/Object#toString, so merely checking CR/LF
 * when the value happens to be a string lets a JSON array smuggle a second SDP
 * line through (for example, `["x\r\na=candidate:evil"]`).
 */
export function isSdpSafeSetup(setup: unknown): setup is InitialSetup {
  if(!isRecord(setup) || setup['@type'] !== 'InitialSetup') {
    return false;
  }

  if(!isNonEmptySdpString(setup.ufrag) || !isNonEmptySdpString(setup.pwd)) {
    return false;
  }
  if(typeof setup.renomination !== 'boolean') {
    return false;
  }
  if(!Array.isArray(setup.fingerprints) || !setup.fingerprints.length) {
    return false;
  }

  return setup.fingerprints.every((fingerprint) => {
    return isRecord(fingerprint) &&
      isNonEmptySdpString(fingerprint.hash) &&
      isNonEmptySdpString(fingerprint.fingerprint) &&
      isNonEmptySdpString(fingerprint.setup);
  });
}

// ---------------------------------------------------------------------------
// Field-level guards for the other SDP sources.
//
// The InitialSetup check above covers the 1-on-1 transport. Everything else
// the builders interpolate comes from JSON as well — the peer's
// NegotiateChannels on the 1-on-1 path, the SFU's join answer and the
// participants' source groups on the group path — and none of it has a
// legitimate use for whitespace, let alone a line break. These validate the
// shape the builders assume (an integer wherever `${n}` is emitted, a
// printable token wherever a string is) and bound every array, so a value can
// neither end a line early nor make the builder stringify an object.
// ---------------------------------------------------------------------------

const SDP_TOKEN = /^[\x21-\x7e]{1,256}$/;
const SETUP_ROLES = new Set(['active', 'passive', 'actpass']);
const CANDIDATE_FIELDS = ['foundation', 'component', 'protocol', 'priority', 'ip', 'port', 'type', 'generation'] as const;
const CANDIDATE_OPTIONAL_FIELDS = ['id', 'network', 'rel-addr', 'rel-port'] as const;
const MAX_CONTENTS = 8;
const MAX_PAYLOAD_TYPES = 64;
const MAX_RTP_EXTENSIONS = 32;
const MAX_FEEDBACK_TYPES = 16;
const MAX_PARAMETERS = 32;
const MAX_SSRC_GROUPS = 8;
const MAX_SSRCS_PER_GROUP = 8;
const MAX_SERVER_SOURCES = 64;
const MAX_CANDIDATES = 64;
const MAX_FINGERPRINTS = 8;

function isSdpToken(value: unknown): value is string {
  return typeof value === 'string' && SDP_TOKEN.test(value);
}

// Optional string fields travel as '' when absent (tgcalls emits
// `subtype: ""` on every feedback type, candidates carry empty rel-addr).
function isOptionalSdpToken(value: unknown): boolean {
  return value === undefined || value === '' || isSdpToken(value);
}

function isSdpInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
}

// An SSRC: a 32-bit integer, as a number or (tgcalls) a decimal string. The
// server sends its sources as SIGNED int32 (fromTelegramSource turns them back
// into the unsigned value the SDP carries), so negatives are ordinary here.
function isSdpSsrc(value: unknown): boolean {
  const n = typeof value === 'string' && /^-?\d{1,10}$/.test(value) ? Number(value) : value;
  return Number.isInteger(n) && (n as number) >= -0x80000000 && (n as number) <= 0xffffffff;
}

function isBoundedArray(value: unknown, max: number): value is unknown[] {
  return Array.isArray(value) && value.length <= max;
}

function isSdpSafeFeedbackTypes(value: unknown): boolean {
  if(value === undefined) return true;
  return isBoundedArray(value, MAX_FEEDBACK_TYPES) && value.every((fb) => {
    return isRecord(fb) && isSdpToken(fb.type) && isOptionalSdpToken(fb.subtype);
  });
}

function isSdpSafeParameters(value: unknown): boolean {
  if(value === undefined) return true;
  if(Array.isArray(value)) return !value.length; // the SFU sends [] for "none"
  if(!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length <= MAX_PARAMETERS && keys.every((key) => {
    const parameter = value[key];
    return isSdpToken(key) && (isOptionalSdpToken(parameter) || isSdpInteger(parameter));
  });
}

function isSdpSafePayloadType(value: unknown): boolean {
  return isRecord(value) &&
    isSdpInteger(value.id, 127) &&
    isSdpToken(value.name) &&
    isSdpInteger(value.clockrate) &&
    (value.channels === undefined || isSdpInteger(value.channels)) &&
    isSdpSafeFeedbackTypes(value.feedbackTypes) &&
    isSdpSafeFeedbackTypes(value['rtcp-fbs']) &&
    isSdpSafeParameters(value.parameters);
}

function isSdpSafePayloadTypes(value: unknown): boolean {
  return isBoundedArray(value, MAX_PAYLOAD_TYPES) && value.every(isSdpSafePayloadType);
}

function isSdpSafeRtpExtensions(value: unknown): boolean {
  return isBoundedArray(value, MAX_RTP_EXTENSIONS) && value.every((extension) => {
    return isRecord(extension) && isSdpInteger(extension.id) && isSdpToken(extension.uri);
  });
}

function isSdpSafeSsrcGroups(value: unknown, key: 'ssrcs' | 'sources'): boolean {
  return isBoundedArray(value, MAX_SSRC_GROUPS) && value.every((group) => {
    if(!isRecord(group) || !isSdpToken(group.semantics)) return false;
    const sources = group[key];
    return isBoundedArray(sources, MAX_SSRCS_PER_GROUP) && sources.every(isSdpSsrc);
  });
}

// The group-call validators name the offending field instead of answering
// false: the SFU's answer is opaque server data, and a rejected join has to say
// which field it rejected before anyone can tell a hostile relay from an
// honest one the validator did not anticipate. `undefined` means safe.
function unsafePayloadTypes(value: unknown, path: string): string | undefined {
  if(!isBoundedArray(value, MAX_PAYLOAD_TYPES)) return path;
  for(let i = 0; i < value.length; ++i) {
    const payloadType = value[i];
    if(!isRecord(payloadType)) return `${path}[${i}]`;
    if(!isSdpInteger(payloadType.id, 127)) return `${path}[${i}].id`;
    if(!isSdpToken(payloadType.name)) return `${path}[${i}].name`;
    if(!isSdpInteger(payloadType.clockrate)) return `${path}[${i}].clockrate`;
    if(payloadType.channels !== undefined && !isSdpInteger(payloadType.channels)) return `${path}[${i}].channels`;
    if(!isSdpSafeFeedbackTypes(payloadType['rtcp-fbs'])) return `${path}[${i}].rtcp-fbs`;
    if(!isSdpSafeParameters(payloadType.parameters)) return `${path}[${i}].parameters`;
  }
}

function unsafeCodec(value: unknown, path: string): string | undefined {
  if(!isRecord(value)) return path;
  const payloadTypes = unsafePayloadTypes(value['payload-types'], `${path}.payload-types`);
  if(payloadTypes) return payloadTypes;
  if(!isSdpSafeRtpExtensions(value['rtp-hdrexts'])) return `${path}.rtp-hdrexts`;
  if(!isOptionalSdpToken(value.endpoint)) return `${path}.endpoint`;
  if(value.server_sources !== undefined &&
    !(isBoundedArray(value.server_sources, MAX_SERVER_SOURCES) && value.server_sources.every(isSdpSsrc))) {
    return `${path}.server_sources`;
  }
}

function unsafeTransport(value: unknown): string | undefined {
  if(!isRecord(value)) return 'transport';
  if(!isSdpToken(value.ufrag)) return 'transport.ufrag';
  if(!isSdpToken(value.pwd)) return 'transport.pwd';
  if(!isOptionalSdpToken(value.xmlns)) return 'transport.xmlns';
  if(value['rtcp-mux'] !== undefined && typeof value['rtcp-mux'] !== 'boolean') return 'transport.rtcp-mux';
  const fingerprints = value.fingerprints;
  if(!isBoundedArray(fingerprints, MAX_FINGERPRINTS) || !fingerprints.length) return 'transport.fingerprints';
  for(let i = 0; i < fingerprints.length; ++i) {
    const fingerprint = fingerprints[i];
    if(!isRecord(fingerprint)) return `transport.fingerprints[${i}]`;
    if(!isSdpToken(fingerprint.hash)) return `transport.fingerprints[${i}].hash`;
    if(!isSdpToken(fingerprint.fingerprint)) return `transport.fingerprints[${i}].fingerprint`;
    if(!SETUP_ROLES.has(fingerprint.setup as string)) return `transport.fingerprints[${i}].setup`;
  }
  const candidates = value.candidates;
  if(candidates === undefined) return;
  if(!isBoundedArray(candidates, MAX_CANDIDATES)) return 'transport.candidates';
  for(let i = 0; i < candidates.length; ++i) {
    const candidate = candidates[i];
    if(!isRecord(candidate)) return `transport.candidates[${i}]`;
    for(const field of CANDIDATE_FIELDS) {
      if(!isSdpToken(candidate[field])) return `transport.candidates[${i}].${field}`;
    }
    for(const field of CANDIDATE_OPTIONAL_FIELDS) {
      if(!isOptionalSdpToken(candidate[field])) return `transport.candidates[${i}].${field}`;
    }
  }
}

/**
 * The peer's NegotiateChannels contents (1-on-1): every field SDPBuilder.addP2p
 * emits — rtpmap, fmtp, rtcp-fb, extmap, ssrc-group and the content's ssrc,
 * which doubles as its mid.
 */
export function isSdpSafeContents(contents: unknown): contents is P2PMediaContent[] {
  return isBoundedArray(contents, MAX_CONTENTS) && contents.every((content) => {
    return isRecord(content) &&
      (content.type === 'audio' || content.type === 'video') &&
      isSdpSsrc(content.ssrc) &&
      (content.ssrcGroups === undefined || isSdpSafeSsrcGroups(content.ssrcGroups, 'ssrcs')) &&
      (content.payloadTypes === undefined || isSdpSafePayloadTypes(content.payloadTypes)) &&
      (content.rtpExtensions === undefined || isSdpSafeRtpExtensions(content.rtpExtensions));
  });
}

/** A participant's `video` / `presentation` source groups (group calls). */
export function isSdpSafeSourceGroups(groups: unknown): groups is GroupCallParticipantVideoSourceGroup[] {
  return isSdpSafeSsrcGroups(groups, 'sources');
}

/**
 * The SFU's join answer / updateGroupCallConnection params (group calls): the
 * transport and codec tables SDPBuilder.addConference and fixLocalOffer emit.
 * Also covers the presentation upgrade answer (the same shape minus audio).
 * Returns the path of the first field that cannot be interpolated, or
 * undefined when the whole answer is safe.
 */
export function getUnsafeConnectionDataReason(data: unknown): string | undefined {
  if(!isRecord(data)) return 'data';
  const transport = unsafeTransport(data.transport);
  if(transport) return transport;
  for(const codec of ['audio', 'video', 'screencast'] as const) {
    if(data[codec] === undefined) continue;
    const reason = unsafeCodec(data[codec], codec);
    if(reason) return reason;
  }
}

export function isSdpSafeConnectionData(data: unknown): data is UpdateGroupCallConnectionData {
  return getUnsafeConnectionDataReason(data) === undefined;
}
