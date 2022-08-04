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

import {PhoneCallProtocol} from '../../../layer';

export default function getCallProtocol(): PhoneCallProtocol {
  return {
    _: 'phoneCallProtocol',
    pFlags: {
      udp_p2p: true,
      udp_reflector: true
    },
    min_layer: 92,
    max_layer: 92,
    library_versions: ['4.0.0']
  };
}
