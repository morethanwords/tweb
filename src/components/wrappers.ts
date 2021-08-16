/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from './chat/chat';
import { getEmojiToneIndex } from '../vendor/emoji';
import { readBlobAsText } from '../helpers/blob';
import { deferredPromise } from '../helpers/cancellablePromise';
import { formatDateAccordingToToday, months } from '../helpers/date';
import mediaSizes from '../helpers/mediaSizes';
import { formatBytes } from '../helpers/number';
import { isSafari } from '../helpers/userAgent';
import { PhotoSize, StickerSet } from '../layer';
import appDocsManager, { MyDocument } from "../lib/appManagers/appDocsManager";
import appMessagesManager from '../lib/appManagers/appMessagesManager';
import appPhotosManager, { MyPhoto } from '../lib/appManagers/appPhotosManager';
import LottieLoader from '../lib/lottieLoader';
import webpWorkerController from '../lib/webp/webpWorkerController';
import animationIntersector from './animationIntersector';
import appMediaPlaybackController from './appMediaPlaybackController';
import AudioElement from './audio';
import ReplyContainer from './chat/replyContainer';
import { Layouter, RectPart } from './groupedLayout';
import LazyLoadQueue from './lazyLoadQueue';
import PollElement from './poll';
import ProgressivePreloader from './preloader';
import './middleEllipsis';
import RichTextProcessor from '../lib/richtextprocessor';
import appImManager from '../lib/appManagers/appImManager';
import { SearchSuperContext } from './appSearchSuper.';
import rootScope from '../lib/rootScope';
import { onVideoLoad } from '../helpers/files';
import { animateSingle } from '../helpers/animation';
import renderImageFromUrl from '../helpers/dom/renderImageFromUrl';
import sequentialDom from '../helpers/sequentialDom';
import { fastRaf } from '../helpers/schedulers';
import appDownloadManager, { DownloadBlob, ThumbCache } from '../lib/appManagers/appDownloadManager';
import appStickersManager from '../lib/appManagers/appStickersManager';
import { cancelEvent } from '../helpers/dom/cancelEvent';
import { attachClickEvent } from '../helpers/dom/clickEvent';
import isInDOM from '../helpers/dom/isInDOM';
import lottieLoader from '../lib/lottieLoader';
import { clearBadCharsAndTrim } from '../helpers/cleanSearchText';

const MAX_VIDEO_AUTOPLAY_SIZE = 50 * 1024 * 1024; // 50 MB

