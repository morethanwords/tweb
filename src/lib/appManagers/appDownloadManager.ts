/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { ApiFileManager, DownloadMediaOptions, DownloadOptions } from "../mtproto/apiFileManager";
import deferredPromise, { CancellablePromise } from "../../helpers/cancellablePromise";
import { Document, InputFile, Photo, PhotoSize, WebDocument } from "../../layer";
import { getFileNameByLocation } from "../../helpers/fileName";
import getFileNameForUpload from "../../helpers/getFileNameForUpload";
import { AppManagers } from "./managers";
import rootScope from "../rootScope";
import { MOUNT_CLASS_TO } from "../../config/debug";
import getDocumentDownloadOptions from "./utils/docs/getDocumentDownloadOptions";
import getPhotoDownloadOptions from "./utils/photos/getPhotoDownloadOptions";
import createDownloadAnchor from "../../helpers/dom/createDownloadAnchor";
import noop from "../../helpers/noop";
import getDownloadMediaDetails from "./utils/download/getDownloadMediaDetails";
import getDownloadFileNameFromOptions from "./utils/download/getDownloadFileNameFromOptions";
import { AppMessagesManager } from "./appMessagesManager";

export type ResponseMethodBlob = 'blob';
export type ResponseMethodJson = 'json';
export type ResponseMethod = ResponseMethodBlob | ResponseMethodJson;

/* export type DownloadBlob = {promise: Promise<Blob>, controller: AbortController};
export type DownloadJson = {promise: Promise<any>, controller: AbortController}; */
export type DownloadBlob = CancellablePromise<Blob>;
export type DownloadUrl = CancellablePromise<string>;
export type DownloadJson = CancellablePromise<any>;
//export type Download = DownloadBlob/*  | DownloadJson */;
export type Download = DownloadBlob | DownloadUrl/*  | DownloadJson */;

export type Progress = {done: number, fileName: string, total: number, offset: number};
export type ProgressCallback = (details: Progress) => void;

type DownloadType = 'url' | 'blob' | 'void';

export class AppDownloadManager {
  private downloads: {[fileName: string]: {main: Download, url?: Download, blob?: Download, void?: Download}} = {};
  private progress: {[fileName: string]: Progress} = {};
  // private progressCallbacks: {[fileName: string]: Array<ProgressCallback>} = {};
  private managers: AppManagers;

  public construct(managers: AppManagers) {
    this.managers = managers;
    rootScope.addEventListener('download_progress', (details) => {
      this.progress[details.fileName] = details;

      // const callbacks = this.progressCallbacks[details.fileName];
      // if(callbacks) {
      //   callbacks.forEach((callback) => callback(details));
      // }

      const download = this.downloads[details.fileName];
      if(download) {
        download.main.notifyAll(details);
      }
    });
  }

  private getNewDeferred<T>(fileName: string, type?: DownloadType) {
    const deferred = deferredPromise<T>();

    let download = this.downloads[fileName];
    if(!download) {
      download = this.downloads[fileName] = {
        main: deferred as any
      };

      deferred.cancel = () => {
        //try {
          const error = new Error('Download canceled');
          error.name = 'AbortError';
          
          this.managers.apiFileManager.cancelDownload(fileName);
          
          deferred.reject(error);
          deferred.cancel = () => {};
        /* } catch(err) {
  
        } */
      };
  
      deferred.catch(() => {
        this.clearDownload(fileName);
      }).finally(() => {
        delete this.progress[fileName];
        // delete this.progressCallbacks[fileName];
      });
    } else {
      const main = download.main;
      (['cancel', 'addNotifyListener', 'notify', 'notifyAll'] as (keyof CancellablePromise<void>)[]).forEach((key) => {
        if(!main[key]) {
          return;
        }
        
        // @ts-ignore
        deferred[key] = main[key].bind(main);
      });
    }

    return download[type] = deferred as any;
  }

  public getNewDeferredForUpload<T extends Promise<any>>(fileName: string, promise: T) {
    const deferred = this.getNewDeferred<InputFile>(fileName);
    promise.then(deferred.resolve, deferred.reject);

    deferred.finally(() => {
      this.clearDownload(fileName);
    });

    return deferred as CancellablePromise<Awaited<T>>;
  }

