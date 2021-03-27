import { FileURLType, getFileNameByLocation, getFileURL } from '../../helpers/fileName';
import { safeReplaceArrayInObject, defineNotNumerableProperties, isObject } from '../../helpers/object';
import { Document, InputFileLocation, PhotoSize } from '../../layer';
import referenceDatabase, { ReferenceContext } from '../mtproto/referenceDatabase';
import opusDecodeController from '../opusDecodeController';
import { RichTextProcessor } from '../richtextprocessor';
import webpWorkerController from '../webp/webpWorkerController';
import appDownloadManager, { DownloadBlob } from './appDownloadManager';
import appPhotosManager from './appPhotosManager';
import blur from '../../helpers/blur';
import apiManager from '../mtproto/mtprotoworker';
import { MOUNT_CLASS_TO } from '../../config/debug';

export type MyDocument = Document.document;

// TODO: если залить картинку файлом, а потом перезайти в диалог - превьюшка заново скачается

export class AppDocsManager {
  private docs: {[docId: string]: MyDocument} = {};
  private savingLottiePreview: {[docId: string]: true} = {};

  public onServiceWorkerFail() {
    for(const id in this.docs) {
      const doc = this.docs[id];
      delete doc.supportsStreaming;
      delete doc.url;
    }
  }

  public saveDoc(doc: Document, context?: ReferenceContext): MyDocument {
    if(doc._ === 'documentEmpty') {
      return undefined;
    }

    const oldDoc = this.docs[doc.id];

    if(doc.file_reference) { // * because we can have a new object w/o the file_reference while sending
      safeReplaceArrayInObject('file_reference', oldDoc, doc);
      referenceDatabase.saveContext(doc.file_reference, context);
    }
    
    //console.log('saveDoc', apiDoc, this.docs[apiDoc.id]);
    if(oldDoc) {
      //if(doc._ !== 'documentEmpty' && doc._ === d._) {
        if(doc.thumbs) {
          if(!oldDoc.thumbs) oldDoc.thumbs = doc.thumbs;
          /* else if(apiDoc.thumbs[0].bytes && !d.thumbs[0].bytes) {
            d.thumbs.unshift(apiDoc.thumbs[0]);
          } else if(d.thumbs[0].url) { // fix for converted thumb in safari
            apiDoc.thumbs[0] = d.thumbs[0];
          } */
        }

      //}

      return oldDoc;

      //return Object.assign(d, apiDoc, context);
      //return context ? Object.assign(d, context) : d;
    }

    this.docs[doc.id] = doc;

    // * exclude from state
    // defineNotNumerableProperties(doc, [/* 'thumbs',  */'type', 'h', 'w', 'file_name', 
    // 'file', 'duration', 'downloaded', 'url', 'audioTitle', 
    // 'audioPerformer', 'sticker', 'stickerEmoji', 'stickerEmojiRaw', 
    // 'stickerSetInput', 'stickerThumbConverted', 'animated', 'supportsStreaming']);
    defineNotNumerableProperties(doc, ['downloaded', 'url']);
    
    doc.attributes.forEach(attribute => {
      switch(attribute._) {
        case 'documentAttributeFilename':
          doc.file_name = RichTextProcessor.wrapPlainText(attribute.file_name);
          break;

        case 'documentAttributeAudio':
          doc.duration = attribute.duration;
          doc.audioTitle = attribute.title;
          doc.audioPerformer = attribute.performer;
          doc.type = attribute.pFlags.voice && doc.mime_type === "audio/ogg" ? 'voice' : 'audio';

          /* if(apiDoc.type === 'audio') {
            apiDoc.supportsStreaming = true;
          } */
          break;

        case 'documentAttributeVideo':
          doc.duration = attribute.duration;
          doc.w = attribute.w;
          doc.h = attribute.h;
          //apiDoc.supportsStreaming = attribute.pFlags?.supports_streaming/*  && apiDoc.size > 524288 */;
          if(/* apiDoc.thumbs &&  */attribute.pFlags.round_message) {
            doc.type = 'round';
          } else /* if(apiDoc.thumbs) */ {
            doc.type = 'video';
          }
          break;

        case 'documentAttributeSticker':
          if(attribute.alt !== undefined) {
            doc.stickerEmojiRaw = attribute.alt;
            doc.stickerEmoji = RichTextProcessor.wrapRichText(doc.stickerEmojiRaw, {noLinks: true, noLinebreaks: true});
          }

          if(attribute.stickerset) {
            if(attribute.stickerset._ === 'inputStickerSetEmpty') {
              delete attribute.stickerset;
            } else if(attribute.stickerset._ === 'inputStickerSetID') {
              doc.stickerSetInput = attribute.stickerset;
            }
          }

          // * there can be no thumbs, then it is a document
          if(/* apiDoc.thumbs &&  */doc.mime_type === 'image/webp' && (doc.thumbs || webpWorkerController.isWebpSupported())) {
            doc.type = 'sticker';
            doc.sticker = 1;
          }
          break;

        case 'documentAttributeImageSize':
          doc.type = 'photo';
          doc.w = attribute.w;
          doc.h = attribute.h;
          break;

        case 'documentAttributeAnimated':
          if((doc.mime_type === 'image/gif' || doc.mime_type === 'video/mp4')/*  && apiDoc.thumbs */) {
            doc.type = 'gif';
          }

          doc.animated = true;
          break;
      }
    });
    
    if(!doc.mime_type) {
      switch(doc.type) {
        case 'gif':
        case 'video':
        case 'round':
          doc.mime_type = 'video/mp4';
          break;
        case 'sticker':
          doc.mime_type = 'image/webp';
          break;
        case 'audio':
          doc.mime_type = 'audio/mpeg';
          break;
        case 'voice':
          doc.mime_type = 'audio/ogg';
          break;
        default:
          doc.mime_type = 'application/octet-stream';
          break;
      }
    }

    if(apiManager.isServiceWorkerOnline()) {
      if((doc.type === 'gif' && doc.size > 8e6) || doc.type === 'audio' || doc.type === 'video') {
        doc.supportsStreaming = true;
        
        if(!doc.url) {
          doc.url = this.getFileURL(doc);
        }
      }
    }

    // for testing purposes
    // doc.supportsStreaming = false;
    // doc.url = ''; // * this will break upload urls
    
    if(!doc.file_name) {
      doc.file_name = '';
    }

    if(doc.mime_type === 'application/x-tgsticker' && doc.file_name === "AnimatedSticker.tgs") {
      doc.type = 'sticker';
      doc.animated = true;
      doc.sticker = 2;
    }

    /* if(!doc.url) {
      doc.url = this.getFileURL(doc);
    } */

    return doc;
  }
  
