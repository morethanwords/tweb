import { calcImageInBox } from "../lib/utils";
import appDocsManager, {MyDocument} from "../lib/appManagers/appDocsManager";
import { wrapVideo } from "./wrappers";
import { renderImageFromUrl } from "./misc";
import { LazyLoadQueueRepeat2 } from "./lazyLoadQueue";
import animationIntersector from "./animationIntersector";
import Scrollable from "./scrollable_new";
import { CancellablePromise, deferredPromise } from "../helpers/cancellablePromise";

const width = 400;
const maxSingleWidth = width - 100;
const height = 100;

export default class GifsMasonry {
  public lazyLoadQueue: LazyLoadQueueRepeat2;
  private scrollPromise: CancellablePromise<void> = Promise.resolve();

  constructor(private element: HTMLElement, private group: string, private scrollable: Scrollable) {
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

    let timeout = 0;
    // memory leak
    scrollable.container.addEventListener('scroll', () => {
      if(timeout) {
        clearTimeout(timeout);
      } else {
        this.scrollPromise = deferredPromise<void>();
        //animationIntersector.checkAnimations(true, group);
      }

      timeout = window.setTimeout(() => {
        timeout = 0;
        this.scrollPromise.resolve();
        //animationIntersector.checkAnimations(false, group);
      }, 150);
    });
  }

  processVisibleDiv = (div: HTMLElement) => {
    const video = div.querySelector('video');
    if(video) {
      return;
    }

    //console.log('processVisibleDiv');

    const load = () => {
      const docID = div.dataset.docID;
      const doc = appDocsManager.getDoc(docID);

      const promise = this.scrollPromise.then(() => {
        const promise = wrapVideo({
          doc,
          container: div as HTMLDivElement,
          lazyLoadQueue: null,
          //lazyLoadQueue: EmoticonsDropdown.lazyLoadQueue,
          group: this.group,
          noInfo: true,
        });
    
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
  };

  processInvisibleDiv = async(div: HTMLElement) => {
    return this.scrollPromise.then(async() => {
      //return;

      if(this.lazyLoadQueue.intersector.isVisible(div)) {
        return;
      }

      const video = div.querySelector('video');
      const img = div.querySelector('img');
  
      if(img) {
        img && img.classList.remove('hide');
  
        await new Promise((resolve) => {
          window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
        });
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

  public add(doc: MyDocument) {
    let gifWidth = doc.w;
    let gifHeight = doc.h;
    if(gifHeight < height) {
      gifWidth = height / gifHeight * gifWidth;
      gifHeight = height;
    }

    const willUseWidth = Math.min(maxSingleWidth, width, gifWidth);
    const {w, h} = calcImageInBox(gifWidth, gifHeight, willUseWidth, height);

    /* wastedWidth += w;

    if(wastedWidth == width || h < height) {
      wastedWidth = 0;
      console.log('completed line', i, line);
      line = [];
      continue;
    }

    line.push(gif); */

    //console.log('gif:', gif, w, h);

    const div = document.createElement('div');
    div.classList.add('gif', 'fade-in-transition');
    div.style.width = w + 'px';
    div.style.opacity = '0';
    //div.style.height = h + 'px';
    div.dataset.docID = doc.id;

    this.element.append(div);

    //this.lazyLoadQueue.observe({div, load: this.processVisibleDiv});
    this.lazyLoadQueue.observe(div);

    //let preloader = new ProgressivePreloader(div);

    const gotThumb = appDocsManager.getThumb(doc, false);

    const willBeAPoster = !!gotThumb;
    let img: HTMLImageElement;
    if(willBeAPoster) {
      img = new Image();

      if(!gotThumb.thumb.url) {
        gotThumb.promise.then(() => {
          img.src = gotThumb.thumb.url;
        });
      }
    }

    const afterRender = () => {
      if(img) {
        div.append(img);
        div.style.opacity = '';
      }
    };

    (gotThumb?.thumb?.url ? renderImageFromUrl(img, gotThumb.thumb.url, afterRender) : afterRender());
  }
}