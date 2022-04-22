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

import type { DownloadOptions } from "../mtproto/apiFileManager";
import { CancellablePromise } from "../../helpers/cancellablePromise";
import { getFileNameByLocation } from "../../helpers/fileName";
import { IS_SAFARI } from "../../environment/userAgent";
import { InputFileLocation, InputMedia, InputPhoto, Photo, PhotoSize, PhotosPhotos } from "../../layer";
import apiManager from "../mtproto/mtprotoworker";
import referenceDatabase, { ReferenceContext } from "../mtproto/referenceDatabase";
import { MyDocument } from "./appDocsManager";
import appDownloadManager, { ThumbCache } from "./appDownloadManager";
import appUsersManager from "./appUsersManager";
import blur from "../../helpers/blur";
import { MOUNT_CLASS_TO } from "../../config/debug";
import { renderImageFromUrlPromise } from "../../helpers/dom/renderImageFromUrl";
import calcImageInBox from "../../helpers/calcImageInBox";
import { makeMediaSize, MediaSize } from "../../helpers/mediaSizes";
import windowSize from "../../helpers/windowSize";
import bytesFromHex from "../../helpers/bytes/bytesFromHex";
import isObject from "../../helpers/object/isObject";
import safeReplaceArrayInObject from "../../helpers/object/safeReplaceArrayInObject";
import bytesToDataURL from "../../helpers/bytes/bytesToDataURL";
import { REPLIES_HIDDEN_CHANNEL_ID } from "../mtproto/mtproto_config";

export type MyPhoto = Photo.photo;

// TIMES = 2 DUE TO SIDEBAR AND CHAT
//let TEST_FILE_REFERENCE = "5440692274120994569", TEST_FILE_REFERENCE_TIMES = 2;

export class AppPhotosManager {
  private photos: {
    [id: string]: MyPhoto
  } = {};

  private static jpegHeader = bytesFromHex('ffd8ffe000104a46494600010100000100010000ffdb004300281c1e231e19282321232d2b28303c64413c37373c7b585d4964918099968f808c8aa0b4e6c3a0aadaad8a8cc8ffcbdaeef5ffffff9bc1fffffffaffe6fdfff8ffdb0043012b2d2d3c353c76414176f8a58ca5f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8ffc00011080000000003012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00');
  private static jpegTail = bytesFromHex('ffd9');
  
  public savePhoto(photo: Photo, context?: ReferenceContext) {
    if(photo._ === 'photoEmpty') return undefined;

    /* if(photo.id === TEST_FILE_REFERENCE) {
      console.warn('Testing FILE_REFERENCE_EXPIRED');
      const bytes = [2, 67, 175, 43, 190, 0, 0, 20, 62, 95, 111, 33, 45, 99, 220, 116, 218, 11, 167, 127, 213, 18, 127, 32, 243, 202, 117, 80, 30];
      //photo.file_reference = new Uint8Array(bytes);
      photo.file_reference = bytes;
      if(!--TEST_FILE_REFERENCE_TIMES) {
        TEST_FILE_REFERENCE = '';
      }
    } */

    const oldPhoto = this.photos[photo.id];
    if(photo.file_reference) { // * because we can have a new object w/o the file_reference while sending
      safeReplaceArrayInObject('file_reference', oldPhoto, photo);
      referenceDatabase.saveContext(photo.file_reference, context);
    }

    if(photo.sizes?.length) {
      const size = photo.sizes[photo.sizes.length - 1];
      if(size._ === 'photoSizeProgressive') {
        size.size = size.sizes[size.sizes.length - 1];
      }
    }

    if(oldPhoto) {
      return Object.assign(oldPhoto, photo);
    }

    return this.photos[photo.id] = photo;
  }
  
