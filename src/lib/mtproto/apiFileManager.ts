/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {ReferenceBytes} from './referenceDatabase';
import Modes from '../../config/modes';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import {randomLong} from '../../helpers/random';
import {Document, InputFile, InputFileLocation, InputWebFileLocation, Photo, PhotoSize, UploadFile, UploadWebFile, VideoSize, WebDocument} from '../../layer';
import {DcId} from '../../types';
import CacheStorageController from '../files/cacheStorage';
import {logger, LogTypes} from '../logger';
import assumeType from '../../helpers/assumeType';
import noop from '../../helpers/noop';
import readBlobAsArrayBuffer from '../../helpers/blob/readBlobAsArrayBuffer';
import bytesToHex from '../../helpers/bytes/bytesToHex';
import findAndSplice from '../../helpers/array/findAndSplice';
import fixFirefoxSvg from '../../helpers/fixFirefoxSvg';
import {AppManager} from '../appManagers/manager';
import {getEnvironment} from '../../environment/utils';
import MTProtoMessagePort from './mtprotoMessagePort';
import getFileNameForUpload from '../../helpers/getFileNameForUpload';
import type {Progress} from '../appManagers/appDownloadManager';
import getDownloadMediaDetails from '../appManagers/utils/download/getDownloadMediaDetails';
// import networkStats from './networkStats';
import getDownloadFileNameFromOptions from '../appManagers/utils/download/getDownloadFileNameFromOptions';
import StreamWriter from '../files/streamWriter';
import FileStorage from '../files/fileStorage';
import {MAX_FILE_SAVE_SIZE} from './mtproto_config';
import throttle from '../../helpers/schedulers/throttle';
import makeError from '../../helpers/makeError';
import readBlobAsUint8Array from '../../helpers/blob/readBlobAsUint8Array';
import DownloadStorage from '../files/downloadStorage';
import copy from '../../helpers/object/copy';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import {EXTENSION_MIME_TYPE_MAP, MIME_TYPE_EXTENSION_MAP} from '../../environment/mimeTypeMap';
import isWebFileLocation from '../appManagers/utils/webFiles/isWebFileLocation';
import appManagersManager from '../appManagers/appManagersManager';

type Delayed = {
  offset: number,
  writePromise: CancellablePromise<void>,
  writeDeferred: CancellablePromise<void>
};

export type DownloadOptions = {
  dcId: DcId,
  location: InputFileLocation | InputWebFileLocation,
  size?: number,
  fileName?: string,
  mimeType?: MTMimeType,
  limitPart?: number,
  queueId?: number,
  onlyCache?: boolean,
  downloadId?: string
  // getFileMethod: Parameters<CacheStorageController['getFile']>[1]
};

export type DownloadMediaOptions = {
  media: Photo.photo | Document.document | WebDocument | InputWebFileLocation,
  thumb?: PhotoSize | Extract<VideoSize, VideoSize.videoSize>,
  queueId?: number,
  onlyCache?: boolean,
  downloadId?: string
};

type DownloadPromise = CancellablePromise<Blob>;

export type MyUploadFile = UploadFile.uploadFile | UploadWebFile.uploadWebFile;

// export interface RefreshReferenceTask extends WorkerTaskVoidTemplate {
//   type: 'refreshReference',
//   payload: ReferenceBytes,
// };

// export interface RefreshReferenceTaskResponse extends WorkerTaskVoidTemplate {
//   type: 'refreshReference',
//   payload: ReferenceBytes,
//   originalPayload: ReferenceBytes
// };

const DO_NOT_UPLOAD_FILES = false;

const MAX_DOWNLOAD_FILE_PART_SIZE = 1 * 1024 * 1024;
const MAX_UPLOAD_FILE_PART_SIZE = 512 * 1024;
const MIN_PART_SIZE = 128 * 1024;
const AVG_PART_SIZE = 512 * 1024;