export function wrapVideo({doc, container, message, boxWidth, boxHeight, withTail, isOut, middleware, lazyLoadQueue, noInfo, group, onlyPreview, withoutPreloader, loadPromises, noPlayButton, noAutoDownload, size}: {
  doc: MyDocument, 
  container?: HTMLElement, 
  message?: any, 
  boxWidth?: number, 
  boxHeight?: number, 
  withTail?: boolean, 
  isOut?: boolean,
  middleware?: () => boolean,
  lazyLoadQueue?: LazyLoadQueue,
  noInfo?: true,
  noPlayButton?: boolean,
  group?: string,
  onlyPreview?: boolean,
  withoutPreloader?: boolean,
  loadPromises?: Promise<any>[],
  noAutoDownload?: boolean,
  size?: PhotoSize
}) {
  const isAlbumItem = !(boxWidth && boxHeight);
  const canAutoplay = (doc.type !== 'video' || (doc.size <= MAX_VIDEO_AUTOPLAY_SIZE && !isAlbumItem)) 
    && (doc.type === 'gif' ? rootScope.settings.autoPlay.gifs : rootScope.settings.autoPlay.videos);
  let spanTime: HTMLElement, spanPlay: HTMLElement;

  if(!noInfo) {
    spanTime = document.createElement('span');
    spanTime.classList.add('video-time');
    container.append(spanTime);
  
    let needPlayButton = false;
    if(doc.type !== 'gif') {
      spanTime.innerText = (doc.duration + '').toHHMMSS(false);

      if(!noPlayButton && doc.type !== 'round') {
        if(canAutoplay) {
          spanTime.classList.add('tgico', 'can-autoplay');
        } else {
          needPlayButton = true;
        }
      }
    } else {
      spanTime.innerText = 'GIF';

      if(!canAutoplay && !noPlayButton) {
        needPlayButton = true;
        noAutoDownload = undefined;
      }
    }

    if(needPlayButton) {
      spanPlay = document.createElement('span');
      spanPlay.classList.add('video-play', 'tgico-largeplay', 'btn-circle', 'position-center');
      container.append(spanPlay);
    }
  }

  let res: {
    thumb?: typeof photoRes,
    loadPromise: Promise<any>
  } = {} as any;

  if(doc.mime_type === 'image/gif') {
    const photoRes = wrapPhoto({
      photo: doc, 
      message, 
      container, 
      boxWidth, 
      boxHeight, 
      withTail, 
      isOut, 
      lazyLoadQueue, 
      middleware,
      withoutPreloader,
      loadPromises,
      noAutoDownload,
      size
    });

    res.thumb = photoRes;
    res.loadPromise = photoRes.loadPromises.full;
    return res;
  }

  /* const video = doc.type === 'round' ? appMediaPlaybackController.addMedia(doc, message.mid) as HTMLVideoElement : document.createElement('video');
  if(video.parentElement) {
    video.remove();
  } */

  const video = document.createElement('video');
  video.classList.add('media-video');
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  if(doc.type === 'round') {
    const globalVideo = appMediaPlaybackController.addMedia(message.peerId, doc, message.mid, !noAutoDownload) as HTMLVideoElement;
 
    const divRound = document.createElement('div');
    divRound.classList.add('media-round', 'z-depth-1');

    divRound.innerHTML = `<svg class="progress-ring" width="280px" height="280px" style="transform: rotate(-90deg);">
      <circle class="progress-ring__circle" stroke="white" stroke-opacity="0.3" stroke-width="3.5" cx="140" cy="140" r="133" fill="transparent"/>
    </svg>`;

    const circle = divRound.querySelector('.progress-ring__circle') as SVGCircleElement;
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = circumference + ' ' + circumference;
    circle.style.strokeDashoffset = '' + circumference;
    
    spanTime.classList.add('tgico');

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = doc.w/*  * window.devicePixelRatio */;

    divRound.prepend(canvas, spanTime);
    divRound.append(video);
    container.append(divRound);

    const ctx = canvas.getContext('2d');
    /* ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
    ctx.clip(); */

    const clear = () => {
      (appImManager.chat.setPeerPromise || Promise.resolve()).finally(() => {
        if(isInDOM(globalVideo)) {
          return;
        }

        globalVideo.removeEventListener('play', onPlay);
        globalVideo.removeEventListener('timeupdate', onTimeUpdate);
        globalVideo.removeEventListener('pause', onPaused);
        globalVideo.removeEventListener('ended', onEnded);
      });
    };

    const onFrame = () => {
      ctx.drawImage(globalVideo, 0, 0);

      const offset = circumference - globalVideo.currentTime / globalVideo.duration * circumference;
      circle.style.strokeDashoffset = '' + offset;

      return !globalVideo.paused;
    };

    const onTimeUpdate = () => {
      if(!globalVideo.duration) return;

      if(!isInDOM(globalVideo)) {
        clear();
        return;
      }

      spanTime.innerText = (globalVideo.duration - globalVideo.currentTime + '').toHHMMSS(false);
    };

    const onPlay = () => {
      video.classList.add('hide');
      divRound.classList.remove('is-paused');
      animateSingle(onFrame, canvas);
    };

    const onPaused = () => {
      if(!isInDOM(globalVideo)) {
        clear();
        return;
      }

      divRound.classList.add('is-paused');
    };

    const onEnded = () => {
      video.classList.remove('hide');
      divRound.classList.add('is-paused');
      
      video.currentTime = 0;
      spanTime.innerText = ('' + globalVideo.duration).toHHMMSS(false);
    };

    globalVideo.addEventListener('play', onPlay);
    globalVideo.addEventListener('timeupdate', onTimeUpdate);
    globalVideo.addEventListener('pause', onPaused);
    globalVideo.addEventListener('ended', onEnded);

    attachClickEvent(canvas, (e) => {
      cancelEvent(e);

      if(globalVideo.paused) {
        globalVideo.play();
      } else {
        globalVideo.pause();
      }
    });

    if(globalVideo.paused) {
      if(globalVideo.duration && globalVideo.currentTime !== globalVideo.duration && globalVideo.currentTime > 0) {
        onFrame();
        onTimeUpdate();
        video.classList.add('hide');
      } else {
        onPaused();
      }
    } else {
      onPlay();
    }
  } else {
    video.autoplay = true; // для safari
  }

  let photoRes: ReturnType<typeof wrapPhoto>;
  if(message) {
    photoRes = wrapPhoto({
      photo: doc, 
      message, 
      container, 
      boxWidth, 
      boxHeight, 
      withTail, 
      isOut, 
      lazyLoadQueue, 
      middleware,
      withoutPreloader: true,
      loadPromises,
      noAutoDownload,
      size
    });

    res.thumb = photoRes;

    if((!canAutoplay && doc.type !== 'gif') || onlyPreview) {
      res.loadPromise = photoRes.loadPromises.full;
      return res;
    }

    if(withTail) {
      const foreignObject = (photoRes.images.thumb || photoRes.images.full).parentElement;
      video.width = +foreignObject.getAttributeNS(null, 'width');
      video.height = +foreignObject.getAttributeNS(null, 'height');
      foreignObject.append(video);
    }
  } else { // * gifs masonry
    const gotThumb = appDocsManager.getThumb(doc, false);
    if(gotThumb) {
      gotThumb.promise.then(() => {
        video.poster = gotThumb.cacheContext.url;
      });
    }
  }

  if(!video.parentElement && container) {
    (photoRes?.aspecter || container).append(video);
  }

  const cacheContext = appDownloadManager.getCacheContext(doc);

  let preloader: ProgressivePreloader;
  if(message?.media?.preloader) { // means upload
    preloader = message.media.preloader as ProgressivePreloader;
    preloader.attach(container, false);
    noAutoDownload = undefined;
  } else if(!cacheContext.downloaded && !doc.supportsStreaming) {
    preloader = new ProgressivePreloader({
      attachMethod: 'prepend'
    });
  } else if(doc.supportsStreaming) {
    preloader = new ProgressivePreloader({
      cancelable: false,
      attachMethod: 'prepend'
    });
  }

  let f = noAutoDownload && photoRes?.preloader?.loadFunc;
  const load = () => {
    if(preloader && noAutoDownload && !withoutPreloader) {
      preloader.construct();
      preloader.setManual();
    }

    let loadPromise: Promise<any> = Promise.resolve();
    if(preloader) {
      if(!cacheContext.downloaded && !doc.supportsStreaming) {
        const promise = loadPromise = appDocsManager.downloadDoc(doc, lazyLoadQueue?.queueId, noAutoDownload);
        preloader.attach(container, false, promise);
      } else if(doc.supportsStreaming) {
        if(noAutoDownload) {
          loadPromise = Promise.reject();
        } else if(!cacheContext.downloaded) { // * check for uploading video
          preloader.attach(container, false, null);
          video.addEventListener(isSafari ? 'timeupdate' : 'canplay', () => {
            preloader.detach();
          }, {once: true});
        }
      }
    }

    video.addEventListener('error', (e) => {
      if(video.error.code !== 4) {
        console.error("Error " + video.error.code + "; details: " + video.error.message);
      }
      
      if(preloader) {
        preloader.detach();
      }
    }, {once: true});

    if(!noAutoDownload && f) {
      f();
      f = null;
    }

    noAutoDownload = undefined;

    const deferred = deferredPromise<void>();
    loadPromise.then(() => {
      if(middleware && !middleware()) {
        deferred.resolve();
        return;
      }

      if(doc.type === 'round') {
        appMediaPlaybackController.resolveWaitingForLoadMedia(message.peerId, message.mid);
      }

      onVideoLoad(video).then(() => {
        if(group) {
          animationIntersector.addAnimation(video, group);
        }
  
        deferred.resolve();
      });
  
      if(doc.type === 'video') {
        video.addEventListener('timeupdate', () => {
          spanTime.innerText = (video.duration - video.currentTime + '').toHHMMSS(false);
        });
      }
  
      video.addEventListener('error', (e) => {
        deferred.resolve();
      });
  
      video.muted = true;
      video.loop = true;
      //video.play();
      video.autoplay = true;

      renderImageFromUrl(video, cacheContext.url);
    }, () => {});

    return {download: loadPromise, render: deferred};
  };

  if(preloader) {
    preloader.setDownloadFunction(load);
  }

  /* if(doc.size >= 20e6 && !doc.downloaded) {
    let downloadDiv = document.createElement('div');
    downloadDiv.classList.add('download');

    let span = document.createElement('span');
    span.classList.add('btn-circle', 'tgico-download');
    downloadDiv.append(span);

    downloadDiv.addEventListener('click', () => {
      downloadDiv.remove();
      loadVideo();
    });

    container.prepend(downloadDiv);

    return;
  } */

  if(doc.type === 'gif' && !canAutoplay) {
    attachClickEvent(container, (e) => {
      cancelEvent(e);
      spanPlay.remove();
      load();
    }, {capture: true, once: true});
  } else {
    res.loadPromise = !lazyLoadQueue ? load().render : (lazyLoadQueue.push({div: container, load: () => load().render}), Promise.resolve());
  }

  return res;
}

