import { isInDOM, cancelEvent, attachClickEvent } from "../helpers/dom";
import { CancellablePromise } from "../helpers/cancellablePromise";
import SetTransition from "./singleTransition";

const TRANSITION_TIME = 200;

export default class ProgressivePreloader {
  public preloader: HTMLDivElement;
  private circle: SVGCircleElement;
  
  private tempId = 0;
  private detached = true;

  private promise: CancellablePromise<any> = null;

  constructor(elem?: Element, private cancelable = true, streamable = false, private attachMethod: 'append' | 'prepend' = 'append') {
    this.preloader = document.createElement('div');
    this.preloader.classList.add('preloader-container');

    if(streamable) {
      this.preloader.classList.add('preloader-streamable');
    }
    
    this.preloader.innerHTML = `
    <div class="you-spin-me-round">
    <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="${streamable ? '25 25 50 50' : '27 27 54 54'}">
    <circle class="preloader-path-new" cx="${streamable ? '50' : '54'}" cy="${streamable ? '50' : '54'}" r="${streamable ? 19 : 24}" fill="none" stroke-miterlimit="10"/>
    </svg>
    </div>`;
    
    if(cancelable) {
      this.preloader.innerHTML += `
      <svg xmlns="http://www.w3.org/2000/svg" class="preloader-close" viewBox="0 0 20 20">
      <line x1="0" y1="20" x2="20" y2="0" stroke-width="2" stroke-linecap="round"></line>
      <line x1="0" y1="0" x2="20" y2="20" stroke-width="2" stroke-linecap="round"></line>
      </svg>`;
    } else {
      this.preloader.classList.add('preloader-swing');
    }
    
    this.circle = this.preloader.firstElementChild.firstElementChild.firstElementChild as SVGCircleElement;
    
    if(elem) {
      this.attach(elem);
    }

    if(this.cancelable) {
      attachClickEvent(this.preloader, (e) => {
        cancelEvent(e);

        if(this.promise && this.promise.cancel) {
          this.promise.cancel();
          
          this.setProgress(0);
          setTimeout(() => {
            this.detach();
          }, 100);
        }
      });
    }
  }

  public attachPromise(promise: CancellablePromise<any>) {
    this.promise = promise;

    const tempId = --this.tempId;

    const onEnd = (successfully: boolean) => {
      promise.notify = null;

      if(tempId === this.tempId) {
        if(successfully) {
          this.setProgress(100);

          setTimeout(() => { // * wait for transition complete
            if(tempId === this.tempId) {
              this.detach();
            }
          }, TRANSITION_TIME * 1.25);
        } else {
          this.detach();
        }
        
        this.promise = promise = null;
      }
    };
    
    //promise.catch(onEnd);
    promise
    .then(() => onEnd(true))
    .catch(() => onEnd(false));

    if(promise.addNotifyListener) {
      promise.addNotifyListener((details: {done: number, total: number}) => {
        /* if(details.done >= details.total) {
          onEnd();
        } */

        if(tempId !== this.tempId) return;

        //console.log('preloader download', promise, details);
        const percents = details.done / details.total * 100;
        this.setProgress(percents);
      });
    }
  }

  public attach(elem: Element, reset = false, promise?: CancellablePromise<any>) {
    if(promise/*  && false */) {
      this.attachPromise(promise);
    }

    this.detached = false;
    /* window.requestAnimationFrame(() => {
      if(this.detached) return;
      this.detached = false; */

      elem[this.attachMethod](this.preloader);

      window.requestAnimationFrame(() => {
        SetTransition(this.preloader, 'is-visible', true, TRANSITION_TIME);
      });

      if(this.cancelable && reset) {
        this.setProgress(0);
      }
    //});
  }
  
  public detach() {
    this.detached = true;

    //return;
    
    if(this.preloader.parentElement) {
      /* setTimeout(() =>  *///window.requestAnimationFrame(() => {
        /* if(!this.detached) return;
        this.detached = true; */

        //if(this.preloader.parentElement) {
          window.requestAnimationFrame(() => {
            SetTransition(this.preloader, 'is-visible', false, TRANSITION_TIME, () => {
              this.preloader.remove();
            });
          });
        //}
      //})/* , 5e3) */;
    }
  }
  
  public setProgress(percents: number) {
    if(!isInDOM(this.circle)) {
      return;
    }
    
    if(percents === 0) {
      this.circle.style.strokeDasharray = '';
      return;
    }
    
    try {
      const totalLength = this.circle.getTotalLength();
      //console.log('setProgress', (percents / 100 * totalLength));
      this.circle.style.strokeDasharray = '' + Math.max(5, percents / 100 * totalLength) + ', ' + totalLength;
    } catch(err) {}
  }
}
