/*
 * What keeps media flowing through a 1-on-1 call's renegotiations — found in a
 * live two-browser call, where each failure silently dropped a direction:
 *
 * - Each side numbers its own m-sections (the peer's content is keyed by its
 *   SSRC), so a MID header extension names a section the receiver does not
 *   have, and libwebrtc drops a BUNDLE packet with an unknown MID even when its
 *   SSRC is signalled. Native tgcalls never negotiates MID/RID; neither do we.
 * - An answer lists only the contents the peer accepted from our offer. The
 *   peer's own outgoing sources, announced by its earlier offers, must survive
 *   in the remote answer we build, or their SSRCs vanish and their media with
 *   them (the callee lost all incoming media once it renegotiated).
 * - The callee of a video call starts its camera before the caller's offer
 *   arrives; only a fresh offer can carry that transceiver.
 * - Opus is capped at native's 32 kbit/s: with transport-cc on audio and no
 *   maxaveragebitrate, Chrome let the allocation push it to 510 kbit/s.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  appSettings: {callDevices: {speakerId: ''}}
}));

vi.mock('@helpers/dom/safePlay', () => ({default: vi.fn()}));
vi.mock('@environment/webpSupport', () => ({default: true}));
vi.mock('@lib/calls/helpers/getStreamCached', () => ({default: () => vi.fn()}));
vi.mock('@lib/calls/localConferenceDescription', () => ({default: class LocalConferenceDescription {}}));
vi.mock('@lib/calls/streamManager', () => ({default: class StreamManager {}}));
vi.mock('@lib/calls/callsController', () => ({default: {dispatchEvent: vi.fn()}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {invokeCrypto: vi.fn()}}));
vi.mock('@stores/appSettings', () => ({appSettings: mocks.appSettings}));

import CallInstance from '@lib/calls/callInstance';
import {parseExtmaps, parseSdpSections} from '@lib/calls/p2P/sdpCommon';
import {P2PMediaContent} from '@lib/calls/types';

const MID_URI = 'urn:ietf:params:rtp-hdrext:sdes:mid';
const RID_URI = 'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id';
const RRID_URI = 'urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id';
const TWCC_URI = 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01';

const setup = {
  '@type': 'InitialSetup' as const,
  ufrag: 'remote',
  pwd: 'remotepassword',
  renomination: false,
  fingerprints: [{hash: 'sha-256', fingerprint: 'CC:DD', setup: 'active'}]
};

const OPUS = [{id: 111, name: 'opus', clockrate: 48000, channels: 2, parameters: {minptime: 10, useinbandfec: 1}}];
const VP8 = [{id: 96, name: 'VP8', clockrate: 90000, parameters: {}}, {id: 97, name: 'rtx', clockrate: 90000, parameters: {apt: 96}}];

const transport = [
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:local',
  'a=ice-pwd:localpassword',
  'a=fingerprint:sha-256 AA:BB'
];

function makeInstance(p2p: Record<string, unknown>) {
  vi.stubGlobal('RTCRtpSender', {getCapabilities: () => ({codecs: [{mimeType: 'video/VP8'}, {mimeType: 'video/rtx'}]})});
  vi.stubGlobal('RTCRtpReceiver', {getCapabilities: () => ({codecs: [{mimeType: 'video/VP8'}, {mimeType: 'video/rtx'}]})});
  const instance = new CallInstance({
    isOutgoing: false,
    interlocutorUserId: 123 as UserId,
    managers: {} as any
  });
  (instance as any).p2p = p2p;
  return instance;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('P2P RTP header extensions', () => {
  it('never announces or accepts MID/RID extensions', () => {
    const [, section] = parseSdpSections([
      'v=0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'a=mid:0',
      `a=extmap:3 ${TWCC_URI}`,
      `a=extmap:4 ${MID_URI}`,
      `a=extmap:10 ${RID_URI}`,
      `a=extmap:11 ${RRID_URI}`,
      ''
    ].join('\r\n'));

    expect(parseExtmaps(section)).toEqual([{id: 3, uri: TWCC_URI}]);
  });

  it('drops them from a remote description built from a peer that still lists them', () => {
    const instance = makeInstance({
      connection: {localDescription: null, remoteDescription: null},
      transceivers: {audio: {mid: '0', sender: {track: null}, receiver: {track: null}}},
      streams: {}
    });
    const audio: P2PMediaContent = {
      type: 'audio',
      ssrc: '5555',
      payloadTypes: OPUS,
      rtpExtensions: [{id: 3, uri: TWCC_URI}, {id: 4, uri: MID_URI}]
    };
    (instance as any).p2p.pendingRemoteContentMids = {'5555': '0'};

    const sdp: string = (instance as any).buildRemoteSdp(setup, [audio], false);

    expect(sdp).toContain(`a=extmap:3 ${TWCC_URI}`);
    expect(sdp).not.toContain(MID_URI);
  });
});

describe('P2P remote answer to our renegotiation', () => {
  // The callee's offer after the call is up: the shared audio section (the
  // caller's audio arrives on it), the caller's video it receives, its own new
  // camera, the data channel.
  const localOffer = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0 6666 4 3',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    ...transport,
    'a=setup:actpass',
    'a=mid:0',
    'a=sendrecv',
    'a=rtcp-mux',
    'a=rtpmap:111 opus/48000/2',
    'a=ssrc:1111 cname:local',
    'm=video 9 UDP/TLS/RTP/SAVPF 96 97',
    ...transport,
    'a=setup:actpass',
    'a=mid:6666',
    'a=recvonly',
    'a=rtcp-mux',
    'a=rtpmap:96 VP8/90000',
    'a=rtpmap:97 rtx/90000',
    'a=fmtp:97 apt=96',
    'm=video 9 UDP/TLS/RTP/SAVPF 96 97',
    ...transport,
    'a=setup:actpass',
    'a=mid:4',
    'a=sendrecv',
    'a=rtcp-mux',
    'a=rtpmap:96 VP8/90000',
    'a=rtpmap:97 rtx/90000',
    'a=fmtp:97 apt=96',
    'a=ssrc-group:FID 2222 3333',
    'a=ssrc:2222 cname:local',
    'a=ssrc:3333 cname:local',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    ...transport,
    'a=setup:actpass',
    'a=mid:3',
    'a=sctp-port:5000',
    ''
  ].join('\r\n');

  // The remote description in force: the caller's offer, which put its audio
  // on the shared section and its camera on the 6666 section.
  const remoteOffer = [
    'v=0',
    'o=- 1 2 IN IP4 0.0.0.0',
    's=-',
    't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=mid:0',
    'a=sendrecv',
    'a=rtpmap:111 opus/48000/2',
    'a=ssrc:5555 cname:5555',
    'a=ssrc:5555 msid:5555 5555',
    'm=video 9 UDP/TLS/RTP/SAVPF 96 97',
    'a=mid:6666',
    'a=sendonly',
    'a=rtpmap:96 VP8/90000',
    'a=rtpmap:97 rtx/90000',
    'a=ssrc-group:FID 6666 7777',
    'a=ssrc:6666 cname:6666',
    'a=ssrc:7777 cname:6666',
    'm=application 1 UDP/DTLS/SCTP webrtc-datachannel',
    'a=mid:3',
    ''
  ].join('\r\n');

  function makeRenegotiatingInstance() {
    const liveTrack = {readyState: 'live', enabled: true} as unknown as MediaStreamTrack;
    const liveStream = {getTracks: () => [liveTrack]} as unknown as MediaStream;
    return makeInstance({
      connection: {
        localDescription: {type: 'offer', sdp: localOffer},
        remoteDescription: {type: 'offer', sdp: remoteOffer}
      },
      transceivers: {
        audio: {mid: '0', sender: {track: liveTrack}, receiver: {track: liveTrack}},
        video: {mid: '4'},
        remoteVideo: {mid: '6666', receiver: {track: {kind: 'video'}}}
      },
      streams: {video: liveStream, ownVideo: liveStream},
      pendingLocalContentMids: {'1111': '0', '2222': '4'}
    });
  }

  // The caller accepted our audio and our camera.
  const accepted: P2PMediaContent[] = [
    {type: 'audio', ssrc: '1111', payloadTypes: OPUS, rtpExtensions: []},
    {type: 'video', ssrc: '2222', ssrcGroups: [{semantics: 'FID', ssrcs: ['2222', '3333']}], payloadTypes: VP8, rtpExtensions: []}
  ];

  const getSection = (sdp: string, mid: string) => parseSdpSections(sdp).find((section) => section.mid === mid);

  it('keeps the caller\'s audio on the shared section', () => {
    const sdp: string = (makeRenegotiatingInstance() as any).buildRemoteSdp(setup, accepted, true);

    const audio = getSection(sdp, '0');
    expect(audio.direction).toBe('sendrecv');
    expect(audio.lines).toContain('a=ssrc:5555 cname:5555');
  });

  it('keeps the caller\'s camera on the section that receives it', () => {
    const sdp: string = (makeRenegotiatingInstance() as any).buildRemoteSdp(setup, accepted, true);

    const remoteVideo = getSection(sdp, '6666');
    expect(remoteVideo.direction).toBe('sendonly');
    expect(remoteVideo.lines).toContain('a=ssrc-group:FID 6666 7777');
    expect(remoteVideo.lines).toContain('a=ssrc:6666 cname:6666');
  });

  it('describes our own camera as received only, with none of our SSRCs', () => {
    const sdp: string = (makeRenegotiatingInstance() as any).buildRemoteSdp(setup, accepted, true);

    const ownVideo = getSection(sdp, '4');
    expect(ownVideo.direction).toBe('recvonly');
    expect(ownVideo.lines.some((line) => line.startsWith('a=ssrc'))).toBe(false);
  });
});

describe('P2P callee media', () => {
  const enabledStream = {getTracks: () => [{enabled: true}]};

  it('needs a fresh offer for a camera no description carries yet', () => {
    const instance = makeInstance({
      transceivers: {audio: {mid: '0'}, video: {mid: null}},
      streams: {ownVideo: enabledStream}
    });

    expect((instance as any).hasUnnegotiatedLocalMedia()).toBe(true);
  });

  it('does not renegotiate a camera already in a description, or one that is off', () => {
    const negotiated = makeInstance({
      transceivers: {audio: {mid: '0'}, video: {mid: '1'}},
      streams: {ownVideo: enabledStream}
    });
    const off = makeInstance({
      transceivers: {audio: {mid: '0'}, video: {mid: null}},
      streams: {ownVideo: {getTracks: () => [{enabled: false}]}}
    });

    expect((negotiated as any).hasUnnegotiatedLocalMedia()).toBe(false);
    expect((off as any).hasUnnegotiatedLocalMedia()).toBe(false);
  });
});

describe('P2P sender parameters', () => {
  function makeSender(parameters: RTCRtpSendParameters, kind = 'audio') {
    return {
      track: {kind, enabled: true},
      getParameters: vi.fn(() => structuredClone(parameters)),
      setParameters: vi.fn(async() => {})
    };
  }

  it('caps the microphone at native\'s 32 kbit/s Opus maximum', async() => {
    const audio = makeSender({encodings: [{}]} as RTCRtpSendParameters);
    const instance = makeInstance({senders: {audio}});

    await (instance as any).applySenderParameters();

    expect(audio.setParameters).toHaveBeenCalledWith({encodings: [{maxBitrate: 32 * 1024}]});
  });

  it('leaves an already capped microphone alone', async() => {
    const audio = makeSender({encodings: [{maxBitrate: 32 * 1024}]} as RTCRtpSendParameters);
    const instance = makeInstance({senders: {audio}});

    await (instance as any).applySenderParameters();

    expect(audio.setParameters).not.toHaveBeenCalled();
  });

  it('keeps a shared screen\'s resolution under congestion', async() => {
    const presentation = makeSender({encodings: [{}]} as RTCRtpSendParameters, 'video');
    const instance = makeInstance({senders: {presentation}});

    await (instance as any).applySenderParameters();

    expect(presentation.setParameters).toHaveBeenCalledWith({encodings: [{}], degradationPreference: 'maintain-resolution'});
  });
});