const REGULAR_DOWNLOAD_DELTA = (9 * 512 * 1024) / MIN_PART_SIZE;
// const PREMIUM_DOWNLOAD_DELTA = REGULAR_DOWNLOAD_DELTA * 2;
const PREMIUM_DOWNLOAD_DELTA = (56 * 512 * 1024) / MIN_PART_SIZE;

const IGNORE_ERRORS: Set<ErrorType> = new Set([
  'DOWNLOAD_CANCELED',
  'UPLOAD_CANCELED',
  'UNKNOWN',
  'NO_NEW_CONTEXT'
]);

export class ApiFileManager extends AppManager {
  private cacheStorage = new CacheStorageController('cachedFiles');
  private downloadStorage = new DownloadStorage();

  private downloadPromises: {
    [fileName: string]: DownloadPromise
  } = {};

  // private downloadToDiscPromises: {
  //   [fileName: string]: DownloadPromise
  // } = {};

  private uploadPromises: {
    [fileName: string]: CancellablePromise<InputFile>
  } = {};

  private downloadPulls: {
    [dcId: string]: Array<{
      id: number,
      queueId: number,
      cb: () => Promise<MyUploadFile | void>,
      deferred: {
        resolve: (...args: any[]) => void,
        reject: (...args: any[]) => void
      },
      activeDelta: number
    }>
  } = {};
  private downloadActives: {[dcId: string]: number} = {};

  public refreshReferencePromises: {
    [referenceHex: string]: {
      deferred: CancellablePromise<ReferenceBytes>,
      timeout?: number
    }
  } = {};

  private log: ReturnType<typeof logger> = logger('AFM', LogTypes.Error | LogTypes.Log);
  private tempId = 0;
  private queueId = 0;
  private debug = Modes.debug;

  private maxUploadParts = 4000;
  private maxDownloadParts = 8000;
  private webFileDcId: DcId;

  protected after() {
    setInterval(() => { // clear old promises
      for(const hex in this.refreshReferencePromises) {
        const {deferred} = this.refreshReferencePromises[hex];
        if(deferred.isFulfilled || deferred.isRejected) {
          delete this.refreshReferencePromises[hex];
        }
      }
    }, 1800e3);

    this.rootScope.addEventListener('config', (config) => {
      this.webFileDcId = config.webfile_dc_id;
    });

    this.rootScope.addEventListener('app_config', (appConfig) => {
      this.maxUploadParts = this.rootScope.premium ? appConfig.upload_max_fileparts_premium : appConfig.upload_max_fileparts_default;
      this.maxDownloadParts = appConfig.upload_max_fileparts_premium;
    });
  }

  private downloadRequest(dcId: 'upload', id: number, cb: () => Promise<void>, activeDelta: number, queueId?: number): Promise<void>;
  private downloadRequest(dcId: number, id: number, cb: () => Promise<MyUploadFile>, activeDelta: number, queueId?: number): Promise<MyUploadFile>;
  private downloadRequest(dcId: number | string, id: number, cb: () => Promise<MyUploadFile | void>, activeDelta: number, queueId: number = 0) {
    if(this.downloadPulls[dcId] === undefined) {
      this.downloadPulls[dcId] = [];
      this.downloadActives[dcId] = 0;
    }

    const downloadPull = this.downloadPulls[dcId];

    const promise = new Promise<MyUploadFile | void>((resolve, reject) => {
      downloadPull.push({id, queueId, cb, deferred: {resolve, reject}, activeDelta});
    });

    setTimeout(() => {
      this.downloadCheck(dcId);
    }, 0);

    return promise;
  }

