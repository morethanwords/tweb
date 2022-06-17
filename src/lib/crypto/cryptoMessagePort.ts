/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { CryptoMethods } from './crypto_methods';
import SuperMessagePort from '../mtproto/superMessagePort';
import { Awaited } from '../../types';
import { MOUNT_CLASS_TO } from '../../config/debug';
import { IS_WORKER } from '../../helpers/context';

type CryptoEvent = {
  invoke: <T extends keyof CryptoMethods>(payload: {method: T, args: Parameters<CryptoMethods[T]>}) => ReturnType<CryptoMethods[T]>,
  port: (payload: void, source: MessageEventSource, event: MessageEvent) => void
};

export class CryptoMessagePort<Master extends boolean = false> extends SuperMessagePort<CryptoEvent, CryptoEvent, Master> {
  public invokeCrypto<T extends keyof CryptoMethods>(method: T, ...args: Parameters<CryptoMethods[T]>): Promise<Awaited<ReturnType<CryptoMethods[T]>>> {
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

    // @ts-ignore
    return this.invoke('invoke', payload);
  }
}

const cryptoMessagePort = new CryptoMessagePort<false>();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.cryptoMessagePort = cryptoMessagePort);
export default cryptoMessagePort;
