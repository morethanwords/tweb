/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {UserProfilePhoto, ChatPhoto, InputFileLocation} from '../../layer';
import {DownloadOptions} from '../mtproto/apiFileManager';
import {AppManager} from './manager';

export type PeerPhotoSize = 'photo_small' | 'photo_big';

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
    }
  }

  public loadAvatar(peerId: PeerId, photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, size: PeerPhotoSize) {
    const saved = this.savedAvatarURLs[peerId] ??= {};
    if(!saved[size]) {
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

      /* let str: string;
      const time = Date.now();
      if(peerId === 0) {
        str = `download avatar ${peerId}`;
      } */

      const promise = this.apiFileManager.download(downloadOptions);
      return saved[size] = promise.then((blob) => {
        return saved[size] = URL.createObjectURL(blob);

        /* if(str) {
          console.log(str, Date.now() / 1000, Date.now() - time);
        } */
      });
    } else {
      return saved[size];
    }
  }
}