  private downloadCheck(dcId: string | number) {
    const downloadPull = this.downloadPulls[dcId];
    const downloadLimit = /* dcId === 'upload' ? 24 :  */(this.rootScope.premium ? PREMIUM_DOWNLOAD_DELTA : REGULAR_DOWNLOAD_DELTA);
    // const downloadLimit = Infinity;

    if(this.downloadActives[dcId] >= downloadLimit || !downloadPull?.length) {
      return false;
    }

    // const data = downloadPull.shift();
    const data = findAndSplice(downloadPull, (d) => d.queueId === 0) || findAndSplice(downloadPull, (d) => d.queueId === this.queueId) || downloadPull.shift();
    const activeDelta = data.activeDelta || 1;

    this.downloadActives[dcId] += activeDelta;

    const promise = data.cb();
    // const networkPromise = networkStats.waitForChunk(dcId as DcId, activeDelta * MIN_PART_SIZE);
    /* Promise.race([
      promise
      // networkPromise
    ]) */promise.then(() => {
      this.downloadActives[dcId] -= activeDelta;
      this.downloadCheck(dcId);

      // networkPromise.resolve();
    }, (error: ApiError) => {
      if(!error?.type || !IGNORE_ERRORS.has(error.type)) {
        this.log.error('downloadCheck error:', error);
      }

      this.downloadActives[dcId] -= activeDelta;
      this.downloadCheck(dcId);

      // networkPromise.reject(error);
    }).finally(() => {
      promise.then(data.deferred.resolve, data.deferred.reject);
    });
  }

  public setQueueId(queueId: number) {
    // this.log.error('setQueueId', queueId);
    this.queueId = queueId;
  }

  private getFileStorage() {
    return this.cacheStorage;
  }

  public cancelDownload(fileName: string) {
    const promises = [this.downloadPromises[fileName], this.uploadPromises[fileName]].filter(Boolean);
    let canceled = false;
    for(let i = 0, length = promises.length; i < length; ++i) {
      const promise = promises[i];
      if(promise && !promise.isRejected && !promise.isFulfilled) {
        promise.cancel();
        canceled = true;
      }
    }

    return canceled;
  }

  public requestWebFilePart(
    dcId: DcId,
    location: InputWebFileLocation,
    offset: number,
    limit: number,
    id = 0,
    queueId = 0,
    checkCancel?: () => void
  ) {
    return this.downloadRequest(this.webFileDcId, id, async() => { // do not remove async, because checkCancel will throw an error
      checkCancel?.();

      if('url' in location) {
        const url = location.url;
        if(this.isLocalWebFile(url)) {
          return fetch(url)
          .then((response) => response.arrayBuffer())
          .then((arrayBuffer) => {
            const extension = url.split('.').pop() as MTFileExtension;
            const mimeType = EXTENSION_MIME_TYPE_MAP[extension] || 'application/octet-stream';
            return {
              _: 'upload.webFile',
              size: arrayBuffer.byteLength,
              mime_type: mimeType,
              file_type: {_: 'storage.fileUnknown'},
              mtime: 0,
              bytes: new Uint8Array(arrayBuffer)
            };
          });
        }
      }

      return this.apiManager.invokeApi('upload.getWebFile', {
        location,
        offset,
        limit
      }, {
        dcId: this.webFileDcId,
        fileDownload: true
      });
    }, this.getDelta(limit), queueId);
  }

  public requestFilePart(
    dcId: DcId,
    location: InputFileLocation,
    offset: number,
    limit: number,
    id = 0,
    queueId = 0,
    checkCancel?: () => void
  ) {
    return this.downloadRequest(dcId, id, async() => { // do not remove async, because checkCancel will throw an error
      checkCancel?.();

      const invoke = async(): Promise<MyUploadFile> => {
        checkCancel?.(); // do not remove async, because checkCancel will throw an error

        // * IMPORTANT: reference can be changed in previous request
        const reference = (location as InputFileLocation.inputDocumentFileLocation).file_reference?.slice();

        const promise = // pause(offset > (100 * 1024 * 1024) ? 10000000 : 0).then(() =>
        this.apiManager.invokeApi('upload.getFile', {
          location,
          offset,
          limit
        }, {
          dcId,
          fileDownload: true
        }) as Promise<MyUploadFile>/* ) */;

        return promise.catch((err: ApiError) => {
          checkCancel?.();

          if(err.type === 'FILE_REFERENCE_EXPIRED') {
            return this.refreshReference(location as InputFileLocation.inputDocumentFileLocation, reference).then(invoke);
          }

          throw err;
        });
      };

      assumeType<InputFileLocation.inputDocumentFileLocation>(location);
      const reference = location.file_reference;
      if(reference && !location.checkedReference) { // check stream's location because it's new every call
        location.checkedReference = true;
        const hex = bytesToHex(reference);
        if(this.refreshReferencePromises[hex]) {
          return this.refreshReference(location, reference).then(invoke);
        }
      }

      return invoke();
    }, this.getDelta(limit), queueId);
  }

