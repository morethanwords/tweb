export function bytesToHex(bytes: ArrayLike<number>) {
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

export function bytesCmp(bytes1: number[] | Uint8Array, bytes2: number[] | Uint8Array) {
  var len = bytes1.length;
  if(len !== bytes2.length) {
    return false;
  }

  for(var i = 0; i < len; i++) {
    if(bytes1[i] !== bytes2[i]) {
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

export function bytesToArrayBuffer(b: number[]) {
  return (new Uint8Array(b)).buffer;
}

export function convertToArrayBuffer(bytes: any | ArrayBuffer | Uint8Array) {
  // Be careful with converting subarrays!!
  if(bytes instanceof ArrayBuffer) {
    return bytes;
  }
  if(bytes.buffer !== undefined &&
    bytes.buffer.byteLength === bytes.length * bytes.BYTES_PER_ELEMENT) {
    return bytes.buffer;
  }
  return bytesToArrayBuffer(bytes);
}

export function convertToUint8Array(bytes: Uint8Array | number[]): Uint8Array {
  if((bytes as Uint8Array).buffer !== undefined) {
    return bytes as Uint8Array;
  }

  return new Uint8Array(bytes);
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