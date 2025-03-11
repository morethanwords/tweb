/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../appManagers/appDocsManager';
import animationIntersector, {AnimationItemGroup} from '../../components/animationIntersector';
import LazyLoadQueue from '../../components/lazyLoadQueue';
import wrapSticker, {videosCache} from '../../components/wrappers/sticker';
import customProperties, {CustomProperty} from '../../helpers/dom/customProperties';
import findUpClassName from '../../helpers/dom/findUpClassName';
import getViewportSlice from '../../helpers/dom/getViewportSlice';
import replaceContent from '../../helpers/dom/replaceContent';
import framesCache from '../../helpers/framesCache';
import {MediaSize} from '../../helpers/mediaSize';
import mediaSizes from '../../helpers/mediaSizes';
import {Middleware, MiddlewareHelper, getMiddleware} from '../../helpers/middleware';
import noop from '../../helpers/noop';
import {DocumentAttribute} from '../../layer';
import wrapRichText from '../richTextProcessor/wrapRichText';
import RLottiePlayer, {applyColorOnContext, getLottiePixelRatio} from '../rlottie/rlottiePlayer';
import rootScope from '../rootScope';
import CustomEmojiElement, {CustomEmojiElements} from './element';
import assumeType from '../../helpers/assumeType';
import {IS_WEBM_SUPPORTED} from '../../environment/videoSupport';
import {observeResize, unobserveResize} from '../../components/resizeObserver';
import {PAID_REACTION_EMOJI_DOCID} from './constants';
import lottieLoader from '../rlottie/lottieLoader';

const globalLazyLoadQueue = new LazyLoadQueue();

export class CustomEmojiRendererElement extends HTMLElement {
  public static globalLazyLoadQueue: LazyLoadQueue = globalLazyLoadQueue;

  public canvas: HTMLCanvasElement;
  public context: CanvasRenderingContext2D;

  public playersSynced: Map<CustomEmojiElements, RLottiePlayer | HTMLVideoElement>;
  public textColored: Set<CustomEmojiElements>;
  public clearedElements: WeakSet<CustomEmojiElements>;
  public customEmojis: Parameters<typeof wrapRichText>[1]['customEmojis'];
  public lastPausedVideo: HTMLVideoElement;

  public lastRect: {width: number, height: number};
  public isDimensionsSet: boolean;

  public animationGroup: AnimationItemGroup;
  public size: MediaSize;

  public isSelectable: boolean;
  public isCanvasClean: boolean;

  public ignoreSettingDimensions: boolean;

  public forceRenderAfterSize: boolean;

  public middlewareHelper: MiddlewareHelper;

  public auto: boolean;
  public textColor: CustomProperty;

  public observeResizeElement: HTMLElement | false;

  constructor() {
    super();

    this.classList.add('custom-emoji-renderer');
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('custom-emoji-canvas');
    this.context = this.canvas.getContext('2d');
    this.append(this.canvas);

    this.playersSynced = new Map();
    this.textColored = new Set();
    this.clearedElements = new WeakSet();
    this.customEmojis = new Map();

    this.animationGroup = 'EMOJI';
    this.isCanvasClean = false;
  }

  private onResizeEntry = (entry: ResizeObserverEntry) => {
    this.setDimensionsFromRect(entry.contentRect);
  };

  public connectedCallback() {
    if(emojiRenderers.has(this)) {
      return;
    }

    // this.setDimensions();
    // animationIntersector.addAnimation(this, this.animationGroup);
    const observeElement = this.observeResizeElement ?? this.canvas;
    if(observeElement) {
      observeResize(observeElement, this.onResizeEntry);
    }
    emojiRenderers.add(this);

    this.connectedCallback = undefined;
  }

  public disconnectedCallback() {
    if(this.isConnected || !this.auto) {
      return;
    }

    this.destroy?.();

    this.disconnectedCallback = undefined;
  }