  /* private convertBlobToBytes(blob: Blob) {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  } */

  private getDelta(bytes: number) {
    return bytes / MIN_PART_SIZE;
  }

  private getLimitPart(size: number, isUpload: boolean): number {
    if(!size) { // * sometimes size can be 0 (e.g. avatars, webDocuments)
      return AVG_PART_SIZE;
    }

    // return 1 * 1024 * 1024;

    let bytes = MIN_PART_SIZE;

    const maxParts = isUpload ? this.maxUploadParts : this.maxDownloadParts;
    const maxPartSize = isUpload ? MAX_UPLOAD_FILE_PART_SIZE : MAX_DOWNLOAD_FILE_PART_SIZE;
    // usually it will stick to 512Kb size if the file is too big
    while((size / bytes) > maxParts && bytes < maxPartSize) {
      bytes *= 2;
    }
    /* if(size < 1e6 || !size) bytes = 512;
    else if(size < 3e6) bytes = 256;
    else bytes = 128; */

    return bytes;
  }

  private uncompressTGS = (bytes: Uint8Array, fileName: string) => {
    // this.log('uncompressTGS', bytes, bytes.slice().buffer);
    // slice нужен потому что в uint8array - 5053 length, в arraybuffer - 5084
    return this.cryptoWorker.invokeCrypto('gzipUncompress', bytes.slice().buffer, false) as Promise<Uint8Array>;
  };

  private uncompressTGV = (bytes: Uint8Array, fileName: string) => {
    // this.log('uncompressTGS', bytes, bytes.slice().buffer);
    // slice нужен потому что в uint8array - 5053 length, в arraybuffer - 5084
    const buffer = bytes.slice().buffer;
    if(getEnvironment().IS_FIREFOX) {
      return this.cryptoWorker.invokeCrypto('gzipUncompress', buffer, true).then((text) => {
        return fixFirefoxSvg(text as string);
      }).then((text) => {
        const textEncoder = new TextEncoder();
        return textEncoder.encode(text);
      });
    }

    return this.cryptoWorker.invokeCrypto('gzipUncompress', buffer, false) as Promise<Uint8Array>;
  };

  private convertWebp = (bytes: Uint8Array, fileName: string) => {
    const instance = MTProtoMessagePort.getInstance<false>();
    return instance.invoke('convertWebp', {fileName, bytes});
  };

  private convertOpus = (bytes: Uint8Array, fileName: string) => {
    const instance = MTProtoMessagePort.getInstance<false>();
    return instance.invoke('convertOpus', {fileName, bytes});
  };

  private refreshReference(
    inputFileLocation: InputFileLocation.inputDocumentFileLocation,
    reference: typeof inputFileLocation['file_reference'],
    hex = bytesToHex(reference)
  ) {
    let r = this.refreshReferencePromises[hex];
    if(!r) {
      const deferred = deferredPromise<ReferenceBytes>();

      r = this.refreshReferencePromises[hex] = {
        deferred

        // ! I don't remember what it was for...
        // timeout: ctx.setTimeout(() => {
        //   this.log.error('Didn\'t refresh the reference:', inputFileLocation);
        //   deferred.reject(makeError('REFERENCE_IS_NOT_REFRESHED'));
        // }, 60000)
      };

      // deferred.catch(noop).finally(() => {
      //   clearTimeout(r.timeout);
      // });

      this.referenceDatabase.refreshReference(reference).then((reference) => {
        if(hex === bytesToHex(reference)) {
          deferred.reject(makeError('REFERENCE_IS_NOT_REFRESHED'));
        }

        deferred.resolve(reference);
      }, deferred.reject);
    }

    // have to replace file_reference in any way, because location can be different everytime if it's stream
    return r.deferred.then((reference) => {
      inputFileLocation.file_reference = reference;
    });
  }

