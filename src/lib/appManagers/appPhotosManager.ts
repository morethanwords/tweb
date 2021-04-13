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

import { bytesFromHex } from "../../helpers/bytes";
import { CancellablePromise } from "../../helpers/cancellablePromise";
import { getFileNameByLocation } from "../../helpers/fileName";
import { safeReplaceArrayInObject, defineNotNumerableProperties, isObject } from "../../helpers/object";
import { isSafari } from "../../helpers/userAgent";
import { FileLocation, InputFileLocation, InputMedia, Photo, PhotoSize, PhotosPhotos } from "../../layer";
import apiManager from "../mtproto/mtprotoworker";
import referenceDatabase, { ReferenceContext } from "../mtproto/referenceDatabase";
import { calcImageInBox } from "../../helpers/dom";
import { MyDocument } from "./appDocsManager";
import appDownloadManager from "./appDownloadManager";
import appUsersManager from "./appUsersManager";
import blur from "../../helpers/blur";
import { MOUNT_CLASS_TO } from "../../config/debug";
import renderImageFromUrl from "../../helpers/dom/renderImageFromUrl";

export type MyPhoto = Photo.photo;

// TIMES = 2 DUE TO SIDEBAR AND CHAT
//let TEST_FILE_REFERENCE = "5440692274120994569", TEST_FILE_REFERENCE_TIMES = 2;

type DocumentCacheThumb = {
  downloaded: number, 
  url: string
};

export class AppPhotosManager {
  private photos: {
    [id: string]: MyPhoto
  } = {};
  private documentThumbsCache: {
    [docId: string]: DocumentCacheThumb
  } = {};
  public windowW = 0;
  public windowH = 0;
  
  public static jf = new Uint8Array(bytesFromHex('ffd8ffe000104a46494600010100000100010000ffdb004300281c1e231e19282321232d2b28303c64413c37373c7b585d4964918099968f808c8aa0b4e6c3a0aadaad8a8cc8ffcbdaeef5ffffff9bc1fffffffaffe6fdfff8ffdb0043012b2d2d3c353c76414176f8a58ca5f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8ffc00011080000000003012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00'));
  public static Df = bytesFromHex('ffd9');
  
  constructor() {
    // @ts-ignore
    const w: any = 'visualViewport' in window ? window.visualViewport : window;
    const set = () => {
      this.windowW = w.width || w.innerWidth;
      this.windowH = w.height || w.innerHeight;
    };
    w.addEventListener('resize', set);
    set();
  }
  
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
  
