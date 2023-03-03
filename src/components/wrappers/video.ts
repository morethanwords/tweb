/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {IS_SAFARI} from '../../environment/userAgent';
import {animateSingle} from '../../helpers/animation';
import {ChatAutoDownloadSettings} from '../../helpers/autoDownload';
import deferredPromise from '../../helpers/cancellablePromise';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import createVideo from '../../helpers/dom/createVideo';
import isInDOM from '../../helpers/dom/isInDOM';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import getStrippedThumbIfNeeded from '../../helpers/getStrippedThumbIfNeeded';
import liteMode from '../../helpers/liteMode';
import makeError from '../../helpers/makeError';
import mediaSizes, {ScreenSize} from '../../helpers/mediaSizes';
import {Middleware} from '../../helpers/middleware';
import noop from '../../helpers/noop';
import onMediaLoad from '../../helpers/onMediaLoad';
import {fastRaf} from '../../helpers/schedulers';
import throttle from '../../helpers/schedulers/throttle';
import sequentialDom from '../../helpers/sequentialDom';
import toHHMMSS from '../../helpers/string/toHHMMSS';
import {Message, PhotoSize, VideoSize} from '../../layer';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import appImManager from '../../lib/appManagers/appImManager';
import {AppManagers} from '../../lib/appManagers/managers';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import rootScope from '../../lib/rootScope';
import {ThumbCache} from '../../lib/storages/thumbs';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import appMediaPlaybackController, {MediaSearchContext} from '../appMediaPlaybackController';
import AudioElement, {findMediaTargets} from '../audio';
import LazyLoadQueue from '../lazyLoadQueue';
import ProgressivePreloader from '../preloader';
import wrapPhoto from './photo';

const MAX_VIDEO_AUTOPLAY_SIZE = 50 * 1024 * 1024; // 50 MB

