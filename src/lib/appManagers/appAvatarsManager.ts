import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {UserProfilePhoto, ChatPhoto, InputFileLocation, Photo} from '@layer';
import {DownloadOptions} from '@appManagers/apiFileManager';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import {AppManager} from '@appManagers/manager';
import chooseProfileVideoSize from '@appManagers/utils/photos/chooseProfileVideoSize';

// 'photo_video' = small animated preview ('p', ~100KB) for chat list / topbar;
// 'photo_video_full' = full quality ('u', ~2MB) for the big profile avatar.
export type PeerPhotoSize = 'photo_small' | 'photo_big' | 'photo_video' | 'photo_video_full';

export class AppAvatarsManager extends AppManager {
  private savedAvatarURLs: {
    [peerId: PeerId]: {
      [size in PeerPhotoSize]?: string | Promise<string>
    }
  } = {};

  protected after() {
    this.rootScope.addEventListener('avatar_update', ({peerId, threadId}) => {
      if(threadId) {
        return;
      }

      this.removeFromAvatarsCache(peerId);
    });
  }

  public isAvatarCached(peerId: PeerId, size?: PeerPhotoSize) {
    const saved = this.savedAvatarURLs[peerId];
    if(size === undefined) {
      return !!saved;
    }

    return !!(saved && saved[size] && !(saved[size] instanceof Promise));
  }

  public removeFromAvatarsCache(peerId: PeerId) {
    if(this.savedAvatarURLs[peerId]) {
      delete this.savedAvatarURLs[peerId];
      MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
        name: 'avatars',
        key: '' + peerId,
        accountNumber: this.getAccountNumber()
      });
    }
  }

  public loadAvatar(peerId: PeerId, photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, size: PeerPhotoSize) {
    const saved = this.savedAvatarURLs[peerId] ??= {};
    if(saved[size]) {
      return saved[size];
    }

    if(size === 'photo_video' || size === 'photo_video_full') {
      const quality = size === 'photo_video_full' ? 'full' : 'preview';
      const promise = saved[size] = this.loadAvatarVideo(peerId, photo, quality, size);
      // Don't keep a failed (undefined) video load cached — let it retry next time
      // (e.g. once the full photo's video_sizes is available).
      promise.then((url) => {
        if(!url && saved[size] === promise) {
          delete saved[size];
        }
      });
      return promise;
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

    const promise = this.apiFileManager.download(downloadOptions);
    return saved[size] = promise.then((blob) => {
      const url = saved[size] = URL.createObjectURL(blob);

      MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
        name: 'avatars',
        key: joinDeepPath(peerId, size),
        value: url,
        accountNumber: this.getAccountNumber()
      });

      return url;
    });
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

  private async loadAvatarVideo(
    peerId: PeerId,
    photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto,
    quality: 'preview' | 'full' = 'preview',
    cacheSize: PeerPhotoSize = 'photo_video'
  ) {
    const fullPhoto = await this.getFullVideoPhoto(peerId, photo);
    if(!fullPhoto) return undefined;

    const videoSize = chooseProfileVideoSize(fullPhoto, quality);
    if(!videoSize) return undefined;

    const blob = await this.apiFileManager.downloadMedia({
      media: fullPhoto,
      thumb: videoSize
    });

    const url = URL.createObjectURL(blob);
    this.savedAvatarURLs[peerId][cacheSize] = url;

    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name: 'avatars',
      key: joinDeepPath(peerId, cacheSize),
      value: url,
      accountNumber: this.getAccountNumber()
    });

    return url;
  }
}
