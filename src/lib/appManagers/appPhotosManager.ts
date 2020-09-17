import { calcImageInBox, isObject } from "../utils";
import { bytesFromHex, getFileNameByLocation } from "../bin_utils";
import appDownloadManager from "./appDownloadManager";
import { CancellablePromise } from "../polyfill";
import { isSafari } from "../../helpers/userAgent";
import { FileLocation, InputFileLocation, Photo, PhotoSize } from "../../layer";
import { MyDocument } from "./appDocsManager";

export type MyPhoto = Photo.photo;

export class AppPhotosManager {
  private photos: {
    [id: string]: MyPhoto
  } = {};
  private documentThumbsCache: {
    [docID: string]: {
      downloaded: number, 
      url: string
    }
  } = {};
  public windowW = 0;
  public windowH = 0;
  
  public static jf = new Uint8Array(bytesFromHex('ffd8ffe000104a46494600010100000100010000ffdb004300281c1e231e19282321232d2b28303c64413c37373c7b585d4964918099968f808c8aa0b4e6c3a0aadaad8a8cc8ffcbdaeef5ffffff9bc1fffffffaffe6fdfff8ffdb0043012b2d2d3c353c76414176f8a58ca5f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8ffc00011080000000003012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00'));
  public static Df = bytesFromHex('ffd9');
  
  constructor() {
    window.addEventListener('resize', (e) => {
      this.windowW = document.body.scrollWidth;
      this.windowH = document.body.scrollHeight;
    });
    
    this.windowW = document.body.scrollWidth;
    this.windowH = document.body.scrollHeight;
  }
  
  public savePhoto(photo: Photo, context?: any) {
    if(photo._ == 'photoEmpty') return undefined;

    if(this.photos[photo.id]) return Object.assign(this.photos[photo.id], photo);

    /* if(context) {
      Object.assign(photo, context);
    } */ // warning
    
    if(!photo.id) {
      console.warn('no apiPhoto.id', photo);
    } else this.photos[photo.id] = photo;

    return photo;
  }
  
  public choosePhotoSize(photo: MyPhoto | MyDocument, width = 0, height = 0) {
    //if(Config.Navigator.retina) {
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
    if(sizes) {
      for(const photoSize of sizes) {
        if(!('w' in photoSize) && !('h' in photoSize)) continue;
  
        bestPhotoSize = photoSize;
  
        const {w, h} = calcImageInBox(photoSize.w, photoSize.h, width, height);
        if(w == width || h == height) {
          break;
        }
      }
    }
    
    return bestPhotoSize;
  }
  
  /* public getUserPhotos(userID: number, maxID: number, limit: number) {
    var inputUser = appUsersManager.getUserInput(userID);
    return apiManager.invokeApi('photos.getUserPhotos', {
      user_id: inputUser,
      offset: 0,
      limit: limit || 20,
      max_id: maxID || 0
    }).then((photosResult: any) => {
      appUsersManager.saveApiUsers(photosResult.users);
      var photoIDs = [];
      var context = {user_id: userID};
      for(var i = 0; i < photosResult.photos.length; i++) {
        //this.savePhoto(photosResult.photos[i], context);
        photosResult.photos[i] = this.savePhoto(photosResult.photos[i], context);
        photoIDs.push(photosResult.photos[i].id);
      }
      
      return {
        count: photosResult.count || photosResult.photos.length,
        photos: photoIDs
      };
    });
  } */

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

  public getPreviewURLFromThumb(thumb: PhotoSize.photoCachedSize | PhotoSize.photoStrippedSize, isSticker = false) {
    return thumb.url ?? (thumb.url = this.getPreviewURLFromBytes(thumb.bytes, isSticker));
  }
  
  public setAttachmentPreview(bytes: Uint8Array | number[], element: HTMLElement | SVGForeignObjectElement, isSticker = false, background = false) {
    let url = this.getPreviewURLFromBytes(bytes, isSticker);

    if(background) {
      let img = new Image();
      img.src = url;
      img.addEventListener('load', () => {
        element.style.backgroundImage = 'url(' + url + ')';
      });

      return element;
    } else {
      if(element instanceof HTMLImageElement) {
        element.src = url;
        return element;
      } else {
        let img = new Image();

        img.src = url;
        element.append(img);
        return img;
      }
    }
  }
  
