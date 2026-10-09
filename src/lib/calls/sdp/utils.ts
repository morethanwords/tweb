import SDP from '.';
import splitStringByLimitWithRest from '@helpers/string/splitStringByLimitWithRest';
import UniqueNumberGenerator from '@helpers/uniqueNumberGenerator';
import SDPLine from '@lib/calls/sdp/line';
import SDPMediaSection from '@lib/calls/sdp/mediaSection';
import SDPSessionSection from '@lib/calls/sdp/sessionSection';

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

/**
 * Legacy (SSRC-group) simulcast: Chromium creates one encoding per `SIM`
 * member when the munged offer is applied locally, lowest resolution first
 * (default scaleResolutionDownBy 4/2/1 for three layers, 2/1 for two). The
 * layer count is fixed from then on — setParameters cannot add or drop
 * encodings, and every re-offer keeps the group — so it has to be chosen here,
 * per connection (see getVideoSimulcastLayerCount). `layers <= 1` leaves the
 * offer untouched.
 */
export function addSimulcast(sdp: SDP, layers = 3) {
  if(layers <= 1) {
    return false;
  }

  let generator: UniqueNumberGenerator;
  sdp.media.forEach((section, idx) => {
    if(section.mediaType === 'video' && section.isSending && !section.attributes.get('ssrc-group').get('SIM').exists) {
      const fid = section.attributes.get('ssrc-group').get('FID').value;
      // Without an RTX pairing there is nothing to mirror per layer; leave the
      // section single-layer rather than throwing on a browser that omits it.
      if(!fid) {
        return;
      }

      if(!generator) {
        generator = new UniqueNumberGenerator(2, 4294967295);
      }

      const originalSsrcs = fid.split(' ');
      const lines = section.lines;
      originalSsrcs.forEach((ssrc) => generator.add(+ssrc)); // fix possible duplicates
      const ssrcs = [originalSsrcs[0]];
      const ssrcs2 = [originalSsrcs[1]];
      for(let i = 1; i < layers; ++i) {
        ssrcs.push('' + generator.generate());
        ssrcs2.push('' + generator.generate());
      }

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
