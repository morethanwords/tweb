import { nextRandomInt } from "../bin_utils";

//import IdbFileStorage from "../idb";
import cacheStorage from "../cacheStorage";
import FileManager from "../filemanager";
//import apiManager from "./apiManager";
import apiManager from "./mtprotoworker";
import { logger, deferredPromise, CancellablePromise } from "../polyfill";
import appWebpManager from "../appManagers/appWebpManager";

export class ApiFileManager {
  public cachedSavePromises: {
    [fileName: string]: Promise<Blob>
  } = {};
  public cachedDownloadPromises: {
    [fileName: string]: any
  } = {};
  public cachedDownloads: {
    [fileName: string]: Blob
  } = {};

  /* public indexedKeys: Set<string> = new Set();
  private keysLoaded = false; */

  public downloadPulls: {
    [x: string]: Array<{
      cb: () => Promise<unknown>,
      deferred: {
        resolve: (...args: any[]) => void,
        reject: (...args: any[]) => void
      },
      activeDelta?: number
    }>
  } = {};
  public downloadActives: {[dcID: string]: number} = {};

  private log: ReturnType<typeof logger> = logger('AFM');

  public downloadRequest(dcID: string | number, cb: () => Promise<unknown>, activeDelta?: number) {
    if(this.downloadPulls[dcID] === undefined) {
      this.downloadPulls[dcID] = [];
      this.downloadActives[dcID] = 0;
    }

    var downloadPull = this.downloadPulls[dcID];

    let promise = new Promise((resolve, reject) => {
      downloadPull.push({cb: cb, deferred: {resolve, reject}, activeDelta: activeDelta});
    })/* .catch(() => {}) */;

    setTimeout(() => {
      this.downloadCheck(dcID);
    }, 0);

    return promise;
  }

  public downloadCheck(dcID: string | number) {
    var downloadPull = this.downloadPulls[dcID];
    var downloadLimit = dcID == 'upload' ? 11 : 5;

    if(this.downloadActives[dcID] >= downloadLimit || !downloadPull || !downloadPull.length) {
      return false;
    }

    var data = downloadPull.shift();
    var activeDelta = data.activeDelta || 1;

    this.downloadActives[dcID] += activeDelta;

    data.cb()
    .then((result: any) => {
      this.downloadActives[dcID] -= activeDelta;
      this.downloadCheck(dcID);

      data.deferred.resolve(result);
    }, (error: any) => {
      if(error) {
        this.log.error('downloadCheck error:', error);
      }

      this.downloadActives[dcID] -= activeDelta;
      this.downloadCheck(dcID);

      data.deferred.reject(error);
    });
  }

  public getFileName(location: any, options?: Partial<{
    stickerType: number
  }>) {
    switch(location._) {
      case 'inputDocumentFileLocation': {
        let fileName = (location.file_name as string || '').split('.');
        let ext = fileName[fileName.length - 1] || '';

        if(options?.stickerType == 1 && !appWebpManager.isSupported()) {
          ext += '.png'
        }

        let thumbPart = location.thumb_size ? '_' + location.thumb_size : '';
        return (fileName[0] ? fileName[0] + '_' : '') + location.id + thumbPart + (ext ? '.' + ext : ext);
      }

      default: {
        if(!location.volume_id && !location.file_reference) {
          this.log.trace('Empty location', location);
        }

        let ext = 'jpg';
        if(options?.stickerType == 1 && !appWebpManager.isSupported()) {
          ext += '.png'
        }

        if(location.volume_id) {
          return location.volume_id + '_' + location.local_id + '.' + ext;
        } else {
          return location.id + '_' + location.access_hash + '.' + ext;
        }
      }
    }
  }

  public getTempFileName(file: any) {
    var size = file.size || -1;
    var random = nextRandomInt(0xFFFFFFFF);
    return '_temp' + random + '_' + size;
  }

  public getCachedFile(location: any) {
    if(!location) {
      return false;
    }
    var fileName = this.getFileName(location);

    return this.cachedDownloads[fileName] || false;
  }

  public getFileStorage(): typeof cacheStorage {
    return cacheStorage;
  }

  /* public isFileExists(location: any) {
    var fileName = this.getFileName(location);

    return this.cachedDownloads[fileName] || this.indexedKeys.has(fileName);
    //return this.cachedDownloads[fileName] || this.indexedKeys.has(fileName) ? Promise.resolve(true) : this.getFileStorage().isFileExists(fileName);
  } */

  public saveSmallFile(location: any, bytes: Uint8Array) {
    var fileName = this.getFileName(location);

    if(!this.cachedSavePromises[fileName]) {
      this.cachedSavePromises[fileName] = this.getFileStorage().saveFile(fileName, bytes).then((blob: any) => {
        return this.cachedDownloads[fileName] = blob;
      }, (error: any) => {
        delete this.cachedSavePromises[fileName];
      });
    }
    return this.cachedSavePromises[fileName];
  }

