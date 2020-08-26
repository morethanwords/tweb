import { MTDocument } from "../types";
import { calcImageInBox, findUpClassName } from "../lib/utils";
import appDocsManager from "../lib/appManagers/appDocsManager";
import { wrapVideo } from "./wrappers";
import { renderImageFromUrl } from "./misc";
import LazyLoadQueue from "./lazyLoadQueue";

const width = 400;
const maxSingleWidth = width - 100;
const height = 100;

export default class GifsMasonry {
  constructor(private element: HTMLElement) {
    
  }

  public add(doc: MTDocument, group: string, lazyLoadQueue?: LazyLoadQueue) {
    let gifWidth = doc.w;
    let gifHeight = doc.h;
    if(gifHeight < height) {
      gifWidth = height / gifHeight * gifWidth;
      gifHeight = height;
    }

    let willUseWidth = Math.min(maxSingleWidth, width, gifWidth);
    let {w, h} = calcImageInBox(gifWidth, gifHeight, willUseWidth, height);

    /* wastedWidth += w;

    if(wastedWidth == width || h < height) {
      wastedWidth = 0;
      console.log('completed line', i, line);
      line = [];
      continue;
    }

    line.push(gif); */

    //console.log('gif:', gif, w, h);

    let div = document.createElement('div');
    div.classList.add('gif', 'fade-in-transition');
    div.style.width = w + 'px';
    div.style.opacity = '0';
    //div.style.height = h + 'px';
    div.dataset.docID = doc.id;

    this.element.append(div);

    //let preloader = new ProgressivePreloader(div);

    const posterURL = appDocsManager.getThumbURL(doc, false);
    let img: HTMLImageElement;
    if(posterURL) {
      img = new Image();
      img.src = posterURL;
    }

    let mouseOut = false;
    const onMouseOver = (/* e: MouseEvent */) => {
      //console.log('onMouseOver', doc.id);
      //cancelEvent(e);
      mouseOut = false;

      wrapVideo({
        doc,
        container: div,
        lazyLoadQueue,
        //lazyLoadQueue: EmoticonsDropdown.lazyLoadQueue,
        group,
        noInfo: true,
      });

      const video = div.querySelector('video');
      video.addEventListener('canplay', () => {
        div.style.opacity = '';
        if(!mouseOut) {
          img && img.classList.add('hide');
        } else {
          img && img.classList.remove('hide');
          if(div.lastElementChild != img) {
            div.lastElementChild.remove();
          }
        }
      }, {once: true});
    };

    const afterRender = () => {
      if(img) {
        div.append(img);
        div.style.opacity = '';
      }

      if(lazyLoadQueue) {
        onMouseOver();
      } else {
        div.addEventListener('mouseover', onMouseOver, {once: true});
        div.addEventListener('mouseout', (e) => {
          const toElement = (e as any).toElement as Element;
          //console.log('onMouseOut', doc.id, e);
          if(findUpClassName(toElement, 'gif') == div) {
            return;
          }
  
          //cancelEvent(e);
  
          mouseOut = true;
  
          const cb = () => {
            if(div.lastElementChild != img) {
              div.lastElementChild.remove();
            }
  
            div.addEventListener('mouseover', onMouseOver, {once: true});
          };
  
          img && img.classList.remove('hide');
          /* window.requestAnimationFrame(() => {
            window.requestAnimationFrame();
          }); */
          if(img) window.requestAnimationFrame(() => window.requestAnimationFrame(cb));
          else cb();
        });
      }
    };

    (posterURL ? renderImageFromUrl(img, posterURL, afterRender) : afterRender());
  }
}