export const formatDate = (timestamp: number, monthShort = false, withYear = true) => {
  const date = new Date(timestamp * 1000);
  
  let month = months[date.getMonth()];
  if(monthShort) month = month.slice(0, 3);

  let str = month + ' ' + date.getDate();
  if(withYear) {
    str += ', ' + date.getFullYear();
  }
  
  return str + ' at ' + date.getHours() + ':' + ('0' + date.getMinutes()).slice(-2);
};

export function wrapDocument({message, withTime, fontWeight, voiceAsMusic, showSender, searchContext, loadPromises, noAutoDownload, lazyLoadQueue}: {
  message: any, 
  withTime?: boolean,
  fontWeight?: number,
  voiceAsMusic?: boolean,
  showSender?: boolean,
  searchContext?: SearchSuperContext,
  loadPromises?: Promise<any>[],
  noAutoDownload?: boolean,
  lazyLoadQueue?: LazyLoadQueue
}): HTMLElement {
  if(!fontWeight) fontWeight = 500;

  const doc = (message.media.document || message.media.webpage.document) as MyDocument;
  const uploading = message.pFlags.is_outgoing && message.media?.preloader;
  if(doc.type === 'audio' || doc.type === 'voice') {
    const audioElement = new AudioElement();
    audioElement.setAttribute('message-id', '' + message.mid);
    audioElement.setAttribute('peer-id', '' + message.peerId);
    audioElement.withTime = withTime;
    audioElement.message = message;
    audioElement.noAutoDownload = noAutoDownload;
    
    if(voiceAsMusic) audioElement.voiceAsMusic = voiceAsMusic;
    if(searchContext) audioElement.searchContext = searchContext;
    if(showSender) audioElement.showSender = showSender;
    if(uploading) audioElement.preloader = message.media.preloader;

    audioElement.dataset.fontWeight = '' + fontWeight;
    audioElement.render();
    return audioElement;
  }

  let extSplitted = doc.file_name ? doc.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ? 
    clearBadCharsAndTrim(extSplitted.pop().split(' ', 1)[0].toLowerCase()) : 
    'file';

  let docDiv = document.createElement('div');
  docDiv.classList.add('document', `ext-${ext}`);
  docDiv.dataset.docId = doc.id;

  const icoDiv = document.createElement('div');
  icoDiv.classList.add('document-ico');

  const cacheContext = appDownloadManager.getCacheContext(doc);
  if(doc.thumbs?.length || (message.pFlags.is_outgoing && cacheContext.url && doc.type === 'photo')) {
    docDiv.classList.add('document-with-thumb');

    let imgs: HTMLImageElement[] = [];
    if(message.pFlags.is_outgoing) {
      icoDiv.innerHTML = `<img src="${cacheContext.url}">`;
      imgs.push(icoDiv.firstElementChild as HTMLImageElement);
    } else {
      const wrapped = wrapPhoto({
        photo: doc, 
        message: null, 
        container: icoDiv, 
        boxWidth: 54, 
        boxHeight: 54,
        loadPromises,
        withoutPreloader: true,
        lazyLoadQueue
      });
      icoDiv.style.width = icoDiv.style.height = '';
      if(wrapped.images.thumb) imgs.push(wrapped.images.thumb);
      if(wrapped.images.full) imgs.push(wrapped.images.full);
    }

    imgs.forEach(img => img.classList.add('document-thumb'));
  } else {
    icoDiv.innerText = ext;
  }

  //let fileName = stringMiddleOverflow(doc.file_name || 'Unknown.file', 26);
  let fileName = doc.fileName || 'Unknown.file';
  let size = formatBytes(doc.size);
  
  if(withTime) {
    size += ' · ' + formatDate(doc.date);
  }

  if(showSender) {
    size += ' · ' + appMessagesManager.getSenderToPeerText(message);
  }

  let titleAdditionHTML = '';
  if(showSender) {
    titleAdditionHTML = `<div class="sent-time">${formatDateAccordingToToday(new Date(message.date * 1000))}</div>`;
  }
  
  docDiv.innerHTML = `
  ${cacheContext.downloaded && !uploading ? '' : `<div class="document-download"></div>`}
  <div class="document-name"><middle-ellipsis-element data-font-weight="${fontWeight}">${fileName}</middle-ellipsis-element>${titleAdditionHTML}</div>
  <div class="document-size">${size}</div>
  `;

  docDiv.prepend(icoDiv);

  if(!uploading && message.pFlags.is_outgoing) {
    return docDiv;
  }

  let downloadDiv: HTMLElement, preloader: ProgressivePreloader = null;
  const onLoad = () => {
    if(downloadDiv) {
      downloadDiv.classList.add('downloaded');
      const _downloadDiv = downloadDiv;
      setTimeout(() => {
        _downloadDiv.remove();
      }, 200);
      downloadDiv = null;
    }

    if(preloader) {
      preloader = null;
    }
  };

  const load = () => {
    const doc = appDocsManager.getDoc(docDiv.dataset.docId);
    let download: DownloadBlob;
    if(doc.type === 'pdf') {
      download = appDocsManager.downloadDoc(doc, appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : 0);
      download.then(() => {
        const cacheContext = appDownloadManager.getCacheContext(doc);
        window.open(cacheContext.url);
      });
    } else {
      download = appDocsManager.saveDocFile(doc, appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : 0);
    }

    if(downloadDiv) {
      download.then(onLoad);
      preloader.attach(downloadDiv, true, download);
    }

    return {download};
  };

  if(!(cacheContext.downloaded && !uploading)) {
    downloadDiv = docDiv.querySelector('.document-download');
    preloader = message.media.preloader as ProgressivePreloader;

    if(!preloader) {
      preloader = new ProgressivePreloader();

      preloader.construct();
      preloader.setManual();
      preloader.attach(downloadDiv);
      preloader.setDownloadFunction(load);
    } else {
      preloader.attach(downloadDiv);
      message.media.promise.then(onLoad);
    }
  }

  attachClickEvent(docDiv, (e) => {
    if(preloader) {
      preloader.onClick(e);
    } else {
      load();
    }
  });
  
  return docDiv;
}

