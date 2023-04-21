/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import createVideo from '../../helpers/dom/createVideo';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import {Document, DocumentAttribute, StickerSet} from '../../layer';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import {AppManagers} from '../../lib/appManagers/managers';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import rootScope from '../../lib/rootScope';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import LazyLoadQueue from '../lazyLoadQueue';
import wrapSticker from './sticker';
import {Middleware} from '../../helpers/middleware';

export default async function wrapStickerSetThumb({set, lazyLoadQueue, container, group, autoplay, width, height, managers = rootScope.managers, middleware}: {
  set: StickerSet.stickerSet,
  lazyLoadQueue: LazyLoadQueue,
  container: HTMLElement,
  group: AnimationItemGroup,
  autoplay: boolean,
  width: number,
  height: number,
  managers?: AppManagers
  middleware?: Middleware
}) {
  if(set.thumbs?.length) {
    container.classList.add('media-sticker-wrapper');
    lazyLoadQueue.push({
      div: container,
      load: async() => {
        const downloadOptions = await managers.appStickersManager.getStickerSetThumbDownloadOptions(set);
        const promise = appDownloadManager.download(downloadOptions);

        if(set.pFlags.animated && !set.pFlags.videos) {
          return promise
          .then((blob) => {
            lottieLoader.loadAnimationWorker({
              container,
              loop: true,
              autoplay,
              animationData: blob,
              width,
              height,
              needUpscale: true,
              name: 'setThumb' + set.id,
              group,
              middleware
            });
          });
        } else {
          let media: HTMLElement;
          if(set.pFlags.videos) {
            media = createVideo();
            (media as HTMLVideoElement).autoplay = true;
            (media as HTMLVideoElement).muted = true;
            (media as HTMLVideoElement).loop = true;
          } else {
            media = new Image();
          }

          media.classList.add('media-sticker');

          return promise.then((blob) => {
            renderImageFromUrl(media, URL.createObjectURL(blob), () => {
              container.append(media);

              if(set.pFlags.videos) {
                animationIntersector.addAnimation({
                  animation: media as HTMLVideoElement,
                  group
                });
              }
            });
          });
        }
      }
    });

    return;
  }

  let getDocPromise: Promise<Document.document>;

  if(set.thumb_document_id) {
    getDocPromise = managers.appEmojiManager.getCustomEmojiDocument(set.thumb_document_id);
  } else {
    getDocPromise = managers.appStickersManager.getStickerSet(set).then((stickerSet) => stickerSet.documents[0] as Document.document);
  }

  const doc = await getDocPromise;
  if(!doc) {
    return;
  }

  const attribute = doc.attributes.find(a => a._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji
  // as thumb will be used first sticker
  wrapSticker({
    doc,
    div: container,
    group: group,
    lazyLoadQueue,
    managers,
    width,
    height,
    middleware,
    textColor: attribute?.pFlags?.text_color ? 'primary-text-color' : undefined
  }); // kostil
}
