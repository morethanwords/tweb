/*
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import {IS_FIREFOX} from '@environment/userAgent';
import LocalConferenceDescription, {ConferenceEntry} from '@lib/calls/localConferenceDescription';
import StringFromLineBuilder from '@lib/calls/stringFromLineBuilder';
import {CallSignalingData, GroupCallConnectionTransport, PayloadType, RtpHdrexts, UpdateGroupCallConnectionData} from '@lib/calls/types';
import {fromTelegramSource} from '@lib/calls/utils';
import {getSdpDirection, getSdpPort, SdpSection} from '@lib/calls/p2P/sdpCommon';
import {logger} from '@lib/logger';

// screencast is for Peer-to-Peer only
export type WebRTCLineTypeTrue = 'video' | 'audio' | 'application';
export type WebRTCLineType = WebRTCLineTypeTrue | 'screencast';

export const WEBRTC_MEDIA_PORT = '9';

const log = logger('SDP-BUILDER');

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
            log.error('parameters is array???', parameters);
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

  // ---- tgcalls v2 (1-on-1 / P2P) ----
  // The flat NegotiateChannels signaling is a different SDP dialect from the
  // group conference above, so it gets its own builder method — sharing this
  // class's StringFromLineBuilder line accumulator.
  public addP2p(options: P2PSdpOptions) {
    const {
      setup, mids, isAnswer, entries,
      audioPayloadTypes, audioExtensions, videoPayloadTypes, videoExtensions,
      sectionOrder, bundleMids, shouldKeepRemoteReceiveSection
    } = options;

    const add = (line: string) => {
      this.add(line);
    };

    // On an answer, sectionOrder is our own local offer — mirror its DTLS role.
    const getAnswerSetupRole = (mid: string | undefined, fallback: string) => {
      const offerSetup = sectionOrder?.find((section) => section.mid === mid)
      ?.lines.find((line) => line.startsWith('a=setup:'))
      ?.slice('a=setup:'.length);

      if(offerSetup === 'active') {
        return 'passive';
      }
      if(offerSetup === 'passive') {
        return 'active';
      }
      if(fallback === 'active' || fallback === 'passive') {
        return fallback;
      }

      return 'passive';
    };

    const addTransport = (mid?: string) => {
      add(`a=ice-ufrag:${setup.ufrag}`);
      add(`a=ice-pwd:${setup.pwd}`);
      setup.fingerprints.forEach((fingerprint) => {
        add(`a=fingerprint:${fingerprint.hash} ${fingerprint.fingerprint}`);
        const setupRole = isAnswer ? getAnswerSetupRole(mid, fingerprint.setup) : fingerprint.setup;
        add(`a=setup:${setupRole}`);
      });
    };

    const addPayloadType = (payloadType: PayloadType) => {
      const channels = payloadType.channels ? `/${payloadType.channels}` : '';
      add(`a=rtpmap:${payloadType.id} ${payloadType.name}/${payloadType.clockrate}${channels}`);
      if(payloadType.parameters) {
        const parameters = Object.keys(payloadType.parameters).map((key) => {
          return `${key}=${(payloadType.parameters as Record<string, string | number>)[key]}`;
        }).join(';');
        add(`a=fmtp:${payloadType.id} ${parameters}`);
      }
      payloadType['rtcp-fbs']?.forEach((feedback) => {
        add(`a=rtcp-fb:${payloadType.id} ${feedback.type}${feedback.subtype ? ` ${feedback.subtype}` : ''}`);
      });
    };

    const addMedia = (
      entry: P2PSsrcEntry,
      payloadTypes: PayloadType[],
      extensions: RtpHdrexts[],
      mediaType?: string,
      shouldRejectRemoved = true,
      direction?: RTCRtpTransceiverDirection
    ) => {
      mediaType = mediaType || (entry.isVideo ? 'video' : 'audio');
      const port = entry.isRemoved && shouldRejectRemoved ? 0 : 9;
      add(`m=${mediaType} ${port} UDP/TLS/RTP/SAVPF ${payloadTypes.map((payloadType) => payloadType.id).join(' ')}`);
      add('c=IN IP4 0.0.0.0');
      add(`a=mid:${entry.mid}`);
      if(port === 0) {
        add('a=inactive');
        return;
      }

      add('b=AS:1300');
      add('a=rtcp-mux');
      payloadTypes.forEach(addPayloadType);
      add('a=rtcp:1 IN IP4 0.0.0.0');
      if(entry.isVideo) {
        add('a=rtcp-rsize');
      }
      extensions.forEach(({id, uri}) => {
        add(`a=extmap:${id} ${uri}`);
      });
      addTransport(entry.mid);
      if(entry.isRemoved) {
        add('a=inactive');
        return;
      }
      add(`a=${direction || entry.direction || (isAnswer ? 'recvonly' : 'sendonly')}`);
      if(isAnswer || direction === 'recvonly') {
        return;
      }

      entry.sourceGroups.forEach((sourceGroup) => {
        if(sourceGroup.semantics) {
          add(`a=ssrc-group:${sourceGroup.semantics} ${sourceGroup.sources.join(' ')}`);
        }
        sourceGroup.sources.forEach((ssrc) => {
          add(`a=ssrc:${ssrc} cname:${entry.endpoint}`);
          add(`a=ssrc:${ssrc} msid:${entry.endpoint} ${entry.endpoint}`);
          add(`a=ssrc:${ssrc} mslabel:${entry.endpoint}`);
          add(`a=ssrc:${ssrc} label:${entry.endpoint}`);
        });
      });
    };

    const addApplication = (mid: string, shouldReject = false) => {
      add(`m=application ${shouldReject ? 0 : 1} UDP/DTLS/SCTP webrtc-datachannel`);
      add('c=IN IP4 0.0.0.0');
      add(`a=mid:${mid}`);

      if(shouldReject) {
        add('a=inactive');
        return;
      }

      addTransport(mid);
      add('a=ice-options:trickle');
      add('a=sctp-port:5000');
      add('a=max-message-size:262144');
    };

    const getOrderedMedia = (section: SdpSection) => {
      const fallbackEntry: P2PSsrcEntry = {
        isVideo: section.kind === 'video',
        isPresentation: false,
        isMain: false,
        isRemoved: true,
        userId: '0',
        endpoint: section.mid || '',
        mid: section.mid || '',
        sourceGroups: []
      };
      const entry = entries.find((item) => item.mid === section.mid) || fallbackEntry;
      const shouldKeepLocalSection = !isAnswer && entry.isRemoved && shouldKeepEstablishedLocalSection(section);
      const shouldKeepRemoteSection = isAnswer && entry.isRemoved && shouldKeepRemoteReceiveSection(section);
      const keptMediaEntry = shouldKeepLocalSection || shouldKeepRemoteSection ? {...entry, isRemoved: false} : entry;
      const shouldRejectOfferSection = isAnswer && !canAcceptOfferedBundledSection(section, bundleMids);
      const mediaEntry = shouldRejectOfferSection ? {...keptMediaEntry, isRemoved: true} : keptMediaEntry;
      const shouldRejectRemoved = isAnswer && (mediaEntry.isRemoved || shouldRejectOfferSection);
      const payloadTypes = section.kind === 'audio' ? audioPayloadTypes : videoPayloadTypes;
      const extensions = section.kind === 'audio' ? audioExtensions : videoExtensions;
      const direction: RTCRtpTransceiverDirection | undefined = shouldKeepRemoteSection ? 'sendonly' :
        (mediaEntry.isLocalOnly || shouldKeepLocalSection ? 'recvonly' : undefined);

      return {direction, extensions, mediaEntry, payloadTypes, shouldRejectRemoved};
    };

    const getBundledOrderedMid = (section: SdpSection) => {
      const mid = section.mid || (section.kind === 'application' ? mids.data : undefined);
      if(!mid) {
        return undefined;
      }

      if(section.kind === 'application') {
        if(!isAnswer) {
          return mid;
        }

        return canAcceptOfferedBundledSection(section, bundleMids) ? mid : undefined;
      }

      const {mediaEntry, shouldRejectRemoved} = getOrderedMedia(section);
      return mediaEntry.isRemoved && shouldRejectRemoved ? undefined : mediaEntry.mid;
    };

    const addOrderedSection = (section: SdpSection) => {
      if(section.kind === 'application') {
        const mid = section.mid || mids.data;
        const shouldRejectApplication = isAnswer && !canAcceptOfferedBundledSection(section, bundleMids);
        addApplication(mid, shouldRejectApplication);
        return;
      }

      const {direction, extensions, mediaEntry, payloadTypes, shouldRejectRemoved} = getOrderedMedia(section);
      addMedia(mediaEntry, payloadTypes, extensions, section.kind, shouldRejectRemoved, direction);
    };

    const rawBundledMids = (sectionOrder?.map(getBundledOrderedMid).filter(Boolean) || [
      ...entries.filter((entry) => !entry.isRemoved).map((entry) => entry.mid),
      mids.data
    ]).concat(isAnswer ? [] : entries.filter((entry) => {
      return !entry.isRemoved && !sectionOrder?.some((section) => section.mid === entry.mid);
    }).map((entry) => entry.mid));
    const seenBundledMids = new Set<string>();
    const bundledMids = rawBundledMids.filter((mid) => {
      if(seenBundledMids.has(mid)) {
        return false;
      }

      seenBundledMids.add(mid);
      return true;
    });

    add('v=0');
    add(`o=- ${Date.now()} 2 IN IP4 0.0.0.0`);
    add('s=-');
    add('t=0 0');
    add('a=ice-options:trickle');
    add('a=msid-semantic:WMS *');
    add(`a=group:BUNDLE ${bundledMids.join(' ')}`);

    if(sectionOrder?.length) {
      sectionOrder.forEach(addOrderedSection);
      entries.filter((entry) => {
        return !sectionOrder.some((section) => section.mid === entry.mid);
      }).forEach((entry) => {
        const payloadTypes = entry.isVideo ? videoPayloadTypes : audioPayloadTypes;
        const extensions = entry.isVideo ? videoExtensions : audioExtensions;
        addMedia(entry, payloadTypes, extensions, undefined, true, entry.isLocalOnly ? 'recvonly' : undefined);
      });
    } else {
      entries.forEach((entry) => {
        const payloadTypes = entry.isVideo ? videoPayloadTypes : audioPayloadTypes;
        const extensions = entry.isVideo ? videoExtensions : audioExtensions;
        addMedia(entry, payloadTypes, extensions, undefined, true, entry.isLocalOnly ? 'recvonly' : undefined);
      });
      addApplication(mids.data);
    }

    return this;
  }

  public static fromP2p(options: P2PSdpOptions) {
    return new SDPBuilder().addP2p(options).finalize();
  }
}

export type P2PSdpSsrcGroup = {
  semantics?: string,
  sources: (string | number)[]
};

// One media section's SSRC/identity data for P2P SDP generation.
export type P2PSsrcEntry = {
  isVideo: boolean,
  isPresentation: boolean,
  isMain: boolean,
  isRemoved?: boolean,
  userId: string,
  endpoint: string,
  mid: string,
  sourceGroups: P2PSdpSsrcGroup[],
  direction?: RTCRtpTransceiverDirection,
  isLocalOnly?: boolean
};

export type P2PMediaMids = {
  audio: string,
  video: string,
  presentation: string,
  data: string
};

export type P2PSdpOptions = {
  setup: CallSignalingData.initialSetup,
  mids: P2PMediaMids,
  isAnswer: boolean,
  entries: P2PSsrcEntry[],
  audioPayloadTypes: PayloadType[],
  audioExtensions: RtpHdrexts[],
  videoPayloadTypes: PayloadType[],
  videoExtensions: RtpHdrexts[],
  sectionOrder?: SdpSection[],
  bundleMids?: string[],
  // a state-dependent decision the p2pCall engine supplies (it reads live tracks)
  shouldKeepRemoteReceiveSection: (section: SdpSection) => boolean
};

function hasBundleOnly(section: SdpSection) {
  return section.lines.includes('a=bundle-only');
}

function isRejectedOfferSection(section: SdpSection) {
  return getSdpPort(section) === 0 && !hasBundleOnly(section);
}

function isOfferedInBundle(section: SdpSection, bundleMids: string[] | undefined) {
  return Boolean(section.mid && (!bundleMids || bundleMids.includes(section.mid)));
}

function canAcceptOfferedBundledSection(section: SdpSection, bundleMids: string[] | undefined) {
  return isOfferedInBundle(section, bundleMids) && !isRejectedOfferSection(section);
}

function shouldKeepEstablishedLocalSection(section: SdpSection) {
  if(section.kind !== 'audio' && section.kind !== 'video') {
    return false;
  }

  const direction = getSdpDirection(section);
  return getSdpPort(section) !== 0 && (direction === 'recvonly' || direction === 'sendrecv');
}
