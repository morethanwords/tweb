/*
 * Transport telemetry of a 1-on-1 call: the signal bars shown during the call
 * and the stats log uploaded after it (phone.saveCallDebug).
 *
 * Both are ports of native tgcalls v2 (InstanceV2Impl.cpp), fed by
 * RTCPeerConnection.getStats() once a second:
 * - writeStateLogRecords: every second, a bitrate record of the estimated
 *   send bandwidth in kbps, and signal bars = that bandwidth over 16 kbps
 *   (audio only) or 600 kbps (camera on), clamped to [0, 1], times 4, truncated.
 *   The estimate is `availableOutgoingBitrate` of the selected candidate pair —
 *   the browser's counterpart of webrtc Call::Stats::send_bandwidth_bps; where
 *   a browser does not report it (Firefox), the bytes the pair actually sent
 *   stand in for the log, and no bars are shown — what was sent says nothing
 *   about what the link could carry.
 * - onNetworkStateUpdated: a network record whenever connectivity, the route
 *   (turn/p2p on each side) or the selected candidate pair changes.
 * - stop: records closer than 5 ms are coalesced and the log is serialized as
 *   {"bitrate":[{"b":kbps}],"network":[{"c":0|1,"failed"?:1,"local"?,
 *   "network"?:{"local":{address,protocol,type},"remote":{…}},"remote"?,
 *   "t":"<ms since the first record>"}]}.
 *
 * The client keeps the log within 16 KB (Telegram iOS drops a bigger one,
 * RateCall.swift), shedding the oldest bitrate records first.
 */

import type {Logger} from '@lib/logger';
import {CALL_SIGNAL_BARS_COUNT} from '@lib/calls/constants';

export const P2P_STATS_INTERVAL_MS = 1000;
export const P2P_STATS_LOG_MAX_BYTES = 16 * 1024;
const AUDIO_BITRATE_NORM_KBPS = 16;
const VIDEO_BITRATE_NORM_KBPS = 600;
// v2/InstanceV2Impl.cpp stop(): "coalesce events within 5ms".
const NETWORK_RECORD_COALESCE_MS = 5;

// Memory bounds for a long call; the serialized log is cut to 16 KB anyway.
const MAX_BITRATE_RECORDS = 2048;
const MAX_NETWORK_RECORDS = 512;
const MAX_EVENTS = 512;

// cricket::Candidate::type() names the webrtc candidate types differently from
// the RTCStats `candidateType` (see GroupInstanceReferenceImpl.cpp
// mapIceCandidateTypeToInternal).
const NATIVE_CANDIDATE_TYPES: Record<string, string> = {
  host: 'local',
  srflx: 'stun',
  prflx: 'prflx',
  relay: 'relay'
};

export type P2PStatsCandidate = {
  type: string,
  protocol: string,
  address: string
};

export type P2PNetworkState = {
  isConnected: boolean,
  isFailed: boolean,
  route?: {local: string, remote: string},
  connection?: {local: P2PStatsCandidate, remote: P2PStatsCandidate}
};

type TimedRecord<T> = {timestamp: number, record: T};

type StatsEntry = Record<string, any> & {id: string, type: string, timestamp?: number};

export type P2PCallStatsReport = {
  /** The native stats log, ≤ 16 KB — for phone.saveCallDebug. */
  json: string,
  /** The complete stats log and the call's network events — for phone.saveCallLog. */
  text: string
};

export function getSignalBars(sendBitrateKbps: number, hasVideo: boolean) {
  if(!Number.isFinite(sendBitrateKbps)) {
    return 0;
  }

  const norm = hasVideo ? VIDEO_BITRATE_NORM_KBPS : AUDIO_BITRATE_NORM_KBPS;
  const quality = Math.min(1, Math.max(0, sendBitrateKbps / norm));
  return Math.floor(quality * CALL_SIGNAL_BARS_COUNT);
}

function formatAddress(address: string | undefined, port: number | undefined) {
  if(!address) {
    return '';
  }

  // rtc::SocketAddress::ToString: "ip:port", IPv6 in brackets.
  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
  return port !== undefined ? `${host}:${port}` : host;
}

function describeCandidate(stat: StatsEntry): P2PStatsCandidate {
  return {
    type: NATIVE_CANDIDATE_TYPES[stat.candidateType] ?? String(stat.candidateType ?? ''),
    protocol: String(stat.protocol ?? ''),
    address: formatAddress(stat.address ?? stat.ip, stat.port)
  };
}

