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

import toArray from '../array/toArray';
import blobSafeMimeType from './blobSafeMimeType';

export default function blobConstruct<T extends Uint8Array | string>(blobParts: Array<T> | T, mimeType: string = ''): Blob {
  blobParts = toArray(blobParts);
  const safeMimeType = blobSafeMimeType(mimeType);
  const blob = new Blob(blobParts, {type: safeMimeType});
  return blob;
}