  public destroy() {
    // if(this.isConnected) {
    //   return;
    // }

    const observeElement = this.observeResizeElement ?? this.canvas;
    if(observeElement) {
      unobserveResize(observeElement);
    }

    this.customEmojis.forEach((elements) => {
      elements.forEach((element) => {
        element.clear();
      });
    });

    emojiRenderers.delete(this);
    this.playersSynced.clear();
    this.middlewareHelper?.clean();
    this.customEmojis.clear();
    this.textColored.clear();

    this.destroy =
      this.lastPausedVideo =
      undefined;
  }

  public getOffsets(offsetsMap: Map<CustomEmojiElements, {top: number, left: number, width: number}[]> = new Map()) {
    if(!this.playersSynced.size) {
      return offsetsMap;
    }

    const overflowElement = findUpClassName(this, 'scrollable') || this.offsetParent as HTMLElement;
    if(!overflowElement) {
      return offsetsMap;
    }

    const overflowRect = overflowElement.getBoundingClientRect();
    const rect = this.getBoundingClientRect();

    for(const elements of this.playersSynced.keys()) {
      const elementsArr = Array.from(elements);
      const placeholders = this.isSelectable ? elementsArr.map((element) => element.placeholder) : elementsArr;
      const {visible} = getViewportSlice({
        overflowElement,
        overflowRect,
        elements: placeholders,
        extraSize: this.size.height * 2.5 // let's add some margin
      });

      const offsets = visible.map(({rect: elementRect}) => {
        const top = elementRect.top - rect.top;
        const left = elementRect.left - rect.left;
        return {top, left, width: elementRect.width};
      });

      if(offsets.length) {
        offsetsMap.set(elements, offsets);
      }
    }

    // const rect = this.getBoundingClientRect();
    // const visibleRect = getVisibleRect(this, overflowElement, undefined, rect);
    // const minTop = visibleRect ? visibleRect.rect.top - this.size.height : 0;
    // const maxTop = Infinity;
    // for(const elements of this.playersSynced.keys()) {
    //   const offsets = elements.map((element) => {
    //     const elementRect = element.getBoundingClientRect();
    //     const top = elementRect.top - rect.top;
    //     const left = elementRect.left - rect.left;
    //     return top >= minTop && (top + elementRect.height) <= maxTop ? {top, left} : undefined;
    //   }).filter(Boolean);

    //   if(offsets.length) {
    //     offsetsMap.set(elements, offsets);
    //   }
    // }

    return offsetsMap;
  }

  public clearCanvas() {
    if(this.isCanvasClean) {
      return;
    }

    const {context, canvas} = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
    this.isCanvasClean = true;
  }

  public render(offsetsMap: ReturnType<CustomEmojiRendererElement['getOffsets']>) {
    const {context, canvas, isDimensionsSet} = this;
    if(!isDimensionsSet) {
      this.setDimensionsFromRect(undefined, false);
    }

    this.isCanvasClean = false;

    const {width, height, dpr} = canvas;
    for(const [elements, offsets] of offsetsMap) {
      const player = this.playersSynced.get(elements);
      const frame = syncedPlayersFrames.get(player) || (player instanceof HTMLVideoElement ? player : undefined);
      if(!frame) {
        continue;
      }

      const isImageData = frame instanceof ImageData;
      let frameWidth: number, frameHeight: number;
      if(player instanceof HTMLVideoElement) {
        frameWidth = this.size.width * dpr;
        frameHeight = this.size.height * dpr;
      } else {
        frameWidth = frame.width;
        frameHeight = frame.height;
      }

      // ! check performance of scaling
      const elementWidth = Math.round(offsets[0].width * dpr);
      if(elementWidth !== frameWidth) {
        // if(this.size.width === 36) {
        //   console.warn('different width', elementWidth, frameWidth, this);
        // }

        frameWidth = elementWidth;
        frameHeight = elementWidth;
      }

      const maxTop = height - frameHeight;
      const maxLeft = width - frameWidth;
      const color = this.textColored.has(elements) ? customProperties.getProperty(this.textColor) : undefined;

      if(!this.clearedElements.has(elements) && !this.isSelectable) {
        if(this.isSelectable/*  && false */) {
          elements.forEach((element) => {
            element.lastChildWas ??= element.lastChild;
            replaceContent(element, element.firstChild);
          });
        } else {
          elements.forEach((element) => {
            element.replaceChildren();
          });
        }

        this.clearedElements.add(elements);
      }

      offsets.forEach(({top, left}) => {
        top = Math.round(top * dpr), left = Math.round(left * dpr);
        if(left < 0 ||/* top > maxTop ||  */left > maxLeft) {
          return;
        }

        if(isImageData) {
          context.putImageData(frame, left, top);
        } else {
          // context.clearRect(left, top, width, height);
          context.drawImage(frame, left, top, frameWidth, frameHeight);
        }

        if(color) {
          applyColorOnContext(context, color, left, top, frameWidth, frameHeight);
        }
      });
    }
  }