/* function wrapMediaWithTail(photo: MyPhoto | MyDocument, message: {mid: number, message: string}, container: HTMLElement, boxWidth: number, boxHeight: number, isOut: boolean) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('bubble__media-container', isOut ? 'is-out' : 'is-in');
  
  const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", 'foreignObject');

  const gotThumb = appPhotosManager.getStrippedThumbIfNeeded(photo, true);
  if(gotThumb) {
    foreignObject.append(gotThumb.image);
  }
  appPhotosManager.setAttachmentSize(photo, foreignObject, boxWidth, boxHeight);
  
  const width = +foreignObject.getAttributeNS(null, 'width');
  const height = +foreignObject.getAttributeNS(null, 'height');

  svg.setAttributeNS(null, 'width', '' + width);
  svg.setAttributeNS(null, 'height', '' + height);

  svg.setAttributeNS(null, 'viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttributeNS(null, 'preserveAspectRatio', 'none');

  const clipId = 'clip' + message.mid + '_' + nextRandomInt(9999);
  svg.dataset.clipId = clipId;
  
  const defs = document.createElementNS("http://www.w3.org/2000/svg", 'defs');
  let clipPathHTML: string = '';
  
  if(message.message) {
    //clipPathHTML += `<rect width="${width}" height="${height}"></rect>`;
  } else {
    if(isOut) {
      clipPathHTML += `
      <use href="#message-tail" transform="translate(${width - 2}, ${height}) scale(-1, -1)"></use>
      <path />
      `;
    } else {
      clipPathHTML += `
      <use href="#message-tail" transform="translate(2, ${height}) scale(1, -1)"></use>
      <path />
      `;
    }
  }

  defs.innerHTML = `<clipPath id="${clipId}">${clipPathHTML}</clipPath>`;
  
  container.style.width = parseInt(container.style.width) - 9 + 'px';
  container.classList.add('with-tail');

  svg.append(defs, foreignObject);
  container.append(svg);

  let img = foreignObject.firstElementChild as HTMLImageElement;
  if(!img) {
    foreignObject.append(img = new Image());
  }

  return img;
} */

