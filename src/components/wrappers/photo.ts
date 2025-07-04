/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import renderMediaWithFadeIn from '../../helpers/dom/renderMediaWithFadeIn';
import mediaSizes from '../../helpers/mediaSizes';
import {InputWebFileLocation, Message, PhotoSize, VideoSize, WebDocument} from '../../layer';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {MyPhoto} from '../../lib/appManagers/appPhotosManager';
import rootScope from '../../lib/rootScope';
import LazyLoadQueue from '../lazyLoadQueue';
import ProgressivePreloader from '../preloader';
import blur from '../../helpers/blur';
import {AppManagers} from '../../lib/appManagers/managers';
import getMediaThumbIfNeeded from '../../helpers/getStrippedThumbIfNeeded';
import setAttachmentSize from '../../helpers/setAttachmentSize';
import choosePhotoSize from '../../lib/appManagers/utils/photos/choosePhotoSize';
import type {ThumbCache} from '../../lib/storages/thumbs';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import isWebDocument from '../../lib/appManagers/utils/webDocs/isWebDocument';
import createVideo from '../../helpers/dom/createVideo';
import noop from '../../helpers/noop';
import {THUMB_TYPE_FULL} from '../../lib/mtproto/mtproto_config';
import {getMiddleware, Middleware, MiddlewareHelper} from '../../helpers/middleware';
import liteMode from '../../helpers/liteMode';
import isWebFileLocation from '../../lib/appManagers/utils/webFiles/isWebFileLocation';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {attachClassName} from '../../helpers/solid/classname';
import {createEffect, on, onCleanup, Ref} from 'solid-js';

