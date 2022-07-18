/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { WebDocument } from "../../layer";
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

export type ThumbStorageMedia = MyPhoto | MyDocument | WebDocument;

export default class ThumbsStorage {
  private thumbsCache: ThumbsCache = {};

  private getKey(media: ThumbStorageMedia) {
    return media._ + ((media as MyPhoto).id ?? (media as WebDocument).url);
  }

  public getCacheContext(media: ThumbStorageMedia, thumbSize: string = thumbFullSize): ThumbCache {
    /* if(media._ === 'photo' && thumbSize !== 'i') {
      thumbSize = thumbFullSize;
    } */

    const cache = this.thumbsCache[this.getKey(media)] ??= {};
    return cache[thumbSize] ??= {downloaded: 0, url: '', type: thumbSize};
  }

  public setCacheContextURL(media: ThumbStorageMedia, thumbSize: string = thumbFullSize, url: string, downloaded: number = 0) {
    const cacheContext = this.getCacheContext(media, thumbSize);
    cacheContext.url = url;
    cacheContext.downloaded = downloaded;
    return cacheContext;
  }

  public deleteCacheContext(media: ThumbStorageMedia, thumbSize: string = thumbFullSize) {
    const cache = this.thumbsCache[this.getKey(media)];
    if(cache) {
      delete cache[thumbSize];
    }
  }
}
