import type {MyDocument} from '@appManagers/appDocsManager';
import animationIntersector, {AnimationItemGroup} from '@components/animationIntersector';
import LazyLoadQueue from '@components/lazyLoadQueue';
import wrapSticker, {videosCache} from '@components/wrappers/sticker';
import customProperties, {CustomProperty} from '@helpers/dom/customProperties';
import findUpClassName from '@helpers/dom/findUpClassName';
import getViewportSlice from '@helpers/dom/getViewportSlice';
import replaceContent from '@helpers/dom/replaceContent';
import framesCache from '@helpers/framesCache';
import {MediaSize} from '@helpers/mediaSize';
import mediaSizes from '@helpers/mediaSizes';
import liteMode from '@helpers/liteMode';
import apiManagerProxy from '@lib/apiManagerProxy';
import {Middleware, MiddlewareHelper, getMiddleware} from '@helpers/middleware';
import noop from '@helpers/noop';
import {DocumentAttribute} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import RLottiePlayer, {applyColorOnContext, getLottiePixelRatio} from '@lib/rlottie/rlottiePlayer';
import SHOULD_RENDER_OFFSCREEN from '@lib/rlottie/shouldRenderOffscreen';
import compositorMessagePort, {EmojiCompositorMethods} from '@lib/customEmoji/compositorMessagePort';
import {ensureCompositor} from '@lib/customEmoji/compositorChannels';
import rootScope from '@lib/rootScope';
import CustomEmojiElement, {CustomEmojiElements} from '@lib/customEmoji/element';
import assumeType from '@helpers/assumeType';
import {IS_WEBM_SUPPORTED} from '@environment/videoSupport';
import {observeResize, unobserveResize} from '@components/resizeObserver';
import {CUSTOM_EMOJI_FADE_IN_DURATION, CUSTOM_EMOJI_FRAME_INTERVAL, PAID_REACTION_EMOJI_DOCID} from '@lib/customEmoji/constants';
import lottieLoader from '@lib/rlottie/lottieLoader';
import StickerType from '@config/stickerType';
import {Accessor, createEffect, createMemo, createRoot, createSignal, Setter} from 'solid-js';
import readValue from '@helpers/solid/readValue';

const globalLazyLoadQueue = new LazyLoadQueue();

export class CustomEmojiRendererElement extends HTMLElement {
  public static globalLazyLoadQueue: LazyLoadQueue = globalLazyLoadQueue;

  public canvas: HTMLCanvasElement;
  private _context: CanvasRenderingContext2D;

  public offscreen: boolean;
  public rendererId: number;
  public lastSentOffsets: Map<DocId, number[]>;
  private lastSentSize: {width: number, height: number};
  private lastSentSuspended: boolean;

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
  public textColor: Accessor<CustomProperty>;
  private _textColor: Accessor<CustomProperty>;
  private _setTextColor: Setter<CustomProperty>;

  public observeResizeElement: HTMLElement | false;

  public renderNonSticker: boolean;

  constructor() {
    super();

    this.classList.add('custom-emoji-renderer');
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('custom-emoji-canvas');
    this.append(this.canvas);

    this.lastSentOffsets = new Map();
    this.lastSentSuspended = false;
    this.playersSynced = new Map();
    this.textColored = new Set();
    this.clearedElements = new WeakSet();
    this.customEmojis = new Map();

    this.animationGroup = 'EMOJI';
    this.isCanvasClean = false;
  }

  // Lazy: the custom-element ctor runs before create() can decide the offscreen mode -
  // acquiring a context there would foreclose transferControlToOffscreen()
  public get context() {
    return this._context ??= this.canvas.getContext('2d');
  }

  public sendCompositor<T extends keyof EmojiCompositorMethods>(
    method: T,
    payload?: Omit<Parameters<EmojiCompositorMethods[T]>[0], 'rendererId'>,
    transfer?: Transferable[]
  ) {
    compositorMessagePort.invokeCompositorVoid(method, {...payload, rendererId: this.rendererId} as any, transfer);
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
      unobserveResize(observeElement, this.onResizeEntry);
    }

