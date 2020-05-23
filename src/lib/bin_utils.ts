/*!
 * Webogram v0.7.0 - messaging web application for MTProto
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

// @ts-ignore
import {BigInteger, SecureRandom} from 'jsbn';

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

var _logTimer = Date.now();
export function dT () {
  return '[' + ((Date.now() - _logTimer) / 1000).toFixed(3) + ']'
}

export function isObject(object: any) {
  return typeof(object) === 'object' && object !== null;
}

export function bigint(num: number) {
  return new BigInteger(num.toString(16), 16);
}

export function bigStringInt(strNum: string) {
  return new BigInteger(strNum, 10);
}

export function bytesToHex(bytes: any) {
  bytes = bytes || [];
  var arr = [];
  for(var i = 0; i < bytes.length; i++) {
    arr.push((bytes[i] < 16 ? '0' : '') + (bytes[i] || 0).toString(16));
  }
  return arr.join('');
}

export function bytesFromHex(hexString: string) {
  var len = hexString.length,
    i;
  var start = 0;
  var bytes = [];

  if(hexString.length % 2) {
    bytes.push(parseInt(hexString.charAt(0), 16));
    start++;
  }

  for(i = start; i < len; i += 2) {
    bytes.push(parseInt(hexString.substr(i, 2), 16));
  }

  return bytes;
}

export function bytesToBase64(bytes: number[] | Uint8Array) {
  var mod3
  var result = ''

  for (var nLen = bytes.length, nUint24 = 0, nIdx = 0; nIdx < nLen; nIdx++) {
    mod3 = nIdx % 3
    nUint24 |= bytes[nIdx] << (16 >>> mod3 & 24)
    if (mod3 === 2 || nLen - nIdx === 1) {
      result += String.fromCharCode(
        uint6ToBase64(nUint24 >>> 18 & 63),
        uint6ToBase64(nUint24 >>> 12 & 63),
        uint6ToBase64(nUint24 >>> 6 & 63),
        uint6ToBase64(nUint24 & 63)
      )
      nUint24 = 0
    }
  }

  return result.replace(/A(?=A$|$)/g, '=')
}

export function uint6ToBase64(nUint6: number) {
  return nUint6 < 26
    ? nUint6 + 65
    : nUint6 < 52
      ? nUint6 + 71
      : nUint6 < 62
        ? nUint6 - 4
        : nUint6 === 62
          ? 43
          : nUint6 === 63
            ? 47
            : 65
}

export function base64ToBlob(base64str: string, mimeType: string) {
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
}

export function blobConstruct(blobParts: any, mimeType: string = '') {
  var blob;
  var safeMimeType = blobSafeMimeType(mimeType);
  try {
    blob = new Blob(blobParts, {type: safeMimeType});
  } catch(e) {
    // @ts-ignore
    var bb = new BlobBuilder;
    blobParts.forEach(function(blobPart: any) {
      bb.append(blobPart);
    });
    blob = bb.getBlob(safeMimeType);
  }
  return blob;
}

export function blobSafeMimeType(mimeType: string) {
  if([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
  ].indexOf(mimeType) === -1) {
    return 'application/octet-stream';
  }

  return mimeType;
}

export function bytesCmp(bytes1: number[] | Uint8Array, bytes2: number[] | Uint8Array) {
  var len = bytes1.length;
  if(len != bytes2.length) {
    return false;
  }

  for(var i = 0; i < len; i++) {
    if(bytes1[i] != bytes2[i]) {
      return false;
    }
  }

  return true;
}

export function bytesXor(bytes1: number[] | Uint8Array, bytes2: number[] | Uint8Array) {
  var len = bytes1.length;
  var bytes = [];

  for (var i = 0; i < len; ++i) {
    bytes[i] = bytes1[i] ^ bytes2[i];
  }

  return bytes;
}

export function bytesFromBigInt(bigInt: BigInteger, len?: number) {
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
}

export function bytesToArrayBuffer(b: Iterable<number>) {
  return (new Uint8Array(b)).buffer;
}

export function convertToArrayBuffer(bytes: any | ArrayBuffer | Uint8Array) {
  // Be careful with converting subarrays!!
  if(bytes instanceof ArrayBuffer) {
    return bytes;
  }
  if(bytes.buffer !== undefined &&
    bytes.buffer.byteLength == bytes.length * bytes.BYTES_PER_ELEMENT) {
    return bytes.buffer;
  }
  return bytesToArrayBuffer(bytes);
}

export function convertToUint8Array(bytes: any) {
  if(bytes.buffer !== undefined) {
    return bytes;
  }

  return new Uint8Array(bytes);
}

export function convertToByteArray(bytes: any) {
  if(Array.isArray(bytes)) {
    return bytes;
  }

  bytes = convertToUint8Array(bytes);
  var newBytes = [];
  for(var i = 0, len = bytes.length; i < len; i++) {
    newBytes.push(bytes[i]);
  }

  return newBytes;
}

export function bytesFromArrayBuffer(buffer: ArrayBuffer) {
  var len = buffer.byteLength;
  var byteView = new Uint8Array(buffer);
  var bytes = [];

  for(var i = 0; i < len; ++i) {
    bytes[i] = byteView[i];
  }

  return bytes;
}

export function bufferConcat(buffer1: any, buffer2: any) {
  var l1 = buffer1.byteLength || buffer1.length;
  var l2 = buffer2.byteLength || buffer2.length;
  var tmp = new Uint8Array(l1 + l2);
  tmp.set(buffer1 instanceof ArrayBuffer ? new Uint8Array(buffer1) : buffer1, 0);
  tmp.set(buffer2 instanceof ArrayBuffer ? new Uint8Array(buffer2) : buffer2, l1);

  return tmp.buffer;
}

export function bufferConcats(...args: any[]) {
  let length = 0;
  args.forEach(b => length += b.byteLength || b.length);

  var tmp = new Uint8Array(length);
  
  let lastLength = 0;
  args.forEach(b => {
    tmp.set(b instanceof ArrayBuffer ? new Uint8Array(b) : b, lastLength);
    lastLength += b.byteLength || b.length;
  });

  return tmp/* .buffer */;
}

