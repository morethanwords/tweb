import type Chat from './chat/chat';
import { getEmojiToneIndex } from '../emoji';
import { readBlobAsText } from '../helpers/blob';
import { deferredPromise } from '../helpers/cancellablePromise';
import { formatDateAccordingToToday, months } from '../helpers/date';
import mediaSizes from '../helpers/mediaSizes';
import { formatBytes } from '../helpers/number';
import { isAppleMobile, isSafari } from '../helpers/userAgent';
import { PhotoSize } from '../layer';
import appDocsManager, { MyDocument } from "../lib/appManagers/appDocsManager";
import appMessagesManager from '../lib/appManagers/appMessagesManager';
import appPhotosManager, { MyPhoto } from '../lib/appManagers/appPhotosManager';
import LottieLoader from '../lib/lottieLoader';
import VideoPlayer from '../lib/mediaPlayer';
import { attachClickEvent, cancelEvent, isInDOM } from "../helpers/dom";
import webpWorkerController from '../lib/webp/webpWorkerController';
import animationIntersector from './animationIntersector';
import appMediaPlaybackController from './appMediaPlaybackController';
import AudioElement from './audio';
import ReplyContainer from './chat/replyContainer';
import { Layouter, RectPart } from './groupedLayout';
import LazyLoadQueue from './lazyLoadQueue';
import { renderImageFromUrl } from './misc';
import PollElement from './poll';
import ProgressivePreloader from './preloader';
import './middleEllipsis';
import { nextRandomInt } from '../helpers/random';
import RichTextProcessor from '../lib/richtextprocessor';
import appImManager from '../lib/appManagers/appImManager';
import { SearchSuperContext } from './appSearchSuper.';
import rootScope from '../lib/rootScope';
import { onVideoLoad } from '../helpers/files';
import { animateSingle } from '../helpers/animation';

const MAX_VIDEO_AUTOPLAY_SIZE = 50 * 1024 * 1024; // 50 MB

