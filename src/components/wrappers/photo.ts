/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import renderImageWithFadeIn from "../../helpers/dom/renderImageWithFadeIn";
import mediaSizes from "../../helpers/mediaSizes";
import { PhotoSize } from "../../layer";
import { MyDocument } from "../../lib/appManagers/appDocsManager";
import appDownloadManager, { ThumbCache } from "../../lib/appManagers/appDownloadManager";
import { MyPhoto } from "../../lib/appManagers/appPhotosManager";
import rootScope from "../../lib/rootScope";
import LazyLoadQueue from "../lazyLoadQueue";
import ProgressivePreloader from "../preloader";
import blur from '../../helpers/blur';
import { AppManagers } from "../../lib/appManagers/managers";
import getStrippedThumbIfNeeded from "../../helpers/getStrippedThumbIfNeeded";
import setAttachmentSize from "../../helpers/setAttachmentSize";
import choosePhotoSize from "../../lib/appManagers/utils/photos/choosePhotoSize";

export default function wrapPhoto({photo, message, container, boxWidth, boxHeight, withTail, isOut, lazyLoadQueue, middleware, size, withoutPreloader, loadPromises, autoDownloadSize, noBlur, noThumb, noFadeIn, blurAfter, managers = rootScope.managers}: {
  photo: MyPhoto | MyDocument, 
  message?: any, 
  container: HTMLElement, 
  boxWidth?: number, 
  boxHeight?: number, 
  withTail?: boolean, 
  isOut?: boolean, 
  lazyLoadQueue?: LazyLoadQueue, 
  middleware?: () => boolean, 
  size?: PhotoSize,
  withoutPreloader?: boolean,
  loadPromises?: Promise<any>[],
  autoDownloadSize?: number,
  noBlur?: boolean,
  noThumb?: boolean,
  noFadeIn?: boolean,
  blurAfter?: boolean,
  managers?: AppManagers,
}) {
  if(!((photo as MyPhoto).sizes || (photo as MyDocument).thumbs)) {
    if(boxWidth && boxHeight && !size && photo._ === 'document') {
      setAttachmentSize(photo, container, boxWidth, boxHeight, undefined, message);
    }

    return {
      loadPromises: {
        thumb: Promise.resolve(),
        full: Promise.resolve()
      },
      images: {
        thumb: null,
        full: null
      },
      preloader: null,
      aspecter: null
    };
  }

  let noAutoDownload = autoDownloadSize === 0;

  if(!size) {
    if(boxWidth === undefined) boxWidth = mediaSizes.active.regular.width;
    if(boxHeight === undefined) boxHeight = mediaSizes.active.regular.height;
  }

  container.classList.add('media-container');
  let aspecter = container;

  let isFit = true;
  let loadThumbPromise: Promise<any> = Promise.resolve();
  let thumbImage: HTMLImageElement | HTMLCanvasElement;
  let image: HTMLImageElement;
  let cacheContext: ThumbCache;
  const isGif = photo._ === 'document' && photo.mime_type === 'image/gif' && !size;
  // if(withTail) {
  //   image = wrapMediaWithTail(photo, message, container, boxWidth, boxHeight, isOut);
  // } else {
    image = new Image();

    if(boxWidth && boxHeight && !size) { // !album
      const set = setAttachmentSize(photo, container, boxWidth, boxHeight, undefined, message, undefined, isGif ? {
        _: 'photoSize',
        w: photo.w,
        h: photo.h,
        size: photo.size,
        type: 'full'
      } : undefined);
      size = set.photoSize;
      isFit = set.isFit;
      cacheContext = appDownloadManager.getCacheContext(photo, size.type);

      if(!isFit) {
        aspecter = document.createElement('div');
        aspecter.classList.add('media-container-aspecter');
        aspecter.style.width = set.size.width + 'px';
        aspecter.style.height = set.size.height + 'px';

        const gotThumb = getStrippedThumbIfNeeded(photo, cacheContext, !noBlur, true);
        if(gotThumb) {
          loadThumbPromise = gotThumb.loadPromise;
          const thumbImage = gotThumb.image; // local scope
          thumbImage.classList.add('media-photo');
          container.append(thumbImage);
        } else {
          const res = wrapPhoto({
            container,
            message,
            photo,
            boxWidth: 0,
            boxHeight: 0,
            size,
            lazyLoadQueue,
            isOut,
            loadPromises,
            middleware,
            withoutPreloader,
            withTail,
            autoDownloadSize,
            noBlur,
            noThumb: true,
            blurAfter: true,
            managers
            //noFadeIn: true
          });
          const thumbImage = res.images.full;
          thumbImage.classList.add('media-photo', 'thumbnail');
          //container.append(thumbImage);
        }

        container.classList.add('media-container-fitted');
        container.append(aspecter);
      }
    } else {
      if(!size) {
        size = choosePhotoSize(photo, boxWidth, boxHeight, true);
      }
      
      cacheContext = appDownloadManager.getCacheContext(photo, size?.type);
    }

    if(!noThumb) {
      const gotThumb = getStrippedThumbIfNeeded(photo, cacheContext, !noBlur);
      if(gotThumb) {
        loadThumbPromise = Promise.all([loadThumbPromise, gotThumb.loadPromise]);
        thumbImage = gotThumb.image;
        thumbImage.classList.add('media-photo');
        aspecter.append(thumbImage);
      }
    }
  // }

  image.classList.add('media-photo');
  
  //console.log('wrapPhoto downloaded:', photo, photo.downloaded, container);

  const needFadeIn = (thumbImage || !cacheContext.downloaded) && rootScope.settings.animationsEnabled && !noFadeIn;

  let preloader: ProgressivePreloader;
  if(message?.media?.preloader && !withoutPreloader) { // means upload
    preloader = message.media.preloader;
    preloader.attach(container);
    noAutoDownload = undefined;
  } else if(!cacheContext.downloaded) {
    preloader = new ProgressivePreloader({
      attachMethod: 'prepend'
    });
  }

  const getDownloadPromise = () => {
    const promise = isGif && !size ? 
      managers.appDocsManager.downloadDoc(photo, /* undefined,  */lazyLoadQueue?.queueId) : 
      managers.appPhotosManager.preloadPhoto(photo, size, lazyLoadQueue?.queueId, noAutoDownload);

    return promise;
  };

  const renderOnLoad = (url: string) => {
    return renderImageWithFadeIn(container, image, url, needFadeIn, aspecter, thumbImage);
  };

  const onLoad = (): Promise<void> => {
    if(middleware && !middleware()) return Promise.resolve();

    if(blurAfter) {
      const result = blur(cacheContext.url, 12);
      return result.promise.then(() => {
        // image = result.canvas;
        return renderOnLoad(result.canvas.toDataURL());
      });
    }

    return renderOnLoad(cacheContext.url);
  };

  let loadPromise: Promise<any>;
  const canAttachPreloader = (
    (size as PhotoSize.photoSize).w >= 150 && 
    (size as PhotoSize.photoSize).h >= 150
    ) || noAutoDownload;
  const load = () => {
    if(noAutoDownload && !withoutPreloader && preloader) {
      preloader.construct();
      preloader.setManual();
    }

    const promise = getDownloadPromise();

    if(preloader && 
      !cacheContext.downloaded && 
      !withoutPreloader && 
      canAttachPreloader
    ) {
      preloader.attach(container, false, promise);
    }

    noAutoDownload = undefined;

    const renderPromise = promise.then(onLoad);
    renderPromise.catch(() => {});
    return {download: promise, render: renderPromise};
  };

  if(preloader) {
    preloader.setDownloadFunction(load);
  }
  
  if(cacheContext.downloaded) {
    loadThumbPromise = loadPromise = load().render;
  } else {
    if(!lazyLoadQueue) loadPromise = load().render;
    /* else if(noAutoDownload) {
      preloader.construct();
      preloader.setManual();
      preloader.attach(container);
    } */ else lazyLoadQueue.push({div: container, load: () => load().download});
  }

  if(loadPromises && loadThumbPromise) {
    loadPromises.push(loadThumbPromise);
  }

  return {
    loadPromises: {
      thumb: loadThumbPromise,
      full: loadPromise || Promise.resolve()
    },
    images: {
      thumb: thumbImage,
      full: image
    },
    preloader,
    aspecter
  };
}
