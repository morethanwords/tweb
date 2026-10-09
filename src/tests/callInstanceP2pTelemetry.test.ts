/*
 * What a 1-on-1 call reports about itself: signal bars while it runs, the
 * low-battery flag, and the stats log uploaded after it (phone.saveCallDebug,
 * phone.saveCallLog when the server asks for the full log).
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {gunzipSync} from 'fflate';

const mocks = vi.hoisted(() => ({
  appSettings: {callDevices: {speakerId: ''}}
}));

vi.mock('@helpers/dom/safePlay', () => ({default: vi.fn()}));
vi.mock('@environment/webpSupport', () => ({default: true}));
vi.mock('@lib/calls/helpers/getStreamCached', () => ({default: () => vi.fn()}));
vi.mock('@lib/calls/helpers/stopTrack', () => ({
  default: (track: {stop: () => void}) => track.stop()
}));
vi.mock('@lib/calls/localConferenceDescription', () => ({default: class LocalConferenceDescription {}}));
vi.mock('@lib/calls/streamManager', () => ({default: class StreamManager {
  public stop() {}
}}));
vi.mock('@lib/calls/callsController', () => ({default: {dispatchEvent: vi.fn()}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {invokeCrypto: vi.fn()}}));
vi.mock('@stores/appSettings', () => ({appSettings: mocks.appSettings}));

import CallInstance from '@lib/calls/callInstance';
import {PhoneCall} from '@layer';

const ENCRYPTION_KEY = new Uint8Array(256).fill(0xAB);

function makeCall(appCallsManager: Record<string, unknown>) {
  const instance = new CallInstance({
    isOutgoing: true,
    interlocutorUserId: 123 as UserId,
    managers: {appCallsManager} as any
  });
  const log = Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()});
  (instance as any).log = log;
  instance.encryptionKey = ENCRYPTION_KEY;
  return {instance, log};
}

function startEngine(instance: CallInstance) {
  const track = {kind: 'audio', enabled: true, stop: vi.fn()};
  const stream = {getTracks: () => [track], getAudioTracks: () => [track]};
  const connection = {
    iceConnectionState: 'connected',
    connectionState: 'connected',
    signalingState: 'stable',
    getStats: vi.fn(async() => new Map([
      ['T', {id: 'T', type: 'transport', selectedCandidatePairId: 'CP'}],
      ['CP', {id: 'CP', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', availableOutgoingBitrate: 48000}],
      ['L', {id: 'L', type: 'local-candidate', candidateType: 'host', protocol: 'udp', address: '10.0.0.2', port: 5000}],
      ['R', {id: 'R', type: 'remote-candidate', candidateType: 'relay', protocol: 'udp', address: '198.51.100.9', port: 3478}]
    ])),
    close: vi.fn()
  };
  const dataChannel = {readyState: 'open', send: vi.fn(), close: vi.fn()};
  const p2p: any = {
    connection,
    dataChannel,
    audio: {srcObject: null},
    audioContext: {close: vi.fn(async() => {})},
    streams: {ownAudio: stream},
    silence: {getTracks: (): unknown[] => []},
    senders: {}
  };
  (instance as any).p2p = p2p;
  p2p.stats = (instance as any).createP2pStats(connection);
  p2p.stats.start();
  return {connection, dataChannel, p2p};
}

const phoneCall = (over: Record<string, unknown>) => ({
  _: 'phoneCall',
  id: '7',
  access_hash: '99',
  pFlags: {},
  ...over
}) as unknown as PhoneCall;

beforeEach(() => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance']});
  vi.stubGlobal('MediaStream', class {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('P2P call input for phone.* methods', () => {
  it('keeps the access hash the final phoneCallDiscarded no longer has', () => {
    const {instance} = makeCall({});
    instance.setPhoneCall(phoneCall({_: 'phoneCallWaiting', id: -1, access_hash: ''}));
    expect(instance.getInputPhoneCall()).toBeUndefined();

    instance.setPhoneCall(phoneCall({}));
    instance.setPhoneCall({_: 'phoneCallDiscarded', id: '7', pFlags: {}} as PhoneCall);

    expect(instance.getInputPhoneCall()).toEqual({_: 'inputPhoneCall', id: '7', access_hash: '99'});
  });
});

describe('P2P signal bars', () => {
  it('are published as they change', async() => {
    const {instance} = makeCall({});
    const onBars = vi.fn();
    instance.addEventListener('signalBars', onBars);
    expect(instance.signalBars).toBeUndefined();
    startEngine(instance);
    (instance as any).onUpdate({'@type': 'updatePhoneCallConnectionState', 'connectionState': 'connected'});

    await vi.advanceTimersByTimeAsync(3000);

    // 48 kbps of estimated bandwidth, audio only: full bars, announced once.
    expect(instance.signalBars).toBe(4);
    expect(onBars).toHaveBeenCalledTimes(1);
    expect(onBars).toHaveBeenCalledWith(4);
  });

  it('are dropped when the call stops being connected, so a reconnect shows no stale reading', async() => {
    const {instance} = makeCall({});
    startEngine(instance);
    const update = (connectionState: RTCPeerConnectionState) => (instance as any).onUpdate({
      '@type': 'updatePhoneCallConnectionState',
      connectionState
    });
    update('connected');
    await vi.advanceTimersByTimeAsync(3000);
    expect(instance.signalBars).toBe(4);

    update('disconnected');

    expect(instance.signalBars).toBeUndefined();

    // The stats keep polling while it reconnects; their readings are the
    // broken path's and must not be what the call shows once it is back.
    await vi.advanceTimersByTimeAsync(3000);
    expect(instance.signalBars).toBeUndefined();
  });
});

describe('P2P low battery', () => {
  it('goes out in the MediaState', () => {
    const {instance} = makeCall({});
    const {dataChannel} = startEngine(instance);
    (instance as any).isLowBattery = true;

    (instance as any).sendLocalMediaState();

    expect(JSON.parse(dataChannel.send.mock.calls[0][0])).toMatchObject({'@type': 'MediaState', 'lowBattery': true});
    expect(instance.getMediaState('input').lowBattery).toBe(true);
  });
});

describe('P2P call debug log upload', () => {
  async function endConnectedCall(appCallsManager: Record<string, unknown>, byPeer = false) {
    const {instance, log} = makeCall({discardCall: vi.fn(async() => {}), ...appCallsManager});
    instance.setPhoneCall(phoneCall({}));
    startEngine(instance);
    (instance as any).p2pConnectionState = 'connected';
    instance.connectedAt = performance.now();
    await vi.advanceTimersByTimeAsync(2000);

    await instance.hangUp(byPeer ? {_: 'phoneCallDiscardReasonHangup'} : 'phoneCallDiscardReasonHangup', byPeer);
    await vi.advanceTimersByTimeAsync(0);
    return {instance, log};
  }

  it('sends the native stats log after a call that connected', async() => {
    const saveCallDebug = vi.fn(async() => true);
    const saveCallLog = vi.fn(async() => {});
    await endConnectedCall({saveCallDebug, saveCallLog});

    expect(saveCallDebug).toHaveBeenCalledTimes(1);
    const [input, json] = saveCallDebug.mock.calls[0] as unknown as [unknown, string];
    expect(input).toEqual({_: 'inputPhoneCall', id: '7', access_hash: '99'});
    const statsLog = JSON.parse(json);
    expect(statsLog.bitrate).toEqual([{b: 48}, {b: 48}]);
    expect(statsLog.network[0]).toEqual({c: 0, t: '0'});
    expect(statsLog.network.at(-1)).toMatchObject({local: 'p2p', remote: 'turn'});
    expect(saveCallLog).not.toHaveBeenCalled();
  });

  it('sends the gzipped full log when the server asks for it — with no key material', async() => {
    const saveCallDebug = vi.fn(async() => false);
    const saveCallLog = vi.fn(async(_input: unknown, _blob: Blob) => {});
    await endConnectedCall({saveCallDebug, saveCallLog}, true);

    await vi.waitFor(() => expect(saveCallLog).toHaveBeenCalledTimes(1));
    const [input, blob] = saveCallLog.mock.calls[0];
    expect(input).toEqual({_: 'inputPhoneCall', id: '7', access_hash: '99'});
    const text = new TextDecoder().decode(gunzipSync(new Uint8Array(await blob.arrayBuffer())));
    expect(text).toContain('events:');
    expect(text).toContain('hang up: phoneCallDiscardReasonHangup (by the peer)');
    expect(text).toContain('"bitrate":[{"b":48},{"b":48}]');
    expect(text.toLowerCase()).not.toContain('abababab');
  });

  it('never lets a failed upload fail the hang-up', async() => {
    const saveCallDebug = vi.fn(async() => {
      throw new Error('FLOOD_WAIT');
    });
    const {instance, log} = await endConnectedCall({saveCallDebug});

    expect(saveCallDebug).toHaveBeenCalled();
    expect((instance as any).p2p).toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith('uploading the call debug log failed', expect.any(Error));
  });

  it('sends nothing for a call that never connected', async() => {
    const saveCallDebug = vi.fn(async() => true);
    const {instance} = makeCall({discardCall: vi.fn(async() => {}), saveCallDebug});
    instance.setPhoneCall(phoneCall({}));
    startEngine(instance);

    await instance.hangUp('phoneCallDiscardReasonHangup');
    await vi.advanceTimersByTimeAsync(0);

    expect(saveCallDebug).not.toHaveBeenCalled();
  });
});
