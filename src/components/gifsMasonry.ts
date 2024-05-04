/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../lib/appManagers/appDocsManager';
import animationIntersector, {AnimationItemGroup} from './animationIntersector';
import Scrollable from './scrollable';
import deferredPromise, {CancellablePromise} from '../helpers/cancellablePromise';
import {doubleRaf} from '../helpers/schedulers';
import {AppManagers} from '../lib/appManagers/managers';
import rootScope from '../lib/rootScope';
import LazyLoadQueueRepeat2 from './lazyLoadQueueRepeat2';
import wrapVideo from './wrappers/video';
import noop from '../helpers/noop';
import {MiddlewareHelper, getMiddleware} from '../helpers/middleware';
import positionElementByIndex from '../helpers/dom/positionElementByIndex';

export default class GifsMasonry {
  public lazyLoadQueue: LazyLoadQueueRepeat2;
  private scrollPromise: CancellablePromise<void> = Promise.resolve();
  private timeout: number = 0;
  private managers: AppManagers;
  private middlewareHelper: MiddlewareHelper;
  private map: Map<DocId, HTMLElement>;

  constructor(
    private element: HTMLElement,
    private group: AnimationItemGroup,
    private scrollable: Scrollable,
    attach = true
  ) {
    this.managers = rootScope.managers;
    this.middlewareHelper = getMiddleware();
    this.map = new Map();

    this.lazyLoadQueue = new LazyLoadQueueRepeat2(undefined, ({target, visible}) => {
      if(visible) {
        this.processVisibleDiv(target);
      } else {
        this.processInvisibleDiv(target);
      }
    });

    if(attach) {
      this.attach();
    }
  }

  private onScroll = () => {
    if(this.timeout) {
      clearTimeout(this.timeout);
    } else {
      this.scrollPromise = deferredPromise<void>();
      // animationIntersector.checkAnimations(true, group);
    }

    this.timeout = window.setTimeout(() => {
      this.timeout = 0;
      this.scrollPromise.resolve();
      // animationIntersector.checkAnimations(false, group);
    }, 150);
  };

  public attach() {
    this.scrollable.container.addEventListener('scroll', this.onScroll);
  }

  public detach() {
    this.clear();
    this.scrollable.container.removeEventListener('scroll', this.onScroll);
    this.middlewareHelper.destroy();
  }

  public clear() {
    this.lazyLoadQueue.clear();
  }

  private processVisibleDiv(div: HTMLElement) {
    const video = div.querySelector('video');
    if(video) {
      return;
    }

    const load = () => {
      const docId = div.dataset.docId;
      const promise = Promise.all([this.managers.appDocsManager.getDoc(docId), this.scrollPromise]).then(async([doc]) => {
        if(!this.lazyLoadQueue.intersector.isVisible(div)) {
          this.processInvisibleDiv(div);
          return;
        }

        div.middlewareHelper.clean();
        const middleware = div.middlewareHelper.get().create().get();
        const res = await wrapVideo({
          doc,
          container: div as HTMLDivElement,
          lazyLoadQueue: null,
          // lazyLoadQueue: EmoticonsDropdown.lazyLoadQueue,
          group: this.group,
          noInfo: true,
          noPreview: true,
          middleware
        });

        const promise = res.loadPromise;
        promise.finally(() => {
          middleware.onDestroy(() => {
            res.video?.remove();
          });

          if(!middleware() || !this.lazyLoadQueue.intersector.isVisible(div)) {
            this.processInvisibleDiv(div);
            return;
          }

          const thumb = div.querySelector('img, canvas');
          thumb && thumb.classList.add('hide');
        });

        return promise;
      });

      return promise;
    };

    // return load();

    this.lazyLoadQueue.push({div, load});
  }

  public processInvisibleDiv = (div: HTMLElement) => {
    return this.scrollPromise.then(async() => {
      // return;

      if(this.lazyLoadQueue.intersector.isVisible(div)) {
        return;
      }

      const thumb = div.querySelector('img, canvas');

      if(thumb) {
        thumb.classList.remove('hide');
        await doubleRaf();
      }

      if(this.lazyLoadQueue.intersector.isVisible(div)) {
        return;
      }

      div.middlewareHelper.clean();
    });
  };

  public addBatch(docs: MyDocument[]) {
    docs.forEach((doc) => this.add(doc));
  }

  public update(docs: MyDocument[]) {
    for(const [docId] of this.map) {
      if(!docs.some((doc) => doc.id === docId)) {
        this.delete(docId);
      }
    }

    this.addBatch(docs);
    for(let i = 0, length = docs.length; i < length; ++i) {
      const element = this.map.get(docs[i].id);
      positionElementByIndex(element, this.element, i);
    }
  }

  public add(doc: MyDocument, appendTo = this.element) {
    if(this.map.has(doc.id)) {
      return;
    }

    const div = document.createElement('div');
    div.classList.add('gif', 'grid-item'/* , 'fade-in-transition' */);
    // div.style.opacity = '0';
    div.dataset.docId = '' + doc.id;
    div.middlewareHelper = this.middlewareHelper.get().create();
    this.map.set(doc.id, div);

    appendTo.append(div);

    this.lazyLoadQueue.observe({div, load: noop as any});

    // let preloader = new ProgressivePreloader(div);

    wrapVideo({
      doc,
      container: div as HTMLDivElement,
      lazyLoadQueue: null,
      noInfo: true,
      onlyPreview: true,
      middleware: div.middlewareHelper.get()
    });
  }

  public delete(docId: DocId) {
    const div = this.map.get(docId);
    if(div) {
      div.remove();
      div.middlewareHelper.destroy();
      this.map.delete(docId);
    }
  }
}
