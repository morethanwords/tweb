import appUsersManager from "./appUsersManager";
import { copy, calcImageInBox } from "../utils";
import fileManager from '../filemanager';
import { bytesFromHex } from "../bin_utils";
import { MTPhotoSize } from "../../components/wrappers";
import apiFileManager from "../mtproto/apiFileManager";
import apiManager from "../mtproto/apiManager";
//import { MTPhotoSize } from "../../components/misc";

type MTPhoto = {
  _: 'photo',
  pFlags: any,
  flags: number,
  id: string,
  access_hash: string,
  file_reference: Uint8Array,
  date: number,
  sizes: Array<MTPhotoSize>,
  dc_id: number,
  user_id: number
};

export class AppPhotosManager {
  private photos: {
    [id: string]: MTPhoto
  } = {};
  public windowW = document.body.scrollWidth;
  public windowH = document.body.scrollHeight;
  
  public static jf = new Uint8Array(bytesFromHex('ffd8ffe000104a46494600010100000100010000ffdb004300281c1e231e19282321232d2b28303c64413c37373c7b585d4964918099968f808c8aa0b4e6c3a0aadaad8a8cc8ffcbdaeef5ffffff9bc1fffffffaffe6fdfff8ffdb0043012b2d2d3c353c76414176f8a58ca5f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8ffc00011080000000003012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00'));
  public static Df = bytesFromHex('ffd9');
  
  constructor() {
    window.addEventListener('resize', (e) => {
      this.windowW = document.body.scrollWidth;
      this.windowH = document.body.scrollHeight;
      
      //console.log(`Set windowW, windowH: ${this.windowW}x${this.windowH}`);
    });
    
    /* $rootScope.openPhoto = openPhoto
    $rootScope.preloadPhoto = preloadPhoto; */
  }
  
  public savePhoto(apiPhoto: any, context?: any) {
    if(context) {
      Object.assign(apiPhoto, context);
    }
    
    if(!apiPhoto.id) {
      console.warn('no apiPhoto.id', apiPhoto);
    } else this.photos[apiPhoto.id] = apiPhoto;
    
    if(!('sizes' in apiPhoto)) return;
    
    apiPhoto.sizes.forEach((photoSize: any) => {
      if(photoSize._ == 'photoCachedSize') {
        apiFileManager.saveSmallFile(photoSize.location, photoSize.bytes);
        
        console.log('clearing photo cached size', apiPhoto);
        
        // Memory
        photoSize.size = photoSize.bytes.length;
        delete photoSize.bytes;
        photoSize._ = 'photoSize';
      }
    });
  }
  
