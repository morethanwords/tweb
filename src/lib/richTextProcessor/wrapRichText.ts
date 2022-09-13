/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {EMOJI_VERSION} from '../../environment/emojiVersionsSupport';
import {SITE_HASHTAGS} from '.';
import {EmojiVersions} from '../../config/emoji';
import IS_EMOJI_SUPPORTED from '../../environment/emojiSupport';
import {IS_SAFARI} from '../../environment/userAgent';
import buildURLHash from '../../helpers/buildURLHash';
import copy from '../../helpers/object/copy';
import encodeEntities from '../../helpers/string/encodeEntities';
import {MessageEntity} from '../../layer';
import encodeSpoiler from './encodeSpoiler';
import parseEntities from './parseEntities';
import setBlankToAnchor from './setBlankToAnchor';
import wrapUrl from './wrapUrl';
import EMOJI_VERSIONS_SUPPORTED from '../../environment/emojiVersionsSupport';
import {CLICK_EVENT_NAME} from '../../helpers/dom/clickEvent';
import IS_CUSTOM_EMOJI_SUPPORTED from '../../environment/customEmojiSupport';
import rootScope from '../rootScope';
import mediaSizes from '../../helpers/mediaSizes';
import {wrapSticker} from '../../components/wrappers';
import RLottiePlayer from '../rlottie/rlottiePlayer';
import animationIntersector, {AnimationItemGroup} from '../../components/animationIntersector';
import type {MyDocument} from '../appManagers/appDocsManager';
import LazyLoadQueue from '../../components/lazyLoadQueue';
import {Awaited} from '../../types';
import {MediaSize} from '../../helpers/mediaSize';
import IS_WEBM_SUPPORTED from '../../environment/webmSupport';
import assumeType from '../../helpers/assumeType';
import noop from '../../helpers/noop';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import findUpClassName from '../../helpers/dom/findUpClassName';
import getViewportSlice from '../../helpers/dom/getViewportSlice';
import {getMiddleware, Middleware} from '../../helpers/middleware';

const resizeObserver = new ResizeObserver((entries) => {
  for(const entry of entries) {
    const renderer = entry.target.parentElement as CustomEmojiRendererElement;
    renderer.setDimensionsFromRect(entry.contentRect);
  }
});

class CustomEmojiElement extends HTMLElement {
  public elements: CustomEmojiElement[];
  public renderer: CustomEmojiRendererElement;
  public player: RLottiePlayer | HTMLVideoElement;
  public paused: boolean;
  public syncedPlayer: SyncedPlayer;

  constructor() {
    super();
    this.paused = true;
  }

  public connectedCallback() {
    if(this.player) {
      animationIntersector.addAnimation(this, this.renderer.animationGroup);
    }

    this.connectedCallback = undefined;
  }

  public disconnectedCallback() {
    if(this.syncedPlayer) {
      this.syncedPlayer.pausedElements.delete(this);
    }

    // otherwise https://bugs.chromium.org/p/chromium/issues/detail?id=1144736#c27 will happen
    this.textContent = '';

    this.disconnectedCallback = this.elements = this.renderer = this.player = this.syncedPlayer = undefined;
  }

  public pause() {
    if(this.paused) {
      return;
    }

    this.paused = true;

    if(this.player instanceof HTMLVideoElement) {
      this.renderer.lastPausedVideo = this.player;
      this.player.pause();
    }

    if(this.syncedPlayer && !this.syncedPlayer.pausedElements.has(this)) {
      this.syncedPlayer.pausedElements.add(this);

      if(this.syncedPlayer.pausedElements.size === this.syncedPlayer.elementsCounter) {
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
      this.player.currentTime = this.renderer.lastPausedVideo?.currentTime || this.player.currentTime;
      this.player.play().catch(noop);
    }

    if(this.syncedPlayer && this.syncedPlayer.pausedElements.has(this)) {
      this.syncedPlayer.pausedElements.delete(this);

      if(this.syncedPlayer.pausedElements.size !== this.syncedPlayer.elementsCounter) {
        this.player.play();
      }
    }
  }

  public remove() {
    this.elements = this.renderer = this.player = undefined;
  }

  public get autoplay() {
    return true;
  }
}

export class CustomEmojiRendererElement extends HTMLElement {
  public canvas: HTMLCanvasElement;
  public context: CanvasRenderingContext2D;

