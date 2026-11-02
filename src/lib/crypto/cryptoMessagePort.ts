import {CryptoMethods} from '@lib/crypto/crypto_methods';
import SuperMessagePort from '@lib/superMessagePort';
import {MOUNT_CLASS_TO} from '@config/debug';
import {IS_WORKER} from '@helpers/context';
import type {ThreadedWorkerEvents} from '@lib/mainWorker/mainMessagePort';
import type {ThreadMemoryStats} from '@lib/debug/memoryStats';
import {toLocalDataKeyBytes, type EncryptLocalDataArgs} from '@lib/crypto/utils/aesLocal';


type CryptoEvent = {
  invoke: <T extends keyof CryptoMethods>(payload: {method: T, args: Parameters<CryptoMethods[T]>}) =>
    SuperMessagePort.TransferableResultValue<ReturnType<CryptoMethods[T]>>,
  port: (payload: void, source: MessageEventSource, event: MessageEvent) => void,
  terminate: () => void,
  memoryStats: (payload: void) => ThreadMemoryStats // see @lib/debug/memoryStats
} & ThreadedWorkerEvents;

export class CryptoMessagePort<Master extends boolean = false> extends SuperMessagePort<CryptoEvent, CryptoEvent, Master> {
  private lastIndex: number;

  constructor() {
    super('CRYPTO');
    this.lastIndex = -1;
  }

  // TODO: Transfer transferables on result tasks?
  public invokeCryptoNew<T extends keyof CryptoMethods>({method, args, transfer}: {
    method: T,
    args: Parameters<CryptoMethods[T]>,
    transfer?: Transferable[]
  }): Promise<Awaited<SuperMessagePort.TransferableResultValue<ReturnType<CryptoMethods[T]>>>> {
    const payload = {method, args};
    const listeners = this.listeners['invoke'];
    if(listeners?.size) { // already in worker
      // try {
      let result: any = listeners.values().next().value.callback(payload);
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
    const port = this.sendPorts[sendPortIndex];

    // * the local data key goes over as its bytes: see `LocalDataKey`
    const keyArgs = (method === 'aes-local-encrypt' || method === 'aes-local-decrypt') && args[0] as EncryptLocalDataArgs;
    if(keyArgs && !ArrayBuffer.isView(keyArgs.key)) {
      return toLocalDataKeyBytes(keyArgs.key).then((key) => {
        // @ts-ignore
        return this.invoke('invoke', {method, args: [{...keyArgs, key}]}, undefined, port, transfer);
      }) as Promise<any>;
    }

    // @ts-ignore
    return this.invoke('invoke', payload, undefined, port, transfer);
  }

  public invokeCrypto<T extends keyof CryptoMethods>(method: T, ...args: Parameters<CryptoMethods[T]>) {
    return this.invokeCryptoNew({method, args});
  }

  public sendToOnePort(port: MessagePort) {
    this.invokeVoid('port', undefined, this.sendPorts[0], [port]);
  }
}

const cryptoMessagePort = new CryptoMessagePort<false>();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.cryptoMessagePort = cryptoMessagePort);
export default cryptoMessagePort;
