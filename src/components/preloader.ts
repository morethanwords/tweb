/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {CancellablePromise} from '../helpers/cancellablePromise';
import SetTransition from './singleTransition';
import {fastRaf} from '../helpers/schedulers';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import isInDOM from '../helpers/dom/isInDOM';
import safeAssign from '../helpers/object/safeAssign';

const TRANSITION_TIME = 200;

export default class ProgressivePreloader {
  public preloader: HTMLDivElement;
  public circle: SVGCircleElement;
  private cancelSvg: SVGSVGElement;
  private downloadSvg: HTMLElement;

  private tempId = 0;
  public detached = true;

  public promise: CancellablePromise<any> = null;

  public isUpload = false;
  private cancelable = true;
  private streamable = false;
  private rtmp = false;
  private tryAgainOnFail = true;
  private attachMethod: 'append' | 'prepend' = 'append';

  public loadFunc: (e?: Event) => any;

  public totalLength: number;

  constructor(options?: Partial<{
    isUpload: ProgressivePreloader['isUpload'],
    cancelable: ProgressivePreloader['cancelable'],
    streamable: ProgressivePreloader['streamable'],
    rtmp: ProgressivePreloader['rtmp'],
    tryAgainOnFail: ProgressivePreloader['tryAgainOnFail'],
    attachMethod: ProgressivePreloader['attachMethod']
  }>) {
    if(options) {
      safeAssign(this, options);
    }

    if(this.isUpload) {
      this.tryAgainOnFail = false;
    }
  }

  public constructContainer(options: Partial<{
    color: 'transparent',
    bold: boolean
  }> = {}) {
    if(!this.preloader) {
      this.preloader = document.createElement('div');
      if(this.rtmp) {
        this.preloader.classList.add('preloader-container-rtmp');
      } else {
        this.preloader.classList.add('preloader-container');
      }

      if(options.color) {
        this.preloader.classList.add('preloader-' + options.color);
      }

      if(options.bold) {
        this.preloader.classList.add('preloader-bold');
      }

      if(this.streamable) {
        this.preloader.classList.add('preloader-streamable');
      }
    }
  }

  public constructDownloadIcon() {
    this.constructContainer();
  }

  public construct() {
    this.construct = null;

    this.constructContainer();

    if(this.rtmp) {
      this.preloader.innerHTML = `
      <div class="loading-wrap is-loading">
        <div class="loading"></div>
        <div class="loading_bezel-wrap">
          <div class="loading"></div>
        </div>
      </div>`;
    } else {
      this.preloader.innerHTML = `
      <div class="you-spin-me-round">
      <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="${this.streamable ? '25 25 50 50' : '27 27 54 54'}">
      <circle class="preloader-path-new" cx="${this.streamable ? '50' : '54'}" cy="${this.streamable ? '50' : '54'}" r="${this.streamable ? 19 : 24}" fill="none" stroke-miterlimit="10"/>
      </svg>
      </div>`;
    }

    if(this.streamable) {
      this.totalLength = 118.61124420166016;
    } else {
      this.totalLength = 149.82473754882812;
    }

    if(this.cancelable) {
      this.preloader.innerHTML += `
      <svg xmlns="http://www.w3.org/2000/svg" class="preloader-close" viewBox="0 0 24 24">
        <g fill="none" fill-rule="evenodd">
          <polygon points="0 0 24 0 24 24 0 24"/>
          <path fill="#000" fill-rule="nonzero" d="M5.20970461,5.38710056 L5.29289322,5.29289322 C5.65337718,4.93240926 6.22060824,4.90467972 6.61289944,5.20970461 L6.70710678,5.29289322 L12,10.585 L17.2928932,5.29289322 C17.6834175,4.90236893 18.3165825,4.90236893 18.7071068,5.29289322 C19.0976311,5.68341751 19.0976311,6.31658249 18.7071068,6.70710678 L13.415,12 L18.7071068,17.2928932 C19.0675907,17.6533772 19.0953203,18.2206082 18.7902954,18.6128994 L18.7071068,18.7071068 C18.3466228,19.0675907 17.7793918,19.0953203 17.3871006,18.7902954 L17.2928932,18.7071068 L12,13.415 L6.70710678,18.7071068 C6.31658249,19.0976311 5.68341751,19.0976311 5.29289322,18.7071068 C4.90236893,18.3165825 4.90236893,17.6834175 5.29289322,17.2928932 L10.585,12 L5.29289322,6.70710678 C4.93240926,6.34662282 4.90467972,5.77939176 5.20970461,5.38710056 L5.29289322,5.29289322 L5.20970461,5.38710056 Z"/>
        </g>
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" class="preloader-download" viewBox="0 0 24 24">
        <g fill="none" fill-rule="evenodd">
          <polygon points="0 0 24 0 24 24 0 24"/>
          <path fill="#000" fill-rule="nonzero" d="M5,19 L19,19 C19.5522847,19 20,19.4477153 20,20 C20,20.5128358 19.6139598,20.9355072 19.1166211,20.9932723 L19,21 L5,21 C4.44771525,21 4,20.5522847 4,20 C4,19.4871642 4.38604019,19.0644928 4.88337887,19.0067277 L5,19 L19,19 L5,19 Z M11.8833789,3.00672773 L12,3 C12.5128358,3 12.9355072,3.38604019 12.9932723,3.88337887 L13,4 L13,13.585 L16.2928932,10.2928932 C16.6533772,9.93240926 17.2206082,9.90467972 17.6128994,10.2097046 L17.7071068,10.2928932 C18.0675907,10.6533772 18.0953203,11.2206082 17.7902954,11.6128994 L17.7071068,11.7071068 L12.7071068,16.7071068 C12.3466228,17.0675907 11.7793918,17.0953203 11.3871006,16.7902954 L11.2928932,16.7071068 L6.29289322,11.7071068 C5.90236893,11.3165825 5.90236893,10.6834175 6.29289322,10.2928932 C6.65337718,9.93240926 7.22060824,9.90467972 7.61289944,10.2097046 L7.70710678,10.2928932 L11,13.585 L11,4 C11,3.48716416 11.3860402,3.06449284 11.8833789,3.00672773 L12,3 L11.8833789,3.00672773 Z"/>
        </g>
      </svg>`;

      this.downloadSvg = this.preloader.lastElementChild as HTMLElement;
      this.cancelSvg = this.downloadSvg.previousElementSibling as any;
    } else {
      this.preloader.classList.add('preloader-swing');
    }

    this.circle = this.preloader.firstElementChild.firstElementChild.firstElementChild as SVGCircleElement;

    if(this.cancelable) {
      attachClickEvent(this.preloader, this.onClick);
    }
  }

