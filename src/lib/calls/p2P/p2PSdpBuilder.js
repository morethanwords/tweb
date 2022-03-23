/*
*  Copyright (c) 2018-present, Evgeny Nadymov
*
* This source code is licensed under the GPL v.3.0 license found in the
* LICENSE file in the root directory of this source tree.
*/

import ChromeP2PSdpBuilder from './chromeP2PSdpBuilder';
import { FirefoxP2PSdpBuilder } from './firefoxP2PSdpBuilder';
import { SafariP2PSdpBuilder } from './safariP2PSdpBuilder';
// import { TG_CALLS_SDP_STRING } from '../../Stores/CallStore';

export function p2pParseCandidate(candidate) {
  if(!candidate || !candidate.startsWith('candidate:')) {
    return;
  }
  
  const sdpString = candidate;
  candidate = candidate.substr('candidate:'.length);
  
  const [foundation, component, protocol, priority, ip, port, ...other] = candidate.split(' ');
  const c = {
    sdpString,
    foundation,
    component,
    protocol,
    priority,
    address: { ip, port }
  };
  
  for(let i = 0; i < other.length; i += 2) {
    switch(other[i]) {
      case 'typ': {
        c.type = other[i + 1];
        break;
      }
      case 'raddr': {
        if(!c.relAddress) {
          c.relAddress = {};
        }
        
        c.relAddress.ip = other[i + 1];
        break;
      }
      case 'rport': {
        if(!c.relAddress) {
          c.relAddress = {};
        }
        
        c.relAddress.port = other[i + 1];
        break;
      }
      case 'generation': {
        c.generation = other[i + 1];
        break;
      }
      case 'tcptype': {
        c.tcpType = other[i + 1];
        break;
      }
      case 'network-id': {
        c.networkId = other[i + 1];
        break;
      }
      case 'network-cost': {
        c.networkCost = other[i + 1];
        break;
      }
      case 'ufrag': {
        c.username = other[i + 1];
        break;
      }
    }
  }
  
  return c;
}

