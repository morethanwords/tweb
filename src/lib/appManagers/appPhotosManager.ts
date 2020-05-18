import appUsersManager from "./appUsersManager";
import { calcImageInBox, isObject } from "../utils";
import fileManager from '../filemanager';
import { bytesFromHex } from "../bin_utils";
import { MTPhotoSize } from "../../components/wrappers";
import apiFileManager from "../mtproto/apiFileManager";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';

export type MTPhoto = {
  _: 'photo' | 'photoEmpty' | string,
  pFlags: any,
  flags: number,
  id: string,
  access_hash: string,
  file_reference: Uint8Array,
  date: number,
  sizes: Array<MTPhotoSize>,
  dc_id: number,
  user_id: number,

  downloaded?: boolean | number,
  url?: string
};

export class AppPhotosManager {
  private photos: {
    [id: string]: MTPhoto
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
  
  public savePhoto(photo: MTPhoto, context?: any) {
    if(this.photos[photo.id]) return this.photos[photo.id];

    /* if(context) {
      Object.assign(photo, context);
    } */ // warning
    
    if(!photo.id) {
      console.warn('no apiPhoto.id', photo);
    } else this.photos[photo.id] = photo as any;
    
    /* if(!('sizes' in photo)) return;
    
    photo.sizes.forEach((photoSize: any) => {
      if(photoSize._ == 'photoCachedSize') {
        apiFileManager.saveSmallFile(photoSize.location, photoSize.bytes);
        
        console.log('clearing photo cached size', photo);
        
        // Memory
        photoSize.size = photoSize.bytes.length;
        delete photoSize.bytes;
        photoSize._ = 'photoSize';
      }
    }); */

    /* if(!photo.downloaded) {
      photo.downloaded = apiFileManager.isFileExists({
        _: 'inputPhotoFileLocation',
        id: photo.id,
        access_hash: photo.access_hash,
        file_reference: photo.file_reference
      });
      // apiFileManager.isFileExists({
      //   _: 'inputPhotoFileLocation',
      //   id: photo.id,
      //   access_hash: photo.access_hash,
      //   file_reference: photo.file_reference
      // }).then(downloaded => {
      //   photo.downloaded = downloaded;
      // });
    } */

    return photo;
  }
  
  public choosePhotoSize(photo: any, width = 0, height = 0) {
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

    let bestPhotoSize: MTPhotoSize = {_: 'photoSizeEmpty'};
    let sizes = (photo.sizes || photo.thumbs) as typeof bestPhotoSize[];
    if(sizes) {
      for(let photoSize of sizes) {
        if(!photoSize.w || !photoSize.h) continue;
  
        bestPhotoSize = photoSize;
  
        let {w, h} = calcImageInBox(photoSize.w, photoSize.h, width, height);
        if(w == width || h == height) {
          break;
        }
      }
    }
    
    /* let bestPhotoSize: MTPhotoSize = {_: 'photoSizeEmpty'};
    let bestDiff = 0xFFFFFF;
    
    //console.log('choosePhotoSize', photo);
    
    let sizes = photo.sizes || photo.thumbs;
    if(!sizes) return bestPhotoSize;
    
    sizes.forEach((photoSize: typeof bestPhotoSize) => {
      if(!photoSize.w || !photoSize.h) return;
      
      let diff = Math.abs(photoSize.w * photoSize.h - width * height);
      if(diff < bestDiff) {
        bestPhotoSize = photoSize;
        bestDiff = diff;
      }
      
      //console.log('diff', diff, photoSize, bestPhotoSize);
    }); */
    
    //console.log('choosing', photo, width, height, bestPhotoSize);
    
    return bestPhotoSize;
  }
  
  public getUserPhotos(userID: number, maxID: number, limit: number) {
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
  }
  
  public setAttachmentPreview(bytes: Uint8Array, element: HTMLElement | SVGSVGElement, isSticker = false, background = false) {
    let arr: Uint8Array;
    if(!isSticker) {
      arr = AppPhotosManager.jf.concat(bytes.slice(3), AppPhotosManager.Df);
      arr[164] = bytes[1];
      arr[166] = bytes[2];
    } else {
      arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    }
    
    //console.log('setAttachmentPreview', bytes, arr, div, isSticker);
    
    let blob = new Blob([arr], {type: "image/jpeg"});

    /* let reader = new FileReader();
    reader.onloadend = () => {
      let src = reader.result;
    };
    reader.readAsDataURL(blob); */
    
    if(background) {
      let url = URL.createObjectURL(blob);
      let img = new Image();
      img.src = url;
      img.addEventListener('load', () => {
        element.style.backgroundImage = 'url(' + url + ')';
      });

      return element;
      //element.style.backgroundImage = 'url(' + url + ')';
    } else {
      if(element instanceof SVGSVGElement) {
        let image = element.firstElementChild as SVGImageElement || document.createElementNS("http://www.w3.org/2000/svg", "image");
        image.setAttributeNS(null, 'href', URL.createObjectURL(blob));
        element.append(image);

        return image;
      } else if(element instanceof HTMLImageElement) {
        element.src = URL.createObjectURL(blob);
        return element;
      } else {
        let img = new Image();
        img.style.width = '100%';
        img.style.height = '100%';
        
        img.src = URL.createObjectURL(blob);
        element.append(img);
        return img;
      }
    }
  }
  
  public setAttachmentSize(photoID: any, element: HTMLElement | SVGSVGElement, boxWidth = 380, boxHeight = 380, isSticker = false) {
    let photo: /* MTDocument | MTPhoto */any = null;
    
    if(typeof(photoID) === 'string') {
      photo = this.photos[photoID];
      if(!photo) return {_: 'photoEmpty'};
    } else {
      photo = photoID;
    }
    
    let photoSize = this.choosePhotoSize(photo, boxWidth, boxHeight);
    //console.log('setAttachmentSize', photo, photo.sizes[0].bytes, div);
    
    let sizes = photo.sizes || photo.thumbs;
    if((!photo.downloaded || (isSticker && photo.animated)) && sizes && sizes[0].bytes) {
      this.setAttachmentPreview(sizes[0].bytes, element, isSticker);
    }
    
    let width: number;
    let height: number;
    if(photo._ == 'document') {
      width = photo.w || 512;
      height = photo.h || 512;
    } else {
      width = photoSize.w || 100;
      height = photoSize.h || 100;
    }
    
    let {w, h} = calcImageInBox(width, height, boxWidth, boxHeight);
    if(element instanceof SVGSVGElement) {
      element.setAttributeNS(null, 'width', '' + w);
      element.setAttributeNS(null, 'height', '' + h);

      //console.log('set dimensions to svg element:', element, w, h);
      
      if(element.firstElementChild) {
        let imageSvg = element.firstElementChild as SVGImageElement;
        imageSvg.setAttributeNS(null, 'width', '' + w);
        imageSvg.setAttributeNS(null, 'height', '' + h);
      }
    } else {
      element.style.width = w + 'px';
      element.style.height = h + 'px';
    }
    
    return photoSize;
  }
  
  public preloadPhoto(photoID: any, photoSize?: MTPhotoSize): Promise<Blob | void> {
    let photo = this.getPhoto(photoID);
    
    if(!photoSize) {
      let fullWidth = this.windowW;
      let fullHeight = this.windowH;
      
      photoSize = this.choosePhotoSize(photo, fullWidth, fullHeight);
    }

    let isDocument = photo._ == 'document';
    let cacheContext = isDocument ? (this.documentThumbsCache[photo.id] ?? (this.documentThumbsCache[photo.id] = {downloaded: -1, url: ''})) : photo;

    if(cacheContext.downloaded >= photoSize.size && cacheContext.url) {
      return Promise.resolve();
    }

    if(!photoSize || photoSize._ == 'photoSizeEmpty') {
      console.error('no photoSize by photo:', photo);
      return Promise.reject('no photoSize');
    }
    
    // maybe it's a thumb
    let isPhoto = photoSize.size && photo.access_hash && photo.file_reference;
    let location = isPhoto ? {
      _: isDocument ? 'inputDocumentFileLocation' : 'inputPhotoFileLocation',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
      thumb_size: photoSize.type
    } : photoSize.location;

    let promise: Promise<Blob>;
    if(isPhoto/*  && photoSize.size >= 1e6 */) {
      //console.log('Photos downloadFile exec', photo);
      promise = apiFileManager.downloadFile(photo.dc_id, location, photoSize.size);
    } else {
      //console.log('Photos downloadSmallFile exec', photo, location);
      promise = apiFileManager.downloadSmallFile(location);
    }

    promise.then(blob => {
      if(!cacheContext.downloaded || cacheContext.downloaded < blob.size) {
        cacheContext.downloaded = blob.size;
        cacheContext.url = URL.createObjectURL(blob);

        //console.log('wrote photo:', photo, photoSize, cacheContext, blob);
      }
    });

    return promise;
  }

  public getDocumentCachedThumb(docID: string) {
    return this.documentThumbsCache[docID];
  }
  
  public getPhoto(photoID: any): MTPhoto {
    return isObject(photoID) ? photoID : this.photos[photoID];
  }

  public getInputByID(photoID: any) {
    let photo = this.getPhoto(photoID);
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

  public downloadPhoto(photoID: string) {
    var photo = this.photos[photoID];
    var ext = 'jpg';
    var mimeType = 'image/jpeg';
    var fileName = 'photo' + photoID + '.' + ext;
    var fullWidth = this.windowW;
    var fullHeight = this.windowH;
    var fullPhotoSize = this.choosePhotoSize(photo, fullWidth, fullHeight);
    var inputFileLocation = {
      // @ts-ignore
      _: photo._ == 'document' ? 'inputDocumentFileLocation' : 'inputPhotoFileLocation',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
      thumb_size: fullPhotoSize.type
    };
    
    try { // photo.dc_id, location, photoSize.size
      let writer = fileManager.chooseSaveFile(fileName, ext, mimeType, fullPhotoSize.size);
      writer.ready.then(() => {
        console.log('ready');
        apiFileManager.downloadFile(photo.dc_id, inputFileLocation, fullPhotoSize.size, {
          mimeType: mimeType,
          toFileEntry: writer
        }).then(() => {
          writer.close();
          //writer.abort();
          console.log('file save done', fileName, ext, mimeType, writer);
        }, (e: any) => {
          console.log('photo download failed', e);
        });
      });
    } catch(err) {
      console.error('err', err);
      
      var cachedBlob = apiFileManager.getCachedFile(inputFileLocation)
      if (cachedBlob) {
        return fileManager.download(cachedBlob, mimeType, fileName);
      }
      
      apiFileManager.downloadFile(photo.dc_id, inputFileLocation, fullPhotoSize.size, {mimeType: mimeType})
      .then((blob: Blob) => {
        fileManager.download(blob, mimeType, fileName);
      }, (e: any) => {
        console.log('photo download failed', e);
      });
    }
  }
}

export default new AppPhotosManager();
