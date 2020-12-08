import rootScope from "../rootScope";
import apiManager from "../mtproto/mtprotoworker";
import { deferredPromise, CancellablePromise } from "../../helpers/cancellablePromise";
import type { DownloadOptions } from "../mtproto/apiFileManager";
import { InputFile } from "../../layer";
import referenceDatabase, {ReferenceBytes} from "../mtproto/referenceDatabase";
import type { ApiError } from "../mtproto/apiManager";
import { getFileNameByLocation } from "../../helpers/fileName";
import CacheStorageController from "../cacheStorage";

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

export class AppDownloadManager {
  private cacheStorage = new CacheStorageController('cachedFiles');
  private downloads: {[fileName: string]: Download} = {};
  private progress: {[fileName: string]: Progress} = {};
  private progressCallbacks: {[fileName: string]: Array<ProgressCallback>} = {};

  private uploadID = 0;

  constructor() {
    rootScope.on('download_progress', (e) => {
      const details = e.detail as {done: number, fileName: string, total: number, offset: number};
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

  private getNewDeferred(fileName: string) {
    const deferred = deferredPromise<Blob>();

    deferred.cancel = () => {
      const error = new Error('Download canceled');
      error.name = 'AbortError';
      
      apiManager.cancelDownload(fileName);
      this.clearDownload(fileName);

      deferred.reject(error);
      deferred.cancel = () => {};
    };

    deferred.finally(() => {
      delete this.progress[fileName];
      delete this.progressCallbacks[fileName];
    });

    return this.downloads[fileName] = deferred;
  }

  private clearDownload(fileName: string) {
    delete this.downloads[fileName];
  }

  public download(options: DownloadOptions): DownloadBlob {
    const fileName = getFileNameByLocation(options.location, {fileName: options.fileName});
    if(this.downloads.hasOwnProperty(fileName)) return this.downloads[fileName];

    const deferred = this.getNewDeferred(fileName);

    const onError = (err: ApiError) => {
      switch(err.type) {
        case 'FILE_REFERENCE_EXPIRED': {
          // @ts-ignore
          const bytes: ReferenceBytes = options?.location?.file_reference;
          if(bytes) {
            referenceDatabase.refreshReference(bytes).then(tryDownload);
            /* referenceDatabase.refreshReference(bytes).then(() => {
              console.log('FILE_REFERENCE_EXPIRED: refreshed reference', bytes);
            }); */
            break;
          } else {
            console.warn('FILE_REFERENCE_EXPIRED: no context for bytes:', bytes);
          }
        }

        default:
          deferred.reject(err);
          break;
      }
    };

    const tryDownload = (): Promise<unknown> => {
      if(!apiManager.worker) {
        return this.cacheStorage.getFile(fileName).then((blob) => {
          if(blob.size < options.size) throw 'wrong size';
          else deferred.resolve(blob);
        }).catch(() => {
          return apiManager.downloadFile(options).then(deferred.resolve, onError);
        });
      } else {
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
        const ext = this.uploadID++ + '.' + mimeType.split('/')[1];
  
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
        fileName = 'upload-' + this.uploadID++;
      }
    }

    const deferred = this.getNewDeferred(fileName);
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

  private createDownloadAnchor(url: string, fileName: string, onRemove?: () => void) {
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
}

export default new AppDownloadManager();