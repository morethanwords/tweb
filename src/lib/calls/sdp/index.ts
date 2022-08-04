/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SDPMediaSection from './mediaSection';
import SDPSessionSection from './sessionSection';

export type AttributeKey = 'group' | 'rtcp' | 'ice-ufrag' |
  'ice-pwd' | 'ice-options' | 'fingerprint' | 'setup' |
  'mid' | 'extmap' | 'sendonly' | 'msid' | 'rtcp-mux' |
  'rtpmap' | 'rtcp-fb' | 'fmtp' | 'ssrc' | 'ssrc-group' |
  'extmap-allow-mixed' | 'msid-semantic';

export type AttributeMap = {[k in AttributeKey]?: boolean};

export default class SDP {
  #session: SDPSessionSection;
  #media: SDPMediaSection[];

  constructor(session: SDP['session'], mediaSections: SDP['media']) {
    this.#session = session;
    this.#media = mediaSections;
  }

  public get session() {
    return this.#session;
  }

  public get media() {
    return this.#media;
  }

  public get bundle() {
    const bundleLine = this.session.lines.find((line) => line.parsed?.key === 'group');
    return bundleLine.value.split(' ').slice(1);
  }

  toString() {
    return this.session.lines
    .concat(...this.media.map((section) => section.lines))
    .map((line) => line.toString()).join('\r\n') + '\r\n';
  }

  /* get buggedMedia() {
    const bundle = this.bundle;
    type A = {
      mid: SDPMediaSection['mid'],
      mediaType: SDPMediaSection['mediaType'],
      direction: SDPMediaSection['direction']
    };
    const out: A[] = [];
    for(let i = 0, length = this.media.length; i < length; ++i) {
      const section = this.media[i];
      const mid = section.mid;
      if(!bundle.includes(mid)) {
        out.push(section);
      }
    }

    return out;
  } */

  /* get mediaTypes() {
    return this.media.map((section) => {
      return {mid: section.oa.get('mid').oa, type: section.mediaType, direction: section.direction};
    });
  } */
}