  public choosePhotoSize(photo: MyPhoto | MyDocument, boxWidth = 0, boxHeight = 0, useBytes = false, pushDocumentSize = false) {
    if(window.devicePixelRatio > 1) {
      boxWidth *= 2;
      boxHeight *= 2;
    }
    
    /*
    s	box	100x100
    m	box	320x320
    x	box	800x800
    y	box	1280x1280
    w	box	2560x2560
    a	crop	160x160
    b	crop	320x320
    c	crop	640x640
    d	crop	1280x1280 */

    let bestPhotoSize: PhotoSize = {_: 'photoSizeEmpty', type: ''};
    let sizes = (photo as MyPhoto).sizes || (photo as MyDocument).thumbs as PhotoSize[];
    if(pushDocumentSize && sizes && photo._ === 'document') {
      sizes = sizes.concat({
        _: 'photoSize', 
        w: (photo as MyDocument).w, 
        h: (photo as MyDocument).h, 
        size: (photo as MyDocument).size, 
        type: undefined
      });
    }

    if(sizes?.length) {
      for(let i = 0, length = sizes.length; i < length; ++i) {
        const photoSize = sizes[i];
        if(!('w' in photoSize) && !('h' in photoSize)) continue;
  
        bestPhotoSize = photoSize;
  
        const size = calcImageInBox(photoSize.w, photoSize.h, boxWidth, boxHeight);
        if(size.width >= boxWidth || size.height >= boxHeight) {
          break;
        }
      }

      if(useBytes && bestPhotoSize._ === 'photoSizeEmpty' && sizes[0]._ === 'photoStrippedSize') {
        bestPhotoSize = sizes[0];
      }
    }
    
    return bestPhotoSize;
  }
  
  public getUserPhotos(userId: UserId, maxId: Photo.photo['id'] = '0', limit: number = 20) {
    const inputUser = appUsersManager.getUserInput(userId);
    return apiManager.invokeApiCacheable('photos.getUserPhotos', {
      user_id: inputUser,
      offset: 0,
      limit,
      max_id: maxId
    }, {cacheSeconds: 60}).then((photosResult) => {
      appUsersManager.saveApiUsers(photosResult.users);
      const photoIds = photosResult.photos.map((photo, idx) => {
        photosResult.photos[idx] = this.savePhoto(photo, {type: 'profilePhoto', peerId: userId.toPeerId()});
        return photo.id;
      });

      // ! WARNING !
      if(maxId !== '0' && maxId) {
        const idx = photoIds.indexOf(maxId);
        if(idx !== -1) {
          photoIds.splice(idx, 1);
        }
      }
      
      return {
        count: (photosResult as PhotosPhotos.photosPhotosSlice).count || photoIds.length,
        photos: photoIds
      };
    });
  }

  public getPreviewURLFromBytes(bytes: Uint8Array | number[], isSticker = false) {
    let arr: Uint8Array;
    if(!isSticker) {
      arr = new Uint8Array(AppPhotosManager.jpegHeader.concat(Array.from(bytes.slice(3)), AppPhotosManager.jpegTail));
      arr[164] = bytes[1];
      arr[166] = bytes[2];
    } else {
      arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    }

    let mimeType: string;
    if(isSticker) {
      mimeType = IS_SAFARI ? 'image/png' : 'image/webp';
    } else {
      mimeType = 'image/jpeg';
    }

    return bytesToDataURL(arr, mimeType);
  }

  /**
   * https://core.telegram.org/api/files#vector-thumbnails
   */
  public getPathFromPhotoPathSize(size: PhotoSize.photoPathSize) {
    const bytes = size.bytes;
    const lookup = "AACAAAAHAAALMAAAQASTAVAAAZaacaaaahaaalmaaaqastava.az0123456789-,";

    let path = 'M';
    for(let i = 0, length = bytes.length; i < length; ++i) {
      const num = bytes[i];

      if(num >= (128 + 64)) {
        path += lookup[num - 128 - 64];
      } else {
        if(num >= 128) {
          path += ',';
        } else if(num >= 64) {
          path += '-'; 
        }
        path += '' + (num & 63);
      }
    }
    path += 'z';

    return path;
  }

  public getPreviewURLFromThumb(photo: MyPhoto | MyDocument, thumb: PhotoSize.photoCachedSize | PhotoSize.photoStrippedSize, isSticker = false) {
    const cacheContext = appDownloadManager.getCacheContext(photo, thumb.type);
    return cacheContext.url || (cacheContext.url = this.getPreviewURLFromBytes(thumb.bytes, isSticker));
  }
  