export function longToInts(sLong: string) {
  var divRem = bigStringInt(sLong).divideAndRemainder(bigint(0x100000000));

  return [divRem[0].intValue(), divRem[1].intValue()];
}

export function bytesFromWords(wordArray: {words: number[] | Uint8Array | Uint32Array, sigBytes: number}) {
  var words = wordArray.words;
  var sigBytes = wordArray.sigBytes;
  var bytes = [];

  for(var i = 0; i < sigBytes; i++) {
    bytes.push((words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
  }

  return bytes;
}

export function bytesFromWordss(input: Uint32Array) {
  var o = [];
  for(var i = 0; i < input.length * 4; i++) {
    o.push((input[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
  }

  return o;
}

export function bytesToWordss(input: ArrayBuffer | Uint8Array) {
  let bytes: Uint8Array;
  if(input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else bytes = input;

  var len = bytes.length;
  var words: number[] = [];
  var i;
  for(i = 0; i < len; i++) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }

  return new Uint32Array(words);
}

export function longToBytes(sLong: string) {
  return bytesFromWords({words: longToInts(sLong), sigBytes: 8}).reverse();
}

export function longFromInts(high: number, low: number) {
  return bigint(high).shiftLeft(32).add(bigint(low)).toString(10);
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
      (new SecureRandom()).nextBytes(padding);
    }

    if(bytes instanceof ArrayBuffer) {
      bytes = prepend ? bufferConcat(padding, bytes) : bufferConcat(bytes, padding);
    } else if(bytes instanceof Uint8Array) {
      let _bytes = new Uint8Array(bytes.length + padding.length);
      if(prepend) {
        _bytes.set(padding);
        _bytes.set(bytes, padding.length);
      } else {
        _bytes.set(bytes);
        _bytes.set(padding, bytes.length);
      }
      
      bytes = _bytes;
    } else {
      bytes = prepend ? padding.concat(bytes) : bytes.concat(padding);
    }
  }

  return bytes;
}

export function nextRandomInt(maxValue: number) {
  return Math.floor(Math.random() * maxValue);
}
