/*
 * What a CallInstance accepts from the peer over 1-on-1 signaling.
 *
 * The peer is authenticated, but it is still the other party: its
 * NegotiateChannels is interpolated into the SDP handed to the browser (an
 * unsafe InitialSetup was already refused; the media fields were not), its
 * Candidates and its encrypted packets were queued without a bound, and a
 * redelivered phoneCallAccepted re-ran the key exchange.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';

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
vi.mock('@lib/calls/streamManager', () => ({default: class StreamManager {}}));
vi.mock('@lib/calls/callsController', () => ({default: {dispatchEvent: vi.fn()}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {invokeCrypto: mocks.invokeCrypto}}));
vi.mock('@stores/appSettings', () => ({appSettings: mocks.appSettings}));

import CallInstance from '@lib/calls/callInstance';
import CALL_STATE from '@lib/calls/callState';
import {P2P_MAX_PENDING_CANDIDATES, P2P_SIGNALING_MAX_QUEUED_PACKETS} from '@lib/calls/constants';
import {SDPBuilder} from '@lib/calls/sdpBuilder';

function makeInstance(managers: Record<string, unknown> = {}) {
  const instance = new CallInstance({
    isOutgoing: false,
    interlocutorUserId: 123 as UserId,
    managers: managers as any
  });
  const log = Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()});
  (instance as any).log = log;
  return {instance, log};
}

// The slice of engine state the signaling handlers read. The connection is a
// stable one with no remote description yet, so candidates queue and a remote
// offer is applied straight away.
function makeP2p(over: Record<string, unknown> = {}): any {
  const noTrack: MediaStreamTrack | null = null;
  return {
    connection: {
      remoteDescription: null as unknown,
      localDescription: null as unknown,
      signalingState: 'stable',
      setRemoteDescription: vi.fn(async() => {}),
      setLocalDescription: vi.fn(async() => {}),
      createAnswer: vi.fn(async() => ({type: 'answer', sdp: ''})),
      getTransceivers: vi.fn(() => [])
    },
    handledRemoteExchangeIds: new Set<string>(),
    appliedRemoteExchangeIds: new Set<string>(),
    pendingCandidates: [] as unknown[],
    streams: {},
    transceivers: {audio: {sender: {track: noTrack}, receiver: {track: noTrack}}},
    senders: {audio: {track: noTrack}},
    remoteMediaState: {
      isBatteryLow: false,
      screencastState: 'inactive',
      videoState: 'inactive',
      videoRotation: 0,
      isMuted: true
    },
    exchangeId: 1,
    ...over
  };
}

const remoteSetup = {
  '@type': 'InitialSetup' as const,
  ufrag: 'abcd',
  pwd: 'secret',
  renomination: false,
  fingerprints: [{hash: 'sha-256', fingerprint: 'AA:BB', setup: 'active'}]
};

function negotiateChannels(codecName: string, exchangeId: unknown = '7') {
  return {
    '@type': 'NegotiateChannels',
    exchangeId,
    contents: [{
      type: 'audio',
      ssrc: '1234',
      payloadTypes: [{id: 111, name: codecName, clockrate: 48000, channels: 2}],
      rtpExtensions: [] as unknown[]
    }]
  };
}

function candidates(exchangeId: string, sdpString: string) {
  return {
    '@type': 'Candidates',
    exchangeId,
    candidates: [{sdpString, sdpMid: '0', sdpMLineIndex: 0}]
  };
}

describe('CallInstance NegotiateChannels', () => {
  let fromP2p: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fromP2p = vi.spyOn(SDPBuilder, 'fromP2p').mockReturnValue('v=0\r\n');
    fromP2p.mockClear();
    mocks.tryAddCandidate.mockClear();
  });

  it('builds the remote SDP from a well-formed negotiation', async() => {
    const {instance, log} = makeInstance({appCallsManager: {sendSignalingData: vi.fn(async() => {})}});
    (instance as any).encryptor = {encryptRawPacket: vi.fn(async() => ({bytes: new Uint8Array(1)}))};
    const p2p = makeP2p({remoteSetup});
    (instance as any).p2p = p2p;

    await (instance as any).processSignalingMessage(negotiateChannels('opus'));

    expect(fromP2p).toHaveBeenCalledTimes(1);
    expect(p2p.connection.setRemoteDescription).toHaveBeenCalledWith({type: 'offer', sdp: 'v=0\r\n'});
    expect(log.error).not.toHaveBeenCalled();
  });

  it('drops a negotiation whose codec name would end the SDP line early', async() => {
    const {instance, log} = makeInstance();
    const p2p = makeP2p({remoteSetup});
    (instance as any).p2p = p2p;

    // The classic payload: close the line, then add attributes of your choosing.
    await (instance as any).processSignalingMessage(negotiateChannels('opus\r\na=candidate:evil'));

    expect(fromP2p).not.toHaveBeenCalled();
    expect(p2p.connection.setRemoteDescription).not.toHaveBeenCalled();
    expect(p2p.pendingRemoteNegotiation).toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('NegotiateChannels'));
  });

  it('drops a negotiation whose exchange id is not a plain string', async() => {
    const {instance, log} = makeInstance();
    const p2p = makeP2p({remoteSetup});
    (instance as any).p2p = p2p;

    await (instance as any).processSignalingMessage(negotiateChannels('opus', 7));
    await (instance as any).processSignalingMessage(negotiateChannels('opus', 'x\r\ny'));

    expect(fromP2p).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(2);
  });
});

describe('CallInstance pending ICE candidates', () => {
  beforeEach(() => {
    mocks.tryAddCandidate.mockClear();
  });

  it('keeps only the newest candidates once the queue is full', async() => {
    const {instance, log} = makeInstance();
    const p2p = makeP2p();
    (instance as any).p2p = p2p;

    const total = P2P_MAX_PENDING_CANDIDATES + 40;
    for(let i = 0; i < total; ++i) {
      await (instance as any).processSignalingMessage(candidates('later', `candidate:${i}`));
    }

    expect(p2p.pendingCandidates).toHaveLength(P2P_MAX_PENDING_CANDIDATES);
    expect((p2p.pendingCandidates[0] as {sdpString: string}).sdpString).toBe('candidate:40');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('ICE candidates'), expect.anything());
    expect(mocks.tryAddCandidate).not.toHaveBeenCalled();
  });

  it('drops a queued candidate whose exchange was superseded', async() => {
    const {instance} = makeInstance();
    const p2p = makeP2p();
    p2p.connection.remoteDescription = {sdp: 'v=0\r\n'};
    (instance as any).p2p = p2p;

    await (instance as any).processSignalingMessage(candidates('old', 'candidate:old'));
    expect(p2p.pendingCandidates).toHaveLength(1);

    // A newer exchange resolves without ever mentioning "old".
    p2p.appliedRemoteExchangeIds.add('new');
    (p2p as any).appliedRemoteExchangeId = 'new';
    await (instance as any).processSignalingMessage(candidates('new', 'candidate:new'));

    expect(p2p.pendingCandidates).toHaveLength(0);
    expect(mocks.tryAddCandidate).toHaveBeenCalledTimes(1);
    expect(mocks.tryAddCandidate.mock.calls[0][2]).toMatchObject({sdpString: 'candidate:new'});
  });

  it('keeps a candidate that arrived ahead of its own exchange', async() => {
    const {instance} = makeInstance();
    const p2p = makeP2p();
    p2p.connection.remoteDescription = {sdp: 'v=0\r\n'};
    (instance as any).p2p = p2p;

    await (instance as any).processSignalingMessage(candidates('next', 'candidate:next'));
    expect(p2p.pendingCandidates).toHaveLength(1);

    p2p.appliedRemoteExchangeIds.add('next');
    await (instance as any).commitPendingIceCandidates();

    expect(p2p.pendingCandidates).toHaveLength(0);
    expect(mocks.tryAddCandidate).toHaveBeenCalledTimes(1);
  });
});

describe('CallInstance.confirmCall', () => {
  function makeCaller() {
    const computeKey = vi.fn(async() => ({key: new Uint8Array(256).fill(4), key_fingerprint: '1'}));
    const confirmCall = vi.fn(async() => ({_: 'phoneCall', id: 'call', pFlags: {}}));
    const {instance, log} = makeInstance({appCallsManager: {computeKey, confirmCall}});
    Object.assign(instance, {
      isOutgoing: true,
      id: 'call',
      call: {_: 'phoneCallAccepted', id: 'call', g_b: new Uint8Array(256).fill(3), pFlags: {}},
      dh: {a: new Uint8Array([2]), g_a: new Uint8Array([3]), g_a_hash: new Uint8Array(32), p: new Uint8Array([11])},
      joinCall: vi.fn()
    });
    return {computeKey, confirmCall, instance, log};
  }

  it('runs the exchange once, however often phoneCallAccepted is delivered', async() => {
    const {computeKey, confirmCall, instance, log} = makeCaller();

    await instance.confirmCall();
    await instance.confirmCall();

    expect(computeKey).toHaveBeenCalledTimes(1);
    expect(confirmCall).toHaveBeenCalledTimes(1);
    expect(instance.joinCall).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('repeated'), 'call');
  });

  it('does not start a second exchange while the first is in flight', async() => {
    const {computeKey, instance} = makeCaller();
    instance.overrideConnectionState(CALL_STATE.EXCHANGING_KEYS);

    await instance.confirmCall();

    expect(computeKey).not.toHaveBeenCalled();
  });
});

describe('CallInstance signaling queue before the key', () => {
  it('keeps only the newest packets once the queue is full', () => {
    const {instance, log} = makeInstance();

    const total = P2P_SIGNALING_MAX_QUEUED_PACKETS + 36;
    for(let i = 0; i < total; ++i) {
      instance.onUpdatePhoneCallSignalingData(new Uint8Array([i]));
    }

    const queue = (instance as any).decryptQueue as Uint8Array[];
    expect(queue).toHaveLength(P2P_SIGNALING_MAX_QUEUED_PACKETS);
    expect(queue[0][0]).toBe(36);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('signaling packets'), expect.anything());
  });
});