  public choosePhotoSize(photo: any, width = 0, height = 0) {
    if(Config.Navigator.retina) {
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
    });
    
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
        this.savePhoto(photosResult.photos[i], context);
        photoIDs.push(photosResult.photos[i].id);
      }
      
      return {
        count: photosResult.count || photosResult.photos.length,
        photos: photoIDs
      };
    });
  }
  
  public setAttachmentPreview(bytes: Uint8Array, div: HTMLDivElement, isSticker = false, background = false) {
    //image.src = "data:image/jpeg;base64," + bytesToBase64(photo.sizes[0].bytes);
    //photo.sizes[0].bytes = new Uint8Array([...photo.sizes[0].bytes].reverse());
    
    let arr: Uint8Array;
    if(!isSticker) {
      arr = AppPhotosManager.jf.concat(bytes.slice(3), AppPhotosManager.Df);
      arr[164] = bytes[1];
      arr[166] = bytes[2];
    } else {
      arr = bytes;
    }
    
    //console.log('setAttachmentPreview', bytes, arr, div, isSticker);
    
    let blob = new Blob([arr], { type: "image/jpeg" } );
    
    if(background) {
      div.style.backgroundImage = 'url(' + URL.createObjectURL(blob) + ')';
    } else {
      let image = new Image();
      image.src = URL.createObjectURL(blob);
      
      image.style.width = '100%';
      image.style.height = '100%';
      div.append(image);
    }
  }
  
  public setAttachmentSize(photoID: any, div: HTMLDivElement, boxWidth = 380, boxHeight = 380, isSticker = false) {
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
    if(sizes && sizes[0].bytes) {
      this.setAttachmentPreview(sizes[0].bytes, div, isSticker);
    }

    if(photo._ == 'document' /* && photo.type != 'video' *//*  && photo.type != 'gif' */) {
      let {w, h} = calcImageInBox(photo.w || 512, photo.h || 512, boxWidth, boxHeight);
      div.style.width = w + 'px';
      div.style.height = h + 'px';
    } else {
      let {w, h} = calcImageInBox(photoSize.w || 100, photoSize.h || 100, boxWidth, boxHeight);
      div.style.width = w + 'px';
      div.style.height = h + 'px';
    }
    
    return photoSize;
  }
  
  public async preloadPhoto(photoID: any, photoSize?: MTPhotoSize): Promise<Blob> {
    let photo: any = null;

    if(typeof(photoID) === 'string') {
      photo = this.photos[photoID];
      if(!photo) return Promise.reject();
    } else {
      photo = photoID;
    }
    
    if(!photoSize) {
      let fullWidth = this.windowW/*  - (Config.Mobile ? 20 : 32) */;
      let fullHeight = this.windowH/*  - (Config.Mobile ? 150 : 116) */;

      photoSize = this.choosePhotoSize(photo, fullWidth, fullHeight);
    }

    if(photoSize && photoSize._ != 'photoSizeEmpty') {
      photoSize.preloaded = true;

      // maybe it's a thumb
      let isPhoto = photoSize.size && photo.access_hash && photo.file_reference;
      let location = isPhoto ? {
        _: photo._ == 'document' ? 'inputDocumentFileLocation' : 'inputPhotoFileLocation',
        id: photo.id,
        access_hash: photo.access_hash,
        file_reference: photo.file_reference,
        thumb_size: photoSize.type
      } : photoSize.location;
  
      /* if(overwrite) {
        await apiFileManager.deleteFile(location);
        console.log('Photos deleted file!');
      } */

      if(isPhoto/*  && photoSize.size >= 1e6 */) {
        console.log('Photos downloadFile exec', photo);
        /* let promise = apiFileManager.downloadFile(photo.dc_id, location, photoSize.size);

        let blob = await promise;
        if(blob.size < photoSize.size && overwrite) {
          await apiFileManager.deleteFile(location);
          console.log('Photos deleted file!');
          return apiFileManager.downloadFile(photo.dc_id, location, photoSize.size);
        }

        return blob; */
        return apiFileManager.downloadFile(photo.dc_id, location, photoSize.size);
      } else {
        console.log('Photos downloadSmallFile exec', photo, location);
        return apiFileManager.downloadSmallFile(location);
      }
    } else return Promise.reject('no photoSize');
  }
  
  public getPhoto(photoID: string) {
    return this.photos[photoID] || {_: 'photoEmpty'};
  }
  
  public wrapForHistory(photoID: string, options: any = {}) {
    var photo = copy(this.photos[photoID]) || {_: 'photoEmpty'};
    var width = options.website ? 64 : Math.min(this.windowW - 80, Config.Mobile ? 210 : 260);
    var height = options.website ? 64 : Math.min(this.windowH - 100, Config.Mobile ? 210 : 260);
    var thumbPhotoSize = this.choosePhotoSize(photo, width, height);
    var thumb: any = {
      width: width,
      height: height
    };
    
    if(options.website && Config.Mobile) {
      width = 50;
      height = 50;
    }
    
    // console.log('chosen photo size', photoID, thumbPhotoSize)
    if(thumbPhotoSize && thumbPhotoSize._ != 'photoSizeEmpty') {
      var dim = calcImageInBox(thumbPhotoSize.w, thumbPhotoSize.h, width, height);
      thumb.width = dim.w;
      thumb.height = dim.h;
      thumb.location = thumbPhotoSize.location;
      thumb.size = thumbPhotoSize.size;
    } else {
      thumb.width = 100;
      thumb.height = 100;
    }
    
    photo.thumb = thumb;
    
    return photo;
  }
  
  public wrapForFull(photoID: string) {
    var photo = this.wrapForHistory(photoID);
    var fullWidth = document.body.scrollWidth - (Config.Mobile ? 0 : 32);
    var fullHeight = document.body.scrollHeight - (Config.Mobile ? 0 : 116);
    if (!Config.Mobile && fullWidth > 800) {
      fullWidth -= 208;
    }
    var fullPhotoSize = this.choosePhotoSize(photo, fullWidth, fullHeight);
    var full: any = {};
    
    full.width = fullWidth;
    full.height = fullHeight;
    
    if (fullPhotoSize && fullPhotoSize._ != 'photoSizeEmpty') {
      var wh = calcImageInBox(fullPhotoSize.w, fullPhotoSize.h, fullWidth, fullHeight, true);
      full.width = wh.w;
      full.height = wh.h;
      
      full.modalWidth = Math.max(full.width, Math.min(400, fullWidth));
      
      full.location = fullPhotoSize.location;
      full.size = fullPhotoSize.size;
    }
    
    photo.full = full;
    
    return photo;
  }
  
  /* public openPhoto(photoID: number, list: any) {
    if(!photoID || photoID === '0') {
      return false;
    }
    
    var scope = $rootScope.$new(true);
    
    scope.photoID = photoID;
    
    var controller = 'PhotoModalController';
    if (list && list.p > 0) {
      controller = 'UserpicModalController';
      scope.userID = list.p;
    } else if (list && list.p < 0) {
      controller = 'ChatpicModalController';
      scope.chatID = -list.p;
    } else if (list && list.m > 0) {
      scope.messageID = list.m;
      if (list.w) {
        scope.webpageID = list.w;
      }
    }
    
    var modalInstance = $modal.open({
      templateUrl: templateUrl('photo_modal'),
      windowTemplateUrl: templateUrl('media_modal_layout'),
      controller: controller,
      scope: scope,
      windowClass: 'photo_modal_window'
    });
  } */
  
  public downloadPhoto(photoID: string) {
    var photo = this.photos[photoID];
    var ext = 'jpg';
    var mimeType = 'image/jpeg';
    var fileName = 'photo' + photoID + '.' + ext;
    var fullWidth = Math.max(screen.width || 0, document.body.scrollWidth - 36, 800);
    var fullHeight = Math.max(screen.height || 0, document.body.scrollHeight - 150, 800);
    var fullPhotoSize = this.choosePhotoSize(photo, fullWidth, fullHeight);
    var inputFileLocation = {
      _: 'inputFileLocation',
      volume_id: fullPhotoSize.location.volume_id,
      local_id: fullPhotoSize.location.local_id,
      secret: fullPhotoSize.location.secret
    };
    
    fileManager.chooseSaveFile(fileName, ext, mimeType).then((writableFileEntry) => {
      if(writableFileEntry) {
        apiFileManager.downloadFile(photo.dc_id, inputFileLocation, fullPhotoSize.size, {
          mimeType: mimeType,
          toFileEntry: writableFileEntry
        }).then(() => {
          // console.log('file save done')
        }, (e: any) => {
          console.log('photo download failed', e);
        });
      }
    }, () => {
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
    });
  }
}

export default new AppPhotosManager();
