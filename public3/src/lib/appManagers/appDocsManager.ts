import apiFileManager from '../mtproto/apiFileManager';
import FileManager from '../filemanager';
import {RichTextProcessor} from '../richtextprocessor';
import { CancellablePromise, deferredPromise } from '../polyfill';
import { isObject } from '../utils';
import opusDecodeController from '../opusDecodeController';
import { MTDocument } from '../../types';
import MP4Source from '../MP4Source';
import { bufferConcat } from '../bin_utils';

class AppDocsManager {
  private docs: {[docID: string]: MTDocument} = {};
  private thumbs: {[docIDAndSize: string]: Promise<string>} = {};
  private downloadPromises: {[docID: string]: CancellablePromise<Blob>} = {};

  private videoChunks: {[docID: string]: CancellablePromise<ArrayBuffer>[]} = {};
  private videoChunksQueue: {[docID: string]: {offset: number}[]} = {};
  
  private loadedMP4Box: Promise<void>;
  private mp4Source: MP4Source;

  public saveDoc(apiDoc: MTDocument, context?: any) {
    //console.log('saveDoc', apiDoc, this.docs[apiDoc.id]);
    if(this.docs[apiDoc.id]) {
      let d = this.docs[apiDoc.id];

      if(apiDoc.thumbs) {
        if(!d.thumbs) d.thumbs = apiDoc.thumbs;
        else if(apiDoc.thumbs[0].bytes && !d.thumbs[0].bytes) {
          d.thumbs.unshift(apiDoc.thumbs[0]);
        }
      }

      return Object.assign(d, apiDoc, context);
      //return context ? Object.assign(d, context) : d;
    }
    
    if(context) {
      Object.assign(apiDoc, context);
    }

    this.docs[apiDoc.id] = apiDoc;
    
    if(apiDoc.thumb && apiDoc.thumb._ == 'photoCachedSize') {
      console.warn('this will happen!!!');
      apiFileManager.saveSmallFile(apiDoc.thumb.location, apiDoc.thumb.bytes);
      
      // Memory
      apiDoc.thumb.size = apiDoc.thumb.bytes.length;
      delete apiDoc.thumb.bytes;
      apiDoc.thumb._ = 'photoSize';
    }
    
    if(apiDoc.thumb && apiDoc.thumb._ == 'photoSizeEmpty') {
      delete apiDoc.thumb;
    }
    
    apiDoc.attributes.forEach((attribute: any) => {
      switch(attribute._) {
        case 'documentAttributeFilename':
          apiDoc.file_name = RichTextProcessor.wrapPlainText(attribute.file_name);
          break;

        case 'documentAttributeAudio':
          apiDoc.duration = attribute.duration;
          apiDoc.audioTitle = attribute.title;
          apiDoc.audioPerformer = attribute.performer;
          apiDoc.type = attribute.pFlags.voice && apiDoc.mime_type == "audio/ogg" ? 'voice' : 'audio';
          break;

        case 'documentAttributeVideo':
          apiDoc.duration = attribute.duration;
          apiDoc.w = attribute.w;
          apiDoc.h = attribute.h;
          apiDoc.supportsStreaming = attribute.pFlags?.supports_streaming && apiDoc.size > 524288 && typeof(MediaSource) !== 'undefined';
          if(apiDoc.thumbs && attribute.pFlags.round_message) {
            apiDoc.type = 'round';
          } else /* if(apiDoc.thumbs) */ {
            apiDoc.type = 'video';
          }
          break;

        case 'documentAttributeSticker':
          if(attribute.alt !== undefined) {
            apiDoc.stickerEmojiRaw = attribute.alt;
            apiDoc.stickerEmoji = RichTextProcessor.wrapRichText(apiDoc.stickerEmojiRaw, {noLinks: true, noLinebreaks: true});
          }

          if(attribute.stickerset) {
            if(attribute.stickerset._ == 'inputStickerSetEmpty') {
              delete attribute.stickerset;
            } else if(attribute.stickerset._ == 'inputStickerSetID') {
              apiDoc.stickerSetInput = attribute.stickerset;
            }
          }

          if(/* apiDoc.thumbs &&  */apiDoc.mime_type == 'image/webp') {
            apiDoc.type = 'sticker';
            apiDoc.sticker = 1;
          }
          break;

        case 'documentAttributeImageSize':
          apiDoc.w = attribute.w;
          apiDoc.h = attribute.h;
          break;

        case 'documentAttributeAnimated':
          if((apiDoc.mime_type == 'image/gif' || apiDoc.mime_type == 'video/mp4') && apiDoc.thumbs) {
            apiDoc.type = 'gif';
          }

          apiDoc.animated = true;
          break;
      }
    });
    
    if(!apiDoc.mime_type) {
      switch(apiDoc.type) {
        case 'gif':
          apiDoc.mime_type = 'video/mp4';
          break;
        case 'video':
        case 'round':
          apiDoc.mime_type = 'video/mp4';
          break;
        case 'sticker':
          apiDoc.mime_type = 'image/webp';
          break;
        case 'audio':
          apiDoc.mime_type = 'audio/mpeg';
          break;
        case 'voice':
          apiDoc.mime_type = 'audio/ogg';
          break;
        default:
          apiDoc.mime_type = 'application/octet-stream';
          break;
      }
    }
    
    if(!apiDoc.file_name) {
      apiDoc.file_name = '';
    }

    if(apiDoc.mime_type == 'application/x-tgsticker' && apiDoc.file_name == "AnimatedSticker.tgs") {
      apiDoc.type = 'sticker';
      apiDoc.animated = true;
      apiDoc.sticker = 2;
    }
    
    if(apiDoc._ == 'documentEmpty') {
      apiDoc.size = 0;
    }

    return apiDoc;
  }
  