let roundVideoCircumference = 0;
mediaSizes.addEventListener('changeScreen', (from, to) => {
  if(to === ScreenSize.mobile || from === ScreenSize.mobile) {
    const elements = Array.from(document.querySelectorAll('.media-round .progress-ring')) as SVGSVGElement[];
    const width = mediaSizes.active.round.width;
    const halfSize = width / 2;
    const radius = halfSize - 7;
    roundVideoCircumference = 2 * Math.PI * radius;
    elements.forEach((element) => {
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

export default async function wrapVideo({doc, container, message, boxWidth, boxHeight, withTail, isOut, middleware, lazyLoadQueue, noInfo, group, onlyPreview, noPreview, withoutPreloader, loadPromises, noPlayButton, photoSize, videoSize, searchContext, autoDownload, managers = rootScope.managers, noAutoplayAttribute}: {
  doc: MyDocument,
  container?: HTMLElement,
  message?: Message.message,
  boxWidth?: number,
  boxHeight?: number,
  withTail?: boolean,
  isOut?: boolean,
  middleware?: Middleware,
  lazyLoadQueue?: LazyLoadQueue,
  noInfo?: boolean,
  noPlayButton?: boolean,
  group?: AnimationItemGroup,
  onlyPreview?: boolean,
  noPreview?: boolean,
  withoutPreloader?: boolean,
  loadPromises?: Promise<any>[],
  autoDownload?: ChatAutoDownloadSettings,
  photoSize?: PhotoSize,
  videoSize?: Extract<VideoSize, VideoSize.videoSize>,
  searchContext?: MediaSearchContext,
  managers?: AppManagers,
  noAutoplayAttribute?: boolean
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
    ) && (doc.type === 'gif' ? liteMode.isAvailable('gif') : liteMode.isAvailable('video'))
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

  const res: {
    thumb?: typeof photoRes,
    loadPromise: Promise<any>
  } = {} as any;

  if(doc.mime_type === 'image/gif') {
    const photoRes = await wrapPhoto({
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
      size: photoSize,
      managers
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

      const throttledTimeUpdate = throttle(() => {
        fastRaf(onTimeUpdate);
      }, 1000, false);

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
      // ! WARNING ! just to type-check
      (divRound as any as AudioElement).onLoad = onLoad;
      divRound.dataset.isOutgoing = '1';
    } else {
      onLoad();
    }
  } else if(!noAutoplayAttribute) {
    video.autoplay = true; // для safari
  }

  let photoRes: Awaited<ReturnType<typeof wrapPhoto>>;
  if(message) {
    photoRes = await wrapPhoto({
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
      size: photoSize,
      managers
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
  } else if(!noPreview) { // * gifs masonry
    const gotThumb = getStrippedThumbIfNeeded(doc, {} as ThumbCache, true);
    if(gotThumb) {
      const thumbImage = gotThumb.image;
      thumbImage.classList.add('media-poster');
      container.append(thumbImage);
      res.thumb = {
        loadPromises: {
          thumb: gotThumb.loadPromise,
          full: Promise.resolve()
        },
        images: {
          thumb: thumbImage,
          full: null
        },
        preloader: null,
        aspecter: null
      };

      loadPromises?.push(gotThumb.loadPromise);
      res.loadPromise = gotThumb.loadPromise;
    }
  }

  if(onlyPreview) {
    return res;
  }

  if(!video.parentElement && container) {
    (photoRes?.aspecter || container).append(video);
  }

  let cacheContext: ThumbCache;
  const getCacheContext = async() => {
    return cacheContext = await managers.thumbsStorage.getCacheContext(doc, videoSize?.type);
  };

  await getCacheContext();

  const uploadFileName = message?.uploadingFileName;
  if(uploadFileName) { // means upload
    preloader = new ProgressivePreloader({
      attachMethod: 'prepend',
      isUpload: true
    });
    preloader.attachPromise(appDownloadManager.getUpload(uploadFileName));
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
      console.error('Error ' + video.error.code + '; details: ' + video.error.message);
    }

    if(preloader && !uploadFileName) {
      preloader.detach();
    }

    if(!renderDeferred.isFulfilled) {
      renderDeferred.resolve();
    }
  }, {once: true});

  if(doc.type === 'video') {
    const onTimeUpdate = () => {
      if(!video.duration) {
        return;
      }

      spanTime.innerText = toHHMMSS(video.duration - video.currentTime, false);
    };

    const throttledTimeUpdate = throttle(() => {
      fastRaf(onTimeUpdate);
    }, 1e3, false);

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
  // video.play();
  if(!noAutoplayAttribute) {
    video.autoplay = true;
  }

  let loadPhotoThumbFunc = noAutoDownload && photoRes?.preloader?.loadFunc;
  const load = async() => {
    if(preloader && noAutoDownload && !withoutPreloader) {
      preloader.construct();
      preloader.setManual();
    }

    await getCacheContext();
    let loadPromise: Promise<any> = Promise.resolve();
    if((preloader && !uploadFileName) || withoutPreloader) {
      if(!cacheContext.downloaded && !doc.supportsStreaming) {
        const promise = loadPromise = appDownloadManager.downloadMediaURL({
          media: doc,
          queueId: lazyLoadQueue?.queueId,
          onlyCache: noAutoDownload,
          thumb: videoSize
        });

        if(preloader) {
          preloader.attach(container, false, promise);
        }
      } else if(doc.supportsStreaming) {
        if(noAutoDownload) {
          loadPromise = Promise.reject(makeError('NO_AUTO_DOWNLOAD'));
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

    loadPromise.then(async() => {
      if(middleware && !middleware()) {
        renderDeferred.resolve();
        return;
      }

      if(doc.type === 'round') {
        appMediaPlaybackController.resolveWaitingForLoadMedia(message.peerId, message.mid, message.pFlags.is_scheduled);
      }

      await getCacheContext();

      onMediaLoad(video).then(() => {
        if(group) {
          animationIntersector.addAnimation({
            animation: video,
            group
          });
        }

        if(preloader && !uploadFileName) {
          preloader.detach();
        }

        renderDeferred.resolve();
      }, (err) => {
        console.error('video load error', err);
        if(spanTime) {
          spanTime.classList.add('is-error');
        }
        renderDeferred.reject(err);
      });

      renderImageFromUrl(video, cacheContext.url);
    }, noop);

    return {download: loadPromise, render: Promise.all([loadPromise, renderDeferred])};
  };

  if(preloader && !uploadFileName) {
    preloader.setDownloadFunction(load);
  }

  (container as any).preloader = preloader;

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
    res.loadPromise = !lazyLoadQueue ?
      (await load()).render :
      (lazyLoadQueue.push({div: container, load: () => load().then(({render}) => render)}), Promise.resolve());
  }

  if(res.thumb) {
    await res.thumb.loadPromises.thumb;
  }

  return res;
}