  public checkForAnyFrame() {
    for(const player of this.playersSynced.values()) {
      if(syncedPlayersFrames.has(player) || player instanceof HTMLVideoElement) {
        return true;
      }
    }

    return false;
  }

  public remove() {
    super.remove();
    // this.canvas.remove();
  }

  // public setDimensions() {
  //   const {canvas} = this;
  //   sequentialDom.mutateElement(canvas, () => {
  //     const rect = canvas.getBoundingClientRect();
  //     this.setDimensionsFromRect(rect);
  //   });
  // }

  public setDimensionsFromRect(rect: {width: number, height: number} = this.lastRect, forceRenderAfter = true) {
    const {canvas} = this;
    const {dpr} = canvas;

    if(this.lastRect !== rect) {
      this.lastRect = rect;
    }

    if(!rect || !dpr || this.ignoreSettingDimensions) {
      return;
    }

    const {width, height} = rect;
    // if(this.isSelectable) {
    //   height = this.parentElement.scrollHeight || height;

    //   this.style.width = width + 'px';
    //   this.style.height = height + 'px';
    // }

    const newWidth = Math.floor(Math.round(width * dpr));
    const newHeight = Math.floor(Math.round(height * dpr));
    if(canvas.width === newWidth && canvas.height === newHeight) {
      return;
    }

    canvas.width = newWidth;
    canvas.height = newHeight;
    this.isDimensionsSet = true;
    this.isCanvasClean = true;

    if(this.observeResizeElement || this.observeResizeElement === false) {
      this.canvas.style.setProperty('width', width + 'px', 'important');
      this.canvas.style.setProperty('height', height + 'px', 'important');
    }

    if(this.forceRenderAfterSize || (this.isSelectable && forceRenderAfter)) {
      this.forceRenderAfterSize = undefined;
      this.forceRender();
    }
  }

  public forceRender() {
    if(!this.isDimensionsSet) {
      return;
    }

    if(!renderEmojis(new Set([this]))) {
      this.clearCanvas();
    }
  }

  private onElementCleanup = (element: CustomEmojiElement, syncedPlayer: SyncedPlayer, middleware: Middleware) => {
    element.clear(); // * it is correct

    syncedPlayer.middlewares.delete(middleware);

    // * still has some elements
    if(syncedPlayer.middlewares.size) {
      return;
    }

    if(syncedPlayer.player) {
      const frame = syncedPlayersFrames.get(syncedPlayer.player);
      if(frame) {
        (frame as ImageBitmap).close?.();
        syncedPlayersFrames.delete(syncedPlayer.player);
      }

      syncedPlayersFrames.delete(syncedPlayer.player);
      if(syncedPlayer.player instanceof RLottiePlayer) {
        syncedPlayer.player.overrideRender = noop;
        syncedPlayer.player.remove();
      } else if(syncedPlayer.player instanceof HTMLVideoElement) {
        const cacheName = framesCache.generateName('' + element.docId, 0, 0, undefined, undefined);
        delete videosCache[cacheName];
      }

      syncedPlayer.player = undefined;
    }

    if(
      syncedPlayers.get(syncedPlayer.key) === syncedPlayer &&
      syncedPlayers.delete(syncedPlayer.key) &&
      !syncedPlayers.size
    ) {
      clearRenderInterval();
    }
  };