  public getDoc(docID: any): MTDocument {
    return isObject(docID) ? docID : this.docs[docID];
  }

  public getMediaInputByID(docID: any) {
    let doc = this.getDoc(docID);
    return {
      _: 'inputMediaDocument',
      flags: 0,
      id: {
        _: 'inputDocument',
        id: doc.id,
        access_hash: doc.access_hash,
        file_reference: doc.file_reference
      },
      ttl_seconds: 0
    };
  }

  public getInputByID(docID: any, thumbSize?: string) {
    let doc = this.getDoc(docID);

    return {
      _: 'inputDocumentFileLocation',
      id: doc.id,
      access_hash: doc.access_hash,
      file_reference: doc.file_reference,
      thumb_size: thumbSize
    };
  }
  
  public getFileName(doc: MTDocument) {
    if(doc.file_name) {
      return doc.file_name;
    }

    var fileExt = '.' + doc.mime_type.split('/')[1];
    if(fileExt == '.octet-stream') {
      fileExt = '';
    }

    return 't_' + (doc.type || 'file') + doc.id + fileExt;
  }

  private loadMP4Box() {
    if(this.loadedMP4Box) return this.loadedMP4Box;

    return this.loadedMP4Box = new Promise((resolve, reject) => {
      (window as any).mp4BoxLoaded = () => {
        //console.log('webpHero loaded');
        this.mp4Source = (window as any).MP4Source;
        resolve();
      };
    
      let sc = document.createElement('script');
      sc.src = 'mp4box.all.min.js';
      sc.async = true;
      sc.onload = (window as any).mp4BoxLoaded;
    
      document.body.appendChild(sc);
    });
  }

