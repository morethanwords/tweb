import type EventListenerBase from '@helpers/eventListenerBase';
import type MTPNetworker from '@lib/mtproto/networker';

export default interface MTTransport {
  networker?: MTPNetworker;
  send: (data: Uint8Array) => void;
  connected: boolean;
  destroy: () => void;
  noScheduler?: boolean;
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
