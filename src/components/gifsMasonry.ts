/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDocsManager, {MyDocument} from "../lib/appManagers/appDocsManager";
import { wrapVideo } from "./wrappers";
import { LazyLoadQueueRepeat2 } from "./lazyLoadQueue";
import animationIntersector from "./animationIntersector";
import Scrollable from "./scrollable";
import deferredPromise, { CancellablePromise } from "../helpers/cancellablePromise";
import renderImageFromUrl from "../helpers/dom/renderImageFromUrl";
import calcImageInBox from "../helpers/calcImageInBox";
import { doubleRaf } from "../helpers/schedulers";

const width = 400;
const maxSingleWidth = width - 100;
const height = 100;

export default class GifsMasonry {
  public lazyLoadQueue: LazyLoadQueueRepeat2;
  private scrollPromise: CancellablePromise<void> = Promise.resolve();
  private timeout: number = 0;

  constructor(private element: HTMLElement, private group: string, private scrollable: Scrollable, attach = true) {
    this.lazyLoadQueue = new LazyLoadQueueRepeat2(undefined, (target, visible) => {
      if(visible) {
        this.processVisibleDiv(target);
      } else {
        this.processInvisibleDiv(target);
      }
    });

    /* setInterval(() => {
      // @ts-ignore
      const players = animationIntersector.byGroups[group];

      if(players) {
        console.log(`GIFS RENDERED IN ${group}:`, players.length, players.filter(p => !p.animation.paused).length, this.lazyLoadQueue.intersector.getVisible().length);
      }
    }, .25e3); */

    if(attach) {
      this.attach();
    }
  }
  
  private onScroll = () => {
    if(this.timeout) {
      clearTimeout(this.timeout);
    } else {
      this.scrollPromise = deferredPromise<void>();
      //animationIntersector.checkAnimations(true, group);
    }

    this.timeout = window.setTimeout(() => {
      this.timeout = 0;
      this.scrollPromise.resolve();
      //animationIntersector.checkAnimations(false, group);
    }, 150);
  };

  public attach() {
    this.scrollable.container.addEventListener('scroll', this.onScroll);
  }

  public detach() {
    this.clear();
    this.scrollable.container.removeEventListener('scroll', this.onScroll);
  }

  public clear() {
    this.lazyLoadQueue.clear();
  }

  private processVisibleDiv(div: HTMLElement) {
    const video = div.querySelector('video');
    if(video) {
      return;
    }

    //console.log('processVisibleDiv');

    const load = () => {
      const docId = div.dataset.docId;
      const doc = appDocsManager.getDoc(docId);

      const promise = this.scrollPromise.then(() => {
        const res = wrapVideo({
          doc,
          container: div as HTMLDivElement,
          lazyLoadQueue: null,
          //lazyLoadQueue: EmoticonsDropdown.lazyLoadQueue,
          group: this.group,
          noInfo: true,
        });
    
        const promise = res.loadPromise;
        promise.finally(() => {
          const video = div.querySelector('video');

          div.style.opacity = '';
          const img = div.querySelector('img');
          img && img.classList.add('hide');

          if(video && !video.parentElement) {
            setTimeout(() => {
              video.src = '';
              video.load();
              const animations = animationIntersector.getAnimations(video);
              animations.forEach(item => {
                animationIntersector.checkAnimation(item, true, true);
              });
            }, 0);
          }

          //clearTimeout(timeout);
          if(!this.lazyLoadQueue.intersector.isVisible(div)) {
            this.processInvisibleDiv(div);
          }
        });

        return promise;
      });

      /* let timeout = window.setTimeout(() => {
        console.error('processVisibleDiv timeout', div, doc);
      }, 1e3); */

      return promise;
    };

    //return load();
    
    this.lazyLoadQueue.push({div, load});
  }

  public processInvisibleDiv = (div: HTMLElement) => {
    return this.scrollPromise.then(async() => {
      //return;

      if(this.lazyLoadQueue.intersector.isVisible(div)) {
        return;
      }

      const video = div.querySelector('video');
      const img = div.querySelector('img');
  
      if(img) {
        img && img.classList.remove('hide');
  
        await doubleRaf();
      }

      if(this.lazyLoadQueue.intersector.isVisible(div)) {
        return;
      }
  
      if(video) {
        video.remove();
        video.src = '';
        video.load();
        const animations = animationIntersector.getAnimations(video);
        animations.forEach(item => {
          animationIntersector.checkAnimation(item, true, true);
        });
      }
    });
  };

  public add(doc: MyDocument, appendTo = this.element) {
    let gifWidth = doc.w;
    let gifHeight = doc.h;
    if(gifHeight < height) {
      gifWidth = height / gifHeight * gifWidth;
      gifHeight = height;
    }

    const willUseWidth = Math.min(maxSingleWidth, width, gifWidth);
    const size = calcImageInBox(gifWidth, gifHeight, willUseWidth, height);

    /* wastedWidth += w;

    if(wastedWidth === width || h < height) {
      wastedWidth = 0;
      console.log('completed line', i, line);
      line = [];
      continue;
    }

    line.push(gif); */

    //console.log('gif:', gif, w, h);

    const div = document.createElement('div');
    div.classList.add('gif', 'fade-in-transition');
    div.style.width = size.width + 'px';
    div.style.opacity = '0';
    //div.style.height = h + 'px';
    div.dataset.docId = '' + doc.id;

    appendTo.append(div);

    //this.lazyLoadQueue.observe({div, load: this.processVisibleDiv});
    this.lazyLoadQueue.observe(div);

    //let preloader = new ProgressivePreloader(div);

    const gotThumb = appDocsManager.getThumb(doc, false);

    const willBeAPoster = !!gotThumb;
    let img: HTMLImageElement;
    if(willBeAPoster) {
      img = new Image();
      img.classList.add('media-poster');

      if(!gotThumb.cacheContext.url) {
        gotThumb.promise.then(() => {
          img.src = gotThumb.cacheContext.url;
        });
      }
    }

    const afterRender = () => {
      if(img) {
        div.append(img);
        div.style.opacity = '';
      }
    };

    (gotThumb?.cacheContext?.url ? renderImageFromUrl(img, gotThumb.cacheContext.url, afterRender) : afterRender());
  }
}
