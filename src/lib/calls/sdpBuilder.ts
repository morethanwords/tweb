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

import {IS_FIREFOX} from '../../environment/userAgent';
import LocalConferenceDescription, {ConferenceEntry} from './localConferenceDescription';
import StringFromLineBuilder from './stringFromLineBuilder';
import {GroupCallConnectionTransport, PayloadType, UpdateGroupCallConnectionData} from './types';
import {fromTelegramSource} from './utils';

// screencast is for Peer-to-Peer only
export type WebRTCLineTypeTrue = 'video' | 'audio' | 'application';
export type WebRTCLineType = WebRTCLineTypeTrue | 'screencast';

export const WEBRTC_MEDIA_PORT = '9';

export function fixMediaLineType(mediaType: WebRTCLineType) {
  return mediaType === 'screencast' ? 'video' : mediaType;
}

export function performCandidate(c: GroupCallConnectionTransport['candidates'][0]) {
  const arr: string[] = [];
  arr.push('a=candidate:');
  arr.push(`${c.foundation} ${c.component} ${c.protocol.toUpperCase()} ${c.priority} ${c.ip} ${c.port} typ ${c.type}`);
  if(c['rel-addr'] !== undefined) {
    arr.push(` raddr ${c['rel-addr']} rport ${c['rel-port']}`);
  }
  arr.push(` generation ${c.generation}`);
  return arr.join('');
}

export function getConnectionTypeForMediaType(mediaType: WebRTCLineType) {
  // return mediaType === 'application' ? 'DTLS/SCTP' : 'RTP/SAVPF';
  return mediaType === 'application' ? 'DTLS/SCTP' : 'UDP/TLS/RTP/SAVPF';
}

export function generateMediaFirstLine(mediaType: WebRTCLineType, port = WEBRTC_MEDIA_PORT, payloadIds: (string | number)[]) {
  const connectionType = getConnectionTypeForMediaType(mediaType);
  return `m=${fixMediaLineType(mediaType)} ${port} ${connectionType} ${payloadIds.join(' ')}`;
}

type ConferenceData = UpdateGroupCallConnectionData | LocalConferenceDescription;

// https://tools.ietf.org/id/draft-ietf-rtcweb-sdp-08.html
// https://datatracker.ietf.org/doc/html/draft-roach-mmusic-unified-plan-00
export class SDPBuilder extends StringFromLineBuilder {
  public addCandidate(c: GroupCallConnectionTransport['candidates'][0]) {
    return this.add(performCandidate(c));
  }

  /* public addDataChannel(mid: string, transport: GroupCallConnectionTransport, isAnswer?: boolean) {
    this.add(
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
      'c=IN IP4 0.0.0.0',
      'a=ice-options:trickle',
      `a=mid:${mid}`
    );

    // if(!isAnswer) {
      this.add('a=sendrecv');
    // }

    this.addTransport(transport, isAnswer);

    return this.add(
      'a=sctp-port:5000',
      'a=max-message-size:262144'
    );
  } */

  public addHeader(sId: string, bundleMids: string[]) {
    const bundle = bundleMids.join(' ');
    return this.add(
      'v=0',                          // version
      `o=- ${sId} 2 IN IP4 0.0.0.0`,  // sessionId, 2=sessionVersion
      's=-',                          // name of the session
      't=0 0',                        // time when session is valid
      'a=extmap-allow-mixed',
      `a=group:BUNDLE ${bundle}`,
      'a=ice-options:trickle',
      // 'a=ice-lite',                   // ice-lite: is a minimal version of the ICE specification, intended for servers running on a public IP address.
      'a=msid-semantic:WMS *'
    );
  }

  public addTransport(transport: GroupCallConnectionTransport, skipCandidates?: boolean) {
    this.add(
      `a=ice-ufrag:${transport.ufrag}`,
      `a=ice-pwd:${transport.pwd}`,
      'a=ice-options:trickle'           // ! test
    );

    for(const fingerprint of transport.fingerprints) {
      this.add(
        `a=fingerprint:${fingerprint.hash} ${fingerprint.fingerprint}`,
        `a=setup:${fingerprint.setup}`
      );
    }

    if(!skipCandidates && transport.candidates) {
      for(const candidate of transport.candidates) {
        this.addCandidate(candidate);
      }
    }

    return this;
  }

