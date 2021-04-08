/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type EventListenerBase from "../../../helpers/eventListenerBase";

export default interface MTTransport {
  send: (data: Uint8Array) => void;
}

export interface MTConnection extends EventListenerBase<{
  open: () => void,
  message: (buffer: ArrayBuffer) => any,
  close: () => void,
}> {
  send: (data: Uint8Array) => void;
  close: () => void;
}

export interface MTConnectionConstructable {
  new(dcId: number, url: string, logSuffix: string): MTConnection;
}
