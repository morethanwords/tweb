import appPhotosManager from '../lib/appManagers/appPhotosManager';
//import CryptoWorker from '../lib/crypto/cryptoworker';
import apiManager from '../lib/mtproto/mtprotoworker';
import LottieLoader from '../lib/lottieLoader';
import appDocsManager from "../lib/appManagers/appDocsManager";
import { formatBytes, getEmojiToneIndex } from "../lib/utils";
import ProgressivePreloader from './preloader';
import LazyLoadQueue from './lazyLoadQueue';
import VideoPlayer from '../lib/mediaPlayer';
import { RichTextProcessor } from '../lib/richtextprocessor';
import { CancellablePromise } from '../lib/polyfill';
import { renderImageFromUrl } from './misc';
import appMessagesManager from '../lib/appManagers/appMessagesManager';
import { Layouter, RectPart } from './groupedLayout';
import PollElement from './poll';
import appWebpManager from '../lib/appManagers/appWebpManager';
import { mediaSizes } from '../lib/config';
import { MTDocument, MTPhotoSize } from '../types';
import animationIntersector from './animationIntersector';
import AudioElement from './audio';

export function wrapVideo({doc, container, message, boxWidth, boxHeight, withTail, isOut, middleware, lazyLoadQueue}: {
  doc: MTDocument, 
  container: HTMLDivElement, 
  message: any, 
  boxWidth: number, 
  boxHeight: number, 
  withTail?: boolean, 
  isOut?: boolean,
  middleware: () => boolean,
  lazyLoadQueue: LazyLoadQueue
}) {
  let span: HTMLSpanElement, spanPlay: HTMLSpanElement;
  if(doc.type != 'round') {
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

  if(doc.type == 'video') {
    return wrapPhoto(doc, message, container, boxWidth, boxHeight, withTail, isOut, lazyLoadQueue, middleware);
  }

  let img: HTMLImageElement;
  if(withTail) {
    img = wrapMediaWithTail(doc, message, container, boxWidth, boxHeight, isOut);
  } else {
    if(!boxWidth && !boxHeight) { // album
      let sizes = doc.thumbs;
      if(!doc.downloaded && sizes && sizes[0].bytes) {
        appPhotosManager.setAttachmentPreview(sizes[0].bytes, container, false);
      }
    } else {
      if(!container.firstElementChild || (container.firstElementChild.tagName != 'IMG' && container.firstElementChild.tagName != 'VIDEO')) {
        appPhotosManager.setAttachmentSize(doc, container, boxWidth, boxHeight);
      }
    }

    img = container.lastElementChild as HTMLImageElement;
    if(!img || img.tagName != 'IMG') {
      container.append(img = new Image());
    }
  }

  if(img) {
    img.classList.add('thumbnail');
  }

  const video = document.createElement('video');
  const source = document.createElement('source');
  video.append(source);
  
  if(withTail) {
    const foreignObject = img.parentElement;
    video.width = +foreignObject.getAttributeNS(null, 'width');
    video.height = +foreignObject.getAttributeNS(null, 'height');
    foreignObject.append(video);
  } else {
    container.append(video);
  }

  const loadVideo = async() => {
    if(message.media.preloader) { // means upload
      (message.media.preloader as ProgressivePreloader).attach(container, undefined, undefined, false);
    } else if(!doc.downloaded) {
      const promise = appDocsManager.downloadDoc(doc.id);
      
      //if(!doc.supportsStreaming) {
        const preloader = new ProgressivePreloader(container, true);
        preloader.attach(container, true, promise, false);
      //}

      await promise;
    }

    if(middleware && !middleware()) {
      return;
    }

    //console.log('loaded doc:', doc, doc.url, container);

    if(doc.type == 'gif'/*  || true */) {
      video.addEventListener('canplay', () => {
        if(img && img.parentElement) {
          img.remove();
        }

        /* if(!video.paused) {
          video.pause();
        } */
        animationIntersector.addAnimation(video, 'chat');
      }, {once: true});
    }
    
    renderImageFromUrl(source, doc.url);
    source.type = doc.mime_type;
    video.append(source);
    video.setAttribute('playsinline', '');

    /* if(!container.parentElement) {
      container.append(video);
    } */
    
    if(doc.type == 'gif'/*  || true */) {
      video.muted = true;
      video.loop = true;
      //video.play();
      video.autoplay = true;
    } else if(doc.type == 'round') {
      //video.dataset.ckin = doc.type == 'round' ? 'circle' : 'default';
      video.dataset.ckin = 'circle';
      video.dataset.overlay = '1';
      let player = new VideoPlayer(video/* , doc.type != 'round' */);
    }
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
  
  //return;
  return doc.downloaded/*  && false */ ? loadVideo() : lazyLoadQueue.push({div: container, load: loadVideo/* , wasSeen: true */});
}

export const formatDate = (timestamp: number, monthShort = false, withYear = true) => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'Octomber', 'November', 'December'];
  const date = new Date(timestamp * 1000);
  
  let month = months[date.getMonth()];
  if(monthShort) month = month.slice(0, 3);

  let str = month + ' ' + date.getDate();
  if(withYear) {
    str += ', ' + date.getFullYear();
  }
  
  return str + ' at ' + date.getHours() + ':' + ('0' + date.getMinutes()).slice(-2);
};

