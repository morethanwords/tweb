/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {EMOJI_VERSION} from '../../environment/emojiVersionsSupport';
import {SITE_HASHTAGS} from '.';
import {EmojiVersions} from '../../config/emoji';
import IS_EMOJI_SUPPORTED from '../../environment/emojiSupport';
import buildURLHash from '../../helpers/buildURLHash';
import copy from '../../helpers/object/copy';
import encodeEntities from '../../helpers/string/encodeEntities';
import {DocumentAttribute, MessageEntity} from '../../layer';
import encodeSpoiler from './encodeSpoiler';
import parseEntities from './parseEntities';
import setBlankToAnchor from './setBlankToAnchor';
import wrapUrl from './wrapUrl';
import EMOJI_VERSIONS_SUPPORTED from '../../environment/emojiVersionsSupport';
import {CLICK_EVENT_NAME} from '../../helpers/dom/clickEvent';
import IS_CUSTOM_EMOJI_SUPPORTED from '../../environment/customEmojiSupport';
import rootScope from '../rootScope';
import mediaSizes from '../../helpers/mediaSizes';
import wrapSticker, {videosCache} from '../../components/wrappers/sticker';
import RLottiePlayer, {RLottieColor, applyColorOnContext, getLottiePixelRatio} from '../rlottie/rlottiePlayer';
import animationIntersector, {AnimationItemGroup} from '../../components/animationIntersector';
import type {MyDocument} from '../appManagers/appDocsManager';
import LazyLoadQueue from '../../components/lazyLoadQueue';
import {Awaited} from '../../types';
import {MediaSize} from '../../helpers/mediaSize';
import IS_WEBM_SUPPORTED from '../../environment/webmSupport';
import assumeType from '../../helpers/assumeType';
import noop from '../../helpers/noop';
import findUpClassName from '../../helpers/dom/findUpClassName';
import getViewportSlice from '../../helpers/dom/getViewportSlice';
import {getMiddleware, Middleware, MiddlewareHelper} from '../../helpers/middleware';
import replaceContent from '../../helpers/dom/replaceContent';
import BOM from '../../helpers/string/bom';
import framesCache from '../../helpers/framesCache';
import wrapTelegramUrlToAnchor from './wrapTelegramUrlToAnchor';
import {IS_FIREFOX} from '../../environment/userAgent';
import customProperties, {CustomProperty} from '../../helpers/dom/customProperties';

const resizeObserver = new ResizeObserver((entries) => {
  for(const entry of entries) {
    const renderer = entry.target.parentElement as CustomEmojiRendererElement;
    renderer.setDimensionsFromRect(entry.contentRect);
  }
});

const globalLazyLoadQueue = new LazyLoadQueue();

export class CustomEmojiElement extends HTMLElement {
  public elements: CustomEmojiElements;
  public renderer: CustomEmojiRendererElement;
  public player: RLottiePlayer | HTMLVideoElement;
  public paused: boolean;
  public syncedPlayer: SyncedPlayer;
  public clean: boolean;
  public lastChildWas: Node;
  // public docId: DocId;
  public placeholder: HTMLImageElement;
  public middlewareHelper: MiddlewareHelper;

  constructor() {
    super();
    this.paused = true;
    this.classList.add('custom-emoji');
  }

  public get docId() {
    return this.dataset.docId;
  }

  public static create(docId: DocId) {
    const element = new CustomEmojiElement();
    // element.docId = docId;
    element.dataset.docId = '' + docId;
    return element;
  }

  public get isConnected() {
    return this.placeholder?.isConnected ?? super.isConnected;
  }

  public connectedCallback() {
    // if(this.isConnected) {
    //   return;
    // }

    if(this.player) {
      animationIntersector.addAnimation({
        animation: this,
        group: this.renderer.animationGroup,
        controlled: true
      });
    }

    // this.connectedCallback = undefined;
  }

  public disconnectedCallback() {
    if(this.isConnected || !this.renderer?.isSelectable) { // prepend on sibling can invoke disconnectedCallback
      return;
    }

    this.clear();
  }

  public destroy() {
    this.clear();
  }

