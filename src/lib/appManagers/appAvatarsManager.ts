/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { UserProfilePhoto, ChatPhoto, InputFileLocation } from "../../layer";
import { DownloadOptions } from "../mtproto/apiFileManager";
import rootScope from "../rootScope";
import appDownloadManager from "./appDownloadManager";
import { AppManager } from "./manager";

export type PeerPhotoSize = 'photo_small' | 'photo_big';

export class AppAvatarsManager extends AppManager {
  private savedAvatarURLs: {
    [peerId: PeerId]: {
      [size in PeerPhotoSize]?: string | Promise<string>
    }
  } = {};
  
  constructor() {
    super();

    rootScope.addEventListener('avatar_update', (peerId) => {
      this.removeFromAvatarsCache(peerId);
    });
  }

  public isAvatarCached(peerId: PeerId) {
    return !!this.savedAvatarURLs[peerId];
  }
  
  public removeFromAvatarsCache(peerId: PeerId) {
    if(this.savedAvatarURLs[peerId]) {
      delete this.savedAvatarURLs[peerId];
    }
  }

  public loadAvatar(peerId: PeerId, photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, size: PeerPhotoSize) {
    const inputPeer = this.appPeersManager.getInputPeerById(peerId);

    let cached = false;
    let getAvatarPromise: Promise<string>;
    let saved = this.savedAvatarURLs[peerId];
    if(!saved || !saved[size]) {
      if(!saved) {
        saved = this.savedAvatarURLs[peerId] = {};
      }

      //console.warn('will invoke downloadSmallFile:', peerId);
      const peerPhotoFileLocation: InputFileLocation.inputPeerPhotoFileLocation = {
        _: 'inputPeerPhotoFileLocation', 
        pFlags: {},
        peer: inputPeer, 
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

      const promise = appDownloadManager.download(downloadOptions);
      getAvatarPromise = saved[size] = promise.then(blob => {
        return saved[size] = URL.createObjectURL(blob);

        /* if(str) {
          console.log(str, Date.now() / 1000, Date.now() - time);
        } */
      });
    } else if(typeof(saved[size]) !== 'string') {
      getAvatarPromise = saved[size] as Promise<any>;
    } else {
      getAvatarPromise = Promise.resolve(saved[size]);
      cached = true;
    }

    return {cached, loadPromise: getAvatarPromise};
  }
}
