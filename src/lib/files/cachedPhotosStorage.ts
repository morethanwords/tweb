import deferredPromise from '../../helpers/cancellablePromise';
import {Photo, PhotoSize} from '../../layer';
import getPhotoDownloadOptions from '../appManagers/utils/photos/getPhotoDownloadOptions';
import {DownloadOptions} from '../mtproto/apiFileManager';
import StaticUtilityClass from '../staticUtilityClass';
import CacheStorageController from './cacheStorage';


type GetPhotoArgs = {
  photo: Photo.photo;
  photoSize: PhotoSize;
  download: (options: DownloadOptions) => Promise<Blob>;
};

export class CachedPhotosStorage extends StaticUtilityClass {
  private static cacheStorage = new CacheStorageController('cachedPhotos');

  private static urls = new Map<string, Promise<string> | string>();

  private static getKey(photo: Photo.photo, photoSize: PhotoSize) {
    const size = (photoSize._ === 'photoSize' || photoSize._ === 'photoSizeProgressive') ? photoSize.size : undefined;

    return [photo.id, size].filter(Boolean).join('_');
  }

  public static async getPhoto({photo, photoSize, download}: GetPhotoArgs) {
    const key = this.getKey(photo, photoSize);

    if(this.urls.has(key)) return this.urls.get(key);

    const promise = deferredPromise<string>();
    this.urls.set(key, promise);

    const cachedPhoto = await this.cacheStorage.get(key);

    if(cachedPhoto) {
      const url = URL.createObjectURL(await cachedPhoto.blob());

      this.urls.set(key, url);
      promise.resolve(url);

      return url;
    }

    const downloadOptions = getPhotoDownloadOptions(photo, photoSize);
    const blob = await download(downloadOptions);
    const url = URL.createObjectURL(blob);

    try {
      await this.cacheStorage.save(key, new Response(blob));
    } catch{}

    this.urls.set(key, url);
    promise.resolve(url);

    return url;
  }
}