  public downloadSmallFile(location: any, options: Partial<{
    mimeType: string,
    dcID: number,
    stickerType: number
  }> = {}): Promise<Blob> {
    if(!FileManager.isAvailable()) {
      return Promise.reject({type: 'BROWSER_BLOB_NOT_SUPPORTED'});
    }

    /* if(!this.keysLoaded) {
      this.getIndexedKeys();
    } */

    //this.log('downloadSmallFile', location, options);

    let processSticker = false;
    if(options.stickerType == 1 && !appWebpManager.isSupported()) {
      processSticker = true;
      options.mimeType = 'image/png';
    }

    let dcID = options.dcID || location.dc_id;
    let mimeType = options.mimeType || 'image/jpeg';
    let fileName = this.getFileName(location, options);
    let cachedPromise = this.cachedSavePromises[fileName] || this.cachedDownloadPromises[fileName];

    //this.log('downloadSmallFile!', location, options, fileName, cachedPromise);

    if(cachedPromise) {
      return cachedPromise;
    }

    let fileStorage = this.getFileStorage();

    return this.cachedDownloadPromises[fileName] = fileStorage.getFile(fileName).then((blob) => {
      //throw '';
      //this.log('downloadSmallFile found photo by fileName:', fileName);
      return this.cachedDownloads[fileName] = blob;
    }).catch(() => {
      //this.log.warn('downloadSmallFile found no photo by fileName:', fileName);
      let downloadPromise = this.downloadRequest(dcID, () => {
        let inputLocation = location;
        if(!inputLocation._ || inputLocation._ == 'fileLocation') {
          inputLocation = Object.assign({}, location, {_: 'inputFileLocation'});
        }

        let params = {
          flags: 0,
          location: inputLocation,
          offset: 0,
          limit: 1024 * 1024
        };

        //this.log('next small promise', params);
        return apiManager.invokeApi('upload.getFile', params, {
          dcID: dcID,
          fileDownload: true,
          noErrorBox: true
        });
      }, dcID);

      let processDownloaded = (bytes: Uint8Array) => {
        //this.log('processDownloaded', location, bytes);

        if(processSticker) {
          return appWebpManager.convertToPng(bytes);
        }

        return Promise.resolve(bytes);
      };

      return fileStorage.getFileWriter(fileName, mimeType).then(fileWriter => {
        return downloadPromise.then((result: any) => {
          return processDownloaded(result.bytes).then((proccessedResult) => {
            return FileManager.write(fileWriter, proccessedResult).then(() => {
              return this.cachedDownloads[fileName] = fileWriter.finalize();
            });
          });
        });
      });
    });
  }

  public getDownloadedFile(location: any) {
    var fileStorage = this.getFileStorage();
    var fileName = typeof(location) !== 'string' ? this.getFileName(location) : location;

    //console.log('getDownloadedFile', location, fileName);

    return fileStorage.getFile(fileName);
  }

  /* public getIndexedKeys() {
    this.keysLoaded = true;
    this.getFileStorage().getAllKeys().then(keys => {
      this.indexedKeys.clear();
      this.indexedKeys = new Set(keys);
    });
  } */