    this.customEmojis.forEach((elements) => {
      elements.forEach((element) => {
        element.clear();
      });
    });

    if(this.offscreen) {
      this.sendCompositor('detachRenderer');
      offscreenRenderers.delete(this.rendererId);
    }

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
        elements: placeholders.filter(el => !(el instanceof CustomEmojiElement) || !el.syncedPlayer?.pausedElements?.has(el)),
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

  // Change-driven offsets for the compositor: flatten to [top, left, width] triples (pre-dpr),
  // include only groups whose offsets changed since the last send, and emit empty offsets
  // (stop painting) for groups that left the viewport.
  public diffOffsets(offsetsMap: ReturnType<CustomEmojiRendererElement['getOffsets']>) {
    const groups: {groupId: DocId, offsets: number[]}[] = [];

    for(const [groupId, elements] of this.customEmojis) {
      const offsets = offsetsMap.get(elements);
      if(!offsets) {
        continue;
      }

      const last = this.lastSentOffsets.get(groupId);
      let changed = !last || last.length !== offsets.length * 3;
      if(!changed) {
        for(let i = 0; i < offsets.length; ++i) {
          const {top, left, width} = offsets[i];
          if(last[i * 3] !== top || last[i * 3 + 1] !== left || last[i * 3 + 2] !== width) {
            changed = true;
            break;
          }
        }
      }

      if(changed) {
        const flat: number[] = [];
        for(const {top, left, width} of offsets) {
          flat.push(top, left, width);
        }

        this.lastSentOffsets.set(groupId, flat);
        groups.push({groupId, offsets: flat});
      }
    }

    for(const groupId of this.lastSentOffsets.keys()) { // Map iterators tolerate delete-during-for-of
      const elements = this.customEmojis.get(groupId);
      if(elements && offsetsMap.has(elements)) {
        continue;
      }

      // getOffsets also filters out merely-PAUSED elements (popup pause sweep while a shared
      // synced player keeps playing for the popup's own copies) - legacy keeps such a group's
      // pixels frozen, so only a real viewport exit may clear it; placeholders are restored
      // under the same gate below, anything else would leave visibly empty cells
      if(elements && isAnyElementVisible(elements)) {
        continue;
      }

      this.lastSentOffsets.delete(groupId);
      groups.push({groupId, offsets: []});
    }

    // mirror render()'s viewport-exit placeholder restoration, re-checked EVERY tick like
    // legacy does - at the exit transition itself IntersectionObserver usually hasn't
    // flagged the element invisible yet, so a one-shot check would skip the restore forever
    this.restoreAllPlaceholders(offsetsMap);

    return groups;
  }

  // legacy "paused but still on-screen" freeze (popup pause sweep, idle): the legacy tick
  // simply stops repainting the UI canvas, but the compositor repaints on every frame a
  // SHARED synced player keeps delivering (the emoji-set popup playing the panel's players) -
  // mirror the freeze by suspending the renderer worker-side while every element is paused
  public updateSuspended() {
    let suspended = false;
    for(const elements of this.playersSynced.keys()) {
      for(const element of elements) {
        if(!element.paused) {
          this.setSuspended(false);
          return;
        }

        suspended = true; // at least one (paused) element - not a vacuously-empty renderer
      }
    }

    this.setSuspended(suspended);
  }

  private setSuspended(suspended: boolean) {
    if(this.lastSentSuspended !== suspended) {
      this.lastSentSuspended = suspended;
      this.sendCompositor('suspendRenderer', {suspended});
    }
  }

  public clearCanvas() {
    if(this.offscreen) { // belt - the tick never routes offscreen renderers here
      return;
    }

    if(this.isCanvasClean) {
      return;
    }

    const {context, canvas} = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
    this.isCanvasClean = true;
  }

