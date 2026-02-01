import {DEFAULT_BACKGROUND_SLUG} from '@config/app';
import blur from '@helpers/blur';
import type {Document, WallPaper} from '@layer';

import type AppDownloadManagerInstance from '@lib/appDownloadManager';
import type {AppManagers} from '@lib/managers';
import CacheStorageController from '@lib/files/cacheStorage';
import StaticUtilityClass from '@lib/staticUtilityClass';


namespace ChatBackgroundStore {
  export type BackgroundPromises = {
    [url: string]: MaybePromise<string>
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

  public static getWallPaperStorageUrl(slug: string, blur?: boolean) {
    return `backgrounds/${slug}${blur ? '?blur' : ''}`;
  }

  public static hasWallPaperStorageUrl(slug: string, blur?: boolean) {
    const storageUrl = this.getWallPaperStorageUrl(slug, blur);
    return this.cacheStorage.has(storageUrl);
  }

  public static getBackground({
    slug,
    canDownload,
    blur,

    managers,
    appDownloadManager
  }: ChatBackgroundStore.GetBackgroundArgs) {
    const storageUrl = this.getWallPaperStorageUrl(slug, blur);
    const canReallyDownload = canDownload && !!managers && !!appDownloadManager;

    return this.backgroundPromises[storageUrl] ||= this.cacheStorage.getFile(storageUrl).then((blob) => {
      return this.backgroundPromises[storageUrl] = URL.createObjectURL(blob);
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
      return this.backgroundPromises[storageUrl] = url;
    } : undefined);
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

    const response = await fetch(url);
    const blob = await response.blob();

    return this.cacheStorage.save({
      entryName: this.getWallPaperStorageUrl(slug, blur),
      response,
      size: blob.size
    });
  }

  public static setBackgroundUrlToCache({slug, url, blur}: ChatBackgroundStore.SetBackgroundUrlToCacheArgs) {
    this.backgroundPromises[this.getWallPaperStorageUrl(slug, blur)] = url;
  }
}

export default ChatBackgroundStore;
