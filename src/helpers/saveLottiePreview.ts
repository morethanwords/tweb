/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { MyDocument } from "../lib/appManagers/appDocsManager";
import rootScope from "../lib/rootScope";

const savingLottiePreview: {[docId: DocId]: {width: number, height: number}} = {};

export function isSavingLottiePreview(doc: MyDocument, toneIndex: number) {
  const key = doc.id + '-' + toneIndex;
  return !!savingLottiePreview[key];
}

export async function saveLottiePreview(doc: MyDocument, canvas: HTMLCanvasElement, toneIndex: number) {
  const key = doc.id + '-' + toneIndex;
  const {width, height} = canvas;
  let saving = savingLottiePreview[key];
  if(saving && saving.width >= width && saving.height >= height) {
    return;
  }

  saving = savingLottiePreview[key] = {
    width,
    height
  };

  const thumb = await rootScope.managers.appDocsManager.getLottieCachedThumb(doc.id, toneIndex);
  if(savingLottiePreview[key] !== saving) {
    return;
  }

  if(thumb && thumb.w >= width && thumb.h >= height) {
    return;
  }

  const promise = new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob));
  });
  
  const blob = await promise;
  if(savingLottiePreview[key] !== saving) {
    return;
  }

  //console.log('got lottie preview', doc, blob, URL.createObjectURL(blob));

  rootScope.managers.appDocsManager.saveLottiePreview(doc.id, blob, width, height, toneIndex);

  delete savingLottiePreview[key];

  /* const reader = new FileReader();
  reader.onloadend = (e) => {
    const uint8 = new Uint8Array(e.target.result as ArrayBuffer);
    const thumb: PhotoSize.photoStrippedSize = {
      _: 'photoStrippedSize',
      bytes: uint8,
      type: 'i'
    };

    doc.stickerSavedThumbWidth = canvas.width;
    doc.stickerSavedThumbHeight = canvas.width;

    defineNotNumerableProperties(thumb, ['url']);
    thumb.url = URL.createObjectURL(blob);
    doc.thumbs.findAndSplice((t) => t._ === thumb._);
    doc.thumbs.unshift(thumb);

    if(!webpWorkerController.isWebpSupported()) {
      doc.pFlags.stickerThumbConverted = true;
    }

    delete this.savingLottiePreview[doc.id];
  };
  reader.readAsArrayBuffer(blob); */
}