  public clear(replaceChildren = true) {
    if(this.clean) {
      return;
    }

    // if(this.docId === '5399836826758290421') {
    //   console.log('clear', this, this.isConnected);
    // }

    this.clean = true;
    this.pause();

    const {syncedPlayer} = this;
    if(syncedPlayer) {
      syncedPlayer.pausedElements.delete(this);
    }

    this.middlewareHelper?.clean();

    if(this.renderer) {
      const elements = this.renderer.customEmojis.get(this.docId);
      if(elements?.delete(this) && !elements.size) {
        this.renderer.customEmojis.delete(this.docId);
        this.renderer.textColored.delete(elements);
        this.renderer.playersSynced.delete(elements);
      }

      if(replaceChildren) {
        if(this.renderer.isSelectable) {
          this.replaceChildren(createCustomFiller(true));
        } else {
          // otherwise https://bugs.chromium.org/p/chromium/issues/detail?id=1144736#c27 will happen
          this.replaceChildren();
        }
      }
    }

    if(this.player) {
      animationIntersector.removeAnimationByPlayer(this);
    }

    if(globalLazyLoadQueue) {
      globalLazyLoadQueue.delete({div: this});
    }

    /* this.disconnectedCallback =  */this.elements =
      this.renderer =
      this.player =
      this.syncedPlayer =
      undefined;
  }

  public pause() {
    if(this.paused) {
      return;
    }

    this.paused = true;

    if(this.player instanceof HTMLVideoElement && !this.syncedPlayer) {
      this.renderer.lastPausedVideo = this.player;
      this.player.pause();
    }

    if(this.syncedPlayer && !this.syncedPlayer.pausedElements.has(this)) {
      this.syncedPlayer.pausedElements.add(this);

      if(this.syncedPlayer.player && this.syncedPlayer.pausedElements.size === this.syncedPlayer.middlewares.size) {
        this.syncedPlayer.player.pause();
      }
    }
  }

  public play() {
    if(!this.paused) {
      return;
    }

    this.paused = false;

    if(this.player instanceof HTMLVideoElement) {
      this.player.currentTime = this.renderer.lastPausedVideo?.currentTime ?? this.player.currentTime;
      this.player.play().catch(noop);
    }

    if(this.syncedPlayer && this.syncedPlayer.pausedElements.has(this)) {
      this.syncedPlayer.pausedElements.delete(this);

      if(this.syncedPlayer.pausedElements.size !== this.syncedPlayer.middlewares.size) {
        this.player.play();
      }
    }
  }

  public remove() {
    this.clear();
    // this.elements = this.renderer = this.player = undefined;
  }

  public get autoplay() {
    return true;
  }

  public get loop() {
    return true;
  }
}

type CustomEmojiElements = Set<CustomEmojiElement>;

export class CustomEmojiRendererElement extends HTMLElement {
  public canvas: HTMLCanvasElement;
  public context: CanvasRenderingContext2D;

  public playersSynced: Map<CustomEmojiElements, RLottiePlayer | HTMLVideoElement>;
  public textColored: Set<CustomEmojiElements>;
  public clearedElements: WeakSet<CustomEmojiElements>;
  public customEmojis: Parameters<typeof wrapRichText>[1]['customEmojis'];
  public lastPausedVideo: HTMLVideoElement;

  public lastRect: DOMRect;
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

