import { isInDOM, cancelEvent } from "../helpers/dom";
import { CancellablePromise } from "../helpers/cancellablePromise";

export default class ProgressivePreloader {
  public preloader: HTMLDivElement;
  private circle: SVGCircleElement;
  
  private tempID = 0;
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
    <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
    <circle class="preloader-path-new" cx="50" cy="50" r="${streamable ? 19 : 23}" fill="none" stroke-miterlimit="10"/>
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
      this.preloader.addEventListener('click', (e) => {
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

    const tempID = --this.tempID;

    const onEnd = () => {
      promise.notify = null;

      if(tempID == this.tempID) {
        this.detach();
        this.promise = promise = null;
      }
    };
    
    //promise.catch(onEnd);
    promise.finally(onEnd);

    if(promise.addNotifyListener) {
      promise.addNotifyListener((details: {done: number, total: number}) => {
        /* if(details.done >= details.total) {
          onEnd();
        } */

        if(tempID != this.tempID) return;

        //console.log('preloader download', promise, details);
        const percents = details.done / details.total * 100;
        this.setProgress(percents);
      });
    }
  }

  public attach(elem: Element, reset = true, promise?: CancellablePromise<any>) {
    if(promise/*  && false */) {
      this.attachPromise(promise);
    }

    this.detached = false;
    window.requestAnimationFrame(() => {
      if(this.detached) return;
      this.detached = false;

      elem[this.attachMethod](this.preloader);

      if(this.cancelable && reset) {
        this.setProgress(0);
      }
    });
  }
  
  public detach() {
    this.detached = true;

    //return;
    
    if(this.preloader.parentElement) {
      /* setTimeout(() =>  */window.requestAnimationFrame(() => {
        if(!this.detached) return;
        this.detached = true;

        if(this.preloader.parentElement) {
          this.preloader.remove();
        }
      })/* , 5e3) */;
    }
  }
  
  public setProgress(percents: number) {
    if(!isInDOM(this.circle)) {
      return;
    }
    
    if(percents == 0) {
      this.circle.style.strokeDasharray = '';
      return;
    }
    
    try {
      const totalLength = this.circle.getTotalLength();
      //console.log('setProgress', (percents / 100 * totalLength));
      this.circle.style.strokeDasharray = '' + Math.max(5, percents / 100 * totalLength) + ', 200';
    } catch(err) {}
  }
}
