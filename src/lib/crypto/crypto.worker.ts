/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import '../polyfill'; // just to include

import bytesModPow from '../../helpers/bytes/bytesModPow';
import gzipUncompress from '../../helpers/gzipUncompress';
import listenMessagePort from '../../helpers/listenMessagePort';
import getEmojisFingerprint from '../calls/helpers/getEmojisFingerprint';
import computeDhKey from './computeDhKey';
import cryptoMessagePort from './cryptoMessagePort';
import {CryptoMethods} from './crypto_methods';
import generateDh from './generateDh';
import computeSRP from './srp';
import {aesEncryptSync, aesDecryptSync} from './utils/aesIGE';
import factorizeBrentPollardPQ from './utils/factorize/BrentPollard';
import pbkdf2 from './utils/pbkdf2';
import rsaEncrypt from './utils/rsa';
import sha1 from './utils/sha1';
import sha256 from './utils/sha256';
import {aesCtrDestroy, aesCtrPrepare, aesCtrProcess} from './aesCtrUtils';
import ctx from '../../environment/ctx';
import {decryptLocalData, encryptLocalData} from './utils/aesLocal';

console.log('CryptoWorker start');

const cryptoMethods: CryptoMethods = {
  'sha1': sha1,
  'sha256': sha256,
  'pbkdf2': pbkdf2,
  'aes-encrypt': aesEncryptSync,
  'aes-decrypt': aesDecryptSync,
  'rsa-encrypt': rsaEncrypt,
  'factorize': factorizeBrentPollardPQ,
  // 'factorize-tdlib': factorizeTdlibPQ,
  // 'factorize-new-new': pqPrimeLeemonNew,
  'mod-pow': bytesModPow,
  'gzipUncompress': gzipUncompress,
  'computeSRP': computeSRP,
  'generate-dh': generateDh,
  'compute-dh-key': computeDhKey,
  'get-emojis-fingerprint': getEmojisFingerprint,
  'aes-ctr-prepare': aesCtrPrepare,
  'aes-ctr-process': aesCtrProcess,
  'aes-ctr-destroy': aesCtrDestroy,
  'aes-local-encrypt': encryptLocalData,
  'aes-local-decrypt': decryptLocalData
};

cryptoMessagePort.addMultipleEventsListeners({
  invoke: ({method, args}) => {
    // @ts-ignore
    const result: any = cryptoMethods[method](...args);
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
