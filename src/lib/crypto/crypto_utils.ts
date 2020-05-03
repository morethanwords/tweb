import sha1 from '@cryptography/sha1';
import sha256 from '@cryptography/sha256';
import {IGE} from '@cryptography/aes';

// @ts-ignore
import pako from 'pako/dist/pako_inflate.min.js';

import {str2bigInt, bpe, equalsInt, greater, 
  copy_, eGCD_, add_, rightShift_, sub_, copyInt_, isZero,
  // @ts-ignore
  divide_, one, bigInt2str, powMod} from 'leemon';

// @ts-ignore
import {BigInteger} from 'jsbn';

import { addPadding, bytesToHex, bytesFromHex, nextRandomInt, bytesFromBigInt, dT, bytesFromWords, bytesToWordss, bytesFromWordss } from '../bin_utils';

export function bytesFromLeemonBigInt(bigInt: BigInteger) {
  var str = bigInt2str(bigInt, 16);
  return bytesFromHex(str);
}

export function sha1HashSync(bytes: number[] | ArrayBuffer | Uint8Array) {
  //console.trace(dT(), 'SHA-1 hash start', bytes);

  const hashBytes: number[] = [];

  let hash = sha1(String.fromCharCode.apply(null, 
    bytes instanceof Uint8Array ? [...bytes] : [...new Uint8Array(bytes)]));
  for(let i = 0; i < hash.length; ++i) {
    hashBytes.push(hash.charCodeAt(i));
  }

  //console.log(dT(), 'SHA-1 hash finish', hashBytes, bytesToHex(hashBytes));

  return new Uint8Array(hashBytes);
}

export function sha256HashSync(bytes: Uint8Array | ArrayBuffer) {
  //console.log(dT(), 'SHA-256 hash start');

  let words = bytesToWordss(bytes);
  let hash = sha256(words);

  //console.log(dT(), 'SHA-256 hash finish');

  return bytesFromWordss(hash);
}

export function aesEncryptSync(bytes: ArrayBuffer, keyBytes: ArrayBuffer, ivBytes: ArrayBuffer) {
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

export function rsaEncrypt(publicKey: {modulus: string, exponent: string}, bytes: any): number[] {
  console.log(dT(), 'RSA encrypt start', publicKey, bytes);

  bytes = addPadding(bytes, 255);

  var N = str2bigInt(publicKey.modulus, 16);
  var E = str2bigInt(publicKey.exponent, 16);
  var X = str2bigInt(bytesToHex(bytes), 16);

  var encryptedBigInt = powMod(X, E, N);
  var encryptedBytes = bytesFromHex(bigInt2str(encryptedBigInt, 16));

  console.log(dT(), 'RSA encrypt finish');

  return encryptedBytes;
}

export async function hash_pbkdf2(/* hasher: 'string',  */buffer: any, salt: any, iterations: number) {
  let subtle = typeof(window) !== 'undefined' && 'crypto' in window ? window.crypto.subtle : self.crypto.subtle;
  // @ts-ignore
  let importKey = await subtle.importKey(
    "raw", //only "raw" is allowed
    buffer, //your password
    {
      name: "PBKDF2",
    },
    false, //whether the key is extractable (i.e. can be used in exportKey)
    ["deriveKey", "deriveBits"] //can be any combination of "deriveKey" and "deriveBits"
  );
  
  /* let deriveKey =  */await subtle.deriveKey(
    {
      "name": "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: {name: "SHA-512"}, //can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
    },
    importKey, //your key from generateKey or importKey
    { //the key type you want to create based on the derived bits
      name: "AES-CTR", //can be any AES algorithm ("AES-CTR", "AES-CBC", "AES-CMAC", "AES-GCM", "AES-CFB", "AES-KW", "ECDH", "DH", or "HMAC")
      //the generateKey parameters for that type of algorithm
      length: 256, //can be  128, 192, or 256
    },
    false, //whether the derived key is extractable (i.e. can be used in exportKey)
    ["encrypt", "decrypt"] //limited to the options in that algorithm's importKey
  );

  let bits = subtle.deriveBits({
      "name": "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: {name: "SHA-512"}, //can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
    },
    importKey, //your key from generateKey or importKey
    512 //the number of bits you want to derive
  );

  return bits;
}

export function pqPrimeFactorization(pqBytes: any) {
  var what = new BigInteger(pqBytes);
  var result: any = false;

  console.log(dT(), 'PQ start', pqBytes, what.toString(16), what.bitLength())

  try {
    console.time('PQ leemon');
    result = pqPrimeLeemon(str2bigInt(what.toString(16), 16, Math.ceil(64 / bpe) + 1));
    console.timeEnd('PQ leemon');
  } catch (e) {
    console.error('Pq leemon Exception', e);
  }

  console.log(dT(), 'PQ finish');

  return result;
}

export function pqPrimeLeemon(what: any) {
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

  for(i = 0; i < 3; i++) {
    q = (nextRandomInt(128) & 15) + 17;
    copyInt_(x, nextRandomInt(1000000000) + 1);
    copy_(y, x);
    lim = 1 << (i + 18);

    for (j = 1; j < lim; j++) {
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
      if((j & (j - 1)) == 0) {
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

  return [bytesFromLeemonBigInt(P), bytesFromLeemonBigInt(Q), it];
}

export function bytesModPow(x: any, y: any, m: any) {
  try {
    var xBigInt = str2bigInt(bytesToHex(x), 16);
    var yBigInt = str2bigInt(bytesToHex(y), 16);
    var mBigInt = str2bigInt(bytesToHex(m), 16);
    var resBigInt = powMod(xBigInt, yBigInt, mBigInt);

    return bytesFromHex(bigInt2str(resBigInt, 16));
  } catch (e) {
    console.error('mod pow error', e);
  }

  return bytesFromBigInt(new BigInteger(x).modPow(new BigInteger(y), new BigInteger(m)), 256);
}

export function gzipUncompress(bytes: ArrayBuffer, toString: true): string;
export function gzipUncompress(bytes: ArrayBuffer, toString?: false): Uint8Array;
export function gzipUncompress(bytes: ArrayBuffer, toString?: boolean): string | Uint8Array {
  //console.log(dT(), 'Gzip uncompress start');
  var result = pako.inflate(bytes, toString ? {to: 'string'} : undefined);
  //console.log(dT(), 'Gzip uncompress finish'/* , result */);
  return result;
}
