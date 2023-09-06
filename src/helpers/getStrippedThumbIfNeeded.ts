/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../lib/appManagers/appDocsManager';
import type {MyPhoto} from '../lib/appManagers/appPhotosManager';
import type {ThumbCache} from '../lib/storages/thumbs';
import {THUMB_TYPE_FULL} from '../lib/mtproto/mtproto_config';
import getImageFromStrippedThumb from './getImageFromStrippedThumb';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import {PhotoSize} from '../layer';

export default function getMediaThumbIfNeeded({
  photo,
  cacheContext,
  useBlur,
  ignoreCache,
  onlyStripped
}: {
  photo: MyPhoto | MyDocument,
  cacheContext: ThumbCache,
  useBlur: boolean | number,
  ignoreCache?: boolean,
  onlyStripped?: boolean
}) {
  const isVideo = (['video', 'gif'] as MyDocument['type'][]).includes((photo as MyDocument).type);
  if(!cacheContext.downloaded || isVideo || ignoreCache) {
    if(
      photo._ === 'document' &&
      cacheContext.downloaded &&
      !ignoreCache &&
      (!isVideo || cacheContext.type !== THUMB_TYPE_FULL)
    ) {
      return null;
    }

    const sizes = (photo as MyPhoto).sizes || (photo as MyDocument).thumbs;
    const length = sizes?.length;
    if(!length) {
      return null;
    }

    let currentSizeIndex = -1;
    if(!onlyStripped) for(let i = length - 1; i >= 0; --i) {
      const size = sizes[i];
      if(size.type === cacheContext.type) {
        currentSizeIndex = i;
      } else if(currentSizeIndex) {
        const cacheContext = apiManagerProxy.getCacheContext(photo, size.type);
        if(cacheContext.downloaded) {
          return getImageFromStrippedThumb(photo, size as PhotoSize.photoCachedSize, false, cacheContext.url);
        }
      }
    }

    const thumb = sizes.find((size) => size._ === 'photoStrippedSize');
    if(thumb && ('bytes' in thumb)) {
      return getImageFromStrippedThumb(photo, thumb as any, useBlur);
    }
  }

  return null;
}
