import { nextRandomInt, getFileNameByLocation } from "../bin_utils";

import cacheStorage from "../cacheStorage";
import FileManager from "../filemanager";
import apiManager from "./apiManager";
import { deferredPromise, CancellablePromise } from "../polyfill";
import { logger, LogLevels } from "../logger";
import { InputFileLocation, FileLocation, UploadFile } from "../../types";
import { isSafari } from "../../helpers/userAgent";
import cryptoWorker from "../crypto/cryptoworker";
import { notifySomeone } from "../../helpers/context";

type Delayed = {
  offset: number, 
  writeFilePromise: CancellablePromise<unknown>, 
  writeFileDeferred: CancellablePromise<unknown>
};

export type DownloadOptions = {
  dcID: number, 
  location: InputFileLocation | FileLocation, 
  size?: number,
  fileName?: string,
  mimeType?: string,
  limitPart?: number,
  processPart?: (bytes: Uint8Array, offset?: number, queue?: Delayed[]) => Promise<any>
};

export class ApiFileManager {
  public cachedDownloadPromises: {
    [fileName: string]: CancellablePromise<Blob>
  } = {};

  public downloadPulls: {
    [x: string]: Array<{
      cb: () => Promise<UploadFile | void>,
      deferred: {
        resolve: (...args: any[]) => void,
        reject: (...args: any[]) => void
      },
      activeDelta: number
    }>
  } = {};
  public downloadActives: {[dcID: string]: number} = {};

  public webpConvertPromises: {[fileName: string]: CancellablePromise<Uint8Array>} = {};

  private log: ReturnType<typeof logger> = logger('AFM', LogLevels.error);

  public downloadRequest(dcID: 'upload', cb: () => Promise<void>, activeDelta: number): Promise<void>;
  public downloadRequest(dcID: number, cb: () => Promise<UploadFile>, activeDelta: number): Promise<UploadFile>;
  public downloadRequest(dcID: number | string, cb: () => Promise<UploadFile | void>, activeDelta: number) {
    if(this.downloadPulls[dcID] === undefined) {
      this.downloadPulls[dcID] = [];
      this.downloadActives[dcID] = 0;
    }

    const downloadPull = this.downloadPulls[dcID];

    const promise = new Promise<UploadFile | void>((resolve, reject) => {
      downloadPull.push({cb, deferred: {resolve, reject}, activeDelta});
    });

    setTimeout(() => {
      this.downloadCheck(dcID);
    }, 0);

    return promise;
  }

  public downloadCheck(dcID: string | number) {
    const downloadPull = this.downloadPulls[dcID];
    //const downloadLimit = dcID == 'upload' ? 11 : 5;
    //const downloadLimit = 24;
    const downloadLimit = dcID == 'upload' ? 11 : 48;

    if(this.downloadActives[dcID] >= downloadLimit || !downloadPull || !downloadPull.length) {
      return false;
    }

    const data = downloadPull.shift();
    const activeDelta = data.activeDelta || 1;

    this.downloadActives[dcID] += activeDelta;

    data.cb()
    .then((result) => {
      this.downloadActives[dcID] -= activeDelta;
      this.downloadCheck(dcID);

      data.deferred.resolve(result);
    }, (error: Error) => {
      if(error) {
        this.log.error('downloadCheck error:', error);
      }

      this.downloadActives[dcID] -= activeDelta;
      this.downloadCheck(dcID);

      data.deferred.reject(error);
    });
  }

  public getFileStorage() {
    return cacheStorage;
  }

  public cancelDownload(fileName: string) {
    const promise = this.cachedDownloadPromises[fileName];
    if(promise) {
      promise.cancel();
      return true;
    }

    return false;
  }

  public requestFilePart(dcID: number, location: InputFileLocation | FileLocation, offset: number, limit: number, checkCancel?: () => void) {
    //const delta = limit / 1024 / 256;
    const delta = limit / 1024 / 128;
    return this.downloadRequest(dcID, async() => {
      checkCancel && checkCancel();

      return apiManager.invokeApi('upload.getFile', {
        location,
        offset,
        limit
      }, {
        dcID,
        fileDownload: true/* ,
        singleInRequest: 'safari' in window */
      }) as Promise<UploadFile>;
    }, delta);
  }

  private convertBlobToBytes(blob: Blob) {
    return blob.arrayBuffer().then(buffer => new Uint8Array(buffer));
  }

  private getLimitPart(size: number): number {
    let bytes: number;

    bytes = 512;
    /* if(size < 1e6 || !size) bytes = 512;
    else if(size < 3e6) bytes = 256;
    else bytes = 128; */

    return bytes * 1024;
  }

  uncompressTGS = (bytes: Uint8Array, fileName: string) => {
    //this.log('uncompressTGS', bytes, bytes.slice().buffer);
    // slice нужен потому что в uint8array - 5053 length, в arraybuffer - 5084
    return cryptoWorker.gzipUncompress<string>(bytes.slice().buffer, true);
  };

  convertWebp = (bytes: Uint8Array, fileName: string) => {
    const convertPromise = deferredPromise<Uint8Array>();

    const task = {type: 'convertWebp', payload: {fileName, bytes}};
    notifySomeone(task);
    return this.webpConvertPromises[fileName] = convertPromise;
  };

