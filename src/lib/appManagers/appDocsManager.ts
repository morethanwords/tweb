import FileManager from '../filemanager';
import {RichTextProcessor} from '../richtextprocessor';
import { CancellablePromise, deferredPromise } from '../polyfill';
import { isObject, getFileURL } from '../utils';
import opusDecodeController from '../opusDecodeController';
import { MTDocument, inputDocumentFileLocation } from '../../types';

class AppDocsManager {
  private docs: {[docID: string]: MTDocument} = {};
  private thumbs: {[docIDAndSize: string]: Promise<string>} = {};
  private downloadPromises: {[docID: string]: CancellablePromise<Blob>} = {};

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
  
  public getDoc(docID: string | MTDocument): MTDocument {
    return isObject(docID) && typeof(docID) !== 'string' ? docID : this.docs[docID as string];
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

  public getInputByID(docID: any, thumbSize?: string): inputDocumentFileLocation {
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

  public getFileURLByDoc(doc: MTDocument) {
    const inputFileLocation = this.getInputByID(doc);
    return getFileURL('document', {dcID: doc.dc_id, location: inputFileLocation, size: doc.size, mimeType: doc.mime_type || 'application/octet-stream'});
  }

  public downloadDoc(docID: string | MTDocument, toFileEntry?: any): CancellablePromise<Blob> {
    const doc = this.getDoc(docID);

    if(doc._ == 'documentEmpty') {
      return Promise.reject();
    }
    
    if(doc.downloaded && !toFileEntry) {
      if(doc.url) return Promise.resolve(null);

      /* const cachedBlob = apiFileManager.getCachedFile(inputFileLocation);
      if(cachedBlob) {
        return Promise.resolve(cachedBlob);
      } */
    }

    if(this.downloadPromises[doc.id]) {
      return this.downloadPromises[doc.id];
    }
    
    const deferred = deferredPromise<Blob>();

    /* if(doc.supportsStreaming) {
      doc.url = '/stream/' + '';
    } */
    
    const url = this.getFileURLByDoc(doc);
    fetch(url).then(res => res.blob())
    /* downloadPromise */.then((blob) => {
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
          doc.url = url;
        }
      }
      
      deferred.resolve(blob);
    }, (e) => {
      console.log('document download failed', e);
      deferred.reject(e);
    }).finally(() => {
      //deferred.notify = downloadPromise.notify = deferred.cancel = downloadPromise.cancel = null;
    });

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

    const url = getFileURL('thumb', {dcID: doc.dc_id, location: input, mimeType: doc.sticker ? 'image/webp' : doc.mime_type});
    return this.thumbs[key] = Promise.resolve(url);
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