export function wrapDocument(doc: MTDocument, withTime = false, uploading = false, mid?: number): HTMLElement {
  if(doc.type == 'audio' || doc.type == 'voice') {
    return wrapAudio(doc, withTime, mid);
  }

  let extSplitted = doc.file_name ? doc.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ? extSplitted.pop().toLowerCase() : 'file';

  let docDiv = document.createElement('div');
  docDiv.classList.add('document', `ext-${ext}`);
  
  let ext2 = ext;
  if(doc.type == 'photo') {
    docDiv.classList.add('photo');
    ext2 = `<img src="${URL.createObjectURL(doc.file)}">`;
  }
  
  let fileName = doc.file_name || 'Unknown.file';
  let size = formatBytes(doc.size);
  
  if(withTime) {
    size += ' · ' + formatDate(doc.date);
  }
  
  docDiv.innerHTML = `
  <div class="document-ico">${ext2}</div>
  ${!uploading ? `<div class="document-download"><div class="tgico-download"></div></div>` : ''}
  <div class="document-name">${fileName}</div>
  <div class="document-size">${size}</div>
  `;
  
  if(!uploading) {
    let downloadDiv = docDiv.querySelector('.document-download') as HTMLDivElement;
    let preloader: ProgressivePreloader;
    let promise: CancellablePromise<Blob>;
    
    docDiv.addEventListener('click', () => {
      if(!promise) {
        if(downloadDiv.classList.contains('downloading')) {
          return; // means not ready yet
        }
        
        if(!preloader) {
          preloader = new ProgressivePreloader(null, true);
        }
        
        appDocsManager.saveDocFile(doc.id).then(res => {
          promise = res.promise;
          
          preloader.attach(downloadDiv, true, promise);
          
          promise.then(() => {
            downloadDiv.classList.remove('downloading');
            downloadDiv.remove();
          });
        })
        
        downloadDiv.classList.add('downloading');
      } else {
        downloadDiv.classList.remove('downloading');
        promise = null;
      }
    });
  }
  
  return docDiv;
}

export function wrapAudio(doc: MTDocument, withTime = false, mid?: number): HTMLElement {
  let elem = new AudioElement();
  elem.setAttribute('doc-id', doc.id);
  elem.setAttribute('with-time', '' + +withTime);
  elem.setAttribute('message-id', '' + mid);
  return elem;
}