  private createMP4Stream(doc: MTDocument) {
    const limitPart = 524288;
    const chunks = this.videoChunks[doc.id];
    const queue = this.videoChunksQueue[doc.id];

    //let mp4Source = new MP4Source({duration: doc.duration, video: {expected_size: doc.size}}, (offset: number, end: number) => {
    let mp4Source = new (this.mp4Source as any)({duration: doc.duration, video: {expected_size: doc.size}}, (offset: number, end: number) => {
      const chunkStart = offset - (offset % limitPart);

      const sorted: typeof queue = [];
      const lower: typeof queue = [];
      for(let i = 0; i < queue.length; ++i) {
        if(queue[i].offset >= chunkStart) {
          sorted.push(queue[i]);
        } else {
          lower.push(queue[i]);
        }
      }
      sorted.sort((a, b) => a.offset - b.offset).concat(lower).forEach((q, i) => {
        queue[i] = q;
      });

      const index1 = offset / limitPart | 0;
      const index2 = end / limitPart | 0;
      
      const p = chunks.slice(index1, index2 + 1);

      //console.log('MP4Source getBuffer:', offset, end, index1, index2, doc.size, JSON.stringify(queue));

      if(offset % limitPart == 0) {
        return p[0];
      } else {
        return Promise.all(p).then(buffers => {
          const buffer = buffers.length > 1 ? bufferConcat(buffers[0], buffers[1]) : buffers[0];
          const start = (offset % limitPart);
          const _end = start + (end - offset);

          const sliced = buffer.slice(start, _end);
          //console.log('slice buffer:', sliced);
          return sliced;
        });
      }
    });

    return mp4Source;
  }

  private mp4Stream(doc: MTDocument, deferred: CancellablePromise<Blob>) {
    const limitPart = 524288;
    const promises = this.videoChunks[doc.id] ?? (this.videoChunks[doc.id] = []);
    if(!promises.length) {
      for(let offset = 0; offset < doc.size; offset += limitPart) {
        const deferred = deferredPromise<ArrayBuffer>();
        promises.push(deferred);
      }
    }

    let good = false;
    return async(bytes: Uint8Array, offset: number, queue: {offset: number}[]) => {
      if(!deferred.isFulfilled && !deferred.isRejected/*  && offset == 0 */) {
        this.videoChunksQueue[doc.id] = queue;
        console.log('stream:', doc, doc.url, deferred);
        //doc.url = mp4Source.getURL();
        //deferred.resolve(mp4Source);
        deferred.resolve();
        good = true;
      } else if(!good) {
        //mp4Source.stop();
        //mp4Source = null;
        promises.length = 0;
        return;
      }
      
      const index = offset % limitPart == 0 ? offset / limitPart : promises.length - 1;
      promises[index].resolve(bytes.slice().buffer);
      //console.log('i wont believe in you', doc, bytes, offset, promises, bytes.length, bytes.buffer.byteLength, bytes.slice().buffer);
      //console.log('i wont believe in you', bytes, doc, bytes.length, offset);
    };
  }

  public downloadVideo(docID: string): CancellablePromise<MP4Source | Blob> {
    const doc = this.getDoc(docID);
    if(!doc.supportsStreaming || doc.url) {
      return this.downloadDoc(docID);
    }

    const deferred = deferredPromise<Blob>();
    let canceled = false;
    deferred.cancel = () => {
      canceled = true;
    };

    this.loadMP4Box().then(() => {
      if(canceled) {
        throw 'canceled';
      }

      const promise = this.downloadDoc(docID);

      deferred.cancel = () => {
        promise.cancel();
      };
  
      promise.notify = (...args) => {
        deferred.notify && deferred.notify(...args);
      };
  
      promise.then(() => {
        if(doc.url) { // может быть уже загружен из кэша
          deferred.resolve();
        } else {
          deferred.resolve(this.createMP4Stream(doc));
        }
      });
    }, deferred.reject);

    return deferred;
  }

