/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import mediaSizes from '../../../helpers/mediaSizes';
import {MyDocument} from '../../../lib/appManagers/appDocsManager';
import {AppManagers} from '../../../lib/appManagers/managers';
import animationIntersector, {AnimationItemGroup} from '../../animationIntersector';
import LazyLoadQueue from '../../lazyLoadQueue';
import LazyLoadQueueRepeat from '../../lazyLoadQueueRepeat';
import wrapSticker from '../../wrappers/sticker';
import safeAssign from '../../../helpers/object/safeAssign';
import {getMiddleware, Middleware} from '../../../helpers/middleware';
import noop from '../../../helpers/noop';

export default class SuperStickerRenderer {
  public lazyLoadQueue: LazyLoadQueueRepeat;
  private animated: Set<HTMLElement> = new Set();
  private regularLazyLoadQueue: LazyLoadQueue;
  private group: AnimationItemGroup;
  private managers: AppManagers;
  private intersectionObserverInit: IntersectionObserverInit;
  private visibleRenderOptions: Partial<Parameters<typeof wrapSticker>[0]>;
  private withLock: boolean

  constructor(options: {
    regularLazyLoadQueue: LazyLoadQueue;
    group: AnimationItemGroup;
    managers: AppManagers;
    intersectionObserverInit?: SuperStickerRenderer['intersectionObserverInit'];
    visibleRenderOptions?: SuperStickerRenderer['visibleRenderOptions'];
    withLock?: boolean
  }) {
    options.withLock ??= true;
    safeAssign(this, options);

    this.lazyLoadQueue = new LazyLoadQueueRepeat(undefined, ({target, visible}) => {
      if(!visible) {
        this.processInvisible(target);
      }
    }, this.intersectionObserverInit);
  }

  public clear() {
    this.lazyLoadQueue.clear();
    this.animated.forEach((element) => {
      element.middlewareHelper?.destroy();
    });
    this.animated.clear();
  }

  public destroy() {
    this.clear();
  }

  public renderSticker(
    doc: MyDocument,
    element?: HTMLElement,
    loadPromises?: Promise<any>[],
    middleware?: Middleware
  ) {
    if(!element) {
      element = document.createElement('div');
      element.classList.add('grid-item', 'super-sticker');
      element.dataset.docId = '' + doc.id;

      if(doc.animated) {
        this.observeAnimated(element);
      }
    }

    element.middlewareHelper ??= middleware ? middleware.create() : getMiddleware();

    // * This will wrap only a thumb
    /* !doc.animated &&  */ wrapSticker({
      doc,
      div: element,
      lazyLoadQueue: this.regularLazyLoadQueue,
      group: this.group,
      onlyThumb: doc.animated,
      loadPromises,
      middleware: element.middlewareHelper.get(),
      ...(doc.animated ? {} : this.visibleRenderOptions || {})
    });

    return element;
  }

  public observeAnimated(element: HTMLElement) {
    this.animated.add(element);
    this.lazyLoadQueue.observe({
      div: element,
      load: this.processVisible
    });
  }

  public unobserveAnimated(element: HTMLElement) {
    element.middlewareHelper?.destroy();
    this.animated.delete(element);
    this.lazyLoadQueue.delete({div: element});
  }

  public deleteSticker(element: HTMLElement) {
    return this.unobserveAnimated(element);
  }

  private checkAnimationContainer = (element: HTMLElement, visible: boolean) => {
    // console.error('checkAnimationContainer', div, visible);
    const players = animationIntersector.getAnimations(element);
    players.forEach((player) => {
      if(!visible) {
        animationIntersector.removeAnimation(player);
      } else {
        animationIntersector.checkAnimation(player, false);
      }
    });
  };

  private processVisible = async(element: HTMLElement) => {
    const docId = element.dataset.docId;
    const doc = await this.managers.appDocsManager.getDoc(docId);

    const size = mediaSizes.active.esgSticker.width;

    element.middlewareHelper ??= getMiddleware();
    element.middlewareHelper.clean();

    // console.log('processVisibleDiv:', element);
    const promise = wrapSticker({
      doc,
      div: element,
      width: size,
      height: size,
      lazyLoadQueue: null,
      group: this.group,
      onlyThumb: false,
      play: true,
      loop: true,
      withLock: this.withLock,
      middleware: element.middlewareHelper.get(),
      ...(this.visibleRenderOptions || {})
    }).then(({render}) => render);

    promise.then(() => {
      // clearTimeout(timeout);
      this.checkAnimationContainer(element, this.lazyLoadQueue.intersector.isVisible(element));
    }, noop);

    /* let timeout = window.setTimeout(() => {
      console.error('processVisibleDiv timeout', div, doc);
    }, 1e3); */
    return promise;
  };

  public processInvisible = async(element: HTMLElement) => {
    const docId = element.dataset.docId;
    const doc = await this.managers.appDocsManager.getDoc(docId);

    // console.log('STICKER INvisible:', /* div,  */docId);
    this.checkAnimationContainer(element, false);

    element.middlewareHelper?.clean();
    element.replaceChildren();
    this.renderSticker(doc, element as HTMLDivElement);
  };
}
