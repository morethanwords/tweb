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

export function readBlobAs(blob: Blob, method: 'readAsText'): Promise<string>;
export function readBlobAs(blob: Blob, method: 'readAsDataURL'): Promise<string>;
export function readBlobAs(blob: Blob, method: 'readAsArrayBuffer'): Promise<ArrayBuffer>;
export function readBlobAs(blob: Blob, method: 'readAsArrayBuffer' | 'readAsText' | 'readAsDataURL'): Promise<any> {
  return new Promise<any>((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('loadend', (e) => resolve(e.target.result));
    reader[method](blob);
  });
}

export function readBlobAsText(blob: Blob) {
  return readBlobAs(blob, 'readAsText');
}

export function readBlobAsDataURL(blob: Blob) {
  return readBlobAs(blob, 'readAsDataURL');
}

export function readBlobAsArrayBuffer(blob: Blob) {
  return readBlobAs(blob, 'readAsArrayBuffer');
}

export function readBlobAsUint8Array(blob: Blob) {
  return readBlobAsArrayBuffer(blob).then(buffer => new Uint8Array(buffer));
}

export function blobConstruct(blobParts: any, mimeType: string = ''): Blob {
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

// https://www.iana.org/assignments/media-types/media-types.xhtml
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
    'application/json',
    'application/pdf'
  ].indexOf(mimeType) === -1) {
    return 'application/octet-stream';
  }

  return mimeType;
}
