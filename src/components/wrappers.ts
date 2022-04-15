/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from './chat/chat';
import { getEmojiToneIndex } from '../vendor/emoji';
import deferredPromise from '../helpers/cancellablePromise';
import { formatFullSentTime } from '../helpers/date';
import mediaSizes, { MediaSizeType, ScreenSize } from '../helpers/mediaSizes';
import { IS_SAFARI } from '../environment/userAgent';
import { Message, MessageMedia, PhotoSize, StickerSet, WebPage } from '../layer';
import appDocsManager, { MyDocument } from "../lib/appManagers/appDocsManager";
import appMessagesManager from '../lib/appManagers/appMessagesManager';
import appPhotosManager, { MyPhoto } from '../lib/appManagers/appPhotosManager';
import LottieLoader from '../lib/rlottie/lottieLoader';
import webpWorkerController from '../lib/webp/webpWorkerController';
import animationIntersector from './animationIntersector';
import appMediaPlaybackController, { MediaSearchContext } from './appMediaPlaybackController';
import AudioElement, { findMediaTargets } from './audio';
import ReplyContainer from './chat/replyContainer';
import { Layouter, RectPart } from './groupedLayout';
import LazyLoadQueue from './lazyLoadQueue';
import PollElement from './poll';
import ProgressivePreloader from './preloader';
import './middleEllipsis';
import RichTextProcessor from '../lib/richtextprocessor';
import appImManager from '../lib/appManagers/appImManager';
import rootScope from '../lib/rootScope';
import { onMediaLoad } from '../helpers/files';
import { animateSingle } from '../helpers/animation';
import renderImageFromUrl from '../helpers/dom/renderImageFromUrl';
import sequentialDom from '../helpers/sequentialDom';
import { fastRaf } from '../helpers/schedulers';
import appDownloadManager, { DownloadBlob, ThumbCache } from '../lib/appManagers/appDownloadManager';
import appStickersManager from '../lib/appManagers/appStickersManager';
import cancelEvent from '../helpers/dom/cancelEvent';
import { attachClickEvent, simulateClickEvent } from '../helpers/dom/clickEvent';
import isInDOM from '../helpers/dom/isInDOM';
import lottieLoader from '../lib/rlottie/lottieLoader';
import { clearBadCharsAndTrim } from '../helpers/cleanSearchText';
import blur from '../helpers/blur';
import IS_WEBP_SUPPORTED from '../environment/webpSupport';
import MEDIA_MIME_TYPES_SUPPORTED from '../environment/mediaMimeTypesSupport';
import { MiddleEllipsisElement } from './middleEllipsis';
import { joinElementsWith } from '../lib/langPack';
import throttleWithRaf from '../helpers/schedulers/throttleWithRaf';
import { NULL_PEER_ID } from '../lib/mtproto/mtproto_config';
import findUpClassName from '../helpers/dom/findUpClassName';
import RLottiePlayer from '../lib/rlottie/rlottiePlayer';
import assumeType from '../helpers/assumeType';
import appMessagesIdsManager from '../lib/appManagers/appMessagesIdsManager';
import throttle from '../helpers/schedulers/throttle';
import { SendMessageEmojiInteractionData } from '../types';
import IS_VIBRATE_SUPPORTED from '../environment/vibrateSupport';
import Row from './row';
import { ChatAutoDownloadSettings } from '../helpers/autoDownload';
import formatBytes from '../helpers/formatBytes';
import toHHMMSS from '../helpers/string/toHHMMSS';
import createVideo from '../helpers/dom/createVideo';

const MAX_VIDEO_AUTOPLAY_SIZE = 50 * 1024 * 1024; // 50 MB

let roundVideoCircumference = 0;
mediaSizes.addEventListener('changeScreen', (from, to) => {
  if(to === ScreenSize.mobile || from === ScreenSize.mobile) {
    const elements = Array.from(document.querySelectorAll('.media-round .progress-ring')) as SVGSVGElement[];
    const width = mediaSizes.active.round.width;
    const halfSize = width / 2;
    const radius = halfSize - 7;
    roundVideoCircumference = 2 * Math.PI * radius;
    elements.forEach(element => {
      element.setAttributeNS(null, 'width', '' + width);
      element.setAttributeNS(null, 'height', '' + width);

      const circle = element.firstElementChild as SVGCircleElement;
      circle.setAttributeNS(null, 'cx', '' + halfSize);
      circle.setAttributeNS(null, 'cy', '' + halfSize);
      circle.setAttributeNS(null, 'r', '' + radius);

      circle.style.strokeDasharray = roundVideoCircumference + ' ' + roundVideoCircumference;
      circle.style.strokeDashoffset = '' + roundVideoCircumference;
    });
  }
});

