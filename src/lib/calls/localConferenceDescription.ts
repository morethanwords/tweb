/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import { indexOfAndSplice } from '../../helpers/array';
import { safeAssign } from '../../helpers/object';
import { GroupCallParticipantVideoSourceGroup } from '../../layer';
import { SDPBuilder, WebRTCLineType, WEBRTC_MEDIA_PORT } from './sdpBuilder';
import { AudioCodec, GroupCallConnectionTransport, Ssrc, UpdateGroupCallConnectionData, VideoCodec } from './types';

export class ConferenceEntry {
  public source: number;
  public sourceGroups: GroupCallParticipantVideoSourceGroup[];
  public transceiver: RTCRtpTransceiver;
  public originalDirection: RTCRtpTransceiverDirection;
  public direction: RTCRtpTransceiverDirection;
  public port: string;
  public endpoint: string;
  public peerId: PeerId;

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

    return this.transceiver = connection.addTransceiver(this.type, init);
  }

  public setSource(source: number | GroupCallParticipantVideoSourceGroup[]) {
    let sourceGroups: GroupCallParticipantVideoSourceGroup[];
    if(Array.isArray(source)) {
      sourceGroups = source;
      source = sourceGroups[0].sources[0];
    }

    this.sourceGroups = sourceGroups;
    return this.source = source;
  }

  public shouldBeSkipped(isAnswer?: boolean) {
    return isAnswer && this.direction === 'inactive';
  }
}

export function generateSsrc(type: WebRTCLineType, source: number | GroupCallParticipantVideoSourceGroup[], endpoint?: string): Ssrc {
  let sourceGroups: GroupCallParticipantVideoSourceGroup[];
  if(Array.isArray(source)) {
    sourceGroups = source;
    source = sourceGroups[0].sources[0];
  }
  
  return {
    endpoint,
    type,
    source,
    sourceGroups,
  };
}

export default class LocalConferenceDescription implements UpdateGroupCallConnectionData {
  public readonly sessionId: string;
  // public ssrcs: Ssrc[];
  public readonly transport: GroupCallConnectionTransport;
  public readonly audio?: AudioCodec;
  public readonly video: VideoCodec;
  
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
    this.entriesBySource.delete(entry.source);

    const set = this.entriesByPeerId.get(entry.peerId);
    if(set) {
      set.delete(entry);
      if(!set.size) {
        this.entriesByPeerId.delete(entry.peerId);
      }
    }
  }

  public setEntrySource(entry: ConferenceEntry, source: Parameters<ConferenceEntry['setSource']>[0]) {
    entry.setSource(source);
    this.entriesBySource.set(entry.source, entry);
  }

  public setEntryPeerId(entry: ConferenceEntry, peerId: ConferenceEntry['peerId']) {
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
