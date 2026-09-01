/*
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import safeAssign from '@helpers/object/safeAssign';
import {GroupCallParticipantVideoSourceGroup} from '@layer';
import {fixMediaLineType, SDPBuilder, WebRTCLineType, WEBRTC_MEDIA_PORT} from '@lib/calls/sdpBuilder';
import {AudioCodec, GroupCallConnectionTransport, Ssrc, UpdateGroupCallConnectionData, VideoCodec} from '@lib/calls/types';

type ResolvedSource = {
  source: number,
  sourceGroups?: GroupCallParticipantVideoSourceGroup[]
};

function resolveSource(source: number | GroupCallParticipantVideoSourceGroup[]): ResolvedSource | undefined {
  if(Array.isArray(source)) {
    const first = source[0]?.sources?.[0];
    if(typeof first !== 'number') return;
    return {source: first, sourceGroups: source};
  }

  if(typeof source !== 'number') return;
  return {source};
}

export class ConferenceEntry {
  public source: number;
  public sourceGroups: GroupCallParticipantVideoSourceGroup[];
  public transceiver: RTCRtpTransceiver;
  public originalDirection: RTCRtpTransceiverDirection;
  public direction: RTCRtpTransceiverDirection;
  public port: string;
  public endpoint: string;
  public peerId: PeerId;

  public sendEntry: ConferenceEntry;
  public recvEntry: ConferenceEntry;

  constructor(public mid: string, public type: WebRTCLineType) {
    this.port = WEBRTC_MEDIA_PORT;
  }

  public setDirection(direction: RTCRtpTransceiverDirection) {
    if(!this.originalDirection) {
      this.originalDirection = direction;
    }

    return this.direction = direction;
  }

  public setPort(port: string) {
    return this.port = port;
  }

  public setEndpoint(endpoint: string) {
    return this.endpoint = endpoint;
  }

  public setPeerId(peerId: PeerId) {
    return this.peerId = peerId;
  }

  public createTransceiver(connection: RTCPeerConnection, init?: RTCRtpTransceiverInit) {
    if(init?.direction) {
      this.setDirection(init.direction);
    }

    return this.transceiver = connection.addTransceiver(fixMediaLineType(this.type), init);
  }

  public setSource(source: number | GroupCallParticipantVideoSourceGroup[]) {
    const resolved = resolveSource(source);
    if(!resolved) return;

    this.sourceGroups = resolved.sourceGroups;
    return this.source = resolved.source;
  }

  public shouldBeSkipped(isAnswer?: boolean) {
    return isAnswer && this.direction === 'inactive';
  }
}

export function generateSsrc(type: WebRTCLineType, source: number | GroupCallParticipantVideoSourceGroup[], endpoint?: string): Ssrc {
  const resolved = resolveSource(source);
  if(!resolved) return;

  return {
    endpoint,
    type,
    source: resolved.source,
    sourceGroups: resolved.sourceGroups
  };
}

export default class LocalConferenceDescription implements UpdateGroupCallConnectionData {
  public readonly sessionId: string;
  // public ssrcs: Ssrc[];
  public readonly transport: GroupCallConnectionTransport;
  public readonly audio?: AudioCodec;
  public readonly video: VideoCodec;
  public readonly screencast?: VideoCodec;

  private maxSeenId: number;
  public readonly entries: ConferenceEntry[];
  private entriesByMid: Map<ConferenceEntry['mid'], ConferenceEntry>;
  private entriesBySource: Map<ConferenceEntry['source'], ConferenceEntry>;
  private entriesByPeerId: Map<ConferenceEntry['peerId'], Set<ConferenceEntry>>;

  constructor(public connection: RTCPeerConnection) {
    this.sessionId = '' + Date.now();
    // this.ssrcs = [];
    this.maxSeenId = -1;
    this.entries = [];
    this.entriesByMid = new Map();
    this.entriesBySource = new Map();
    this.entriesByPeerId = new Map();
  }

  public setData(data: UpdateGroupCallConnectionData) {
    return safeAssign(this, data);
  }

  public createEntry(type: WebRTCLineType) {
    const mid = '' + ++this.maxSeenId;
    const entry = new ConferenceEntry(mid, type);
    this.entries.push(entry);
    this.entriesByMid.set(mid, entry);
    return entry;
  }

  public deleteEntry(entry: ConferenceEntry) {
    indexOfAndSplice(this.entries, entry);
    this.entriesByMid.delete(entry.mid);
    if(this.entriesBySource.get(entry.source) === entry) {
      this.entriesBySource.delete(entry.source);
    }

    const set = this.entriesByPeerId.get(entry.peerId);
    if(set) {
      set.delete(entry);
      if(!set.size) {
        this.entriesByPeerId.delete(entry.peerId);
      }
    }
  }

  public setEntrySource(entry: ConferenceEntry, source: Parameters<ConferenceEntry['setSource']>[0]) {
    const previousSource = entry.source;
    const resolvedSource = entry.setSource(source);
    if(resolvedSource === undefined) return;

    if(previousSource !== undefined && previousSource !== resolvedSource) {
      if(this.entriesBySource.get(previousSource) === entry) {
        this.entriesBySource.delete(previousSource);
      }
    }
    this.entriesBySource.set(resolvedSource, entry);
    return resolvedSource;
  }

  public setEntryPeerId(entry: ConferenceEntry, peerId: ConferenceEntry['peerId']) {
    // Drop the old binding first. This used to be called only on freshly
    // created entries (peerId undefined), so "an entry appears under exactly
    // one peerId" held by construction; re-binding a live entry (an SSRC the
    // server moved between participants) would otherwise leave it indexed under
    // both, and getEntriesByPeerId would report the previous owner as still
    // owning a stream that is no longer theirs.
    if(entry.peerId !== undefined && entry.peerId !== peerId) {
      const previous = this.entriesByPeerId.get(entry.peerId);
      if(previous) {
        previous.delete(entry);
        if(!previous.size) {
          this.entriesByPeerId.delete(entry.peerId);
        }
      }
    }

    entry.setPeerId(peerId);
    let set = this.entriesByPeerId.get(peerId);
    if(!set) {
      this.entriesByPeerId.set(peerId, set = new Set());
    }

    set.add(entry);
  }

  public findEntry(verify: Parameters<LocalConferenceDescription['entries']['find']>[0]) {
    return this.entries.find(verify);
  }

  public findFreeSendRecvEntry(type: WebRTCLineType, isSending: boolean) {
    let entry = this.entries.find((entry) => {
      return entry.direction === 'sendrecv' && entry.type === type && !(isSending ? entry.sendEntry : entry.recvEntry);
    });

    if(!entry) {
      entry = this.createEntry(type);
      entry.setDirection('sendrecv');
    }

    return entry;
  }

  public getEntryByMid(mid: ConferenceEntry['mid']) {
    return this.entriesByMid.get(mid);
  }

  public getEntryBySource(source: ConferenceEntry['source']) {
    return this.entriesBySource.get(source);
  }

  public getEntriesByPeerId(peerId: ConferenceEntry['peerId']) {
    return this.entriesByPeerId.get(peerId);
  }

  public generateSdp(options: Omit<Parameters<SDPBuilder['addConference']>[0], 'conference'>) {
    return SDPBuilder.fromConference({
      conference: this,
      ...options
    });
  }
}