  public playersSynced: Map<CustomEmojiElement[], RLottiePlayer | HTMLVideoElement>;
  public syncedElements: Map<SyncedPlayer, CustomEmojiElement[]>;
  public clearedElements: Set<CustomEmojiElement[]>;
  public lastPausedVideo: HTMLVideoElement;

  public lastRect: DOMRect;
  public isDimensionsSet: boolean;

  public animationGroup: AnimationItemGroup;
  public size: MediaSize;

  public lazyLoadQueue: LazyLoadQueue;

  constructor() {
    super();

    this.classList.add('custom-emoji-renderer');
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('custom-emoji-canvas');
    this.context = this.canvas.getContext('2d');
    this.append(this.canvas);

    this.playersSynced = new Map();
    this.syncedElements = new Map();
    this.clearedElements = new Set();

    this.animationGroup = 'EMOJI';
  }

  public connectedCallback() {
    // this.setDimensions();
    // animationIntersector.addAnimation(this, this.animationGroup);
    resizeObserver.observe(this.canvas);
    emojiRenderers.push(this);

    this.connectedCallback = undefined;
  }

  public disconnectedCallback() {
    for(const [syncedPlayer, elements] of this.syncedElements) {
      if(syncedPlayers.get(syncedPlayer.key) !== syncedPlayer) {
        continue;
      }

      if(elements) {
        syncedPlayer.elementsCounter -= elements.length;
      }

      if(!--syncedPlayer.counter) {
        if(syncedPlayer.player) {
          const frame = syncedPlayersFrames.get(syncedPlayer.player);
          if(frame) {
            (frame as ImageBitmap).close?.();
            syncedPlayersFrames.delete(syncedPlayer.player);
          }

          syncedPlayersFrames.delete(syncedPlayer.player);
          syncedPlayer.player.overrideRender = noop;
          syncedPlayer.player.remove();
          syncedPlayer.player = undefined;
        }

        syncedPlayers.delete(syncedPlayer.key);

        if(!syncedPlayers.size) {
          clearRenderInterval();
        }
      }
    }

    resizeObserver.unobserve(this.canvas);

    indexOfAndSplice(emojiRenderers, this);
    this.playersSynced.clear();
    this.syncedElements.clear();
    this.clearedElements.clear();
    this.lazyLoadQueue?.clear();
    this.middlewareHelper?.clean();

    this.disconnectedCallback = this.lastPausedVideo = this.lazyLoadQueue = undefined;
  }

