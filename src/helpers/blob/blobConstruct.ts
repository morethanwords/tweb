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

import blobSafeMimeType from "./blobSafeMimeType";

export default function blobConstruct<T extends Uint8Array | string>(blobParts: Array<T> | T, mimeType: string = ''): Blob {
  if(!Array.isArray(blobParts)) {
    blobParts = [blobParts];
  }

  let blob;
  const safeMimeType = blobSafeMimeType(mimeType);
  try {
    blob = new Blob(blobParts, {type: safeMimeType});
  } catch(e) {
    // @ts-ignore
    let bb = new BlobBuilder;
    blobParts.forEach((blobPart: any) => {
      bb.append(blobPart);
    });
    blob = bb.getBlob(safeMimeType);
  }
  return blob;
}
