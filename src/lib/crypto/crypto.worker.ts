import '@lib/polyfill'; // just to include

import listenMessagePort from '@helpers/listenMessagePort';
import cryptoMessagePort from '@lib/crypto/cryptoMessagePort';
import {cryptoMethodsRegistry} from '@lib/crypto/cryptoMethodsRegistry';
import ctx from '@environment/ctx';
import {IS_WORKER} from '@helpers/context';

console.log('CryptoWorker start');

cryptoMessagePort.addMultipleEventsListeners({
  invoke: ({method, args}) => {
    // @ts-ignore
    const result: any = cryptoMethodsRegistry[method](...args);
    return result;
  },

  terminate: () => {
    ctx.close();
  },

  port: (_, __, event) => {
    cryptoMessagePort.attachPort(event.ports[0]);
  }
});

// Skip in Modes.noWorker (when the proxy imports this module into the main
// thread): there's nothing to listen to — the invoke listener registered above
// is enough, and cryptoMessagePort.invokeCryptoNew short-circuits same-realm
// callers directly into it.
if(IS_WORKER && typeof(MessageChannel) !== 'undefined') listenMessagePort(cryptoMessagePort, (source) => {
  const channel = new MessageChannel();
  cryptoMessagePort.attachPort(channel.port1);
  cryptoMessagePort.invokeVoid('port', undefined, source, [channel.port2]);
});