  public downloadFile(options: DownloadOptions): CancellablePromise<Blob> {
    if(!FileManager.isAvailable()) {
      return Promise.reject({type: 'BROWSER_BLOB_NOT_SUPPORTED'});
    }

    let size = options.size ?? 0;
    let {dcID, location} = options;

    let process: ApiFileManager['uncompressTGS'] | ApiFileManager['convertWebp'];

    if(options.mimeType == 'image/webp' && isSafari) {
      process = this.convertWebp;
      options.mimeType = 'image/png';
    } else if(options.mimeType == 'application/x-tgsticker') {
      process = this.uncompressTGS;
      options.mimeType = 'application/json';
    }

    const fileName = getFileNameByLocation(location, {fileName: options.fileName});
    const cachedPromise = this.cachedDownloadPromises[fileName];
    const fileStorage = this.getFileStorage();

    this.log('downloadFile', fileName, size, location, options.mimeType, process);

    if(cachedPromise) {
      if(options.processPart) {
        return cachedPromise.then((blob) => {
          return this.convertBlobToBytes(blob).then(bytes => {
            options.processPart(bytes);
            return blob;
          });
        });
      }

      //this.log('downloadFile cachedPromise');

      if(size) {
        return cachedPromise.then((blob: Blob) => {
          if(blob.size < size) {
            this.log('downloadFile need to deleteFile, wrong size:', blob.size, size);

            return this.deleteFile(fileName).then(() => {
              return this.downloadFile(options);
            }).catch(() => {
              return this.downloadFile(options);
            });
          } else {
            return blob;
          }
        });
      } else {
        return cachedPromise;
      }
    }

    const deferred = deferredPromise<Blob>();
    const mimeType = options.mimeType || 'image/jpeg';

    let canceled = false;
    let resolved = false;
    let cacheFileWriter: ReturnType<typeof FileManager['getFakeFileWriter']>;
    let errorHandler = (error: any) => {
      deferred.reject(error);
      errorHandler = () => {};

      if(cacheFileWriter && (!error || error.type != 'DOWNLOAD_CANCELED')) {
        cacheFileWriter.truncate();
      }
    };

    fileStorage.getFile(fileName).then(async(blob: Blob) => {
      //this.log('maybe cached', fileName);
      //throw '';

      if(blob.size < size) {
        //this.log('downloadFile need to deleteFile 2, wrong size:', blob.size, size);
        await this.deleteFile(fileName);
        throw false;
      }

      if(options.processPart) {
        //FileManager.copy(blob, toFileEntry).then(deferred.resolve, errorHandler);
        await this.convertBlobToBytes(blob).then(bytes => {
          options.processPart(bytes);
        });
      }

      deferred.resolve(blob);
    }).catch(() => {
      //this.log('not cached', fileName);
      const fileWriterPromise = fileStorage.getFileWriter(fileName, mimeType);

      fileWriterPromise.then((fileWriter) => {
        cacheFileWriter = fileWriter;
        const limit = options.limitPart || this.getLimitPart(size);
        let offset: number;
        let startOffset = 0;
        let writeFilePromise: CancellablePromise<unknown> = Promise.resolve(),
          writeFileDeferred: CancellablePromise<unknown>;
        const maxRequests = options.processPart ? 5 : 5;

        /* if(fileWriter.length) {
          startOffset = fileWriter.length;
          
          if(startOffset >= size) {
            if(toFileEntry) {
              deferred.resolve();
            } else {
              deferred.resolve(fileWriter.finalize());
            }

            return;
          }

          fileWriter.seek(startOffset);
          deferred.notify({done: startOffset, total: size});

          /////this.log('deferred notify 1:', {done: startOffset, total: size});
        } */

        const processDownloaded = async(bytes: Uint8Array, offset: number) => {
          if(options.processPart) {
            await options.processPart(bytes, offset, delayed);
          }
          
          if(process) {
            //const perf = performance.now();
            const processed = await process(bytes, fileName);
            //this.log('downloadFile process downloaded time', performance.now() - perf, mimeType, process);
            return processed;
          }
  
          return bytes;
        };

        const delayed: Delayed[] = [];
        offset = startOffset;
        do {
          ////this.log('offset:', startOffset);
          writeFileDeferred = deferredPromise<void>();
          delayed.push({offset, writeFilePromise, writeFileDeferred});
          writeFilePromise = writeFileDeferred;
          offset += limit;
        } while(offset < size);

        // для потокового видео нужно скачать первый и последний чанки
        /* if(options.processPart && delayed.length > 2) {
          const last = delayed.splice(delayed.length - 1, 1)[0];
          delayed.splice(1, 0, last);
        } */

        // @ts-ignore
        //deferred.queue = delayed;

        let done = 0;
        const superpuper = async() => {
          //if(!delayed.length) return;

          const {offset, writeFilePromise, writeFileDeferred} = delayed.shift();
          try {
            const result = await this.requestFilePart(dcID, location, offset, limit, checkCancel);

            if(delayed.length) {
              superpuper();
            }

            this.log('downloadFile requestFilePart result:', fileName, result);
            const isFinal = offset + limit >= size || !result.bytes.byteLength;
            if(result.bytes.byteLength) {
              //done += limit;
              done += result.bytes.byteLength;

              const processedResult = await processDownloaded(result.bytes, offset);
              checkCancel();

              //if(!isFinal) {
                ////this.log('deferred notify 2:', {done: offset + limit, total: size}, deferred);
                deferred.notify({done, offset, total: size});
              //}

              await writeFilePromise;
              checkCancel();

              await FileManager.write(fileWriter, processedResult);
            }

            writeFileDeferred.resolve();

            if(isFinal) {
              resolved = true;

              if(options.processPart) {
                deferred.resolve();
              } else {
                deferred.resolve(fileWriter.finalize());
              }
            }
          } catch(err) {
            errorHandler(err);
          }
        };

        for(let i = 0, length = Math.min(maxRequests, delayed.length); i < length; ++i) {
          superpuper();
        }
      });
    });

    const checkCancel = () => {
      if(canceled) {
        throw new Error('canceled');
      }
    };

    deferred.cancel = () => {
      if(!canceled && !resolved) {
        canceled = true;
        delete this.cachedDownloadPromises[fileName];
        errorHandler({type: 'DOWNLOAD_CANCELED'});
      }
    };

    this.cachedDownloadPromises[fileName] = deferred;

    return deferred;
  }

