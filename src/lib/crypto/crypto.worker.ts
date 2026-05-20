/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import '@lib/polyfill'; // just to include

import listenMessagePort from '@helpers/listenMessagePort';
import cryptoMessagePort from '@lib/crypto/cryptoMessagePort';
import {cryptoMethodsRegistry} from '@lib/crypto/cryptoMethodsRegistry';
import ctx from '@environment/ctx';

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

if(typeof(MessageChannel) !== 'undefined') listenMessagePort(cryptoMessagePort, (source) => {
  const channel = new MessageChannel();
  cryptoMessagePort.attachPort(channel.port1);
  cryptoMessagePort.invokeVoid('port', undefined, source, [channel.port2]);
});
