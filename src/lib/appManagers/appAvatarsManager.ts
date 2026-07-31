import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {UserProfilePhoto, ChatPhoto, InputFileLocation, Photo} from '@layer';
import {DownloadOptions} from '@appManagers/apiFileManager';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import {AppManager} from '@appManagers/manager';
import chooseProfileVideoSize from '@appManagers/utils/photos/chooseProfileVideoSize';
import SharedObjectUrlCache from '@lib/mainWorker/sharedObjectUrlCache';
import {makeObjectUrlOwner} from '@helpers/objectUrlUtils';

// 'photo_video' = small animated preview ('p', ~100KB) for chat list / topbar;
// 'photo_video_full' = full quality ('u', ~2MB) for the big profile avatar.
export type PeerPhotoSize = 'photo_small' | 'photo_big' | 'photo_video' | 'photo_video_full';

const AVATAR_OBJECT_URL_CACHE_LIMIT = 128;
const AVATAR_OBJECT_URL_CACHE_BYTES_LIMIT = 32 * 1024 * 1024;

type AvatarObjectUrlCacheKey = {
  peerId: PeerId,
  size: PeerPhotoSize
};

export class AppAvatarsManager extends AppManager {
  private savedAvatarURLs: {
    [peerId: PeerId]: {
      [size in PeerPhotoSize]?: string | Promise<string>
    }
  } = {};
  private objectURLCache: SharedObjectUrlCache<AvatarObjectUrlCacheKey>;

  protected after() {
    this.objectURLCache = new SharedObjectUrlCache<AvatarObjectUrlCacheKey>({
      getOwner: ({peerId, size}) => this.getAvatarOwner(peerId, size),
      maxBytes: AVATAR_OBJECT_URL_CACHE_BYTES_LIMIT,
      maxURLs: AVATAR_OBJECT_URL_CACHE_LIMIT,
      onEvict: (key, url) => this.evictAvatar(key, url)
    });

    this.rootScope.addEventListener('avatar_update', ({peerId, threadId}) => {
      if(threadId) {
        return;
      }

      this.removeFromAvatarsCache(peerId);
    });
  }

  private getAvatarOwner(peerId: PeerId, size: PeerPhotoSize) {
    return makeObjectUrlOwner('avatar', this.getAccountNumber(), peerId, size);
  }

  private deleteSavedAvatar(
    peerId: PeerId,
    size: PeerPhotoSize,
    expected: string | Promise<string>
  ) {
    const saved = this.savedAvatarURLs[peerId];
    if(saved?.[size] !== expected) {
      return false;
    }

    delete saved[size];
    if(!Object.keys(saved).length) {
      delete this.savedAvatarURLs[peerId];
    }

    return true;
  }

  private cacheAvatarBlob(
    peerId: PeerId,
    size: PeerPhotoSize,
    blobPromise: Promise<Blob | undefined>
  ) {
    const saved = this.savedAvatarURLs[peerId] ??= {};

    const request = blobPromise.then((blob) => {
      if(!blob || this.savedAvatarURLs[peerId]?.[size] !== request) {
        if(!blob) {
          this.deleteSavedAvatar(peerId, size, request);
        }

        return;
      }

      const {url, previousUrl} = this.objectURLCache.create({peerId, size}, blob);
      saved[size] = url;

      this.mirrorAvatar(peerId, size, url, previousUrl);

      return url;
    });

    saved[size] = request;
    request.catch(() => {
      this.deleteSavedAvatar(peerId, size, request);
    });

    return request;
  }

  public isAvatarCached(peerId: PeerId, size?: PeerPhotoSize) {
    const saved = this.savedAvatarURLs[peerId];
    if(size === undefined) {
      return !!saved;
    }

    const cached = saved && saved[size];
    if(cached && !(cached instanceof Promise)) {
      this.objectURLCache.touch({peerId, size});
      return true;
    }

    return false;
  }

  public removeFromAvatarsCache(peerId: PeerId) {
    const saved = this.savedAvatarURLs[peerId];
    if(!saved) {
      return;
    }

    delete this.savedAvatarURLs[peerId];
    const previousUrls = Object.values(saved).filter(
      (value): value is string => typeof(value) === 'string'
    );
    for(const size of Object.keys(saved) as PeerPhotoSize[]) {
      this.objectURLCache.delete({peerId, size});
    }
    this.mirrorAvatarKey('' + peerId, undefined, undefined, previousUrls);
  }

