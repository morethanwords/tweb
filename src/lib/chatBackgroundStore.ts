import {DEFAULT_BACKGROUND_SLUG} from '@config/app';
import blur from '@helpers/blur';
import type {Document, WallPaper} from '@layer';

import type AppDownloadManagerInstance from '@lib/appDownloadManager';
import type {AppManagers} from '@lib/managers';
import CacheStorageController from '@lib/files/cacheStorage';
import StaticUtilityClass from '@lib/staticUtilityClass';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {
  addSharedObjectURLUpdateListener,
  createSharedObjectURL,
  pinObjectURL,
  releaseSharedObjectURL,
  setSharedObjectURL
} from '@helpers/objectUrl';
import {makeObjectUrlOwner, parseObjectUrlOwner} from '@helpers/objectUrlUtils';


namespace ChatBackgroundStore {
  export type BackgroundPromises = {
    [owner: string]: MaybePromise<string>
  };

  export type GetBackgroundArgs = {
    slug: string;
    canDownload?: boolean;
    blur?: boolean;

    managers?: AppManagers;
    appDownloadManager?: typeof AppDownloadManagerInstance;
  };

  export type SetBackgroundUrlToCacheArgs = {
    slug: string;
    url: string;
    blur?: boolean;
  };
}

class ChatBackgroundStore extends StaticUtilityClass {
  private static cacheStorage = new CacheStorageController('cachedBackgrounds');
  private static backgroundPromises: ChatBackgroundStore.BackgroundPromises = {};
  private static isListeningForObjectURLUpdates = false;

  private static ensureObjectURLUpdates() {
    if(this.isListeningForObjectURLUpdates) {
      return;
    }

    this.isListeningForObjectURLUpdates = true;
    addSharedObjectURLUpdateListener(({owner, url, previousUrl}) => {
      const details = parseObjectUrlOwner(owner);
      if(details?.namespace !== 'background') {
        return;
      }

      if(url === undefined) {
        if(this.backgroundPromises[owner] === previousUrl) {
          delete this.backgroundPromises[owner];
        }
      } else {
        this.backgroundPromises[owner] = url;
      }
    });
  }

  /**
   * Last-known wallpaper list, kept synchronously readable so the Chat Wallpaper picker can build
   * its grid (skeleton tiles) in the very first frame of the tab-open slide instead of waiting on
   * the async `getWallPapers` round-trip. Warmed by `preloadWallPapers` (General Settings) and
   * refreshed by the picker on every open.
   */
  public static cachedWallPapers: WallPaper[];

  public static getWallPaperStorageUrl(slug: string, blur?: boolean) {
    return `backgrounds/${slug}${blur ? '?blur' : ''}`;
  }

  public static hasWallPaperStorageUrl(slug: string, blur?: boolean) {
    const storageUrl = this.getWallPaperStorageUrl(slug, blur);
    return this.cacheStorage.has(storageUrl);
  }

  private static getBackgroundObjectUrlOwner(storageUrl: string) {
    return makeObjectUrlOwner('background', getCurrentAccount(), storageUrl);
  }