  private async wrapPaidReactionEmoji(element: CustomEmojiElement): ReturnType<typeof wrapSticker> {
    const size = this.size;
    const player = await lottieLoader.loadAnimationAsAsset({
      container: element,
      width: size.width,
      height: size.height,
      loop: true,
      autoplay: CUSTOM_EMOJI_INSTANT_PLAY,
      sync: true
    }, 'StarReaction')

    return {
      width: size.width,
      height: size.height,
      downloaded: true,
      load: () => Promise.resolve(player),
      render: undefined as any
    }
  }

  private wrap({
    doc,
    isPaidReactionEmoji,
    addCustomEmojis,
    usingOwnQueue,
    lazyLoadQueue,
    onlyThumb,
    withThumb,
    loadPromises
  }: {
    doc: MyDocument,
    isPaidReactionEmoji?: boolean,
    addCustomEmojis: Parameters<typeof wrapRichText>[1]['customEmojis'],
    usingOwnQueue?: boolean,
    lazyLoadQueue?: LazyLoadQueue | false,
    onlyThumb?: boolean,
    withThumb?: boolean,
    loadPromises?: Promise<any>[]
  }) {
    const renderer = this;
    const size = this.size;
    const managers = rootScope.managers;
    const middleware = this.middlewareHelper.get();

    const docId = doc.id;
    const newElements = addCustomEmojis.get(docId);
    const customEmojis = renderer.customEmojis.get(docId);
    const newElementsArray = Array.from(newElements);
    const isLottie = doc.sticker === 2;
    const isStatic = newElementsArray[0].static || (doc.mime_type === 'video/webm' && !IS_WEBM_SUPPORTED);
    const willHaveSyncedPlayer = (isLottie || (doc.sticker === 3 && this.isSelectable)) && !onlyThumb && !isStatic;

    const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
    if(attribute && attribute.pFlags.text_color) {
      renderer.textColored.add(customEmojis);
    }

    const loadStickerMiddleware = willHaveSyncedPlayer ? middleware.create().get(() => {
      return !!syncedPlayer.middlewares.size;
    }) : undefined;

    const _loadPromises: Promise<any>[] = [];
    const promise = isPaidReactionEmoji ? this.wrapPaidReactionEmoji(newElementsArray[0]) : wrapSticker({
      div: newElementsArray,
      doc,
      width: size.width,
      height: size.height,
      loop: true,
      play: CUSTOM_EMOJI_INSTANT_PLAY,
      managers,
      isCustomEmoji: true,
      group: 'none',
      loadPromises: _loadPromises,
      middleware,
      exportLoad: usingOwnQueue || lazyLoadQueue === false ? 2 : 1, // 2 - export load always, 1 - do not export load if cached static
      needFadeIn: false,
      loadStickerMiddleware,
      static: isStatic,
      onlyThumb,
      withThumb: withThumb ?? (renderer.clearedElements.has(customEmojis) ? false : undefined),
      syncedVideo: this.isSelectable,
      textColor: renderer.textColor
    });

    if(loadPromises) {
      promise.then(() => loadPromises.push(..._loadPromises));
    }

    const addition: {
      onRender?: (_p: Awaited<Awaited<typeof promise>['render']>) => Promise<void>,
      elements: typeof newElements
    } = {
      elements: newElements
    };

    const readyPromise = newElementsArray[0].readyPromise;
    if(readyPromise) {
      promise.then(({render}) => {
        if(!render) {
          readyPromise.resolve();
          return;
        }

        render.then(
          () => readyPromise.resolve(),
          readyPromise.reject.bind(readyPromise)
        );
      });
    }

    if(doc.sticker === 1 || onlyThumb || isStatic) {
      if(this.isSelectable) {
        addition.onRender = () => Promise.all(_loadPromises).then(() => {
          if(!middleware()) return;
          newElementsArray.forEach((element) => {
            const {placeholder} = element;
            placeholder.src = (element.firstElementChild as HTMLImageElement).src;
          });
        });
      }

      return promise.then((res) => ({...res, ...addition}));
    }

    addition.onRender = (_p) => Promise.all(_loadPromises).then(() => {
      if(!middleware() || !doc.animated) {
        return;
      }

      const players = Array.isArray(_p) ? _p as HTMLVideoElement[] : [_p as RLottiePlayer];
      const player = Array.isArray(players) ? players[0] : players;
      assumeType<RLottiePlayer | HTMLVideoElement>(player);
      newElementsArray.forEach((element, idx) => {
        const player = players[idx] || players[0];
        element.player = player;

        if(syncedPlayer) {
          element.syncedPlayer = syncedPlayer;
          if(element.paused) {
            element.syncedPlayer.pausedElements.add(element);
          } else if(player.paused) {
            player.play();
          }
        }

        if(element.isConnected || middleware()) {
          animationIntersector.addAnimation({
            animation: element,
            group: element.renderer.animationGroup,
            observeElement: element.placeholder ?? element,
            controlled: true,
            type: 'emoji'
          });
        }
      });

      if(player instanceof RLottiePlayer || (player instanceof HTMLVideoElement && this.isSelectable)) {
        syncedPlayer.player = player;
        renderer.playersSynced.set(customEmojis, player);
      }

      if(player instanceof RLottiePlayer) {
        player.group = renderer.animationGroup;

        player.overrideRender ??= (frame) => {
          syncedPlayersFrames.set(player, frame);
          // frames.set(containers, frame);
        };
      } else if(player instanceof HTMLVideoElement) {
        // player.play();

        // const cache = framesCache.getCache(key);
        // let {width, height} = renderer.size;
        // width *= dpr;
        // height *= dpr;

        // const onFrame = (frame: ImageBitmap | HTMLCanvasElement) => {
        //   topFrames.set(player, frame);
        //   player.requestVideoFrameCallback(callback);
        // };

        // let frameNo = -1, lastTime = 0;
        // const callback: VideoFrameRequestCallback = (now, metadata) => {
        //   const time = player.currentTime;
        //   if(lastTime > time) {
        //     frameNo = -1;
        //   }

        //   const _frameNo = ++frameNo;
        //   lastTime = time;
        //   // const frameNo = Math.floor(player.currentTime * 1000 / CUSTOM_EMOJI_FRAME_INTERVAL);
        //   // const frameNo = metadata.presentedFrames;
        //   const imageBitmap = cache.framesNew.get(_frameNo);

        //   if(imageBitmap) {
        //     onFrame(imageBitmap);
        //   } else if(IS_IMAGE_BITMAP_SUPPORTED) {
        //     createImageBitmap(player, {resizeWidth: width, resizeHeight: height}).then((imageBitmap) => {
        //       cache.framesNew.set(_frameNo, imageBitmap);
        //       if(frameNo === _frameNo) onFrame(imageBitmap);
        //     });
        //   } else {
        //     const canvas = document.createElement('canvas');
        //     const context = canvas.getContext('2d');
        //     canvas.width = width;
        //     canvas.height = height;
        //     context.drawImage(player, 0, 0);
        //     cache.framesNew.set(_frameNo, canvas);
        //     onFrame(canvas);
        //   }
        // };

        // // player.requestVideoFrameCallback(callback);
        // // setInterval(callback, CUSTOM_EMOJI_FRAME_INTERVAL);
      }

      if(willHaveSyncedPlayer) {
        const dpr = getLottiePixelRatio(this.size.width, this.size.height);
        renderer.canvas.dpr = dpr;
        setRenderInterval();
      }
    });

    let syncedPlayer: SyncedPlayer;
    const key = [docId, size.width, size.height].join('-');
    if(willHaveSyncedPlayer) {
      syncedPlayer = syncedPlayers.get(key);
      if(!syncedPlayer) {
        syncedPlayer = {
          player: undefined,
          middlewares: new Set(),
          pausedElements: new Set(),
          key
        };

        syncedPlayers.set(key, syncedPlayer);
      }

      for(const element of newElements) {
        const middleware = element.middlewareHelper.get();
        syncedPlayer.middlewares.add(middleware);
        middleware.onClean(this.onElementCleanup.bind(this, element, syncedPlayer, middleware));
      }
    }

    return promise.then((res) => ({...res, ...addition}));
  }

