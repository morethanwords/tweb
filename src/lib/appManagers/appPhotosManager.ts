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

import {Photo, PhotoSize, PhotosPhotos} from '../../layer';
import {ReferenceContext} from '../mtproto/referenceDatabase';
import isObject from '../../helpers/object/isObject';
import safeReplaceArrayInObject from '../../helpers/object/safeReplaceArrayInObject';
import {AppManager} from './manager';

export type MyPhoto = Photo.photo;

// TIMES = 2 DUE TO SIDEBAR AND CHAT
// let TEST_FILE_REFERENCE = "5440692274120994569", TEST_FILE_REFERENCE_TIMES = 2;

export class AppPhotosManager extends AppManager {
  private photos: {
    [id: string]: MyPhoto
  } = {};

  public savePhoto(photo: Photo, context?: ReferenceContext) {
    if(!photo || photo._ === 'photoEmpty') return;

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
      // * sometimes photoStrippedSize can be the last item
      photo.sizes.sort((a, b) => {
        return ((a as PhotoSize.photoSize).size || ((a as PhotoSize.photoSizeProgressive).sizes ? Infinity : 0)) - ((b as PhotoSize.photoSize).size || ((b as PhotoSize.photoSizeProgressive).sizes ? Infinity : 0));
      });

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
    return this.apiManager.invokeApiCacheable('photos.getUserPhotos', {
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

  public getPhoto(photoId: any/* MyPhoto | string */): MyPhoto {
    return isObject(photoId) ? photoId as MyPhoto : this.photos[photoId as any as string];
  }
}