  public onClick = (e?: Event) => {
    if(e) {
      cancelEvent(e);
    }

    if(this.preloader.classList.contains('manual')) {
      this.loadFunc?.(e);
    } else {
      this.promise?.cancel?.();
    }
  };

  public setDownloadFunction(func: ProgressivePreloader['loadFunc']) {
    this.loadFunc = func;
  }

  public setManual() {
    this.preloader.classList.add('manual');
    this.setProgress(0);
  }

  public attachPromise(promise: CancellablePromise<any>) {
    if(this.isUpload && this.promise) return;

    this.promise = promise;

    const tempId = --this.tempId;
    const startTime = Date.now();

    const onEnd = (err: Error) => {
      promise.notify = promise.notifyAll = null;

      if(tempId !== this.tempId) {
        return;
      }

      const elapsedTime = Date.now() - startTime;

      // console.log('[PP]: end', this.detached, performance.now());

      if(!err && this.cancelable) {
        this.setProgress(100);

        const delay = TRANSITION_TIME * 0.75;

        if(elapsedTime < delay) {
          this.detach();
        } else {
          setTimeout(() => { // * wait for transition complete
            if(tempId === this.tempId) {
              this.detach();
            }
          }, delay);
        }
      } else {
        if(this.tryAgainOnFail) {
          this.attach(this.preloader.parentElement);
          fastRaf(() => {
            this.setManual();
          });
        } else {
          this.detach();
        }
      }

      this.promise = promise = null;
    };

    promise
    .then(() => onEnd(null))
    .catch((err) => onEnd(err));

    promise.addNotifyListener?.((details: {done: number, total: number}) => {
      /* if(details.done >= details.total) {
        onEnd();
      } */

      if(tempId !== this.tempId) return;

      // console.log('preloader download', promise, details);
      const percents = details.done / details.total * 100;
      this.setProgress(percents);
    });
  }

  public attach(elem: Element, reset = false, promise?: CancellablePromise<any>) {
    if(!this.detached && (!this.preloader || !this.preloader.classList.contains('manual'))) {
      return;
    }

    this.construct?.();

    if(this.preloader.parentElement) {
      this.preloader.classList.remove('manual');
    }

    this.detached = false;

    if(promise/*  && false */) {
      this.attachPromise(promise);
    }

    let useRafs = 0;
    if(this.detached || this.preloader.parentElement !== elem) {
      useRafs = isInDOM(this.preloader) ? 1 : 2;
      if(this.preloader.parentElement !== elem) {
        elem[this.attachMethod](this.preloader);
      }
    }

    SetTransition({
      element: this.preloader,
      className: 'is-visible',
      forwards: true,
      duration: TRANSITION_TIME,
      useRafs
    });

    if(this.cancelable && reset) {
      this.setProgress(0);
    }
  }

  public detach() {
    if(this.detached) {
      return;
    }
    // return;

    this.detached = true;

    // return;

    if(this.preloader?.parentElement) {
      /* setTimeout(() =>  */// fastRaf(() => {
      /* if(!this.detached) return;
        this.detached = true; */

      // fastRaf(() => {
      // console.log('[PP]: detach after rAF', this.detached, performance.now());

      // if(!this.detached || !this.preloader.parentElement) {
      //   return;
      // }

      SetTransition({
        element: this.preloader,
        className: 'is-visible',
        forwards: false,
        duration: TRANSITION_TIME,
        onTransitionEnd: () => {
          this.preloader.remove();
        },
        useRafs: 1
      });
      // });
      // })/* , 5e3) */;
    }
  }

  public setProgress(percents: number) {
    if(!this.totalLength && !isInDOM(this.circle)) {
      return;
    }

    if(percents === 0) {
      this.circle.style.strokeDasharray = '';
      return;
    }

    try {
      this.totalLength ||= this.circle.getTotalLength();

      // console.log('setProgress', (percents / 100 * totalLength));
      this.circle.style.strokeDasharray = '' + Math.max(5, percents / 100 * this.totalLength) + ', ' + this.totalLength;
    } catch(err) {}
  }
}