  public add({
    addCustomEmojis,
    lazyLoadQueue,
    onlyThumb,
    withThumb
  }: {
    addCustomEmojis: Parameters<typeof wrapRichText>[1]['customEmojis'],
    lazyLoadQueue?: LazyLoadQueue | false,
    onlyThumb?: boolean,
    withThumb?: boolean
  }) {
    const renderer = this;
    const middleware = this.middlewareHelper.get();

    addCustomEmojis.forEach((addElements, docId) => { // prevent adding old elements
      let elements = this.customEmojis.get(docId);
      if(!elements) this.customEmojis.set(docId, elements = new Set());
      else this.clearedElements.delete(elements);

      for(const el of addElements) {
        if(elements.has(el)) {
          addElements.delete(el);
        } else {
          el.clean = false;
          el.renderer = renderer;
          el.elements = elements;
          el.middlewareHelper = middleware.create();
          elements.add(el);

          if(el.lastChildWas && !el.lastChildWas.parentNode) {
            el.append(el.lastChildWas);
          }
        }
      }

      if(!addElements.size) {
        addCustomEmojis.delete(docId);
      }
    });

    if(!addCustomEmojis.size) {
      return;
    }

    const usingOwnQueue = !!(!lazyLoadQueue && lazyLoadQueue !== false && globalLazyLoadQueue);
    const docIds = Array.from(addCustomEmojis.keys());
    const managers = rootScope.managers;

    const loadPromise = managers.appEmojiManager.getCachedCustomEmojiDocuments(docIds).then((docs) => {
      if(!middleware()) return;

      const wrapOptions: Omit<Parameters<CustomEmojiRendererElement['wrap']>[0], 'doc'> = {
        addCustomEmojis,
        usingOwnQueue,
        lazyLoadQueue,
        onlyThumb,
        withThumb
      };

      const loadPromises: Promise<any>[] = [];

      const missing: DocId[] = [];
      const cachedPromises = docs.map((doc, idx) => {
        if(!doc) {
          const docId = docIds[idx];
          if(docId === PAID_REACTION_EMOJI_DOCID) {
            return this.wrap({
              ...wrapOptions,
              doc: {
                _: 'document',
                id: docId,
                attributes: []
              } as MyDocument,
              isPaidReactionEmoji: true,
              loadPromises
            });
          }
          missing.push(docId);
          return;
        }

        return this.wrap({...wrapOptions, doc, loadPromises});
      }).filter(Boolean);

      const uncachedPromisesPromise = !missing.length ?
        Promise.resolve([] as typeof cachedPromises) :
        managers.appEmojiManager.getCustomEmojiDocuments(missing).then((docs) => {
          if(!middleware()) return [];
          return docs.filter(Boolean).map((doc) => this.wrap({...wrapOptions, doc}));
        });

      const loadFromPromises = async(_promises: typeof cachedPromises) => {
        const arr = await Promise.all(_promises);
        const promises = arr.map(({load, onRender, elements}) => {
          if(!load) {
            return;
          }

          const l = () => load().then(onRender);

          if(!usingOwnQueue) {
            return l();
          }

          elements.forEach((element) => {
            globalLazyLoadQueue.push({
              div: element,
              load: () => {
                elements.forEach((element) => {
                  globalLazyLoadQueue.delete({div: element});
                });

                return l();
              }
            });
          });
        });

        return Promise.all(promises.filter(Boolean));
      };

      const load = () => {
        if(!middleware()) return;
        const cached = loadFromPromises(cachedPromises);
        const uncached = uncachedPromisesPromise.then((promises) => loadFromPromises(promises));
        return Promise.all([cached, uncached]);
      };

      if(lazyLoadQueue) {
        lazyLoadQueue.push({
          div: renderer.canvas,
          load
        });
      } else {
        load();
      }

      return Promise.all(cachedPromises).then(() => Promise.all(loadPromises)).then(() => {});
    });

    // recordPromise(loadPromise, 'render emojis: ' + docIds.length);

    return loadPromise;
  }