  public isDownloading(fileName: string) {
    return !!this.downloadPromises[fileName];
  }

  public getDownload(fileName: string) {
    return this.downloadPromises[fileName];
  }

  public getUpload(fileName: string) {
    return this.uploadPromises[fileName];
  }

  private getConvertMethod(mimeType: MTMimeType) {
    let process: ApiFileManager['uncompressTGS'] | ApiFileManager['convertWebp'];
    if(mimeType === 'application/x-tgwallpattern') {
      process = this.uncompressTGV;
      mimeType = 'image/svg+xml';
    } else if(mimeType === 'image/webp' && !getEnvironment().IS_WEBP_SUPPORTED) {
      process = this.convertWebp;
      mimeType = 'image/png';
    } else if(mimeType === 'application/x-tgsticker') {
      process = this.uncompressTGS;
      mimeType = 'application/json';
    } else if(mimeType === 'audio/ogg' && !getEnvironment().IS_OPUS_SUPPORTED) {
      process = this.convertOpus;
      mimeType = 'audio/wav';
    }

    return {mimeType, process};
  }

  private allocateDeferredPromises(startOffset: number, size: number, limitPart: number) {
    const delayed: Delayed[] = [];
    let offset = startOffset;
    let writePromise: CancellablePromise<void> = Promise.resolve(),
      writeDeferred: CancellablePromise<void>;
    do {
      writeDeferred = deferredPromise<void>();
      delayed.push({offset, writePromise, writeDeferred});
      writePromise = writeDeferred;
      offset += limitPart;
    } while(offset < size);

    return delayed;
  }

  private isLocalWebFile(url: string) {
    return url?.startsWith('assets/');
  }

