/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Message, MessageMedia, PhotoSize, WebDocument} from '../layer';
import {REPLIES_HIDDEN_CHANNEL_ID} from '../lib/mtproto/mtproto_config';
import {MyDocument} from '../lib/appManagers/appDocsManager';
import {MyPhoto} from '../lib/appManagers/appPhotosManager';
import choosePhotoSize from '../lib/appManagers/utils/photos/choosePhotoSize';
import {MediaSize, makeMediaSize} from './mediaSize';
import isWebDocument from '../lib/appManagers/utils/webDocs/isWebDocument';

export const EXPAND_TEXT_WIDTH = 320;
export const MIN_IMAGE_WIDTH = 120;
export const MIN_SIDE_SIZE = 200;
export const MIN_VIDEO_SIDE_SIZE = 368;

export default function setAttachmentSize({
  photo,
  element,
  boxWidth,
  boxHeight,
  noZoom = true,
  message,
  pushDocumentSize,
  photoSize,
  size,
  canHaveVideoPlayer
}: {
  photo?: MyPhoto | MyDocument | WebDocument,
  element: HTMLElement | SVGForeignObjectElement,
  boxWidth: number,
  boxHeight: number,
  noZoom?: boolean,
  message?: Message.message,
  pushDocumentSize?: boolean,
  photoSize?: ReturnType<typeof choosePhotoSize>,
  size?: MediaSize,
  canHaveVideoPlayer?: boolean
}) {
  const _isWebDocument = isWebDocument(photo);
  // if(_isWebDocument && pushDocumentSize === undefined) {
  //   pushDocumentSize = true;
  // }

  if(!photoSize && !size) {
    photoSize = choosePhotoSize(photo, boxWidth, boxHeight, undefined, pushDocumentSize);
  }
  // console.log('setAttachmentSize', photo, photo.sizes[0].bytes, div);

  const isDocument = photo?._ === 'document';
  if(size) {

  } else if(isDocument || _isWebDocument) {
    size = makeMediaSize(photo.w || (photoSize as PhotoSize.photoSize).w || 512, photo.h || (photoSize as PhotoSize.photoSize).h || 512);
  } else {
    size = makeMediaSize((photoSize as PhotoSize.photoSize).w || 100, (photoSize as PhotoSize.photoSize).h || 100);
  }

  let boxSize = makeMediaSize(boxWidth, boxHeight);

  boxSize = size = size.aspect(boxSize, noZoom);

  let isFit = true;

  if(!isDocument || ['video', 'gif'].includes(photo.type) || _isWebDocument) {
    const minSideSize = MIN_SIDE_SIZE;
    if(boxSize.width < minSideSize && boxSize.height < minSideSize) { // make at least one side this big
      boxSize = size = size.aspectCovered(makeMediaSize(minSideSize, minSideSize));
    }

    if(message &&
      (message.message ||
        message.factcheck ||
        message.reply_to_mid ||
        (message.media as MessageMedia.messageMediaWebPage).webpage ||
        (message.replies && message.replies.pFlags.comments && message.replies.channel_id.toChatId() !== REPLIES_HIDDEN_CHANNEL_ID)
      )
    ) { // make sure that bubble block is human-readable
      if(boxSize.width < EXPAND_TEXT_WIDTH) {
        boxSize = makeMediaSize(EXPAND_TEXT_WIDTH, boxSize.height);
        isFit = false;
      }
    }

    const minWidth = (photo as MyDocument)?.type === 'video' && canHaveVideoPlayer ? MIN_VIDEO_SIDE_SIZE : MIN_IMAGE_WIDTH;
    if(/* isFit &&  */boxSize.width < minWidth && message) { // if image is too narrow
      boxSize = makeMediaSize(minWidth, boxSize.height);
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
