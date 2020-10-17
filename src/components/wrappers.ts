import { readBlobAsText } from '../helpers/blob';
import { deferredPromise } from '../helpers/cancellablePromise';
import { months } from '../helpers/date';
import mediaSizes from '../helpers/mediaSizes';
import { isSafari } from '../helpers/userAgent';
import { PhotoSize } from '../layer';
import appDocsManager, { MyDocument } from "../lib/appManagers/appDocsManager";
import { DownloadBlob } from '../lib/appManagers/appDownloadManager';
import appMessagesManager from '../lib/appManagers/appMessagesManager';
import appPhotosManager, { MyPhoto } from '../lib/appManagers/appPhotosManager';
import LottieLoader from '../lib/lottieLoader';
import VideoPlayer from '../lib/mediaPlayer';
import { formatBytes, getEmojiToneIndex, isInDOM } from "../lib/utils";
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

export function wrapVideo({doc, container, message, boxWidth, boxHeight, withTail, isOut, middleware, lazyLoadQueue, noInfo, group}: {
  doc: MyDocument, 
  container?: HTMLDivElement, 
  message?: any, 
  boxWidth?: number, 
  boxHeight?: number, 
  withTail?: boolean, 
  isOut?: boolean,
  middleware?: () => boolean,
  lazyLoadQueue?: LazyLoadQueue,
  noInfo?: true,
  group?: string,
}) {
  if(!noInfo) {
    if(doc.type != 'round') {
      let span: HTMLSpanElement, spanPlay: HTMLSpanElement;
  
      span = document.createElement('span');
      span.classList.add('video-time');
      container.append(span);
  
      if(doc.type != 'gif') {
        span.innerText = (doc.duration + '').toHHMMSS(false);
  
        spanPlay = document.createElement('span');
        spanPlay.classList.add('video-play', 'tgico-largeplay', 'btn-circle', 'position-center');
        container.append(spanPlay);
      } else {
        span.innerText = 'GIF';
      }
    }
  }

  if(doc.mime_type == 'image/gif') {
    return wrapPhoto(doc, message, container, boxWidth, boxHeight, withTail, isOut, lazyLoadQueue, middleware);
  }

  /* const video = doc.type == 'round' ? appMediaPlaybackController.addMedia(doc, message.mid) as HTMLVideoElement : document.createElement('video');
  if(video.parentElement) {
    video.remove();
  } */

  const video = document.createElement('video');
  video.muted = true;
  video.setAttribute('playsinline', '');
  if(doc.type == 'round') {
    //video.muted = true;
    const globalVideo = appMediaPlaybackController.addMedia(doc, message.mid);

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
    if(doc.type == 'video' && doc.thumbs?.length) {
      return wrapPhoto(doc, message, container, boxWidth, boxHeight, withTail, isOut, lazyLoadQueue, middleware);
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
      const promise = appDocsManager.downloadDocNew(doc);
      preloader = new ProgressivePreloader(null, true, false, 'prepend');
      preloader.attach(container, true, promise);

      /* video.addEventListener('canplay', () => {
        if(preloader) {
          preloader.detach();
        }
      }, {once: true}); */

      await promise;
    } else if(doc.supportsStreaming) {
      preloader = new ProgressivePreloader(null, false, false, 'prepend');
      preloader.attach(container, false, null);
      video.addEventListener('canplay', () => {
        preloader.detach();
      }, {once: true});
    }

    if(middleware && !middleware()) {
      return;
    }

    //console.log('loaded doc:', doc, doc.url, container);

    const deferred = deferredPromise<void>();

    //if(doc.type == 'gif'/*  || true */) {
      video.addEventListener('canplay', () => {
        if(img?.parentElement) {
          img.remove();
        }

        /* if(!video.paused) {
          video.pause();
        } */
        if(doc.type == 'gif' && group) {
          animationIntersector.addAnimation(video, group);
        }

        // test lazyLoadQueue
        //setTimeout(() => {
          deferred.resolve();
        //}, 5000);
      }, {once: true});
    //}

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

    if(doc.type == 'gif'/*  || true */) {
      video.muted = true;
      video.loop = true;
      //video.play();
      video.autoplay = true;
    } else if(doc.type == 'round') {
      video.dataset.ckin = 'circle';
      video.dataset.overlay = '1';
      new VideoPlayer(video);
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

export function wrapDocument(doc: MyDocument, withTime = false, uploading = false, mid?: number): HTMLElement {
  if(doc.type == 'audio' || doc.type == 'voice') {
    return wrapAudio(doc, withTime, mid);
  }

  let extSplitted = doc.file_name ? doc.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ? extSplitted.pop().toLowerCase() : 'file';

  let docDiv = document.createElement('div');
  docDiv.classList.add('document', `ext-${ext}`);

  const icoDiv = document.createElement('div');
  icoDiv.classList.add('document-ico');

  if(doc.thumbs?.length || (uploading && doc.url)) {
    docDiv.classList.add('document-with-thumb');

    if(uploading) {
      icoDiv.innerHTML = `<img src="${doc.url}">`;
    } else {
      wrapPhoto(doc, null, icoDiv, 54, 54, false, null, null, null);
      icoDiv.style.width = icoDiv.style.height = '';
    }

    const img = icoDiv.querySelector('img');
    if(img) img.classList.add('document-thumb');
  } else {
    icoDiv.innerText = ext;
  }

  let fileName = doc.file_name || 'Unknown.file';
  let size = formatBytes(doc.size);
  
  if(withTime) {
    size += ' · ' + formatDate(doc.date);
  }
  
  docDiv.innerHTML = `
  ${!uploading ? `<div class="document-download"><div class="tgico-download"></div></div>` : ''}
  <div class="document-name">${fileName}</div>
  <div class="document-size">${size}</div>
  `;

  docDiv.prepend(icoDiv);

  if(!uploading) {
    let downloadDiv = docDiv.querySelector('.document-download') as HTMLDivElement;
    let preloader: ProgressivePreloader;
    let download: DownloadBlob;
    
    docDiv.addEventListener('click', () => {
      if(!download) {
        if(downloadDiv.classList.contains('downloading')) {
          return; // means not ready yet
        }
        
        if(!preloader) {
          preloader = new ProgressivePreloader(null, true);
        }

        download = appDocsManager.saveDocFile(doc);
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

export function wrapAudio(doc: MyDocument, withTime = false, mid?: number): HTMLElement {
  let elem = new AudioElement();
  elem.setAttribute('doc-id', doc.id);
  elem.setAttribute('with-time', '' + +withTime);
  elem.setAttribute('message-id', '' + mid);
  return elem;
}

function wrapMediaWithTail(photo: MyPhoto | MyDocument, message: {mid: number, message: string}, container: HTMLDivElement, boxWidth: number, boxHeight: number, isOut: boolean) {
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

  const clipID = 'clip' + message.mid;
  svg.dataset.clipID = clipID;
  
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

  defs.innerHTML = `<clipPath id="${clipID}">${clipPathHTML}</clipPath>`;
  
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

export function wrapPhoto(photo: MyPhoto | MyDocument, message: any, container: HTMLDivElement, boxWidth = mediaSizes.active.regular.width, boxHeight = mediaSizes.active.regular.height, withTail: boolean, isOut: boolean, lazyLoadQueue: LazyLoadQueue, middleware: () => boolean, size: PhotoSize = null) {
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

  //console.log('wrapPhoto downloaded:', photo, photo.downloaded, container);

  const cacheContext = appPhotosManager.getCacheContext(photo);

  let preloader: ProgressivePreloader;
  if(message?.media?.preloader) { // means upload
    message.media.preloader.attach(container);
  } else if(!cacheContext.downloaded) {
    preloader = new ProgressivePreloader(container, false, false, photo._ == 'document' ? 'prepend' : 'append');
  }

  const load = () => {
    const promise = photo._ == 'document' && photo.animated ? appDocsManager.downloadDocNew(photo) : appPhotosManager.preloadPhoto(photo, size);

    if(preloader) {
      preloader.attach(container, true, promise);
    }

    return promise.then(() => {
      if(middleware && !middleware()) return;

      renderImageFromUrl(image || container, cacheContext.url || photo.url);
    });
  };

  return cacheContext.downloaded || !lazyLoadQueue ? load() : (lazyLoadQueue.push({div: container, load: load, wasSeen: true}), Promise.resolve());
}

export function wrapSticker({doc, div, middleware, lazyLoadQueue, group, play, onlyThumb, emoji, width, height, withThumb, loop}: {
  doc: MyDocument, 
  div: HTMLDivElement, 
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

  div.dataset.docID = doc.id;
  
  //console.log('wrap sticker', doc, div, onlyThumb);

  const toneIndex = emoji ? getEmojiToneIndex(emoji) : -1;
  
  if(doc.thumbs?.length && !div.firstElementChild && (!doc.downloaded || stickerType == 2 || onlyThumb) && toneIndex <= 0/*  && doc.thumbs[0]._ != 'photoSizeEmpty' */) {
    const thumb = doc.thumbs[0];
    
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
      img = new Image();

      if((!isSafari || doc.pFlags.stickerThumbConverted || thumb.url)/*  && false */) {
        renderImageFromUrl(img, appPhotosManager.getPreviewURLFromThumb(thumb, true), afterRender);
      } else {
        webpWorkerController.convert(doc.id, thumb.bytes as Uint8Array).then(bytes => {
          thumb.bytes = bytes;
          doc.pFlags.stickerThumbConverted = true;
          
          if(middleware && !middleware()) return;

          if(!div.childElementCount) {
            renderImageFromUrl(img, appPhotosManager.getPreviewURLFromThumb(thumb, true), afterRender);
          }
        }).catch(() => {});
      }
    } else if(stickerType == 2 && (withThumb || onlyThumb)) {
      img = new Image();

      const load = () => {
        if(div.childElementCount || (middleware && !middleware())) return;

        const r = () => {
          if(div.childElementCount || (middleware && !middleware())) return;
          renderImageFromUrl(img, thumb.url, afterRender);
        };
  
        if(thumb.url) {
          r();
          return Promise.resolve();
        } else {
          return appDocsManager.getThumbURL(doc, thumb).promise.then(r);
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

      //console.time('download sticker' + doc.id);

      //appDocsManager.downloadDocNew(doc.id).promise.then(res => res.json()).then(async(json) => {
      //fetch(doc.url).then(res => res.json()).then(async(json) => {
      /* return */ await appDocsManager.downloadDocNew(doc)
      .then(readBlobAsText)
      //.then(JSON.parse)
      .then(async(json) => {
        //console.timeEnd('download sticker' + doc.id);
        //console.log('loaded sticker:', doc, div/* , blob */);
        if(middleware && !middleware()) return;

        let animation = await LottieLoader.loadAnimationWorker/* loadAnimation */({
          container: div,
          loop: loop && !emoji,
          autoplay: play,
          animationData: json,
          width,
          height
        }, group, toneIndex);

        //const deferred = deferredPromise<void>();
  
        animation.addListener('firstFrame', () => {
          if(div.firstElementChild && div.firstElementChild.tagName == 'IMG') {
            div.firstElementChild.remove();
          } else {
            animation.canvas.classList.add('fade-in');
          }

          //deferred.resolve();
        }, true);
  
        if(emoji) {
          div.addEventListener('click', () => {
            let animation = LottieLoader.getAnimation(div);
  
            if(animation.paused) {
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
        appDocsManager.downloadDocNew(doc).then(r);
      }
    }
  }; 
  
  return lazyLoadQueue && (!doc.downloaded || stickerType == 2) ? (lazyLoadQueue.push({div, load, wasSeen: group == 'chat' && stickerType != 2}), Promise.resolve()) : load();
}

export function wrapReply(title: string, subtitle: string, message?: any) {
  const replyContainer = new ReplyContainer('reply');
  replyContainer.fill(title, subtitle, message);
  /////////console.log('wrapReply', title, subtitle, media);
  return replyContainer.container;
}

export function wrapAlbum({groupID, attachmentDiv, middleware, uploading, lazyLoadQueue, isOut}: {
  groupID: string, 
  attachmentDiv: HTMLElement,
  middleware?: () => boolean,
  lazyLoadQueue?: LazyLoadQueue,
  uploading?: boolean,
  isOut: boolean
}) {
  const items: {size: PhotoSize.photoSize, media: any, message: any}[] = [];

  // !higher msgID will be the FIRST in album
  const storage = appMessagesManager.getMidsByAlbum(groupID);
  for(const mid of storage) {
    const m = appMessagesManager.getMessage(mid);
    const media = m.media.photo || m.media.document;

    const size: any = media._ == 'photo' ? appPhotosManager.choosePhotoSize(media, 480, 480) : {w: media.w, h: media.h};
    items.push({size, media, message: m});
  }

  const spacing = 2;
  const layouter = new Layouter(items.map(i => ({w: i.size.w, h: i.size.h})), mediaSizes.active.album.width, 100, spacing);
  const layout = layouter.layout();
  //console.log('layout:', layout, items.map(i => ({w: i.size.w, h: i.size.h})));

  /* let borderRadius = window.getComputedStyle(realParent).getPropertyValue('border-radius');
  let brSplitted = fillPropertyValue(borderRadius); */

  for(const {geometry, sides} of layout) {
    const item = items.shift();
    if(!item) {
      console.error('no item for layout!');
      continue;
    }

    const {size, media, message} = item;
    const div = document.createElement('div');
    div.classList.add('album-item');
    div.dataset.mid = message.mid;

    div.style.width = geometry.width + 'px';
    div.style.height = geometry.height + 'px';
    div.style.top = geometry.y + 'px';
    div.style.left = geometry.x + 'px';

    if(sides & RectPart.Right) {
      attachmentDiv.style.width = geometry.width + geometry.x + 'px';
    }

    if(sides & RectPart.Bottom) {
      attachmentDiv.style.height = geometry.height + geometry.y + 'px';
    }

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

    if(media._ == 'photo') {
      wrapPhoto(
        media,
        message,
        div,
        0,
        0,
        false,
        isOut,
        lazyLoadQueue,
        middleware,
        size
      );
    } else {
      wrapVideo({
        doc: message.media.document,
        container: div,
        message,
        boxWidth: 0,
        boxHeight: 0,
        withTail: false,
        isOut,
        lazyLoadQueue,
        middleware
      });
    }

    // @ts-ignore
    //div.style.backgroundColor = '#' + Math.floor(Math.random() * (2 ** 24 - 1)).toString(16).padStart(6, '0');

    attachmentDiv.append(div);
  }
}

export function wrapPoll(pollID: string, mid: number) {
  const elem = new PollElement();
  elem.setAttribute('poll-id', pollID);
  elem.setAttribute('message-id', '' + mid);
  return elem;
}