function findSelectedCandidatePair(report: RTCStatsReport): StatsEntry | undefined {
  let pair: StatsEntry | undefined;
  report.forEach((stat: StatsEntry) => {
    if(!pair && stat.type === 'transport' && stat.selectedCandidatePairId) {
      pair = report.get(stat.selectedCandidatePairId);
    }
  });

  if(pair) {
    return pair;
  }

  // Firefox has no transport stats, but flags the pair itself.
  report.forEach((stat: StatsEntry) => {
    if(!pair && stat.type === 'candidate-pair' && (stat.selected || (stat.nominated && stat.state === 'succeeded'))) {
      pair = stat;
    }
  });

  return pair;
}

function isSameCandidate(a: P2PStatsCandidate | undefined, b: P2PStatsCandidate | undefined) {
  return a?.type === b?.type && a?.protocol === b?.protocol && a?.address === b?.address;
}

function isSameNetworkState(a: P2PNetworkState, b: P2PNetworkState) {
  return a.isConnected === b.isConnected &&
    a.isFailed === b.isFailed &&
    a.route?.local === b.route?.local &&
    a.route?.remote === b.route?.remote &&
    isSameCandidate(a.connection?.local, b.connection?.local) &&
    isSameCandidate(a.connection?.remote, b.connection?.remote);
}

// Keys in the order json11 (a std::map) writes them, so the JSON reads the
// same as a native client's.
function serializeNetworkRecord(record: P2PNetworkState, t: number) {
  const json: Record<string, unknown> = {c: record.isConnected ? 1 : 0};
  if(record.isFailed) {
    json.failed = 1;
  }
  if(record.route) {
    json.local = record.route.local;
  }
  if(record.connection) {
    const serializeCandidate = ({address, protocol, type}: P2PStatsCandidate) => ({address, protocol, type});
    json.network = {
      local: serializeCandidate(record.connection.local),
      remote: serializeCandidate(record.connection.remote)
    };
  }
  if(record.route) {
    json.remote = record.route.remote;
  }
  json.t = String(t);
  return json;
}

function coalesceNetworkRecords(records: TimedRecord<P2PNetworkState>[]) {
  const result = records.slice();
  for(let i = result.length - 1; i >= 1; --i) {
    if(result[i].timestamp - result[i - 1].timestamp < NETWORK_RECORD_COALESCE_MS) {
      result.splice(i - 1, 1);
    }
  }
  return result;
}

export function serializeStatsLog(
  networkRecords: TimedRecord<P2PNetworkState>[],
  bitrateRecords: number[],
  maxBytes = Infinity
): string {
  let network = coalesceNetworkRecords(networkRecords);
  let bitrate = bitrateRecords;
  const serialize = () => {
    const baseTimestamp = network[0]?.timestamp ?? 0;
    return JSON.stringify({
      bitrate: bitrate.map((b) => ({b})),
      network: network.map(({timestamp, record}) => serializeNetworkRecord(record, timestamp - baseTimestamp))
    });
  };

  let json = serialize();
  // ASCII only (numbers, candidate types, addresses), so length === bytes.
  while(json.length > maxBytes && (bitrate.length || network.length)) {
    // `{"b":N},` is 8-14 bytes: drop roughly the excess in one go.
    const excess = json.length - maxBytes;
    if(bitrate.length) {
      bitrate = bitrate.slice(Math.min(bitrate.length, Math.max(1, Math.ceil(excess / 14))));
    } else {
      network = network.slice(1);
    }
    json = serialize();
  }

  return json;
}

export default class P2PCallStats {
  private networkRecords: TimedRecord<P2PNetworkState>[] = [];
  private bitrateRecords: number[] = [];
  private events: string[] = [];
  private droppedEvents = 0;
  private networkState: P2PNetworkState = {isConnected: false, isFailed: false};

  private startedAt: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private isPolling = false;
  private isStopped = false;
  private hasReportedPollError = false;
  private lastPairBytes: {id: string, bytesSent: number, timestamp: number} | undefined;

  constructor(private options: {
    getStats: () => Promise<RTCStatsReport>,
    /** The camera is being sent: bars are then measured against 600 kbps. */
    hasVideo: () => boolean,
    onSignalBars: (bars: number) => void,
    log: Logger,
    now?: () => number
  }) {
    this.startedAt = this.now();
  }

  private now() {
    return Math.round(this.options.now ? this.options.now() : performance.now());
  }

  public start() {
    if(this.timer !== undefined || this.isStopped) return;
    this.startedAt = this.now();
    // Native records the initial, not-yet-connected state on start.
    this.networkRecords.push({timestamp: this.startedAt, record: {...this.networkState}});
    this.timer = setInterval(() => void this.poll(), P2P_STATS_INTERVAL_MS);
  }

