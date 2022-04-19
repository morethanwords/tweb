/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import { renderImageFromUrlPromise } from "../../helpers/dom/renderImageFromUrl";
import replaceContent from "../../helpers/dom/replaceContent";
import setInnerHTML from "../../helpers/dom/setInnerHTML";
import sequentialDom from "../../helpers/sequentialDom";
import { UserProfilePhoto, ChatPhoto, InputFileLocation } from "../../layer";
import { DownloadOptions } from "../mtproto/apiFileManager";
import { NULL_PEER_ID, REPLIES_PEER_ID } from "../mtproto/mtproto_config";
import RichTextProcessor from "../richtextprocessor";
import rootScope from "../rootScope";
import appDownloadManager from "./appDownloadManager";
import appPeersManager from "./appPeersManager";
import appPhotosManager from "./appPhotosManager";
import appUsersManager from "./appUsersManager";

type PeerPhotoSize = 'photo_small' | 'photo_big';

export class AppAvatarsManager {
  private savedAvatarURLs: {
    [peerId: PeerId]: {
      [size in PeerPhotoSize]?: string | Promise<string>
    }
  } = {};

  public isAvatarCached(peerId: PeerId) {
    return !!this.savedAvatarURLs[peerId];
  }
  
  public removeFromAvatarsCache(peerId: PeerId) {
    if(this.savedAvatarURLs[peerId]) {
      delete this.savedAvatarURLs[peerId];
    }
  }

  public loadAvatar(peerId: PeerId, photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, size: PeerPhotoSize) {
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

  public putAvatar(
    div: HTMLElement, 
    peerId: PeerId, 
    photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, 
    size: PeerPhotoSize, 
    img = new Image(), 
    onlyThumb = false
  ) {
    let {cached, loadPromise} = this.loadAvatar(peerId, photo, size);

    img.classList.add('avatar-photo');

    let renderThumbPromise: Promise<void>;
    let callback: () => void;
    let thumbImage: HTMLImageElement;
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

      if(size === 'photo_big') { // let's load small photo first
        const res = this.putAvatar(div, peerId, photo, 'photo_small');
        renderThumbPromise = res.loadPromise;
        thumbImage = res.thumbImage;
      } else if(photo.stripped_thumb) {
        thumbImage = new Image();
        div.classList.add('avatar-relative');
        thumbImage.classList.add('avatar-photo', 'avatar-photo-thumbnail');
        const url = appPhotosManager.getPreviewURLFromBytes(photo.stripped_thumb);
        renderThumbPromise = renderImageFromUrlPromise(thumbImage, url).then(() => {
          replaceContent(div, thumbImage);
        });
      }

      callback = () => {
        if(thumbImage) {
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
    .then(callback);

    return {
      cached, 
      loadPromise: renderThumbPromise || renderPromise,
      thumbImage
    };
  }

  public s(div: HTMLElement, innerHTML: Parameters<typeof setInnerHTML>[1], color: string, icon: string) {
    setInnerHTML(div, innerHTML);
    div.dataset.color = color;
    div.classList.remove('tgico-saved', 'tgico-deletedaccount', 'tgico-reply_filled');
    icon && div.classList.add(icon);
  }

  // peerId === peerId || title
  public putPhoto(div: HTMLElement, peerId: PeerId, isDialog = false, title = '', onlyThumb = false, isBig?: boolean) {
    const myId = rootScope.myId;
    
    //console.log('loadDialogPhoto location:', location, inputPeer);
    if(peerId === myId && isDialog) {
      this.s(div, '', '', 'tgico-saved');
      return;
    }
    
    if(peerId !== NULL_PEER_ID && peerId.isUser()) {
      const user = appUsersManager.getUser(peerId);
      if(user && user.pFlags && user.pFlags.deleted) {
        this.s(div, '', appPeersManager.getPeerColorById(peerId), 'tgico-deletedaccount');
        return;
      }
    }
    
    const photo = appPeersManager.getPeerPhoto(peerId);
    const avatarAvailable = !!photo;
    const avatarRendered = !!div.firstElementChild && !(div.firstElementChild as HTMLElement).classList.contains('emoji');
    if(!avatarAvailable || !avatarRendered || !this.savedAvatarURLs[peerId]) {
      let color = '';
      if(peerId && (peerId !== myId || !isDialog)) {
        color = appPeersManager.getPeerColorById(peerId);
      }

      if(peerId === REPLIES_PEER_ID) {
        this.s(div, '', color, 'tgico-reply_filled');
        return;
      }

      const abbr = title ? RichTextProcessor.getAbbreviation(title) : appPeersManager.getPeerInitials(peerId);
      this.s(div, abbr, color, '');
      //return Promise.resolve(true);
    }

    if(avatarAvailable/*  && false */) {
      const size: PeerPhotoSize = isBig ? 'photo_big' : 'photo_small';
      return this.putAvatar(div, peerId, photo, size, undefined, onlyThumb);
    }
  }
}

const appAvatarsManager = new AppAvatarsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appAvatarsManager = appAvatarsManager);
export default appAvatarsManager;