export function wrapPhoto({photo, message, container, boxWidth, boxHeight, withTail, isOut, lazyLoadQueue, middleware, size, withoutPreloader, loadPromises, noAutoDownload, noBlur, noThumb, noFadeIn}: {
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
  noAutoDownload?: boolean,
  noBlur?: boolean,
  noThumb?: boolean,
  noFadeIn?: boolean,
}) {
  if(!((photo as MyPhoto).sizes || (photo as MyDocument).thumbs)) {
    if(boxWidth && boxHeight && !size && photo._ === 'document') {
      appPhotosManager.setAttachmentSize(photo, container, boxWidth, boxHeight, undefined, message);
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

  if(!size) {
    if(boxWidth === undefined) boxWidth = mediaSizes.active.regular.width;
    if(boxHeight === undefined) boxHeight = mediaSizes.active.regular.height;
  }

  container.classList.add('media-container');
  let aspecter = container;

  let isFit = true;
  let loadThumbPromise: Promise<any> = Promise.resolve();
  let thumbImage: HTMLImageElement;
  let image: HTMLImageElement;
  let cacheContext: ThumbCache;
  // if(withTail) {
  //   image = wrapMediaWithTail(photo, message, container, boxWidth, boxHeight, isOut);
  // } else {
    image = new Image();

    if(boxWidth && boxHeight && !size) { // !album
      const set = appPhotosManager.setAttachmentSize(photo, container, boxWidth, boxHeight, undefined, message);
      size = set.photoSize;
      isFit = set.isFit;
      cacheContext = appDownloadManager.getCacheContext(photo, size.type);

      if(!isFit) {
        aspecter = document.createElement('div');
        aspecter.classList.add('media-container-aspecter');
        aspecter.style.width = set.size.width + 'px';
        aspecter.style.height = set.size.height + 'px';

        const gotThumb = appPhotosManager.getStrippedThumbIfNeeded(photo, cacheContext, !noBlur, true);
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
            noAutoDownload,
            noBlur,
            noThumb: true,
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
        size = appPhotosManager.choosePhotoSize(photo, boxWidth, boxHeight, true);
      }
      
      cacheContext = appDownloadManager.getCacheContext(photo, size?.type);
    }

    if(!noThumb) {
      const gotThumb = appPhotosManager.getStrippedThumbIfNeeded(photo, cacheContext, !noBlur);
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
  if(message?.media?.preloader) { // means upload
    preloader = message.media.preloader;
    preloader.attach(container);
    noAutoDownload = undefined;
  } else {
    preloader = new ProgressivePreloader({
      attachMethod: 'prepend'
    });
  }

  const getDownloadPromise = () => {
    const promise = photo._ === 'document' && photo.mime_type === 'image/gif' ? 
      appDocsManager.downloadDoc(photo, /* undefined,  */lazyLoadQueue?.queueId) : 
      appPhotosManager.preloadPhoto(photo, size, lazyLoadQueue?.queueId, noAutoDownload);

    noAutoDownload = undefined;

    return promise;
  };

  const onLoad = (): Promise<void> => {
    if(middleware && !middleware()) return Promise.resolve();

    return renderImageWithFadeIn(container, image, cacheContext.url, needFadeIn, aspecter, thumbImage);
  };

  let loadPromise: Promise<any>;
  const load = () => {
    if(noAutoDownload && !withoutPreloader) {
      preloader.construct();
      preloader.setManual();
    }

    const promise = getDownloadPromise();

    if(!cacheContext.downloaded && !withoutPreloader && (size as PhotoSize.photoSize).w >= 150 && (size as PhotoSize.photoSize).h >= 150) {
      preloader.attach(container, false, promise);
    }

    const renderPromise = promise.then(onLoad);
    renderPromise.catch(() => {});
    return {download: promise, render: renderPromise};
  };

  preloader.setDownloadFunction(load);
  
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

export function renderImageWithFadeIn(container: HTMLElement, 
  image: HTMLImageElement, 
  url: string, 
  needFadeIn: boolean, 
  aspecter = container,
  thumbImage?: HTMLImageElement
) {
  if(needFadeIn) {
    image.classList.add('fade-in');
  }

  return new Promise<void>((resolve) => {
    /* if(photo._ === 'document') {
      console.error('wrapPhoto: will render document', photo, size, cacheContext);
      return resolve();
    } */

    renderImageFromUrl(image, url, () => {
      sequentialDom.mutateElement(container, () => {
        aspecter.append(image);

        fastRaf(() => {
          resolve();
        });

        if(needFadeIn) {
          image.addEventListener('animationend', () => {
            sequentialDom.mutate(() => {
              image.classList.remove('fade-in');
  
              if(thumbImage) {
                thumbImage.remove();
              }
            });
          }, {once: true});
        }
      });
    });
  });
}

export function wrapSticker({doc, div, middleware, lazyLoadQueue, group, play, onlyThumb, emoji, width, height, withThumb, loop, loadPromises, needFadeIn}: {
  doc: MyDocument, 
  div: HTMLElement, 
  middleware?: () => boolean, 
  lazyLoadQueue?: LazyLoadQueue, 
  group?: string, 
  play?: boolean, 
  onlyThumb?: boolean,
  emoji?: string,
  width?: number,
  height?: number,
  withThumb?: boolean,
  loop?: boolean,
  loadPromises?: Promise<any>[],
  needFadeIn?: boolean,
}) {
  const stickerType = doc.sticker;

  if(!width) {
    width = !emoji ? 200 : undefined;
  }

  if(!height) {
    height = !emoji ? 200 : undefined;
  }

  if(stickerType === 2 && !LottieLoader.loaded) {
    //LottieLoader.loadLottie();
    LottieLoader.loadLottieWorkers();
  }
  
  if(!stickerType) {
    console.error('wrong doc for wrapSticker!', doc);
    throw new Error('wrong doc for wrapSticker!');
  }

  div.dataset.docId = doc.id;
  div.classList.add('media-sticker-wrapper');
  
  //console.log('wrap sticker', doc, div, onlyThumb);

  const cacheContext = appDownloadManager.getCacheContext(doc);

  const toneIndex = emoji ? getEmojiToneIndex(emoji) : -1;
  const downloaded = cacheContext.downloaded && !needFadeIn;
  
  let loadThumbPromise = deferredPromise<void>();
  let haveThumbCached = false;
  if((doc.thumbs?.length || doc.stickerCachedThumbs) && !div.firstElementChild && (!downloaded || stickerType === 2 || onlyThumb)/*  && doc.thumbs[0]._ !== 'photoSizeEmpty' */) {
    let thumb = doc.stickerCachedThumbs && doc.stickerCachedThumbs[toneIndex] || doc.thumbs[0];
    
    //console.log('wrap sticker', thumb, div);

    let thumbImage: HTMLImageElement;
    const afterRender = () => {
      if(!div.childElementCount) {
        thumbImage.classList.add('media-sticker', 'thumbnail');
        
        sequentialDom.mutateElement(div, () => {
          div.append(thumbImage);
          loadThumbPromise.resolve();
        });
      }
    };

    if('url' in thumb) {
      thumbImage = new Image();
      renderImageFromUrl(thumbImage, thumb.url, afterRender);
      haveThumbCached = true;
    } else if('bytes' in thumb) {
      if(thumb._ === 'photoPathSize') {
        if(thumb.bytes.length) {
          const d = appPhotosManager.getPathFromPhotoPathSize(thumb);
          div.innerHTML = `<svg class="rlottie-vector media-sticker thumbnail" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${doc.w || 512} ${doc.h || 512}" xml:space="preserve">
            <path d="${d}"/>
          </svg>`;
        } else {
          thumb = doc.thumbs.find(t => (t as PhotoSize.photoStrippedSize).bytes?.length) || thumb;
        }
      } 
      
      if(thumb && thumb._ !== 'photoPathSize' && toneIndex <= 0) {
        thumbImage = new Image();

        if((webpWorkerController.isWebpSupported() || doc.pFlags.stickerThumbConverted || cacheContext.url)/*  && false */) {
          renderImageFromUrl(thumbImage, appPhotosManager.getPreviewURLFromThumb(doc, thumb as PhotoSize.photoStrippedSize, true), afterRender);
          haveThumbCached = true;
        } else {
          webpWorkerController.convert(doc.id, (thumb as PhotoSize.photoStrippedSize).bytes as Uint8Array).then(bytes => {
            (thumb as PhotoSize.photoStrippedSize).bytes = bytes;
            doc.pFlags.stickerThumbConverted = true;
            
            if(middleware && !middleware()) return;
  
            if(!div.childElementCount) {
              renderImageFromUrl(thumbImage, appPhotosManager.getPreviewURLFromThumb(doc, thumb as PhotoSize.photoStrippedSize, true), afterRender);
            }
          }).catch(() => {});
        }
      }
    } else if(stickerType === 2 && (withThumb || onlyThumb) && toneIndex <= 0) {
      thumbImage = new Image();

      const load = () => {
        if(div.childElementCount || (middleware && !middleware())) return;

        const r = () => {
          if(div.childElementCount || (middleware && !middleware())) return;
          renderImageFromUrl(thumbImage, cacheContext.url, afterRender);
        };
  
        if(cacheContext.url) {
          r();
          return Promise.resolve();
        } else {
          return appDocsManager.getThumbURL(doc, thumb as PhotoSize.photoStrippedSize).promise.then(r);
        }
      };
      
      if(lazyLoadQueue && onlyThumb) {
        lazyLoadQueue.push({div, load});
        return Promise.resolve();
      } else {
        load();

        if((thumb as any).url) {
          haveThumbCached = true;
        }
      }
    }
  }

  if(loadPromises && haveThumbCached) {
    loadPromises.push(loadThumbPromise);
  }

  if(onlyThumb) { // for sticker panel
    return Promise.resolve();
  }
  
  const load = async() => {
    if(middleware && !middleware()) return;

    if(stickerType === 2) {
      /* if(doc.id === '1860749763008266301') {
        console.log('loaded sticker:', doc, div);
      } */

      //await new Promise((resolve) => setTimeout(resolve, 500));
      //return;

      //console.time('download sticker' + doc.id);

      //appDocsManager.downloadDocNew(doc.id).promise.then(res => res.json()).then(async(json) => {
      //fetch(doc.url).then(res => res.json()).then(async(json) => {
      /* return */ await appDocsManager.downloadDoc(doc, /* undefined,  */lazyLoadQueue?.queueId)
      .then(readBlobAsText)
      //.then(JSON.parse)
      .then(async(json) => {
        //console.timeEnd('download sticker' + doc.id);
        //console.log('loaded sticker:', doc, div/* , blob */);
        if(middleware && !middleware()) return;

        let animation = await LottieLoader.loadAnimationWorker({
          container: div,
          loop: loop && !emoji,
          autoplay: play,
          animationData: json,
          width,
          height
        }, group, toneIndex);

        //const deferred = deferredPromise<void>();
  
        animation.addEventListener('firstFrame', () => {
          const element = div.firstElementChild;
          needFadeIn = (needFadeIn || !element || element.tagName === 'svg') && rootScope.settings.animationsEnabled;

          const cb = () => {
            if(element && element !== animation.canvas) {
              element.remove();
            }
          };

          if(!needFadeIn) {
            if(element) {
              sequentialDom.mutate(cb);
            }
          } else {
            sequentialDom.mutate(() => {
              animation.canvas.classList.add('fade-in');
              if(element) {
                element.classList.add('fade-out');
              }
  
              animation.canvas.addEventListener('animationend', () => {
                sequentialDom.mutate(() => {
                  animation.canvas.classList.remove('fade-in');
                  cb();
                });
              }, {once: true});
            });
          }

          appDocsManager.saveLottiePreview(doc, animation.canvas, toneIndex);

          //deferred.resolve();
        }, {once: true});
  
        if(emoji) {
          attachClickEvent(div, (e) => {
            cancelEvent(e);
            let animation = LottieLoader.getAnimation(div);
  
            if(animation.paused) {
              animation.autoplay = true;
              animation.restart();
            }
          });
        }

        //return deferred;
        //await new Promise((resolve) => setTimeout(resolve, 5e3));
      });

      //console.timeEnd('render sticker' + doc.id);
    } else if(stickerType === 1) {
      const image = new Image();
      const thumbImage = div.firstElementChild !== image && div.firstElementChild;
      needFadeIn = (needFadeIn || !downloaded || thumbImage) && rootScope.settings.animationsEnabled;

      image.classList.add('media-sticker');

      if(needFadeIn) {
        image.classList.add('fade-in');
      }

      return new Promise<void>((resolve, reject) => {
        const r = () => {
          if(middleware && !middleware()) return resolve();
  
          renderImageFromUrl(image, cacheContext.url, () => {
            sequentialDom.mutateElement(div, () => {
              div.append(image);
              if(thumbImage) {
                thumbImage.classList.add('fade-out');
              }

              resolve();

              if(needFadeIn) {
                image.addEventListener('animationend', () => {
                  image.classList.remove('fade-in');
                  if(thumbImage) {
                    thumbImage.remove();
                  }
                }, {once: true});
              }
            });
          });
        };
  
        if(cacheContext.url) r();
        else {
          appDocsManager.downloadDoc(doc, /* undefined,  */lazyLoadQueue?.queueId).then(r, resolve);
        }
      });
    }
  };

  const loadPromise: Promise<any> = lazyLoadQueue && (!downloaded || stickerType === 2) ? 
    (lazyLoadQueue.push({div, load}), Promise.resolve()) : 
    load();

  if(downloaded && stickerType === 1) {
    loadThumbPromise = loadPromise;
    if(loadPromises) {
      loadPromises.push(loadThumbPromise);
    }
  }

  return loadPromise;
}

export async function wrapStickerSetThumb({set, lazyLoadQueue, container, group, autoplay, width, height}: {
  set: StickerSet.stickerSet,
  lazyLoadQueue: LazyLoadQueue,
  container: HTMLElement,
  group: string,
  autoplay: boolean,
  width: number,
  height: number
}) {
  if(set.thumbs?.length) {
    container.classList.add('media-sticker-wrapper');
    lazyLoadQueue.push({
      div: container,
      load: () => {
        const downloadOptions = appStickersManager.getStickerSetThumbDownloadOptions(set);
        const promise = appDownloadManager.download(downloadOptions);

        if(set.pFlags.animated) {
          return promise
          .then(readBlobAsText)
          //.then(JSON.parse)
          .then(json => {
            lottieLoader.loadAnimationWorker({
              container,
              loop: true,
              autoplay,
              animationData: json,
              width,
              height,
              needUpscale: true
            }, group);
          });
        } else {
          const image = new Image();
          image.classList.add('media-sticker');
  
          return promise.then(blob => {
            renderImageFromUrl(image, URL.createObjectURL(blob), () => {
              container.append(image);
            });
          });
        }
      }
    });

    return;
  }

  const promise = appStickersManager.getStickerSet(set);
  const stickerSet = await promise;
  if(stickerSet.documents[0]._ !== 'documentEmpty') { // as thumb will be used first sticker
    wrapSticker({
      doc: stickerSet.documents[0],
      div: container, 
      group: group,
      lazyLoadQueue
    }); // kostil
  }
}

export function wrapLocalSticker({emoji, width, height}: {
  doc?: MyDocument,
  url?: string,
  emoji?: string,
  width: number,
  height: number,
}) {
  const container = document.createElement('div');

  const doc = appStickersManager.getAnimatedEmojiSticker(emoji);
  if(doc) {
    wrapSticker({
      doc,
      div: container,
      loop: false,
      play: true,
      width,
      height,
      emoji
    }).then(() => {
      // this.animation = player;
    });
  } else {
    container.classList.add('media-sticker-wrapper');
  }

  return {container};
}

export function wrapReply(title: Parameters<ReplyContainer['fill']>[0], subtitle: Parameters<ReplyContainer['fill']>[1], message?: any) {
  const replyContainer = new ReplyContainer('reply');
  replyContainer.fill(title, subtitle, message);
  /////////console.log('wrapReply', title, subtitle, media);
  return replyContainer.container;
}

export function prepareAlbum(options: {
  container: HTMLElement,
  items: {w: number, h: number}[],
  maxWidth: number,
  minWidth: number,
  spacing: number,
  maxHeight?: number,
  forMedia?: true
}) {
  const layouter = new Layouter(options.items, options.maxWidth, options.minWidth, options.spacing, options.maxHeight);
  const layout = layouter.layout();

  const widthItem = layout.find(item => item.sides & RectPart.Right);
  const width = widthItem.geometry.width + widthItem.geometry.x;

  const heightItem = layout.find(item => item.sides & RectPart.Bottom);
  const height = heightItem.geometry.height + heightItem.geometry.y;

  const container = options.container;
  container.style.width = width + 'px';
  container.style.height = height + 'px';
  const children = container.children;

  layout.forEach(({geometry, sides}, idx) => {
    let div: HTMLElement;
    div = children[idx] as HTMLElement;
    if(!div) {
      div = document.createElement('div');
      container.append(div);
    }

    div.classList.add('album-item', 'grouped-item');

    div.style.width = (geometry.width / width * 100) + '%';
    div.style.height = (geometry.height / height * 100) + '%';
    div.style.top = (geometry.y / height * 100) + '%';
    div.style.left = (geometry.x / width * 100) + '%';

    if(sides & RectPart.Left && sides & RectPart.Top) {
      div.style.borderTopLeftRadius = 'inherit';
    }

    if(sides & RectPart.Left && sides & RectPart.Bottom) {
      div.style.borderBottomLeftRadius = 'inherit';
    }

    if(sides & RectPart.Right && sides & RectPart.Top) {
      div.style.borderTopRightRadius = 'inherit';
    }

    if(sides & RectPart.Right && sides & RectPart.Bottom) {
      div.style.borderBottomRightRadius = 'inherit';
    }

    if(options.forMedia) {
      const mediaDiv = document.createElement('div');
      mediaDiv.classList.add('album-item-media');
  
      div.append(mediaDiv);
    }

    // @ts-ignore
    //div.style.backgroundColor = '#' + Math.floor(Math.random() * (2 ** 24 - 1)).toString(16).padStart(6, '0');
  });

  /* if(options.forMedia) {
    layout.forEach((_, i) => {
      const mediaDiv = document.createElement('div');
      mediaDiv.classList.add('album-item-media');
  
      options.container.children[i].append(mediaDiv);
    });
  } */
}

export function wrapAlbum({groupId, attachmentDiv, middleware, uploading, lazyLoadQueue, isOut, chat, loadPromises, noAutoDownload}: {
  groupId: string, 
  attachmentDiv: HTMLElement,
  middleware?: () => boolean,
  lazyLoadQueue?: LazyLoadQueue,
  uploading?: boolean,
  isOut: boolean,
  chat: Chat,
  loadPromises?: Promise<any>[],
  noAutoDownload?: boolean,
}) {
  const items: {size: PhotoSize.photoSize, media: any, message: any}[] = [];

  // !lowest msgID will be the FIRST in album
  const storage = appMessagesManager.getMidsByAlbum(groupId);
  for(const mid of storage) {
    const m = chat.getMessage(mid);
    const media = m.media.photo || m.media.document;

    const size: any = media._ === 'photo' ? appPhotosManager.choosePhotoSize(media, 480, 480) : {w: media.w, h: media.h};
    items.push({size, media, message: m});
  }

  /* // * pending
  if(storage[0] < 0) {
    items.reverse();
  } */

  prepareAlbum({
    container: attachmentDiv,
    items: items.map(i => ({w: i.size.w, h: i.size.h})),
    maxWidth: mediaSizes.active.album.width,
    minWidth: 100,
    spacing: 2,
    forMedia: true
  });

  items.forEach((item, idx) => {
    const {size, media, message} = item;

    const div = attachmentDiv.children[idx] as HTMLElement;
    div.dataset.mid = '' + message.mid;
    const mediaDiv = div.firstElementChild as HTMLElement;
    if(media._ === 'photo') {
      wrapPhoto({
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
        noAutoDownload
      });
    } else {
      wrapVideo({
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
        noAutoDownload
      });
    }
  });
}

export function wrapGroupedDocuments({albumMustBeRenderedFull, message, bubble, messageDiv, chat, loadPromises, noAutoDownload, lazyLoadQueue}: {
  albumMustBeRenderedFull: boolean,
  message: any,
  messageDiv: HTMLElement,
  bubble: HTMLElement,
  uploading?: boolean,
  chat: Chat,
  loadPromises?: Promise<any>[],
  noAutoDownload?: boolean,
  lazyLoadQueue?: LazyLoadQueue
}) {
  let nameContainer: HTMLElement;
  const mids = albumMustBeRenderedFull ? chat.getMidsByMid(message.mid) : [message.mid];
  /* if(isPending) {
    mids.reverse();
  } */

  mids.forEach((mid, idx) => {
    const message = chat.getMessage(mid);
    const div = wrapDocument({
      message,
      loadPromises,
      noAutoDownload,
      lazyLoadQueue
    });

    const container = document.createElement('div');
    container.classList.add('document-container');
    container.dataset.mid = '' + mid;

    const wrapper = document.createElement('div');
    wrapper.classList.add('document-wrapper');
    
    if(message.message) {
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('document-message');

      const richText = RichTextProcessor.wrapRichText(message.message, {
        entities: message.totalEntities
      });

      messageDiv.innerHTML = richText;
      wrapper.append(messageDiv);
    }

    if(mids.length > 1) {
      const selection = document.createElement('div');
      selection.classList.add('document-selection');
      container.append(selection);
      
      container.classList.add('grouped-item');

      if(idx === 0) {
        nameContainer = wrapper;
      }
    }

    wrapper.append(div);
    container.append(wrapper);
    messageDiv.append(container);
  });

  if(mids.length > 1) {
    bubble.classList.add('is-multiple-documents', 'is-grouped');
  }

  return nameContainer;
}

export function wrapPoll(message: any) {
  const elem = new PollElement();
  elem.message = message;
  elem.setAttribute('peer-id', '' + message.peerId);
  elem.setAttribute('poll-id', message.media.poll.id);
  elem.setAttribute('message-id', '' + message.mid);
  elem.render();
  return elem;
}