function wrapMediaWithTail(photo: any, message: {mid: number, message: string}, container: HTMLDivElement, boxWidth: number, boxHeight: number, isOut: boolean) {
  let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('bubble__media-container', isOut ? 'is-out' : 'is-in');
  
  let foreignObject = document.createElementNS("http://www.w3.org/2000/svg", 'foreignObject');
  
  appPhotosManager.setAttachmentSize(photo._ == 'document' ? photo : photo.id, foreignObject, boxWidth, boxHeight);
  
  let width = +foreignObject.getAttributeNS(null, 'width');
  let height = +foreignObject.getAttributeNS(null, 'height');

  svg.setAttributeNS(null, 'width', '' + width);
  svg.setAttributeNS(null, 'height', '' + height);

  svg.setAttributeNS(null, 'viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttributeNS(null, 'preserveAspectRatio', 'none');

  let clipID = 'clip' + message.mid;
  svg.dataset.clipID = clipID;
  
  let defs = document.createElementNS("http://www.w3.org/2000/svg", 'defs');
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

export function wrapPhoto(photoID: any, message: any, container: HTMLDivElement, boxWidth = mediaSizes.active.regular.width, boxHeight = mediaSizes.active.regular.height, withTail = true, isOut = false, lazyLoadQueue: LazyLoadQueue, middleware: () => boolean, size: MTPhotoSize = null) {
  let photo = appPhotosManager.getPhoto(photoID);

  let image: HTMLImageElement;
  if(withTail) {
    image = wrapMediaWithTail(photo, message, container, boxWidth, boxHeight, isOut);
  } else {
    if(size) { // album
      let sizes = photo.sizes;
      if(!photo.downloaded && sizes && sizes[0].bytes) {
        appPhotosManager.setAttachmentPreview(sizes[0].bytes, container, false);
      }
    } else if(boxWidth && boxHeight) { // means webpage's preview
      size = appPhotosManager.setAttachmentSize(photo, container, boxWidth, boxHeight, false);
    }

    image = container.lastElementChild as HTMLImageElement;
    if(!image || image.tagName != 'IMG') {
      container.append(image = new Image());
    }
  }

  //console.log('wrapPhoto downloaded:', photo, photo.downloaded, container);

  // так нельзя делать, потому что может быть загружен неправильный размер картинки
  /* if(photo.downloaded && photo.url) {
    renderImageFromUrl(image, photo.url);
    return;
  } */

  let preloader: ProgressivePreloader;
  if(message.media.preloader) { // means upload
    message.media.preloader.attach(container);
  } else if(!photo.downloaded) {
    preloader = new ProgressivePreloader(container, false);
  }

  let load = () => {
    let promise = appPhotosManager.preloadPhoto(photoID, size);
    
    if(preloader) {
      preloader.attach(container, true, promise);
    }
    
    return promise.then(() => {
      if(middleware && !middleware()) return;

      renderImageFromUrl(image || container, photo._ == 'photo' ? photo.url : appPhotosManager.getDocumentCachedThumb(photo.id).url);
    });
  };
  
  /////////console.log('wrapPhoto', load, container, image);
  
  return photo.downloaded ? load() : lazyLoadQueue.push({div: container, load: load, wasSeen: true});
}

export function wrapSticker({doc, div, middleware, lazyLoadQueue, group, play, onlyThumb, emoji, width, height, withThumb, loop}: {
  doc: MTDocument, 
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
  let stickerType = doc.sticker;

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
  
  if(doc.thumbs && !div.firstElementChild && (!doc.downloaded || stickerType == 2)) {
    let thumb = doc.thumbs[0];
    
    //console.log('wrap sticker', thumb, div);
    
    if(thumb.bytes) {
      let img = new Image();

      if((appWebpManager.isSupported() || doc.stickerThumbConverted)/*  && false */) {
        renderImageFromUrl(img, appPhotosManager.getPreviewURLFromThumb(thumb, true));

        div.append(img);
      } else {
        appWebpManager.convertToPng(thumb.bytes).then(bytes => {
          if(middleware && !middleware()) return;

          thumb.bytes = bytes;
          doc.stickerThumbConverted = true;

          if(!div.childElementCount) {
            renderImageFromUrl(img, appPhotosManager.getPreviewURLFromThumb(thumb, true)).then(() => {
              if(!div.childElementCount) {
                div.append(img);
              }
            });
          }
        });
      }
      
      if(onlyThumb) {
        return Promise.resolve();
      }
    } else if(!onlyThumb && stickerType == 2 && withThumb && toneIndex <= 0) {
      let img = new Image();
      let load = () => appDocsManager.downloadDocThumb(doc, thumb.type).then(url => {
        if(div.childElementCount || (middleware && !middleware())) return;
        let promise = renderImageFromUrl(img, url);

        if(!downloaded) {
          promise.then(() => {
            if(!div.childElementCount) {
              div.append(img);
            }
          });
        }
      });
      
      let downloaded = appDocsManager.hasDownloadedThumb(doc.id, thumb.type);
      if(downloaded) {
        div.append(img);
      }

      lazyLoadQueue && !downloaded ? lazyLoadQueue.push({div, load, wasSeen: group == 'chat'}) : load();
    }
  }

  if(onlyThumb && doc.thumbs) { // for sticker panel
    let thumb = doc.thumbs[0];
    
    let load = () => appDocsManager.downloadDocThumb(doc, thumb.type).then(url => {
      let img = new Image();
      renderImageFromUrl(img, url).then(() => {
        if(middleware && !middleware()) return;
        div.append(img);
      });
    });
    
    return lazyLoadQueue ? (lazyLoadQueue.push({div, load}), Promise.resolve()) : load();
  }
  
  let downloaded = doc.downloaded;
  let load = () => appDocsManager.downloadDoc(doc.id).then(blob => {
    //console.log('loaded sticker:', doc, div);
    if(middleware && !middleware()) return;

    //return;
    
    if(stickerType == 2) {
      const reader = new FileReader();
      
      reader.addEventListener('loadend', async(e) => {
        //console.time('decompress sticker' + doc.id);
        //console.time('render sticker' + doc.id);
        // @ts-ignore
        const text = e.srcElement.result;
        let json = await apiManager.gzipUncompress<string>(text, true);

        //console.timeEnd('decompress sticker' + doc.id);

        /* if(doc.id == '1860749763008266301') {
          console.log('loaded sticker:', doc, div);
        } */

        let animation = await LottieLoader.loadAnimationWorker/* loadAnimation */({
          container: div,
          loop: loop && !emoji,
          autoplay: play,
          animationData: JSON.parse(json),
          width,
          height
        }, group, toneIndex);

        animation.addListener('firstFrame', () => {
          if(div.firstElementChild && div.firstElementChild.tagName == 'IMG') {
            div.firstElementChild.remove();
          } else {
            animation.canvas.classList.add('fade-in');
          }
        }, true);

        if(emoji) {
          div.addEventListener('click', () => {
            let animation = LottieLoader.getAnimation(div);

            if(animation.paused) {
              animation.restart();
            }
          });
        }

        //console.timeEnd('render sticker' + doc.id);
      });
      
      reader.readAsArrayBuffer(blob);
    } else if(stickerType == 1) {
      let img = new Image();

      if(!downloaded && (!div.firstElementChild || div.firstElementChild.tagName != 'IMG')) {
        img.classList.add('fade-in-transition');
        img.style.opacity = '0';

        img.addEventListener('load', () => {
          window.requestAnimationFrame(() => {
            img.style.opacity = '';
          });
        });
      }

      renderImageFromUrl(img, doc.url).then(() => {
        if(div.firstElementChild && div.firstElementChild != img) {
          div.firstElementChild.remove();
        }

        div.append(img);
      });
    }
  });
  
  return lazyLoadQueue && (!doc.downloaded || stickerType == 2) ? (lazyLoadQueue.push({div, load, wasSeen: group == 'chat' && stickerType != 2}), Promise.resolve()) : load();
}

export function wrapReply(title: string, subtitle: string, message?: any, isPinned?: boolean) {
  const prefix = isPinned ? 'pinned-message' : 'reply';
  const div = document.createElement('div');
  div.classList.add(prefix);
  
  const replyBorder = document.createElement('div');
  replyBorder.classList.add(prefix + '-border');
  
  const replyContent = document.createElement('div');
  replyContent.classList.add(prefix + '-content');
  
  const replyTitle = document.createElement('div');
  replyTitle.classList.add(prefix + '-title');
  
  const replySubtitle = document.createElement('div');
  replySubtitle.classList.add(prefix + '-subtitle');
  
  replyTitle.innerHTML = title ? RichTextProcessor.wrapEmojiText(title) : '';
  
  const media = message && message.media;
  if(media) {
    replySubtitle.innerHTML = message.rReply;

    //console.log('wrap reply', media);
    
    if(media.photo || (media.document && ['video'].indexOf(media.document.type) !== -1)) {
      let replyMedia = document.createElement('div');
      replyMedia.classList.add(prefix + '-media');
      
      let photo = media.photo || media.document;
      
      let sizes = photo.sizes || photo.thumbs;
      if(sizes && sizes[0].bytes) {
        appPhotosManager.setAttachmentPreview(sizes[0].bytes, replyMedia, false, true);
      }
      
      appPhotosManager.preloadPhoto(photo, appPhotosManager.choosePhotoSize(photo, 32, 32))
      .then(() => {
        renderImageFromUrl(replyMedia, photo._ == 'photo' ? photo.url : appPhotosManager.getDocumentCachedThumb(photo.id).url);
      });
      
      replyContent.append(replyMedia);
      div.classList.add('is-media');
    }
  } else {
    replySubtitle.innerHTML = subtitle ? RichTextProcessor.wrapEmojiText(subtitle) : '';
  }
  
  replyContent.append(replyTitle, replySubtitle);
  div.append(replyBorder, replyContent);
  
  /////////console.log('wrapReply', title, subtitle, media);
  
  return div;
}

export function wrapAlbum({groupID, attachmentDiv, middleware, uploading, lazyLoadQueue, isOut}: {
  groupID: string, 
  attachmentDiv: HTMLElement,
  middleware?: () => boolean,
  lazyLoadQueue?: LazyLoadQueue,
  uploading?: boolean,
  isOut: boolean
}) {
  let items: {size: MTPhotoSize, media: any, message: any}[] = [];

  // higher msgID will be the last in album
  let storage = appMessagesManager.groupedMessagesStorage[groupID];
  for(let mid in storage) {
    let m = appMessagesManager.getMessage(+mid);
    let media = m.media.photo || m.media.document;

    let size: any = media._ == 'photo' ? appPhotosManager.choosePhotoSize(media, 480, 480) : {w: media.w, h: media.h};
    items.push({size, media, message: m});
  }

  let spacing = 2;
  let layouter = new Layouter(items.map(i => ({w: i.size.w, h: i.size.h})), mediaSizes.active.album.width, 100, spacing);
  let layout = layouter.layout();
  //console.log('layout:', layout, items.map(i => ({w: i.size.w, h: i.size.h})));

  /* let borderRadius = window.getComputedStyle(realParent).getPropertyValue('border-radius');
  let brSplitted = fillPropertyValue(borderRadius); */

  for(let {geometry, sides} of layout) {
    let item = items.shift();
    if(!item) {
      console.error('no item for layout!');
      continue;
    }

    let {size, media, message} = item;
    let div = document.createElement('div');
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
        media.id,
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