  public render(offsetsMap: ReturnType<CustomEmojiRendererElement['getOffsets']>) {
    if(this.offscreen) { // belt - the tick never routes offscreen renderers here
      return;
    }

    const {context, canvas, isDimensionsSet} = this;
    if(!isDimensionsSet) {
      this.setDimensionsFromRect(undefined, false);
    }

    this.isCanvasClean = false;

    const {width, height, dpr} = canvas;
    const animationsEnabled = liteMode.isAvailable('emoji_appear');
    let _color: string;
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
      const color = this.textColored.has(elements) ? (_color ??= customProperties.getProperty(this.textColor())) : undefined;

      let alpha = 1;
      if(animationsEnabled) {
        let startTime = elementsFadeInStartTimes.get(elements);
        if(startTime === undefined) {
          // Skip fade if a raster thumb <img> is already visible under the canvas —
          // the canvas frame replacing it would otherwise read as a blink. Path-size
          // <svg> placeholders are visually different enough that the fade still helps.
          const skipFade = hasRasterThumbPlaceholder(elements);
          startTime = skipFade ? 0 : performance.now();
          elementsFadeInStartTimes.set(elements, startTime);
        }
        alpha = Math.min(1, (performance.now() - startTime) / CUSTOM_EMOJI_FADE_IN_DURATION);
      }
      // putImageData ignores globalAlpha, so fade only applies on the drawImage path
      const applyFade = alpha < 1 && !isImageData;

      // Keep the placeholder DOM children visible underneath until the fade completes,
      // otherwise there's a visible gap between the thumb being removed and the canvas
      // frame becoming opaque enough to see.
      if(!applyFade && !this.clearedElements.has(elements) && !this.isSelectable) {
        if(this.isSelectable/*  && false */) {
          elements.forEach((element) => {
            element.lastChildWas ??= element.lastChild;
            replaceContent(element, element.firstChild);
          });

          this.clearedElements.add(elements);
        } else {
          this.clearPlaceholders(elements);
        }
      }

      if(applyFade) {
        context.globalAlpha = alpha;
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

      if(applyFade) {
        context.globalAlpha = 1;
      }
    }

    // Restore placeholders for groups that exited the viewport so they fade-in next time.
    // We deliberately ignore groups that are merely paused (window blur, idle, animations
    // disabled, etc.) but still on-screen — restoring there would re-trigger the fade
    // on every unpause. animationIntersector already tracks per-element viewport visibility
    // via IntersectionObserver, so reuse that instead of running a second viewport check.
    for(const elements of this.customEmojis.values()) {
      if(
        !offsetsMap.has(elements) &&
        this.clearedElements.has(elements) &&
        !isAnyElementVisible(elements)
      ) {
        this.restorePlaceholders(elements);
      }
    }
  }

  public clearPlaceholders(elements: CustomEmojiElements) {
    elements.forEach((element) => {
      element.savedChildren ??= Array.from(element.childNodes);
      element.replaceChildren();
    });

    this.clearedElements.add(elements);
  }

  public restorePlaceholders(elements: CustomEmojiElements) {
    if(this.isSelectable) {
      return;
    }

    if(this.offscreen) { // re-arm the compositor fade so the group fades again on viewport re-entry
      const docId = elements.values().next().value?.docId;
      if(docId !== undefined) {
        this.sendCompositor('resetFade', {groupId: docId});
      }
    }

    elements.forEach((element) => {
      const saved = element.savedChildren;
      if(saved?.length && !element.firstChild) {
        element.replaceChildren(...saved);
      }
    });

    this.clearedElements.delete(elements);
    elementsFadeInStartTimes.delete(elements);
  }

  public restoreAllPlaceholders(except?: ReturnType<CustomEmojiRendererElement['getOffsets']>) {
    for(const elements of this.customEmojis.values()) {
      if(!except?.has(elements) && this.clearedElements.has(elements) && !isAnyElementVisible(elements)) {
        this.restorePlaceholders(elements);
      }
    }
  }