  public choosePhotoSize(photo: MyPhoto | MyDocument, width = 0, height = 0, useBytes = false) {
    if(window.devicePixelRatio > 1) {
      width *= 2;
      height *= 2;
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
    const sizes = ((photo as MyPhoto).sizes || (photo as MyDocument).thumbs) as PhotoSize[];
    if(sizes?.length) {
      for(const photoSize of sizes) {
        if(!('w' in photoSize) && !('h' in photoSize)) continue;
  
        bestPhotoSize = photoSize;
  
        const {w, h} = calcImageInBox(photoSize.w, photoSize.h, width, height);
        if(w >= width || h >= height) {
          break;
        }
      }

      if(useBytes && bestPhotoSize._ === 'photoSizeEmpty' && sizes[0]._ === 'photoStrippedSize') {
        bestPhotoSize = sizes[0];
      }
    }
    
    return bestPhotoSize;
  }
  
  public getUserPhotos(userId: number, maxId: string = '0', limit: number = 20) {
    const inputUser = appUsersManager.getUserInput(userId);
    return apiManager.invokeApi('photos.getUserPhotos', {
      user_id: inputUser,
      offset: 0,
      limit,
      max_id: maxId
    }).then((photosResult) => {
      appUsersManager.saveApiUsers(photosResult.users);
      const photoIds: string[] = photosResult.photos.map((photo, idx) => {
        photosResult.photos[idx] = this.savePhoto(photo, {type: 'profilePhoto', peerId: userId});
        return photo.id;
      });
      
      return {
        count: (photosResult as PhotosPhotos.photosPhotosSlice).count || photosResult.photos.length,
        photos: photoIds
      };
    });
  }

  public getPreviewURLFromBytes(bytes: Uint8Array | number[], isSticker = false) {
    let arr: Uint8Array;
    if(!isSticker) {
      arr = AppPhotosManager.jf.concat(bytes.slice(3), AppPhotosManager.Df);
      arr[164] = bytes[1];
      arr[166] = bytes[2];
    } else {
      arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    }

    let mimeType: string;
    if(isSticker) {
      mimeType = isSafari ? 'image/png' : 'image/webp';
    } else {
      mimeType = 'image/jpeg';
    }

    const blob = new Blob([arr], {type: mimeType});
    return URL.createObjectURL(blob);
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

  public getPreviewURLFromThumb(thumb: PhotoSize.photoCachedSize | PhotoSize.photoStrippedSize, isSticker = false) {
    return thumb.url ?? (defineNotNumerableProperties(thumb, ['url']), thumb.url = this.getPreviewURLFromBytes(thumb.bytes, isSticker));
  }
  
  public getImageFromStrippedThumb(thumb: PhotoSize.photoCachedSize | PhotoSize.photoStrippedSize) {
    const url = this.getPreviewURLFromThumb(thumb, false);

    const image = new Image();
    image.classList.add('thumbnail');

    const loadPromise = blur(url).then(url => {
      return new Promise<any>((resolve) => {
        renderImageFromUrl(image, url, resolve);
      });
    });
    
    return {image, loadPromise};
  }
  
  public setAttachmentSize(photo: MyPhoto | MyDocument, element: HTMLElement | SVGForeignObjectElement, boxWidth: number, boxHeight: number, noZoom = true, hasText?: boolean) {
    const photoSize = this.choosePhotoSize(photo, boxWidth, boxHeight);
    //console.log('setAttachmentSize', photo, photo.sizes[0].bytes, div);
    
    let width: number;
    let height: number;
    if(photo._ === 'document') {
      width = photo.w || 512;
      height = photo.h || 512;
    } else {
      width = 'w' in photoSize ? photoSize.w : 100;
      height = 'h' in photoSize ? photoSize.h : 100;
    }
    
    let {w, h} = calcImageInBox(width, height, boxWidth, boxHeight, noZoom);

    /* if(hasText) {
      w = Math.max(boxWidth, w);
    } */

    if(element instanceof SVGForeignObjectElement) {
      element.setAttributeNS(null, 'width', '' + w);
      element.setAttributeNS(null, 'height', '' + h);

      //console.log('set dimensions to svg element:', element, w, h);
    } else {
      element.style.width = w + 'px';
      element.style.height = h + 'px';
    }
    
    return photoSize;
  }

  public getStrippedThumbIfNeeded(photo: MyPhoto | MyDocument): ReturnType<AppPhotosManager['getImageFromStrippedThumb']> {
    if(!photo.downloaded || (photo as MyDocument).type === 'video' || (photo as MyDocument).type === 'gif') {
      if(photo._ === 'document') {
        const cacheContext = this.getCacheContext(photo); 
        if(cacheContext.downloaded) {
          return null;
        } 
      }

      const sizes = (photo as MyPhoto).sizes || (photo as MyDocument).thumbs;
      const thumb = sizes?.length ? sizes.find(size => size._ === 'photoStrippedSize') : null;
      if(thumb && ('bytes' in thumb)) {
        return appPhotosManager.getImageFromStrippedThumb(thumb as any);
      }
    }

    return null;
  }
  
  public getPhotoDownloadOptions(photo: MyPhoto | MyDocument, photoSize: PhotoSize, queueId?: number, onlyCache?: boolean) {
    const isMyDocument = photo._ === 'document';

    if(!photoSize || photoSize._ === 'photoSizeEmpty') {
      //console.error('no photoSize by photo:', photo);
      throw new Error('photoSizeEmpty!');
    }
    
    // maybe it's a thumb
    const isPhoto = (photoSize._ === 'photoSize' || photoSize._ === 'photoSizeProgressive') && photo.access_hash && photo.file_reference;
    const location: InputFileLocation.inputPhotoFileLocation | InputFileLocation.inputDocumentFileLocation | FileLocation = isPhoto ? {
      _: isMyDocument ? 'inputDocumentFileLocation' : 'inputPhotoFileLocation',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
      thumb_size: photoSize.type
    } : (photoSize as PhotoSize.photoSize).location;

    return {dcId: photo.dc_id, location, size: isPhoto ? (photoSize as PhotoSize.photoSize).size : undefined, queueId, onlyCache};
  }

  /* public getPhotoURL(photo: MTPhoto | MTMyDocument, photoSize: MTPhotoSize) {
    const downloadOptions = this.getPhotoDownloadOptions(photo, photoSize);

    return {url: getFileURL('photo', downloadOptions), location: downloadOptions.location};
  } */

  public isDownloaded(media: any) {
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
  }
  
  public preloadPhoto(photoId: any, photoSize?: PhotoSize, queueId?: number, onlyCache?: boolean): CancellablePromise<Blob> {
    const photo = this.getPhoto(photoId);

    // @ts-ignore
    if(!photo || photo._ === 'photoEmpty') {
      throw new Error('preloadPhoto photoEmpty!');
    }

    if(!photoSize) {
      const fullWidth = this.windowW;
      const fullHeight = this.windowH;
      
      photoSize = this.choosePhotoSize(photo, fullWidth, fullHeight);
    }

    const cacheContext = this.getCacheContext(photo);
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
      const url = URL.createObjectURL(blob);
      if(!cacheContext.downloaded || cacheContext.downloaded < blob.size) {
        defineNotNumerableProperties(cacheContext, ['downloaded', 'url']);

        cacheContext.downloaded = blob.size;
        cacheContext.url = url;

        //console.log('wrote photo:', photo, photoSize, cacheContext, blob);
      }

      defineNotNumerableProperties(photoSize, ['url']);
      (photoSize as any).url = url;

      return blob;
    }).catch(() => {});

    return download;
  }

