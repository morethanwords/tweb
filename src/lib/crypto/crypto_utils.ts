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

//import sha1 from '@cryptography/sha1';
//import sha256 from '@cryptography/sha256';
import {IGE} from '@cryptography/aes';

// @ts-ignore
import pako from 'pako/dist/pako_inflate.min.js';

import {str2bigInt, bpe, equalsInt, greater, 
  copy_, eGCD_, add_, rightShift_, sub_, copyInt_, isZero,
  divide_, one, bigInt2str, powMod, bigInt2bytes, int2bigInt, mod} from '../../vendor/leemon';//from 'leemon';

import { addPadding } from '../mtproto/bin_utils';
import { bytesToWordss, bytesFromWordss, bytesToHex, bytesFromHex, convertToUint8Array } from '../../helpers/bytes';
import { nextRandomUint } from '../../helpers/random';
import type { RSAPublicKeyHex } from '../mtproto/rsaKeysManager';

const subtle = typeof(window) !== 'undefined' && 'crypto' in window ? window.crypto.subtle : self.crypto.subtle;

export function longToBytes(sLong: string) {
  /* let perf = performance.now();
  for(let i = 0; i < 1000000; ++i) {
    bytesFromWords({words: longToInts(sLong), sigBytes: 8}).reverse();
  }
  console.log('longToBytes JSBN', sLong, performance.now() - perf);
  
  //const bytes = bytesFromWords({words: longToInts(sLong), sigBytes: 8}).reverse();
  
  perf = performance.now();
  for(let i = 0; i < 1000000; ++i) {
    bigInt2bytes(str2bigInt(sLong, 10));
  }
  console.log('longToBytes LEEMON', sLong, performance.now() - perf); */

  const bigIntBytes = new Uint8Array(bigInt2bytes(str2bigInt(sLong, 10), false));
  const bytes = addPadding(bigIntBytes, 8, true, false, false);
  //console.log('longToBytes', bytes, b);
  
  return bytes;
}

export function sha1HashSync(bytes: Parameters<typeof convertToUint8Array>[0]) {
  return subtle.digest('SHA-1', convertToUint8Array(bytes)).then(b => {
    return new Uint8Array(b);
  });
  /* //console.trace(dT(), 'SHA-1 hash start', bytes);

  const hashBytes: number[] = [];

  let hash = sha1(String.fromCharCode.apply(null, 
    bytes instanceof Uint8Array ? [...bytes] : [...new Uint8Array(bytes)]));
  for(let i = 0; i < hash.length; ++i) {
    hashBytes.push(hash.charCodeAt(i));
  }

  //console.log(dT(), 'SHA-1 hash finish', hashBytes, bytesToHex(hashBytes));

  return new Uint8Array(hashBytes); */
}

export function sha256HashSync(bytes: Parameters<typeof convertToUint8Array>[0]) {
  return subtle.digest('SHA-256', convertToUint8Array(bytes)).then(b => {
    //console.log('legacy', performance.now() - perfS);
    return new Uint8Array(b);
  });
  /* //console.log('SHA-256 hash start');

  let perfS = performance.now();
  

  let perfD = performance.now();
  let words = typeof(bytes) === 'string' ? bytes : bytesToWordss(bytes as any);
  let hash = sha256(words);
  console.log('darutkin', performance.now() - perfD);

  //console.log('SHA-256 hash finish', hash, sha256(words, 'hex'));

  return bytesFromWordss(hash); */
}

export function aesEncryptSync(bytes: Uint8Array, keyBytes: Uint8Array, ivBytes: Uint8Array) {
  //console.log(dT(), 'AES encrypt start', bytes, keyBytes, ivBytes);
  // console.log('aes before padding bytes:', bytesToHex(bytes));
  bytes = addPadding(bytes);
  // console.log('aes after padding bytes:', bytesToHex(bytes));

  const cipher = new IGE(bytesToWordss(keyBytes), bytesToWordss(ivBytes));
  const encryptedBytes = cipher.encrypt(bytesToWordss(bytes));
  //console.log(dT(), 'AES encrypt finish');

  return bytesFromWordss(encryptedBytes);
}

export function aesDecryptSync(bytes: Uint8Array, keyBytes: Uint8Array, ivBytes: Uint8Array) {
  //console.log(dT(), 'AES decrypt start', bytes, keyBytes, ivBytes);

  const cipher = new IGE(bytesToWordss(keyBytes), bytesToWordss(ivBytes));
  const decryptedBytes = cipher.decrypt(bytesToWordss(bytes));

  //console.log(dT(), 'AES decrypt finish');

  return bytesFromWordss(decryptedBytes);
}

