/*
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import {PhoneCallProtocol} from '@layer';

// tgcalls v2 P2P signaling protocol version.
// '13.0.0' (v3) = structured NegotiateChannels signaling, encryptRawPacket crypto,
// gzip-compressed payloads and SCTP-framed signaling. See src/lib/calls/p2P.
export const CALL_PROTOCOL_LIBRARY_VERSIONS = ['13.0.0'];

export default function getCallProtocol(): PhoneCallProtocol {
  return {
    _: 'phoneCallProtocol',
    pFlags: {
      udp_p2p: true,
      udp_reflector: true
    },
    min_layer: 65,
    max_layer: 92,
    library_versions: CALL_PROTOCOL_LIBRARY_VERSIONS
  };
}