  public setTextColor(textColor: string) {
    this.textColor = textColor;
  }

  public static create(options: CustomEmojiRendererElementOptions) {
    const renderer = new CustomEmojiRendererElement();
    renderer.animationGroup = options.animationGroup;
    renderer.size = options.customEmojiSize || mediaSizes.active.customEmoji;
    renderer.isSelectable = options.isSelectable;
    renderer.textColor = options.textColor;
    // renderer.textColor = typeof(options.textColor) === 'function' ? options.textColor() : options.textColor;
    renderer.observeResizeElement = options.observeResizeElement;
    if(options.wrappingDraft) {
      renderer.contentEditable = 'false';
      renderer.style.height = 'inherit';
    }
    // const middleware = () => !!renderer.disconnectedCallback && (!options.middleware || options.middleware());
    const middleware = options.middleware;
    if(middleware) {
      renderer.middlewareHelper = middleware.create();
      renderer.middlewareHelper.get().onDestroy(() => {
        renderer.destroy?.();
      });
    } else {
      // console.error('no middleware', this, options);
      renderer.auto = true;
      renderer.middlewareHelper = getMiddleware();
    }

    return renderer;
  }
}

export type CustomEmojiRenderer = CustomEmojiRendererElement;
export type SyncedPlayer = {
  player: RLottiePlayer | HTMLVideoElement,
  middlewares: Set<Middleware>,
  pausedElements: Set<CustomEmojiElement>,
  key: string
};
export type CustomEmojiFrame = Parameters<RLottiePlayer['overrideRender']>[0] | HTMLVideoElement;

