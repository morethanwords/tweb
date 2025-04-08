/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {joinDeepPath} from '../../helpers/object/setDeepProperty';
import {UserProfilePhoto, ChatPhoto, InputFileLocation} from '../../layer';
import {DownloadOptions} from '../mtproto/apiFileManager';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';
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
}