  public deleteFile(fileName: string) {
    //this.log('will delete file:', fileName);
    delete this.cachedDownloadPromises[fileName];
    return this.getFileStorage().deleteFile(fileName);
  }

  public uploadFile(file: Blob | File) {
    var fileSize = file.size,
      isBigFile = fileSize >= 10485760,
      canceled = false,
      resolved = false,
      doneParts = 0,
      partSize = 262144, // 256 Kb
      activeDelta = 2;

    if(fileSize > 67108864) {
      partSize = 524288;
      activeDelta = 4;
    } else if(fileSize < 102400) {
      partSize = 32768;
      activeDelta = 1;
    }

    var totalParts = Math.ceil(fileSize / partSize);

    var fileID = [nextRandomInt(0xFFFFFFFF), nextRandomInt(0xFFFFFFFF)];

    var _part = 0,
      resultInputFile = {
        _: isBigFile ? 'inputFileBig' : 'inputFile',
        id: fileID,
        parts: totalParts,
        name: file instanceof File ? file.name : '',
        md5_checksum: ''
    };

    let deferredHelper: {
      resolve?: (input: typeof resultInputFile) => void,
      reject?: (error: any) => void,
      notify?: (details: {done: number, total: number}) => void
    } = {
      notify: (details: {done: number, total: number}) => {}
    };
    let deferred: CancellablePromise<typeof resultInputFile> = new Promise((resolve, reject) => {
      if(totalParts > 3000) {
        return reject({type: 'FILE_TOO_BIG'});
      }

      deferredHelper.resolve = resolve;
      deferredHelper.reject = reject;
    });
    Object.assign(deferred, deferredHelper);

    if(totalParts > 3000) {
      return deferred;
    }
    
    let errorHandler = (error: any) => {
      this.log.error('Up Error', error);
      deferred.reject(error);
      canceled = true;
      errorHandler = () => {};
    };

    let method = isBigFile ? 'upload.saveBigFilePart' : 'upload.saveFilePart';
    for(let offset = 0; offset < fileSize; offset += partSize) {
      let part = _part++; // 0, 1
      this.downloadRequest('upload', () => {
        return new Promise<void>((uploadResolve, uploadReject) => {
          var reader = new FileReader();
          var blob = file.slice(offset, offset + partSize);
  
          reader.onloadend = (e) => {
            if(canceled) {
              uploadReject();
              return;
            }
            
            if(e.target.readyState != FileReader.DONE) {
              this.log.error('wrong readyState!');
              return;
            }

            //////this.log('Starting to upload file, isBig:', isBigFile, fileID, part, e.target.result);

            apiManager.invokeApi(method, {
              file_id: fileID,
              file_part: part,
              file_total_parts: totalParts,
              bytes: e.target.result
            }, {
              startMaxLength: partSize + 256,
              fileUpload: true,
              singleInRequest: true
            }).then((result) => {
              doneParts++;
              uploadResolve();

              //////this.log('Progress', doneParts * partSize / fileSize);
              if(doneParts >= totalParts) {
                deferred.resolve(resultInputFile);
                resolved = true;
              } else {
                deferred.notify({done: doneParts * partSize, total: fileSize});
              }
            }, errorHandler);
          };
  
          reader.readAsArrayBuffer(blob);
        });
      }, activeDelta);
    }

    deferred.cancel = () => {
      this.log('cancel upload', canceled, resolved);
      if(!canceled && !resolved) {
        canceled = true;
        errorHandler({type: 'UPLOAD_CANCELED'});
      }
    };

    return deferred;
  }
}

const apiFileManager = new ApiFileManager();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (self as any).apiFileManager = apiFileManager;
}
export default apiFileManager;
