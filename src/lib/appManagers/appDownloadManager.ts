/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { DownloadOptions } from "../mtproto/apiFileManager";
import type { ApiError } from "../mtproto/apiManager";
import type { MyDocument } from "./appDocsManager";
import type { MyPhoto } from "./appPhotosManager";
import rootScope from "../rootScope";
import apiManager from "../mtproto/mtprotoworker";
import deferredPromise, { CancellablePromise } from "../../helpers/cancellablePromise";
import { InputFile } from "../../layer";
import { getFileNameByLocation } from "../../helpers/fileName";
import CacheStorageController from "../cacheStorage";
import { MOUNT_CLASS_TO } from "../../config/debug";

export type ResponseMethodBlob = 'blob';
export type ResponseMethodJson = 'json';
export type ResponseMethod = ResponseMethodBlob | ResponseMethodJson;

/* export type DownloadBlob = {promise: Promise<Blob>, controller: AbortController};
export type DownloadJson = {promise: Promise<any>, controller: AbortController}; */
export type DownloadBlob = CancellablePromise<Blob>;
export type DownloadJson = CancellablePromise<any>;
//export type Download = DownloadBlob/*  | DownloadJson */;
export type Download = DownloadBlob/*  | DownloadJson */;

export type Progress = {done: number, fileName: string, total: number, offset: number};
export type ProgressCallback = (details: Progress) => void;

export type ThumbCache = {
  downloaded: number, 
  url: string
};

export type ThumbsCache = {
  [id: string]: {
    [size: string]: ThumbCache
  }
};

export class AppDownloadManager {
  public cacheStorage = new CacheStorageController('cachedFiles');
  private downloads: {[fileName: string]: Download} = {};
  private progress: {[fileName: string]: Progress} = {};
  private progressCallbacks: {[fileName: string]: Array<ProgressCallback>} = {};

  private uploadId = 0;

  private thumbsCache: {
    photo: ThumbsCache,
    document: ThumbsCache
  } = {
    photo: {},
    document: {}
  };

  constructor() {
    rootScope.addEventListener('download_progress', (e) => {
      const details = e as {done: number, fileName: string, total: number, offset: number};
      this.progress[details.fileName] = details;

      const callbacks = this.progressCallbacks[details.fileName];
      if(callbacks) {
        callbacks.forEach(callback => callback(details));
      }

      const download = this.downloads[details.fileName];
      if(download) {
        download.notifyAll(details);
      }
    });
  }

  private getNewDeferred<T>(fileName: string) {
    const deferred = deferredPromise<T>();

    deferred.cancel = () => {
      //try {
        const error = new Error('Download canceled');
        error.name = 'AbortError';
        
        apiManager.cancelDownload(fileName);
        
        deferred.reject(error);
        deferred.cancel = () => {};
      /* } catch(err) {

      } */
    };

    deferred.finally(() => {
      delete this.progress[fileName];
      delete this.progressCallbacks[fileName];
    });

    deferred.catch(() => {
      this.clearDownload(fileName);
    });

    return this.downloads[fileName] = deferred as any;
  }

  private clearDownload(fileName: string) {
    delete this.downloads[fileName];
  }

  public fakeDownload(fileName: string, value: Blob | string) {
    const deferred = this.getNewDeferred<Blob>(fileName);
    if(typeof(value) === 'string') {
      fetch(value)
      .then(response => response.blob())
      .then(blob => deferred.resolve(blob));
    } else {
      deferred.resolve(value);
    }

    return deferred;
  }