  public download(options: DownloadOptions): DownloadPromise {
    const size = options.size ?? 0;
    const {dcId, location} = options;
    let {downloadId} = options;
    if(downloadId && !appManagersManager.getServiceMessagePort()) {
      this.log.error('download fallback to blob', options);
      downloadId = undefined;
    }

    const originalMimeType = options.mimeType;
    const convertMethod = this.getConvertMethod(originalMimeType);
    const {process} = convertMethod;
    options.mimeType = convertMethod.mimeType || 'image/jpeg';

    const fileName = getDownloadFileNameFromOptions(options);
    const cacheFileName = downloadId ? getDownloadFileNameFromOptions({...copy(options), downloadId: undefined}) : fileName;
    const cacheStorage: FileStorage = this.getFileStorage();
    const downloadStorage: FileStorage = downloadId ? this.downloadStorage : undefined;
    let deferred: DownloadPromise = downloadId ? undefined : this.downloadPromises[fileName];

    this.debug && this.log('downloadFile', fileName, options);

    if(deferred) {
      return deferred;
    }

    // if(deferred) {
    //   if(size) {
    //     return deferred.then(async(blob) => {
    //       if(blob instanceof Blob && blob.size < size) {
    //         this.debug && this.log('downloadFile need to deleteFile, wrong size:', blob.size, size);

    //         try {
    //           await this.delete(fileName);
    //         } finally {
    //           return this.download(options);
    //         }
    //       } else {
    //         return blob;
    //       }
    //     });
    //   } else {
    //     return deferred;
    //   }
    // }

    const errorHandler = (item: typeof cachePrepared, error: ApiError) => {
      if(item?.error) {
        return;
      }

      for(const p of prepared) {
        if(item && item !== p) {
          continue;
        }

        p.error = error;
        p.deferred.reject(error);
      }
    };

    const isWebFile = isWebFileLocation(location);
    const isLocalWebFile = isWebFile && this.isLocalWebFile((location as InputWebFileLocation.inputWebFileLocation).url);
    const id = this.tempId++;
    const limitPart = isLocalWebFile ?
      size :
      options.limitPart || this.getLimitPart(size, false);

    let getFile: FileStorage['getFile'] = cacheStorage.getFile.bind(cacheStorage);

    let cachePrepared: ReturnType<FileStorage['prepareWriting']> & {writer?: StreamWriter, error?: ApiError},
      downloadPrepared: typeof cachePrepared;
    const prepared: (typeof cachePrepared)[] = [];
    const possibleSize = size || limitPart;

    const getErrorsCount = () => prepared.reduce((acc, item) => acc + +!!item.error, 0);

    const attach = (item: typeof cachePrepared, fileName: string) => {
      const {deferred} = item;
      const _errorHandler = errorHandler.bind(null, item);

      deferred.cancel = () => deferred.reject(makeError('DOWNLOAD_CANCELED'));
      deferred.catch((error) => {
        _errorHandler(error);
        item.writer?.truncate?.();
      }).finally(() => {
        if(this.downloadPromises[fileName] === deferred) {
          delete this.downloadPromises[fileName];
        }

        delete item.writer;
        // indexOfAndSplice(prepared, item);
      });

      this.downloadPromises[fileName] = deferred;

      prepared.push(item);
    };

    if(cacheStorage && (!downloadStorage || possibleSize <= MAX_FILE_SAVE_SIZE)) {
      cachePrepared = cacheStorage.prepareWriting(cacheFileName, possibleSize, options.mimeType)
      attach(cachePrepared, cacheFileName);
    }

    if(downloadStorage) {
      let downloadFileName = options.fileName; // it's doc file_name
      if(!downloadFileName) {
        downloadFileName = cacheFileName;
        const ext = MIME_TYPE_EXTENSION_MAP[options.mimeType];
        if(ext) {
          downloadFileName += '.' + ext;
        }
      }

      downloadPrepared = downloadStorage.prepareWriting({
        fileName: downloadFileName,
        downloadId,
        size: possibleSize
      });
      attach(downloadPrepared, fileName);

      if(cachePrepared) { // cancel cache too
        downloadPrepared.deferred.catch((err) => cachePrepared.deferred.reject(err));
      }

      // this.downloadToDiscPromises[cacheFileName] = deferred;
      // deferred.catch(noop).finally(() => {
      //   if(this.downloadToDiscPromises[cacheFileName] === deferred) {
      //     delete this.downloadToDiscPromises[cacheFileName];
      //   }
      // });
    }

    deferred = downloadPrepared?.deferred ?? cachePrepared.deferred;

    if(downloadStorage && process) { // then have to load file again
      getFile = downloadStorage.getFile.bind(downloadStorage);
    }

    getFile(cacheFileName).then(async(blob: Blob) => {
      checkCancel();

      // if(blob.size < size) {
      //   if(!options.onlyCache) {
      //     await this.delete(cacheFileName);
      //     checkCancel();
      //   }

      //   throw makeError('NO_ENTRY_FOUND');
      // }

      if(downloadPrepared) {
        const writer = downloadPrepared.writer = downloadPrepared.getWriter();
        checkCancel();

        const arr = await readBlobAsUint8Array(blob);
        checkCancel();
        await writer.write(arr);
        checkCancel();

        downloadPrepared.deferred.resolve(await writer.finalize());
      }

      if(cachePrepared) {
        cachePrepared.deferred.resolve(blob);
      }
    }).catch(async(err: ApiError) => {
      if(options.onlyCache) {
        errorHandler(null, err);
        return;
      }

      prepared.forEach((p) => {
        p.writer = p.getWriter();
      });

      const maxRequests = Infinity;

      const requestPart = (isWebFile ? this.requestWebFilePart : this.requestFilePart).bind(this);

      if(isWebFile && this.webFileDcId === undefined && !isLocalWebFile) {
        await this.apiManager.getConfig();
        checkCancel();
      }

      const delayed = this.allocateDeferredPromises(0, size, limitPart);

      const progress: Progress = {done: 0, offset: 0, total: size, fileName};
      const dispatchProgress = () => {
        try {
          checkCancel();
          progress.done = done;
          this.rootScope.dispatchEvent('download_progress', progress);
        } catch(err) {}
      };

      const throttledDispatchProgress = throttle(dispatchProgress, 50, true);

      let done = 0;
      const superpuper = async() => {
        const {offset, writePromise, writeDeferred} = delayed.shift();
        try {
          checkCancel();

          const requestPerf = performance.now();
          const result = await requestPart(dcId, location as any, offset, limitPart, id, options.queueId, checkCancel);
          const requestTime = performance.now() - requestPerf;

          const bytes = result.bytes;

          if(delayed.length) {
            superpuper();
          }

          const byteLength = bytes.byteLength;
          this.debug && this.log('downloadFile requestFilePart result:', fileName, result);
          const isFinal = (offset + limitPart) >= size || !byteLength;
          if(byteLength) {
            done += byteLength;

            if(isFinal) {
              dispatchProgress();
            } else {
              throttledDispatchProgress();
            }

            const writeQueuePerf = performance.now();
            await writePromise;
            checkCancel();
            const writeQueueTime = performance.now() - writeQueuePerf;

            const perf = performance.now();
            await Promise.all(prepared.map(({writer}) => writer?.write(bytes, offset)));
            checkCancel();
            // downloadId && this.log('write time', performance.now() - perf, 'request time', requestTime, 'queue time', writeQueueTime);
          }

          if(isFinal) {
            if(!size || done < size) {
              prepared.forEach(({writer}) => writer?.trim?.(done));
            }
          }

          if(isFinal && process) {
            const promises = prepared
            .filter(({writer}) => writer?.getParts && writer.replaceParts)
            .map(async({writer}) => {
              const bytes = writer.getParts();
              const processedResult = await process(bytes, cacheFileName);
              writer.replaceParts(processedResult);
            });

            await Promise.all(promises);
            checkCancel();
          }

          writeDeferred.resolve();

          if(isFinal) {
            const saveToStorage = done <= MAX_FILE_SAVE_SIZE;
            prepared.forEach((item) => {
              const {deferred, writer} = item;
              if(deferred.isFulfilled || deferred.isRejected || !writer) {
                return;
              }

              const result = writer.finalize(saveToStorage);
              deferred.resolve(result);
            });
          }
        } catch(err) {
          errorHandler(null, err as ApiError);
        }
      };

      for(let i = 0, length = Math.min(maxRequests, delayed.length); i < length; ++i) {
        superpuper();
      }
    }).catch(noop);

    const checkCancel = () => {
      if(getErrorsCount() === prepared.length) {
        throw prepared[0].error;
      }
    };

    return deferred;
  }

