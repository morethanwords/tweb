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
import {Document, InputFile, InputFileLocation, InputWebFileLocation, Photo, PhotoSize, UploadFile, UploadWebFile, WebDocument} from '../../layer';
import {DcId} from '../../types';
import CacheStorageController from '../files/cacheStorage';
import {logger, LogTypes} from '../logger';
import assumeType from '../../helpers/assumeType';
import ctx from '../../environment/ctx';
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
import networkStats from './networkStats';
import getDownloadFileNameFromOptions from '../appManagers/utils/download/getDownloadFileNameFromOptions';
import {getServiceMessagePort} from './mtproto.worker';
import StreamWriter from '../files/streamWriter';
import FileStorage from '../files/fileStorage';
import fileNameRFC from '../../helpers/string/fileNameRFC';
import {MAX_FILE_SAVE_SIZE} from './mtproto_config';
import throttle from '../../helpers/schedulers/throttle';
import makeError from '../../helpers/makeError';

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
  mimeType?: string,
  limitPart?: number,
  queueId?: number,
  onlyCache?: boolean,
  downloadId?: string
  // getFileMethod: Parameters<CacheStorageController['getFile']>[1]
};

export type DownloadMediaOptions = {
  media: Photo.photo | Document.document | WebDocument,
  thumb?: PhotoSize,
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

const MAX_FILE_PART_SIZE = 1 * 1024 * 1024;

const REGULAR_DOWNLOAD_DELTA = 36;
const PREMIUM_DOWNLOAD_DELTA = 72;

const IGNORE_ERRORS: Set<ErrorType> = new Set([
  'DOWNLOAD_CANCELED',
  'UPLOAD_CANCELED',
  'UNKNOWN',
  'NO_NEW_CONTEXT'
]);

export class ApiFileManager extends AppManager {
  private cacheStorage = new CacheStorageController('cachedFiles');

  private downloadPromises: {
    [fileName: string]: DownloadPromise
  } = {};

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

  protected after() {
    setInterval(() => { // clear old promises
      for(const hex in this.refreshReferencePromises) {
        const {deferred} = this.refreshReferencePromises[hex];
        if(deferred.isFulfilled || deferred.isRejected) {
          delete this.refreshReferencePromises[hex];
        }
      }
    }, 1800e3);

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
    const downloadLimit = dcId === 'upload' ? 24 : (this.rootScope.premium ? PREMIUM_DOWNLOAD_DELTA : REGULAR_DOWNLOAD_DELTA);
    // const downloadLimit = Infinity;

    if(this.downloadActives[dcId] >= downloadLimit || !downloadPull?.length) {
      return false;
    }

    // const data = downloadPull.shift();
    const data = findAndSplice(downloadPull, (d) => d.queueId === 0) || findAndSplice(downloadPull, (d) => d.queueId === this.queueId) || downloadPull.shift();
    const activeDelta = data.activeDelta || 1;

    this.downloadActives[dcId] += activeDelta;

    const promise = data.cb();
    const networkPromise = networkStats.waitForChunk(dcId as DcId, activeDelta * 1024 * 128);
    Promise.race([
      promise,
      networkPromise
    ]).then(() => {
      this.downloadActives[dcId] -= activeDelta;
      this.downloadCheck(dcId);

      networkPromise.resolve();
    }, (error: ApiError) => {
      if(!error?.type || !IGNORE_ERRORS.has(error.type)) {
        this.log.error('downloadCheck error:', error);
      }

      this.downloadActives[dcId] -= activeDelta;
      this.downloadCheck(dcId);

      networkPromise.reject(error);
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

  public requestWebFilePart(dcId: DcId, location: InputWebFileLocation, offset: number, limit: number, id = 0, queueId = 0, checkCancel?: () => void) {
    return this.downloadRequest(dcId, id, async() => { // do not remove async, because checkCancel will throw an error
      checkCancel && checkCancel();

      return this.apiManager.invokeApi('upload.getWebFile', {
        location,
        offset,
        limit
      }, {
        dcId,
        fileDownload: true
      });
    }, this.getDelta(limit), queueId);
  }

  public requestFilePart(dcId: DcId, location: InputFileLocation, offset: number, limit: number, id = 0, queueId = 0, checkCancel?: () => void) {
    return this.downloadRequest(dcId, id, async() => { // do not remove async, because checkCancel will throw an error
      checkCancel && checkCancel();

      const invoke = async(): Promise<MyUploadFile> => {
        checkCancel && checkCancel(); // do not remove async, because checkCancel will throw an error

        // * IMPORTANT: reference can be changed in previous request
        const reference = (location as InputFileLocation.inputDocumentFileLocation).file_reference?.slice();

        const promise = /* pause(1000).then(() =>  */this.apiManager.invokeApi('upload.getFile', {
          location,
          offset,
          limit
        }, {
          dcId,
          fileDownload: true
        }) as Promise<MyUploadFile>/* ) */;

        return promise.catch((err: ApiError) => {
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
    return bytes / 1024 / 128;
  }

  private getLimitPart(size: number, isUpload: boolean): number {
    if(!size) { // * sometimes size can be 0 (e.g. avatars, webDocuments)
      return 512 * 1024;
    }

    let bytes = 128 * 1024;

    const maxParts = isUpload ? this.maxUploadParts : this.maxDownloadParts;
    // usually it will stick to 512Kb size if the file is too big
    while((size / bytes) > maxParts && bytes < MAX_FILE_PART_SIZE) {
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

  public download(options: DownloadOptions): DownloadPromise {
    const size = options.size ?? 0;
    const {dcId, location, downloadId} = options;

    let process: ApiFileManager['uncompressTGS'] | ApiFileManager['convertWebp'];

    if(downloadId) {

    } else if(options.mimeType === 'application/x-tgwallpattern') {
      process = this.uncompressTGV;
      options.mimeType = 'image/svg+xml';
    } else if(options.mimeType === 'image/webp' && !getEnvironment().IS_WEBP_SUPPORTED) {
      process = this.convertWebp;
      options.mimeType = 'image/png';
    } else if(options.mimeType === 'application/x-tgsticker') {
      process = this.uncompressTGS;
      options.mimeType = 'application/json';
    } else if(options.mimeType === 'audio/ogg' && !getEnvironment().IS_OPUS_SUPPORTED) {
      process = this.convertOpus;
      options.mimeType = 'audio/wav';
    }

    const fileName = getDownloadFileNameFromOptions(options);
    const cachedPromise = options.downloadId ? undefined : this.downloadPromises[fileName];
    let fileStorage: FileStorage = this.getFileStorage();

    this.debug && this.log('downloadFile', fileName, size, location, options.mimeType);

    /* if(options.queueId) {
      this.log.error('downloadFile queueId:', fileName, options.queueId);
    } */

    if(cachedPromise) {
      // this.log('downloadFile cachedPromise');

      if(size) {
        return cachedPromise.then((blob) => {
          if(blob instanceof Blob && blob.size < size) {
            this.debug && this.log('downloadFile need to deleteFile, wrong size:', blob.size, size);

            return this.delete(fileName).then(() => {
              return this.download(options);
            }).catch(() => {
              return this.download(options);
            });
          } else {
            return blob;
          }
        });
      } else {
        return cachedPromise;
      }
    }

    const deferred: DownloadPromise = deferredPromise();
    const mimeType = options.mimeType || 'image/jpeg';

    let error: ApiError;
    let resolved = false;
    let cacheWriter: StreamWriter;
    let errorHandler = (_error: typeof error) => {
      error = _error;
      delete this.downloadPromises[fileName];
      deferred.reject(error);
      errorHandler = () => {};

      if(cacheWriter && (!error || error.type !== 'DOWNLOAD_CANCELED')) {
        cacheWriter.truncate?.();
      }
    };

    const id = this.tempId++;

    if(downloadId) {
      const headers = {
        'Content-Type': 'application/octet-stream; charset=utf-8',
        'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + fileNameRFC(options.fileName),
        // 'Content-Disposition': `attachment; filename="${options.fileName}"`,
        // 'Content-Type': 'application/octet-stream; charset=utf-8',
        ...(size ? {'Content-Length': size} : {})
      };

      const serviceMessagePort = getServiceMessagePort();
      const promise = serviceMessagePort.invoke('download', {
        fileName,
        headers,
        id: downloadId
      });

      promise.catch(errorHandler);
      deferred.catch(() => {
        getServiceMessagePort().invoke('downloadCancel', downloadId);
      });

      class f implements StreamWriter {
        constructor() {

        }

        public async write(part: Uint8Array, offset?: number) {
          return serviceMessagePort.invoke('downloadChunk', {
            id: downloadId,
            chunk: part
          });
        }

        public finalize(saveToStorage?: boolean): Promise<Blob> {
          return serviceMessagePort.invoke('downloadFinalize', downloadId).then(() => null);
        }
      }

      class d implements FileStorage {
        public getFile(fileName: string): Promise<any> {
          return Promise.reject();
        }

        public getWriter(fileName: string, fileSize: number, mimeType: string): Promise<StreamWriter> {
          return Promise.resolve(new f());
        }
      }

      fileStorage = new d();
    }

    fileStorage.getFile(fileName).then(async(blob: Blob) => {
      // throw '';

      if(blob.size < size) {
        if(!options.onlyCache) {
          await this.delete(fileName);
        }

        throw false;
      }

      deferred.resolve(blob);
    }).catch(async(err: ApiError) => {
      if(options.onlyCache) {
        errorHandler(err);
        return;
      }

      // this.log('not cached', fileName);
      const limit = options.limitPart || this.getLimitPart(size, false);
      const writerPromise = fileStorage.getWriter(fileName, size || limit, mimeType);

      const writer = cacheWriter = await writerPromise;

      let offset: number;
      const startOffset = 0;
      let writePromise: CancellablePromise<void> = Promise.resolve(),
        writeDeferred: CancellablePromise<void>;
      // const maxRequests = 13107200 / limit; // * 100 Mb speed
      const maxRequests = Infinity;

      const processDownloaded = async(bytes: Uint8Array) => {
        if(process) {
          // const perf = performance.now();
          const processed = await process(bytes, fileName);
          // this.log('downloadFile process downloaded time', performance.now() - perf, mimeType, process);
          return processed;
        }

        return bytes;
      };

      const r = location._ === 'inputWebFileLocation' ? this.requestWebFilePart.bind(this) : this.requestFilePart.bind(this);

      const delayed: Delayed[] = [];
      offset = startOffset;
      do {
        writeDeferred = deferredPromise<void>();
        delayed.push({offset, writePromise, writeDeferred});
        writePromise = writeDeferred;
        offset += limit;
      } while(offset < size);

      const progress: Progress = {done: 0, offset, total: size, fileName};
      const dispatchProgress = () => {
        progress.done = done;
        deferred.notify?.(progress);
      };

      const throttledDispatchProgress = throttle(dispatchProgress, 50, true);

      let done = 0;
      const superpuper = async() => {
        // if(!delayed.length) return;

        const {offset, writePromise, writeDeferred} = delayed.shift();
        try {
          checkCancel();

          // @ts-ignore
          const result = await r(dcId, location as any, offset, limit, id, options.queueId, checkCancel);

          const bytes = result.bytes;

          if(delayed.length) {
            superpuper();
          }

          const byteLength = bytes.byteLength;
          this.debug && this.log('downloadFile requestFilePart result:', fileName, result);
          const isFinal = (offset + limit) >= size || !byteLength;
          if(byteLength) {
            done += byteLength;

            if(isFinal) {
              dispatchProgress();
            } else {
              throttledDispatchProgress();
            }

            await writePromise;
            checkCancel();

            // const perf = performance.now();
            await writer.write(bytes, offset);
            checkCancel();
            // downloadId && this.log('write time', performance.now() - perf);
          }

          if(isFinal && process) {
            const bytes = writer.getParts();
            const processedResult = await processDownloaded(bytes);
            checkCancel();

            writer.replaceParts(processedResult);
          }

          writeDeferred.resolve();

          if(isFinal) {
            resolved = true;

            const realSize = size || byteLength;
            if(!size) {
              writer.trim(realSize);
            }

            deferred.resolve(await writer.finalize(realSize <= MAX_FILE_SAVE_SIZE));
          }
        } catch(err) {
          errorHandler(err as ApiError);
        }
      };

      for(let i = 0, length = Math.min(maxRequests, delayed.length); i < length; ++i) {
        superpuper();
      }
    });

    const checkCancel = () => {
      if(error) {
        throw error;
      }
    };

    deferred.cancel = () => {
      if(!error && !resolved) {
        const error = makeError('DOWNLOAD_CANCELED');
        errorHandler(error);
      }
    };

    deferred.notify = (progress: Progress) => {
      this.rootScope.dispatchEvent('download_progress', progress);
    };

    this.downloadPromises[fileName] = deferred;

    deferred.catch(noop).finally(() => {
      delete this.downloadPromises[fileName];
    });

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

    const {fileName, downloadOptions} = getDownloadMediaDetails(options);

    let promise = this.getDownload(fileName);
    if(!promise) {
      promise = this.download(downloadOptions);

      if(isDocument && !thumb) {
        this.rootScope.dispatchEvent('document_downloading', (media as Document.document).id);
        promise.catch(noop).finally(() => {
          this.rootScope.dispatchEvent('document_downloaded', (media as Document.document).id);
        });
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
    const fileSize = file.size,
      isBigFile = fileSize >= 10485760;

    let canceled = false,
      resolved = false,
      doneParts = 0;
    const partSize = this.getLimitPart(fileSize, true);

    fileName ||= getFileNameForUpload(file);

    const activeDelta = this.getDelta(partSize);

    const totalParts = Math.ceil(fileSize / partSize);
    const fileId = randomLong();

    let _part = 0;

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

    let errorHandler = (error: ApiError) => {
      if(error?.type !== 'UPLOAD_CANCELED') {
        this.log.error('Up Error', error);
      }

      deferred.reject(error);
      canceled = true;
      errorHandler = () => {};
    };

    const method = isBigFile ? 'upload.saveBigFilePart' : 'upload.saveFilePart';

    const id = this.tempId++;

    const self = this;
    function* generator() {
      for(let offset = 0; offset < fileSize; offset += partSize) {
        const part = _part++; // 0, 1
        yield self.downloadRequest('upload', id, () => {
          const blob = file.slice(offset, offset + partSize);

          return readBlobAsArrayBuffer(blob).then((buffer) => {
            if(canceled) {
              throw makeError('UPLOAD_CANCELED');
            }

            self.debug && self.log('Upload file part, isBig:', isBigFile, part, buffer.byteLength, new Uint8Array(buffer).length, new Uint8Array(buffer).slice().length);

            /* const u = new Uint8Array(buffer.byteLength);
            for(let i = 0; i < u.length; ++i) {
              //u[i] = Math.random() * 255 | 0;
              u[i] = 0;
            }
            buffer = u.buffer; */

            /* setTimeout(() => {
              doneParts++;
              uploadResolve();

              //////this.log('Progress', doneParts * partSize / fileSize);

              self.log('done part', part, doneParts);

              deferred.notify({done: doneParts * partSize, total: fileSize});

              if(doneParts >= totalParts) {
                deferred.resolve(resultInputFile);
                resolved = true;
              }
            }, 1250);
            return; */

            return self.apiManager.invokeApi(method, {
              file_id: fileId,
              file_part: part,
              file_total_parts: totalParts,
              bytes: buffer/* new Uint8Array(buffer) */
            } as any, {
              // startMaxLength: partSize + 256,
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
          });
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
    // const maxRequests = 10;
    /* for(let i = 0; i < 10; ++i) {
      process();
    } */
    for(let i = 0, length = Math.min(maxRequests, totalParts); i < length; ++i) {
      process();
    }

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
      delete this.uploadPromises[fileName];
    });

    return this.uploadPromises[fileName] = deferred;
  }
}
