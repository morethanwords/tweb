/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../lib/appManagers/appDocsManager';
import type {MyPhoto} from '../lib/appManagers/appPhotosManager';
import {THUMB_TYPE_FULL} from '../lib/mtproto/mtproto_config';
import type {ThumbCache} from '../lib/storages/thumbs';
import getImageFromStrippedThumb from './getImageFromStrippedThumb';

export default function getStrippedThumbIfNeeded(photo: MyPhoto | MyDocument, cacheContext: ThumbCache, useBlur: boolean, ignoreCache = false) {
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
    const thumb = sizes?.length ? sizes.find((size) => size._ === 'photoStrippedSize') : null;
    if(thumb && ('bytes' in thumb)) {
      return getImageFromStrippedThumb(photo, thumb as any, useBlur);
    }
  }

  return null;
}
