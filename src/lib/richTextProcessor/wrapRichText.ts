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
import animationIntersector from '../../components/animationIntersector';
import type {MyDocument} from '../appManagers/appDocsManager';
import LazyLoadQueue from '../../components/lazyLoadQueue';
import {Awaited} from '../../types';
import sequentialDom from '../../helpers/sequentialDom';
import {MediaSize} from '../../helpers/mediaSize';
import IS_WEBM_SUPPORTED from '../../environment/webmSupport';

const resizeObserver = new ResizeObserver((entries) => {
  for(const entry of entries) {
    const renderer = entry.target.parentElement as CustomEmojiRendererElement;
    renderer.setDimensionsFromRect(entry.contentRect);
  }
});

class CustomEmojiElement extends HTMLElement {

}

export class CustomEmojiRendererElement extends HTMLElement {
  public canvas: HTMLCanvasElement;
  public context: CanvasRenderingContext2D;

  public players: Map<CustomEmojiElement[], RLottiePlayer>;
  public clearedContainers: Set<CustomEmojiElement[]>;

  public paused: boolean;
  public autoplay: boolean;

  public middleware: () => boolean;
  public keys: string[];

  constructor() {
    super();

    this.classList.add('custom-emoji-renderer');
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('custom-emoji-canvas');
    this.context = this.canvas.getContext('2d');
    this.append(this.canvas);

    this.paused = false;
    this.autoplay = true;
    this.players = new Map();
    this.clearedContainers = new Set();
    this.keys = [];
  }

  public connectedCallback() {
    // this.setDimensions();
    animationIntersector.addAnimation(this, 'EMOJI');
    resizeObserver.observe(this.canvas);

    this.connectedCallback = undefined;
  }

  public disconnectedCallback() {
    for(const key of this.keys) {
      const l = lotties.get(key);
      if(!l) {
        continue;
      }

      if(!--l.counter) {
        if(l.player instanceof RLottiePlayer) {
          l.player.remove();
        }

        lotties.delete(key);

        if(!lotties.size) {
          clearRenderInterval();
        }
      }
    }

    resizeObserver.unobserve(this.canvas);

    this.disconnectedCallback = undefined;
  }

  public getOffsets(offsetsMap: Map<CustomEmojiElement[], {top: number, left: number}[]> = new Map()) {
    for(const [containers, player] of this.players) {
      const offsets = containers.map((container) => {
        return {
          top: container.offsetTop,
          left: container.offsetLeft
        };
      });

      offsetsMap.set(containers, offsets);
    }

    return offsetsMap;
  }

  public clearCanvas() {
    const {context, canvas} = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  public render(offsetsMap: ReturnType<CustomEmojiRendererElement['getOffsets']>) {
    const {context, canvas} = this;
    const {width, height, dpr} = canvas;
    for(const [containers, player] of this.players) {
      const frame = topFrames.get(player);
      if(!frame) {
        continue;
      }

      const isImageData = frame instanceof ImageData;
      const {width: stickerWidth, height: stickerHeight} = player.canvas[0];
      const offsets = offsetsMap.get(containers);
      const maxTop = height - stickerHeight;
      const maxLeft = width - stickerWidth;

      if(!this.clearedContainers.has(containers)) {
        containers.forEach((container) => {
          container.textContent = '';
        });

        this.clearedContainers.add(containers);
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
          context.drawImage(frame as ImageBitmap, left, top, stickerWidth, stickerHeight);
        }
      });
    }
  }

  public checkForAnyFrame() {
    for(const [containers, player] of this.players) {
      if(topFrames.has(player)) {
        return true;
      }
    }

    return false;
  }

  public pause() {
    this.paused = true;
  }

  public play() {
    this.paused = false;
  }

  public remove() {
    this.canvas.remove();
  }

  public setDimensions() {
    const {canvas} = this;
    sequentialDom.mutateElement(canvas, () => {
      const rect = canvas.getBoundingClientRect();
      this.setDimensionsFromRect(rect);
    });
  }

  public setDimensionsFromRect(rect: DOMRect) {
    const {canvas} = this;
    const dpr = canvas.dpr ??= Math.min(2, window.devicePixelRatio);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
}

type R = CustomEmojiRendererElement;

