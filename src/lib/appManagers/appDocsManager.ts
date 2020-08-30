import {RichTextProcessor} from '../richtextprocessor';
import { isObject, getFileURL, FileURLType } from '../utils';
import opusDecodeController from '../opusDecodeController';
import { MTDocument, inputDocumentFileLocation, MTPhotoSize } from '../../types';
import { getFileNameByLocation } from '../bin_utils';
import appDownloadManager, { DownloadBlob } from './appDownloadManager';
import appPhotosManager from './appPhotosManager';

class AppDocsManager {
  private docs: {[docID: string]: MTDocument} = {};

  public saveDoc(doc: MTDocument, context?: any) {
    //console.log('saveDoc', apiDoc, this.docs[apiDoc.id]);
    if(this.docs[doc.id]) {
      const d = this.docs[doc.id];

      if(doc.thumbs) {
        if(!d.thumbs) d.thumbs = doc.thumbs;
        /* else if(apiDoc.thumbs[0].bytes && !d.thumbs[0].bytes) {
          d.thumbs.unshift(apiDoc.thumbs[0]);
        } else if(d.thumbs[0].url) { // fix for converted thumb in safari
          apiDoc.thumbs[0] = d.thumbs[0];
        } */
      }

      d.file_reference = doc.file_reference;
      return d;

      //return Object.assign(d, apiDoc, context);
      //return context ? Object.assign(d, context) : d;
    }
    
    if(context) {
      Object.assign(doc, context);
    }

    this.docs[doc.id] = doc;
    
    doc.attributes.forEach((attribute: any) => {
      switch(attribute._) {
        case 'documentAttributeFilename':
          doc.file_name = RichTextProcessor.wrapPlainText(attribute.file_name);
          break;

        case 'documentAttributeAudio':
          doc.duration = attribute.duration;
          doc.audioTitle = attribute.title;
          doc.audioPerformer = attribute.performer;
          doc.type = attribute.pFlags.voice && doc.mime_type == "audio/ogg" ? 'voice' : 'audio';

          /* if(apiDoc.type == 'audio') {
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
            if(attribute.stickerset._ == 'inputStickerSetEmpty') {
              delete attribute.stickerset;
            } else if(attribute.stickerset._ == 'inputStickerSetID') {
              doc.stickerSetInput = attribute.stickerset;
            }
          }

          if(/* apiDoc.thumbs &&  */doc.mime_type == 'image/webp') {
            doc.type = 'sticker';
            doc.sticker = 1;
          }
          break;

        case 'documentAttributeImageSize':
          doc.w = attribute.w;
          doc.h = attribute.h;
          break;

        case 'documentAttributeAnimated':
          if((doc.mime_type == 'image/gif' || doc.mime_type == 'video/mp4')/*  && apiDoc.thumbs */) {
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

    if((doc.type == 'gif' && doc.size > 8e6) || doc.type == 'audio' || doc.type == 'video') {
      doc.supportsStreaming = true;
      
      if(!doc.url) {
        doc.url = this.getFileURL(doc);
      }
    }

    // for testing purposes
    //doc.supportsStreaming = false;
    
    if(!doc.file_name) {
      doc.file_name = '';
    }

    if(doc.mime_type == 'application/x-tgsticker' && doc.file_name == "AnimatedSticker.tgs") {
      doc.type = 'sticker';
      doc.animated = true;
      doc.sticker = 2;
    }
    
    if(doc._ == 'documentEmpty') {
      doc.size = 0;
    }

    /* if(!doc.url) {
      doc.url = this.getFileURL(doc);
    } */

    return doc;
  }
  
  public getDoc(docID: string | MTDocument): MTDocument {
    return isObject(docID) && typeof(docID) !== 'string' ? docID : this.docs[docID as string];
  }

  public getMediaInput(doc: MTDocument) {
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

  public getInput(doc: MTDocument, thumbSize?: string): inputDocumentFileLocation {
    return {
      _: 'inputDocumentFileLocation',
      id: doc.id,
      access_hash: doc.access_hash,
      file_reference: doc.file_reference,
      thumb_size: thumbSize
    };
  }

  public getFileDownloadOptions(doc: MTDocument, thumb?: MTPhotoSize) {
    const inputFileLocation = this.getInput(doc, thumb?.type);

    let mimeType: string;
    if(thumb) {
      mimeType = doc.sticker ? 'image/webp' : 'image/jpeg'/* doc.mime_type */;
    } else {
      mimeType = doc.mime_type || 'application/octet-stream';
    }

    return {
      dcID: doc.dc_id, 
      location: inputFileLocation, 
      size: thumb ? thumb.size : doc.size, 
      mimeType: mimeType,
      fileName: doc.file_name
    };
  }

  public getFileURL(doc: MTDocument, download = false, thumb?: MTPhotoSize) {
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

  public getThumbURL(doc: MTDocument, thumb: MTPhotoSize) {
    let promise: Promise<any> = Promise.resolve();

    if(!thumb.url) {
      if(thumb.bytes) {
        thumb.url = appPhotosManager.getPreviewURLFromBytes(thumb.bytes, !!doc.sticker);
      } else {
        //return this.getFileURL(doc, false, thumb);
        promise = this.downloadDocNew(doc, thumb);
      }
    }

    return {thumb, promise};
  }

  public getThumb(doc: MTDocument, useBytes = true) {
    if(doc.thumbs?.length) {
      let thumb: MTPhotoSize;
      if(!useBytes) {
        thumb = doc.thumbs.find(t => !t.bytes);
      }
      
      if(!thumb) {
        thumb = doc.thumbs[0];
      }

      return this.getThumbURL(doc, thumb);
    }

    return null;
  }

  public getInputFileName(doc: MTDocument, thumbSize?: string) {
    return getFileNameByLocation(this.getInput(doc, thumbSize), {fileName: doc.file_name});
  }

  public downloadDocNew(docID: string | MTDocument, thumb?: MTPhotoSize): DownloadBlob {
    const doc = this.getDoc(docID);

    if(doc._ == 'documentEmpty') {
      throw new Error('Document empty!');
    }

    const fileName = this.getInputFileName(doc, thumb?.type);

    let download: DownloadBlob = appDownloadManager.getDownload(fileName);
    if(download) {
      return download;
    }

    const downloadOptions = this.getFileDownloadOptions(doc, thumb);
    download = appDownloadManager.download(downloadOptions);

    const originalPromise = download;
    originalPromise.then((blob) => {
      if(thumb) {
        thumb.url = URL.createObjectURL(blob);
        return;
      } else if(!doc.supportsStreaming) {
        doc.url = URL.createObjectURL(blob);
      }

      doc.downloaded = true;
    });

    if(doc.type == 'voice' && !opusDecodeController.isPlaySupported()) {
      download = originalPromise.then(async(blob) => {
        let reader = new FileReader();
  
        await new Promise((resolve, reject) => {
          reader.onloadend = (e) => {
            let uint8 = new Uint8Array(e.target.result as ArrayBuffer);
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

  public saveDocFile(doc: MTDocument) {
    const options = this.getFileDownloadOptions(doc);
    return appDownloadManager.downloadToDisc(options, doc.file_name);
  }
}

const appDocsManager = new AppDocsManager();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appDocsManager = appDocsManager;
}
export default appDocsManager;
