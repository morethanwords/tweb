import type {InputWebFileLocation, WebDocument} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyPhoto} from '@appManagers/appPhotosManager';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import {THUMB_TYPE_FULL} from '@appManagers/constants';
import generateEmptyThumb from '@lib/storages/utils/thumbs/generateEmptyThumb';
import getStickerThumbKey from '@lib/storages/utils/thumbs/getStickerThumbKey';
import getThumbKey from '@lib/storages/utils/thumbs/getThumbKey';
import {AppManager} from '@appManagers/manager';
import SharedObjectUrlCache from '@lib/mainWorker/sharedObjectUrlCache';
import {
  isObjectURL,
  makeObjectUrlOwner,
  reconcileObjectURLCacheValue
} from '@helpers/objectUrlUtils';

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
const THUMB_OBJECT_URL_CACHE_LIMIT = 128;
const THUMB_OBJECT_URL_CACHE_BYTES_LIMIT = 32 * 1024 * 1024;
const STICKER_THUMB_OBJECT_URL_CACHE_LIMIT = 64;
const STICKER_THUMB_OBJECT_URL_CACHE_BYTES_LIMIT = 8 * 1024 * 1024;

export type ThumbStorageMedia = MyPhoto | MyDocument | WebDocument | InputWebFileLocation;

export type StickerCachedThumbs = {
  [docIdAndToneIndex: DocId]: StickerCachedThumb
};
export type StickerCachedThumb = {
  url: string,
  w: number,
  h: number
};

type ThumbObjectUrlCacheKey = {
  key: string,
  thumbSize: string
};

export default class ThumbsStorage extends AppManager {
  private thumbsCache: ThumbsCache = {};
  private stickerCachedThumbs: StickerCachedThumbs = {};
  private objectURLCache = new SharedObjectUrlCache<ThumbObjectUrlCacheKey>({
    getOwner: ({key, thumbSize}) => this.getCacheContextOwner(key, thumbSize),
    maxBytes: THUMB_OBJECT_URL_CACHE_BYTES_LIMIT,
    maxURLs: THUMB_OBJECT_URL_CACHE_LIMIT,
    onEvict: ({key, thumbSize}, url) => this.invalidateCacheContext(key, thumbSize, url)
  });
  private stickerObjectURLCache = new SharedObjectUrlCache<string>({
    getOwner: (key) => this.getStickerThumbOwner(key),
    maxBytes: STICKER_THUMB_OBJECT_URL_CACHE_BYTES_LIMIT,
    maxURLs: STICKER_THUMB_OBJECT_URL_CACHE_LIMIT,
    onEvict: (key, url) => this.invalidateStickerThumb(key, url)
  });

  private getCacheContextOwner(key: string, thumbSize: string) {
    return makeObjectUrlOwner('thumb', this.getAccountNumber(), key, thumbSize);
  }

  private getStickerThumbOwner(key: string) {
    return makeObjectUrlOwner('sticker-thumb', this.getAccountNumber(), key);
  }