  public setAttachmentSize(photo: MyPhoto | MyDocument, element: HTMLElement | SVGForeignObjectElement, boxWidth: number, boxHeight: number, isSticker = false, dontRenderPreview = false) {
    const photoSize = this.choosePhotoSize(photo, boxWidth, boxHeight);
    //console.log('setAttachmentSize', photo, photo.sizes[0].bytes, div);
    
    const sizes = (photo as MyPhoto).sizes || (photo as MyDocument).thumbs;
    const thumb = sizes?.length ? sizes[0] : null;
    if(thumb && ('bytes' in thumb)) {
      if((!photo.downloaded || (photo as MyDocument).type == 'video' || (photo as MyDocument).type == 'gif') && !isSticker && !dontRenderPreview) {
        this.setAttachmentPreview(thumb.bytes, element, isSticker);
      }
    }
    
    
    let width: number;
    let height: number;
    if(photo._ == 'document') {
      width = photo.w || 512;
      height = photo.h || 512;
    } else {
      width = 'w' in photoSize ? photoSize.w : 100;
      height = 'h' in photoSize ? photoSize.h : 100;
    }
    
    const {w, h} = calcImageInBox(width, height, boxWidth, boxHeight);
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
  
  public getPhotoDownloadOptions(photo: MyPhoto | MyDocument, photoSize: PhotoSize) {
    const isMyDocument = photo._ == 'document';

    if(!photoSize || photoSize._ == 'photoSizeEmpty') {
      //console.error('no photoSize by photo:', photo);
      throw new Error('photoSizeEmpty!');
    }
    
    // maybe it's a thumb
    const isPhoto = photoSize._ == 'photoSize' && photo.access_hash && photo.file_reference;
    const location: InputFileLocation.inputPhotoFileLocation | InputFileLocation.inputDocumentFileLocation | FileLocation = isPhoto ? {
      _: isMyDocument ? 'inputDocumentFileLocation' : 'inputPhotoFileLocation',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
      thumb_size: photoSize.type
    } : (photoSize as PhotoSize.photoSize).location;

    return {dcID: photo.dc_id, location, size: isPhoto ? (photoSize as PhotoSize.photoSize).size : undefined};
  }

  /* public getPhotoURL(photo: MTPhoto | MTMyDocument, photoSize: MTPhotoSize) {
    const downloadOptions = this.getPhotoDownloadOptions(photo, photoSize);

    return {url: getFileURL('photo', downloadOptions), location: downloadOptions.location};
  } */
  
  public preloadPhoto(photoID: any, photoSize?: PhotoSize): CancellablePromise<Blob> {
    const photo = this.getPhoto(photoID);

    // @ts-ignore
    if(photo._ == 'photoEmpty') {
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
    
    const downloadOptions = this.getPhotoDownloadOptions(photo, photoSize);
    const fileName = getFileNameByLocation(downloadOptions.location);

    let download = appDownloadManager.getDownload(fileName);
    if(download) {
      return download;
    }

    download = appDownloadManager.download(downloadOptions);
    download.then(blob => {
      if(!cacheContext.downloaded || cacheContext.downloaded < blob.size) {
        cacheContext.downloaded = blob.size;
        cacheContext.url = URL.createObjectURL(blob);

        //console.log('wrote photo:', photo, photoSize, cacheContext, blob);
      }

      return blob;
    });

    return download;
  }

  public getCacheContext(photo: any) {
    return photo._ == 'document' ? this.getDocumentCachedThumb(photo.id) : photo;
  }

  public getDocumentCachedThumb(docID: string) {
    return this.documentThumbsCache[docID] ?? (this.documentThumbsCache[docID] = {downloaded: 0, url: ''});
  }
  
  public getPhoto(photoID: any): MyPhoto {
    return isObject(photoID) ? photoID : this.photos[photoID];
  }

  public getInput(photo: MyPhoto) {
    return {
      _: 'inputMediaPhoto',
      flags: 0,
      id: {
        _: 'inputPhoto',
        id: photo.id,
        access_hash: photo.access_hash,
        file_reference: photo.file_reference
      },
      ttl_seconds: 0
    };
  }

  public savePhotoFile(photo: MyPhoto | MyDocument) {
    const fullPhotoSize = this.choosePhotoSize(photo, 0xFFFF, 0xFFFF);
    if(fullPhotoSize._ != 'photoSize') {
      return;
    }

    const location: InputFileLocation.inputDocumentFileLocation | InputFileLocation.inputPhotoFileLocation = {
      _: photo._ == 'document' ? 'inputDocumentFileLocation' : 'inputPhotoFileLocation',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
      thumb_size: fullPhotoSize.type
    };

    appDownloadManager.downloadToDisc({
      dcID: photo.dc_id, 
      location, 
      size: fullPhotoSize.size, 
      fileName: 'photo' + photo.id + '.jpg'
    }, 'photo' + photo.id + '.jpg');
  }
}

export default new AppPhotosManager();
