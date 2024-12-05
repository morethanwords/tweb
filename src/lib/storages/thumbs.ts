/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {InputWebFileLocation, WebDocument} from '../../layer';
import type {MyDocument} from '../appManagers/appDocsManager';
import type {MyPhoto} from '../appManagers/appPhotosManager';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';
import {THUMB_TYPE_FULL} from '../mtproto/mtproto_config';
import generateEmptyThumb from './utils/thumbs/generateEmptyThumb';
import getStickerThumbKey from './utils/thumbs/getStickerThumbKey';
import getThumbKey from './utils/thumbs/getThumbKey';
import {AppManager} from '../appManagers/manager';

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

const thumbFullSize = THUMB_TYPE_FULL;

export type ThumbStorageMedia = MyPhoto | MyDocument | WebDocument | InputWebFileLocation;

export type StickerCachedThumbs = {
  [docIdAndToneIndex: DocId]: StickerCachedThumb
};
export type StickerCachedThumb = {
  url: string,
  w: number,
  h: number
};

export default class ThumbsStorage extends AppManager {
  private thumbsCache: ThumbsCache = {};
  private stickerCachedThumbs: StickerCachedThumbs = {};

  public getCacheContext(
    media: ThumbStorageMedia,
    thumbSize: string = thumbFullSize,
    key = getThumbKey(media)
  ): ThumbCache {
    /* if(media._ === 'photo' && thumbSize !== 'i') {
      thumbSize = thumbFullSize;
    } */

    const cache = this.thumbsCache[key] ??= {};
    return cache[thumbSize] ??= generateEmptyThumb(thumbSize);
  }

  private mirrorCacheContext(key: string, thumbSize: string, value?: ThumbCache) {
    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name: 'thumbs',
      // key: [key, thumbSize].filter(Boolean).join('.'),
      key: joinDeepPath(key, thumbSize),
      value,
      accountNumber: this.getAccountNumber()
    });
  }

  private mirrorStickerThumb(key: string, value?: StickerCachedThumb) {
    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name: 'stickerThumbs',
      key,
      value,
      accountNumber: this.getAccountNumber()
    });
  }

  public mirrorAll(port?: MessageEventSource) {
    const instance = MTProtoMessagePort.getInstance<false>();
    instance.invokeVoid('mirror', {
      name: 'thumbs',
      value: this.thumbsCache,
      accountNumber: this.getAccountNumber()
    }, port);

    instance.invokeVoid('mirror', {
      name: 'stickerThumbs',
      value: this.stickerCachedThumbs,
      accountNumber: this.getAccountNumber()
    }, port);
  }

  public setCacheContextURL(
    media: ThumbStorageMedia,
    thumbSize: string = thumbFullSize,
    url: string,
    downloaded: number = 0,
    key = getThumbKey(media)
  ) {
    const cacheContext = this.getCacheContext(media, thumbSize, key);
    cacheContext.url = url;
    cacheContext.downloaded = downloaded;
    this.mirrorCacheContext(key, thumbSize, cacheContext);
    return cacheContext;
  }

  public deleteCacheContext(
    media: ThumbStorageMedia,
    thumbSize: string = thumbFullSize,
    key = getThumbKey(media)
  ) {
    const cache = this.thumbsCache[key];
    if(cache) {
      this.mirrorCacheContext(key, thumbSize);
      delete cache[thumbSize];
    }
  }

  public getStickerCachedThumb(docId: DocId, toneIndex: number | string) {
    return this.stickerCachedThumbs[getStickerThumbKey(docId, toneIndex)];
  }

  public saveStickerPreview(docId: DocId, blob: Blob, width: number, height: number, toneIndex: number | string) {
    const key = getStickerThumbKey(docId, toneIndex);
    const thumb = this.stickerCachedThumbs[key];
    if(thumb && thumb.w >= width && thumb.h >= height) {
      return;
    }

    const cache = this.stickerCachedThumbs[key] = {
      url: URL.createObjectURL(blob),
      w: width,
      h: height
    };

    this.mirrorStickerThumb(key, cache);
  }

  public clearColoredStickerThumbs() {
    for(const key in this.stickerCachedThumbs) {
      const [, toneIndex] = key.split('-');
      if(toneIndex && isNaN(+toneIndex)) {
        const thumb = this.stickerCachedThumbs[key];
        URL.revokeObjectURL(thumb.url);
        delete this.stickerCachedThumbs[key];
        this.mirrorStickerThumb(key);
      }
    }
  }
}