export function wrapVideo({doc, container, message, boxWidth, boxHeight, withTail, isOut, middleware, lazyLoadQueue, noInfo, group, onlyPreview, withoutPreloader, loadPromises, noPlayButton}: {
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
  loadPromises?: Promise<any>[]
}) {
  const isAlbumItem = !(boxWidth && boxHeight);
  const canAutoplay = doc.type !== 'video' || (doc.size <= MAX_VIDEO_AUTOPLAY_SIZE && !isAlbumItem);
  let spanTime: HTMLElement;

  if(!noInfo) {
    spanTime = document.createElement('span');
    spanTime.classList.add('video-time');
    container.append(spanTime);
  
    if(doc.type !== 'gif') {
      spanTime.innerText = (doc.duration + '').toHHMMSS(false);

      if(!noPlayButton && doc.type !== 'round') {
        if(canAutoplay) {
          spanTime.classList.add('tgico', 'can-autoplay');
        } else {
          const spanPlay = document.createElement('span');
          spanPlay.classList.add('video-play', 'tgico-largeplay', 'btn-circle', 'position-center');
          container.append(spanPlay);
        }
      }
    } else {
      spanTime.innerText = 'GIF';
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
      loadPromises
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
    const globalVideo = appMediaPlaybackController.addMedia(message.peerId, doc, message.mid) as HTMLVideoElement;
 
    const divRound = document.createElement('div');
    divRound.classList.add('media-round', 'z-depth-1');

    divRound.innerHTML = `<svg class="progress-ring" width="200px" height="200px">
      <circle class="progress-ring__circle" stroke="white" stroke-opacity="0.3" stroke-width="3.5" cx="100" cy="100" r="93" fill="transparent" transform="rotate(-90, 100, 100)"/>
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

    globalVideo.addEventListener('play', onPlay);
    globalVideo.addEventListener('timeupdate', onTimeUpdate);
    globalVideo.addEventListener('pause', onPaused);

    attachClickEvent(canvas, (e) => {
      cancelEvent(e);

      if(globalVideo.paused) {
        globalVideo.play();
      } else {
        globalVideo.pause();
      }
    });

    if(globalVideo.paused) {
      if(globalVideo.duration && globalVideo.currentTime !== globalVideo.duration) {
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
      loadPromises
    });

    res.thumb = photoRes;

    if(!canAutoplay || onlyPreview) {
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
        video.poster = gotThumb.thumb.url;
      });
    }
  }

  if(!video.parentElement && container) {
    container.append(video);
  }

  const loadVideo = async() => {
    if(middleware && !middleware()) {
      return;
    }

    let loadPromise: Promise<any> = Promise.resolve();
    let preloader: ProgressivePreloader;
    if(message?.media?.preloader) { // means upload
      preloader = message.media.preloader as ProgressivePreloader;
      preloader.attach(container, false);
    } else if(!doc.downloaded && !doc.supportsStreaming) {
      const promise = loadPromise = appDocsManager.downloadDoc(doc, lazyLoadQueue?.queueId);
      preloader = new ProgressivePreloader({
        attachMethod: 'prepend'
      });
      preloader.attach(container, true, promise);

      //if(doc.type !== 'round') {
        await promise;

        if(middleware && !middleware()) {
          return;
        }
      //}
    } else if(doc.supportsStreaming) {
      preloader = new ProgressivePreloader({
        cancelable: false,
        attachMethod: 'prepend'
      });
      preloader.attach(container, false, null);
      video.addEventListener(isSafari ? 'timeupdate' : 'canplay', () => {
        preloader.detach();
      }, {once: true});
    }

    /* if(doc.type === 'round') {
      return;
    } */
    
    //console.log('loaded doc:', doc, doc.url, container);

    const deferred = deferredPromise<void>();

    //if(doc.type === 'gif'/*  || true */) {
      onVideoLoad(video).then(() => {
        /* if(!video.paused) {
          video.pause();
        } */
        if(group) {
          animationIntersector.addAnimation(video, group);
        }

        // test lazyLoadQueue
        //setTimeout(() => {
          deferred.resolve();
        //}, 5000);
      });
    //}

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
      
    renderImageFromUrl(video, doc.url);

    return Promise.all([loadPromise, deferred]);
  };

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

  res.loadPromise = !lazyLoadQueue ? loadVideo() : (lazyLoadQueue.push({div: container, load: loadVideo}), Promise.resolve());

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

export function wrapDocument({message, withTime, fontWeight, voiceAsMusic, showSender, searchContext, loadPromises}: {
  message: any, 
  withTime?: boolean,
  fontWeight?: number,
  voiceAsMusic?: boolean,
  showSender?: boolean,
  searchContext?: SearchSuperContext,
  loadPromises?: Promise<any>[]
}): HTMLElement {
  if(!fontWeight) fontWeight = 500;

  const doc = (message.media.document || message.media.webpage.document) as MyDocument;
  if(doc.type === 'audio' || doc.type === 'voice') {
    const audioElement = new AudioElement();
    audioElement.setAttribute('message-id', '' + message.mid);
    audioElement.setAttribute('peer-id', '' + message.peerId);
    audioElement.withTime = withTime;
    audioElement.message = message;
    
    if(voiceAsMusic) audioElement.voiceAsMusic = voiceAsMusic;
    if(searchContext) audioElement.searchContext = searchContext;
    if(showSender) audioElement.showSender = showSender;
    
    const isPending = message.pFlags.is_outgoing;
    if(isPending) {
      audioElement.preloader = message.media.preloader;
    }

    audioElement.dataset.fontWeight = '' + fontWeight;
    audioElement.render();
    return audioElement;
  }
  
  const uploading = message.pFlags.is_outgoing && message.media?.preloader;

  let extSplitted = doc.file_name ? doc.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ? extSplitted.pop().toLowerCase() : 'file';

  let docDiv = document.createElement('div');
  docDiv.classList.add('document', `ext-${ext}`);
  docDiv.dataset.docId = doc.id;

  const icoDiv = document.createElement('div');
  icoDiv.classList.add('document-ico');

  if(doc.thumbs?.length || (message.pFlags.is_outgoing && doc.url && doc.type === 'photo')) {
    docDiv.classList.add('document-with-thumb');

    let imgs: HTMLImageElement[] = [];
    if(message.pFlags.is_outgoing) {
      icoDiv.innerHTML = `<img src="${doc.url}">`;
      imgs.push(icoDiv.firstElementChild as HTMLImageElement);
    } else {
      const wrapped = wrapPhoto({
        photo: doc, 
        message: null, 
        container: icoDiv, 
        boxWidth: 54, 
        boxHeight: 54,
        loadPromises,
        withoutPreloader: true
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
  let fileName = doc.file_name || 'Unknown.file';
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
  ${doc.downloaded && !uploading ? '' : `<div class="document-download"></div>`}
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
    const download = appDocsManager.saveDocFile(doc, appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : 0);

    if(downloadDiv) {
      download.then(onLoad);
      preloader.attach(downloadDiv, true, download);
    }

    return {download};
  };

  if(!(doc.downloaded && !uploading)) {
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

function wrapMediaWithTail(photo: MyPhoto | MyDocument, message: {mid: number, message: string}, container: HTMLElement, boxWidth: number, boxHeight: number, isOut: boolean) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('bubble__media-container', isOut ? 'is-out' : 'is-in');
  
  const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", 'foreignObject');

  const gotThumb = appPhotosManager.getStrippedThumbIfNeeded(photo);
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
}

export function wrapPhoto({photo, message, container, boxWidth, boxHeight, withTail, isOut, lazyLoadQueue, middleware, size, withoutPreloader, loadPromises}: {
  photo: MyPhoto | MyDocument, 
  message: any, 
  container: HTMLElement, 
  boxWidth?: number, 
  boxHeight?: number, 
  withTail?: boolean, 
  isOut?: boolean, 
  lazyLoadQueue?: LazyLoadQueue, 
  middleware?: () => boolean, 
  size?: PhotoSize,
  withoutPreloader?: boolean,
  loadPromises?: Promise<any>[]
}) {
  if(!((photo as MyPhoto).sizes || (photo as MyDocument).thumbs)) {
    if(boxWidth && boxHeight && photo._ === 'document') {
      size = appPhotosManager.setAttachmentSize(photo, container, boxWidth, boxHeight);
    }

    return {
      loadPromises: {
        thumb: Promise.resolve(),
        full: Promise.resolve()
      },
      images: {
        thumb: null,
        full: null
      }
    };
  }

  if(boxWidth === undefined) boxWidth = mediaSizes.active.regular.width;
  if(boxHeight === undefined) boxHeight = mediaSizes.active.regular.height;

  let loadThumbPromise: Promise<any>;
  let thumbImage: HTMLImageElement;
  let image: HTMLImageElement;
  if(withTail) {
    image = wrapMediaWithTail(photo, message, container, boxWidth, boxHeight, isOut);
  } else {
    image = new Image();

    if(boxWidth && boxHeight) { // !album
      size = appPhotosManager.setAttachmentSize(photo, container, boxWidth, boxHeight);
    }

    const gotThumb = appPhotosManager.getStrippedThumbIfNeeded(photo);
    if(gotThumb) {
      loadThumbPromise = gotThumb.loadPromise;
      thumbImage = gotThumb.image;
      thumbImage.classList.add('media-photo');
      container.append(thumbImage);
    }
  }

  image.classList.add('media-photo');
  
  //console.log('wrapPhoto downloaded:', photo, photo.downloaded, container);
  
  const cacheContext = appPhotosManager.getCacheContext(photo);

  const needFadeIn = (thumbImage || !cacheContext.downloaded) && rootScope.settings.animationsEnabled;
  if(needFadeIn) {
    image.classList.add('fade-in');
  }

  let preloader: ProgressivePreloader;
  if(message?.media?.preloader) { // means upload
    preloader = message.media.preloader;
    preloader.attach(container);
  } else {
    preloader = new ProgressivePreloader({
      attachMethod: 'prepend'
    });
  }

  const getDownloadPromise = () => {
    const promise = photo._ === 'document' && photo.mime_type === 'image/gif' ? 
      appDocsManager.downloadDoc(photo, /* undefined,  */lazyLoadQueue?.queueId) : 
      appPhotosManager.preloadPhoto(photo, size, lazyLoadQueue?.queueId);

    return promise;
  };

  const onLoad = (): Promise<void> => {
    if(middleware && !middleware()) return Promise.resolve();

    return new Promise((resolve) => {
      renderImageFromUrl(image, cacheContext.url || photo.url, () => {
        container.append(image);

        window.requestAnimationFrame(() => {
          resolve();
        });
        //resolve();

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

  let loadPromise: Promise<any>;
  const load = () => {
    const promise = getDownloadPromise();

    if(!cacheContext.downloaded && !withoutPreloader && (size as PhotoSize.photoSize).w >= 150 && (size as PhotoSize.photoSize).h >= 150) {
      preloader.attach(container, false, promise);
    }

    return {download: promise, render: promise.then(onLoad)};
  };

  preloader.setDownloadFunction(load);
  
  if(cacheContext.downloaded) {
    loadThumbPromise = loadPromise = load().render;
  } else {
    if(!lazyLoadQueue) loadPromise = load().render;
    else lazyLoadQueue.push({div: container, load: () => load().download});
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
    }
  };
}

export function wrapSticker({doc, div, middleware, lazyLoadQueue, group, play, onlyThumb, emoji, width, height, withThumb, loop, loadPromises}: {
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
  loadPromises?: Promise<any>[]
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

  const toneIndex = emoji ? getEmojiToneIndex(emoji) : -1;
  
  let loadThumbPromise = deferredPromise<void>();
  let haveThumbCached = false;
  if((doc.thumbs?.length || doc.stickerCachedThumbs) && !div.firstElementChild && (!doc.downloaded || stickerType === 2 || onlyThumb)/*  && doc.thumbs[0]._ !== 'photoSizeEmpty' */) {
    let thumb = doc.stickerCachedThumbs && doc.stickerCachedThumbs[toneIndex] || doc.thumbs[0];
    
    //console.log('wrap sticker', thumb, div);

    let thumbImage: HTMLImageElement;
    const afterRender = () => {
      if(!div.childElementCount) {
        thumbImage.classList.add('media-sticker', 'thumbnail');
        div.append(thumbImage);
        loadThumbPromise.resolve();
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

        if((webpWorkerController.isWebpSupported() || doc.pFlags.stickerThumbConverted || thumb.url)/*  && false */) {
          renderImageFromUrl(thumbImage, appPhotosManager.getPreviewURLFromThumb(thumb as PhotoSize.photoStrippedSize, true), afterRender);
          haveThumbCached = true;
        } else {
          webpWorkerController.convert(doc.id, (thumb as PhotoSize.photoStrippedSize).bytes as Uint8Array).then(bytes => {
            (thumb as PhotoSize.photoStrippedSize).bytes = bytes;
            doc.pFlags.stickerThumbConverted = true;
            
            if(middleware && !middleware()) return;
  
            if(!div.childElementCount) {
              renderImageFromUrl(thumbImage, appPhotosManager.getPreviewURLFromThumb(thumb as PhotoSize.photoStrippedSize, true), afterRender);
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
          renderImageFromUrl(thumbImage, (thumb as PhotoSize.photoStrippedSize).url, afterRender);
        };
  
        if((thumb as PhotoSize.photoStrippedSize).url) {
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
  
  let downloaded = doc.downloaded;
  let load = async() => {
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
  
        animation.addListener('firstFrame', () => {
          const element = div.firstElementChild;
          const needFadeIn = !element || element.tagName === 'svg';

          const cb = () => {
            if(element && element !== animation.canvas) {
              element.remove();
            }
          };

          if(!needFadeIn) {
            cb();
          } else {
            animation.canvas.classList.add('fade-in');
            if(element) {
              element.classList.add('fade-out');
            }

            animation.canvas.addEventListener('animationend', () => {
              animation.canvas.classList.remove('fade-in');
              cb();
            }, {once: true});
          }

          appDocsManager.saveLottiePreview(doc, animation.canvas, toneIndex);

          //deferred.resolve();
        }, true);
  
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
      const thumbImage = div.firstElementChild && div.firstElementChild !== image ? div.firstElementChild : null;
      const needFadeIn = !downloaded || thumbImage;

      image.classList.add('media-sticker');

      if(needFadeIn) {
        image.classList.add('fade-in');
      }

      return new Promise<void>((resolve, reject) => {
        const r = () => {
          if(middleware && !middleware()) return resolve();
  
          renderImageFromUrl(image, doc.url, () => {
            div.append(image);
            if(thumbImage) {
              thumbImage.classList.add('fade-out');
            }
  
            window.requestAnimationFrame(() => {
              resolve();
            });
  
            if(needFadeIn) {
              image.addEventListener('animationend', () => {
                image.classList.remove('fade-in');
                if(thumbImage) {
                  thumbImage.remove();
                }
              }, {once: true});
            }
          });
        };
  
        if(doc.url) r();
        else {
          appDocsManager.downloadDoc(doc, /* undefined,  */lazyLoadQueue?.queueId).then(r, resolve);
        }
      });
    }
  };

  const loadPromise: Promise<any> = lazyLoadQueue && (!doc.downloaded || stickerType === 2) ? 
    (lazyLoadQueue.push({div, load}), Promise.resolve()) : 
    load();

  if(doc.downloaded && stickerType === 1) {
    loadThumbPromise = loadPromise;
    if(loadPromises) {
      loadPromises.push(loadThumbPromise);
    }
  }

  return loadPromise;
}

export function wrapReply(title: string, subtitle: string, message?: any) {
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

export function wrapAlbum({groupId, attachmentDiv, middleware, uploading, lazyLoadQueue, isOut, chat, loadPromises}: {
  groupId: string, 
  attachmentDiv: HTMLElement,
  middleware?: () => boolean,
  lazyLoadQueue?: LazyLoadQueue,
  uploading?: boolean,
  isOut: boolean,
  chat: Chat,
  loadPromises?: Promise<any>[]
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
        loadPromises
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
        loadPromises
      });
    }
  });
}

export function wrapGroupedDocuments({albumMustBeRenderedFull, message, bubble, messageDiv, chat, loadPromises}: {
  albumMustBeRenderedFull: boolean,
  message: any,
  messageDiv: HTMLElement,
  bubble: HTMLElement,
  uploading?: boolean,
  chat: Chat,
  loadPromises?: Promise<any>[]
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
      loadPromises
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
  //elem.render();
  return elem;
}