export function p2pParseSdp(sdp) {
  const lines = sdp.split('\r\n');
  const lookup = (prefix, force = true, lineFrom = 0, lineTo = Number.MAX_VALUE) => {
    if (lineTo === -1) {
      lineTo = Number.MAX_VALUE;
    }
    for (let i = lineFrom; i < lines.length && i < lineTo; i++) {
      const line = lines[i];
      if (line.startsWith(prefix)) {
        return line.substr(prefix.length);
      }
    }
    
    if (force) {
      console.error("Can't find prefix", prefix);
    }
    
    return null;
  };
  const findIndex = (prefix, lineFrom = 0, lineTo = Number.MAX_VALUE) => {
    if (lineTo === -1) {
      lineTo = Number.MAX_VALUE;
    }
    for (let i = lineFrom; i < lines.length && i < lineTo; i++) {
      const line = lines[i];
      if (line.startsWith(prefix)) {
        return i;
      }
    }
    
    return -1;
  };
  
  const pwdIndex = findIndex('a=ice-pwd:');
  const ufragIndex = findIndex('a=ice-ufrag:');
  if (pwdIndex === -1 && ufragIndex === -1) {
    return {
      // sessionId: lookup('o=').split(' ')[1],
      ufrag: null,
      pwd: null,
      fingerprints: []
    };
  }
  
  const info = {
    // sessionId: lookup('o=').split(' ')[1],
    ufrag: null,
    pwd: null,
    fingerprints: []
  };
  
  let mediaIndex = findIndex('m=');
  const fingerprint = lookup('a=fingerprint:', false);
  const setup = lookup('a=setup:', false);
  if (fingerprint && setup) {
    info.fingerprints.push({
      hash: fingerprint.split(' ')[0],
      fingerprint: fingerprint.split(' ')[1],
      setup
    });
  }
  
  const ufrag = lookup('a=ice-ufrag:', false);
  const pwd = lookup('a=ice-pwd:', false);
  if (ufrag && pwd) {
    info.ufrag = ufrag;
    info.pwd = pwd;
  }
  
  while (mediaIndex !== -1) {
    let nextMediaIndex = findIndex('m=', mediaIndex + 1);
    
    const extmap = [];
    const types = [];
    const mediaType = lookup('m=', true, mediaIndex, nextMediaIndex).split(' ')[0];
    const media = {
      // type: lookup('m=', true, mediaIndex, nextMediaIndex).split(' ')[0],
      // mid: lookup('a=mid:', true, mediaIndex, nextMediaIndex),
      // dir: findDirection(mediaIndex, nextMediaIndex),
      rtpExtensions: extmap,
      payloadTypes: types
    }
    
    const lineTo = nextMediaIndex === -1 ? lines.length : nextMediaIndex;
    const fmtp = new Map();
    const rtcpFb = new Map();
    for (let i = mediaIndex; i < lineTo; i++) {
      const line = lines[i];
      if (line.startsWith('a=extmap:')) {
        const [ id, uri ] = line.substr('a=extmap:'.length).split(' ');
        extmap.push({ id: parseInt(id), uri });
      } else if (line.startsWith('a=fmtp:')) {
        const [ id, str ] = line.substr('a=fmtp:'.length).split(' ');
        const obj = { };
        const arr =  str.split(';').map(x => {
          const [ key, value ] = x.split('=');
          obj[key] = value;
          return { [key]: value };
        });
        fmtp.set(parseInt(id), obj);
      } else if (line.startsWith('a=rtcp-fb:')) {
        const [ id, type = '', subtype = '' ] = line.substr('a=rtcp-fb:'.length).split(' ');
        if (rtcpFb.has(parseInt(id))) {
          rtcpFb.get(parseInt(id)).push({ type, subtype });
        } else {
          rtcpFb.set(parseInt(id), [{ type, subtype }])
        }
      } else if (line.startsWith('a=rtpmap')) {
        const [ id, str ] = line.substr('a=rtpmap:'.length).split(' ');
        const [ name, clockrate, channels = '0' ] = str.split('/');
        const obj = { id: parseInt(id), name, clockrate: parseInt(clockrate), channels: parseInt(channels) };
        
        types.push(obj);
      }
    }
    
    for (let i = 0; i < types.length; i++) {
      const { id } = types[i];
      if (rtcpFb.has(id)) {
        types[i].feedbackTypes = rtcpFb.get(id);
      }
      if (fmtp.has(id)) {
        types[i].parameters = fmtp.get(id);
      }
    }
    
    const ssrc = lookup('a=ssrc:', false, mediaIndex, nextMediaIndex);
    if (ssrc) {
      media.ssrc = ssrc.split(' ')[0];
    }
    
    const ssrcGroup = lookup('a=ssrc-group:', false, mediaIndex, nextMediaIndex);
    if (ssrcGroup) {
      const [ semantics, ...ssrcs ] = ssrcGroup.split(' ');
      media.ssrcGroups = [{
        semantics,
        ssrcs
      }]
    }
    
    switch (mediaType) {
      case 'audio': {
        info.audio = media;
        break;
      }
      case 'video': {
        info.video = media;
        break;
      }
    }
    
    mediaIndex = nextMediaIndex;
  }

  if(!info.video.ssrcGroups) {
    info.video.ssrcGroups = [];
  }

  info['@type'] = 'InitialSetup';
  
  // console.log('[p2pParseSdp]', sdp, info);
  return info;
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
}

function isSafari() {
  return navigator.userAgent.toLowerCase().indexOf('safari') > -1 && navigator.userAgent.toLowerCase().indexOf('chrome') === -1;
}

export function addExtmap(extmap) {
  let sdp = [];
  // return sdp;
  for (let j = 0; j < extmap.length; j++) {
    const ext = extmap[j];
    const { id, uri } = ext;
    // if (isFirefox() && uri.indexOf(''))
    console.log('[extmap] add', id, uri);
    sdp.push(`a=extmap:${id} ${uri}`);
  }
  
  return sdp.join('\n');
}