export function rsaEncrypt(bytes: Uint8Array, publicKey: RSAPublicKeyHex) {
  //console.log(dT(), 'RSA encrypt start', publicKey, bytes);

  const N = str2bigInt(publicKey.modulus, 16);
  const E = str2bigInt(publicKey.exponent, 16);
  const X = str2bigInt(bytesToHex(bytes), 16);

  const encryptedBigInt = powMod(X, E, N);
  const encryptedBytes = bytesFromHex(bigInt2str(encryptedBigInt, 16));

  //console.log(dT(), 'RSA encrypt finish');

  return encryptedBytes;
}

export async function hash_pbkdf2(buffer: Parameters<SubtleCrypto['importKey']>[1], salt: HkdfParams['salt'], iterations: number) {
  const importKey = await subtle.importKey(
    'raw',
    buffer,
    {name: 'PBKDF2'},
    false,
    [/* 'deriveKey',  */'deriveBits']
  );
  
  /* await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: {name: 'SHA-512'}
    },
    importKey,
    {
      name: 'AES-CTR',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  ); */

  let bits = subtle.deriveBits({
      name: 'PBKDF2',
      salt,
      iterations,
      hash: {name: 'SHA-512'},
    },
    importKey,
    512
  );

  return bits.then(buffer => new Uint8Array(buffer));
}

export function pqPrimeFactorization(pqBytes: Uint8Array | number[]) {
  let result: ReturnType<typeof pqPrimeLeemon>;

  //console.log('PQ start', pqBytes, bytesToHex(pqBytes));

  try {
    //console.time('PQ leemon');
    result = pqPrimeLeemon(str2bigInt(bytesToHex(pqBytes), 16, Math.ceil(64 / bpe) + 1));
    //console.timeEnd('PQ leemon');
  } catch(e) {
    console.error('Pq leemon Exception', e);
  }

  //console.log('PQ finish', result);

  return result;
}

export function pqPrimeLeemon(what: number[]): [Uint8Array, Uint8Array, number] {
  var minBits = 64;
  var minLen = Math.ceil(minBits / bpe) + 1;
  var it = 0;
  var i, q;
  var j, lim;
  var P;
  var Q;
  var a = new Array(minLen);
  var b = new Array(minLen);
  var c = new Array(minLen);
  var g = new Array(minLen);
  var z = new Array(minLen);
  var x = new Array(minLen);
  var y = new Array(minLen);

  for(i = 0; i < 3; ++i) {
    q = (nextRandomUint(8) & 15) + 17;
    copy_(x, mod(int2bigInt(nextRandomUint(32), 32, 0), what));
    copy_(y, x);
    lim = 1 << (i + 18);

    for (j = 1; j < lim; ++j) {
      ++it;
      copy_(a, x);
      copy_(b, x);
      copyInt_(c, q);

      while(!isZero(b)) {
        if(b[0] & 1) {
          add_(c, a);
          if(greater(c, what)) {
            sub_(c, what);
          }
        }
        add_(a, a);
        if(greater(a, what)) {
          sub_(a, what);
        }
        rightShift_(b, 1);
      }

      copy_(x, c);
      if(greater(x, y)) {
        copy_(z, x);
        sub_(z, y);
      } else {
        copy_(z, y);
        sub_(z, x);
      }
      eGCD_(z, what, g, a, b);
      if(!equalsInt(g, 1)) {
        break;
      }
      if((j & (j - 1)) === 0) {
        copy_(y, x);
      }
    }
    if(greater(g, one)) {
      break;
    }
  }

  divide_(what, g, x, y);

  if(greater(g, x)) {
    P = x;
    Q = g;
  } else {
    P = g;
    Q = x;
  }

  // console.log(dT(), 'done', bigInt2str(what, 10), bigInt2str(P, 10), bigInt2str(Q, 10))

  return [new Uint8Array(bigInt2bytes(P)), new Uint8Array(bigInt2bytes(Q)), it];
}

export function bytesModPow(x: number[] | Uint8Array, y: number[] | Uint8Array, m: number[] | Uint8Array) {
  try {
    const xBigInt = str2bigInt(bytesToHex(x), 16);
    const yBigInt = str2bigInt(bytesToHex(y), 16);
    const mBigInt = str2bigInt(bytesToHex(m), 16);
    const resBigInt = powMod(xBigInt, yBigInt, mBigInt);

    return bytesFromHex(bigInt2str(resBigInt, 16));
  } catch(e) {
    console.error('mod pow error', e);
  }

  //return bytesFromBigInt(new BigInteger(x).modPow(new BigInteger(y), new BigInteger(m)), 256);
}

//export function gzipUncompress(bytes: ArrayBuffer, toString: true): string;
//export function gzipUncompress(bytes: ArrayBuffer, toString?: false): Uint8Array;
export function gzipUncompress(bytes: ArrayBuffer, toString?: boolean): string | Uint8Array {
  //console.log(dT(), 'Gzip uncompress start');
  const result = pako.inflate(bytes, toString ? {to: 'string'} : undefined);
  //console.log(dT(), 'Gzip uncompress finish'/* , result */);
  return result;
}
