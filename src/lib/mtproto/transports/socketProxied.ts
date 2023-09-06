/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {notifyAll} from '../../../helpers/context';
import EventListenerBase from '../../../helpers/eventListenerBase';
import {WorkerTaskVoidTemplate} from '../../../types';
import {MTConnection} from './transport';

let socketId = 0;
export interface SocketProxyTask extends WorkerTaskVoidTemplate {
  type: 'socketProxy',
  payload: SocketProxySetupTask | SocketProxySendTask | SocketProxyCloseTask
};

export interface SocketProxySetupTask extends WorkerTaskVoidTemplate {
  type: 'setup',
  payload: {
    dcId: number,
    url: string,
    logSuffix: string
  },
  id: number
};

export interface SocketProxySendTask extends WorkerTaskVoidTemplate {
  type: 'send',
  payload: Uint8Array,
  id: number
};

export interface SocketProxyCloseTask extends WorkerTaskVoidTemplate {
  type: 'close',
  id: number
};

export default class SocketProxied extends EventListenerBase<{
  open: () => void,
  message: (buffer: ArrayBuffer) => any,
  close: () => void,
}> implements MTConnection {
  private id: number;

  constructor(protected dcId: number, protected url: string, logSuffix: string) {
    super();
    this.id = ++socketId;
    socketsProxied.set(this.id, this);

    const task: SocketProxyTask = {
      type: 'socketProxy',
      payload: {
        type: 'setup',
        payload: {
          dcId,
          url,
          logSuffix
        },
        id: this.id
      }
    };

    notifyAll(task);
  }

  public send(payload: Uint8Array) {
    const task: SocketProxyTask = {
      type: 'socketProxy',
      payload: {
        type: 'send',
        payload,
        id: this.id
      }
    };

    notifyAll(task);
  }

  public close() {
    const task: SocketProxyTask = {
      type: 'socketProxy',
      payload: {
        type: 'close',
        id: this.id
      }
    };

    notifyAll(task);
  }
}
export const socketsProxied: Map<number, SocketProxied> = new Map();