  public checkForAnyFrame() {
    if(this.offscreen) { // frames never land UI-side - the player tracks its first ack
      for(const player of this.playersSynced.values()) {
        if(player instanceof RLottiePlayer && player.offscreen === 'emoji' && player.hasRenderedFirstFrame) {
          return true;
        }
      }

      return false;
    }

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
    if(this.offscreen) { // a transferred placeholder's .width is unreliable and writing it throws
      const {lastSentSize} = this;
      if(lastSentSize && lastSentSize.width === newWidth && lastSentSize.height === newHeight) {
        return;
      }

      this.lastSentSize = {width: newWidth, height: newHeight};
      this.sendCompositor('resizeRenderer', {width: newWidth, height: newHeight});
    } else {
      if(canvas.width === newWidth && canvas.height === newHeight) {
        return;
      }

      canvas.width = newWidth;
      canvas.height = newHeight;
    }

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
      if(this.offscreen) {
        this.sendCompositor('clearRenderer');
      } else {
        this.clearCanvas();
      }
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
        if(this.offscreen) {
          this.sendCompositor('detachGroup', {groupId: element.docId});
        }

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
    const stickerType = doc.sticker ?? (this.renderNonSticker ? StickerType.Static : undefined);
    const isLottie = stickerType === StickerType.Lottie;
    const isStatic = newElementsArray[0].static || (doc.mime_type === 'video/webm' && !IS_WEBM_SUPPORTED);
    const willHaveSyncedPlayer = (isLottie || (stickerType === StickerType.WebM && this.isSelectable)) && !onlyThumb && !isStatic;

    const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
    if(attribute && attribute.pFlags.text_color) {
      renderer.textColored.add(customEmojis);
    }

    // If the doc is already cached locally with a URL, the media will appear
    // (almost) instantly — playing a fade-in over already-visible content reads
    // as a blink, so we skip it in that case.
    const cacheContext = apiManagerProxy.getCacheContext(doc);
    const isAlreadyAvailable = !!(cacheContext.downloaded && cacheContext.url);

    const loadStickerMiddleware = willHaveSyncedPlayer ? middleware.create().get(() => {
      return !!syncedPlayer.middlewares.size;
    }) : undefined;

    // When we'll do our own JS fade on a DOM path, tell wrapSticker to leave the
    // thumb in the DOM so we can keep it visible underneath the media as it fades
    // in (avoiding a perceptual "gap" between the thumb disappearing and the
    // fade-in reaching a visible opacity).
    const willDomFade =
      !willHaveSyncedPlayer &&
      !this.isSelectable &&
      (stickerType === StickerType.Static || onlyThumb || isStatic || !isAlreadyAvailable) &&
      liteMode.isAvailable('emoji_appear');

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
      textColor: renderer.textColor,
      keepThumb: willDomFade,
      compositorDelivery: this.offscreen || undefined
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

    if(stickerType === StickerType.Static || onlyThumb || isStatic) {
      addition.onRender = () => {
        // Pre-hide the real media (not the container) synchronously, before the
        // next browser paint. With keepThumb=true, wrapSticker leaves the thumb in
        // DOM — we absolutely-position it so it overlays the media, and it stays
        // at full opacity throughout. The media fades 0 -> 1 on top, so the user
        // sees a crossfade from thumb to media with no perceptual gap.
        if(willDomFade) {
          newElementsArray.forEach(preHideMediaWithThumbOverlay);
        }
        return Promise.all(_loadPromises).then(() => {
          if(!middleware()) return;
          if(this.isSelectable) {
            newElementsArray.forEach((element) => {
              const {placeholder} = element;
              placeholder.src = (element.firstElementChild as HTMLImageElement).src;
            });
          } else {
            newElementsArray.forEach(fadeInMediaAndCleanupThumbs);
          }
        });
      };

      return promise.then((res) => ({...res, ...addition}));
    }

    addition.onRender = (_p) => {
      // Same approach as the static path — fade the <video> directly, keep the
      // thumb overlaid underneath so any compositor timing on the video layer
      // doesn't produce a visible gap (the thumb covers it until the fade completes).
      if(willDomFade) {
        newElementsArray.forEach(preHideMediaWithThumbOverlay);
      }
      return Promise.all(_loadPromises).then(() => {
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

          if(renderer.offscreen && player.offscreen === 'emoji') {
            // force an offsets resend on the next tick: a re-attach for an already-known docId
            // (reactions re-render, instantView shared renderer) re-arms the compositor group,
            // and stale identical triples in lastSentOffsets would otherwise suppress the send
            renderer.lastSentOffsets.delete(docId);

            renderer.sendCompositor('attachGroup', {
              groupId: docId,
              playerReqId: player.reqId,
              textColored: renderer.textColored.has(customEmojis),
              skipFade: hasRasterThumbPlaceholder(customEmojis) // same DOM read the legacy fade does
            });
          } else {
            if(renderer.offscreen) {
              // defensive only - reachable just after the offscreen loadFromData legacy retry belt;
              // the group degrades to its visible placeholder (no crash, no blank canvas)
              console.warn('offscreen renderer received a legacy player', player, renderer);
            }

            player.overrideRender ??= (frame) => {
              syncedPlayersFrames.set(player, frame);
            // frames.set(containers, frame);
            };
          }
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
          if(!renderer.offscreen) { // offscreen renderers got their dpr at create()
            renderer.canvas.dpr = getLottiePixelRatio(this.size.width, this.size.height);
          }

          setRenderInterval();
        } else if(!isAlreadyAvailable) {
          // DOM-rendered path (e.g. non-selectable WebM video) — fade-in via JS opacity
          newElementsArray.forEach(fadeInMediaAndCleanupThumbs);
        }
      });
    };