  public downloadFile(dcID: number, location: any, size: number, options: Partial<{
    mimeType: string,
    toFileEntry: any,
    limitPart: number,
    stickerType: number
  }> = {}): CancellablePromise<Blob> {
    if(!FileManager.isAvailable()) {
      return Promise.reject({type: 'BROWSER_BLOB_NOT_SUPPORTED'});
    }

    /* if(!this.keysLoaded) {
      this.getIndexedKeys();
    } */

    let processSticker = false;
    if(options.stickerType == 1 && !appWebpManager.isSupported()) {
      if(options.toFileEntry || size > 524288) {
        delete options.stickerType;
      } else {
        processSticker = true;
        options.mimeType = 'image/png';
      }
    }

    // this.log('Dload file', dcID, location, size)
    let fileName = this.getFileName(location, options);
    let toFileEntry = options.toFileEntry || null;
    let cachedPromise = this.cachedSavePromises[fileName] || this.cachedDownloadPromises[fileName];
    let fileStorage = this.getFileStorage();

    //this.log('downloadFile', fileStorage.name, fileName, fileName.length, location, arguments);

    if(cachedPromise) {
      if(toFileEntry) {
        return cachedPromise.then((blob: any) => {
          return FileManager.copy(blob, toFileEntry);
        });
      }

      //this.log('downloadFile cachedPromise');

      if(size) {
        return cachedPromise.then((blob: Blob) => {
          if(blob.size < size) {
            this.log('downloadFile need to deleteFile, wrong size:', blob.size, size);

            return this.deleteFile(fileName).then(() => {
              return this.downloadFile(dcID, location, size, options);
            }).catch(() => {
              return this.downloadFile(dcID, location, size, options);
            });
          } else {
            return blob;
          }
        });
      } else {
        return cachedPromise;
      }
    }

    let deferred = deferredPromise<Blob>();

    var canceled = false;
    var resolved = false;
    var mimeType = options.mimeType || 'image/jpeg',
      cacheFileWriter: any;
    var errorHandler = (error: any) => {
      deferred.reject(error);
      errorHandler = () => {};

      if(cacheFileWriter && (!error || error.type != 'DOWNLOAD_CANCELED')) {
        cacheFileWriter.truncate(0);
      }
    };

    fileStorage.getFile(fileName).then(async(blob: Blob) => {
      //this.log('is that i wanted');
      //throw '';

      if(blob.size < size) {
        //this.log('downloadFile need to deleteFile 2, wrong size:', blob.size, size);
        await this.deleteFile(fileName);
        throw false;
      }

      if(toFileEntry) {
        FileManager.copy(blob, toFileEntry).then(() => {
          deferred.resolve();
        }, errorHandler);
      } else {
        deferred.resolve(this.cachedDownloads[fileName] = blob);
      }
    }).catch(() => {
      //this.log('not i wanted');
      //var fileWriterPromise = toFileEntry ? FileManager.getFileWriter(toFileEntry) : fileStorage.getFileWriter(fileName, mimeType);
      var fileWriterPromise = toFileEntry ? Promise.resolve(toFileEntry) : fileStorage.getFileWriter(fileName, mimeType);

      var processDownloaded = (bytes: Uint8Array) => {
        if(processSticker) {
          return appWebpManager.convertToPng(bytes);
        }

        return Promise.resolve(bytes);
      };

      fileWriterPromise.then((fileWriter: any) => {
        cacheFileWriter = fileWriter;
        var limit = options.limitPart || 524288,
          offset;
        var startOffset = 0;
        var writeFilePromise: CancellablePromise<unknown> = Promise.resolve(),
          writeFileDeferred: CancellablePromise<unknown>;

        if(fileWriter.length) {
          startOffset = fileWriter.length;
          
          if(startOffset >= size) {
            if(toFileEntry) {
              deferred.resolve();
            } else {
              deferred.resolve(this.cachedDownloads[fileName] = fileWriter.finalize());
            }

            return;
          }

          fileWriter.seek(startOffset);
          deferred.notify({done: startOffset, total: size});

          /////this.log('deferred notify 1:', {done: startOffset, total: size});
        }

        for(offset = startOffset; offset < size; offset += limit) {
          //writeFileDeferred = $q.defer();
          let writeFileDeferredHelper: any = {};
          writeFileDeferred = new Promise((resolve, reject) => {
            writeFileDeferredHelper.resolve = resolve;
            writeFileDeferredHelper.reject = reject;
          });
          Object.assign(writeFileDeferred, writeFileDeferredHelper);

          ////this.log('offset:', startOffset);

          ;((isFinal, offset, writeFileDeferred, writeFilePromise) => {
            return this.downloadRequest(dcID, () => {
              if(canceled) {
                return Promise.resolve();
              }

              return apiManager.invokeApi('upload.getFile', {
                flags: 0,
                location: location,
                offset: offset,
                limit: limit
              }, {
                dcID: dcID,
                fileDownload: true/* ,
                singleInRequest: 'safari' in window */
              });
            }, dcID).then((result: any) => {
              writeFilePromise.then(() => {
                if(canceled) {
                  return Promise.resolve();
                }

                return processDownloaded(result.bytes).then((processedResult) => {
                  return FileManager.write(fileWriter, processedResult).then(() => {
                    writeFileDeferred.resolve();
                  }, errorHandler).then(() => {
                    if(isFinal) {
                      resolved = true;

                      if(toFileEntry) {
                        deferred.resolve();
                      } else {
                        deferred.resolve(this.cachedDownloads[fileName] = fileWriter.finalize());
                      }
                    } else {
                      ////this.log('deferred notify 2:', {done: offset + limit, total: size}, deferred);
                      deferred.notify({done: offset + limit, total: size});
                    }
                  });
                });
              });
            }, errorHandler);
          })(offset + limit >= size, offset, writeFileDeferred, writeFilePromise);

          writeFilePromise = writeFileDeferred;
        }
      });
    });

    deferred.cancel = () => {
      if(!canceled && !resolved) {
        canceled = true;
        delete this.cachedDownloadPromises[fileName];
        errorHandler({type: 'DOWNLOAD_CANCELED'});
        if(toFileEntry) {
          toFileEntry.abort();
        }
      }
    };

    //console.log(deferred, deferred.notify, deferred.cancel);

    if(!toFileEntry) {
      this.cachedDownloadPromises[fileName] = deferred;
    }

    return deferred;
  }

  public deleteFile(fileName: string) {
    //this.log('will delete file:', fileName);

    delete this.cachedDownloadPromises[fileName];
    delete this.cachedDownloads[fileName];
    delete this.cachedSavePromises[fileName];

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

export default new ApiFileManager();
