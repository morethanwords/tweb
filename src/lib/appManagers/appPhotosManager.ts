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

import { CancellablePromise } from "../../helpers/cancellablePromise";
import { getFileNameByLocation } from "../../helpers/fileName";
import { Photo, PhotoSize, PhotosPhotos } from "../../layer";
import apiManager from "../mtproto/mtprotoworker";
import { ReferenceContext } from "../mtproto/referenceDatabase";
import { MyDocument } from "./appDocsManager";
import appDownloadManager from "./appDownloadManager";
import windowSize from "../../helpers/windowSize";
import isObject from "../../helpers/object/isObject";
import safeReplaceArrayInObject from "../../helpers/object/safeReplaceArrayInObject";
import { AppManager } from "./manager";
import choosePhotoSize from "./utils/photos/choosePhotoSize";
import getPhotoDownloadOptions from "./utils/photos/getPhotoDownloadOptions";

export type MyPhoto = Photo.photo;

// TIMES = 2 DUE TO SIDEBAR AND CHAT
//let TEST_FILE_REFERENCE = "5440692274120994569", TEST_FILE_REFERENCE_TIMES = 2;

export class AppPhotosManager extends AppManager {
  private photos: {
    [id: string]: MyPhoto
  } = {};

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
      this.referenceDatabase.saveContext(photo.file_reference, context);
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
  
  public getUserPhotos(userId: UserId, maxId: Photo.photo['id'] = '0', limit: number = 20) {
    const inputUser = this.appUsersManager.getUserInput(userId);
    return apiManager.invokeApiCacheable('photos.getUserPhotos', {
      user_id: inputUser,
      offset: 0,
      limit,
      max_id: maxId
    }, {cacheSeconds: 60}).then((photosResult) => {
      this.appUsersManager.saveApiUsers(photosResult.users);
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
      
      photoSize = choosePhotoSize(photo, fullWidth, fullHeight);
    }

    const cacheContext = appDownloadManager.getCacheContext(photo, photoSize.type);
    if(cacheContext.downloaded >= ('size' in photoSize ? photoSize.size : 0) && cacheContext.url) {
      return Promise.resolve() as any;
    }
    
    const downloadOptions = getPhotoDownloadOptions(photo, photoSize, queueId, onlyCache);
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

  public savePhotoFile(photo: MyPhoto | MyDocument, queueId?: number) {
    const fullPhotoSize = choosePhotoSize(photo, 0xFFFF, 0xFFFF);
    if(!(fullPhotoSize._ === 'photoSize' || fullPhotoSize._ === 'photoSizeProgressive')) {
      return;
    }

    const downloadOptions = getPhotoDownloadOptions(photo, fullPhotoSize, queueId);
    downloadOptions.fileName = 'photo' + photo.id + '.jpg';
    appDownloadManager.downloadToDisc(downloadOptions, downloadOptions.fileName);
  }
}