    let syncedPlayer: SyncedPlayer;
    // the delivery mode is part of the key: a legacy (isSelectable) renderer and an offscreen one
    // must NOT share a SyncedPlayer - the loader segregates them into two RLottiePlayers, and a
    // shared entry would cross-couple the pause refcounts and leak whichever player onRender
    // assigned first (sync players have no other removal path)
    const key = [docId, size.width, size.height, +!!this.offscreen].join('-');
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
    this._setTextColor(textColor);
  }

  public static create(options: CustomEmojiRendererElementOptions) {
    const renderer = new CustomEmojiRendererElement();
    renderer.animationGroup = options.animationGroup;
    renderer.size = options.customEmojiSize || mediaSizes.active.customEmoji;
    renderer.isSelectable = options.isSelectable;
    // isSelectable renderers stay whole-renderer legacy (live HTMLVideoElement compositing occurs only there)
    renderer.offscreen = SHOULD_RENDER_OFFSCREEN && !options.isSelectable;
    if(renderer.offscreen) {
      renderer.rendererId = ++nextRendererId;
      offscreenRenderers.set(renderer.rendererId, renderer);
      const dpr = renderer.canvas.dpr = getLottiePixelRatio(renderer.size.width, renderer.size.height);
      ensureCompositor();
      renderer.canvas.dataset.offscreen = '1';
      const offscreenCanvas = renderer.canvas.transferControlToOffscreen();
      renderer.sendCompositor('attachRenderer', {
        canvas: offscreenCanvas,
        dpr,
        fadeEnabled: liteMode.isAvailable('emoji_appear')
      }, [offscreenCanvas]);
    }
    [renderer._textColor, renderer._setTextColor] = createSignal();
    renderer.observeResizeElement = options.observeResizeElement;
    renderer.renderNonSticker = options.renderNonSticker;
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

    createRoot((dispose) => {
      renderer.textColor = createMemo(() => renderer._textColor() || readValue(options.textColor));

      if(renderer.offscreen) {
        createEffect(() => {
          const property = renderer.textColor();
          renderer.sendCompositor('configRenderer', {
            color: property ? customProperties.getProperty(property) : undefined,
            fadeEnabled: liteMode.isAvailable('emoji_appear') // reads the reactive appSettings store - re-runs on lite-mode change
          });
        });
      }

      renderer.middlewareHelper.get().onDestroy(dispose);
    });

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

  observeResizeElement?: HTMLElement | false,
  renderNonSticker?: boolean
}> & WrapSomethingOptions;

