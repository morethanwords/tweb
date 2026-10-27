/*
 * The signal bars and the stats log of a 1-on-1 call (p2P/callStats), against
 * native tgcalls v2 (InstanceV2Impl.cpp writeStateLogRecords / stop).
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import P2PCallStats, {
  getSignalBars,
  P2P_STATS_INTERVAL_MS,
  P2P_STATS_LOG_MAX_BYTES,
  P2PNetworkState,
  serializeStatsLog
} from '@lib/calls/p2P/callStats';

type Stat = Record<string, unknown> & {id: string, type: string};

function makeReport(stats: Stat[]): RTCStatsReport {
  return new Map(stats.map((stat) => [stat.id, stat])) as unknown as RTCStatsReport;
}

function chromeReport(over: {pair?: Partial<Stat>, local?: Partial<Stat>, remote?: Partial<Stat>} = {}) {
  return makeReport([
    {id: 'T', type: 'transport', selectedCandidatePairId: 'CP'},
    {id: 'CP', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', availableOutgoingBitrate: 250000, ...over.pair},
    {id: 'L', type: 'local-candidate', candidateType: 'relay', protocol: 'udp', address: '203.0.113.5', port: 3478, ...over.local},
    {id: 'R', type: 'remote-candidate', candidateType: 'srflx', protocol: 'udp', address: '2001:db8::7', port: 61000, ...over.remote}
  ]);
}

const log = Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn()}) as any;

describe('P2P signal bars', () => {
  it('measure the send bandwidth against 16 kbps for audio, 600 kbps with the camera on', () => {
    expect([0, 4, 8, 15.9, 16, 100].map((kbps) => getSignalBars(kbps, false))).toEqual([0, 1, 2, 3, 4, 4]);
    expect([0, 150, 300, 599, 600, 2000].map((kbps) => getSignalBars(kbps, true))).toEqual([0, 1, 2, 3, 4, 4]);
    expect(getSignalBars(-5, false)).toBe(0);
    expect(getSignalBars(NaN, true)).toBe(0);
  });
});

describe('P2P stats log', () => {
  const connection: P2PNetworkState['connection'] = {
    local: {type: 'local', protocol: 'udp', address: '192.168.1.2:50000'},
    remote: {type: 'stun', protocol: 'udp', address: '[2001:db8::1]:40000'}
  };
  const route = {local: 'p2p', remote: 'turn'};

  it('is the native JSON: coalesced network records with relative string times, kbps bitrates', () => {
    const json = serializeStatsLog([
      {timestamp: 1000, record: {isConnected: false, isFailed: false}},
      // Within 5 ms of the previous one, which is dropped.
      {timestamp: 1002, record: {isConnected: false, isFailed: false, route, connection}},
      {timestamp: 2500, record: {isConnected: true, isFailed: false, route, connection}},
      {timestamp: 9000, record: {isConnected: false, isFailed: true, route, connection}}
    ], [30, 45]);

    const network = '"network":{"local":{"address":"192.168.1.2:50000","protocol":"udp","type":"local"},' +
      '"remote":{"address":"[2001:db8::1]:40000","protocol":"udp","type":"stun"}}';
    expect(json).toBe(
      '{"bitrate":[{"b":30},{"b":45}],"network":[' +
      `{"c":0,"local":"p2p",${network},"remote":"turn","t":"0"},` +
      `{"c":1,"local":"p2p",${network},"remote":"turn","t":"1498"},` +
      `{"c":0,"failed":1,"local":"p2p",${network},"remote":"turn","t":"7998"}` +
      ']}'
    );
  });

  it('keeps within 16 KB by shedding the oldest bitrate records', () => {
    const bitrate = Array.from({length: 5000}, (_, index) => index);
    const json = serializeStatsLog([
      {timestamp: 0, record: {isConnected: false, isFailed: false}},
      {timestamp: 100, record: {isConnected: true, isFailed: false, route, connection}}
    ], bitrate, P2P_STATS_LOG_MAX_BYTES);

    expect(json.length).toBeLessThanOrEqual(P2P_STATS_LOG_MAX_BYTES);
    const parsed = JSON.parse(json);
    expect(parsed.network).toHaveLength(2);
    expect(parsed.bitrate.at(-1)).toEqual({b: 4999});
    expect(parsed.bitrate.length).toBeGreaterThan(1000);
  });
});

describe('P2P stats polling', () => {
  beforeEach(() => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance']});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeStats(getStats: () => Promise<RTCStatsReport>, hasVideo = false) {
    const onSignalBars = vi.fn();
    const stats = new P2PCallStats({getStats, hasVideo: () => hasVideo, onSignalBars, log});
    stats.start();
    return {onSignalBars, stats};
  }

  it('samples the selected pair once a second: bandwidth, route and candidates', async() => {
    const getStats = vi.fn(async() => chromeReport());
    const {onSignalBars, stats} = makeStats(getStats);
    stats.setConnected(true);

    await vi.advanceTimersByTimeAsync(P2P_STATS_INTERVAL_MS);

    expect(getStats).toHaveBeenCalledTimes(1);
    expect(onSignalBars).toHaveBeenCalledWith(4);
    const log = JSON.parse(stats.getReport().json);
    expect(log.bitrate).toEqual([{b: 250}]);
    expect(log.network.at(-1)).toEqual({
      c: 1,
      local: 'turn',
      network: {
        local: {address: '203.0.113.5:3478', protocol: 'udp', type: 'relay'},
        remote: {address: '[2001:db8::7]:61000', protocol: 'udp', type: 'stun'}
      },
      remote: 'p2p',
      t: expect.any(String)
    });
  });

  it('measures video calls against 600 kbps', async() => {
    const {onSignalBars} = makeStats(async() => chromeReport(), true);

    await vi.advanceTimersByTimeAsync(P2P_STATS_INTERVAL_MS);

    expect(onSignalBars).toHaveBeenCalledWith(1);
  });

  it('logs what the pair sent, but shows no bars, where the browser has no bandwidth estimate', async() => {
    let bytesSent = 0;
    let timestamp = 0;
    const getStats = vi.fn(async() => {
      bytesSent += 5000;
      timestamp += 1000;
      return makeReport([
        {id: 'CP', type: 'candidate-pair', selected: true, localCandidateId: 'L', remoteCandidateId: 'R', bytesSent, timestamp},
        {id: 'L', type: 'local-candidate', candidateType: 'host', protocol: 'udp', address: '10.0.0.2', port: 5000},
        {id: 'R', type: 'remote-candidate', candidateType: 'prflx', protocol: 'udp', address: '10.0.0.3', port: 6000}
      ]);
    });
    const {onSignalBars, stats} = makeStats(getStats);

    await vi.advanceTimersByTimeAsync(P2P_STATS_INTERVAL_MS * 2);

    // 5000 bytes a second = 40 kbps, logged from the second sample on. What
    // was sent says nothing about what the link could carry, so no bars.
    expect(JSON.parse(stats.getReport().json).bitrate).toEqual([{b: 40}]);
    expect(onSignalBars).not.toHaveBeenCalled();
  });

  it('reports no bars before a candidate pair is selected', async() => {
    const getStats = vi.fn(async() => makeReport([
      {id: 'CP', type: 'candidate-pair', state: 'in-progress', localCandidateId: 'L', remoteCandidateId: 'R'}
    ]));
    const {onSignalBars, stats} = makeStats(getStats);

    await vi.advanceTimersByTimeAsync(P2P_STATS_INTERVAL_MS * 3);

    expect(getStats).toHaveBeenCalled();
    expect(onSignalBars).not.toHaveBeenCalled();
    expect(JSON.parse(stats.getReport().json).bitrate).toEqual([]);
  });

  it('marks a given-up transport failed and stops polling when stopped', async() => {
    const getStats = vi.fn(async() => chromeReport());
    const {stats} = makeStats(getStats);
    stats.addEvent('ice failed');
    stats.setFailed();
    stats.stop();
    await vi.advanceTimersByTimeAsync(P2P_STATS_INTERVAL_MS * 3);

    expect(getStats).not.toHaveBeenCalled();
    const report = stats.getReport();
    expect(JSON.parse(report.json).network.at(-1)).toMatchObject({c: 0, failed: 1});
    expect(report.text).toContain('ice failed');
    expect(report.text).toContain('"failed":1');
  });
});