  public download(options: DownloadOptions): DownloadBlob {
    const fileName = getFileNameByLocation(options.location, {fileName: options.fileName});
    if(this.downloads.hasOwnProperty(fileName)) return this.downloads[fileName];

    const deferred = this.getNewDeferred<Blob>(fileName);

    const onError = (err: ApiError) => {
      deferred.reject(err);
    };

    const tryDownload = (): Promise<unknown> => {
      //return Promise.resolve();

      if(!apiManager.worker || options.onlyCache) {
        const promise = this.cacheStorage.getFile(fileName).then((blob) => {
          if(blob.size < options.size) throw 'wrong size';
          else deferred.resolve(blob);
        });
        
        if(options.onlyCache) return promise.catch(onError);
        return promise.catch(() => {
          return apiManager.downloadFile(options).then(deferred.resolve, onError);
        });
      } else {
        /* return apiManager.downloadFile(options).then(res => {
          setTimeout(() => deferred.resolve(res), 5e3);
        }, onError); */

        return apiManager.downloadFile(options).then(deferred.resolve, onError);
      }
    };

    tryDownload();

    //console.log('Will download file:', fileName, url);
    return deferred;
  }

  public upload(file: File | Blob, fileName?: string) {
    if(!fileName) {
      const mimeType = file?.type;
      if(mimeType) { // the same like apiFileName in appMessagesManager for upload!
        const ext = this.uploadId++ + '.' + mimeType.split('/')[1];
  
        if(['image/jpeg', 'image/png', 'image/bmp'].indexOf(mimeType) >= 0) {
          fileName = 'photo' + ext;
        } else if(mimeType.indexOf('audio/') === 0 || ['video/ogg'].indexOf(mimeType) >= 0) {
          fileName = 'audio' + ext;
        } else if(mimeType.indexOf('video/') === 0) {
          fileName = 'video' + ext;
        } else {
          fileName = 'document' + ext;
        }
        
      } else {
        fileName = 'upload-' + this.uploadId++;
      }
    }

    const deferred = this.getNewDeferred<InputFile>(fileName);
    apiManager.uploadFile({file, fileName}).then(deferred.resolve, deferred.reject);

    deferred.finally(() => {
      this.clearDownload(fileName);
    });

    return deferred as any as CancellablePromise<InputFile>;
  }

  public getDownload(fileName: string) {
    return this.downloads[fileName];
  }

  public addProgressCallback(fileName: string, callback: ProgressCallback) {
    const progress = this.progress[fileName];
    (this.progressCallbacks[fileName] ?? (this.progressCallbacks[fileName] = [])).push(callback);

    if(progress) {
      callback(progress);
    }
  }

  public createDownloadAnchor(url: string, fileName: string, onRemove?: () => void) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    
    a.style.position = 'absolute';
    a.style.top = '1px';
    a.style.left = '1px';
    
    document.body.append(a);
  
    try {
      var clickEvent = document.createEvent('MouseEvents');
      clickEvent.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
      a.dispatchEvent(clickEvent);
    } catch (e) {
      console.error('Download click error', e);
      try {
        a.click();
      } catch (e) {
        window.open(url as string, '_blank');
      }
    }
    
    setTimeout(() => {
      a.remove();
      onRemove && onRemove();
    }, 100);
  }

  /* public downloadToDisc(fileName: string, url: string) {
    this.createDownloadAnchor(url);
  
    return this.download(fileName, url);
  } */

  public downloadToDisc(options: DownloadOptions, discFileName: string) {
    const download = this.download(options);
    download/* .promise */.then(blob => {
      const objectURL = URL.createObjectURL(blob);
      this.createDownloadAnchor(objectURL, discFileName, () => {
        URL.revokeObjectURL(objectURL);
      });
    });
  
    return download;
  }

  public getCacheContext(media: MyPhoto | MyDocument, thumbSize: string = 'full'): ThumbCache {
    /* if(media._ === 'photo' && thumbSize !== 'i') {
      thumbSize = 'full';
    } */

    const cache = this.thumbsCache[media._][media.id] ?? (this.thumbsCache[media._][media.id] = {});
    return cache[thumbSize] ?? (cache[thumbSize] = {downloaded: 0, url: ''});
  }
}

const appDownloadManager = new AppDownloadManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appDownloadManager = appDownloadManager);
export default appDownloadManager;
