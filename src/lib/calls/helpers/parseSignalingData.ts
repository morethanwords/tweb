/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SDP from '../sdp';
import {CallSignalingData, P2PVideoCodec} from '../types';
import parseMediaSectionInfo from './parseMediaSectionInfo';

export default function parseSignalingData(sdp: SDP) {
  const info = parseMediaSectionInfo(sdp, sdp.media[0]);

  const data: CallSignalingData.initialSetup = {
    '@type': 'InitialSetup',
    'fingerprints': [info.fingerprint],
    'ufrag': info.ufrag,
    'pwd': info.pwd,
    'audio': undefined,
    'video': undefined,
    'screencast': undefined
  };

  const convertNumber = (number: number) => '' + number;

  for(const section of sdp.media) {
    const mediaType = section.mediaType;
    if(mediaType === 'application' || !section.isSending) {
      continue;
    }

    const codec: P2PVideoCodec = data[mediaType === 'video' && data['video'] ? 'screencast' : mediaType] = {} as any;
    const info = parseMediaSectionInfo(sdp, section);
    codec.ssrc = convertNumber(info.source);

    if(info.sourceGroups) {
      codec.ssrcGroups = info.sourceGroups.map((sourceGroup) => ({semantics: sourceGroup.semantics, ssrcs: sourceGroup.sources.map(convertNumber)}));
    }

    const rtpExtensions: P2PVideoCodec['rtpExtensions'] = codec.rtpExtensions = [];
    section.attributes.get('extmap').forEach((attribute) => {
      rtpExtensions.push({
        id: +attribute.key,
        uri: attribute.value
      });
    });

    const payloadTypesMap: Map<number, P2PVideoCodec['payloadTypes'][0]> = new Map();

    const getPayloadType = (id: number) => {
      let payloadType = payloadTypesMap.get(id);
      if(!payloadType) {
        payloadTypesMap.set(id, payloadType = {
          id
        } as any);
      }

      return payloadType;
    };

    section.attributes.get('rtpmap').forEach((attribute) => {
      const id = +attribute.key;
      const payloadType = getPayloadType(id);
      const splitted = attribute.value.split('/');
      const [name, clockrate, channels] = splitted;
      payloadType.name = name;
      payloadType.clockrate = +clockrate;
      payloadType.channels = channels ? +channels : 0;
    });

    section.attributes.get('rtcp-fb').forEach((attribute) => {
      const id = +attribute.key;
      const payloadType = getPayloadType(id);
      payloadType.feedbackTypes = attribute.lines.map((line) => {
        const splitted = line.split(' ');
        const [type, subtype] = splitted;
        return {
          type,
          subtype: subtype || ''
        };
      });
    });

    section.attributes.get('fmtp').forEach((attribute) => {
      const id = +attribute.key;
      const payloadType = getPayloadType(id);
      const parameters: P2PVideoCodec['payloadTypes'][0]['parameters'] = payloadType.parameters = {};
      const splitted = attribute.value.split(';');
      for(const str of splitted) {
        const [key, value] = str.split('=');
        parameters[key] = value;
      }
    });

    codec.payloadTypes = Array.from(payloadTypesMap.values());

    /* if(codec.payloadTypes.length > 5) {
      codec.payloadTypes.length = Math.min(codec.payloadTypes.length, 5);
    } */
  }

  return data;
}