export function wrapVideo({doc, container, message, boxWidth, boxHeight, withTail, isOut, middleware, lazyLoadQueue, noInfo, group, onlyPreview, withoutPreloader, loadPromises, noPlayButton, size, searchContext, autoDownload}: {
  doc: MyDocument, 
  container?: HTMLElement, 
  message?: Message.message, 
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
  autoDownload?: ChatAutoDownloadSettings,
  size?: PhotoSize,
  searchContext?: MediaSearchContext,
}) {
  const autoDownloadSize = autoDownload?.video;
  let noAutoDownload = autoDownloadSize === 0;
  const isAlbumItem = !(boxWidth && boxHeight);
  const canAutoplay = /* doc.sticker ||  */(
    (
      doc.type !== 'video' || (
        doc.size <= MAX_VIDEO_AUTOPLAY_SIZE && 
        !isAlbumItem
      )
    ) && (doc.type === 'gif' ? rootScope.settings.autoPlay.gifs : rootScope.settings.autoPlay.videos)
  );
  let spanTime: HTMLElement, spanPlay: HTMLElement;

  if(!noInfo) {
    spanTime = document.createElement('span');
    spanTime.classList.add('video-time');
    container.append(spanTime);
  
    let needPlayButton = false;
    if(doc.type !== 'gif') {
      spanTime.innerText = toHHMMSS(doc.duration, false);

      if(!noPlayButton && doc.type !== 'round') {
        if(canAutoplay && !noAutoDownload) {
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
      autoDownloadSize,
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

  let preloader: ProgressivePreloader; // it must be here, otherwise will get error before initialization in round onPlay

  const video = createVideo();
  video.classList.add('media-video');
  video.muted = true;
  if(doc.type === 'round') {
    const divRound = document.createElement('div');
    divRound.classList.add('media-round', 'z-depth-1');
    divRound.dataset.mid = '' + message.mid;
    divRound.dataset.peerId = '' + message.peerId;
    (divRound as any).message = message;

    const size = mediaSizes.active.round;
    const halfSize = size.width / 2;
    const strokeWidth = 3.5;
    const radius = halfSize - (strokeWidth * 2);
    divRound.innerHTML = `<svg class="progress-ring" width="${size.width}" height="${size.width}" style="transform: rotate(-90deg);">
      <circle class="progress-ring__circle" stroke="white" stroke-opacity="0.3" stroke-width="${strokeWidth}" cx="${halfSize}" cy="${halfSize}" r="${radius}" fill="transparent"/>
    </svg>`;

    const circle = divRound.firstElementChild.firstElementChild as SVGCircleElement;
    if(!roundVideoCircumference) {
      roundVideoCircumference = 2 * Math.PI * radius;
    }
    circle.style.strokeDasharray = roundVideoCircumference + ' ' + roundVideoCircumference;
    circle.style.strokeDashoffset = '' + roundVideoCircumference;
    
    spanTime.classList.add('tgico');

    const isUnread = message.pFlags.media_unread;
    if(isUnread) {
      divRound.classList.add('is-unread');
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = doc.w/*  * window.devicePixelRatio */;

    divRound.prepend(canvas, spanTime);
    divRound.append(video);
    container.append(divRound);

    const ctx = canvas.getContext('2d');
    /* ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
    ctx.clip(); */

    const onLoad = () => {
      const message: Message.message = (divRound as any).message;
      const globalVideo = appMediaPlaybackController.addMedia(message, !noAutoDownload) as HTMLVideoElement;
      const clear = () => {
        (appImManager.chat.setPeerPromise || Promise.resolve()).finally(() => {
          if(isInDOM(globalVideo)) {
            return;
          }
  
          globalVideo.removeEventListener('play', onPlay);
          globalVideo.removeEventListener('timeupdate', throttledTimeUpdate);
          globalVideo.removeEventListener('pause', onPaused);
          globalVideo.removeEventListener('ended', onEnded);
        });
      };
  
      const onFrame = () => {
        ctx.drawImage(globalVideo, 0, 0);
  
        const offset = roundVideoCircumference - globalVideo.currentTime / globalVideo.duration * roundVideoCircumference;
        circle.style.strokeDashoffset = '' + offset;
  
        return !globalVideo.paused;
      };

      const onTimeUpdate = () => {
        if(!globalVideo.duration) {
          return;
        }
  
        if(!isInDOM(globalVideo)) {
          clear();
          return;
        }

        if(globalVideo.paused) {
          onFrame();
        }
  
        spanTime.innerText = toHHMMSS(globalVideo.duration - globalVideo.currentTime, false);
      };

      const throttledTimeUpdate = throttleWithRaf(onTimeUpdate);
  
      const onPlay = () => {
        video.classList.add('hide');
        divRound.classList.remove('is-paused');
        animateSingle(onFrame, canvas);
  
        if(preloader && preloader.preloader && preloader.preloader.classList.contains('manual')) {
          preloader.onClick();
        }
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
        spanTime.innerText = toHHMMSS(globalVideo.duration, false);
  
        if(globalVideo.currentTime) {
          globalVideo.currentTime = 0;
        }
      };
  
      globalVideo.addEventListener('play', onPlay);
      globalVideo.addEventListener('timeupdate', throttledTimeUpdate);
      globalVideo.addEventListener('pause', onPaused);
      globalVideo.addEventListener('ended', onEnded);
  
      attachClickEvent(canvas, (e) => {
        cancelEvent(e);
  
        // ! костыль
        if(preloader && !preloader.detached) {
          preloader.onClick();
        }
        
        // ! can't use it here. on Safari iOS video won't start.
        /* if(globalVideo.readyState < 2) {
          return;
        } */
  
        if(globalVideo.paused) {
          const hadSearchContext = !!searchContext;
          if(appMediaPlaybackController.setSearchContext(searchContext || {
            peerId: NULL_PEER_ID, 
            inputFilter: {_: 'inputMessagesFilterEmpty'}, 
            useSearch: false
          })) {
            const [prev, next] = !hadSearchContext ? [] : findMediaTargets(divRound, message.mid/* , searchContext.useSearch */);
            appMediaPlaybackController.setTargets({peerId: message.peerId, mid: message.mid}, prev, next);
          }
          
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
    };

    if(message.pFlags.is_outgoing) {
      (divRound as any).onLoad = onLoad;
      divRound.dataset.isOutgoing = '1';
    } else {
      onLoad();
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
      autoDownloadSize: autoDownload?.photo,
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

  const isUpload = !!(message?.media as any)?.preloader;
  if(isUpload) { // means upload
    preloader = (message.media as any).preloader as ProgressivePreloader;
    preloader.attach(container, false);
    noAutoDownload = undefined;
  } else if(!cacheContext.downloaded && !doc.supportsStreaming && !withoutPreloader) {
    preloader = new ProgressivePreloader({
      attachMethod: 'prepend'
    });
  } else if(doc.supportsStreaming) {
    preloader = new ProgressivePreloader({
      cancelable: false,
      attachMethod: 'prepend'
    });
  }

  const renderDeferred = deferredPromise<void>();
  video.addEventListener('error', (e) => {
    if(video.error.code !== 4) {
      console.error("Error " + video.error.code + "; details: " + video.error.message);
    }
    
    if(preloader && !isUpload) {
      preloader.detach();
    }

    if(!renderDeferred.isFulfilled) {
      renderDeferred.resolve();
    }
  }, {once: true});

  onMediaLoad(video).then(() => {
    if(group) {
      animationIntersector.addAnimation(video, group);
    }

    if(preloader && !isUpload) {
      preloader.detach();
    }

    renderDeferred.resolve();
  });

  if(doc.type === 'video') {
    const onTimeUpdate = () => {
      if(!video.videoWidth) {
        return;
      }
      
      spanTime.innerText = toHHMMSS(video.duration - video.currentTime, false);
    };

    const throttledTimeUpdate = throttleWithRaf(onTimeUpdate);

    video.addEventListener('timeupdate', throttledTimeUpdate);

    if(spanPlay) {
      video.addEventListener('timeupdate', () => {
        sequentialDom.mutateElement(spanPlay, () => {
          spanPlay.remove();
        });
      }, {once: true});
    }
  }

  video.muted = true;
  video.loop = true;
  //video.play();
  video.autoplay = true;

  let loadPhotoThumbFunc = noAutoDownload && photoRes?.preloader?.loadFunc;
  const load = () => {
    if(preloader && noAutoDownload && !withoutPreloader) {
      preloader.construct();
      preloader.setManual();
    }

    let loadPromise: Promise<any> = Promise.resolve();
    if((preloader && !isUpload) || withoutPreloader) {
      if(!cacheContext.downloaded && !doc.supportsStreaming) {
        const promise = loadPromise = appDocsManager.downloadDoc(doc, lazyLoadQueue?.queueId, noAutoDownload);
        if(preloader) {
          preloader.attach(container, false, promise);
        }
      } else if(doc.supportsStreaming) {
        if(noAutoDownload) {
          loadPromise = Promise.reject();
        } else if(!cacheContext.downloaded && preloader) { // * check for uploading video
          preloader.attach(container, false, null);
          video.addEventListener(IS_SAFARI ? 'timeupdate' : 'canplay', () => {
            preloader.detach();
          }, {once: true});
        }
      }
    }

    if(!noAutoDownload && loadPhotoThumbFunc) {
      loadPhotoThumbFunc();
      loadPhotoThumbFunc = null;
    }

    noAutoDownload = undefined;

    loadPromise.then(() => {
      if(middleware && !middleware()) {
        renderDeferred.resolve();
        return;
      }

      if(doc.type === 'round') {
        appMediaPlaybackController.resolveWaitingForLoadMedia(message.peerId, message.mid, message.pFlags.is_scheduled);
      }

      renderImageFromUrl(video, cacheContext.url);
    }, () => {});

    return {download: loadPromise, render: renderDeferred};
  };

  if(preloader && !isUpload) {
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

rootScope.addEventListener('download_start', (docId) => {
  const elements = Array.from(document.querySelectorAll(`.document[data-doc-id="${docId}"]`)) as HTMLElement[];
  elements.forEach(element => {
    if(element.querySelector('.preloader-container.manual')) {
      simulateClickEvent(element);
    }
  });
});

export function wrapDocument({message, withTime, fontWeight, voiceAsMusic, showSender, searchContext, loadPromises, autoDownloadSize, lazyLoadQueue, sizeType}: {
  message: Message.message, 
  withTime?: boolean,
  fontWeight?: number,
  voiceAsMusic?: boolean,
  showSender?: boolean,
  searchContext?: MediaSearchContext,
  loadPromises?: Promise<any>[],
  autoDownloadSize?: number,
  lazyLoadQueue?: LazyLoadQueue,
  sizeType?: MediaSizeType
}): HTMLElement {
  if(!fontWeight) fontWeight = 500;
  if(!sizeType) sizeType = '' as any;
  const noAutoDownload = autoDownloadSize === 0;

  const doc = ((message.media as MessageMedia.messageMediaDocument).document || ((message.media as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage).document) as MyDocument;
  const uploading = message.pFlags.is_outgoing && (message.media as any)?.preloader;
  if(doc.type === 'audio' || doc.type === 'voice' || doc.type === 'round') {
    const audioElement = new AudioElement();
    audioElement.withTime = withTime;
    audioElement.message = message;
    audioElement.noAutoDownload = noAutoDownload;
    audioElement.lazyLoadQueue = lazyLoadQueue;
    audioElement.loadPromises = loadPromises;
    
    if(voiceAsMusic) audioElement.voiceAsMusic = voiceAsMusic;
    if(searchContext) audioElement.searchContext = searchContext;
    if(showSender) audioElement.showSender = showSender;
    if(uploading) audioElement.preloader = (message.media as any).preloader;

    audioElement.dataset.fontWeight = '' + fontWeight;
    audioElement.dataset.sizeType = sizeType;
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
  docDiv.dataset.docId = '' + doc.id;

  const icoDiv = document.createElement('div');
  icoDiv.classList.add('document-ico');

  const cacheContext = appDownloadManager.getCacheContext(doc);
  if((doc.thumbs?.length || (message.pFlags.is_outgoing && cacheContext.url && doc.type === 'photo'))/*  && doc.mime_type !== 'image/gif' */) {
    docDiv.classList.add('document-with-thumb');

    let imgs: HTMLImageElement[] = [];
    // ! WARNING, use thumbs for check when thumb will be generated for media
    if(message.pFlags.is_outgoing && ['photo', 'video'].includes(doc.type)) {
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
        lazyLoadQueue,
        size: appPhotosManager.choosePhotoSize(doc, 54, 54, true)
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
  const descriptionEl = document.createElement('div');
  descriptionEl.classList.add('document-description');
  const descriptionParts: (HTMLElement | string | DocumentFragment)[] = [formatBytes(doc.size)];
  
  if(withTime) {
    descriptionParts.push(formatFullSentTime(message.date));
  }

  if(showSender) {
    descriptionParts.push(appMessagesManager.wrapSenderToPeer(message));
  }

  docDiv.innerHTML = `
  ${(cacheContext.downloaded && !uploading) || !message.mid ? '' : `<div class="document-download"></div>`}
  <div class="document-name"></div>
  <div class="document-size"></div>
  `;

  const nameDiv = docDiv.querySelector('.document-name') as HTMLElement;
  const middleEllipsisEl = new MiddleEllipsisElement();
  middleEllipsisEl.dataset.fontWeight = '' + fontWeight;
  middleEllipsisEl.dataset.sizeType = sizeType;
  middleEllipsisEl.innerHTML = fileName;

  nameDiv.append(middleEllipsisEl);

  if(showSender) {
    nameDiv.append(appMessagesManager.wrapSentTime(message));
  }

  const sizeDiv = docDiv.querySelector('.document-size') as HTMLElement;
  sizeDiv.append(...joinElementsWith(descriptionParts, ' · '));

  docDiv.prepend(icoDiv);

  if(!uploading && message.pFlags.is_outgoing && !message.mid) {
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

  const load = (e?: Event) => {
    const save = !e || e.isTrusted;
    const doc = appDocsManager.getDoc(docDiv.dataset.docId);
    let download: DownloadBlob;
    const queueId = appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : undefined;
    if(!save) {
      download = appDocsManager.downloadDoc(doc, queueId);
    } else if(doc.type === 'pdf') {
      const canOpenAfter = appDocsManager.downloading.has(doc.id) || cacheContext.downloaded;
      download = appDocsManager.downloadDoc(doc, queueId);
      if(canOpenAfter) {
        download.then(() => {
          setTimeout(() => { // wait for preloader animation end
            const url = appDownloadManager.getCacheContext(doc).url;
            window.open(url);
          }, rootScope.settings.animationsEnabled ? 250 : 0);
        });
      }
    } else if(MEDIA_MIME_TYPES_SUPPORTED.has(doc.mime_type) && doc.thumbs?.length) {
      download = appDocsManager.downloadDoc(doc, queueId);
    } else {
      download = appDocsManager.saveDocFile(doc, queueId);
    }

    if(downloadDiv) {
      download.then(onLoad);
      preloader.attach(downloadDiv, true, download);
    }

    return {download};
  };

  if(appDocsManager.downloading.has(doc.id)) {
    downloadDiv = docDiv.querySelector('.document-download');
    preloader = new ProgressivePreloader();
    preloader.attach(downloadDiv, false, appDocsManager.downloading.get(doc.id));
  } else if(!cacheContext.downloaded || uploading) {
    downloadDiv = docDiv.querySelector('.document-download');
    preloader = (message.media as any).preloader as ProgressivePreloader;

    if(!preloader) {
      preloader = new ProgressivePreloader();

      preloader.construct();
      preloader.setManual();
      preloader.attach(downloadDiv);
      preloader.setDownloadFunction(load);

      if(autoDownloadSize !== undefined && autoDownloadSize >= doc.size) {
        simulateClickEvent(preloader.preloader);
      }
    } else {
      preloader.attach(downloadDiv);
      (message.media as any).promise.then(onLoad);
    }
  }

  attachClickEvent(docDiv, (e) => {
    if(preloader) {
      preloader.onClick(e);
    } else {
      load(e);
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

export function wrapPhoto({photo, message, container, boxWidth, boxHeight, withTail, isOut, lazyLoadQueue, middleware, size, withoutPreloader, loadPromises, autoDownloadSize, noBlur, noThumb, noFadeIn, blurAfter}: {
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

  let noAutoDownload = autoDownloadSize === 0;

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
  const isGif = photo._ === 'document' && photo.mime_type === 'image/gif' && !size;
  // if(withTail) {
  //   image = wrapMediaWithTail(photo, message, container, boxWidth, boxHeight, isOut);
  // } else {
    image = new Image();

    if(boxWidth && boxHeight && !size) { // !album
      const set = appPhotosManager.setAttachmentSize(photo, container, boxWidth, boxHeight, undefined, message, undefined, isGif ? {
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
            autoDownloadSize,
            noBlur,
            noThumb: true,
            blurAfter: true
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
      appDocsManager.downloadDoc(photo, /* undefined,  */lazyLoadQueue?.queueId) : 
      appPhotosManager.preloadPhoto(photo, size, lazyLoadQueue?.queueId, noAutoDownload);

    return promise;
  };

  const renderOnLoad = (url: string) => {
    return renderImageWithFadeIn(container, image, url, needFadeIn, aspecter, thumbImage);
  };

  const onLoad = (): Promise<void> => {
    if(middleware && !middleware()) return Promise.resolve();

    if(blurAfter) {
      return blur(cacheContext.url, 12).then(url => {
        return renderOnLoad(url);
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

// export function renderImageWithFadeIn(container: HTMLElement, 
//   image: HTMLImageElement, 
//   url: string, 
//   needFadeIn: boolean, 
//   aspecter = container,
//   thumbImage?: HTMLImageElement
// ) {
//   if(needFadeIn) {
//     // image.classList.add('fade-in-new', 'not-yet');
//     image.classList.add('fade-in');
//   }

//   return new Promise<void>((resolve) => {
//     /* if(photo._ === 'document') {
//       console.error('wrapPhoto: will render document', photo, size, cacheContext);
//       return resolve();
//     } */

//     renderImageFromUrl(image, url, () => {
//       sequentialDom.mutateElement(container, () => {
//         aspecter.append(image);
//         // (needFadeIn ? getHeavyAnimationPromise() : Promise.resolve()).then(() => {

//         // fastRaf(() => {
//           resolve();
//         // });

//         if(needFadeIn) {
//           fastRaf(() => {
//             /* if(!image.isConnected) {
//               alert('aaaa');
//             } */
//             // fastRaf(() => {
//               image.classList.remove('not-yet');
//             // });
//           });

//           image.addEventListener('transitionend', () => {
//             sequentialDom.mutate(() => {
//               image.classList.remove('fade-in-new');
  
//               if(thumbImage) {
//                 thumbImage.remove();
//               }
//             });
//           }, {once: true});
//         }
//       // });
//       });
//     });
//   });
// }

export function wrapStickerAnimation({
  size,
  doc,
  middleware,
  target,
  side,
  skipRatio,
  play
}: {
  size: number,
  doc: MyDocument,
  middleware?: () => boolean,
  target: HTMLElement,
  side: 'left' | 'center' | 'right',
  skipRatio?: number,
  play: boolean
}) {
  const animationDiv = document.createElement('div');
  animationDiv.classList.add('emoji-animation');

  // const size = 280;
  animationDiv.style.width = size + 'px';
  animationDiv.style.height = size + 'px';

  const stickerPromise = wrapSticker({
    div: animationDiv,
    doc,
    middleware,
    withThumb: false,
    needFadeIn: false,
    loop: false,
    width: size,
    height: size,
    play,
    group: 'none',
    skipRatio
  }).then(animation => {
    assumeType<RLottiePlayer>(animation);
    animation.addEventListener('enterFrame', (frameNo) => {
      if(frameNo === animation.maxFrame) {
        animation.remove();
        animationDiv.remove();
        appImManager.chat.bubbles.scrollable.container.removeEventListener('scroll', onScroll);
      }
    });

    if(IS_VIBRATE_SUPPORTED) {
      animation.addEventListener('firstFrame', () => {
        navigator.vibrate(100);
      }, {once: true});
    }

    return animation;
  });

  const generateRandomSigned = (max: number) => {
    const r = Math.random() * max * 2;
    return r > max ? -r % max : r;
  };

  const randomOffsetX = generateRandomSigned(16);
  const randomOffsetY = generateRandomSigned(4);
  const stableOffsetX = size / 8 * (side === 'right' ? 1 : -1);
  const setPosition = () => {
    if(!isInDOM(target)) {
      return;
    }
    
    const rect = target.getBoundingClientRect();
    /* const boxWidth = Math.max(rect.width, rect.height);
    const boxHeight = Math.max(rect.width, rect.height);
    const x = rect.left + ((boxWidth - size) / 2);
    const y = rect.top + ((boxHeight - size) / 2); */

    const rectX = side === 'right' ? rect.right : rect.left;

    const addOffsetX = side === 'center' ? (rect.width - size) / 2 : (side === 'right' ? -size : 0) + stableOffsetX + randomOffsetX;
    const x = rectX + addOffsetX;
    // const y = rect.bottom - size + size / 4;
    const y = rect.top + ((rect.height - size) / 2) + (side === 'center' ? 0 : randomOffsetY);
    // animationDiv.style.transform = `translate(${x}px, ${y}px)`;
    animationDiv.style.top = y + 'px';
    animationDiv.style.left = x + 'px';
  };

  const onScroll = throttleWithRaf(setPosition);

  appImManager.chat.bubbles.scrollable.container.addEventListener('scroll', onScroll);

  setPosition();

  appImManager.emojiAnimationContainer.append(animationDiv);

  return {animationDiv, stickerPromise};
}

export function wrapSticker({doc, div, middleware, lazyLoadQueue, group, play, onlyThumb, emoji, width, height, withThumb, loop, loadPromises, needFadeIn, needUpscale, skipRatio, static: asStatic}: {
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
  needUpscale?: boolean,
  skipRatio?: number,
  static?: boolean
}): Promise<RLottiePlayer | void> {
  const stickerType = doc.sticker;
  if(stickerType === 1) {
    asStatic = true;
  }

  if(!width) {
    width = !emoji ? 200 : undefined;
  }

  if(!height) {
    height = !emoji ? 200 : undefined;
  }

  if(stickerType === 2) {
    //LottieLoader.loadLottie();
    LottieLoader.loadLottieWorkers();
  }
  
  if(!stickerType) {
    console.error('wrong doc for wrapSticker!', doc);
    throw new Error('wrong doc for wrapSticker!');
  }

  div.dataset.docId = '' + doc.id;
  div.classList.add('media-sticker-wrapper');

  /* if(stickerType === 3) {
    const videoRes = wrapVideo({
      doc,
      boxWidth: width,
      boxHeight: height,
      container: div,
      group,
      lazyLoadQueue,
      middleware,
      withoutPreloader: true,
      loadPromises,
      noPlayButton: true,
      noInfo: true
    });

    if(videoRes.thumb) {
      if(videoRes.thumb.images.thumb) {
        videoRes.thumb.images.thumb.classList.add('media-sticker', 'thumbnail');
      }

      if(videoRes.thumb.images.full) {
        videoRes.thumb.images.full.classList.add('media-sticker');
      }
    }

    return videoRes.loadPromise;
  } */
  
  //console.log('wrap sticker', doc, div, onlyThumb);

  let cacheContext: ThumbCache;
  if(asStatic && stickerType !== 1) {
    const thumb = appPhotosManager.choosePhotoSize(doc, width, height, false) as PhotoSize.photoSize;
    cacheContext = appDownloadManager.getCacheContext(doc, thumb.type);
  } else {
    cacheContext = appDownloadManager.getCacheContext(doc);
  }

  const toneIndex = emoji ? getEmojiToneIndex(emoji) : -1;
  const downloaded = cacheContext.downloaded && !needFadeIn;

  const isAnimated = !asStatic && (stickerType === 2 || stickerType === 3);
  const isThumbNeededForType = isAnimated;
  
  let loadThumbPromise = deferredPromise<void>();
  let haveThumbCached = false;
  if((
      doc.thumbs?.length || 
      doc.stickerCachedThumbs
    ) && 
    !div.firstElementChild && (
      !downloaded || 
      isThumbNeededForType ||  
      onlyThumb
    ) && withThumb !== false/*  && doc.thumbs[0]._ !== 'photoSizeEmpty' */
  ) {
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

        if((IS_WEBP_SUPPORTED || doc.pFlags.stickerThumbConverted || cacheContext.url)/*  && false */) {
          renderImageFromUrl(thumbImage, appPhotosManager.getPreviewURLFromThumb(doc, thumb as PhotoSize.photoStrippedSize, true), afterRender);
          haveThumbCached = true;
        } else {
          webpWorkerController.convert('' + doc.id, (thumb as PhotoSize.photoStrippedSize).bytes as Uint8Array).then(bytes => {
            (thumb as PhotoSize.photoStrippedSize).bytes = bytes;
            doc.pFlags.stickerThumbConverted = true;
            
            if(middleware && !middleware()) return;
  
            if(!div.childElementCount) {
              renderImageFromUrl(thumbImage, appPhotosManager.getPreviewURLFromThumb(doc, thumb as PhotoSize.photoStrippedSize, true), afterRender);
            }
          }).catch(() => {});
        }
      }
    } else if(((stickerType === 2 && toneIndex <= 0) || stickerType === 3) && (withThumb || onlyThumb)) {
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

    if(stickerType === 2 && !asStatic) {
      /* if(doc.id === '1860749763008266301') {
        console.log('loaded sticker:', doc, div);
      } */

      //await new Promise((resolve) => setTimeout(resolve, 500));
      //return;

      //console.time('download sticker' + doc.id);

      //appDocsManager.downloadDocNew(doc.id).promise.then(res => res.json()).then(async(json) => {
      //fetch(doc.url).then(res => res.json()).then(async(json) => {
      return await appDocsManager.downloadDoc(doc, /* undefined,  */lazyLoadQueue?.queueId)
      .then(async(blob) => {
        //console.timeEnd('download sticker' + doc.id);
        //console.log('loaded sticker:', doc, div/* , blob */);
        if(middleware && !middleware()) {
          throw new Error('wrapSticker 2 middleware');
        }

        let animation = await LottieLoader.loadAnimationWorker({
          container: div,
          loop: loop && !emoji,
          autoplay: play,
          animationData: blob,
          width,
          height,
          name: 'doc' + doc.id,
          needUpscale,
          skipRatio,
          toneIndex
        }, group, middleware);

        //const deferred = deferredPromise<void>();
  
        animation.addEventListener('firstFrame', () => {
          const element = div.firstElementChild;
          if(needFadeIn !== false) {
            needFadeIn = (needFadeIn || !element || element.tagName === 'svg') && rootScope.settings.animationsEnabled;
          }

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

          if(withThumb !== false) {
            appDocsManager.saveLottiePreview(doc, animation.canvas, toneIndex);
          }

          //deferred.resolve();
        }, {once: true});
  
        if(emoji) {
          const data: SendMessageEmojiInteractionData = {
            a: [],
            v: 1
          };

          let sendInteractionThrottled: () => void;

          appStickersManager.preloadAnimatedEmojiStickerAnimation(emoji);

          attachClickEvent(div, async(e) => {
            cancelEvent(e);
            const animation = LottieLoader.getAnimation(div);
  
            if(animation.paused) {
              const doc = appStickersManager.getAnimatedEmojiSoundDocument(emoji);
              if(doc) {
                const audio = document.createElement('audio');
                audio.style.display = 'none';
                div.parentElement.append(audio);

                try {
                  await appDocsManager.downloadDoc(doc);

                  const cacheContext = appDownloadManager.getCacheContext(doc);
                  audio.src = cacheContext.url;
                  audio.play();
                  await onMediaLoad(audio, undefined, true);
                  
                  audio.addEventListener('ended', () => {
                    audio.src = '';
                    audio.remove();
                  }, {once: true});
                } catch(err) {
                  
                }
              }

              animation.autoplay = true;
              animation.restart();
            }

            const peerId = appImManager.chat.peerId;
            if(!peerId.isUser()) {
              return;
            }

            const doc = appStickersManager.getAnimatedEmojiSticker(emoji, true);
            if(!doc) {
              return;
            }
            
            const bubble = findUpClassName(div, 'bubble');
            const isOut = bubble.classList.contains('is-out');

            const {animationDiv} = wrapStickerAnimation({
              doc,
              middleware,
              side: isOut ? 'right' : 'left',
              size: 280,
              target: div,
              play: true
            });

            if(bubble) {
              if(isOut) {
                animationDiv.classList.add('is-out');
              } else {
                animationDiv.classList.add('is-in');
              }
            }

            if(!sendInteractionThrottled) {
              sendInteractionThrottled = throttle(() => {
                const length = data.a.length;
                if(!length) {
                  return;
                }
      
                const firstTime = data.a[0].t;
      
                data.a.forEach((a) => {
                  a.t = (a.t - firstTime) / 1000;
                });
      
                const bubble = findUpClassName(div, 'bubble');
                appMessagesManager.setTyping(appImManager.chat.peerId, {
                  _: 'sendMessageEmojiInteraction',
                  msg_id: appMessagesIdsManager.getServerMessageId(+bubble.dataset.mid),
                  emoticon: emoji,
                  interaction: {
                    _: 'dataJSON',
                    data: JSON.stringify(data)
                  }
                }, true);
      
                data.a.length = 0;
              }, 1000, false);
            }

            // using a trick here: simulated event from interlocutor's interaction won't fire ours
            if(e.isTrusted) {
              data.a.push({
                i: 1,
                t: Date.now()
              });
    
              sendInteractionThrottled();
            }
          });
        }

        return animation;

        //return deferred;
        //await new Promise((resolve) => setTimeout(resolve, 5e3));
      });

      //console.timeEnd('render sticker' + doc.id);
    } else if(asStatic || stickerType === 3) {
      let media: HTMLElement;
      if(asStatic) {
        media = new Image();
      } else {
        media = createVideo();
        (media as HTMLVideoElement).muted = true;

        if(play) {
          (media as HTMLVideoElement).autoplay = true;
          (media as HTMLVideoElement).loop = true;
        }
      }

      const thumbImage = div.firstElementChild !== media && div.firstElementChild;
      if(needFadeIn !== false) {
        needFadeIn = (needFadeIn || !downloaded || (asStatic ? thumbImage : (!thumbImage || thumbImage.tagName === 'svg'))) && rootScope.settings.animationsEnabled;
      }

      media.classList.add('media-sticker');

      if(needFadeIn) {
        media.classList.add('fade-in');
      }

      return new Promise<void>((resolve, reject) => {
        const r = () => {
          if(middleware && !middleware()) return resolve();
  
          const onLoad = () => {
            sequentialDom.mutateElement(div, () => {
              div.append(media);
              if(thumbImage) {
                thumbImage.classList.add('fade-out');
              }

              if(stickerType === 3 && !appDocsManager.isSavingLottiePreview(doc, toneIndex)) {
                // const perf = performance.now();
                assumeType<HTMLVideoElement>(media);
                const canvas = document.createElement('canvas');
                canvas.width = width * window.devicePixelRatio;
                canvas.height = height * window.devicePixelRatio;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
                appDocsManager.saveLottiePreview(doc, canvas, toneIndex);
                // console.log('perf', performance.now() - perf);
              }

              if(stickerType === 3 && group) {
                animationIntersector.addAnimation(media as HTMLVideoElement, group);
              }

              resolve();

              if(needFadeIn) {
                media.addEventListener('animationend', () => {
                  media.classList.remove('fade-in');
                  if(thumbImage) {
                    thumbImage.remove();
                  }
                }, {once: true});
              }
            });
          };

          if(asStatic) {
            renderImageFromUrl(media, cacheContext.url, onLoad);
          } else {
            (media as HTMLVideoElement).src = cacheContext.url;
            onMediaLoad(media as HTMLVideoElement).then(onLoad);
          }
        };

        if(cacheContext.url) r();
        else {
          let promise: Promise<any>;
          if(stickerType === 2 && asStatic) {
            const thumb = appPhotosManager.choosePhotoSize(doc, width, height, false) as PhotoSize.photoSize;
            promise = appDocsManager.getThumbURL(doc, thumb).promise
          } else {
            promise = appDocsManager.downloadDoc(doc, /* undefined,  */lazyLoadQueue?.queueId);
          }
            
          promise.then(r, resolve);
        }
      });
    }
  };

  const loadPromise: Promise<RLottiePlayer | void> = lazyLoadQueue && (!downloaded || isAnimated) ? 
    (lazyLoadQueue.push({div, load}), Promise.resolve()) : 
    load();

  if(downloaded && (asStatic/*  || stickerType === 3 */)) {
    loadThumbPromise = loadPromise as any;
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
              name: 'setThumb' + set.id
            }, group);
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
  
          return promise.then(blob => {
            renderImageFromUrl(media, URL.createObjectURL(blob), () => {
              container.append(media);
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

export function wrapStickerToRow({doc, row, size}: {
  doc: MyDocument,
  row: Row,
  size?: 'small' | 'large',
}) {
  const previousMedia = row.media;
  const media = row.createMedia('small');

  if(previousMedia) {
    media.classList.add('hide');
  }

  const loadPromises: Promise<any>[] = previousMedia ? [] : undefined;

  const _size = size === 'small' ? 32 : 48;
  const result = wrapSticker({
    div: media,
    doc: doc,
    width: _size,
    height: _size,
    loadPromises
  });

  loadPromises && Promise.all(loadPromises).then(() => {
    media.classList.remove('hide');
    previousMedia.remove();
  });

  return result;
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

export function wrapAlbum({groupId, attachmentDiv, middleware, uploading, lazyLoadQueue, isOut, chat, loadPromises, autoDownload}: {
  groupId: string, 
  attachmentDiv: HTMLElement,
  middleware?: () => boolean,
  lazyLoadQueue?: LazyLoadQueue,
  uploading?: boolean,
  isOut: boolean,
  chat: Chat,
  loadPromises?: Promise<any>[],
  autoDownload?: ChatAutoDownloadSettings,
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
    div.dataset.peerId = '' + message.peerId;
    const mediaDiv = div.firstElementChild as HTMLElement;
    const isPhoto = media._ === 'photo';
    if(isPhoto) {
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
        autoDownloadSize: autoDownload.photo
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
        autoDownload
      });
    }
  });
}

export function wrapGroupedDocuments({albumMustBeRenderedFull, message, bubble, messageDiv, chat, loadPromises, autoDownloadSize, lazyLoadQueue, searchContext, useSearch, sizeType}: {
  albumMustBeRenderedFull: boolean,
  message: any,
  messageDiv: HTMLElement,
  bubble: HTMLElement,
  uploading?: boolean,
  chat: Chat,
  loadPromises?: Promise<any>[],
  autoDownloadSize?: number,
  lazyLoadQueue?: LazyLoadQueue,
  searchContext?: MediaSearchContext,
  useSearch?: boolean,
  sizeType?: MediaSizeType
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
      autoDownloadSize,
      lazyLoadQueue,
      searchContext,
      sizeType
    });

    const container = document.createElement('div');
    container.classList.add('document-container');
    container.dataset.mid = '' + mid;
    container.dataset.peerId = '' + message.peerId;

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