  public stop() {
    if(this.isStopped) return;
    this.isStopped = true;
    if(this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  public setConnected(isConnected: boolean) {
    this.updateNetworkState({isConnected});
  }

  /** The transport was given up on (native: NativeNetworkingImpl's 20 s timeout). */
  public setFailed() {
    this.updateNetworkState({isFailed: true});
  }

  public addEvent(event: string) {
    if(this.isStopped) return;
    this.events.push(`+${this.now() - this.startedAt}ms ${event}`);
    if(this.events.length > MAX_EVENTS) {
      this.events.shift();
      ++this.droppedEvents;
    }
  }

  public getReport(): P2PCallStatsReport {
    const json = serializeStatsLog(this.networkRecords, this.bitrateRecords, P2P_STATS_LOG_MAX_BYTES);
    const lines = [
      'tweb 1-on-1 call log',
      `duration: ${this.now() - this.startedAt}ms`,
      'events:',
      ...(this.droppedEvents ? [`(${this.droppedEvents} earlier events dropped)`] : []),
      ...this.events,
      'stats:',
      serializeStatsLog(this.networkRecords, this.bitrateRecords)
    ];

    return {json, text: lines.join('\n')};
  }

  private updateNetworkState(patch: Partial<P2PNetworkState>) {
    if(this.isStopped) return;
    const state = {...this.networkState, ...patch};
    if(isSameNetworkState(state, this.networkState)) {
      return;
    }

    this.networkState = state;
    this.networkRecords.push({timestamp: this.now(), record: state});
    if(this.networkRecords.length > MAX_NETWORK_RECORDS) {
      this.networkRecords.splice(1, 1);
    }
  }

  private async poll() {
    if(this.isPolling || this.isStopped) return;
    this.isPolling = true;
    try {
      const report = await this.options.getStats();
      if(!this.isStopped) {
        this.processReport(report);
      }
    } catch(err) {
      if(!this.hasReportedPollError) {
        this.hasReportedPollError = true;
        this.options.log.warn('call stats polling failed', err);
      }
    } finally {
      this.isPolling = false;
    }
  }

  private processReport(report: RTCStatsReport) {
    const pair = findSelectedCandidatePair(report);
    // Unknown until a pair is selected (and, without the browser's estimate,
    // until a second sample of it) — a 0 there would read as no signal.
    let sendBitrateKbps: number | undefined;
    if(pair) {
      const local: StatsEntry | undefined = report.get(pair.localCandidateId);
      const remote: StatsEntry | undefined = report.get(pair.remoteCandidateId);
      if(local && remote) {
        // NetworkRoute::uses_turn per side.
        this.updateNetworkState({
          route: {
            local: local.candidateType === 'relay' ? 'turn' : 'p2p',
            remote: remote.candidateType === 'relay' ? 'turn' : 'p2p'
          },
          connection: {
            local: describeCandidate(local),
            remote: describeCandidate(remote)
          }
        });
      }

      sendBitrateKbps = this.getSendBitrateKbps(pair);
    } else {
      this.lastPairBytes = undefined;
    }

    if(sendBitrateKbps === undefined) {
      return;
    }

    this.bitrateRecords.push(Math.max(0, Math.trunc(sendBitrateKbps)));
    if(this.bitrateRecords.length > MAX_BITRATE_RECORDS) {
      this.bitrateRecords.shift();
    }

    // Bars measure what the link could carry. Without the browser's estimate
    // (Firefox) the log still gets what was sent, but a quiet scene sends
    // little on a fast link, so no bars rather than a false "weak network".
    if(typeof(pair.availableOutgoingBitrate) === 'number') {
      this.options.onSignalBars(getSignalBars(sendBitrateKbps, this.options.hasVideo()));
    }
  }

  private getSendBitrateKbps(pair: StatsEntry): number | undefined {
    if(typeof(pair.availableOutgoingBitrate) === 'number') {
      return pair.availableOutgoingBitrate / 1000;
    }

    const {bytesSent, timestamp} = pair;
    if(typeof(bytesSent) !== 'number' || typeof(timestamp) !== 'number') {
      return undefined;
    }

    const last = this.lastPairBytes;
    this.lastPairBytes = {id: pair.id, bytesSent, timestamp};
    if(!last || last.id !== pair.id || timestamp <= last.timestamp || bytesSent < last.bytesSent) {
      return undefined;
    }

    // bytes · 8 / ms = kbit/s
    return (bytesSent - last.bytesSent) * 8 / (timestamp - last.timestamp);
  }
}
