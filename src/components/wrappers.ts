import { getEmojiToneIndex } from '../emoji';
import { readBlobAsText } from '../helpers/blob';
import { deferredPromise } from '../helpers/cancellablePromise';
import { months } from '../helpers/date';
import mediaSizes from '../helpers/mediaSizes';
import { formatBytes } from '../helpers/number';
import { isAppleMobile, isSafari } from '../helpers/userAgent';
import { PhotoSize } from '../layer';
import appDocsManager, { MyDocument } from "../lib/appManagers/appDocsManager";
import { DownloadBlob } from '../lib/appManagers/appDownloadManager';
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
import Chat from './chat/chat';

const MAX_VIDEO_AUTOPLAY_SIZE = 50 * 1024 * 1024; // 50 MB

export function wrapVideo({doc, container, message, boxWidth, boxHeight, withTail, isOut, middleware, lazyLoadQueue, noInfo, group}: {
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
  group?: string
}) {
  const isAlbumItem = !(boxWidth && boxHeight);
  const canAutoplay = doc.type != 'video' || (doc.size <= MAX_VIDEO_AUTOPLAY_SIZE && !isAlbumItem);
  let spanTime: HTMLElement;

  if(!noInfo) {
    if(doc.type != 'round') {
      spanTime = document.createElement('span');
      spanTime.classList.add('video-time');
      container.append(spanTime);
  
      if(doc.type != 'gif') {
        spanTime.innerText = (doc.duration + '').toHHMMSS(false);
        
        if(canAutoplay) {
          spanTime.classList.add('tgico', 'can-autoplay');
        } else {
          const spanPlay = document.createElement('span');
          spanPlay.classList.add('video-play', 'tgico-largeplay', 'btn-circle', 'position-center');
          container.append(spanPlay);
        }
      } else {
        spanTime.innerText = 'GIF';
      }
    }
  }

  if(doc.mime_type == 'image/gif') {
    return wrapPhoto({
      photo: doc, 
      message, 
      container, 
      boxWidth, 
      boxHeight, 
      withTail, 
      isOut, 
      lazyLoadQueue, 
      middleware
    });
  }

  /* const video = doc.type == 'round' ? appMediaPlaybackController.addMedia(doc, message.mid) as HTMLVideoElement : document.createElement('video');
  if(video.parentElement) {
    video.remove();
  } */

  const video = document.createElement('video');
  video.muted = true;
  video.setAttribute('playsinline', 'true');
  if(doc.type == 'round') {
    //video.muted = true;
    const globalVideo = appMediaPlaybackController.addMedia(message.peerId, doc, message.mid);

    video.addEventListener('canplay', () => {
      if(globalVideo.currentTime > 0) {
        video.currentTime = globalVideo.currentTime;
      }
  
      if(!globalVideo.paused) {
        // с закоментированными настройками - хром выключал видео при скролле, для этого нужно было включить видео - выйти из диалога, зайти заново и проскроллить вверх
        /* video.autoplay = true;
        video.loop = false; */
        video.play();
      }
    }, {once: true});

    const clear = () => {
      //console.log('clearing video');

      globalVideo.removeEventListener('timeupdate', onTimeUpdate);
      globalVideo.removeEventListener('play', onGlobalPlay);
      globalVideo.removeEventListener('pause', onGlobalPause);
      video.removeEventListener('play', onVideoPlay);
      video.removeEventListener('pause', onVideoPause);
    };

    const onTimeUpdate = () => {
      if(!isInDOM(video)) {
        clear();
      }
    };

    const onGlobalPlay = () => {
      video.play();
    };

    const onGlobalPause = () => {
      video.pause();
    };

    const onVideoPlay = () => {
      globalVideo.play();
    };

    const onVideoPause = () => {
      //console.log('video pause event');
      if(isInDOM(video)) {
        globalVideo.pause();
      } else {
        clear();
      }
    };

    globalVideo.addEventListener('timeupdate', onTimeUpdate);
    globalVideo.addEventListener('play', onGlobalPlay);
    globalVideo.addEventListener('pause', onGlobalPause);
    video.addEventListener('play', onVideoPlay);
    video.addEventListener('pause', onVideoPause);
  } else {
    video.autoplay = true; // для safari
  }
  
  let img: HTMLImageElement;
  if(message) {
    if(!canAutoplay) {
      return wrapPhoto({
        photo: doc, 
        message, 
        container, 
        boxWidth, 
        boxHeight, 
        withTail, 
        isOut, 
        lazyLoadQueue, 
        middleware
      });
    }

    if(withTail) {
      img = wrapMediaWithTail(doc, message, container, boxWidth, boxHeight, isOut);
    } else {
      if(boxWidth && boxHeight) { // !album
        appPhotosManager.setAttachmentSize(doc, container, boxWidth, boxHeight, false, true);
      }

      if(doc.thumbs?.length && 'bytes' in doc.thumbs[0]) {
        appPhotosManager.setAttachmentPreview(doc.thumbs[0].bytes, container, false);
      }
  
      img = container.lastElementChild as HTMLImageElement;
      if(img?.tagName != 'IMG') {
        container.append(img = new Image());
      }
    }
  
    if(img) {
      img.classList.add('thumbnail');
    }

    if(withTail) {
      const foreignObject = img.parentElement;
      video.width = +foreignObject.getAttributeNS(null, 'width');
      video.height = +foreignObject.getAttributeNS(null, 'height');
      foreignObject.append(video);
    }
  }

  if(!img?.parentElement) {
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

    let preloader: ProgressivePreloader;
    if(message?.media?.preloader) { // means upload
      preloader = message.media.preloader as ProgressivePreloader;
      preloader.attach(container, undefined, undefined);
    } else if(!doc.downloaded && !doc.supportsStreaming) {
      const promise = appDocsManager.downloadDoc(doc, undefined, lazyLoadQueue?.queueId);
      preloader = new ProgressivePreloader(null, true, false, 'prepend');
      preloader.attach(container, true, promise);

      /* video.addEventListener('canplay', () => {
        if(preloader) {
          preloader.detach();
        }
      }, {once: true}); */

      await promise;

      if(middleware && !middleware()) {
        return;
      }
    } else if(doc.supportsStreaming) {
      preloader = new ProgressivePreloader(null, false, false, 'prepend');
      preloader.attach(container, false, null);
      video.addEventListener(isSafari ? 'timeupdate' : 'canplay', () => {
        preloader.detach();
      }, {once: true});
    }
    
    //console.log('loaded doc:', doc, doc.url, container);

    const deferred = deferredPromise<void>();

    //if(doc.type == 'gif'/*  || true */) {
      video.addEventListener(isAppleMobile ? 'loadeddata' : 'canplay', () => {
        if(img?.parentElement) {
          img.remove();
        }

        /* if(!video.paused) {
          video.pause();
        } */
        if(doc.type != 'round' && group) {
          animationIntersector.addAnimation(video, group);
        }

        // test lazyLoadQueue
        //setTimeout(() => {
          deferred.resolve();
        //}, 5000);
      }, {once: true});
    //}

    if(doc.type == 'video') {
      video.addEventListener('timeupdate', () => {
        spanTime.innerText = (video.duration - video.currentTime + '').toHHMMSS(false);
      });
    }

    video.addEventListener('error', (e) => {
      deferred.resolve();
      /* console.error('video error', e, video.src);
      if(video.src) { // if wasn't cleaned
        deferred.reject(e);
      } else {
        deferred.resolve();
      } */
    });

    //if(doc.type != 'round') {
      renderImageFromUrl(video, doc.url);
    //}

    /* if(!container.parentElement) {
      container.append(video);
    } */

    if(doc.type == 'round') {
      video.dataset.ckin = 'circle';
      video.dataset.overlay = '1';
      new VideoPlayer(video);
    } else {
      video.muted = true;
      video.loop = true;
      //video.play();
      video.autoplay = true;
    }

    return deferred;
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

  return /* doc.downloaded ||  */!lazyLoadQueue/*  && false */ ? loadVideo() : (lazyLoadQueue.push({div: container, load: loadVideo/* , wasSeen: true */}), Promise.resolve());
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

export function wrapDocument(peerId: number, doc: MyDocument, withTime = false, uploading = false, mid?: number, fontWeight = 500): HTMLElement {
  if(doc.type == 'audio' || doc.type == 'voice') {
    const audioElement = wrapAudio(peerId, doc, withTime, mid);
    audioElement.dataset.fontWeight = '' + fontWeight;
    return audioElement;
  }

  let extSplitted = doc.file_name ? doc.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ? extSplitted.pop().toLowerCase() : 'file';

  let docDiv = document.createElement('div');
  docDiv.classList.add('document', `ext-${ext}`);

  const icoDiv = document.createElement('div');
  icoDiv.classList.add('document-ico');

  if(doc.thumbs?.length || (uploading && doc.url && doc.type == 'photo')) {
    docDiv.classList.add('document-with-thumb');

    if(uploading) {
      icoDiv.innerHTML = `<img src="${doc.url}">`;
    } else {
      wrapPhoto({
        photo: doc, 
        message: null, 
        container: icoDiv, 
        boxWidth: 54, 
        boxHeight: 54
      });
      icoDiv.style.width = icoDiv.style.height = '';
    }

    const img = icoDiv.querySelector('img');
    if(img) img.classList.add('document-thumb');
  } else {
    icoDiv.innerText = ext;
  }

  //let fileName = stringMiddleOverflow(doc.file_name || 'Unknown.file', 26);
  let fileName = doc.file_name || 'Unknown.file';
  let size = formatBytes(doc.size);
  
  if(withTime) {
    size += ' · ' + formatDate(doc.date);
  }
  
  docDiv.innerHTML = `
  ${!uploading ? `<div class="document-download"><div class="tgico-download"></div></div>` : ''}
  <div class="document-name"><middle-ellipsis-element data-font-weight="${fontWeight}">${fileName}</middle-ellipsis-element></div>
  <div class="document-size">${size}</div>
  `;

  docDiv.prepend(icoDiv);

  if(!uploading) {
    let downloadDiv = docDiv.querySelector('.document-download') as HTMLDivElement;
    let preloader: ProgressivePreloader;
    let download: DownloadBlob;
    
    attachClickEvent(docDiv, (e) => {
      cancelEvent(e);
      if(!download) {
        if(downloadDiv.classList.contains('downloading')) {
          return; // means not ready yet
        }
        
        if(!preloader) {
          preloader = new ProgressivePreloader(null, true);
        }

        //preloader.attach(downloadDiv, true);
        download = appDocsManager.saveDocFile(doc, appImManager.chat.bubbles.lazyLoadQueue.queueId);
        preloader.attach(downloadDiv, true, download);
        
        download.then(() => {
          downloadDiv.remove();
        }).catch(err => {
          if(err.name === 'AbortError') {
            download = null;
          }
        }).finally(() => {
          downloadDiv.classList.remove('downloading');
        });
        
        downloadDiv.classList.add('downloading');
      } else {
        download.cancel();
      }
    });
  }
  
  return docDiv;
}

export function wrapAudio(peerId: number, doc: MyDocument, withTime = false, mid?: number): HTMLElement {
  let elem = new AudioElement();
  elem.setAttribute('peer-id', '' + peerId);
  elem.setAttribute('doc-id', doc.id);
  elem.setAttribute('with-time', '' + +withTime);
  elem.setAttribute('message-id', '' + mid);
  return elem;
}

function wrapMediaWithTail(photo: MyPhoto | MyDocument, message: {mid: number, message: string}, container: HTMLElement, boxWidth: number, boxHeight: number, isOut: boolean) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('bubble__media-container', isOut ? 'is-out' : 'is-in');
  
  const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", 'foreignObject');
  
  appPhotosManager.setAttachmentSize(photo, foreignObject, boxWidth, boxHeight/* , false, true */);
  
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

export function wrapPhoto({photo, message, container, boxWidth, boxHeight, withTail, isOut, lazyLoadQueue, middleware, size}: {
  photo: MyPhoto | MyDocument, 
  message: any, 
  container: HTMLElement, 
  boxWidth?: number, 
  boxHeight?: number, 
  withTail?: boolean, 
  isOut?: boolean, 
  lazyLoadQueue?: LazyLoadQueue, 
  middleware?: () => boolean, 
  size?: PhotoSize
}) {
  if(boxWidth === undefined) {
    boxWidth = mediaSizes.active.regular.width;
  }

  if(boxHeight === undefined) {
    boxHeight = mediaSizes.active.regular.height;
  }

  let image: HTMLImageElement;
  if(withTail) {
    image = wrapMediaWithTail(photo, message, container, boxWidth, boxHeight, isOut);
  } else {
    if(boxWidth && boxHeight) { // !album
      size = appPhotosManager.setAttachmentSize(photo, container, boxWidth, boxHeight, false, true);
    }

    if(photo._ == 'document' || !photo.downloaded) {
      const thumbs = (photo as MyPhoto).sizes || (photo as MyDocument).thumbs;
      if(thumbs?.length && 'bytes' in thumbs[0]) {
        appPhotosManager.setAttachmentPreview(thumbs[0].bytes, container, false);
      }
    }

    image = container.lastElementChild as HTMLImageElement;
    if(!image || image.tagName != 'IMG') {
      container.append(image = new Image());
    }
  }

  if(!((photo as MyPhoto).sizes || (photo as MyDocument).thumbs)) {
    return Promise.resolve();
  }

  //console.log('wrapPhoto downloaded:', photo, photo.downloaded, container);

  const cacheContext = appPhotosManager.getCacheContext(photo);

  let preloader: ProgressivePreloader;
  if(message?.media?.preloader) { // means upload
    message.media.preloader.attach(container);
  } else if(!cacheContext.downloaded) {
    preloader = new ProgressivePreloader(container, false, false, photo._ == 'document' ? 'prepend' : 'append');
  }

  const load = () => {
    const promise = photo._ == 'document' && photo.animated ? 
      appDocsManager.downloadDoc(photo, undefined, lazyLoadQueue?.queueId) : 
      appPhotosManager.preloadPhoto(photo, size, lazyLoadQueue?.queueId);

    if(preloader) {
      preloader.attach(container, true, promise);
    }

    return promise.then(() => {
      if(middleware && !middleware()) return;

      renderImageFromUrl(image || container, cacheContext.url || photo.url);
    });
  };

  return cacheContext.downloaded || !lazyLoadQueue ? load() : (lazyLoadQueue.push({div: container, load/* : load, wasSeen: true */}), Promise.resolve());
}

export function wrapSticker({doc, div, middleware, lazyLoadQueue, group, play, onlyThumb, emoji, width, height, withThumb, loop}: {
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
  loop?: boolean
}) {
  const stickerType = doc.sticker;

  if(!width) {
    width = !emoji ? 200 : undefined;
  }

  if(!height) {
    height = !emoji ? 200 : undefined;
  }

  if(stickerType == 2 && !LottieLoader.loaded) {
    //LottieLoader.loadLottie();
    LottieLoader.loadLottieWorkers();
  }
  
  if(!stickerType) {
    console.error('wrong doc for wrapSticker!', doc);
    throw new Error('wrong doc for wrapSticker!');
  }

  div.dataset.docId = doc.id;
  
  //console.log('wrap sticker', doc, div, onlyThumb);

  const toneIndex = emoji ? getEmojiToneIndex(emoji) : -1;
  
  if((doc.thumbs?.length || doc.stickerCachedThumbs) && !div.firstElementChild && (!doc.downloaded || stickerType == 2 || onlyThumb)/*  && doc.thumbs[0]._ != 'photoSizeEmpty' */) {
    let thumb = doc.stickerCachedThumbs && doc.stickerCachedThumbs[toneIndex] || doc.thumbs[0];
    
    //console.log('wrap sticker', thumb, div);

    let img: HTMLImageElement;
    const afterRender = () => {
      if(!div.childElementCount) {
        div.append(img);
      }
    };

    if('url' in thumb) {
      img = new Image();
      renderImageFromUrl(img, thumb.url, afterRender);
    } else if('bytes' in thumb) {
      if(thumb._ == 'photoPathSize') {
        if(thumb.bytes.length) {
          //if(!doc.w) console.error('no w', doc);
          const d = appPhotosManager.getPathFromPhotoPathSize(thumb);
          /* if(d == 'Mz' || d.includes('151,48,349,33z')) {
            console.error('no path', doc);
          } */
          div.innerHTML = `<svg class="rlottie-vector" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${doc.w || 512} ${doc.h || 512}" xml:space="preserve">
            <path d="${d}"/>
          </svg>`;
        } else {
          thumb = doc.thumbs.find(t => (t as PhotoSize.photoStrippedSize).bytes?.length) || thumb;
        }
      } 
      
      if(thumb && thumb._ != 'photoPathSize' && toneIndex <= 0) {
        img = new Image();
        if((webpWorkerController.isWebpSupported() || doc.pFlags.stickerThumbConverted || thumb.url)/*  && false */) {
          renderImageFromUrl(img, appPhotosManager.getPreviewURLFromThumb(thumb as PhotoSize.photoStrippedSize, true), afterRender);
        } else {
          webpWorkerController.convert(doc.id, (thumb as PhotoSize.photoStrippedSize).bytes as Uint8Array).then(bytes => {
            (thumb as PhotoSize.photoStrippedSize).bytes = bytes;
            doc.pFlags.stickerThumbConverted = true;
            
            if(middleware && !middleware()) return;
  
            if(!div.childElementCount) {
              renderImageFromUrl(img, appPhotosManager.getPreviewURLFromThumb(thumb as PhotoSize.photoStrippedSize, true), afterRender);
            }
          }).catch(() => {});
        }
      }
    } else if(stickerType == 2 && (withThumb || onlyThumb) && toneIndex <= 0) {
      img = new Image();

      const load = () => {
        if(div.childElementCount || (middleware && !middleware())) return;

        const r = () => {
          if(div.childElementCount || (middleware && !middleware())) return;
          renderImageFromUrl(img, (thumb as PhotoSize.photoStrippedSize).url, afterRender);
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
      }
    }
  }

  if(onlyThumb) { // for sticker panel
    return Promise.resolve();
  }
  
  let downloaded = doc.downloaded;
  let load = async() => {
    if(middleware && !middleware()) return;

    if(stickerType == 2) {
      /* if(doc.id == '1860749763008266301') {
        console.log('loaded sticker:', doc, div);
      } */

      //await new Promise((resolve) => setTimeout(resolve, 500));
      //return;

      //console.time('download sticker' + doc.id);

      //appDocsManager.downloadDocNew(doc.id).promise.then(res => res.json()).then(async(json) => {
      //fetch(doc.url).then(res => res.json()).then(async(json) => {
      /* return */ await appDocsManager.downloadDoc(doc, undefined, lazyLoadQueue?.queueId)
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
            if(element && element != animation.canvas) {
              element.remove();
            }
          };

          if(!needFadeIn) {
            cb();
          } else {
            animation.canvas.classList.add('fade-in');

            if(element) {
              setTimeout(() => {
                cb();
              }, element.tagName === 'svg' ? 50 : 200);
            }
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
    } else if(stickerType == 1) {
      let img = new Image();

      if(!downloaded && (!div.firstElementChild || div.firstElementChild.tagName != 'IMG')) {
        img.classList.add('fade-in-transition');
        img.style.opacity = '0';

        /* if(!div.firstElementChild) {
          div.append(img);
        } */

        img.addEventListener('load', () => {
          doc.downloaded = true;
          
          window.requestAnimationFrame(() => {
            img.style.opacity = '';
          });
        });
      }

      const r = () => {
        if(middleware && !middleware()) return;

        renderImageFromUrl(img, doc.url, () => {
          if(div.firstElementChild && div.firstElementChild != img) {
            div.firstElementChild.remove();
          }
  
          div.append(img);
        });
      };

      if(doc.url) r();
      else {
        appDocsManager.downloadDoc(doc, undefined, lazyLoadQueue?.queueId).then(r);
      }
    }
  }; 
  
  return lazyLoadQueue && (!doc.downloaded || stickerType == 2) ? (lazyLoadQueue.push({div, load/* , wasSeen: group == 'chat' && stickerType != 2 */}), Promise.resolve()) : load();
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

export function wrapAlbum({groupId, attachmentDiv, middleware, uploading, lazyLoadQueue, isOut, chat}: {
  groupId: string, 
  attachmentDiv: HTMLElement,
  middleware?: () => boolean,
  lazyLoadQueue?: LazyLoadQueue,
  uploading?: boolean,
  isOut: boolean,
  chat: Chat
}) {
  const items: {size: PhotoSize.photoSize, media: any, message: any}[] = [];

  // !lowest msgID will be the FIRST in album
  const storage = appMessagesManager.getMidsByAlbum(groupId);
  for(const mid of storage) {
    const m = chat.getMessage(mid);
    const media = m.media.photo || m.media.document;

    const size: any = media._ == 'photo' ? appPhotosManager.choosePhotoSize(media, 480, 480) : {w: media.w, h: media.h};
    items.push({size, media, message: m});
  }

  // * pending
  if(storage[0] < 0) {
    items.reverse();
  }

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
    if(media._ == 'photo') {
      wrapPhoto({
        photo: media,
        message,
        container: mediaDiv,
        boxWidth: 0,
        boxHeight: 0,
        isOut,
        lazyLoadQueue,
        middleware,
        size
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
        middleware
      });
    }
  });
}

export function wrapGroupedDocuments({albumMustBeRenderedFull, message, bubble, messageDiv, chat}: {
  albumMustBeRenderedFull: boolean,
  message: any,
  messageDiv: HTMLElement,
  bubble: HTMLElement,
  uploading?: boolean,
  chat: Chat
}) {
  let nameContainer: HTMLDivElement;
  const mids = albumMustBeRenderedFull ? chat.getMidsByMid(message.mid) : [message.mid];
  const isPending = message.mid < 0;
  if(isPending) {
    mids.reverse();
  }

  mids.forEach((mid, idx) => {
    const message = chat.getMessage(mid);
    const doc = message.media.document;
    const div = wrapDocument(chat.peerId, doc, false, isPending, mid);

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

    if(isPending) {
      if(doc.type == 'audio' || doc.type == 'voice') {
        (div as AudioElement).preloader = message.media.preloader;
      } else {
        const icoDiv = div.querySelector('.audio-download, .document-ico');
        message.media.preloader.attach(icoDiv, false);
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
  return elem;
}
