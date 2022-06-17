/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { MyDocument } from "../appManagers/appDocsManager";
import type { MyPhoto } from "../appManagers/appPhotosManager";

export type ThumbCache = {
  downloaded: number, 
  url: string,
  type: string
};

export type ThumbsCache = {
  [key: string]: {
    [size: string]: ThumbCache
  }
};

const thumbFullSize = 'full';

export default class ThumbsStorage {
  private thumbsCache: ThumbsCache = {};

  public getCacheContext(media: MyPhoto | MyDocument, thumbSize: string = thumbFullSize): ThumbCache {
    /* if(media._ === 'photo' && thumbSize !== 'i') {
      thumbSize = thumbFullSize;
    } */

    const key = media._ + media.id;
    const cache = this.thumbsCache[key] ??= {};
    return cache[thumbSize] ??= {downloaded: 0, url: '', type: thumbSize};
  }

  public setCacheContextURL(media: MyPhoto | MyDocument, thumbSize: string = thumbFullSize, url: string, downloaded: number = 0) {
    const cacheContext = this.getCacheContext(media, thumbSize);
    cacheContext.url = url;
    cacheContext.downloaded = downloaded;
    return cacheContext;
  }

  public deleteCacheContext(media: MyPhoto | MyDocument, thumbSize: string = thumbFullSize) {
    const key = media._ + media.id;
    const cache = this.thumbsCache[key];
    if(cache) {
      delete cache[thumbSize];
    }
  }
}