  public getOffsets(offsetsMap: Map<CustomEmojiElement[], {top: number, left: number}[]> = new Map()) {
    if(!this.playersSynced.size) {
      return offsetsMap;
    }

    const overflowElement = findUpClassName(this, 'scrollable') || this.offsetParent as HTMLElement;
    const overflowRect = overflowElement.getBoundingClientRect();
    const rect = this.getBoundingClientRect();

    for(const elements of this.playersSynced.keys()) {
      const {visible} = getViewportSlice({
        overflowElement,
        overflowRect,
        elements,
        extraSize: this.size.height * 2.5 // let's add some margin
      });

      const offsets = visible.map(({rect: elementRect}) => {
        const top = elementRect.top - rect.top;
        const left = elementRect.left - rect.left;
        return {top, left};
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
    const {context, canvas} = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  public render(offsetsMap: ReturnType<CustomEmojiRendererElement['getOffsets']>) {
    const {context, canvas, isDimensionsSet} = this;
    if(!isDimensionsSet) {
      this.setDimensionsFromRect();
    }

    const {width, height, dpr} = canvas;
    for(const [elements, offsets] of offsetsMap) {
      const player = this.playersSynced.get(elements);
      const frame = syncedPlayersFrames.get(player);
      if(!frame) {
        continue;
      }

      const isImageData = frame instanceof ImageData;
      const {width: frameWidth, height: frameHeight} = frame;
      const maxTop = height - frameHeight;
      const maxLeft = width - frameWidth;

      if(!this.clearedElements.has(elements)) {
        elements.forEach((element) => {
          element.textContent = '';
        });

        this.clearedElements.add(elements);
      }

      offsets.forEach(({top, left}) => {
        top = Math.round(top * dpr), left = Math.round(left * dpr);
        if(/* top > maxTop ||  */left > maxLeft) {
          return;
        }

        if(isImageData) {
          context.putImageData(frame as ImageData, left, top);
        } else {
          // context.clearRect(left, top, width, height);
          context.drawImage(frame as ImageBitmap, left, top, frameWidth, frameHeight);
        }
      });
    }
  }

  public checkForAnyFrame() {
    for(const player of this.playersSynced.values()) {
      if(syncedPlayersFrames.has(player)) {
        return true;
      }
    }

    return false;
  }

  public remove() {
    // this.canvas.remove();
  }

  // public setDimensions() {
  //   const {canvas} = this;
  //   sequentialDom.mutateElement(canvas, () => {
  //     const rect = canvas.getBoundingClientRect();
  //     this.setDimensionsFromRect(rect);
  //   });
  // }

  public setDimensionsFromRect(rect: DOMRect = this.lastRect) {
    const {canvas} = this;
    const {dpr} = canvas;

    if(this.lastRect !== rect) {
      this.lastRect = rect;
    }

    if(!rect || !dpr) {
      return;
    }

    this.isDimensionsSet = true;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
}

type CustomEmojiRenderer = CustomEmojiRendererElement;
type SyncedPlayer = {
  player: RLottiePlayer,
  middlewares: Set<() => boolean>,
  pausedElements: Set<CustomEmojiElement>,
  elementsCounter: number,
  counter: number,
  key: string
};
type CustomEmojiFrame = Parameters<RLottiePlayer['overrideRender']>[0] | HTMLVideoElement;

const CUSTOM_EMOJI_INSTANT_PLAY = true; // do not wait for animationIntersector
let emojiRenderInterval: number;
const emojiRenderers: Array<CustomEmojiRenderer> = [];
const syncedPlayers: Map<string, SyncedPlayer> = new Map();
const syncedPlayersFrames: Map<RLottiePlayer | HTMLVideoElement, CustomEmojiFrame> = new Map();
const renderEmojis = () => {
  const t = emojiRenderers.filter((r) => r.isConnected && r.checkForAnyFrame());
  if(!t.length) {
    return;
  }

  const o = t.map((renderer) => {
    const offsets = renderer.getOffsets();
    return offsets.size ? [renderer, offsets] as const : undefined;
  }).filter(Boolean);

  for(const [renderer] of o) {
    renderer.clearCanvas();
  }

  for(const [renderer, offsets] of o) {
    renderer.render(offsets);
  }
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

customElements.define('custom-emoji-element', CustomEmojiElement);
customElements.define('custom-emoji-renderer-element', CustomEmojiRendererElement);

/**
 * * Expecting correctly sorted nested entities (RichTextProcessor.sortEntities)
 */
export default function wrapRichText(text: string, options: Partial<{
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
  noEncoding: boolean,

  contextHashtag?: string,

  // ! recursive, do not provide
  nasty?: {
    i: number,
    usedLength: number,
    text: string,
    lastEntity?: MessageEntity
  },
  voodoo?: boolean,
  customEmojis?: {[docId: DocId]: CustomEmojiElement[]},
  wrappingSpoiler?: boolean,

  loadPromises?: Promise<any>[],
  middleware?: Middleware,
  lazyLoadQueue?: LazyLoadQueue,
  customEmojiSize?: MediaSize,
  animationGroup?: AnimationItemGroup
}> = {}) {
  const fragment = document.createDocumentFragment();
  if(!text) {
    return fragment;
  }

  const nasty = options.nasty ??= {
    i: 0,
    usedLength: 0,
    text
  };

  const customEmojis = options.customEmojis ??= {};

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
      entity.length = entity.offset + entity.length - textLength;
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
            element.style.fontWeight = 'bold';
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
            element.style.fontStyle = 'italic';
          } else {
            element = document.createElement('em');
          }
        }

        break;
      }

      case 'messageEntityStrike': {
        if(options.wrappingDraft) {
          const styleName = IS_SAFARI ? 'text-decoration' : 'text-decoration-line';
          element = document.createElement('span');
          element.style.cssText = `${styleName}: line-through;`;
        } else if(!options.noTextFormat) {
          element = document.createElement('del');
        }

        break;
      }

      case 'messageEntityUnderline': {
        if(options.wrappingDraft) {
          const styleName = IS_SAFARI ? 'text-decoration' : 'text-decoration-line';
          element = document.createElement('span');
          element.style.cssText = `${styleName}: underline;`;
        } else if(!options.noTextFormat) {
          element = document.createElement('u');
        }

        break;
      }

      case 'messageEntityPre':
      case 'messageEntityCode': {
        if(options.wrappingDraft) {
          element = document.createElement('span');
          element.style.fontFamily = 'var(--font-monospace)';
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

        if(nextEntity?._ === 'messageEntityEmoji') {
          ++nasty.i;
          nasty.lastEntity = nextEntity;
          nasty.usedLength += nextEntity.length;
          nextEntity = entities[nasty.i + 1];
        }

        (customEmojis[entity.document_id] ??= []).push(element = new CustomEmojiElement());
        element.classList.add('custom-emoji');

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

      // case 'messageEntityLinebreak': {
      //   if(options.noLinebreaks) {
      //     insertPart(entity, ' ');
      //   } else {
      //     insertPart(entity, '<br/>');
      //   }

      //   break;
      // }

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

          const {url, onclick} = wrapUrl('t.me/' + username);

          element = document.createElement('a');
          element.className = 'mention';
          (element as HTMLAnchorElement).href = url;
          if(onclick) {
            element.setAttribute('onclick', `${onclick}(this)`);
          }

          // insertPart(entity, `<a class="mention" href="${contextUrl.replace('{1}', encodeURIComponent(username))}"${contextExternal ? ' target="_blank" rel="noopener noreferrer"' : ''}>`, '</a>');
        }

        break;
      }

      case 'messageEntitySpoiler': {
        if(options.noTextFormat) {
          const encoded = encodeSpoiler(nasty.text, entity);
          nasty.text = encoded.text;
          partText = encoded.entityText;
          nasty.usedLength += partText.length;
          let n: MessageEntity;
          for(; n = entities[nasty.i + 1], n && n.offset < endOffset;) {
            // nasty.usedLength += n.length;
            ++nasty.i;
            nasty.lastEntity = n;
            nextEntity = entities[nasty.i + 1];
          }
        } else if(options.wrappingDraft) {
          element = document.createElement('span');
          element.style.fontFamily = 'spoiler';
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
    }

    if(!usedText) {
      if(element) {
        // @ts-ignore
        element[property] = partText;
      } else {
        (element || fragment).append(partText);
      }
    }

    if(element && !element.parentElement) {
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

    // if(!element?.parentElement) {
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

  const docIds = Object.keys(customEmojis) as DocId[];
  if(docIds.length) {
    const managers = rootScope.managers;
    const size = options.customEmojiSize || mediaSizes.active.customEmoji;
    const renderer = new CustomEmojiRendererElement();
    // const middleware = () => !!renderer.disconnectedCallback && (!options.middleware || options.middleware());
    let middleware: Middleware;
    if(options.middleware) {
      middleware = options.middleware;
      options.middleware.onDestroy(() => {
        renderer.disconnectedCallback?.();
      });
    } else {
      renderer.middlewareHelper = getMiddleware();
      middleware = renderer.middlewareHelper.get();
    }

    renderer.animationGroup = options.animationGroup;
    renderer.size = size;
    fragment.prepend(renderer);

    const loadPromise = managers.appEmojiManager.getCachedCustomEmojiDocuments(docIds).then((docs) => {
      if(middleware && !middleware()) return;

      const loadPromises: Promise<any>[] = [];
      const wrap = (doc: MyDocument, _loadPromises?: Promise<any>[]) => {
        const elements = customEmojis[doc.id];
        const isLottie = doc.sticker === 2;

        const loadPromises: Promise<any>[] = [];
        const promise = wrapSticker({
          div: elements,
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
          exportLoad: true,
          needFadeIn: false,
          loadStickerMiddleware: isLottie && middleware ? middleware.create().get(() => {
            if(syncedPlayers.get(key) !== syncedPlayer) {
              return false;
            }

            let good = !syncedPlayer.middlewares.size;
            for(const middleware of syncedPlayer.middlewares) {
              if(middleware()) {
                good = true;
              }
            }

            return good;
          }) : undefined,
          static: doc.mime_type === 'video/webm' && !IS_WEBM_SUPPORTED
        });

        if(_loadPromises) {
          promise.then(() => _loadPromises.push(...loadPromises));
        }

        const addition: {
          onRender?: (_p: Awaited<Awaited<typeof promise>['render']>) => Promise<void>,
          elements: typeof elements
        } = {
          elements
        };

        if(doc.sticker === 1) {
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
          elements.forEach((element, idx) => {
            const player = players[idx] || players[0];
            element.renderer = renderer;
            element.elements = elements;
            element.player = player;

            if(syncedPlayer) {
              element.syncedPlayer = syncedPlayer;
              if(element.paused) {
                element.syncedPlayer.pausedElements.add(element);
              }
            }

            if(element.isConnected) {
              animationIntersector.addAnimation(element, element.renderer.animationGroup);
            }
          });

          if(syncedPlayer) {
            syncedPlayer.elementsCounter += elements.length;
            syncedPlayer.middlewares.delete(middleware);
            renderer.syncedElements.set(syncedPlayer, elements);
          }

          if(player instanceof RLottiePlayer) {
            syncedPlayer.player = player;
            renderer.playersSynced.set(elements, player);
            renderer.canvas.dpr = player.canvas[0].dpr;
            player.group = renderer.animationGroup;

            player.overrideRender ??= (frame) => {
              syncedPlayersFrames.set(player, frame);
              // frames.set(containers, frame);
            };

            setRenderInterval();
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
        });

        let syncedPlayer: SyncedPlayer;
        const key = [doc.id, size.width, size.height].join('-');
        if(isLottie) {
          syncedPlayer = syncedPlayers.get(key);
          if(!syncedPlayer) {
            syncedPlayer = {
              player: undefined,
              middlewares: new Set(),
              pausedElements: new Set(),
              elementsCounter: 0,
              counter: 0,
              key
            };

            syncedPlayers.set(key, syncedPlayer);
          }

          renderer.syncedElements.set(syncedPlayer, undefined);

          ++syncedPlayer.counter;

          if(middleware) {
            syncedPlayer.middlewares.add(middleware);
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

      const uncachedPromisesPromise = managers.appEmojiManager.getCustomEmojiDocuments(missing).then((docs) => {
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

            if(renderer.lazyLoadQueue) {
              elements.forEach((element) => {
                renderer.lazyLoadQueue.push({
                  div: element,
                  load: () => {
                    elements.forEach((element) => {
                      renderer.lazyLoadQueue.unobserve(element);
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

      if(options.lazyLoadQueue) {
        options.lazyLoadQueue.push({
          div: renderer.canvas,
          load
        });
      } else {
        renderer.lazyLoadQueue = new LazyLoadQueue();
        load();
      }

      return Promise.all(cachedPromises).then(() => Promise.all(loadPromises)).then(() => {});
    });

    // recordPromise(loadPromise, 'render emojis: ' + docIds.length);

    options.loadPromises?.push(loadPromise);
  }

  return fragment;
}

(window as any).wrapRichText = wrapRichText;
