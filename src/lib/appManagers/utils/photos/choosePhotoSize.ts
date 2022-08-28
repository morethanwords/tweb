/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../appDocsManager';
import type {MyPhoto} from '../../appPhotosManager';
import type {PhotoSize, VideoSize, WebDocument} from '../../../../layer';
import calcImageInBox from '../../../../helpers/calcImageInBox';
import {THUMB_TYPE_FULL} from '../../../mtproto/mtproto_config';

export default function choosePhotoSize(
  photo: MyPhoto | MyDocument | WebDocument,
  boxWidth = 0,
  boxHeight = 0,
  useBytes = false,
  pushDocumentSize = false
) {
  if(window.devicePixelRatio > 1) {
    boxWidth *= 2;
    boxHeight *= 2;
  }

  /*
  s box 100x100
  m box 320x320
  x box 800x800
  y box 1280x1280
  w box 2560x2560
  a crop  160x160
  b crop  320x320
  c crop  640x640
  d crop  1280x1280 */

  let sizes: PhotoSize[] = (photo as MyPhoto).sizes || (photo as MyDocument).thumbs as PhotoSize[];
  let bestPhotoSize: typeof sizes[0] = {_: 'photoSizeEmpty', type: THUMB_TYPE_FULL};
  if(pushDocumentSize && sizes && photo._ !== 'photo') {
    sizes = sizes.concat({
      _: 'photoSize',
      w: photo.w,
      h: photo.h,
      size: photo.size,
      type: THUMB_TYPE_FULL
    });
  }

  if(sizes?.length) {
    for(let i = 0, length = sizes.length; i < length; ++i) {
      const photoSize = sizes[i];
      if(!('w' in photoSize) && !('h' in photoSize)) continue;

      bestPhotoSize = photoSize;

      const size = calcImageInBox(photoSize.w, photoSize.h, boxWidth, boxHeight);
      if(size.width >= boxWidth || size.height >= boxHeight) {
        break;
      }
    }

    if(useBytes && bestPhotoSize._ === 'photoSizeEmpty' && sizes[0]._ === 'photoStrippedSize') {
      bestPhotoSize = sizes[0];
    }
  }

  return bestPhotoSize;
}