let renderInterval: number;
const top: Array<R> = [];
const topFrames: Map<RLottiePlayer, Parameters<RLottiePlayer['overrideRender']>[0]> = new Map();
const lotties: Map<string, {player: Promise<RLottiePlayer> | RLottiePlayer, middlewares: Set<() => boolean>, counter: number}> = new Map();
const rerere = () => {
  const t = top.filter((r) => !r.paused && r.isConnected && r.checkForAnyFrame());
  if(!t.length) {
    return;
  }

  const offsetsMap: Map<CustomEmojiElement[], {top: number, left: number}[]> = new Map();
  for(const r of t) {
    r.getOffsets(offsetsMap);
  }

  for(const r of t) {
    r.clearCanvas();
  }

  for(const r of t) {
    r.render(offsetsMap);
  }
};
const CUSTOM_EMOJI_FPS = 60;
const CUSTOM_EMOJI_FRAME_INTERVAL = 1000 / CUSTOM_EMOJI_FPS;
const setRenderInterval = () => {
  if(renderInterval) {
    return;
  }

  renderInterval = window.setInterval(rerere, CUSTOM_EMOJI_FRAME_INTERVAL);
  rerere();
};
const clearRenderInterval = () => {
  if(!renderInterval) {
    return;
  }

  clearInterval(renderInterval);
  renderInterval = undefined;
};

(window as any).lotties = lotties;

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
  nasty?: {
    i: number,
    usedLength: number,
    text: string,
    lastEntity?: MessageEntity
  },
  voodoo?: boolean,
  customEmojis?: {[docId: DocId]: CustomEmojiElement[]},
  loadPromises?: Promise<any>[],
  middleware?: () => boolean,
  wrappingSpoiler?: boolean,
  lazyLoadQueue?: LazyLoadQueue,
  customEmojiSize?: MediaSize
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
    const middleware = options.middleware;
    const renderer = new CustomEmojiRendererElement();
    renderer.middleware = middleware;
    top.push(renderer);
    fragment.prepend(renderer);

    const size = options.customEmojiSize || mediaSizes.active.customEmoji;
    const loadPromise = managers.appEmojiManager.getCachedCustomEmojiDocuments(docIds).then((docs) => {
      console.log(docs);
      if(middleware && !middleware()) return;

      const loadPromises: Promise<any>[] = [];
      const wrap = (doc: MyDocument, _loadPromises?: Promise<any>[]): Promise<Awaited<ReturnType<typeof wrapSticker>> & {onRender?: () => void}> => {
        const containers = customEmojis[doc.id];
        const isLottie = doc.sticker === 2;

        const loadPromises: Promise<any>[] = [];
        const promise = wrapSticker({
          div: containers,
          doc,
          width: size.width,
          height: size.height,
          loop: true,
          play: true,
          managers,
          isCustomEmoji: true,
          group: 'none',
          loadPromises,
          middleware,
          exportLoad: true,
          needFadeIn: false,
          loadStickerMiddleware: isLottie && middleware ? () => {
            if(lotties.get(key) !== l) {
              return false;
            }

            let good = !l.middlewares.size;
            for(const middleware of l.middlewares) {
              if(middleware()) {
                good = true;
              }
            }

            return good;
          } : undefined,
          static: doc.mime_type === 'video/webm' && !IS_WEBM_SUPPORTED
        });

        if(_loadPromises) {
          promise.then(() => _loadPromises.push(...loadPromises));
        }

        if(!isLottie) {
          return promise;
        }

        const onRender = (player: Awaited<Awaited<typeof promise>['render']>) => Promise.all(loadPromises).then(() => {
          if(player instanceof RLottiePlayer && (!middleware || middleware())) {
            l.player = player;

            const playerCanvas = player.canvas[0];
            renderer.canvas.dpr = playerCanvas.dpr;
            renderer.players.set(containers, player);

            setRenderInterval();

            player.overrideRender ??= (frame) => {
              topFrames.set(player, frame);
              // frames.set(containers, frame);
            };

            l.middlewares.delete(middleware);
          }
        });

        const key = [doc.id, size.width, size.height].join('-');
        renderer.keys.push(key);
        let l = lotties.get(key);
        if(!l) {
          l = {
            player: undefined,
            middlewares: new Set(),
            counter: 0
          };

          lotties.set(key, l);
        }

        ++l.counter;

        if(middleware) {
          l.middlewares.add(middleware);
        }

        return promise.then((res) => ({...res, onRender}));
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
          const promises = arr.map(({load, onRender}) => {
            if(!load) {
              return;
            }

            return load().then(onRender);
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