const CUSTOM_EMOJI_INSTANT_PLAY = true; // do not wait for animationIntersector

const isAnyElementVisible = (elements: CustomEmojiElements) => {
  for(const element of elements) {
    if(animationIntersector.isVisible(element)) return true;
  }
  return false;
};

const hasRasterThumbPlaceholder = (elements: CustomEmojiElements) => {
  for(const element of elements) {
    return !!element.querySelector?.('img');
  }
  return false;
};

let emojiRenderInterval: number;
const emojiRenderers: Set<CustomEmojiRenderer> = new Set();
const syncedPlayers: Map<string, SyncedPlayer> = new Map();
const syncedPlayersFrames: Map<RLottiePlayer | HTMLVideoElement, CustomEmojiFrame> = new Map();
const elementsFadeInStartTimes: WeakMap<CustomEmojiElements, number> = new WeakMap();

let nextRendererId = 0;
const offscreenRenderers: Map<number, CustomEmojiRendererElement> = new Map();

// Placeholder-clear parity with the legacy render() path: clear the layout children once
// the compositor reports the group is fully faded in (fired immediately when the fade was
// skipped/disabled), so the thumb never lingers past the moment the canvas fully covers it.
compositorMessagePort.addEventListener('groupPainted', ({rendererId, groupId}) => {
  const renderer = offscreenRenderers.get(rendererId);
  const elements = renderer?.customEmojis.get(groupId);
  if(!elements || !renderer.isConnected || renderer.clearedElements.has(elements)) {
    return;
  }

  renderer.clearPlaceholders(elements);
});

// CSS-var resolution is not reactive to theme swaps - re-resolve and re-ship the color.
rootScope.addEventListener('theme_changed', () => {
  for(const renderer of offscreenRenderers.values()) {
    const property = renderer.textColor();
    if(!property) {
      continue;
    }

    renderer.sendCompositor('configRenderer', {
      color: customProperties.getProperty(property)
    });
  }
});

export const renderEmojis = (renderers = emojiRenderers) => {
  const r = Array.from(renderers);
  const t = r.filter((r) => r.isConnected && r.checkForAnyFrame() && !r.ignoreSettingDimensions);
  if(!t.length) {
    return false;
  }

  const legacy: [CustomEmojiRendererElement, ReturnType<CustomEmojiRendererElement['getOffsets']>][] = [];
  const batch: {rendererId: number, groups: {groupId: DocId, offsets: number[]}[]}[] = [];
  for(const renderer of t) {
    if(renderer.offscreen) {
      renderer.updateSuspended();
    }

    const paused = [...renderer.playersSynced.values()].reduce((acc, v) => acc + +!!v.paused, 0);
    if(renderer.playersSynced.size === paused) {
      continue; // all paused: no offsets sent, no arrivals, pixels frozen - matches today
    }

    const offsets = renderer.getOffsets(); // the layout reads stay UI-side
    if(renderer.offscreen) {
      const groups = renderer.diffOffsets(offsets); // also restores placeholders for non-visible groups
      if(groups.length) {
        batch.push({rendererId: renderer.rendererId, groups});
      }
    } else if(offsets.size) {
      legacy.push([renderer, offsets]);
    } else {
      // No visible groups in this renderer — restore any cleared placeholders
      // so they fade-in fresh when scrolled back into view.
      renderer.restoreAllPlaceholders();
    }
  }

  if(batch.length) {
    compositorMessagePort.invokeCompositorVoid('setOffsets', {batch}); // change-driven: steady non-scroll state => zero messages
  }

  for(const [renderer] of legacy) {
    renderer.clearCanvas();
  }

  for(const [renderer, offsets] of legacy) {
    renderer.render(offsets);
  }

  // ! must stay `return true` whenever t.length > 0 - today's body returns true
  // unconditionally past the t-filter, even when every renderer is paused or
  // offset-less; returning `legacy.length > 0 || batch.length > 0` would make
  // forceRender() clearCanvas() an all-paused LEGACY renderer that today keeps
  // its pixels - a fallback-path behavior change.
  return true;
};
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

