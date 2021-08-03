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

import { bufferConcats } from '../../helpers/bytes';
import { add_, bigInt2str, cmp, leftShift_, str2bigInt } from '../../vendor/leemon';

/// #if !MTPROTO_WORKER
// @ts-ignore
import pako from 'pako/dist/pako_inflate.min.js';

export function gzipUncompress(bytes: ArrayBuffer, toString: true): string;
export function gzipUncompress(bytes: ArrayBuffer, toString?: false): Uint8Array;
export function gzipUncompress(bytes: ArrayBuffer, toString?: boolean): string | Uint8Array {
  //console.log(dT(), 'Gzip uncompress start');
  var result = pako.inflate(bytes, toString ? {to: 'string'} : undefined);
  //console.log(dT(), 'Gzip uncompress finish'/* , result */);
  return result;
}
/// #endif

export function isObject(object: any) {
  return typeof(object) === 'object' && object !== null;
}

/* export function bigint(num: number) {
  return new BigInteger(num.toString(16), 16);
} */

/* export function bigStringInt(strNum: string) {
  return new BigInteger(strNum, 10);
} */

/* export function base64ToBlob(base64str: string, mimeType: string) {
  var sliceSize = 1024;
  var byteCharacters = atob(base64str);
  var bytesLength = byteCharacters.length;
  var slicesCount = Math.ceil(bytesLength / sliceSize);
  var byteArrays = new Array(slicesCount);

  for(var sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
    var begin = sliceIndex * sliceSize;
    var end = Math.min(begin + sliceSize, bytesLength);

    var bytes = new Array(end - begin);
    for(var offset = begin, i = 0; offset < end; ++i, ++offset) {
      bytes[i] = byteCharacters[offset].charCodeAt(0);
    }
    byteArrays[sliceIndex] = new Uint8Array(bytes);
  }

  return blobConstruct(byteArrays, mimeType);
}

export function dataUrlToBlob(url: string) {
  // var name = 'b64blob ' + url.length
  // console.time(name)
  var urlParts = url.split(',');
  var base64str = urlParts[1];
  var mimeType = urlParts[0].split(':')[1].split(';')[0];
  var blob = base64ToBlob(base64str, mimeType);
  // console.timeEnd(name)
  return blob;
} */

export function intToUint(val: number) {
  // return val < 0 ? val + 4294967296 : val; // 0 <= val <= Infinity
  return val >>> 0; // (4294967296 >>> 0) === 0; 0 <= val <= 4294967295
}

/* export function bytesFromBigInt(bigInt: BigInteger, len?: number) {
  var bytes = bigInt.toByteArray();

  if(len && bytes.length < len) {
    var padding = [];
    for(var i = 0, needPadding = len - bytes.length; i < needPadding; i++) {
      padding[i] = 0;
    }
    if(bytes instanceof ArrayBuffer) {
      bytes = bufferConcat(padding, bytes);
    } else {
      bytes = padding.concat(bytes);
    }
  } else {
    while (!bytes[0] && (!len || bytes.length > len)) {
      bytes = bytes.slice(1);
    }
  }

  return bytes;
} */

export function longFromInts(high: number, low: number): string {
  //let perf = performance.now();
  //let str = bigint(high).shiftLeft(32).add(bigint(low)).toString(10);
  //console.log('longFromInts jsbn', performance.now() - perf);
  high = intToUint(high);
  low = intToUint(low);
  
  //perf = performance.now();
  const bigInt = str2bigInt(high.toString(16), 16, 32);//int2bigInt(high, 64, 64);
  //console.log('longFromInts construct high', bigint(high).toString(10), bigInt2str(bigInt, 10));
  leftShift_(bigInt, 32);
  //console.log('longFromInts shiftLeft', bigint(high).shiftLeft(32).toString(10), bigInt2str(bigInt, 10));
  add_(bigInt, str2bigInt(low.toString(16), 16, 32));
  const _str = bigInt2str(bigInt, 10);

  //console.log('longFromInts leemon', performance.now() - perf);

  //console.log('longFromInts', high, low, str, _str, str === _str);

  return _str;
}

export function sortLongsArray(arr: string[]) {
  return arr.map(long => {
    return str2bigInt(long, 10);
  }).sort((a, b) => {
    return cmp(a, b);
  }).map(bigInt => {
    return bigInt2str(bigInt, 10);
  });
}

export function addPadding<T extends number[] | ArrayBuffer | Uint8Array>(
  bytes: T, 
  blockSize: number = 16, 
  zeroes?: boolean, 
  blockSizeAsTotalLength = false, 
  prepend = false
): T {
  const len = (bytes as ArrayBuffer).byteLength || (bytes as Uint8Array).length;
  const needPadding = blockSizeAsTotalLength ? blockSize - len : blockSize - (len % blockSize);
  if(needPadding > 0 && needPadding < blockSize) {
    ////console.log('addPadding()', len, blockSize, needPadding);
    const padding = new Uint8Array(needPadding);
    if(zeroes) {
      for(let i = 0; i < needPadding; ++i) {
        padding[i] = 0;
      }
    } else {
      padding.randomize();
    }

    if(bytes instanceof ArrayBuffer) {
      return (prepend ? bufferConcats(padding, bytes) : bufferConcats(bytes, padding)).buffer as T;
    } else if(bytes instanceof Uint8Array) {
      return (prepend ? bufferConcats(padding, bytes) : bufferConcats(bytes, padding)) as T;
    } else {
      // @ts-ignore
      return (prepend ? [...padding].concat(bytes) : bytes.concat([...padding])) as T;
    }
  }

  return bytes;
}
