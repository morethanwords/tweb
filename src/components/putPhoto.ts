/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getPreviewURLFromBytes from "../helpers/bytes/getPreviewURLFromBytes";
import { renderImageFromUrlPromise } from "../helpers/dom/renderImageFromUrl";
import replaceContent from "../helpers/dom/replaceContent";
import setInnerHTML from "../helpers/dom/setInnerHTML";
import { recordPromise } from "../helpers/recordPromise";
import sequentialDom from "../helpers/sequentialDom";
import { UserProfilePhoto, ChatPhoto } from "../layer";
import type { PeerPhotoSize } from "../lib/appManagers/appAvatarsManager";
import getPeerColorById from "../lib/appManagers/utils/peers/getPeerColorById";
import { NULL_PEER_ID, REPLIES_PEER_ID } from "../lib/mtproto/mtproto_config";
import getAbbreviation from "../lib/richTextProcessor/getAbbreviation";
import rootScope from "../lib/rootScope";
import getPeerInitials from "./wrappers/getPeerInitials";

export async function putAvatar(
  div: HTMLElement, 
  peerId: PeerId, 
  photo: UserProfilePhoto.userProfilePhoto | ChatPhoto.chatPhoto, 
  size: PeerPhotoSize, 
  img = new Image(), 
  onlyThumb = false
) {
  const r = await rootScope.managers.acknowledged.appAvatarsManager.loadAvatar(peerId, photo, size);
  const loadPromise = r.result;
  const cached = r.cached;

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

    let isFullLoaded = false;
    if(size === 'photo_big') { // let's load small photo first
      const res = await putAvatar(div, peerId, photo, 'photo_small');
      renderThumbPromise = res.loadPromise;
      thumbImage = res.thumbImage;
    } else if(photo.stripped_thumb) {
      thumbImage = new Image();
      div.classList.add('avatar-relative');
      thumbImage.classList.add('avatar-photo', 'avatar-photo-thumbnail');
      const url = getPreviewURLFromBytes(photo.stripped_thumb);
      renderThumbPromise = renderImageFromUrlPromise(thumbImage, url).then(() => {
        if(isFullLoaded) {
          return;
        }

        replaceContent(div, thumbImage);
      });
    }

    callback = () => {
      isFullLoaded = true;

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
  .then((url) => renderImageFromUrlPromise(img, url/* , !cached */))
  .then(callback);

  await (renderThumbPromise || renderPromise);

  return {
    cached, 
    loadPromise: renderThumbPromise || renderPromise,
    thumbImage
  };
}

function set(
  div: HTMLElement, 
  innerHTML: Parameters<typeof setInnerHTML>[1], 
  color: string, 
  icon: string
) {
  setInnerHTML(div, innerHTML);
  div.dataset.color = color;
  div.classList.remove('tgico-saved', 'tgico-deletedaccount', 'tgico-reply_filled');
  icon && div.classList.add(icon);
}

// peerId === peerId || title
export default async function putPhoto(
  div: HTMLElement, 
  peerId: PeerId, 
  isDialog = false, 
  title = '', 
  onlyThumb = false, 
  isBig?: boolean
) {
  const myId = rootScope.myId;
  
  if(peerId === myId && isDialog) {
    set(div, '', '', 'tgico-saved');
    return;
  }

  const managers = rootScope.managers;
  
  if(peerId !== NULL_PEER_ID && peerId.isUser()) {
    const user = await managers.appUsersManager.getUser(peerId);
    if(user && user.pFlags && user.pFlags.deleted) {
      set(div, '', getPeerColorById(peerId), 'tgico-deletedaccount');
      return;
    }
  }
  
  const size: PeerPhotoSize = isBig ? 'photo_big' : 'photo_small';
  const photo = await managers.appPeersManager.getPeerPhoto(peerId);
  const avatarAvailable = !!photo;
  const avatarRendered = !!div.firstElementChild && !(div.firstElementChild as HTMLElement).classList.contains('emoji');
  if(!avatarAvailable || !avatarRendered || !(await managers.appAvatarsManager.isAvatarCached(peerId, size))) {
    let color = '';
    if(peerId && (peerId !== myId || !isDialog)) {
      color = getPeerColorById(peerId);
    }

    if(peerId === REPLIES_PEER_ID) {
      set(div, '', color, 'tgico-reply_filled');
      return;
    }

    const abbr = await (title ? getAbbreviation(title) : getPeerInitials(peerId, managers));
    set(div, abbr, color, '');
    //return Promise.resolve(true);
  }

  if(avatarAvailable/*  && false */) {
    const promise = putAvatar(div, peerId, photo, size, undefined, onlyThumb);
    // recordPromise(promise, 'putAvatar-' + peerId);
    return promise;
  }
}
