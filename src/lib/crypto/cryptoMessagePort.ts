/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {CryptoMethods} from './crypto_methods';
import SuperMessagePort from '../mtproto/superMessagePort';
import {Awaited} from '../../types';
import {MOUNT_CLASS_TO} from '../../config/debug';
import {IS_WORKER} from '../../helpers/context';

type CryptoEvent = {
  invoke: <T extends keyof CryptoMethods>(payload: {method: T, args: Parameters<CryptoMethods[T]>}) => ReturnType<CryptoMethods[T]>,
  port: (payload: void, source: MessageEventSource, event: MessageEvent) => void,
  terminate: () => void
};

export class CryptoMessagePort<Master extends boolean = false> extends SuperMessagePort<CryptoEvent, CryptoEvent, Master> {
  private lastIndex: number;

  constructor() {
    super('CRYPTO');
    this.lastIndex = -1;
  }

  public invokeCryptoNew<T extends keyof CryptoMethods>({method, args, transfer}: {
    method: T,
    args: Parameters<CryptoMethods[T]>,
    transfer?: Transferable[]
  }): Promise<Awaited<ReturnType<CryptoMethods[T]>>> {
    const payload = {method, args};
    const listeners = this.listeners['invoke'];
    if(listeners?.length) { // already in worker
      // try {
      // @ts-ignore
      let result: any = listeners[0].callback(payload);
      if(!IS_WORKER && !(result instanceof Promise)) {
        result = Promise.resolve(result);
      }

      return result;
      // } catch(err) {
      //   return Promise.reject(err);
      // }
    }

    const sendPortIndex = method === 'aes-encrypt' || method === 'aes-decrypt' ?
      this.lastIndex = (this.lastIndex + 1) % this.sendPorts.length :
      0;
    // @ts-ignore
    return this.invoke('invoke', payload, undefined, this.sendPorts[sendPortIndex], transfer);
  }

  public invokeCrypto<T extends keyof CryptoMethods>(method: T, ...args: Parameters<CryptoMethods[T]>): Promise<Awaited<ReturnType<CryptoMethods[T]>>> {
    return this.invokeCryptoNew({method, args});
  }
}

const cryptoMessagePort = new CryptoMessagePort<false>();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.cryptoMessagePort = cryptoMessagePort);
export default cryptoMessagePort;
