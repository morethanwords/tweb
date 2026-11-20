import mediaSizes from '@helpers/mediaSizes';
import {MyDocument} from '@appManagers/appDocsManager';
import {ReadingManagers} from '@lib/managers';
import animationIntersector, {AnimationItemGroup} from '@components/animationIntersector';
import LazyLoadQueue from '@components/lazyLoadQueue';
import LazyLoadQueueRepeat from '@components/lazyLoadQueueRepeat';
import wrapSticker from '@components/wrappers/sticker';
import safeAssign from '@helpers/object/safeAssign';
import {getMiddleware, Middleware} from '@helpers/middleware';
import {logger, LogTypes} from '@lib/logger';

export default class SuperStickerRenderer {
  public lazyLoadQueue: LazyLoadQueueRepeat;
  private owned: Set<HTMLElement> = new Set();
  private animated: Set<HTMLElement> = new Set();
  private regularLazyLoadQueue: LazyLoadQueue;
  private group: AnimationItemGroup;
  private managers: ReadingManagers;
  private intersectionObserverInit: IntersectionObserverInit;
  private visibleRenderOptions: Partial<Parameters<typeof wrapSticker>[0]>;
  private withLock: boolean
  private playOnHover: boolean
  private log = logger('SuperStickerRenderer', LogTypes.Error);

  private onRenderError = (error: ApiError) => {
    if(error?.type !== 'MIDDLEWARE') this.log.error('renderSticker error:', error);
  };

  constructor(options: {
    regularLazyLoadQueue: LazyLoadQueue;
    group: AnimationItemGroup;
    managers: ReadingManagers;
    intersectionObserverInit?: SuperStickerRenderer['intersectionObserverInit'];
    visibleRenderOptions?: SuperStickerRenderer['visibleRenderOptions'];
    withLock?: boolean
    playOnHover?: boolean
  }) {
    options.withLock ??= true;
    safeAssign(this, options);

    this.lazyLoadQueue = new LazyLoadQueueRepeat(undefined, ({target, visible}) => {
      if(!visible) {
        this.processInvisible(target).catch(this.onRenderError);
      }
    }, this.intersectionObserverInit);
  }

  public clear() {
    this.lazyLoadQueue.clear();
    this.owned.forEach((element) => {
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
      element.dataset.emoji = doc.stickerEmojiRaw || '';

      if(doc.animated) {
        this.observeAnimated(element);
      }
    }

    if(middleware && !middleware()) return element;
    if(!element.middlewareHelper) {
      element.middlewareHelper = middleware ? middleware.create() : getMiddleware();
      this.owned.add(element);
      element.middlewareHelper.onDestroy(() => {
        this.owned.delete(element);
        this.animated.delete(element);
        this.lazyLoadQueue.delete({div: element});
        this.rendererByElement.delete(element);
      });
      if(this.playOnHover) {
        const onMouseEnter = () => {
          const renderer = this.rendererByElement.get(element);
          if(renderer && 'playOrRestart' in renderer) renderer.playOrRestart();
        };
        element.addEventListener('mouseenter', onMouseEnter);
        element.middlewareHelper.onDestroy(() => element.removeEventListener('mouseenter', onMouseEnter));
      }
    }

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
    }).then(result => result.render).catch(this.onRenderError);

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

  private rendererByElement = new WeakMap<HTMLElement, Awaited<Awaited<ReturnType<typeof wrapSticker>>['render']>>();
  private processVisible = async(element: HTMLElement) => {
    if(!this.animated.has(element)) return;
    element.middlewareHelper ??= getMiddleware();
    const previousMiddleware = element.middlewareHelper.get();
    const docId = element.dataset.docId;
    const doc = await this.managers.appDocsManager.getDoc(docId);
    if(!previousMiddleware() || !this.animated.has(element) || !this.lazyLoadQueue.intersector.isVisible(element)) return;

    const size = mediaSizes.active.esgSticker.width;

    element.middlewareHelper.clean();
    const middleware = element.middlewareHelper.get();
    this.rendererByElement.delete(element);

    // console.log('processVisibleDiv:', element);
    const result = await wrapSticker({
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
      middleware,
      ...(this.visibleRenderOptions || {})
    });
    // Keep one promise owned by the lazy-load queue, including hover publication.
    const renderer = await result.render;
    if(!middleware() || !this.animated.has(element)) return;
    this.checkAnimationContainer(element, this.lazyLoadQueue.intersector.isVisible(element));
    if(this.playOnHover) this.rendererByElement.set(element, renderer);
    return renderer;
  };

  public processInvisible = async(element: HTMLElement) => {
    if(!this.animated.has(element)) return;
    const middleware = element.middlewareHelper?.get();
    const docId = element.dataset.docId;
    const doc = await this.managers.appDocsManager.getDoc(docId);
    if(!this.animated.has(element) || middleware && !middleware()) return;

    // the await above is a real worker round-trip - the cell may be back on
    // screen; demolishing it now would yank a live canvas (visible blink).
    // Bail and leave the old player alive - the visible flip that brought the
    // cell back already queued processVisible, which cleans and re-wraps. The
    // dropdown 'closed' sweep clears visibility synchronously before these
    // continuations run, so it still demolishes hidden cells.
    if(this.lazyLoadQueue.intersector.isVisible(element)) {
      return;
    }

    // console.log('STICKER INvisible:', /* div,  */docId);
    this.checkAnimationContainer(element, false);

    element.middlewareHelper?.clean();
    this.rendererByElement.delete(element);
    // no replaceChildren - the thumb re-wrap adopts the dead canvas (pixels
    // retained) as its bottom layer and retires it only under the decoded
    // preview img (replacePreviousMedia), so a mis-timed demolition can never
    // produce an empty/silhouette frame
    this.renderSticker(doc, element as HTMLDivElement);
  };
}