  public getCacheContext(photo: any): DocumentCacheThumb {
    return photo._ === 'document' ? this.getDocumentCachedThumb(photo.id) : photo;
  }

  public getDocumentCachedThumb(docId: string) {
    return this.documentThumbsCache[docId] ?? (this.documentThumbsCache[docId] = {downloaded: 0, url: ''});
  }
  
  public getPhoto(photoId: any): MyPhoto {
    return isObject(photoId) ? photoId : this.photos[photoId];
  }

  public getInput(photo: MyPhoto): InputMedia.inputMediaPhoto {
    return {
      _: 'inputMediaPhoto',
      id: {
        _: 'inputPhoto',
        id: photo.id,
        access_hash: photo.access_hash,
        file_reference: photo.file_reference
      },
      ttl_seconds: 0
    };
  }

  public savePhotoFile(photo: MyPhoto | MyDocument, queueId?: number) {
    const fullPhotoSize = this.choosePhotoSize(photo, 0xFFFF, 0xFFFF);
    if(!(fullPhotoSize._ === 'photoSize' || fullPhotoSize._ === 'photoSizeProgressive')) {
      return;
    }

    const location: InputFileLocation.inputDocumentFileLocation | InputFileLocation.inputPhotoFileLocation = {
      _: photo._ === 'document' ? 'inputDocumentFileLocation' : 'inputPhotoFileLocation',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
      thumb_size: fullPhotoSize.type
    };

    appDownloadManager.downloadToDisc({
      dcId: photo.dc_id, 
      location, 
      size: fullPhotoSize.size, 
      fileName: 'photo' + photo.id + '.jpg',
      queueId
    }, 'photo' + photo.id + '.jpg');
  }
}

const appPhotosManager = new AppPhotosManager();
MOUNT_CLASS_TO.appPhotosManager = appPhotosManager;
export default appPhotosManager;