export type CustomEmojiRendererElementOptions = Partial<{
  loadPromises: Promise<any>[],
  customEmojiRenderer: CustomEmojiRendererElement,

  isSelectable: boolean,
  wrappingDraft: boolean,

  observeResizeElement?: HTMLElement | false
}> & WrapSomethingOptions;

const CUSTOM_EMOJI_INSTANT_PLAY = true; // do not wait for animationIntersector
let emojiRenderInterval: number;
const emojiRenderers: Set<CustomEmojiRenderer> = new Set();
const syncedPlayers: Map<string, SyncedPlayer> = new Map();
const syncedPlayersFrames: Map<RLottiePlayer | HTMLVideoElement, CustomEmojiFrame> = new Map();
export const renderEmojis = (renderers = emojiRenderers) => {
  const r = Array.from(renderers);
  const t = r.filter((r) => r.isConnected && r.checkForAnyFrame() && !r.ignoreSettingDimensions);
  if(!t.length) {
    return false;
  }

  const o = t.map((renderer) => {
    const paused = [...renderer.playersSynced.values()].reduce((acc, v) => acc + +!!v.paused, 0);
    if(renderer.playersSynced.size === paused) {
      return;
    }

    const offsets = renderer.getOffsets();
    if(offsets.size) {
      return [renderer, offsets] as const;
    }
  }).filter(Boolean);

  for(const [renderer] of o) {
    renderer.clearCanvas();
  }

  for(const [renderer, offsets] of o) {
    renderer.render(offsets);
  }

  return true;
};
const CUSTOM_EMOJI_FPS = 60;
const CUSTOM_EMOJI_FRAME_INTERVAL = 1000 / CUSTOM_EMOJI_FPS;
const setRenderInterval = () => {
  if(emojiRenderInterval) {
    return;
  }

  emojiRenderInterval = window.setInterval(renderEmojis, CUSTOM_EMOJI_FRAME_INTERVAL);
  renderEmojis();
};
const clearRenderInterval = () => {
  if(!emojiRenderInterval) {
    return;
  }

  clearInterval(emojiRenderInterval);
  emojiRenderInterval = undefined;
};

(window as any).syncedPlayers = syncedPlayers;
(window as any).emojiRenderers = emojiRenderers;

customElements.define('custom-emoji-renderer-element', CustomEmojiRendererElement);