export default async function wrapPhoto({photo, message, container, boxWidth, boxHeight, withTail, isOut, lazyLoadQueue, middleware, size, withoutPreloader, loadPromises, autoDownloadSize, noBlur, noThumb, noFadeIn, blurAfter, managers = rootScope.managers, processUrl, fadeInElement, onRender, onRenderFinish, useBlur, useRenderCache, canHaveVideoPlayer, uploadingFileName}: {
  photo: MyPhoto | MyDocument | WebDocument | InputWebFileLocation,
  message?: Message.message | Message.messageService,
  container?: HTMLElement,
  boxWidth?: number,
  boxHeight?: number,
  withTail?: boolean,
  isOut?: boolean,
  lazyLoadQueue?: LazyLoadQueue | false,
  middleware?: Middleware,
  size?: PhotoSize | Extract<VideoSize, VideoSize.videoSize>,
  withoutPreloader?: boolean,
  loadPromises?: Promise<any>[],
  autoDownloadSize?: number,
  noBlur?: boolean,
  noThumb?: boolean,
  noFadeIn?: boolean,
  blurAfter?: boolean,
  managers?: AppManagers,
  processUrl?: (url: string) => Promise<string>,
  fadeInElement?: HTMLElement,
  onRender?: () => void,
  onRenderFinish?: () => void,
  useBlur?: boolean | number,
  useRenderCache?: boolean,
  canHaveVideoPlayer?: boolean,
  uploadingFileName?: string
}) {
  const ret = {
    loadPromises: {
      thumb: Promise.resolve() as Promise<any>,
      full: Promise.resolve() as Promise<any>
    },
    images: {
      thumb: null as HTMLImageElement | HTMLCanvasElement,
      full: null as HTMLVideoElement | HTMLImageElement
    },
    preloader: null as ProgressivePreloader,
    aspecter: null as HTMLElement
  };

  if(!container) {
    withoutPreloader = true;
    lazyLoadQueue = undefined;
  }

  const isWebFile = isWebFileLocation(photo);
  const isDocument = photo._ === 'document';
  const isImageFromDocument = isDocument && photo.mime_type.startsWith('image/') && !size;
  const isWebDoc = isWebDocument(photo);
  if(
    !((photo as MyPhoto).sizes || (photo as MyDocument).thumbs) &&
    !isWebDoc &&
    !isImageFromDocument &&
    !isWebFile
  ) {
    if(boxWidth && boxHeight && !size && isDocument) {
      setAttachmentSize({
        photo,
        element: container,
        boxWidth,
        boxHeight,
        message: message as Message.message,
        canHaveVideoPlayer
      });
    }

    return ret;
  }

  let noAutoDownload = autoDownloadSize === 0;

  if(!size) {
    if(boxWidth === undefined) boxWidth = mediaSizes.active.regular.width;
    if(boxHeight === undefined) boxHeight = mediaSizes.active.regular.height;
  }

  container && container.classList.add('media-container');
  let aspecter = container;

  let isFit = true;
  let loadThumbPromise: Promise<any> = Promise.resolve();
  let thumbImage: HTMLImageElement | HTMLCanvasElement;
  // let image: HTMLImageElement;
  let cacheContext: ThumbCache;
  // if(withTail) {
  //   image = wrapMediaWithTail(photo, message, container, boxWidth, boxHeight, isOut);
  // } else {

  if(boxWidth && boxHeight && !size && !isWebFile && container) { // !album
    const set = setAttachmentSize({
      photo,
      element: container,
      boxWidth,
      boxHeight,
      message: message as Message.message,
      photoSize: isImageFromDocument ? {
        _: 'photoSize',
        w: photo.w,
        h: photo.h,
        size: photo.size,
        type: THUMB_TYPE_FULL
      } : undefined,
      canHaveVideoPlayer
    });
    size = set.photoSize;
    isFit = set.isFit;
    cacheContext = apiManagerProxy.getCacheContext(photo, size.type);

    if(!isFit && !isWebDoc) {
      aspecter = document.createElement('div');
      aspecter.classList.add('media-container-aspecter');
      aspecter.style.width = set.size.width + 'px';
      aspecter.style.height = set.size.height + 'px';

      const gotThumb = getMediaThumbIfNeeded({
        photo,
        cacheContext,
        useBlur: useBlur !== undefined ? useBlur : !noBlur,
        ignoreCache: true,
        onlyStripped: true
      });
      if(gotThumb) {
        loadThumbPromise = gotThumb.loadPromise;
        const thumbImage = gotThumb.image; // local scope
        thumbImage.classList.add('media-photo');
        container.append(thumbImage);
      } else {
        const res = await wrapPhoto({
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
          withoutPreloader: true,
          withTail,
          autoDownloadSize,
          noBlur,
          noThumb: true,
          blurAfter: true,
          managers
          // noFadeIn: true
        });
        const thumbImage = res.images.full;
        thumbImage.classList.add('media-photo', 'thumbnail');
        // container.append(thumbImage);
      }

      container.classList.add('media-container-fitted');
      container.append(aspecter);
    }
  } else {
    if(!size && !isWebFile) {
      size = choosePhotoSize(photo, boxWidth, boxHeight, true);
    }

    cacheContext = apiManagerProxy.getCacheContext(photo, size?.type);
  }

  if(!noThumb && !isWebDoc && !isWebFile && aspecter) {
    const gotThumb = getMediaThumbIfNeeded({
      photo,
      cacheContext,
      useBlur: useBlur !== undefined ? useBlur : !noBlur
    });

    if(gotThumb) {
      loadThumbPromise = Promise.all([loadThumbPromise, gotThumb.loadPromise]);
      ret.loadPromises.thumb = ret.loadPromises.full = loadThumbPromise;
      thumbImage = ret.images.thumb = gotThumb.image;
      thumbImage.classList.add('media-photo');
      aspecter.append(thumbImage);
    }
  }
  // }

  ret.aspecter = aspecter;

  if((size?._ === 'photoSizeEmpty' && isDocument) || (size as PhotoSize.photoStrippedSize)?.bytes) {
    return ret;
  }

  let media: HTMLVideoElement | HTMLImageElement;
  if(size?._ === 'videoSize') {
    media = ret.images.full = createVideo({middleware});
    media.autoplay = true;
    media.loop = true;
    media.muted = true;
    media.classList.add('media-photo');
  } else {
    media = ret.images.full = new Image();
    media.classList.add('media-photo');
  }

  // console.log('wrapPhoto downloaded:', photo, photo.downloaded, container);

  const needFadeIn = (thumbImage || !cacheContext.downloaded) && liteMode.isAvailable('animations') && !noFadeIn;

  let preloader: ProgressivePreloader;
  uploadingFileName ??= (message as Message.message)?.uploadingFileName?.[0];
  if(!withoutPreloader) {
    if(!cacheContext.downloaded || uploadingFileName) {
      preloader = new ProgressivePreloader({
        attachMethod: 'prepend',
        isUpload: !!uploadingFileName
      });
    }

    if(uploadingFileName) { // means upload
      preloader.attachPromise(appDownloadManager.getUpload(uploadingFileName));
      preloader.attach(container);
      noAutoDownload = undefined;
    }
  }


  const getDownloadPromise = () => {
    // const promise = isGif && !size ?
    //   managers.appDocsManager.downloadDoc(photo, /* undefined,  */lazyLoadQueue?.queueId) :
    //   managers.appPhotosManager.preloadPhoto(photo, size, lazyLoadQueue?.queueId, noAutoDownload);
    const haveToDownload = isImageFromDocument && !size;
    const promise = appDownloadManager.downloadMediaURL({
      media: photo,
      thumb: size,
      queueId: lazyLoadQueue && lazyLoadQueue.queueId,
      onlyCache: haveToDownload ? undefined : noAutoDownload
    });

    return promise;
  };

  const renderOnLoad = (url: string) => {
    return renderMediaWithFadeIn({
      container,
      media,
      url,
      needFadeIn,
      aspecter,
      thumbImage,
      fadeInElement,
      onRender,
      onRenderFinish,
      useRenderCache
    });
  };

  const onLoad = async(url: string) => {
    if(middleware && !middleware()) return;

    if(processUrl) {
      url = await processUrl(url);
    }

    if(blurAfter) {
      const result = blur(url, 12);
      return result.promise.then(() => {
        // image = result.canvas;
        return renderOnLoad(result.canvas.toDataURL());
      });
    }

    return renderOnLoad(url);
  };

  let loadPromise: Promise<any>;
  const canAttachPreloader = (
    !isWebFile &&
    (size as PhotoSize.photoSize).w >= 150 &&
    (size as PhotoSize.photoSize).h >= 150
  ) || noAutoDownload;
  const load = async() => {
    if(noAutoDownload && !withoutPreloader && preloader) {
      preloader.construct();
      preloader.setManual();
    }

    const promise = getDownloadPromise();
    const cacheContext = apiManagerProxy.getCacheContext(photo, size?.type);
    if(
      preloader &&
      !cacheContext.downloaded &&
      !withoutPreloader &&
      canAttachPreloader
    ) {
      preloader.attach(container, false, promise);
    }

    noAutoDownload = undefined;

    const renderPromise = promise.then(onLoad);
    renderPromise.catch(noop);
    return {download: promise, render: renderPromise};
  };

  if(preloader) {
    preloader.setDownloadFunction(load);
  }

  if(cacheContext.downloaded) {
    loadThumbPromise = loadPromise = (await load()).render;
  } else {
    if(!lazyLoadQueue) loadPromise = (await load()).render;
    /* else if(noAutoDownload) {
      preloader.construct();
      preloader.setManual();
      preloader.attach(container);
    } */ else lazyLoadQueue.push({div: container, load: () => load().then(({download}) => download)});
  }

  if(loadPromises && loadThumbPromise) {
    loadPromises.push(loadThumbPromise);
  }

  // const perf = performance.now();
  // ! do not uncomment this, won't be able to modify element before the thumb is loaded
  // await loadThumbPromise;
  ret.loadPromises.thumb = loadThumbPromise;
  ret.loadPromises.full = loadPromise || Promise.resolve();
  ret.preloader = preloader;

  // const elapsedTime = performance.now() - perf;
  // if(elapsedTime > 4) {
  //   console.log('wrapping photo thumb time', elapsedTime, photo, size);
  // }

  return ret;
}

export function PhotoTsx(props: Parameters<typeof wrapPhoto>[0] & {
  class?: string
  ref?: Ref<HTMLElement>
}) {
  const div = document.createElement('div');

  attachClassName(div, () => props.class);

  let middleware: MiddlewareHelper
  createEffect(on(() => props.photo, async() => {
    if(middleware) middleware.destroy();
    middleware = getMiddleware()

    wrapPhoto({
      ...props,
      middleware: middleware.get(),
      container: div
    })
  }))

  onCleanup(() => middleware?.destroy())

  if(typeof props.ref === 'function') {
    props.ref(div);
  }

  return div
}
