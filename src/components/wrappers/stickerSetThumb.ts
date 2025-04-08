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
import {EMOJI_TEXT_COLOR} from '../emoticonsDropdown';

export default async function wrapStickerSetThumb({set, lazyLoadQueue, container, group, autoplay, width, height, managers = rootScope.managers, middleware, textColor}: {
  set: StickerSet.stickerSet,
  lazyLoadQueue: LazyLoadQueue,
  container: HTMLElement,
  group: AnimationItemGroup,
  autoplay: boolean,
  width: number,
  height: number,
  managers?: AppManagers
  middleware: Middleware,
  textColor?: string
}) {
  if(set.thumbs?.length) {
    container.classList.add('media-sticker-wrapper');
    lazyLoadQueue.push({
      div: container,
      load: async() => {
        const downloadOptions = await managers.appStickersManager.getStickerSetThumbDownloadOptions(set);
        const promise = appDownloadManager.download(downloadOptions);

        const isLottie = downloadOptions.mimeType === 'application/x-tgsticker';
        if(isLottie) {
          return promise.then((blob) => {
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
          const isVideo = set.thumbs?.some((thumb) => thumb.type === 'v');
          let media: HTMLElement;
          if(isVideo) {
            media = createVideo({middleware});
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

              if(isVideo) {
                animationIntersector.addAnimation({
                  animation: media as HTMLVideoElement,
                  group,
                  observeElement: media,
                  type: 'video'
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

  const attribute = doc.attributes.find((a) => a._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji
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
    textColor: attribute?.pFlags?.text_color ? textColor || EMOJI_TEXT_COLOR : undefined
  }); // kostil
}
