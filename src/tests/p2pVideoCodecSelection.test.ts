/*
 * Which of the peer's video codecs a 1-on-1 call keeps in the remote
 * description it builds (p2P/utils filterRemoteVideoPayloadTypes).
 *
 * Until 2026-10 only VP8 (+ its RTX) survived, so a native peer — which sends
 * H.264 first and encodes it in hardware — was pushed to software VP8, without
 * FEC. Real interop with the Android/iOS apps is not covered here.
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
import {
  filterRemoteVideoPayloadTypes,
  getH264Profile,
  validateRemoteAnswerSdp,
  VideoCodecCapabilities,
  VideoCodecCapability
} from '@lib/calls/p2P/utils';
import {P2PMediaContent, P2PPayloadType} from '@lib/calls/types';

const H264_PARAMS = 'level-asymmetry-allowed=1;packetization-mode=';

// What Chrome reports, both ways (no H.265 encoder).
const CHROME_CODECS: VideoCodecCapability[] = [
  {mimeType: 'video/VP8'},
  {mimeType: 'video/rtx'},
  {mimeType: 'video/VP9', sdpFmtpLine: 'profile-id=0'},
  {mimeType: 'video/VP9', sdpFmtpLine: 'profile-id=2'},
  {mimeType: 'video/AV1', sdpFmtpLine: 'level-idx=5;profile=0;tier=0'},
  {mimeType: 'video/H264', sdpFmtpLine: H264_PARAMS + '1;profile-level-id=42001f'},
  {mimeType: 'video/H264', sdpFmtpLine: H264_PARAMS + '0;profile-level-id=42001f'},
  {mimeType: 'video/H264', sdpFmtpLine: H264_PARAMS + '1;profile-level-id=42e01f'},
  {mimeType: 'video/H264', sdpFmtpLine: H264_PARAMS + '0;profile-level-id=42e01f'},
  {mimeType: 'video/H264', sdpFmtpLine: H264_PARAMS + '1;profile-level-id=4d001f'},
  {mimeType: 'video/H264', sdpFmtpLine: H264_PARAMS + '1;profile-level-id=64001f'},
  {mimeType: 'video/red'},
  {mimeType: 'video/ulpfec'}
];

const CHROME: VideoCodecCapabilities = {
  send: CHROME_CODECS,
  // It can decode H.265 on this machine, but not encode it.
  receive: [...CHROME_CODECS, {mimeType: 'video/H265'}]
};

const FEEDBACK = [
  {type: 'goog-remb'},
  {type: 'transport-cc'},
  {type: 'ccm', subtype: 'fir'},
  {type: 'nack'},
  {type: 'nack', subtype: 'pli'}
];

// Like native's JSON: `parameters` always present, `{}` when there are none.
const codec = (id: number, name: string, parameters: P2PPayloadType['parameters'] = {}): P2PPayloadType => ({
  id,
  name,
  clockrate: 90000,
  parameters,
  ...(name === 'rtx' || name === 'red' || name === 'ulpfec' ? {} : {feedbackTypes: FEEDBACK})
});
const rtx = (id: number, apt: number) => codec(id, 'rtx', {apt});
const h264 = (id: number, profileLevelId: string, packetizationMode = 1) => codec(id, 'H264', {
  'level-asymmetry-allowed': 1,
  'packetization-mode': packetizationMode,
  'profile-level-id': profileLevelId
});

// The video payload types of a native (tgcalls v2, iOS) offer: its encoder
// factory lists H.264 Constrained High and Constrained Baseline, VP8, VP9 and
// H.265; the webrtc media engine adds an RTX for each, then red and ulpfec.
const NATIVE_VIDEO: P2PPayloadType[] = [
  h264(96, '640c1f'), rtx(97, 96),
  h264(98, '42e01f'), rtx(99, 98),
  codec(100, 'VP8'), rtx(101, 100),
  codec(102, 'VP9'), rtx(103, 102),
  codec(104, 'H265'), rtx(105, 104),
  codec(106, 'red'), rtx(107, 106),
  codec(108, 'ulpfec')
];

const video = (payloadTypes: P2PPayloadType[], ssrc = '6666'): P2PMediaContent => ({
  type: 'video',
  ssrc,
  ssrcGroups: [{semantics: 'FID', ssrcs: [ssrc, '7777']}],
  payloadTypes,
  rtpExtensions: [{id: 2, uri: 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time'}]
});

const ids = (payloadTypes: P2PPayloadType[] | undefined) => payloadTypes?.map((payloadType) => payloadType.id);

describe('P2P video codec selection', () => {
  it('keeps every codec both ways usable from a native offer, with RTX and FEC', () => {
    const result = filterRemoteVideoPayloadTypes(video(NATIVE_VIDEO), {capabilities: CHROME});

    // H.264 Constrained High has no Chrome counterpart (High is a different
    // profile); H.265 cannot be sent from this browser.
    expect(ids(result)).toEqual([98, 99, 100, 101, 102, 103, 106, 107, 108]);
    expect(result[0]).toBe(NATIVE_VIDEO[2]);
  });

  it('puts H.264 ahead of VP8, otherwise in the peer\'s order', () => {
    const chromeOffer = [
      codec(96, 'VP8'), rtx(97, 96),
      codec(98, 'VP9', {'profile-id': 0}), rtx(99, 98),
      codec(45, 'AV1', {'level-idx': 5, 'profile': 0, 'tier': 0}), rtx(46, 45),
      h264(102, '42001f'), rtx(103, 102),
      h264(104, '42001f', 0), rtx(105, 104),
      h264(106, '42e01f'), rtx(107, 106),
      codec(116, 'red'), rtx(117, 116),
      codec(118, 'ulpfec')
    ];

    const result = filterRemoteVideoPayloadTypes(video(chromeOffer), {capabilities: CHROME});

    expect(ids(result)).toEqual([102, 103, 104, 105, 106, 107, 96, 97, 98, 99, 45, 46, 116, 117, 118]);
  });

  it('matches H.264 by profile and packetization mode', () => {
    const capabilities: VideoCodecCapabilities = {
      send: [{mimeType: 'video/H264', sdpFmtpLine: H264_PARAMS + '0;profile-level-id=42e01f'}, {mimeType: 'video/VP8'}],
      receive: [{mimeType: 'video/H264', sdpFmtpLine: H264_PARAMS + '0;profile-level-id=42e01f'}, {mimeType: 'video/VP8'}]
    };
    const peer = [h264(98, '42e01f', 1), h264(99, '42e01f', 0), h264(100, '4d001f', 0), codec(101, 'VP8')];

    expect(ids(filterRemoteVideoPayloadTypes(video(peer), {capabilities}))).toEqual([99, 101]);
  });

  it('gives exactly the old VP8 + RTX when nothing else is usable', () => {
    const peer = [h264(96, '640c1f'), rtx(97, 96), codec(100, 'VP8'), rtx(101, 100), codec(106, 'red'), codec(108, 'ulpfec')];

    expect(filterRemoteVideoPayloadTypes(video(peer), {capabilities: CHROME})).toEqual([peer[2], peer[3]]);
  });

  it('falls back to what the receiver alone can decode when the browser reports no send codecs', () => {
    const capabilities: VideoCodecCapabilities = {send: [], receive: CHROME_CODECS};

    expect(ids(filterRemoteVideoPayloadTypes(video(NATIVE_VIDEO), {capabilities}))).toEqual([100, 101]);
    expect(filterRemoteVideoPayloadTypes(video(NATIVE_VIDEO), {capabilities: {send: [], receive: []}})).toBeUndefined();
  });

  it('keeps H.265 or AV1 only when the browser can both send and receive it', () => {
    const peer = [codec(104, 'H265'), rtx(105, 104), h264(98, '42e01f'), rtx(99, 98)];
    const withH265: VideoCodecCapabilities = {
      send: [...CHROME_CODECS, {mimeType: 'video/H265'}],
      receive: [...CHROME_CODECS, {mimeType: 'video/H265'}]
    };

    expect(ids(filterRemoteVideoPayloadTypes(video(peer), {capabilities: CHROME}))).toEqual([98, 99]);
    expect(ids(filterRemoteVideoPayloadTypes(video(peer), {capabilities: withH265}))).toEqual([104, 105, 98, 99]);
  });

  it('accepts only what our own offer had in an answer', () => {
    const answer = [h264(98, '42e01f'), rtx(99, 98), h264(127, '42e01f'), codec(100, 'VP8')];
    const allowed = [{id: 98, name: 'H264'}, {id: 99, name: 'rtx'}, {id: 100, name: 'VP8'}];

    expect(ids(filterRemoteVideoPayloadTypes(video(answer), {capabilities: CHROME, allowed}))).toEqual([98, 99, 100]);
  });

  it('reads H.264 profiles the way webrtc does', () => {
    expect(getH264Profile('42e01f')).toBe('constrained-baseline');
    // webrtc kProfilePatterns: {0x4D, "1xxx0000"} is Constrained Baseline.
    expect(getH264Profile('4d801f')).toBe('constrained-baseline');
    expect(getH264Profile('4d401f')).toBe('main');
    expect(getH264Profile('42001f')).toBe('baseline');
    expect(getH264Profile('4d001f')).toBe('main');
    expect(getH264Profile('64001f')).toBe('high');
    expect(getH264Profile('640c1f')).toBe('constrained-high');
    expect(getH264Profile(undefined)).toBe('constrained-baseline');
    expect(getH264Profile('zz')).toBeUndefined();
  });
});

describe('P2P remote SDP with a native peer\'s video', () => {
  const setup = {
    '@type': 'InitialSetup' as const,
    ufrag: 'remote',
    pwd: 'remotepassword',
    renomination: false,
    fingerprints: [{hash: 'sha-256', fingerprint: 'CC:DD', setup: 'active'}]
  };
  const audio: P2PMediaContent = {
    type: 'audio',
    ssrc: '5555',
    payloadTypes: [{id: 111, name: 'opus', clockrate: 48000, channels: 2, parameters: {minptime: 10, useinbandfec: 1}}],
    rtpExtensions: []
  };

  function makeInstance(localDescription?: RTCSessionDescriptionInit) {
    vi.stubGlobal('RTCRtpSender', {getCapabilities: () => ({codecs: CHROME.send})});
    vi.stubGlobal('RTCRtpReceiver', {getCapabilities: () => ({codecs: CHROME.receive})});
    const instance = new CallInstance({
      isOutgoing: true,
      interlocutorUserId: 123 as UserId,
      managers: {} as any
    });
    const noTrack: MediaStreamTrack | null = null;
    (instance as any).p2p = {
      connection: {localDescription: localDescription || null, remoteDescription: null},
      transceivers: {
        audio: {mid: '0', sender: {track: noTrack}, receiver: {track: noTrack}},
        video: {mid: '1'}
      },
      streams: {},
      silence: undefined
    };
    return instance;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const getVideoLine = (sdp: string) => sdp.split('\r\n').find((line) => line.startsWith('m=video'));

  it('offers the browser H.264 first from a native offer', () => {
    const instance = makeInstance();
    (instance as any).p2p.pendingRemoteContentMids = {'5555': '0', '6666': '1'};

    const sdp: string = (instance as any).buildRemoteSdp(setup, [audio, video(NATIVE_VIDEO)], false);

    expect(getVideoLine(sdp)).toBe('m=video 9 UDP/TLS/RTP/SAVPF 98 99 100 101 102 103 106 107 108');
    expect(sdp).toContain('a=rtpmap:98 H264/90000');
    expect(sdp).toContain('a=fmtp:98 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f');
    expect(sdp).toContain('a=fmtp:99 apt=98');
    expect(sdp).toContain('a=rtcp-fb:98 nack pli');
    expect(sdp).toContain('a=rtpmap:108 ulpfec/90000');
    expect(sdp).not.toContain('H265');
    // Native's empty parameter objects leave no empty fmtp lines behind.
    expect(sdp).not.toMatch(/a=fmtp:\d+ ?\r\n/);
  });

  it('builds a valid answer from a native answer to our offer', () => {
    const localOffer = [
      'v=0',
      'o=- 1 2 IN IP4 127.0.0.1',
      's=-',
      't=0 0',
      'a=group:BUNDLE 0 1 3',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:local',
      'a=ice-pwd:localpassword',
      'a=fingerprint:sha-256 AA:BB',
      'a=setup:actpass',
      'a=mid:0',
      'a=sendrecv',
      'a=rtcp-mux',
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10;useinbandfec=1',
      'a=ssrc:1111 cname:local',
      'm=video 9 UDP/TLS/RTP/SAVPF 96 97 102 103 116 117 118',
      'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:local',
      'a=ice-pwd:localpassword',
      'a=fingerprint:sha-256 AA:BB',
      'a=setup:actpass',
      'a=mid:1',
      'a=sendrecv',
      'a=rtcp-mux',
      'a=rtcp-rsize',
      'a=rtpmap:96 VP8/90000',
      'a=rtpmap:97 rtx/90000',
      'a=fmtp:97 apt=96',
      'a=rtpmap:102 H264/90000',
      'a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
      'a=rtpmap:103 rtx/90000',
      'a=fmtp:103 apt=102',
      'a=rtpmap:116 red/90000',
      'a=rtpmap:117 rtx/90000',
      'a=fmtp:117 apt=116',
      'a=rtpmap:118 ulpfec/90000',
      'a=ssrc-group:FID 2222 3333',
      'a=ssrc:2222 cname:local',
      'a=ssrc:3333 cname:local',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
      'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:local',
      'a=ice-pwd:localpassword',
      'a=fingerprint:sha-256 AA:BB',
      'a=setup:actpass',
      'a=mid:3',
      'a=sctp-port:5000',
      ''
    ].join('\r\n');
    const instance = makeInstance({type: 'offer', sdp: localOffer});
    // The native answer: its own order, plus one id we never offered.
    const answerVideo = video([
      h264(102, '42e01f'), rtx(103, 102),
      codec(96, 'VP8'), rtx(97, 96),
      codec(116, 'red'), rtx(117, 116),
      codec(118, 'ulpfec'),
      h264(127, '42e01f')
    ]);

    const sdp: string = (instance as any).buildRemoteSdp(setup, [audio, answerVideo], true);

    expect(getVideoLine(sdp)).toBe('m=video 9 UDP/TLS/RTP/SAVPF 102 103 96 97 116 117 118');
    const log = Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn()});
    validateRemoteAnswerSdp(log as any, localOffer, sdp);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('remote answer SDP validation passed', expect.anything());
  });
});
