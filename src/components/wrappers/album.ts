/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {ChatAutoDownloadSettings} from '../../helpers/autoDownload';
import mediaSizes from '../../helpers/mediaSizes';
import {Middleware} from '../../helpers/middleware';
import {Document, Message, MessageMedia, Photo, PhotoSize} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import getMediaFromMessage from '../../lib/appManagers/utils/messages/getMediaFromMessage';
import choosePhotoSize from '../../lib/appManagers/utils/photos/choosePhotoSize';
import rootScope from '../../lib/rootScope';
import {AnimationItemGroup} from '../animationIntersector';
import Chat from '../chat/chat';
import LazyLoadQueue from '../lazyLoadQueue';
import prepareAlbum from '../prepareAlbum';
import wrapMediaSpoiler from './mediaSpoiler';
import wrapPhoto from './photo';
import wrapVideo from './video';

export default function wrapAlbum({messages, attachmentDiv, middleware, uploading, lazyLoadQueue, isOut, chat, loadPromises, autoDownload, managers = rootScope.managers, animationGroup}: {
  messages: Message.message[],
  attachmentDiv: HTMLElement,
  middleware?: Middleware,
  lazyLoadQueue?: LazyLoadQueue,
  uploading?: boolean,
  isOut: boolean,
  chat: Chat,
  loadPromises?: Promise<any>[],
  autoDownload?: ChatAutoDownloadSettings,
  managers?: AppManagers,
  animationGroup?: AnimationItemGroup
}) {
  const items: {size: PhotoSize.photoSize, media: Photo.photo | Document.document, message: Message.message}[] = [];

  // !lowest msgID will be the FIRST in album
  for(const message of messages) {
    const media = getMediaFromMessage(message, true);

    const size: any = media._ === 'photo' ? choosePhotoSize(media, 480, 480) : {w: media.w, h: media.h};
    items.push({size, media, message});
  }

  /* // * pending
  if(storage[0] < 0) {
    items.reverse();
  } */

  prepareAlbum({
    container: attachmentDiv,
    items: items.map((i) => ({w: i.size.w, h: i.size.h})),
    maxWidth: mediaSizes.active.album.width,
    minWidth: 100,
    spacing: 2,
    forMedia: true
  });

  const {width, height} = attachmentDiv.style;
  const containerWidth = parseInt(width);
  const containerHeight = parseInt(height);

  items.forEach((item, idx) => {
    const {size, media, message} = item;

    const messageMedia = message.media;
    const hasSpoiler = !!(messageMedia as MessageMedia.messageMediaPhoto | MessageMedia.messageMediaDocument).pFlags?.spoiler;

    const div = attachmentDiv.children[idx] as HTMLElement;
    div.dataset.mid = '' + message.mid;
    div.dataset.peerId = '' + message.peerId;
    const mediaDiv = div.firstElementChild as HTMLElement;
    const isPhoto = media._ === 'photo';
    let thumbPromise: Promise<any>;
    if(isPhoto) {
      thumbPromise = wrapPhoto({
        photo: media,
        message,
        container: mediaDiv,
        boxWidth: 0,
        boxHeight: 0,
        isOut,
        lazyLoadQueue,
        middleware,
        size,
        loadPromises,
        autoDownloadSize: autoDownload.photo,
        managers
      });
    } else {
      thumbPromise = wrapVideo({
        doc: media,
        container: mediaDiv,
        message,
        boxWidth: 0,
        boxHeight: 0,
        withTail: false,
        isOut,
        lazyLoadQueue,
        middleware,
        loadPromises,
        autoDownload,
        managers,
        noAutoplayAttribute: hasSpoiler
      });
    }

    if(thumbPromise) {
      loadPromises?.push(thumbPromise);
    }

    if(hasSpoiler) {
      const promise = (thumbPromise || Promise.resolve()).then(async() => {
        if(!middleware()) {
          return;
        }

        const {width, height} = div.style;
        const itemWidth = +width.slice(0, -1) / 100 * containerWidth;
        const itemHeight = +height.slice(0, -1) / 100 * containerHeight;
        const container = await wrapMediaSpoiler({
          media,
          animationGroup,
          middleware,
          width: itemWidth,
          height: itemHeight
        });

        if(!middleware()) {
          return;
        }

        mediaDiv.append(container);
      });

      loadPromises?.push(promise);
    }
  });
}