  private clearDownload(fileName: string) {
    delete this.downloads[fileName];
  }

  public getUpload(fileName: string): ReturnType<AppMessagesManager['sendFile']>['promise'] {
    let deferred: CancellablePromise<any> = this.getDownload(fileName);
    if(deferred) {
      return deferred;
    }
    
    deferred = this.getNewDeferred(fileName);
    this.managers.appMessagesManager.getUploadPromise(fileName).then(deferred.resolve, deferred.reject);
    return deferred;
  }

  /* public fakeDownload(fileName: string, value: Blob | string) {
    const deferred = this.getNewDeferred<Blob>(fileName);
    if(typeof(value) === 'string') {
      fetch(value)
      .then((response) => response.blob())
      .then((blob) => deferred.resolve(blob));
    } else {
      deferred.resolve(value);
    }

    return deferred;
  } */

  private d(fileName: string, getPromise: () => Promise<any>, type?: DownloadType) {
    let deferred = this.getDownload(fileName, type);
    if(deferred) return deferred;

    deferred = this.getNewDeferred<Blob>(fileName, type);
    getPromise().then(deferred.resolve, deferred.reject);
    return deferred;
  }

  public download(options: DownloadOptions): DownloadBlob {
    const fileName = getDownloadFileNameFromOptions(options);
    return this.d(fileName, () => this.managers.apiFileManager.download(options), 'blob') as any;
  }

  public downloadMedia(options: DownloadMediaOptions, type: DownloadType = 'blob'): DownloadBlob {
    const {downloadOptions, fileName} = getDownloadMediaDetails(options);
    
    return this.d(fileName, () => {
      const cb = type === 'url' ? this.managers.apiFileManager.downloadMediaURL : (type === 'void' ? this.managers.apiFileManager.downloadMediaVoid : this.managers.apiFileManager.downloadMedia);
      return cb(options);
    }, type) as any;
  }

  public downloadMediaURL(options: DownloadMediaOptions): DownloadUrl {
    return this.downloadMedia(options, 'url') as any;
  }

  public downloadMediaVoid(options: DownloadMediaOptions): DownloadBlob {
    return this.downloadMedia(options, 'void');
  }

  public upload(file: File | Blob, fileName?: string, promise?: Promise<any>) {
    if(!fileName) {
      fileName = getFileNameForUpload(file);
    }

    if(!promise) {
      promise = this.managers.apiFileManager.upload({file, fileName});
    }
    
    const deferred = this.getNewDeferredForUpload(fileName, promise);
    return deferred as any as CancellablePromise<InputFile>;
  }

  public getDownload(fileName: string, type?: DownloadType) {
    const d = this.downloads[fileName];
    return d && d[type];
  }

  // public addProgressCallback(fileName: string, callback: ProgressCallback) {
  //   const progress = this.progress[fileName];
  //   (this.progressCallbacks[fileName] ?? (this.progressCallbacks[fileName] = [])).push(callback);

  //   if(progress) {
  //     callback(progress);
  //   }
  // }

  public downloadToDisc(options: DownloadMediaOptions) {
    const media = options.media;
    const isDocument = media._ === 'document';
    if(!isDocument && !options.thumb) {
      options.thumb = (media as Photo.photo).sizes.slice().pop() as PhotoSize.photoSize;
    }
    
    const promise = this.downloadMedia(options);
    promise.then((blob) => {
      const url = URL.createObjectURL(blob);
      const downloadOptions = isDocument ? 
        getDocumentDownloadOptions(media) : 
        getPhotoDownloadOptions(media as any, options.thumb);
      const fileName = (options.media as Document.document).file_name || getFileNameByLocation(downloadOptions.location);
      createDownloadAnchor(url, fileName, () => {
        URL.revokeObjectURL(url);
      });
    }, noop);

    return promise;
  }
}

const appDownloadManager = new AppDownloadManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appDownloadManager = appDownloadManager);
export default appDownloadManager;
