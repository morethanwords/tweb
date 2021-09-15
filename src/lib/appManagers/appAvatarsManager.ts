/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { renderImageFromUrlPromise } from "../../helpers/dom/renderImageFromUrl";
import replaceContent from "../../helpers/dom/replaceContent";
import sequentialDom from "../../helpers/sequentialDom";
import { UserProfilePhoto, ChatPhoto, InputFileLocation } from "../../layer";
import RichTextProcessor from "../richtextprocessor";
import rootScope from "../rootScope";
import appDownloadManager from "./appDownloadManager";
import appPeersManager from "./appPeersManager";
import appPhotosManager from "./appPhotosManager";
import appUsersManager from "./appUsersManager";

type PeerPhotoSize = 'photo_small' | 'photo_big';

export class AppAvatarsManager {
  private savedAvatarURLs: {
    [peerId: number]: {
      [size in PeerPhotoSize]?: string | Promise<string>
    }
  } = {};

  public isAvatarCached(peerId: number) {
    return !!this.savedAvatarURLs[peerId];
  }
  
  public removeFromAvatarsCache(peerId: number) {
    if(this.savedAvatarURLs[peerId]) {
      delete this.savedAvatarURLs[peerId];
    }
  }

  public loadAvatar(peerId: number, photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, size: PeerPhotoSize) {
    const inputPeer = appPeersManager.getInputPeerById(peerId);

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

      if(size === 'photo_big') {
        peerPhotoFileLocation.pFlags.big = true;
      }

      const downloadOptions = {dcId: photo.dc_id, location: peerPhotoFileLocation};

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

  public putAvatar(div: HTMLElement, peerId: number, photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, size: PeerPhotoSize, img = new Image(), onlyThumb = false) {
    let {cached, loadPromise} = this.loadAvatar(peerId, photo, size);

    let renderThumbPromise: Promise<void>;
    let callback: () => void;
    if(cached) {
      // смотри в misc.ts: renderImageFromUrl
      callback = () => {
        replaceContent(div, img);
        div.dataset.color = '';
      };
    } else {
      const animate = rootScope.settings.animationsEnabled;
      if(animate) {
        img.classList.add('fade-in');
      }

      let thumbImage: HTMLImageElement;
      if(photo.stripped_thumb) {
        thumbImage = new Image();
        div.classList.add('avatar-relative');
        thumbImage.classList.add('avatar-photo', 'avatar-photo-thumbnail');
        img.classList.add('avatar-photo');
        const url = appPhotosManager.getPreviewURLFromBytes(photo.stripped_thumb);
        renderThumbPromise = renderImageFromUrlPromise(thumbImage, url).then(() => {
          replaceContent(div, thumbImage);
        });
      }

      callback = () => {
        if(photo.stripped_thumb) {
          div.append(img);
        } else {
          replaceContent(div, img);
        }

        setTimeout(() => {
          if(div.childElementCount) {
            sequentialDom.mutateElement(img, () => {
              div.dataset.color = '';
              
              if(animate) {
                img.classList.remove('fade-in');
              }

              if(thumbImage) {
                thumbImage.remove();
              }
            });
          }
        }, animate ? 200 : 0);
      };
    }

    const renderPromise = loadPromise
    .then((url) => renderImageFromUrlPromise(img, url/* , false */))
    .then(() => callback());

    return {cached, loadPromise: renderThumbPromise || renderPromise};
  }

  // peerId === peerId || title
  public putPhoto(div: HTMLElement, peerId: number, isDialog = false, title = '', onlyThumb = false) {
    const photo = appPeersManager.getPeerPhoto(peerId);

    const size: PeerPhotoSize = 'photo_small';
    const avatarAvailable = !!photo;
    const avatarRendered = div.firstElementChild && !(div.firstElementChild as HTMLElement).classList.contains('emoji');
    
    const myId = rootScope.myId;

    //console.log('loadDialogPhoto location:', location, inputPeer);
    if(peerId === myId && isDialog) {
      div.innerText = '';
      div.dataset.color = '';
      div.classList.add('tgico-saved');
      div.classList.remove('tgico-deletedaccount');
      return;
    }

    if(peerId > 0) {
      const user = appUsersManager.getUser(peerId);
      if(user && user.pFlags && user.pFlags.deleted) {
        div.innerText = '';
        div.dataset.color = appPeersManager.getPeerColorById(peerId);
        div.classList.add('tgico-deletedaccount');
        div.classList.remove('tgico-saved');
        return;
      }
    }

    if(!avatarAvailable || !avatarRendered || !this.savedAvatarURLs[peerId]) {
      let color = '';
      if(peerId && (peerId !== myId || !isDialog)) {
        color = appPeersManager.getPeerColorById(peerId);
      }
      
      div.innerText = '';
      div.classList.remove('tgico-saved', 'tgico-deletedaccount');
      div.dataset.color = color;

      let abbr: string;
      if(!title) {
        const peer = appPeersManager.getPeer(peerId);
        abbr = peer.initials ?? '';
      } else {
        abbr = RichTextProcessor.getAbbreviation(title);
      }

      div.innerHTML = abbr;
      //return Promise.resolve(true);
    }

    if(avatarAvailable/*  && false */) {
      return this.putAvatar(div, peerId, photo, size, undefined, onlyThumb);
    }
  }
}

const appAvatarsManager = new AppAvatarsManager();
export default appAvatarsManager;
