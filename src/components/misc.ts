import { MTProto } from "../lib/mtproto/mtproto";
import { formatBytes, whichChild, isElementInViewport, isInDOM, findUpTag } from "../lib/utils";
import appPhotosManager from '../lib/appManagers/appPhotosManager';
import CryptoWorker from '../lib/crypto/cryptoworker';
import LottieLoader from '../lib/lottieLoader';
import appStickersManager from "../lib/appManagers/appStickersManager";
import appDocsManager from "../lib/appManagers/appDocsManager";
import {AppImManager} from "../lib/appManagers/appImManager";
import {AppMediaViewer} from '../lib/appManagers/appMediaViewer';

export type MTDocument = {
  _: 'document',
  pFlags: any,
  flags: number,
  id: string,
  access_hash: string,
  file_reference: Uint8Array | number[],
  date: number,
  mime_type: string,
  size: number,
  thumbs: MTPhotoSize[],
  dc_id: number,
  attributes: any[],
  
  type?: string,
  h?: number,
  w?: number
};

export type MTPhotoSize = {
  _: string,
  w?: number,
  h?: number,
  size?: number,
  type?: string, // i, m, x, y, w by asc
  location?: any,
  bytes?: Uint8Array, // if type == 'i'
  
  preloaded?: boolean // custom added
};

let onRippleClick = function(this: HTMLElement, e: MouseEvent) {
  var $circle = this.firstElementChild as HTMLSpanElement;//this.querySelector('.c-ripple__circle') as HTMLSpanElement;
  
  var rect = this.parentElement.getBoundingClientRect();
  var x = e.clientX - rect.left; //x position within the element.
  var y = e.clientY - rect.top;
  
  /* var x = e.pageX - this.parentElement.offsetLeft;
  var y = e.pageY - this.parentElement.offsetTop - this.parentElement.scrollHeight; */
  
  $circle.style.top = y + 'px';
  $circle.style.left = x + 'px';
  
  this.classList.add('active');
  
  //console.log('onrippleclick', e/* e.pageY, this.parentElement.offsetTop */);
};

export function ripple(elem: Element) {
  /* elem.addEventListener('click', function(e) {
    var $circle = elem.querySelector('.c-ripple__circle') as HTMLSpanElement;
    
    var x = e.pageX - elem.offsetLeft;
    var y = e.pageY - elem.offsetTop;
    
    $circle.style.top = y + 'px';
    $circle.style.left = x + 'px';
    
    elem.classList.add('active');
  }); */
  
  let r = document.createElement('div');
  r.classList.add('c-ripple');
  
  let span = document.createElement('span');
  span.classList.add('c-ripple__circle');
  
  r.append(span);
  elem.append(r);
  
  r.addEventListener('click', onRippleClick);
  
  let onEnd = () => {
    r.classList.remove('active');
  };
  
  for(let type of ['animationend', 'webkitAnimationEnd', 'oanimationend', 'MSAnimationEnd']) {
    r.addEventListener(type, onEnd);
  }
}

export function putPreloader(elem: Element) {
  const html = `
  <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
  <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
  </svg>`;
  
  elem.innerHTML += html;
}