  public getImageFromStrippedThumb(photo: MyPhoto | MyDocument, thumb: PhotoSize.photoCachedSize | PhotoSize.photoStrippedSize, useBlur: boolean) {
    const url = this.getPreviewURLFromThumb(photo, thumb, false);

    let element: HTMLImageElement | HTMLCanvasElement, loadPromise: Promise<void>;
    if(!useBlur) {
      element = new Image();
      loadPromise = renderImageFromUrlPromise(element, url);
    } else {
      const result = blur(url);
      element = result.canvas;
      loadPromise = result.promise;
    }

    element.classList.add('thumbnail');
    
    return {image: element, loadPromise};
  }
  
  public setAttachmentSize(
    photo: MyPhoto | MyDocument, 
    element: HTMLElement | SVGForeignObjectElement, 
    boxWidth: number, 
    boxHeight: number, 
    noZoom = true, 
    message?: any,
    pushDocumentSize?: boolean,
    photoSize?: ReturnType<AppPhotosManager['choosePhotoSize']>
  ) {
    if(!photoSize) {
      photoSize = this.choosePhotoSize(photo, boxWidth, boxHeight, undefined, pushDocumentSize);
    }
    //console.log('setAttachmentSize', photo, photo.sizes[0].bytes, div);
    
    let size: MediaSize;
    const isDocument = photo._ === 'document';
    if(isDocument) {
      size = makeMediaSize((photo as MyDocument).w || (photoSize as PhotoSize.photoSize).w || 512, (photo as MyDocument).h || (photoSize as PhotoSize.photoSize).h || 512);
    } else {
      size = makeMediaSize((photoSize as PhotoSize.photoSize).w || 100, (photoSize as PhotoSize.photoSize).h || 100);
    }

    let boxSize = makeMediaSize(boxWidth, boxHeight);

    boxSize = size = size.aspect(boxSize, noZoom);

    let isFit = true;

    if(!isDocument || ['video', 'gif'].includes((photo as MyDocument).type)) {
      if(boxSize.width < 200 && boxSize.height < 200) { // make at least one side this big
        boxSize = size = size.aspectCovered(makeMediaSize(200, 200));
      }
  
      if(message && 
        (message.message || 
          message.reply_to_mid || 
          message.media.webpage || 
          (message.replies && message.replies.pFlags.comments && message.replies.channel_id.toChatId() !== REPLIES_HIDDEN_CHANNEL_ID)
        )
      ) { // make sure that bubble block is human-readable
        if(boxSize.width < 320) {
          boxSize = makeMediaSize(320, boxSize.height);
          isFit = false;
        }
      }
  
      if(isFit && boxSize.width < 120 && message) { // if image is too narrow
        boxSize = makeMediaSize(120, boxSize.height);
        isFit = false;
      }
    }

    // if(element instanceof SVGForeignObjectElement) {
    //   element.setAttributeNS(null, 'width', '' + w);
    //   element.setAttributeNS(null, 'height', '' + h);

    //   //console.log('set dimensions to svg element:', element, w, h);
    // } else {
      element.style.width = boxSize.width + 'px';
      element.style.height = boxSize.height + 'px';
    // }
    
    return {photoSize, size, isFit};
  }

  public getStrippedThumbIfNeeded(photo: MyPhoto | MyDocument, cacheContext: ThumbCache, useBlur: boolean, ignoreCache = false): ReturnType<AppPhotosManager['getImageFromStrippedThumb']> {
    if(!cacheContext.downloaded || (['video', 'gif'] as MyDocument['type'][]).includes((photo as MyDocument).type) || ignoreCache) {
      if(photo._ === 'document' && cacheContext.downloaded && !ignoreCache) {
        return null;
      }

      const sizes = (photo as MyPhoto).sizes || (photo as MyDocument).thumbs;
      const thumb = sizes?.length ? sizes.find(size => size._ === 'photoStrippedSize') : null;
      if(thumb && ('bytes' in thumb)) {
        return this.getImageFromStrippedThumb(photo, thumb as any, useBlur);
      }
    }

    return null;
  }
  
