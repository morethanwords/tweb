/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SDP from '.';
import splitStringByLimitWithRest from '../../../helpers/string/splitStringByLimitWithRest';
import UniqueNumberGenerator from '../../../helpers/uniqueNumberGenerator';
import SDPLine from './line';
import SDPMediaSection from './mediaSection';
import SDPSessionSection from './sessionSection';

export function parseSdp(str: string) {
  function createSection() {
    if(sessionSection) {
      mediaSections.push(new SDPMediaSection(lines));
    } else {
      sessionSection = new SDPSessionSection(lines);
    }
  }

  let sessionSection: SDPSessionSection = null, lines: SDPLine[] = [];
  const mediaSections: SDPMediaSection[] = [];
  str.split(/\r?\n/).forEach((lineStr) => {
    if(!isIncorrectSdpLine(lineStr)) {
      const line = parseSdpLine(lineStr);
      if(line.key === 'm') {
        createSection();
        lines = [];
      }

      lines.push(line);
    }
  });

  createSection();
  return new SDP(sessionSection, mediaSections);
}

export function isIncorrectSdpLine(str: string) {
  return /^[\s\xa0]*$/.test(str);
}

export function parseSdpLine(str: string) {
  const splitted = splitStringByLimitWithRest(str, '=', 1);
  return new SDPLine(splitted[0] as any, splitted[1]);
}

export function addSimulcast(sdp: SDP) {
  let generator: UniqueNumberGenerator;
  sdp.media.forEach((section, idx) => {
    if(section.mediaType === 'video' && section.isSending && !section.attributes.get('ssrc-group').get('SIM').exists) {
      if(!generator) {
        generator = new UniqueNumberGenerator(2, 4294967295);
      }

      const originalSsrcs = section.attributes.get('ssrc-group').get('FID').value.split(' ');
      const lines = section.lines;
      originalSsrcs.forEach((ssrc) => generator.add(+ssrc)); // fix possible duplicates
      const ssrcs = [originalSsrcs[0], generator.generate(), generator.generate()];
      const ssrcs2 = [originalSsrcs[1], generator.generate(), generator.generate()];

      lines.push(parseSdpLine('a=ssrc-group:SIM ' + ssrcs.join(' ')));

      const ssrcsStrLines = section.attributes.get('ssrc').get(originalSsrcs[0]).lines;

      ssrcs.forEach((ssrc, idx) => {
        const ssrc2 = ssrcs2[idx];
        if(idx > 0) {
          lines.push(parseSdpLine('a=ssrc-group:FID ' + ssrc + ' ' + ssrc2));

          ssrcsStrLines.forEach((v) => {
            lines.push(parseSdpLine('a=ssrc:' + ssrc + ' ' + v));
          });

          ssrcsStrLines.forEach((v) => {
            lines.push(parseSdpLine('a=ssrc:' + ssrc2 + ' ' + v));
          });
        }
      });

      sdp.media[idx] = new SDPMediaSection(lines);
    }
  });

  return !!generator;
}
