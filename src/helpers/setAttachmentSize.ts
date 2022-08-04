/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {PhotoSize, WebDocument} from '../layer';
import {REPLIES_HIDDEN_CHANNEL_ID} from '../lib/mtproto/mtproto_config';
import {MyDocument} from '../lib/appManagers/appDocsManager';
import {MyPhoto} from '../lib/appManagers/appPhotosManager';
import choosePhotoSize from '../lib/appManagers/utils/photos/choosePhotoSize';
import {MediaSize, makeMediaSize} from './mediaSize';
import isWebDocument from '../lib/appManagers/utils/webDocs/isWebDocument';

export default function setAttachmentSize(
  photo: MyPhoto | MyDocument | WebDocument,
  element: HTMLElement | SVGForeignObjectElement,
  boxWidth: number,
  boxHeight: number,
  noZoom = true,
  message?: any,
  pushDocumentSize?: boolean,
  photoSize?: ReturnType<typeof choosePhotoSize>
) {
  const _isWebDocument = isWebDocument(photo);
  // if(_isWebDocument && pushDocumentSize === undefined) {
  //   pushDocumentSize = true;
  // }

  if(!photoSize) {
    photoSize = choosePhotoSize(photo, boxWidth, boxHeight, undefined, pushDocumentSize);
  }
  // console.log('setAttachmentSize', photo, photo.sizes[0].bytes, div);

  let size: MediaSize;
  const isDocument = photo._ === 'document';
  if(isDocument || _isWebDocument) {
    size = makeMediaSize(photo.w || (photoSize as PhotoSize.photoSize).w || 512, photo.h || (photoSize as PhotoSize.photoSize).h || 512);
  } else {
    size = makeMediaSize((photoSize as PhotoSize.photoSize).w || 100, (photoSize as PhotoSize.photoSize).h || 100);
  }

  let boxSize = makeMediaSize(boxWidth, boxHeight);

  boxSize = size = size.aspect(boxSize, noZoom);

  let isFit = true;

  if(!isDocument || ['video', 'gif'].includes(photo.type) || _isWebDocument) {
    if(boxSize.width < 200 && boxSize.height < 200) { // make at least one side this big
      boxSize = size = size.aspectCovered(makeMediaSize(200, 200));
    }

    if(message &&
      (message.message ||
        message.reply_to_mid ||
        message.media.webpage ||
        (message.replies && message.replies.pFlags.comments && message.replies.channel_id.toChatId() !== REPLIES_HIDDEN_CHANNEL_ID)
      )
    ) { // make sure that bubble block is human-readable
      if(boxSize.width < 320) {
        boxSize = makeMediaSize(320, boxSize.height);
        isFit = false;
      }
    }

    if(isFit && boxSize.width < 120 && message) { // if image is too narrow
      boxSize = makeMediaSize(120, boxSize.height);
      isFit = false;
    }
  }

  // if(element instanceof SVGForeignObjectElement) {
  //   element.setAttributeNS(null, 'width', '' + w);
  //   element.setAttributeNS(null, 'height', '' + h);

  //   //console.log('set dimensions to svg element:', element, w, h);
  // } else {
  element.style.width = boxSize.width + 'px';
  element.style.height = boxSize.height + 'px';
  // }

  return {photoSize, size, isFit};
}
