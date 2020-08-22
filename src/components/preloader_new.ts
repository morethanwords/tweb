import { isInDOM, $rootScope, cancelEvent } from "../lib/utils";
import appDownloadManager, { Progress } from "../lib/appManagers/appDownloadManager";

export default class ProgressivePreloader {
  public preloader: HTMLDivElement;
  private circle: SVGCircleElement;
  
  //private tempID = 0;
  private detached = true;
  
  private fileName: string;
  public controller: AbortController;

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
      this.preloader.addEventListener('click', (e) => {
        cancelEvent(e);
        this.detach();

        if(!this.fileName) {
          return;
        }

        const download = appDownloadManager.getDownload(this.fileName);
        if(download && download.controller && !download.controller.signal.aborted) {
          download.controller.abort();
        }
      });
    }
  }

  downloadProgressHandler = (details: Progress) => {
    if(details.done >= details.total) {
      this.detach();
    }

    //console.log('preloader download', promise, details);
    let percents = details.done / details.total * 100;
    this.setProgress(percents);
  };

  public attach(elem: Element, reset = true, fileName?: string, append = true) {
    this.fileName = fileName;
    if(this.fileName) {
      const download = appDownloadManager.getDownload(fileName);
      download.promise.catch(() => {
        this.detach();
      });

      appDownloadManager.addProgressCallback(this.fileName, this.downloadProgressHandler);
    }

    this.detached = false;
    window.requestAnimationFrame(() => {
      if(this.detached) return;
      this.detached = false;

      elem[append ? 'append' : 'prepend'](this.preloader);

      if(this.cancelable && reset) {
        this.setProgress(0);
      }
    });
  }
  
  public detach() {
    this.detached = true;
    
    if(this.preloader.parentElement) {
      window.requestAnimationFrame(() => {
        if(!this.detached) return;
        this.detached = true;

        if(this.preloader.parentElement) {
          this.preloader.parentElement.removeChild(this.preloader);
        }
      });
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
      let totalLength = this.circle.getTotalLength();
      //console.log('setProgress', (percents / 100 * totalLength));
      this.circle.style.strokeDasharray = '' + Math.max(5, percents / 100 * totalLength) + ', 200';
    } catch(err) {}
  }
}
