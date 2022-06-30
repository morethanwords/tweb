/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { ChatAutoDownloadSettings } from "../../helpers/autoDownload";
import mediaSizes from "../../helpers/mediaSizes";
import { Message, PhotoSize } from "../../layer";
import { AppManagers } from "../../lib/appManagers/managers";
import getMediaFromMessage from "../../lib/appManagers/utils/messages/getMediaFromMessage";
import choosePhotoSize from "../../lib/appManagers/utils/photos/choosePhotoSize";
import rootScope from "../../lib/rootScope";
import Chat from "../chat/chat";
import LazyLoadQueue from "../lazyLoadQueue";
import prepareAlbum from "../prepareAlbum";
import wrapPhoto from "./photo";
import wrapVideo from "./video";

export default function wrapAlbum({messages, attachmentDiv, middleware, uploading, lazyLoadQueue, isOut, chat, loadPromises, autoDownload, managers = rootScope.managers}: {
  messages: Message.message[],
  attachmentDiv: HTMLElement,
  middleware?: () => boolean,
  lazyLoadQueue?: LazyLoadQueue,
  uploading?: boolean,
  isOut: boolean,
  chat: Chat,
  loadPromises?: Promise<any>[],
  autoDownload?: ChatAutoDownloadSettings,
  managers?: AppManagers
}) {
  const items: {size: PhotoSize.photoSize, media: any, message: any}[] = [];

  // !lowest msgID will be the FIRST in album
  for(const message of messages) {
    const media = getMediaFromMessage(message);

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

  items.forEach((item, idx) => {
    const {size, media, message} = item;

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
        doc: message.media.document,
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
        managers
      });
    }

    if(thumbPromise && loadPromises) {
      loadPromises.push(thumbPromise);
    }
  });
}