export class ProgressivePreloader {
  private preloader: HTMLDivElement = null;
  private circle: SVGCircleElement = null;
  private progress = 0;
  constructor(elem?: Element, private cancelable = true) {
    this.preloader = document.createElement('div');
    this.preloader.classList.add('preloader-container');
    
    this.preloader.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
    <circle class="preloader-path-new" cx="50" cy="50" r="23" fill="none" stroke-miterlimit="10"/>
    </svg>`;
    
    if(cancelable) {
      this.preloader.innerHTML += `
      <svg xmlns="http://www.w3.org/2000/svg" class="preloader-close" viewBox="0 0 20 20">
      <line x1="0" y1="20" x2="20" y2="0" stroke-width="2" stroke-linecap="round"></line>
      <line x1="0" y1="0" x2="20" y2="20" stroke-width="2" stroke-linecap="round"></line>
      </svg>`;
    } else {
      this.preloader.classList.add('preloader-swing');
    }
    
    this.circle = this.preloader.firstElementChild.firstElementChild as SVGCircleElement;
    
    if(elem) {
      this.attach(elem);
    }
  }
  
  public attach(elem: Element) {
    if(this.cancelable) {
      this.setProgress(0);
    }
    
    elem.append(this.preloader);
    /* let isIn = isInDOM(this.preloader);
    
    if(isIn && this.progress != this.defaultProgress) {
      this.setProgress(this.defaultProgress);
    }
    
    elem.append(this.preloader);
    
    if(!isIn && this.progress != this.defaultProgress) {
      this.setProgress(this.defaultProgress);
    } */
  }
  
  public detach() {
    if(this.preloader.parentElement) {
      this.preloader.parentElement.removeChild(this.preloader);
    }
  }
  
  public setProgress(percents: number) {
    this.progress = percents;
    
    if(!isInDOM(this.circle)) {
      return;
    }
    
    if(percents == 0) {
      this.circle.style.strokeDasharray = '';
      return;
    }
    
    let totalLength = this.circle.getTotalLength();
    console.log('setProgress', (percents / 100 * totalLength));
    this.circle.style.strokeDasharray = '' + (percents / 100 * totalLength);
  }
}

export class LazyLoadQueue {
  private lazyLoadMedia: Array<{div: HTMLDivElement, load: () => Promise<void>}> = [];
  
  public check(id?: number) {
    /* let length = this.lazyLoadMedia.length;
    for(let i = length - 1; i >= 0; --i) {
      let {div, load} = this.lazyLoadMedia[i];
      
      if(isElementInViewport(div)) {
        console.log('will load div:', div);
        load();
        this.lazyLoadMedia.splice(i, 1);
      }
    } */
    if(id !== undefined) {
      let {div, load} = this.lazyLoadMedia[id];
      if(isElementInViewport(div)) {
        //console.log('will load div by id:', div, div.getBoundingClientRect());
        load();
        this.lazyLoadMedia.splice(id, 1);
      }
      
      return;
    }
    
    this.lazyLoadMedia = this.lazyLoadMedia.filter(({div, load}) => {
      if(isElementInViewport(div)) {
        //console.log('will load div:', div, div.getBoundingClientRect());
        load();
        return false;
      }
      
      return true;
    });
  }
  
  public push(el: {div: HTMLDivElement, load: () => Promise<void>}) {
    let id = this.lazyLoadMedia.push(el) - 1;
    
    this.check(id);
  }
}

export function wrapVideo(this: any, doc: MTDocument, container: HTMLDivElement, message: any, justLoader = true, preloader?: ProgressivePreloader) {
  //if(!container.firstElementChild || container.firstElementChild.tagName != 'IMG') {
    let size = appPhotosManager.setAttachmentSize(doc, container);
  //}

  let peerID = this.peerID ? this.peerID : this.currentMessageID;

  //container.classList.add('video');

  let img = container.firstElementChild as HTMLImageElement || new Image();
  img.setAttribute('message-id', '' + message.id);

  if(!container.contains(img)) {
    container.append(img);
  }
  
  //return Promise.resolve();
  
  if(!preloader) {
    preloader = new ProgressivePreloader(container, true);
  }
  
  let loadVideo = () => {
    let promise = appDocsManager.downloadDoc(doc);
    
    /* promise.notify = (details: {done: number, total: number}) => {
      console.log('doc download', promise, details);
      preloader.setProgress(details.done);
    }; */
    
    return promise.then(blob => {
      if((this.peerID ? this.peerID : this.currentMessageID) != peerID) {
        this.log.warn('peer changed');
        return;
      }
      
      console.log('loaded doc:', doc, blob, container);
      
      let video = document.createElement('video');
      video.loop = true;
      video.autoplay = true;
      
      if(!justLoader) {
        video.controls = true;
      } else {
        video.volume = 0;
      }
      
      video.setAttribute('message-id', '' + message.id);
      
      let source = document.createElement('source');
      //source.src = doc.url;
      source.src = URL.createObjectURL(blob);
      source.type = doc.mime_type;

      if(img && container.contains(img)) {
        container.removeChild(img);
      }
      
      video.append(source);
      container.append(video);
      
      preloader.detach();
    });
  };
  
  if(doc.type == 'gif') {
    return this.peerID ? this.loadMediaQueuePush(loadVideo) : loadVideo();
  } else { // if video
    let load = () => appPhotosManager.preloadPhoto(doc).then((blob) => {
      if((this.peerID ? this.peerID : this.currentMessageID) != peerID) {
        this.log.warn('peer changed');
        return;
      }

      img.src = URL.createObjectURL(blob);
      
      /* image.style.height = doc.h + 'px';
      image.style.width = doc.w + 'px'; */
      
      if(!justLoader) {
        return loadVideo();
      } else {
        preloader.detach();
      }
    });

    return this.peerID ? this.loadMediaQueuePush(load) : load();
  }
}

export function wrapDocument(doc: MTDocument, withTime = false): HTMLDivElement {
  let docDiv = document.createElement('div');
  docDiv.classList.add('document');
  
  let iconDiv = document.createElement('div');
  iconDiv.classList.add('tgico-document');
  
  let attributeFilename: {
    _: 'documentAttributeFilename',
    file_name: string
  } = doc.attributes.find((a: any) => a._ == "documentAttributeFilename");
  
  let extSplitted = attributeFilename ? attributeFilename.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ? extSplitted.pop().toLowerCase() : 'file';
  
  let fileName = attributeFilename ? attributeFilename.file_name : 'Unknown.file';
  let size = formatBytes(doc.size);
  
  if(withTime) {
    let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let date = new Date(doc.date * 1000);
    
    size += ' · ' + months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear() 
    + ' at ' + date.getHours() + ':' + ('0' + date.getMinutes()).slice(-2);
  }
  
  docDiv.innerHTML = `
  <div class="document-ico ext-${ext}">${ext}</div>
  <div class="document-name">${fileName}</div>
  <div class="document-size">${size}</div>
  `;
  
  return docDiv;
}

export function scrollable(el: HTMLDivElement, x = false, y = true) {
  let container = document.createElement('div');
  container.classList.add('scrollable');
  if(x) container.classList.add('scrollable-x');
  if(y) container.classList.add('scrollable-y');
  
  container.addEventListener('mouseover', () => {
    container.classList.add('active');
    
    container.addEventListener('mouseout', () => {
      container.classList.remove('active');
    }, {once: true});
  });
  
  Array.from(el.children).forEach(c => container.append(c));
  
  el.append(container);//container.append(el);
  return container;
}

export function wrapPhoto(this: AppImManager, photo: any, message: any, container: HTMLDivElement) {
  //container.classList.add('photo');

  let peerID = this.peerID;

  let size = appPhotosManager.setAttachmentSize(photo.id, container);
  let image = container.firstElementChild as HTMLImageElement || new Image();
  image.setAttribute('message-id', message.mid);

  if(!container.contains(image)) {
    container.append(image);
  }

  let preloader = new ProgressivePreloader(container, false);

  let load = () => appPhotosManager.preloadPhoto(photo.id, size).then((blob) => {
    if(this.peerID != peerID) {
      this.log.warn('peer changed');
      return;
    }
    
    image.src = URL.createObjectURL(blob);

    preloader.detach();
  });

  console.log('wrapPhoto', load, container, image);

  return this.loadMediaQueue ? this.loadMediaQueuePush(load) : load();
}

export function wrapSticker(doc: MTDocument, div: HTMLDivElement, middleware?: () => boolean, lazyLoadQueue?: LazyLoadQueue, group?: string, canvas?: boolean) {
  let stickerType = doc.mime_type == "application/x-tgsticker" ? 2 : (doc.mime_type == "image/webp" ? 1 : 0);
  
  if(!stickerType) {
    console.error('wrong doc for wrapSticker!', doc, div);
  }
  
  console.log('wrap sticker', doc);
  
  if(doc.thumbs && !div.firstElementChild) {
    let thumb = doc.thumbs[0];
    
    if(thumb.bytes) {
      MTProto.apiFileManager.saveSmallFile(thumb.location, thumb.bytes);
      
      appPhotosManager.setAttachmentPreview(thumb.bytes, div, true);
    }
  }
  
  let load = () => MTProto.apiFileManager.downloadSmallFile({
    _: 'inputDocumentFileLocation',
    access_hash: doc.access_hash,
    file_reference: doc.file_reference,
    thumb_size: ''/* document.thumbs[0].type */,
    id: doc.id,
    stickerType: stickerType
  }, {mimeType: doc.mime_type, dcID: doc.dc_id}).then(blob => {
    //console.log('loaded sticker:', blob, div);
    if(middleware && !middleware()) return;
    
    if(div.firstElementChild) {
      div.firstElementChild.remove();
    }
    
    if(stickerType == 2) {
      const reader = new FileReader();
      
      reader.addEventListener('loadend', async(e) => {
        // @ts-ignore
        const text = e.srcElement.result;
        let json = await CryptoWorker.gzipUncompress<string>(text, true);
        
        let animation = await LottieLoader.loadAnimation({
          container: div,
          loop: false,
          autoplay: false,
          animationData: JSON.parse(json),
          renderer: canvas ? 'canvas' : 'svg'
        }, group);
        
        if(!canvas) {
          div.addEventListener('mouseover', (e) => {
            let animation = LottieLoader.getAnimation(div, group);
            
            if(animation) {
              //console.log('sticker hover', animation, div);
              
              // @ts-ignore
              animation.loop = true;
              
              // @ts-ignore
              if(animation.currentFrame == animation.totalFrames - 1) {
                animation.goToAndPlay(0, true);
              } else {
                animation.play();
              }
              
              div.addEventListener('mouseout', () => {
                // @ts-ignore
                animation.loop = false;
              }, {once: true});
            }
          });
        }
      });
      
      reader.readAsArrayBuffer(blob);
    } else if(stickerType == 1) {
      let img = new Image();
      img.src = URL.createObjectURL(blob);
      
      /* div.style.height = doc.h + 'px';
      div.style.width = doc.w + 'px'; */
      div.append(img);
    }
    
    div.setAttribute('file-id', doc.id);
    appStickersManager.saveSticker(doc);
  });
  
  return lazyLoadQueue ? (lazyLoadQueue.push({div, load}), Promise.resolve()) : load();
}

export function horizontalMenu(tabs: HTMLUListElement, content: HTMLDivElement, onClick?: (id: number, tabContent: HTMLDivElement) => void, onTransitionEnd?: () => void) {
  let hideTimeout: number = 0;
  let prevTabContent: HTMLDivElement = null;
  
  let prevId = -1;
  
  tabs.addEventListener('click', function(e) {
    let target = e.target as HTMLLIElement;
    
    if(target.tagName != 'LI') {
      target = findUpTag(target, 'LI');
    }
    
    console.log('tabs click:', target);
    
    if(target.classList.contains('active')) return false;
    
    let prev = tabs.querySelector('li.active') as HTMLLIElement;
    prev && prev.classList.remove('active');
    
    target.classList.add('active');
    
    let id = whichChild(target);
    
    if(id == prevId) return false;
    
    let tabContent = content.children[id] as HTMLDivElement;
    tabContent.classList.add('active');
    
    console.log('mambo rap', prevId, id);
    
    //content.style.marginLeft = id > 0 ? (-id * 100) + '%' : '';
    let toRight = prevId < id;
    if(prevId != -1) {
      content.style.width = '200%';
      
      console.log('mambo rap setting', toRight);
      
      content.classList.remove('animated');
      
      if(toRight) {
        content.classList.add('animated');
        content.style.marginLeft = '-100%';
      } else {
        
        content.style.marginLeft = '-100%';
        setTimeout(() => {
          content.classList.add('animated');
          content.style.marginLeft = '';
        }, 0);
      }
    }
    
    prevId = id;
    
    let p = prevTabContent;
    clearTimeout(hideTimeout);
    if(p) hideTimeout = setTimeout(() => {
      if(toRight) {
        p.classList.remove('active');
        content.classList.remove('animated');
        content.style.width = '100%'; 
      }
      
      /* content.style.marginLeft = '0%';
      content.style.width = '100%'; */
      
      if(!toRight) {
        p.classList.remove('active');
        content.classList.remove('animated');
        content.style.width = '100%';
      }
      
      content.style.marginLeft = '';
      
      if(onTransitionEnd) onTransitionEnd();
    }, 200);
    
    if(onClick) onClick(id, tabContent);
    prevTabContent = tabContent;
  });
}

export function getNearestDc() {
  return MTProto.apiManager.invokeApi('help.getNearestDc').then((nearestDcResult: any) => {
    if(nearestDcResult.nearest_dc != nearestDcResult.this_dc) {
      //MTProto.apiManager.baseDcID = nearestDcResult.nearest_dc;
      MTProto.apiManager.getNetworker(nearestDcResult.nearest_dc);
    }
    
    return nearestDcResult;
  });
}