  public downloadMedia(options: DownloadMediaOptions): DownloadPromise {
    let {media, thumb} = options;
    const isPhoto = media._ === 'photo';
    if(isPhoto && !thumb) {
      return Promise.reject('preloadPhoto photoEmpty!');
    }

    // get original instance with correct file_reference instead of using copies
    const isDocument = media._ === 'document';
    // const isWebDocument = media._ === 'webDocument';
    if(isDocument) media = this.appDocsManager.getDoc((media as Document.document).id);
    else if(isPhoto) media = this.appPhotosManager.getPhoto((media as Photo.photo).id);
    options.media = media || options.media;

    const {fileName, downloadOptions} = getDownloadMediaDetails(options);

    let promise = this.getDownload(fileName);
    if(!promise) {
      promise = this.download(downloadOptions);

      if(isDocument && !thumb) {
        this.rootScope.dispatchEvent('document_downloading', (media as Document.document).id);
        promise.then(() => {
          this.rootScope.dispatchEvent('document_downloaded', (media as Document.document).id);
        }).catch(noop);
      }
    }

    return promise;
  }

  public downloadMediaURL(options: DownloadMediaOptions): Promise<string> {
    const {media, thumb} = options;

    let cacheContext = this.thumbsStorage.getCacheContext(media as any, thumb?.type);
    if((thumb ? (cacheContext.downloaded >= ('size' in thumb ? thumb.size : 0)) : true) && cacheContext.url) {
      return Promise.resolve(cacheContext.url);
    }

    return this.downloadMedia(options).then((blob) => {
      if(!cacheContext.downloaded || cacheContext.downloaded < blob.size) {
        const url = URL.createObjectURL(blob);
        cacheContext = this.thumbsStorage.setCacheContextURL(media as any, cacheContext.type, url, blob.size);
      }

      return cacheContext.url;
    });
  }