export function addPayloadTypes(types) {
  let sdp = [];
  console.log('[SDP] addPayloadTypes', types);
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const { id, name, clockrate, channels, feedbackTypes, parameters } = type;
    sdp.push(`a=rtpmap:${id} ${name}/${clockrate}${channels ? '/' + channels : ''}`);
    if (feedbackTypes) {
      feedbackTypes.forEach(x => {
        const { type, subtype } = x;
        sdp.push(`a=rtcp-fb:${id} ${[type, subtype].join(' ')}`);
      });
    }
    if (parameters) {
      const fmtp = [];
      Object.getOwnPropertyNames(parameters).forEach(pName => {
        fmtp.push(`${pName}=${parameters[pName]}`);
      });
      
      sdp.push(`a=fmtp:${id} ${fmtp.join(';')}`);
    }
  }
  
  return sdp.join('\n');
}

export function addSsrc(type, ssrc, ssrcGroups, streamName) {
  let sdp = [];
  
  if (ssrcGroups && ssrcGroups.length > 0) {
    ssrcGroups.forEach(ssrcGroup => {
      if (ssrcGroup && ssrcGroup.ssrcs.length > 0) {
        sdp.push(`a=ssrc-group:${ssrcGroup.semantics} ${ssrcGroup.ssrcs.join(' ')}`);
        ssrcGroup.ssrcs.forEach(ssrc => {
          sdp.push(
            `a=ssrc:${ssrc} cname:stream${ssrc}`,
            `a=ssrc:${ssrc} msid:${streamName} ${type}${ssrc}`,
            `a=ssrc:${ssrc} mslabel:${type}${ssrc}`,
            `a=ssrc:${ssrc} label:${type}${ssrc}`
          );
        });
      }
    });
  } else if (ssrc) {
    sdp.push(
      `a=ssrc:${ssrc} cname:stream${ssrc}`,
      `a=ssrc:${ssrc} msid:${streamName} ${type}${ssrc}`,
      `a=ssrc:${ssrc} mslabel:${type}${ssrc}`,
      `a=ssrc:${ssrc} label:${type}${ssrc}`
    );
  }
  
  return sdp.join('\n');
}

export function addDataChannel(mid) {
  return `m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=ice-options:trickle
a=mid:2
a=sctp-port:5000
a=max-message-size:262144`;
}

export class P2PSdpBuilder {
  static generateCandidate(info) {
    if (!info) return null;
    
    const { sdpString, sdpMLineIndex, sdpMid, foundation, component, protocol, priority, address, type, relAddress, generation, tcpType, networkId, networkCost, username } = info;
    if (/* TG_CALLS_SDP_STRING */true) {
      if (sdpString) {
        return {
          candidate: sdpString,
          sdpMLineIndex,
          sdpMid
        };
      }
    }
    throw 'no sdpString';
    
    let candidate = `candidate:${foundation} ${component} ${protocol} ${priority} ${address.ip} ${address.port}`;
    const attrs = []
    if (type) {
      attrs.push(`typ ${type}`);
    }
    if (relAddress) {
      attrs.push(`raddr ${relAddress.ip}`);
      attrs.push(`rport ${relAddress.port}`);
    }
    if (tcpType) {
      attrs.push(`tcptype ${tcpType}`);
    }
    if (generation) {
      attrs.push(`generation ${generation}`);
    }
    if (username) {
      attrs.push(`ufrag ${username}`);
    }
    if (networkId) {
      attrs.push(`network-id ${networkId}`);
    }
    if (networkCost) {
      attrs.push(`network-cost ${networkCost}`);
    }
    if (attrs.length > 0) {
      candidate += ` ${attrs.join(' ')}`;
    }
    
    return { candidate, sdpMid, sdpMLineIndex };
  }
  
  static generateOffer(info) {
    if (isFirefox()) {
      return FirefoxP2PSdpBuilder.generateOffer(info);
    } else if (isSafari()) {
      return SafariP2PSdpBuilder.generateOffer(info);
    }
    
    return ChromeP2PSdpBuilder.generateOffer(info);
  }
  
  static generateAnswer(info) {
    if (isFirefox()) {
      return FirefoxP2PSdpBuilder.generateAnswer(info);
    } else if (isSafari()) {
      return SafariP2PSdpBuilder.generateAnswer(info);
    }
    
    return ChromeP2PSdpBuilder.generateAnswer(info);
  }
}