// JS-driven fade-in for DOM-rendered custom emojis (images and non-synced videos).
// Uses inline `opacity` updated on a single shared rAF loop — avoids CSS `animation`
// which can cause heavy repaints / extra compositor layers when many emojis appear.
type DomFadeIn = {element: HTMLElement, startTime: number};
const domFadeIns: Set<DomFadeIn> = new Set();
let domFadeRaf: number;
const stepDomFadeIns = () => {
  const now = performance.now();
  for(const fade of domFadeIns) {
    const alpha = Math.min(1, (now - fade.startTime) / CUSTOM_EMOJI_FADE_IN_DURATION);
    if(alpha >= 1) {
      fade.element.style.removeProperty('opacity');
      fade.element.style.removeProperty('will-change');
      domFadeIns.delete(fade);
    } else {
      fade.element.style.setProperty('opacity', String(alpha));
    }
  }
  domFadeRaf = domFadeIns.size ? requestAnimationFrame(stepDomFadeIns) : undefined;
};
const startDomFadeIn = (element: HTMLElement) => {
  if(!liteMode.isAvailable('emoji_appear')) {
    return;
  }
  element.style.setProperty('opacity', '0');
  domFadeIns.add({element, startTime: performance.now()});
  if(!domFadeRaf) {
    domFadeRaf = requestAnimationFrame(stepDomFadeIns);
  }
};

// Pre-hide the media element and overlay the thumb so the thumb stays visible
// at full opacity underneath while the media fades in on top. Called synchronously
// in onRender, as a microtask after wrapSticker's rAF appended the media — this
// runs before the next paint so the media never composites at opacity 1.
const preHideMediaWithThumbOverlay = (el: HTMLElement) => {
  const media = el.querySelector('.media-sticker:not(.thumbnail)');
  if(media instanceof HTMLElement) {
    media.style.setProperty('opacity', '0');
    media.style.setProperty('will-change', 'opacity');
  }
  const thumb = el.querySelector('.thumbnail');
  if(thumb instanceof HTMLElement) {
    // Take the thumb out of flow so it overlays the media at the same rect.
    // DOM order (thumb before media) keeps media painted on top, so as media
    // fades 0 -> 1 the thumb is gradually obscured — a crossfade.
    thumb.style.setProperty('position', 'absolute');
    thumb.style.setProperty('top', '0');
    thumb.style.setProperty('left', '0');
  }
};

// Kicks off the rAF fade on the media and schedules thumb removal when the
// fade would have finished. If there's no separate media element (shouldn't
// normally happen on the DOM fade paths), we leave the thumb in place rather
// than tearing it out.
const fadeInMediaAndCleanupThumbs = (el: HTMLElement) => {
  const media = el.querySelector('.media-sticker:not(.thumbnail)');
  if(!(media instanceof HTMLElement)) return;
  startDomFadeIn(media);
  setTimeout(() => {
    el.querySelectorAll('.thumbnail').forEach((t) => t.remove());
  }, CUSTOM_EMOJI_FADE_IN_DURATION);
};

(window as any).syncedPlayers = syncedPlayers;
(window as any).emojiRenderers = emojiRenderers;

customElements.define('custom-emoji-renderer-element', CustomEmojiRendererElement);
