/*
 * A 1-on-1 call's transport recovery as CallInstance drives it: which ICE
 * events restart, how the restart goes out (new InitialSetup + offer), how a
 * peer's restart and glare are applied, and that nothing outlives the call.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  appSettings: {callDevices: {speakerId: ''}},
  getStream: vi.fn(),
  invokeCrypto: vi.fn(),
  tryAddCandidate: vi.fn(async(..._args: unknown[]) => {})
}));

vi.mock('@helpers/dom/safePlay', () => ({default: vi.fn()}));
vi.mock('@environment/webpSupport', () => ({default: true}));
vi.mock('@lib/calls/helpers/getAudioConstraints', () => ({
  default: (deviceId?: string) => ({deviceId})
}));
vi.mock('@lib/calls/helpers/getStream', () => ({default: mocks.getStream}));
vi.mock('@lib/calls/p2P/utils', async(importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/calls/p2P/utils')>();
  return {...actual, tryAddCandidate: mocks.tryAddCandidate};
});
vi.mock('@lib/calls/helpers/getStreamCached', () => ({default: () => vi.fn()}));
vi.mock('@lib/calls/helpers/stopTrack', () => ({
  default: (track: {stop: () => void}) => track.stop()
}));
vi.mock('@lib/calls/localConferenceDescription', () => ({default: class LocalConferenceDescription {}}));
vi.mock('@lib/calls/streamManager', () => ({default: class StreamManager {
  public stop() {}
}}));
vi.mock('@lib/calls/callsController', () => ({default: {dispatchEvent: vi.fn()}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {invokeCrypto: mocks.invokeCrypto}}));
vi.mock('@stores/appSettings', () => ({appSettings: mocks.appSettings}));

import CallInstance from '@lib/calls/callInstance';
import CALL_STATE from '@lib/calls/callState';
import {SDPBuilder} from '@lib/calls/sdpBuilder';
import {
  P2P_CALLEE_RESTART_DELAY_MS,
  P2P_ICE_RESTART_RETRY_MS,
  P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS
} from '@lib/calls/p2P/connectionRecovery';
import P2PCallStats from '@lib/calls/p2P/callStats';
import {P2PMessage} from '@lib/calls/types';

function offerSdp(ufrag: string) {
  return [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0 3',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`,
    'a=ice-pwd:localpassword',
    'a=ice-options:trickle',
    'a=fingerprint:sha-256 AA:BB',
    'a=setup:actpass',
    'a=mid:0',
    'a=sendrecv',
    'a=rtcp-mux',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1',
    'a=ssrc:1111 cname:local',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`,
    'a=ice-pwd:localpassword',
    'a=fingerprint:sha-256 AA:BB',
    'a=setup:actpass',
    'a=mid:3',
    'a=sctp-port:5000',
    ''
  ].join('\r\n');
}

function makeConnection(over: Record<string, unknown> = {}) {
  let ufrag = 'local1';
  const connection: any = {
    iceConnectionState: 'new',
    connectionState: 'new',
    signalingState: 'stable',
    localDescription: null as unknown,
    remoteDescription: null as unknown,
    restartIce: vi.fn(() => {
      ufrag = ufrag === 'local1' ? 'local2' : ufrag + '+';
    }),
    createOffer: vi.fn(async() => ({type: 'offer', sdp: offerSdp(ufrag)})),
    createAnswer: vi.fn(async() => ({type: 'answer', sdp: offerSdp(ufrag)})),
    setLocalDescription: vi.fn(async(description: RTCSessionDescriptionInit) => {
      if(description.type === 'rollback') {
        connection.signalingState = 'stable';
        connection.localDescription = null;
        return;
      }

      connection.localDescription = description;
      connection.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
    }),
    setRemoteDescription: vi.fn(async(description: RTCSessionDescriptionInit) => {
      connection.remoteDescription = description;
      connection.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    }),
    getTransceivers: vi.fn((): unknown[] => []),
    addTransceiver: vi.fn((kind: string, init: RTCRtpTransceiverInit) => ({
      mid: null as string,
      direction: init?.direction,
      receiver: {track: {kind}},
      sender: {track: null as MediaStreamTrack}
    })),
    getStats: vi.fn(async() => new Map()),
    close: vi.fn(),
    ...over
  };
  return connection;
}

const remoteSetup = {
  '@type': 'InitialSetup' as const,
  ufrag: 'remote1',
  pwd: 'remotepassword',
  renomination: false,
  fingerprints: [{hash: 'sha-256', fingerprint: 'CC:DD', setup: 'active'}]
};

// Every engine a test starts listens on `window`; stopped after each test.
const recoveries: {stop: () => void}[] = [];

function makeCall(options: {isOutgoing: boolean, p2p?: Record<string, unknown>}) {
  const discardCall = vi.fn(async() => {});
  const instance = new CallInstance({
    isOutgoing: options.isOutgoing,
    interlocutorUserId: 123 as UserId,
    managers: {appCallsManager: {discardCall, sendSignalingData: vi.fn(async() => {})}} as any
  });
  const log = Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()});
  (instance as any).log = log;
  instance.id = 'call';
  instance.call = {_: 'phoneCall', id: 'call', access_hash: '42', pFlags: {}} as any;
  const sent: P2PMessage[] = [];
  (instance as any).sendCallSignalingData = vi.fn(async(message: P2PMessage) => {
    sent.push(message);
  });

  const connection = makeConnection();
  const noTrack: MediaStreamTrack | null = null;
  const silenceTrack = {kind: 'audio', enabled: false, stop: vi.fn()};
  const silenceStream = {getTracks: () => [silenceTrack], getAudioTracks: () => [silenceTrack]};
  const p2p: any = {
    connection,
    audio: {srcObject: null},
    audioContext: {close: vi.fn(async() => {})},
    handledRemoteExchangeIds: new Set<string>(),
    appliedRemoteExchangeIds: new Set<string>(),
    supersededLocalExchangeIds: new Set<string>(),
    pendingCandidates: [] as unknown[],
    silence: silenceStream,
    streams: {ownAudio: silenceStream},
    transceivers: {audio: {mid: '0', sender: {track: noTrack}, receiver: {track: noTrack}}},
    senders: {audio: {track: noTrack}},
    remoteMediaState: {
      isBatteryLow: false,
      screencastState: 'inactive',
      videoState: 'inactive',
      videoRotation: 0,
      isMuted: true
    },
    exchangeId: 100,
    ...options.p2p
  };
  (instance as any).p2p = p2p;
  p2p.recovery = (instance as any).createP2pRecovery(connection);
  p2p.stats = (instance as any).createP2pStats(connection);
  p2p.recovery.start();
  recoveries.push(p2p.recovery, p2p.stats);

  const setIceState = (state: RTCIceConnectionState) => {
    connection.iceConnectionState = state;
    (instance as any).onIceConnectionStateChange(connection);
  };

  return {connection, discardCall, instance, log, p2p, sent, setIceState};
}

beforeEach(() => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance']});
  vi.stubGlobal('MediaStream', class {});
  mocks.tryAddCandidate.mockClear();
});

afterEach(() => {
  recoveries.splice(0).forEach((recovery) => recovery.stop());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('P2P recovery: the restart', () => {
  it('restarts ICE from the caller when ICE fails, and sends a new InitialSetup with the offer', async() => {
    const {connection, instance, p2p, sent, setIceState} = makeCall({
      isOutgoing: true,
      p2p: {remoteSetup, lastLocalSetupKey: 'old'}
    });
    setIceState('connected');
    sent.length = 0;

    setIceState('failed');
    await vi.waitFor(() => expect(sent.map((message) => message['@type'])).toEqual(['InitialSetup', 'NegotiateChannels']));

    expect(connection.restartIce).toHaveBeenCalledTimes(1);
    expect((sent[0] as Extract<P2PMessage, {'@type': 'InitialSetup'}>).ufrag).toBe('local2');
    expect(p2p.pendingLocalExchangeId).toBe((sent[1] as Extract<P2PMessage, {'@type': 'NegotiateChannels'}>).exchangeId);
    expect(instance.connectionState).toBe(CALL_STATE.CONNECTED);
  });

  it('re-sends no InitialSetup for an offer whose credentials did not change', async() => {
    const {instance, sent} = makeCall({isOutgoing: true, p2p: {remoteSetup}});

    await (instance as any).sendOffer();
    (instance as any).p2p.connection.signalingState = 'stable';
    await (instance as any).sendOffer();

    expect(sent.map((message) => message['@type'])).toEqual(['InitialSetup', 'NegotiateChannels', 'NegotiateChannels']);
  });

  it('postpones a restart over an offer in flight and retries it', async() => {
    const {connection, p2p, setIceState} = makeCall({isOutgoing: true, p2p: {remoteSetup}});
    setIceState('connected');
    p2p.isMakingOffer = true;

    setIceState('failed');
    expect(connection.restartIce).not.toHaveBeenCalled();

    p2p.isMakingOffer = false;
    await vi.advanceTimersByTimeAsync(P2P_ICE_RESTART_RETRY_MS);
    expect(connection.restartIce).toHaveBeenCalledTimes(1);
  });

  it('lets the callee restart too when the caller does not', async() => {
    const {connection, setIceState} = makeCall({isOutgoing: false, p2p: {remoteSetup}});
    setIceState('connected');
    setIceState('failed');
    expect(connection.restartIce).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(P2P_CALLEE_RESTART_DELAY_MS);
    expect(connection.restartIce).toHaveBeenCalledTimes(1);
    expect(connection.createOffer).toHaveBeenCalledTimes(1);
  });

  it('restarts when the browser comes back online', async() => {
    const {connection, setIceState} = makeCall({isOutgoing: false, p2p: {remoteSetup}});
    setIceState('connected');

    window.dispatchEvent(new Event('online'));

    expect(connection.restartIce).toHaveBeenCalledTimes(1);
  });
});

describe('P2P recovery: the peer restarts', () => {
  it('applies the peer\'s new credentials with its offer and drops its own pending restart', async() => {
    const fromP2p = vi.spyOn(SDPBuilder, 'fromP2p');
    const {connection, p2p, sent, setIceState, instance} = makeCall({
      isOutgoing: false,
      p2p: {remoteSetup, appliedRemoteUfrag: 'remote1'}
    });
    setIceState('connected');
    setIceState('failed');

    const restartedSetup = {...remoteSetup, ufrag: 'remote2', pwd: 'remotepassword2'};
    await (instance as any).processSignalingMessage(restartedSetup);
    await (instance as any).processSignalingMessage({
      '@type': 'NegotiateChannels',
      exchangeId: 'r1',
      contents: [{
        type: 'audio',
        ssrc: '2222',
        payloadTypes: [{id: 111, name: 'opus', clockrate: 48000, channels: 2}],
        rtpExtensions: []
      }]
    });

    expect(fromP2p).toHaveBeenCalledTimes(1);
    expect(fromP2p.mock.calls[0][0].setup.ufrag).toBe('remote2');
    expect(connection.setRemoteDescription).toHaveBeenCalledWith(expect.objectContaining({type: 'offer'}));
    expect(connection.setRemoteDescription.mock.calls[0][0].sdp).toContain('a=ice-ufrag:remote2');
    expect(p2p.appliedRemoteUfrag).toBe('remote2');
    expect(sent.map((message) => message['@type'])).toContain('NegotiateChannels');

    // The callee's own restart was superseded by the caller's.
    await vi.advanceTimersByTimeAsync(P2P_CALLEE_RESTART_DELAY_MS * 2);
    expect(connection.restartIce).not.toHaveBeenCalled();
  });

  it('takes an identical repeated InitialSetup as a no-op', async() => {
    const fromP2p = vi.spyOn(SDPBuilder, 'fromP2p');
    const {connection, instance, p2p} = makeCall({isOutgoing: true, p2p: {remoteSetup, appliedRemoteUfrag: 'remote1'}});

    await (instance as any).processSignalingMessage({...remoteSetup});

    expect(p2p.remoteSetup).toEqual(remoteSetup);
    expect(fromP2p).not.toHaveBeenCalled();
    expect(connection.setRemoteDescription).not.toHaveBeenCalled();
  });
});

describe('P2P recovery: glare and superseded offers', () => {
  it('rolls the callee\'s offer back for the caller\'s, and ignores the late answer to it', async() => {
    vi.spyOn(SDPBuilder, 'fromP2p').mockReturnValue('v=0\r\n');
    const {connection, instance, p2p} = makeCall({isOutgoing: false, p2p: {remoteSetup}});
    await (instance as any).sendOffer();
    const ownExchangeId = p2p.pendingLocalExchangeId;
    expect(connection.signalingState).toBe('have-local-offer');

    const negotiation = (exchangeId: string) => ({
      '@type': 'NegotiateChannels',
      exchangeId,
      contents: [{
        type: 'audio',
        ssrc: '2222',
        payloadTypes: [{id: 111, name: 'opus', clockrate: 48000, channels: 2}],
        rtpExtensions: [] as unknown[]
      }]
    });
    await (instance as any).processSignalingMessage(negotiation('caller-offer'));

    expect(connection.setLocalDescription).toHaveBeenCalledWith({type: 'rollback'});
    expect(connection.setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(p2p.supersededLocalExchangeIds.has(ownExchangeId)).toBe(true);

    // The caller gets to our rolled-back offer later and answers it.
    await (instance as any).processSignalingMessage(negotiation(ownExchangeId));
    expect(connection.setRemoteDescription).toHaveBeenCalledTimes(1);
  });

  it('keeps the peer\'s candidates for a superseded offer while their credentials are current', async() => {
    const {instance, p2p} = makeCall({isOutgoing: true, p2p: {remoteSetup}});
    p2p.supersededLocalExchangeIds.add('old');
    p2p.connection.remoteDescription = {type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:0\r\na=ice-ufrag:remote1\r\n'};

    await (instance as any).processSignalingMessage({
      '@type': 'Candidates',
      exchangeId: 'old',
      ufrag: 'remote1',
      candidates: [{sdpString: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0}]
    });
    await (instance as any).processSignalingMessage({
      '@type': 'Candidates',
      exchangeId: 'old',
      ufrag: 'stale',
      candidates: [{sdpString: 'candidate:2 1 udp 1 1.2.3.4 6 typ host', sdpMid: '0', sdpMLineIndex: 0}]
    });

    expect(mocks.tryAddCandidate).toHaveBeenCalledTimes(1);
    expect(mocks.tryAddCandidate.mock.calls[0][2]).toMatchObject({sdpString: 'candidate:1 1 udp 1 1.2.3.4 5 typ host'});
    expect(p2p.pendingCandidates).toHaveLength(0);
  });
});

describe('P2P recovery: giving up and cleaning up', () => {
  it('reports CONNECTING while recovering a call that never connected, and hangs up after 20 s', async() => {
    const {connection, discardCall, instance, setIceState} = makeCall({isOutgoing: true, p2p: {remoteSetup}});
    setIceState('checking');
    connection.connectionState = 'failed';
    (instance as any).onUpdate({'@type': 'updatePhoneCallConnectionState', connectionState: 'failed'});
    setIceState('failed');

    expect(instance.connectionState).toBe(CALL_STATE.CONNECTING);
    await vi.advanceTimersByTimeAsync(P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS - 1);
    expect(discardCall).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(discardCall).toHaveBeenCalledWith('call', 0, {_: 'phoneCallDiscardReasonDisconnect'}, false);
    expect(instance.connectionState).toBe(CALL_STATE.CLOSED);
  });

  it('leaves no listener or timer behind once the call ends', async() => {
    const {connection, instance, setIceState} = makeCall({isOutgoing: true, p2p: {remoteSetup}});
    setIceState('connected');
    setIceState('disconnected');
    (instance as any).p2p.stats.start();

    await instance.hangUp('phoneCallDiscardReasonHangup');
    expect((instance as any).p2p).toBeUndefined();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(P2P_NEVER_CONNECTED_FAILURE_TIMEOUT_MS * 2);

    expect(connection.restartIce).not.toHaveBeenCalled();
    expect(connection.getStats).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops a real stats poller with the engine', async() => {
    const {connection, instance} = makeCall({isOutgoing: true});
    const stats = (instance as any).p2p.stats as P2PCallStats;
    stats.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(connection.getStats).toHaveBeenCalledTimes(1);

    (instance as any).stopPhoneCall();
    await vi.advanceTimersByTimeAsync(5000);
    expect(connection.getStats).toHaveBeenCalledTimes(1);
  });
});
