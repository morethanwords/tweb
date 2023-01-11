/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {IS_SAFARI} from '../../environment/userAgent';
import bytesFromHex from './bytesFromHex';
import bytesToDataURL from './bytesToDataURL';
import convertToUint8Array from './convertToUint8Array';

const JPEG_HEADER_HEX = 'ffd8ffe000104a46494600010100000100010000ffdb004300281c1e231e19282321232d2b28303c64413c37373c7b585d4964918099968f808c8aa0b4e6c3a0aadaad8a8cc8ffcbdaeef5ffffff9bc1fffffffaffe6fdfff8ffdb0043012b2d2d3c353c76414176f8a58ca5f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8ffc00011080000000003012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00';

const JPEG_HEADER = bytesFromHex(JPEG_HEADER_HEX);
const JPEG_TAIL = bytesFromHex('ffd9');

export function getPreviewBytesFromURL(url: string) {
  const needle = 'base64,';
  const sliced = url.slice(url.indexOf(needle) + needle.length);
  const jpegBytes = [...atob(sliced)].map((char) => char.charCodeAt(0));

  return new Uint8Array(jpegBytes);
  // console.log('getPreviewBytesFromURL', bytesToHex(jpegBytes));

  // const n = JPEG_HEADER_HEX.slice(-10);
  // const one = jpegBytes[164];
  // const two = jpegBytes[166];

  // const body = jpegBytes.slice(bytesToHex(jpegBytes).indexOf(n) / 2 + n.length / 2/* JPEG_HEADER.length */, jpegBytes.length - JPEG_TAIL.length);
  // const original = new Uint8Array([
  //   0xFF,
  //   one,
  //   two,
  //   ...body
  // ]);

  // console.log(bytesToHex(body));

  // return original;
}

export default function getPreviewURLFromBytes(bytes: Uint8Array | number[], isSticker = false) {
  let arr: Uint8Array;
  if(!isSticker && bytes[0] === 0x1) {
    arr = new Uint8Array(JPEG_HEADER.concat(Array.from(bytes.slice(3)), JPEG_TAIL));
    arr[164] = bytes[1];
    arr[166] = bytes[2];
  } else {
    arr = convertToUint8Array(bytes);
  }

  let mimeType: string;
  if(isSticker) {
    mimeType = IS_SAFARI ? 'image/png' : 'image/webp';
  } else {
    mimeType = 'image/jpeg';
  }

  const dataURL = bytesToDataURL(arr, mimeType);
  return dataURL;
}