  public connectedCallback() {
    if(emojiRenderers.has(this)) {
      return;
    }

    // this.setDimensions();
    // animationIntersector.addAnimation(this, this.animationGroup);
    resizeObserver.observe(this.canvas);
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

    resizeObserver.unobserve(this.canvas);

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

  public setDimensionsFromRect(rect: DOMRect = this.lastRect, forceRenderAfter = true) {
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

  public add(
    addCustomEmojis: Parameters<typeof wrapRichText>[1]['customEmojis'],
    lazyLoadQueue?: LazyLoadQueue | false,
    onlyThumb?: boolean,
    withThumb?: boolean
  ) {
    const renderer = this;

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
          el.middlewareHelper = this.middlewareHelper.get().create();
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
    const middleware = this.middlewareHelper.get();
    const size = this.size;

    const loadPromise = managers.appEmojiManager.getCachedCustomEmojiDocuments(docIds).then((docs) => {
      if(middleware && !middleware()) return;

      const loadPromises: Promise<any>[] = [];
      const wrap = (doc: MyDocument, _loadPromises?: Promise<any>[]) => {
        const docId = doc.id;
        const newElements = addCustomEmojis.get(docId);
        const customEmojis = renderer.customEmojis.get(docId);
        const isLottie = doc.sticker === 2;
        const isStatic = doc.mime_type === 'video/webm' && !IS_WEBM_SUPPORTED;
        const willHaveSyncedPlayer = (isLottie || (doc.sticker === 3 && this.isSelectable)) && !onlyThumb && !isStatic;

        const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
        if(attribute) {
          if(attribute.pFlags.text_color) {
            renderer.textColored.add(customEmojis);
          }
        }

        const loadPromises: Promise<any>[] = [];
        const newElementsArray = Array.from(newElements);
        const promise = wrapSticker({
          div: newElementsArray,
          doc,
          width: size.width,
          height: size.height,
          loop: true,
          play: CUSTOM_EMOJI_INSTANT_PLAY,
          managers,
          isCustomEmoji: true,
          group: 'none',
          loadPromises,
          middleware,
          exportLoad: usingOwnQueue || lazyLoadQueue === false ? 2 : 1, // 2 - export load always, 1 - do not export load if cached static
          needFadeIn: false,
          loadStickerMiddleware: willHaveSyncedPlayer && middleware ? middleware.create().get(() => {
            // if(syncedPlayers.get(key) !== syncedPlayer) {
            //   return false;
            // }

            // let good = false;
            // for(const middleware of syncedPlayer.middlewares) {
            //   if(middleware()) {
            //     good = true;
            //     break;
            //   }
            // }

            // return good;
            return !!syncedPlayer.middlewares.size;
          }) : undefined,
          static: isStatic,
          onlyThumb,
          withThumb: withThumb ?? (renderer.clearedElements.has(customEmojis) ? false : undefined),
          syncedVideo: this.isSelectable,
          textColor: renderer.textColor
        });

        if(_loadPromises) {
          promise.then(() => _loadPromises.push(...loadPromises));
        }

        const addition: {
          onRender?: (_p: Awaited<Awaited<typeof promise>['render']>) => Promise<void>,
          elements: typeof newElements
        } = {
          elements: newElements
        };

        if(doc.sticker === 1 || onlyThumb || isStatic) {
          if(this.isSelectable) {
            addition.onRender = () => Promise.all(loadPromises).then(() => {
              if(middleware && !middleware()) return;
              newElementsArray.forEach((element) => {
                const {placeholder} = element;
                placeholder.src = (element.firstElementChild as HTMLImageElement).src;
              });
            });
          }

          return promise.then((res) => ({...res, ...addition}));
        }

        // eslint-disable-next-line prefer-const
        addition.onRender = (_p) => Promise.all(loadPromises).then(() => {
          if((middleware && !middleware()) || !doc.animated) {
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

            if(element.isConnected) {
              animationIntersector.addAnimation({
                animation: element,
                group: element.renderer.animationGroup,
                controlled: true
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
            middleware.onClean(() => {
              element.clear(); // * it is correct

              syncedPlayer.middlewares.delete(middleware);

              if(!syncedPlayer.middlewares.size) {
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

                if(syncedPlayers.get(syncedPlayer.key) === syncedPlayer && syncedPlayers.delete(syncedPlayer.key) && !syncedPlayers.size) {
                  clearRenderInterval();
                }
              }
            });
          }
        }

        return promise.then((res) => ({...res, ...addition}));
      };

      const missing: DocId[] = [];
      const cachedPromises = docs.map((doc, idx) => {
        if(!doc) {
          missing.push(docIds[idx]);
          return;
        }

        return wrap(doc, loadPromises);
      }).filter(Boolean);

      const uncachedPromisesPromise = !missing.length ?
        Promise.resolve([] as typeof cachedPromises) :
        managers.appEmojiManager.getCustomEmojiDocuments(missing).then((docs) => {
          if(middleware && !middleware()) return [];
          return docs.filter(Boolean).map((doc) => wrap(doc));
        });

      const loadFromPromises = (promises: typeof cachedPromises) => {
        return Promise.all(promises).then((arr) => {
          const promises = arr.map(({load, onRender, elements}) => {
            if(!load) {
              return;
            }

            const l = () => load().then(onRender);

            if(usingOwnQueue) {
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
            } else {
              return l();
            }
          });

          return Promise.all(promises);
        });
      };

      const load = () => {
        if(middleware && !middleware()) return;
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

  public static create(options: CustomEmojiRendererElementOptions) {
    const renderer = new CustomEmojiRendererElement();
    renderer.animationGroup = options.animationGroup;
    renderer.size = options.customEmojiSize || mediaSizes.active.customEmoji;
    renderer.isSelectable = options.isSelectable;
    renderer.textColor = options.textColor;
    if(options.wrappingDraft) {
      renderer.contentEditable = 'false';
      renderer.style.height = 'inherit';
    }
    // const middleware = () => !!renderer.disconnectedCallback && (!options.middleware || options.middleware());
    let middleware = options.middleware;
    if(middleware) {
      renderer.middlewareHelper = middleware.create();
      middleware = renderer.middlewareHelper.get();
      middleware.onDestroy(() => {
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

type CustomEmojiRenderer = CustomEmojiRendererElement;
type SyncedPlayer = {
  player: RLottiePlayer | HTMLVideoElement,
  middlewares: Set<Middleware>,
  pausedElements: Set<CustomEmojiElement>,
  key: string
};
type CustomEmojiFrame = Parameters<RLottiePlayer['overrideRender']>[0] | HTMLVideoElement;

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

customElements.define('custom-emoji-element', CustomEmojiElement);
customElements.define('custom-emoji-renderer-element', CustomEmojiRendererElement);

type CustomEmojiRendererElementOptions = Partial<{
  loadPromises: Promise<any>[],
  customEmojiRenderer: CustomEmojiRendererElement,

  isSelectable: boolean,
  wrappingDraft: boolean,

  textColor?: CustomProperty
}> & WrapSomethingOptions;

export type WrapRichTextOptions = Partial<{
  entities: MessageEntity[],
  contextSite: string,
  highlightUsername: string,
  noLinks: boolean,
  noLinebreaks: boolean,
  noCommands: boolean,
  wrappingDraft: boolean,
  // mustWrapEmoji: boolean,
  fromBot: boolean,
  noTextFormat: boolean,
  passEntities: Partial<{
    [_ in MessageEntity['_']]: boolean
  }>,
  maxMediaTimestamp: number,
  noEncoding: boolean,
  isSelectable: boolean,
  whitelistedDomains?: string[],

  contextHashtag?: string,

  // ! recursive, do not provide
  nasty?: {
    i: number,
    usedLength: number,
    text: string,
    lastEntity?: MessageEntity
  },
  voodoo?: boolean,
  customEmojis?: Map<DocId, CustomEmojiElements>,
  customWraps?: Set<HTMLElement>,
}> & CustomEmojiRendererElementOptions;

/**
 * * Expecting correctly sorted nested entities (RichTextProcessor.sortEntities)
 */
export default function wrapRichText(text: string, options: WrapRichTextOptions = {}) {
  const fragment = document.createDocumentFragment();
  if(!text) {
    return fragment;
  }

  const nasty = options.nasty ??= {
    i: 0,
    usedLength: 0,
    text
  };

  const wrapSomething = (wrapElement: HTMLElement, noFiller?: boolean) => {
    const element = document.createElement('span');
    // element.append(BOM, a, BOM);
    if(options.wrappingDraft) {
      element.contentEditable = 'false';
    }
    // element.style.display = 'inline-block';
    element.classList.add('input-something');
    element.append(/* BOM,  */wrapElement);

    (lastElement || fragment).append(element);

    wrapElement.classList.add('input-selectable');
    // if(wrapElement instanceof HTMLImageElement) {
    //   element.prepend(f());
    // } else {
    !noFiller && wrapElement.append(createCustomFiller(true));
    // }

    customWraps.add(element);

    return element;
  };

  options.isSelectable ||= options.wrappingDraft;

  const customEmojis = options.customEmojis ??= new Map() as Map<DocId, CustomEmojiElements>;
  const customWraps = options.customWraps ??= new Set();

  const entities = options.entities ??= parseEntities(nasty.text);

  const passEntities = options.passEntities ??= {};
  const contextSite = options.contextSite ??= 'Telegram';
  const contextExternal = contextSite !== 'Telegram';

  const textLength = nasty.text.length;
  const length = entities.length;
  let lastElement: HTMLElement | DocumentFragment;
  for(; nasty.i < length; ++nasty.i) {
    let entity = entities[nasty.i];

    // * check whether text was sliced
    // TODO: consider about moving it to other function
    if(entity.offset >= textLength) {
      if(entity._ !== 'messageEntityCaret') { // * can set caret to the end
        continue;
      }
    } else if((entity.offset + entity.length) > textLength) {
      entity = copy(entity);
      // entity.length = entity.offset + entity.length - textLength;
      entity.length = textLength - entity.offset;
    }

    if(entity.length) {
      nasty.lastEntity = entity;
    }

    let nextEntity = entities[nasty.i + 1];

    const startOffset = entity.offset;
    const endOffset = startOffset + entity.length;
    const endPartOffset = Math.min(endOffset, nextEntity?.offset ?? 0xFFFF);
    const fullEntityText = nasty.text.slice(startOffset, endOffset);
    const sliced = nasty.text.slice(startOffset, endPartOffset);
    let partText = sliced;

    if(nasty.usedLength < startOffset) {
      (lastElement || fragment).append(nasty.text.slice(nasty.usedLength, startOffset));
    }

    if(lastElement) {
      lastElement = fragment;
    }

    nasty.usedLength = endPartOffset;

    let element: HTMLElement,
      property: 'textContent' | 'alt' = 'textContent',
      usedText = false;
    switch(entity._) {
      case 'messageEntityBold': {
        if(!options.noTextFormat) {
          if(options.wrappingDraft) {
            element = document.createElement('span');
            // element.style.fontWeight = 'bold';
            element.style.fontFamily = 'markup-bold';
          } else {
            element = document.createElement('strong');
          }
        }

        break;
      }

      case 'messageEntityItalic': {
        if(!options.noTextFormat) {
          if(options.wrappingDraft) {
            element = document.createElement('span');
            // element.style.fontStyle = 'italic';
            element.style.fontFamily = 'markup-italic';
          } else {
            element = document.createElement('em');
          }
        }

        break;
      }

      case 'messageEntityStrike': {
        if(options.wrappingDraft) {
          element = document.createElement('span');
          // const styleName = IS_SAFARI ? 'text-decoration' : 'text-decoration-line';
          // element.style.cssText = `${styleName}: line-through;`;
          element.style.fontFamily = 'markup-strikethrough';
        } else/*  if(!options.noTextFormat) */ {
          element = document.createElement('del');
        }

        break;
      }

      case 'messageEntityUnderline': {
        if(options.wrappingDraft) {
          element = document.createElement('span');
          // const styleName = IS_SAFARI ? 'text-decoration' : 'text-decoration-line';
          // element.style.cssText = `${styleName}: underline;`;
          element.style.fontFamily = 'markup-underline';
        } else if(!options.noTextFormat) {
          element = document.createElement('u');
        }

        break;
      }

      case 'messageEntityPre':
      case 'messageEntityCode': {
        if(options.wrappingDraft) {
          element = document.createElement('span');
          // element.style.fontFamily = 'var(--font-monospace)';
          element.style.fontFamily = 'markup-monospace';
        } else if(!options.noTextFormat) {
          element = document.createElement('code');
        }

        break;
      }

      // case 'messageEntityPre': {
      //   if(options.wrappingDraft) {
      //     element = document.createElement('span');
      //     element.style.fontFamily = 'var(--font-monospace)';
      //   } else if(!options.noTextFormat) {
      //     element = document.createElement('pre');
      //     const inner = document.createElement('code');
      //     if(entity.language) {
      //       inner.className = 'language-' + entity.language;
      //       inner.textContent = entityText;
      //       usedText = true;
      //     }
      //   }

      //   break;
      // }

      case 'messageEntityHighlight': {
        element = document.createElement('i');
        element.className = 'text-highlight';
        break;
      }

      case 'messageEntityBotCommand': {
        // if(!(options.noLinks || options.noCommands || contextExternal)/*  && !entity.unsafe */) {
        if(!options.noLinks && passEntities[entity._]) {
          let command = fullEntityText.slice(1);
          let bot: string | boolean;
          let atPos: number;
          if((atPos = command.indexOf('@')) !== -1) {
            bot = command.slice(atPos + 1);
            command = command.slice(0, atPos);
          } else {
            bot = options.fromBot;
          }

          element = document.createElement('a');
          (element as HTMLAnchorElement).href = encodeEntities('tg://bot_command?command=' + encodeURIComponent(command) + (bot ? '&bot=' + encodeURIComponent(bot) : ''));
          if(!contextExternal) {
            element.setAttribute('onclick', 'execBotCommand(this)');
          }
        }

        break;
      }

      case 'messageEntityCustomEmoji': {
        if(!IS_CUSTOM_EMOJI_SUPPORTED) {
          break;
        }

        while(nextEntity?._ === 'messageEntityEmoji' && nextEntity.offset < endOffset) {
          ++nasty.i;
          nasty.lastEntity = nextEntity;
          nasty.usedLength += nextEntity.length;
          nextEntity = entities[nasty.i + 1];
        }

        const customEmojiElement = element = CustomEmojiElement.create(entity.document_id);
        const {docId} = customEmojiElement;
        let set = customEmojis.get(docId);
        if(!set) customEmojis.set(docId, set = new Set());
        set.add(customEmojiElement);
        customEmojiElement.dataset.stickerEmoji = fullEntityText;

        if(options.wrappingDraft) {
          element = document.createElement('img');
          (element as HTMLImageElement).alt = fullEntityText;
          for(const i in customEmojiElement.dataset) {
            element.dataset[i] = customEmojiElement.dataset[i];
          }
          (element as any).customEmojiElement = customEmojiElement;
          customEmojiElement.placeholder = element as HTMLImageElement;
          element.classList.add('custom-emoji-placeholder');
          (element as HTMLImageElement).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAAtJREFUGFdjYAACAAAFAAGq1chRAAAAAElFTkSuQmCC';
          property = 'alt';
          break;
        }

        if(options.isSelectable) {
          // const s = document.createElement('span');
          // s.append(fullEntityText);
          // element.append(s);
          // element.textContent = fullEntityText;
          // element.textContent = 'a';
          // element.contentEditable = 'false';

          // const x = f();
          // x.style.display = 'inline-block';
          // x.contentEditable = 'false';
          // (lastElement || fragment).append(BOM);
          // (lastElement || fragment).append(x);

          element = wrapSomething(element, !!options.customEmojiRenderer);

          // const a = element;
          // element = document.createElement('span');
          // element.append(BOM, a, BOM);
          // element.contentEditable = 'false';
        }

        property = 'alt';
        break;
      }

      case 'messageEntityEmoji': {
        let isSupported = IS_EMOJI_SUPPORTED;
        if(isSupported) {
          for(const version in EmojiVersions) {
            if(version) {
              const emojiData = EmojiVersions[version as EMOJI_VERSION];
              if(emojiData.hasOwnProperty(entity.unicode) && !EMOJI_VERSIONS_SUPPORTED[version as EMOJI_VERSION]) {
                isSupported = false;
                break;
              }
            }
          }
        }

        // if(!(options.wrappingDraft && isSupported)) { // * fix safari emoji
        if(!isSupported) { // no wrapping needed
          // if(isSupported) { // ! contenteditable="false" нужен для поля ввода, иначе там будет меняться шрифт в Safari, или же рендерить смайлик напрямую, без контейнера
          //   insertPart(entity, '<span class="emoji">', '</span>');
          // } else {
          element = document.createElement('img');
          (element as HTMLImageElement).src = `assets/img/emoji/${entity.unicode}.png`;
          property = 'alt';
          element.className = 'emoji';

          // if(options.isSelectable) {
          //   usedText = true;
          //   (element as HTMLImageElement).alt = partText;
          //   element = wrapSomething(element);
          // }

          // const a = element;
          // a.contentEditable = 'false';
          // element = document.createElement('span');
          // element.append(a);
          // element.contentEditable = 'false';
          // }
        // } else if(options.mustWrapEmoji) {
        } else if(!options.wrappingDraft) {
          element = document.createElement('span');
          element.className = 'emoji';
        }/*  else if(!IS_SAFARI) {
          insertPart(entity, '<span class="emoji" contenteditable="false">', '</span>');
        } */
        /* if(!isSupported) {
          insertPart(entity, `<img src="assets/img/emoji/${entity.unicode}.png" alt="`, `" class="emoji">`);
        } */

        break;
      }

      case 'messageEntityCaret': {
        element = document.createElement('span');
        element.className = 'composer-sel';
        break;
      }

      case 'messageEntityLinebreak': {
        if(options.wrappingDraft && IS_FIREFOX) {
          element = document.createElement('br');
          usedText = true;
        }
        // if(options.noLinebreaks) {
        //   insertPart(entity, ' ');
        // } else {
        //   insertPart(entity, '<br/>');
        // }

        break;
      }

      case 'messageEntityUrl':
      case 'messageEntityTextUrl': {
        if(!(options.noLinks && !passEntities[entity._])) {
          // let inner: string;
          let url: string = (entity as MessageEntity.messageEntityTextUrl).url || fullEntityText;
          let masked = false;
          let onclick: string;

          const wrapped = wrapUrl(url, true);
          url = wrapped.url;
          onclick = wrapped.onclick;

          if(options.whitelistedDomains) {
            try {
              const hostname = new URL(url).hostname;
              if(!options.whitelistedDomains.includes(hostname)) {
                break;
              }
            } catch(err) {
              break;
            }
          }

          if(entity._ === 'messageEntityTextUrl') {
            if(nextEntity?._ === 'messageEntityUrl' &&
              nextEntity.length === entity.length &&
              nextEntity.offset === entity.offset) {
              nasty.lastEntity = nextEntity;
              ++nasty.i;
            }

            if(url !== fullEntityText) {
              masked = true;
            }
          } else {
            // inner = encodeEntities(replaceUrlEncodings(entityText));
          }

          const currentContext = !!onclick;
          if(!onclick && masked && !currentContext) {
            onclick = 'showMaskedAlert';
          }

          if(options.wrappingDraft) {
            onclick = undefined;
          }

          const href = (currentContext || typeof electronHelpers === 'undefined') ?
            url :
            `javascript:electronHelpers.openExternal('${url}');`;

          element = document.createElement('a');
          element.className = 'anchor-url';
          (element as HTMLAnchorElement).href = href;

          if(!(currentContext || typeof electronHelpers !== 'undefined')) {
            setBlankToAnchor(element as HTMLAnchorElement);
          }

          if(onclick) {
            element.setAttribute('onclick', onclick + '(this)');
          }
        }

        break;
      }

      case 'messageEntityEmail': {
        if(!options.noLinks) {
          element = document.createElement('a');
          (element as HTMLAnchorElement).href = encodeEntities('mailto:' + fullEntityText);
          setBlankToAnchor(element as HTMLAnchorElement);
        }

        break;
      }

      case 'messageEntityHashtag': {
        const contextUrl = !options.noLinks && SITE_HASHTAGS[contextSite];
        if(contextUrl) {
          const hashtag = fullEntityText.slice(1);
          element = document.createElement('a');
          element.className = 'anchor-hashtag';
          (element as HTMLAnchorElement).href = contextUrl.replace('{1}', encodeURIComponent(hashtag));
          if(contextExternal) {
            setBlankToAnchor(element as HTMLAnchorElement);
          } else {
            element.setAttribute('onclick', 'searchByHashtag(this)');
          }
        }

        break;
      }

      case 'messageEntityMentionName': {
        if(!(options.noLinks && !passEntities[entity._])) {
          element = document.createElement('a');
          (element as HTMLAnchorElement).href = buildURLHash('' + entity.user_id);
          element.className = 'follow';
          element.dataset.follow = '' + entity.user_id;
        }

        break;
      }

      case 'messageEntityMention': {
        // const contextUrl = !options.noLinks && siteMentions[contextSite];
        if(!options.noLinks) {
          const username = fullEntityText.slice(1);

          element = wrapTelegramUrlToAnchor('t.me/' + username);
          element.className = 'mention';

          // insertPart(entity, `<a class="mention" href="${contextUrl.replace('{1}', encodeURIComponent(username))}"${contextExternal ? ' target="_blank" rel="noopener noreferrer"' : ''}>`, '</a>');
        }

        break;
      }

      case 'messageEntitySpoiler': {
        if(options.noTextFormat) {
          const encoded = encodeSpoiler(nasty.text, entity);
          nasty.text = encoded.text;
          partText = encoded.entityText;
          if(endPartOffset !== endOffset) {
            nasty.usedLength += endOffset - endPartOffset;
          }
          let n: MessageEntity;
          for(; n = entities[nasty.i + 1], n && n.offset < endOffset;) {
            // nasty.usedLength += n.length;
            ++nasty.i;
            nasty.lastEntity = n;
            nextEntity = entities[nasty.i + 1];
          }
        } else if(options.wrappingDraft) {
          element = document.createElement('span');
          // element.style.fontFamily = 'spoiler';
          element.style.fontFamily = 'markup-spoiler';
        } else {
          const container = document.createElement('span');
          container.className = 'spoiler';
          element = document.createElement('span');
          element.className = 'spoiler-text';
          element.textContent = partText;
          usedText = true;
          container.append(element);
          fragment.append(container);

          container[`on${CLICK_EVENT_NAME}`] = (window as any).onSpoilerClick;
        }

        break;
      }

      case 'messageEntityTimestamp': {
        if(!options.maxMediaTimestamp || entity.time > options.maxMediaTimestamp) {
          break;
        }

        element = document.createElement('a');
        element.classList.add('timestamp');
        element.dataset.timestamp = '' + entity.time;
        (element as HTMLAnchorElement).href = '#';
        element.setAttribute('onclick', 'setMediaTimestamp(this)');

        if(options.maxMediaTimestamp === Infinity) {
          element.classList.add('is-disabled');
        }

        break;
      }
    }

    if(!usedText && partText) {
      if(element) {
        // @ts-ignore
        element[property] = partText;
      } else {
        (element || fragment).append(partText);
      }
    }

    if(element && !element.parentNode) {
      (lastElement || fragment).append(element);
    }

    while(nextEntity && nextEntity.offset < endOffset) {
      ++nasty.i;

      (element || fragment).append(wrapRichText(nasty.text, {
        ...options,
        voodoo: true
      }));

      nextEntity = entities[nasty.i + 1];
    }

    // if(!element?.parentNode) {
    //   (lastElement || fragment).append(element ?? partText);
    // }

    if(nasty.usedLength <= endOffset) {
      if(nasty.usedLength < endOffset) {
        (element || fragment).append(nasty.text.slice(nasty.usedLength, endOffset));
        nasty.usedLength = endOffset;
      }

      lastElement = fragment;
      nasty.lastEntity = undefined;
    } else if(entity.length > partText.length && element) {
      lastElement = element;
    } else {
      lastElement = fragment;
    }

    if(options.voodoo) {
      return fragment;
    }
  }

  if(nasty.lastEntity) {
    nasty.usedLength = nasty.lastEntity.offset + nasty.lastEntity.length;
  }

  if(nasty.usedLength < textLength) {
    (lastElement || fragment).append(nasty.text.slice(nasty.usedLength));
  }

  if((!options.wrappingDraft || options.customEmojiRenderer) && customEmojis.size) {
    let renderer = options.customEmojiRenderer;
    if(!renderer) {
      renderer = CustomEmojiRendererElement.create(options);
      fragment.prepend(renderer);
    }

    const loadPromise = renderer.add(customEmojis, options.lazyLoadQueue, options.wrappingDraft);
    options.loadPromises?.push(loadPromise);
    // recordPromise(loadPromise, 'render emojis: ' + docIds.length);
  }

  if(customWraps.size) {
    insertCustomFillers(customWraps);
  }

  return fragment;
}

export const createCustomFiller = (notFiller?: boolean) => {
  const x = document.createElement('span');
  x.classList.add(notFiller ? 'input-filler2' : 'input-filler');
  x.textContent = BOM;
  return x;
};

export function isCustomFillerNeededBySiblingNode(node: ChildNode) {
  if(
    // !node?.textContent ||
    // node.textContent.endsWith('\n') ||
    node?.textContent !== BOM ||
    (node as HTMLElement)?.getAttribute?.('contenteditable') === 'false'
  ) {
    // if(!node || (node as HTMLElement).firstElementChild || node.textContent.endsWith('\n')) {
    if(!node || node.textContent !== BOM || (node as HTMLElement).firstElementChild) {
      return 2;
    } else if(node.nodeType === node.ELEMENT_NODE) {
      return 1;
    }/*  else if(node.nodeType === node.TEXT_NODE && !node.nodeValue) {
      (node as CharacterData).insertData(0, BOM);
    } */
  }

  return 0;
}

export function insertCustomFillers(elements: Iterable<HTMLElement>) {
  const check = (element: HTMLElement, node: ChildNode, method: 'before' | 'after') => {
    const needed = isCustomFillerNeededBySiblingNode(node);
    if(needed === 2) {
      element[method](createCustomFiller());
    } else if(needed === 1) {
      node.appendChild(document.createTextNode(BOM));
    }
  };

  for(const element of elements) {
    const {previousSibling, nextSibling} = element;
    check(element, previousSibling, 'before');
    check(element, nextSibling, 'after');
  }
}

(window as any).wrapRichText = wrapRichText;
