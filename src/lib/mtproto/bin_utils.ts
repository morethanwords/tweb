import { bufferConcats } from '../../helpers/bytes';
import { add_, bigInt2str, cmp, leftShift_, str2bigInt } from '../../vendor/leemon';
import { nextRandomInt } from '../../helpers/random';

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

export function addPadding(bytes: any, blockSize: number = 16, zeroes?: boolean, full = false, prepend = false) {
  let len = bytes.byteLength || bytes.length;
  let needPadding = blockSize - (len % blockSize);
  if(needPadding > 0 && (needPadding < blockSize || full)) {
    ////console.log('addPadding()', len, blockSize, needPadding);
    let padding = new Array(needPadding);
    if(zeroes) {
      for(let i = 0; i < needPadding; i++) {
        padding[i] = 0;
      }
    } else {
      for(let i = 0; i < padding.length; ++i) {
        padding[i] = nextRandomInt(255);
      }
    }

    if(bytes instanceof ArrayBuffer) {
      bytes = (prepend ? bufferConcats(padding, bytes) : bufferConcats(bytes, padding)).buffer;
    } else if(bytes instanceof Uint8Array) {
      bytes = prepend ? bufferConcats(padding, bytes) : bufferConcats(bytes, padding);
    } else {
      bytes = prepend ? padding.concat(bytes) : bytes.concat(padding);
    }
  }

  return bytes;
}