  public getDoc(docId: string | MyDocument): MyDocument {
    return isObject(docId) && typeof(docId) !== 'string' ? docId as any : this.docs[docId as string] as any;
  }

  public getMediaInput(doc: MyDocument) {
    return {
      _: 'inputMediaDocument',
      id: {
        _: 'inputDocument',
        id: doc.id,
        access_hash: doc.access_hash,
        file_reference: doc.file_reference
      },
      ttl_seconds: 0
    };
  }

  public getInput(doc: MyDocument, thumbSize?: string): InputFileLocation.inputDocumentFileLocation {
    return {
      _: 'inputDocumentFileLocation',
      id: doc.id,
      access_hash: doc.access_hash,
      file_reference: doc.file_reference,
      thumb_size: thumbSize
    };
  }

  public getFileDownloadOptions(doc: MyDocument, thumb?: PhotoSize.photoSize, queueId?: number, onlyCache?: boolean) {
    const inputFileLocation = this.getInput(doc, thumb?.type);

    let mimeType: string;
    if(thumb) {
      mimeType = doc.sticker ? 'image/webp' : 'image/jpeg'/* doc.mime_type */;
    } else {
      mimeType = doc.mime_type || 'application/octet-stream';
    }

    return {
      dcId: doc.dc_id, 
      location: inputFileLocation, 
      size: thumb ? thumb.size : doc.size, 
      mimeType: mimeType,
      fileName: doc.file_name,
      queueId,
      onlyCache
    };
  }

  public getFileURL(doc: MyDocument, download = false, thumb?: PhotoSize.photoSize) {
    let type: FileURLType;
    if(download) {
      type = 'download';
    } else if(thumb) {
      type = 'thumb';
    } else if(doc.supportsStreaming) {
      type = 'stream';
    } else {
      type = 'document';
    }

    return getFileURL(type, this.getFileDownloadOptions(doc, thumb));
  }

  public getThumbURL(doc: MyDocument, thumb: PhotoSize.photoSize | PhotoSize.photoCachedSize | PhotoSize.photoStrippedSize) {
    let promise: Promise<any> = Promise.resolve();

    if(!thumb.url) {
      if('bytes' in thumb) {
        promise = blur(appPhotosManager.getPreviewURLFromBytes(thumb.bytes, !!doc.sticker)).then(url => {
          defineNotNumerableProperties(thumb, ['url']); // * exclude from state
          const cacheContext = appPhotosManager.getCacheContext(doc);
          cacheContext.url = thumb.url = url;
        }) as any;
      } else {
        //return this.getFileURL(doc, false, thumb);
        promise = appPhotosManager.preloadPhoto(doc, thumb) as any;
      }
    }

    return {thumb, promise};
  }

