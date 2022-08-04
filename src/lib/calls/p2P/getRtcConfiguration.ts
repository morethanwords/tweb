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

import {PhoneCall} from '../../../layer';

export default function getRtcConfiguration(call: PhoneCall.phoneCall): RTCConfiguration {
  const iceServers: RTCIceServer[] = [];
  call.connections.forEach((connection) => {
    switch(connection._) {
      /* case 'callServerTypeTelegramReflector': {
        break;
      } */
      case 'phoneConnectionWebrtc': {
        const {ip, ipv6, port, username, password} = connection;
        const urls: string[] = [];
        if(connection.pFlags.turn) {
          if(ip) {
            urls.push(`turn:${ip}:${port}`);
          }
          if(ipv6) {
            urls.push(`turn:[${ipv6}]:${port}`);
          }
        } else if(connection.pFlags.stun) {
          if(ip) {
            urls.push(`stun:${ip}:${port}`);
          }
          if(ipv6) {
            urls.push(`stun:[${ipv6}]:${port}`);
          }
        }

        if(urls.length > 0) {
          iceServers.push({
            urls,
            username,
            credential: password
          });
        }
        break;
      }
    }
  });

  return {
    iceServers,
    iceTransportPolicy: call.pFlags.p2p_allowed ? 'all' : 'relay'
  };
}