  public downloadMediaVoid(options: DownloadMediaOptions) {
    return this.downloadMedia(options).then(noop);
  }

  private delete(fileName: string) {
    delete this.downloadPromises[fileName];
    return this.getFileStorage().delete(fileName);
  }

  public upload({file, fileName}: {file: Blob | File, fileName?: string}) {
    fileName ||= getFileNameForUpload(file);

    const fileSize = file.size;
    const isBigFile = fileSize >= 10485760;
    const partSize = this.getLimitPart(fileSize, true);
    const activeDelta = this.getDelta(partSize);
    const totalParts = DO_NOT_UPLOAD_FILES ? 0 : Math.ceil(fileSize / partSize);
    const fileId = randomLong();
    const resultInputFile: InputFile = {
      _: isBigFile ? 'inputFileBig' : 'inputFile',
      id: fileId as any,
      parts: totalParts,
      name: fileName,
      md5_checksum: ''
    };

    const deferred = deferredPromise<typeof resultInputFile>();
    if(totalParts > this.maxUploadParts) {
      deferred.reject(makeError('FILE_TOO_BIG'));
      return deferred;
    }

    let canceled = false, resolved = false;
    let errorHandler = (error: ApiError) => {
      if(error?.type !== 'UPLOAD_CANCELED') {
        this.log.error('Up Error', error);
      }

      deferred.reject(error);
      canceled = true;
      errorHandler = noop;
    };

    const method = isBigFile ? 'upload.saveBigFilePart' : 'upload.saveFilePart';
    const id = this.tempId++;

    const self = this;
    function* generator() {
      let _part = 0, doneParts = 0;
      for(let offset = 0; offset < fileSize; offset += partSize) {
        const part = _part++; // 0, 1
        yield self.downloadRequest('upload', id, async() => {
          checkCancel();

          const blob = file.slice(offset, offset + partSize);
          const buffer = await readBlobAsArrayBuffer(blob);
          checkCancel();

          self.debug && self.log('Upload file part, isBig:', isBigFile, part, buffer.byteLength, new Uint8Array(buffer).length, new Uint8Array(buffer).slice().length);

          return self.apiManager.invokeApi(method, {
            file_id: fileId,
            file_part: part,
            file_total_parts: totalParts,
            bytes: buffer
          } as any, {
            fileUpload: true
          }).then(() => {
            if(canceled) {
              return;
            }

            ++doneParts;
            const progress: Progress = {done: doneParts * partSize, offset, total: fileSize, fileName};
            deferred.notify(progress);

            if(doneParts >= totalParts) {
              deferred.resolve(resultInputFile);
              resolved = true;
            }
          }, errorHandler);
        }, activeDelta).catch(errorHandler);
      }
    }

    const it = generator();
    const process = () => {
      if(canceled) return;
      const r = it.next();
      if(r.done || canceled) return;
      (r.value as Promise<void>).then(process);
    };

    const maxRequests = Infinity;
    for(let i = 0, length = Math.min(maxRequests, totalParts); i < length; ++i) {
      process();
    }

    const checkCancel = () => {
      if(canceled) {
        throw makeError('UPLOAD_CANCELED');
      }
    };

    deferred.cancel = () => {
      if(!canceled && !resolved) {
        canceled = true;
        errorHandler(makeError('UPLOAD_CANCELED'));
      }
    };

    deferred.notify = (progress: Progress) => {
      this.rootScope.dispatchEvent('download_progress', progress);
    };

    deferred.finally(() => {
      if(this.uploadPromises[fileName] === deferred) {
        delete this.uploadPromises[fileName];
      }
    });

    return this.uploadPromises[fileName] = deferred;
  }
}