  public getThumb(doc: MyDocument, tryNotToUseBytes = true) {
    const thumb = appPhotosManager.choosePhotoSize(doc, 0, 0, !tryNotToUseBytes);
    if(thumb._ === 'photoSizeEmpty') return null;
    return this.getThumbURL(doc, thumb as any);
  }

  public getInputFileName(doc: MyDocument, thumbSize?: string) {
    return getFileNameByLocation(this.getInput(doc, thumbSize), {fileName: doc.file_name});
  }

  public downloadDoc(doc: MyDocument, queueId?: number, onlyCache?: boolean): DownloadBlob {
    const fileName = this.getInputFileName(doc);

    let download: DownloadBlob = appDownloadManager.getDownload(fileName);
    if(download) {
      return download;
    }

    const downloadOptions = this.getFileDownloadOptions(doc, undefined, queueId, onlyCache);
    download = appDownloadManager.download(downloadOptions);

    const originalPromise = download;
    originalPromise.then((blob) => {
      doc.url = URL.createObjectURL(blob);
      doc.downloaded = true;
    }, () => {});
    
    if(doc.type === 'voice' && !opusDecodeController.isPlaySupported()) {
      download = originalPromise.then(async(blob) => {
        const reader = new FileReader();
  
        await new Promise<void>((resolve, reject) => {
          reader.onloadend = (e) => {
            const uint8 = new Uint8Array(e.target.result as ArrayBuffer);
            //console.log('sending uint8 to decoder:', uint8);
            opusDecodeController.decode(uint8).then(result => {
              doc.url = result.url;
              resolve();
            }, (err) => {
              delete doc.downloaded;
              reject(err);
            });
          };
    
          reader.readAsArrayBuffer(blob);
        });
  
        return blob;
      });
    }

    return download;
  }

  public saveLottiePreview(doc: MyDocument, canvas: HTMLCanvasElement, toneIndex: number) {
    const key = doc.id + '-' + toneIndex;
    if(this.savingLottiePreview[key]/*  || true */) return;

    if(!doc.stickerCachedThumbs) {
      defineNotNumerableProperties(doc, ['stickerCachedThumbs']);
      doc.stickerCachedThumbs = {};
    }

    const thumb = doc.stickerCachedThumbs[toneIndex];
    if(thumb && thumb.w >= canvas.width && thumb.h >= canvas.height) {
      return;
    }

    /* if(doc.thumbs.find(t => t._ === 'photoStrippedSize') 
      || (doc.stickerCachedThumb || (doc.stickerSavedThumbWidth >= canvas.width && doc.stickerSavedThumbHeight >= canvas.height))) {
      return;
    } */

    this.savingLottiePreview[key] = true;
    canvas.toBlob((blob) => {
      //console.log('got lottie preview', doc, blob, URL.createObjectURL(blob));

      const thumb = {
        url: URL.createObjectURL(blob),
        w: canvas.width,
        h: canvas.height
      };

      doc.stickerCachedThumbs[toneIndex] = thumb;

      delete this.savingLottiePreview[key];
      
      /* const reader = new FileReader();
      reader.onloadend = (e) => {
        const uint8 = new Uint8Array(e.target.result as ArrayBuffer);
        const thumb: PhotoSize.photoStrippedSize = {
          _: 'photoStrippedSize',
          bytes: uint8,
          type: 'i'
        };

        doc.stickerSavedThumbWidth = canvas.width;
        doc.stickerSavedThumbHeight = canvas.width;

        defineNotNumerableProperties(thumb, ['url']);
        thumb.url = URL.createObjectURL(blob);
        doc.thumbs.findAndSplice(t => t._ === thumb._);
        doc.thumbs.unshift(thumb);

        if(!webpWorkerController.isWebpSupported()) {
          doc.pFlags.stickerThumbConverted = true;
        }

        delete this.savingLottiePreview[doc.id];
      };
      reader.readAsArrayBuffer(blob); */
    });
  }

  public saveDocFile(doc: MyDocument, queueId?: number) {
    /* const options = this.getFileDownloadOptions(doc, undefined, queueId);
    return appDownloadManager.downloadToDisc(options, doc.file_name); */
    const promise = this.downloadDoc(doc, queueId);
    promise.then(() => {
      appDownloadManager.createDownloadAnchor(doc.url, doc.file_name);
    });
    return promise;
  }
}

const appDocsManager = new AppDocsManager();
MOUNT_CLASS_TO.appDocsManager = appDocsManager;
export default appDocsManager;
