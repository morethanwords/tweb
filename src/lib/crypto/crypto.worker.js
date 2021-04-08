/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

//const ctx: Worker = self as any;
const ctx = self;

// just to include
import {secureRandom} from '../polyfill';
secureRandom;

import {pqPrimeFactorization, bytesModPow, sha1HashSync,
  aesEncryptSync, aesDecryptSync, hash_pbkdf2, sha256HashSync, rsaEncrypt} from './crypto_utils';

import {gzipUncompress} from '../mtproto/bin_utils';

ctx.onmessage = function(e) {
  var taskID = e.data.taskID,
    result = null;

  switch(e.data.task) {
    case 'gzipUncompress':
      result = gzipUncompress.apply(null, e.data.args);
      break;

    case 'factorize':
      result = pqPrimeFactorization.apply(null, e.data.args);
      break;

    case 'mod-pow':
      result = bytesModPow.apply(null, e.data.args);
      break;

    case 'sha1-hash':
      result = sha1HashSync.apply(null, e.data.args);
      break;

    case 'sha256-hash':
      result = sha256HashSync.apply(null, e.data.args);
      break;
    
    case 'rsa-encrypt':
      result = rsaEncrypt.apply(null, e.data.args);
      break;

    case 'aes-encrypt':
      result = aesEncryptSync.apply(null, e.data.args);
      break;

    case 'aes-decrypt':
      result = aesDecryptSync.apply(null, e.data.args);
      break;

    case 'pbkdf2':
      return hash_pbkdf2.apply(null, e.data.args).then(result => {
        ctx.postMessage({taskID: taskID, result: result});
      });
      break;

    default:
      throw new Error('Unknown task: ' + e.data.task);
  }

  ctx.postMessage({taskID: taskID, result: result});
}

ctx.postMessage('ready');