  public loadAvatar(
    peerId: PeerId,
    photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto,
    size: PeerPhotoSize
  ) {
    const saved = this.savedAvatarURLs[peerId] ??= {};
    if(saved[size]) {
      if(!(saved[size] instanceof Promise)) {
        this.objectURLCache.touch({peerId, size});
      }
      return saved[size];
    }

    return this.cacheAvatarBlob(
      peerId,
      size,
      this.downloadAvatar(peerId, photo, size)
    );
  }

  public downloadAvatar(
    peerId: PeerId,
    photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto,
    size: PeerPhotoSize
  ) {
    if(size === 'photo_video' || size === 'photo_video_full') {
      const quality = size === 'photo_video_full' ? 'full' : 'preview';
      return this.downloadAvatarVideo(peerId, photo, quality);
    }

    // console.warn('will invoke downloadSmallFile:', peerId);
    const peerPhotoFileLocation: InputFileLocation.inputPeerPhotoFileLocation = {
      _: 'inputPeerPhotoFileLocation',
      pFlags: {},
      peer: this.appPeersManager.getInputPeerById(peerId),
      photo_id: photo.photo_id
    };

    const downloadOptions: DownloadOptions = {dcId: photo.dc_id, location: peerPhotoFileLocation};
    if(size === 'photo_big') {
      peerPhotoFileLocation.pFlags.big = true;
      downloadOptions.limitPart = 512 * 1024;
    }

    return this.apiFileManager.download(downloadOptions);
  }

  // Resolve the full Photo (with video_sizes) for an avatar — userProfilePhoto
  // only carries photo_id. For self / contacts photos.getUserPhotos eventually
  // populates it; use cache first, fall back to fetching (users only).
  private async getFullVideoPhoto(
    peerId: PeerId,
    photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto
  ): Promise<Photo.photo | undefined> {
    if(!photo.pFlags?.has_video) return undefined;

    let fullPhoto: Photo.photo | undefined = this.appPhotosManager.getPhoto(photo.photo_id) as Photo.photo;
    if(!fullPhoto?.video_sizes?.length) {
      if(peerId.isUser()) {
        const {photos: photoIds} = await this.appPhotosManager.getUserPhotos(peerId, '0', 1);
        if(photoIds?.length) {
          fullPhoto = this.appPhotosManager.getPhoto(photoIds[0]) as Photo.photo;
        }
      } else {
        // Chats/channels carry only photo_id on the chatPhoto; the full Photo (with
        // video_sizes) lives on chatFull.chat_photo, which getProfileByPeerId fetches
        // and saveFullPeer stores into the photos cache. Without this the topbar /
        // chat-list video avatar never resolved for chats (it only re-fetched for users).
        await this.appProfileManager.getProfileByPeerId(peerId);
        fullPhoto = this.appPhotosManager.getPhoto(photo.photo_id) as Photo.photo;
      }
    }

    return fullPhoto?.video_sizes?.length ? fullPhoto : undefined;
  }

  // video_start_ts (seconds) of the animated profile photo — the frame avatar
  // playback should begin at. Cheap once the avatar video has loaded (the full
  // photo is cached by then).
  public async getAvatarVideoStartTs(
    peerId: PeerId,
    photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto,
    full?: boolean
  ): Promise<number | undefined> {
    const fullPhoto = await this.getFullVideoPhoto(peerId, photo);
    return fullPhoto && chooseProfileVideoSize(fullPhoto, full ? 'full' : 'preview')?.video_start_ts;
  }

  private async downloadAvatarVideo(
    peerId: PeerId,
    photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto,
    quality: 'preview' | 'full' = 'preview'
  ) {
    const fullPhoto = await this.getFullVideoPhoto(peerId, photo);
    if(!fullPhoto) return undefined;

    const videoSize = chooseProfileVideoSize(fullPhoto, quality);
    if(!videoSize) return undefined;

    return this.apiFileManager.downloadMedia({
      media: fullPhoto,
      thumb: videoSize
    });
  }

  private mirrorAvatarKey(
    key: string,
    value?: string,
    previousUrl?: string,
    previousUrls?: string[]
  ) {
    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name: 'avatars',
      key,
      value,
      ...(previousUrl ? {previousUrl} : {}),
      ...(previousUrls?.length ? {previousUrls} : {}),
      accountNumber: this.getAccountNumber()
    });
  }

  private mirrorAvatar(
    peerId: PeerId,
    size: PeerPhotoSize,
    value?: string,
    previousUrl?: string
  ) {
    this.mirrorAvatarKey(joinDeepPath(peerId, size), value, previousUrl);
  }

  private evictAvatar({peerId, size}: AvatarObjectUrlCacheKey, url: string) {
    if(!this.deleteSavedAvatar(peerId, size, url)) {
      return;
    }

    this.mirrorAvatar(peerId, size, undefined, url);
  }
}