  public downloadDoc(docID: any, toFileEntry?: any): CancellablePromise<Blob> {
    const doc = this.getDoc(docID);

    if(doc._ == 'documentEmpty') {
      return Promise.reject();
    }
    
    const inputFileLocation = this.getInputByID(doc);
    if(doc.downloaded && !toFileEntry) {
      if(doc.url) return Promise.resolve(null);

      const cachedBlob = apiFileManager.getCachedFile(inputFileLocation);
      if(cachedBlob) {
        return Promise.resolve(cachedBlob);
      }
    }

    if(this.downloadPromises[doc.id]) {
      return this.downloadPromises[doc.id];
    }
    
    //historyDoc.progress = {enabled: !historyDoc.downloaded, percent: 1, total: doc.size};

    const deferred = deferredPromise<Blob>();
    deferred.cancel = () => {
      downloadPromise.cancel();
    };

    const processPart = doc.supportsStreaming ? this.mp4Stream(doc, deferred) : undefined;

    // нет смысла делать объект с выполняющимися промисами, нижняя строка и так вернёт загружающийся
    const downloadPromise = apiFileManager.downloadFile(doc.dc_id, inputFileLocation, doc.size, {
      mimeType: doc.mime_type || 'application/octet-stream',
      toFileEntry: toFileEntry,
      stickerType: doc.sticker,
      processPart
    });

    downloadPromise.notify = (...args) => {
      deferred.notify && deferred.notify(...args);
    };

    //deferred.notify = downloadPromise.notify;
    
    downloadPromise.then((blob) => {
      if(blob) {
        doc.downloaded = true;

        if(doc.type == 'voice' && !opusDecodeController.isPlaySupported()/*  && false */) {
          let reader = new FileReader();

          reader.onloadend = (e) => {
            let uint8 = new Uint8Array(e.target.result as ArrayBuffer);
            //console.log('sending uint8 to decoder:', uint8);
            opusDecodeController.decode(uint8).then(result => {
              doc.url = result.url;
              deferred.resolve(blob);
            }, (err) => {
              delete doc.downloaded;
              deferred.reject(err);
            });
          };

          reader.readAsArrayBuffer(blob);

          return;
        } else if(doc.type && doc.sticker != 2) {
          /* if(processPart) {
            console.log('stream after:', doc, doc.url, deferred);
          } */

          doc.url = URL.createObjectURL(blob);
        }
      }
      
      deferred.resolve(blob);
    }, (e) => {
      console.log('document download failed', e);
      deferred.reject(e);
      //historyDoc.progress.enabled = false;
    }).finally(() => {
      deferred.notify = downloadPromise.notify = deferred.cancel = downloadPromise.cancel = null;
    });

    /* downloadPromise.notify = (progress) => {
      console.log('dl progress', progress);
      historyDoc.progress.enabled = true;
      historyDoc.progress.done = progress.done;
      historyDoc.progress.percent = Math.max(1, Math.floor(100 * progress.done / progress.total));
      $rootScope.$broadcast('history_update');
    }; */
    
    //historyDoc.progress.cancel = downloadPromise.cancel;

    //console.log('return downloadPromise:', downloadPromise);
    
    return this.downloadPromises[doc.id] = deferred;
  }

  public downloadDocThumb(docID: any, thumbSize: string) {
    let doc = this.getDoc(docID);

    let key = doc.id + '-' + thumbSize;
    if(this.thumbs[key]) {
      return this.thumbs[key];
    }

    let input = this.getInputByID(doc, thumbSize);

    if(doc._ == 'documentEmpty') {
      return Promise.reject();
    }

    let mimeType = doc.sticker ? 'image/webp' : doc.mime_type;
    let promise = apiFileManager.downloadSmallFile(input, {
      dcID: doc.dc_id, 
      stickerType: doc.sticker ? 1 : undefined,
      mimeType: mimeType
    });

    return this.thumbs[key] = promise.then((blob) => {
      return URL.createObjectURL(blob);
    });
  }

  public hasDownloadedThumb(docID: string, thumbSize: string) {
    return !!this.thumbs[docID + '-' + thumbSize];
  }
  
  public async saveDocFile(docID: string) {
    var doc = this.docs[docID];
    var fileName = this.getFileName(doc);
    var ext = (fileName.split('.', 2) || [])[1] || '';

    try {
      let writer = FileManager.chooseSaveFile(fileName, ext, doc.mime_type, doc.size);
      await writer.ready;

      let promise = this.downloadDoc(docID, writer);
      promise.then(() => {
        writer.close();
        console.log('saved doc', doc);
      });

      //console.log('got promise from downloadDoc', promise);
  
      return {promise};
    } catch(err) {
      let promise = this.downloadDoc(docID);
      promise.then((blob) => {
        FileManager.download(blob, doc.mime_type, fileName)
      });

      return {promise};
    }
  }
}

const appDocsManager = new AppDocsManager();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appDocsManager = appDocsManager;
}
export default appDocsManager;
