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

import StringFromLineBuilder from '../stringFromLineBuilder';
import {addDataChannel, addExtmap, addPayloadTypes, addSsrc} from './p2PSdpBuilder';

export default class ChromeP2PSdpBuilder {
  static generateOffer(info: any) {
    const {fingerprints, ufrag, pwd, audio, video} = info;
    audio.type = 'audio';
    video.type = 'video';
    const media = [audio, video];

    const stringBuilder = new StringFromLineBuilder();
    stringBuilder.add(
      'v=0',
      'o=- 1 2 IN IP4 127.0.0.1',
      's=-',
      't=0 0'
    );

    if(fingerprints) {
      fingerprints.forEach((x: any) => {
        const {hash, fingerprint, setup} = x;
        stringBuilder.add(
          `a=fingerprint:${hash} ${fingerprint}`,
          `a=setup:${setup}`
        );
      });
    }
    if(ufrag && pwd) {
      stringBuilder.add(
        `a=ice-ufrag:${ufrag}`,
        `a=ice-pwd:${pwd}`
      );
    }

    stringBuilder.add(
      'a=group:BUNDLE 0 1 2',
      'a=extmap-allow-mixed',
      'a=msid-semantic: WMS *'
    );
    const streamName = 'stream' + media.map((x) => x.ssrc).join('_');
    for(let i = 0; i < media.length; i++) {
      const m = media[i];
      const {type, ssrc, ssrcGroups, payloadTypes, rtpExtensions} = m;
      switch(type) {
        case 'audio': {
          stringBuilder.add(
            `m=audio 56930 UDP/TLS/RTP/SAVPF ${payloadTypes.map((x: any) => x.id).join(' ')}`,
            'c=IN IP4 0.0.0.0',
            'a=rtcp:9 IN IP4 0.0.0.0',
            'a=ice-options:trickle',
            `a=mid:${i}`,
            'a=sendrecv',
            addExtmap(rtpExtensions)
          );
          if(ssrc) {
            stringBuilder.add(`a=msid:${streamName} audio${ssrc}`);
          }
          stringBuilder.add(
            'a=rtcp-mux',
            addPayloadTypes(payloadTypes),
            addSsrc(type, ssrc, ssrcGroups, streamName)
          );

          break;
        }

        case 'video': {
          stringBuilder.add(
            `m=video 61986 UDP/TLS/RTP/SAVPF ${payloadTypes.map((x: any) => x.id).join(' ')}`,
            'c=IN IP4 0.0.0.0',
            'a=rtcp:9 IN IP4 0.0.0.0',
            'a=ice-options:trickle',
            `a=mid:${i}`,
            'a=sendrecv',
            addExtmap(rtpExtensions)
          );
          if(ssrc) {
            stringBuilder.add(`a=msid:${streamName} video${ssrc}`);
          }
          stringBuilder.add(
            'a=rtcp-mux',
            'a=rtcp-rsize',
            addPayloadTypes(payloadTypes),
            addSsrc(type, ssrc, ssrcGroups, streamName)
          );
          break;
        }
      }
    }
    stringBuilder.add(addDataChannel(2));
    return stringBuilder.finalize();
  }

  static generateAnswer(info: any) {
    const {fingerprints, ufrag, pwd, audio, video} = info;
    audio.type = 'audio';
    video.type = 'video';
    const media = [audio, video];

    const stringBuilder = new StringFromLineBuilder();
    stringBuilder.add(
      'v=0',
      'o=- 1 2 IN IP4 127.0.0.1',
      's=-',
      't=0 0'
    );

    if(fingerprints) {
      fingerprints.forEach((x: any) => {
        const {hash, fingerprint, setup} = x;
        stringBuilder.add(
          `a=fingerprint:${hash} ${fingerprint}`,
          `a=setup:${setup}`
        );
      });
    }
    if(ufrag && pwd) {
      stringBuilder.add(
        `a=ice-ufrag:${ufrag}`,
        `a=ice-pwd:${pwd}`
      );
    }

    stringBuilder.add(
      'a=group:BUNDLE 0 1 2',
      'a=extmap-allow-mixed',
      'a=msid-semantic: WMS *'
    );
    const streamName = 'stream' + media.map((x) => x.ssrc).join('_');
    for(let i = 0; i < media.length; i++) {
      const m = media[i];
      const {type, ssrc, ssrcGroups, payloadTypes, rtpExtensions} = m;
      switch(type) {
        case 'audio': {
          stringBuilder.add(
            `m=audio 56930 UDP/TLS/RTP/SAVPF ${payloadTypes.map((x: any) => x.id).join(' ')}`,
            'c=IN IP4 0.0.0.0',
            'a=rtcp:9 IN IP4 0.0.0.0',
            'a=ice-options:trickle',
            `a=mid:${i}`,
            'a=sendrecv',
            addExtmap(rtpExtensions)
          );
          if(ssrc) {
            stringBuilder.add(`a=msid:${streamName} audio${ssrc}`);
          }
          stringBuilder.add(
            'a=rtcp-mux',
            addPayloadTypes(payloadTypes),
            addSsrc(type, ssrc, ssrcGroups, streamName)
          );
          break;
        }

        case 'video': {
          stringBuilder.add(
            `m=video 61986 UDP/TLS/RTP/SAVPF ${payloadTypes.map((x: any) => x.id).join(' ')}`,
            'c=IN IP4 0.0.0.0',
            'a=rtcp:9 IN IP4 0.0.0.0',
            'a=ice-options:trickle',
            `a=mid:${i}`,
            'a=sendrecv',
            addExtmap(rtpExtensions)
          );
          if(ssrc) {
            stringBuilder.add(`a=msid:${streamName} video${ssrc}`);
          }

          stringBuilder.add(
            'a=rtcp-mux',
            'a=rtcp-rsize',
            addPayloadTypes(payloadTypes),
            addSsrc(type, ssrc, ssrcGroups, streamName)
          );
          break;
        }
      }
    }
    stringBuilder.add(addDataChannel(2));
    return stringBuilder.finalize();
  }
}