  private mirrorObjectURLValue(
    name: 'stickerThumbs' | 'thumbs',
    key: string,
    value?: StickerCachedThumb | ThumbCache,
    previousUrl?: string
  ) {
    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name,
      key,
      value,
      ...(previousUrl === undefined ? {} : {previousUrl}),
      accountNumber: this.getAccountNumber()
    });
  }

  public getCacheContext(
    media: ThumbStorageMedia,
    thumbSize: string = thumbFullSize,
    key = getThumbKey(media)
  ): ThumbCache {
    /* if(media._ === 'photo' && thumbSize !== 'i') {
      thumbSize = thumbFullSize;
    } */

    const context = this.thumbsCache[key]?.[thumbSize] || generateEmptyThumb(thumbSize);
    if(isObjectURL(context.url)) {
      this.objectURLCache.touch({key, thumbSize});
    }
    return context;
  }

  private mirrorCacheContext(
    key: string,
    thumbSize: string,
    value?: ThumbCache,
    previousUrl?: string
  ) {
    this.mirrorObjectURLValue('thumbs', joinDeepPath(key, thumbSize), value, previousUrl);
  }

  private mirrorStickerThumb(
    key: string,
    value?: StickerCachedThumb,
    previousUrl?: string
  ) {
    this.mirrorObjectURLValue('stickerThumbs', key, value, previousUrl);
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

  private updateCacheContext(
    key: string,
    thumbSize: string,
    url: string,
    downloaded: number,
    previousUrl?: string
  ) {
    const cache = this.thumbsCache[key] ??= {};
    const cacheContext = cache[thumbSize] ??= generateEmptyThumb(thumbSize);
    cacheContext.url = url;
    cacheContext.downloaded = downloaded;
    this.mirrorCacheContext(key, thumbSize, cacheContext, this.forgettableURL(previousUrl));
    return cacheContext;
  }

  // * `previousUrl` in a mirror message means "this blob URL is being revoked,
  // * drop it from tab-side loaded-URL caches" — only send it when the URL
  // * really has no remaining owner (it may have been adopted by another key).
  private forgettableURL(url?: string) {
    return url && isObjectURL(url) && !this.objectURLCache.isURLOwned(url) ?
      url :
      undefined;
  }

  private invalidateCacheContext(key: string, thumbSize: string, expectedUrl?: string) {
    const cache = this.thumbsCache[key];
    const cacheContext = cache?.[thumbSize];
    if(!cacheContext || (expectedUrl !== undefined && cacheContext.url !== expectedUrl)) {
      return;
    }

    const previousUrl = cacheContext.url;
    reconcileObjectURLCacheValue(cacheContext);
    delete cache[thumbSize];
    if(!Object.keys(cache).length) {
      delete this.thumbsCache[key];
    }
    this.mirrorCacheContext(key, thumbSize, undefined, this.forgettableURL(previousUrl));
  }

  private invalidateStickerThumb(key: string, expectedUrl?: string) {
    const thumb = this.stickerCachedThumbs[key];
    if(!thumb || (expectedUrl !== undefined && thumb.url !== expectedUrl)) {
      return;
    }

    const previousUrl = thumb.url;
    reconcileObjectURLCacheValue(thumb);
    delete this.stickerCachedThumbs[key];
    this.mirrorStickerThumb(key, undefined, this.forgettableURL(previousUrl));
  }

  public setCacheContextURL(
    media: ThumbStorageMedia,
    thumbSize: string = thumbFullSize,
    url: string,
    downloaded: number = 0,
    key = getThumbKey(media)
  ) {
    const {previousUrl} = this.objectURLCache.adopt({key, thumbSize}, url, downloaded);
    return this.updateCacheContext(key, thumbSize, url, downloaded, previousUrl);
  }

  public setCacheContextBlob(
    media: ThumbStorageMedia,
    thumbSize: string = thumbFullSize,
    blob: Blob,
    downloaded: number = 0,
    key = getThumbKey(media),
    pinned = false
  ) {
    const {url, previousUrl} = this.objectURLCache.create({key, thumbSize}, blob, pinned);
    return this.updateCacheContext(key, thumbSize, url, downloaded, previousUrl);
  }

  public deleteCacheContext(
    media: ThumbStorageMedia,
    thumbSize: string = thumbFullSize,
    key = getThumbKey(media)
  ) {
    if(!this.objectURLCache.delete({key, thumbSize})) {
      this.invalidateCacheContext(key, thumbSize);
    }
  }

  public moveCacheContext(
    fromMedia: ThumbStorageMedia,
    toMedia: ThumbStorageMedia,
    fromThumbSize: string = thumbFullSize,
    toThumbSize: string = thumbFullSize,
    fromKey = getThumbKey(fromMedia),
    toKey = getThumbKey(toMedia)
  ) {
    const cacheContext = this.thumbsCache[fromKey]?.[fromThumbSize];
    if(fromKey === toKey && fromThumbSize === toThumbSize) {
      if(cacheContext && isObjectURL(cacheContext.url)) {
        this.objectURLCache.touch({key: fromKey, thumbSize: fromThumbSize});
      }
      return cacheContext;
    }

    if(!cacheContext) {
      this.objectURLCache.delete({key: fromKey, thumbSize: fromThumbSize});
      return;
    }

    const movedCacheContext = this.setCacheContextURL(
      toMedia,
      toThumbSize,
      cacheContext.url,
      cacheContext.downloaded,
      toKey
    );
    this.deleteCacheContext(fromMedia, fromThumbSize, fromKey);
    return movedCacheContext;
  }

  public getStickerCachedThumb(docId: DocId, toneIndex: number | string) {
    const key = getStickerThumbKey(docId, toneIndex);
    const thumb = this.stickerCachedThumbs[key];
    if(thumb) {
      this.stickerObjectURLCache.touch(key);
    }
    return thumb;
  }

  public saveStickerPreview(docId: DocId, blob: Blob, width: number, height: number, toneIndex: number | string) {
    const key = getStickerThumbKey(docId, toneIndex);
    const thumb = this.stickerCachedThumbs[key];
    if(thumb && thumb.w >= width && thumb.h >= height) {
      this.stickerObjectURLCache.touch(key);
      return;
    }

    const {url, previousUrl} = this.stickerObjectURLCache.create(key, blob);

    const next = {url, w: width, h: height};
    const cache = this.stickerCachedThumbs[key] = thumb ?
      reconcileObjectURLCacheValue(thumb, next) :
      next;

    this.mirrorStickerThumb(key, cache, this.forgettableURL(previousUrl));
  }

  public clearColoredStickerThumbs() {
    for(const key in this.stickerCachedThumbs) {
      const [, toneIndex] = key.split('-');
      if(toneIndex && isNaN(+toneIndex)) {
        if(!this.stickerObjectURLCache.delete(key, this.stickerCachedThumbs[key].url)) {
          this.invalidateStickerThumb(key);
        }
      }
    }
  }
}