  public addSsrc(entry: ConferenceEntry) {
    let streamName = 'stream';
    let {type, sourceGroups} = entry;

    // let source = ssrc.source ?? ssrc.sourceGroups[0].sources[0];
    // source = fromTelegramSource(source);
    const source = fromTelegramSource(entry.source);

    streamName += source;
    type += source as any;

    // streamName += mid;
    // type += mid as any;

    // streamName = type = entry.transceiver.receiver.track.id as any;

    const addMsid = () => {
      this.add(`a=msid:${streamName} ${type}`);
    };

    const addSource = (ssrc: number) => {
      this.add(
        `a=ssrc:${ssrc} cname:${streamName}`,
        `a=ssrc:${ssrc} msid:${streamName} ${type}`,
        `a=ssrc:${ssrc} mslabel:${streamName}`,
        `a=ssrc:${ssrc} label:${type}`
      );
    };

    addMsid();
    if(sourceGroups?.length) {
      sourceGroups.forEach((ssrcGroup) => {
        if(ssrcGroup.sources.length) {
          const sources = ssrcGroup.sources.map(fromTelegramSource);
          this.add(`a=ssrc-group:${ssrcGroup.semantics} ${sources.join(' ')}`);
          sources.forEach(addSource);
        }
      });
    } else {
      addSource(source);
    }

    return this;
  }

  public addSsrcEntry(entry: ConferenceEntry, data: ConferenceData, isAnswer?: boolean) {
    const add = (...x: string[]) => this.add(...x);

    const {type, mid, direction, port} = entry;
    const transport = data.transport;

    /* if(type === 'application') {
      return this.addDataChannel(mid, transport, isAnswer);
    } */

    const isApplication = type === 'application';
    const codec = isApplication ? undefined : data[type];

    const isInactive = direction === 'inactive';
    if(entry.shouldBeSkipped(isAnswer)) {
      return add(
        `m=${fixMediaLineType(type)} 0 ${getConnectionTypeForMediaType(type)} 0`,
        `c=IN IP4 0.0.0.0`,
        `a=inactive`,
        `a=mid:${mid}`
      );
    }

    const payloadTypes = !isApplication ? codec['payload-types'] : [{id: 5000} as PayloadType];
    const ids = payloadTypes.map((type) => type.id);
    add(
      generateMediaFirstLine(type, port, ids),
      'c=IN IP4 0.0.0.0',
      `a=rtcp:${port} IN IP4 0.0.0.0`
    );

    if(transport['rtcp-mux']) {
      add('a=rtcp-mux');
    }

    add(`a=mid:${mid}`);
    /* if(type === 'video') {
      add('b=AS:2500');
    } */

    let setDirection = direction;
    if(direction !== 'sendrecv' && isAnswer && !(isInactive || isApplication)) {
      setDirection = direction === 'sendonly' ? 'recvonly' : 'sendonly';
    }

    // a=bundle-only
    add(`a=${setDirection}`);

    // this.addTransport(transport, isAnswer);
    this.addTransport(transport);

    if(!isApplication) {
      const hdrexts = codec['rtp-hdrexts'];
      if(hdrexts?.length) {
        hdrexts.forEach((hdrext) => {
          add(`a=extmap:${hdrext.id} ${hdrext.uri}`);
        });
      }

      payloadTypes.forEach((type) => {
        add(`a=rtpmap:${type.id} ${type.name}/${type.clockrate}${type.channels && type.channels > 1 ? `/${type.channels}` : ''}`);

        const parameters = type.parameters;
        if(Array.isArray(parameters)) {
          if(parameters.length) {
            console.error('parameters is array???', parameters);
          }
        } else if(parameters && Object.keys(parameters).length) {
          const p: string[] = [];
          for(const i in parameters) {
            p.push(`${i}=${parameters[i]}`);
          }
          add(`a=fmtp:${type.id} ${p.join(';')}`);
        }

        const fbs = type['rtcp-fbs'];
        if(fbs?.length) {
          fbs.forEach((fb) => {
            add(`a=rtcp-fb:${type.id} ${fb.type}${fb.subtype ? ' ' + fb.subtype : ''}`);
          });
        }
      });
    } else {
      add(`a=sctpmap:${payloadTypes[0].id} webrtc-datachannel 256`);
    }

    if(entry.source && (setDirection === 'sendonly' || setDirection === 'sendrecv')) {
      this.addSsrc(entry);
    }

    return this;
  }

  public addConference(options: {
    conference: LocalConferenceDescription,
    bundle: string[],
    entries: ConferenceEntry[],
    isAnswer?: boolean,
  }) {
    const {conference, entries, bundle, isAnswer} = options;
    this.addHeader(conference.sessionId, bundle);

    if(IS_FIREFOX) {
      this.addTransport(conference.transport); // support Firefox
    }

    for(const entry of entries) {
      // this.addSsrcEntry(entry, conference, isAnswer);
      this.addSsrcEntry((isAnswer ? entry.recvEntry || entry.sendEntry : entry.sendEntry || entry.recvEntry) || entry, conference, isAnswer);
    }

    return this;
  }

  public static fromConference(options: Parameters<SDPBuilder['addConference']>[0]) {
    return new SDPBuilder().addConference(options).finalize();
  }
}