  public static getBackground({
    slug,
    canDownload,
    blur,

    managers,
    appDownloadManager
  }: ChatBackgroundStore.GetBackgroundArgs) {
    this.ensureObjectURLUpdates();
    const storageUrl = this.getWallPaperStorageUrl(slug, blur);
    const owner = this.getBackgroundObjectUrlOwner(storageUrl);
    const existing = this.backgroundPromises[owner];
    if(existing) {
      return existing;
    }

    const canReallyDownload = canDownload && !!managers && !!appDownloadManager;

    const promise: Promise<string> = this.cacheStorage.getFile(storageUrl).then(async(blob) => {
      const url = await createSharedObjectURL(blob, owner);
      const current = this.backgroundPromises[owner];
      // * superseded by a concurrent setBackgroundUrlToCache — keep that value;
      // * a plain delete mid-flight keeps our fresh URL valid
      if(current !== promise && current !== undefined) {
        if(current !== url) {
          releaseSharedObjectURL(owner, url);
        }
        return current;
      }

      return this.backgroundPromises[owner] = url;
    }, canReallyDownload ? async(err) => {
      if((err as ApiError).type !== 'NO_ENTRY_FOUND') {
        throw err;
      }

      const wallPaper = await managers.appThemesManager.getWallPaperBySlug(slug);
      let url = await appDownloadManager.downloadMediaURL({
        media: (wallPaper as WallPaper.wallPaper).document as Document.document
      });

      if(blur) {
        url = await this.blurWallPaperImage(url);
      }

      this.saveWallPaperToCache(slug, url, blur);
      const current = this.backgroundPromises[owner];
      if(current !== promise && current !== undefined) {
        return current;
      }

      setSharedObjectURL(owner, url);
      return this.backgroundPromises[owner] = url;
    } : undefined);
    // * a transient failure must not stay cached — let the next call retry
    promise.catch(() => {
      if(this.backgroundPromises[owner] === promise) {
        delete this.backgroundPromises[owner];
      }
    });
    this.backgroundPromises[owner] = promise;
    return promise;
  }

  public static blurWallPaperImage(url: string) {
    const {canvas, promise} = blur(url, 12, 4);
    return promise.then(() => {
      return canvas.toDataURL();
    });
  }

  public static async saveWallPaperToCache(slug: string, url: string, blur?: boolean) {
    if(!slug || slug === DEFAULT_BACKGROUND_SLUG) {
      return;
    }

    const release = pinObjectURL(url);
    try {
      const response = await fetch(url);
      const clonedResponse = response.clone();
      const blob = await response.blob();

      const result = await this.cacheStorage.save({
        entryName: this.getWallPaperStorageUrl(slug, blur),
        response: clonedResponse,
        size: blob.size
      });
      return result;
    } finally {
      release();
    }
  }

  public static setBackgroundUrlToCache({slug, url, blur}: ChatBackgroundStore.SetBackgroundUrlToCacheArgs) {
    this.ensureObjectURLUpdates();
    const storageUrl = this.getWallPaperStorageUrl(slug, blur);
    const owner = this.getBackgroundObjectUrlOwner(storageUrl);
    setSharedObjectURL(owner, url);
    this.backgroundPromises[owner] = url;
  }

  public static deleteBackgroundUrlFromCache({slug, blur}: Omit<ChatBackgroundStore.SetBackgroundUrlToCacheArgs, 'url'>) {
    const storageUrl = this.getWallPaperStorageUrl(slug, blur);
    const owner = this.getBackgroundObjectUrlOwner(storageUrl);
    const url = this.backgroundPromises[owner];
    delete this.backgroundPromises[owner];

    if(typeof(url) === 'string') {
      releaseSharedObjectURL(owner, url);
    }
  }

  /**
   * Warm the Chat Wallpaper picker ahead of time without materializing object URLs for every
   * wallpaper. `downloadMediaVoid` fills the persistent media cache while keeping the full Blob
   * out of this tab's resolved-download cache; a shared URL is created only when a tile is used.
   */
  public static async preloadWallPapers(
    managers: AppManagers,
    appDownloadManager: typeof AppDownloadManagerInstance
  ) {
    let wallPapers: WallPaper[];
    try {
      wallPapers = await managers.appThemesManager.getWallPapers();
    } catch(err) {
      return; // best-effort prefetch — give up silently if the list can't be fetched
    }

    // Keep the synchronous list cache warm so the picker can render its grid without an async wait.
    this.cachedWallPapers = wallPapers;

    for(const wallPaper of wallPapers) {
      const {slug, document} = wallPaper as WallPaper.wallPaper;
      // Color-only wallpapers have no slug; the default pattern is bundled — neither downloads.
      if(!slug || slug === DEFAULT_BACKGROUND_SLUG || !document) {
        continue;
      }

      // fire-and-forget: warm all wallpapers in parallel
      Promise.resolve(appDownloadManager.downloadMediaVoid({media: document as Document.document})).catch(() => {});
    }
  }
}

export default ChatBackgroundStore;
