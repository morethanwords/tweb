/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type EventListenerBase from '../../../helpers/eventListenerBase';
import type MTPNetworker from '../networker';

export default interface MTTransport {
  networker: MTPNetworker;
  send: (data: Uint8Array) => void;
  connected: boolean;
  destroy: () => void;
}

export interface MTConnection extends EventListenerBase<{
  open: () => void,
  message: (buffer: ArrayBuffer) => any,
  close: () => void,
}> {
  send: MTTransport['send'];
  close: () => void;
}

export interface MTConnectionConstructable {
  new(dcId: number, url: string, logSuffix: string): MTConnection;
}