  public getPhotoDownloadOptions(photo: MyPhoto | MyDocument, photoSize: PhotoSize, queueId?: number, onlyCache?: boolean): DownloadOptions {
    const isDocument = photo._ === 'document';

    if(!photoSize || photoSize._ === 'photoSizeEmpty') {
      //console.error('no photoSize by photo:', photo);
      throw new Error('photoSizeEmpty!');
    }
    
    // maybe it's a thumb
    const isPhoto = (photoSize._ === 'photoSize' || photoSize._ === 'photoSizeProgressive') && photo.access_hash && photo.file_reference;
    const location: InputFileLocation.inputPhotoFileLocation | InputFileLocation.inputDocumentFileLocation = {
      _: isDocument ? 'inputDocumentFileLocation' : 'inputPhotoFileLocation',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
      thumb_size: photoSize.type
    };

    return {
      dcId: photo.dc_id, 
      location, 
      size: isPhoto ? (photoSize as PhotoSize.photoSize).size : undefined, 
      queueId, 
      onlyCache
    };
  }

  /* public getPhotoURL(photo: MTPhoto | MTMyDocument, photoSize: MTPhotoSize) {
    const downloadOptions = this.getPhotoDownloadOptions(photo, photoSize);

    return {url: getFileURL('photo', downloadOptions), location: downloadOptions.location};
  } */

  /* public isDownloaded(media: any) {
    const isPhoto = media._ === 'photo';
    const photo = isPhoto ? this.getPhoto(media.id) : null;
    let isDownloaded: boolean;
    if(photo) {
      isDownloaded = photo.downloaded > 0;
    } else {
      const cachedThumb = this.getDocumentCachedThumb(media.id);
      isDownloaded = cachedThumb?.downloaded > 0;
    }

    return isDownloaded;
  } */
  
  public preloadPhoto(photoId: MyPhoto | MyDocument | string, photoSize?: PhotoSize, queueId?: number, onlyCache?: boolean): CancellablePromise<Blob> {
    const photo = this.getPhoto(photoId);

    // @ts-ignore
    if(!photo || photo._ === 'photoEmpty') {
      throw new Error('preloadPhoto photoEmpty!');
    }

    if(!photoSize) {
      const fullWidth = windowSize.width;
      const fullHeight = windowSize.height;
      
      photoSize = this.choosePhotoSize(photo, fullWidth, fullHeight);
    }

    const cacheContext = appDownloadManager.getCacheContext(photo, photoSize.type);
    if(cacheContext.downloaded >= ('size' in photoSize ? photoSize.size : 0) && cacheContext.url) {
      return Promise.resolve() as any;
    }
    
    const downloadOptions = this.getPhotoDownloadOptions(photo, photoSize, queueId, onlyCache);
    const fileName = getFileNameByLocation(downloadOptions.location);

    let download = appDownloadManager.getDownload(fileName);
    if(download) {
      return download;
    }

    download = appDownloadManager.download(downloadOptions);
    download.then(blob => {
      if(!cacheContext.downloaded || cacheContext.downloaded < blob.size) {
        const url = URL.createObjectURL(blob);
        cacheContext.downloaded = blob.size;
        cacheContext.url = url;

        //console.log('wrote photo:', photo, photoSize, cacheContext, blob);
      }

      return blob;
    }).catch(() => {});

    return download;
  }
  
  public getPhoto(photoId: any/* MyPhoto | string */): MyPhoto {
    return isObject(photoId) ? photoId as MyPhoto : this.photos[photoId as any as string];
  }

  public getInput(photo: MyPhoto): InputPhoto.inputPhoto {
    return {
      _: 'inputPhoto',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference
    };
  }

  public getMediaInput(photo: MyPhoto): InputMedia.inputMediaPhoto {
    return {
      _: 'inputMediaPhoto',
      id: this.getInput(photo),
      ttl_seconds: 0
    };
  }

  public savePhotoFile(photo: MyPhoto | MyDocument, queueId?: number) {
    const fullPhotoSize = this.choosePhotoSize(photo, 0xFFFF, 0xFFFF);
    if(!(fullPhotoSize._ === 'photoSize' || fullPhotoSize._ === 'photoSizeProgressive')) {
      return;
    }

    const downloadOptions = this.getPhotoDownloadOptions(photo, fullPhotoSize, queueId);
    downloadOptions.fileName = 'photo' + photo.id + '.jpg';
    appDownloadManager.downloadToDisc(downloadOptions, downloadOptions.fileName);
  }
}

const appPhotosManager = new AppPhotosManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appPhotosManager = appPhotosManager);
export default appPhotosManager;
