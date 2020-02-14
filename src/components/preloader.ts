import { isInDOM } from "../lib/utils";
import { CancellablePromise } from "../lib/mtproto/apiFileManager";

export default class ProgressivePreloader {
  public preloader: HTMLDivElement = null;
  private circle: SVGCircleElement = null;
  private progress = 0;
  private promise: CancellablePromise<any> = null;
  private tempID = 0;
  constructor(elem?: Element, private cancelable = true) {
    this.preloader = document.createElement('div');
    this.preloader.classList.add('preloader-container');
    
    this.preloader.innerHTML = `
    <div class="you-spin-me-round">
    <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
    <circle class="preloader-path-new" cx="50" cy="50" r="23" fill="none" stroke-miterlimit="10"/>
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
      this.preloader.addEventListener('click', () => {
        if(this.promise && this.promise.cancel) {
          this.promise.cancel();
          this.detach();
        }
      });
    }
  }
  
  public attach(elem: Element, reset = true, promise?: CancellablePromise<any>) {
    if(promise) {
      this.promise = promise;

      let tempID = --this.tempID;
      promise.then(() => {
        if(tempID == this.tempID) {
          this.detach();
        }
      });

      promise.notify = (details: {done: number, total: number}) => {
        if(tempID != this.tempID) return;

        console.log('preloader download', promise, details);
        let percents = details.done / details.total * 100;
        this.setProgress(percents);
      };
    }

    if(this.cancelable && reset) {
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
    this.circle.style.strokeDasharray = '' + Math.max(5, percents / 100 * totalLength) + ', 200';
  }
}
