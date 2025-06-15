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
import {MessageEntity} from '../../layer';
import encodeSpoiler from './encodeSpoiler';
import parseEntities from './parseEntities';
import setBlankToAnchor from './setBlankToAnchor';
import wrapUrl from './wrapUrl';
import EMOJI_VERSIONS_SUPPORTED from '../../environment/emojiVersionsSupport';
import {CLICK_EVENT_NAME} from '../../helpers/dom/clickEvent';
import IS_CUSTOM_EMOJI_SUPPORTED from '../../environment/customEmojiSupport';
import BOM from '../../helpers/string/bom';
import wrapTelegramUrlToAnchor from './wrapTelegramUrlToAnchor';
import {IS_FIREFOX} from '../../environment/userAgent';
import CustomEmojiElement, {CustomEmojiElements} from '../customEmoji/element';
import {CustomEmojiRendererElementOptions, CustomEmojiRendererElement} from '../customEmoji/renderer';
import {setDirection} from '../../helpers/dom/setInnerHTML';
import {i18n} from '../langPack';
import Icon from '../../components/icon';
import {CodeLanguageAliases, highlightCode} from '../../codeLanguages';
import callbackify from '../../helpers/callbackify';
import findIndexFrom from '../../helpers/array/findIndexFrom';
import {observeResize} from '../../components/resizeObserver';
import createElementFromMarkup from '../../helpers/createElementFromMarkup';
import DotRenderer from '../../components/dotRenderer';
import isMixedScriptUrl from '../../helpers/string/isMixedScriptUrl';

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
  passMaskedLinks?: boolean,

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
  ignoreNextIndex?: number,
  doubleLinebreak?: number
  textColor?: string
}> & CustomEmojiRendererElementOptions;

function createMarkupFormatting(formatting: string) {
  const element = document.createElement('span');
  element.style.fontFamily = 'markup-' + formatting;
  element.classList.add('is-markup');
  element.dataset.markup = formatting;
  return element;
}

function onQuoteResize(entry: ResizeObserverEntry) {
  const target = entry.target as HTMLElement;
  if((target as any).ignoreQuoteResize) {
    if(Date.now() < (target as any).ignoreQuoteResize) {
      return;
    }

    delete (target as any).ignoreQuoteResize;
  }

  const scrollHeight = target.scrollHeight;
  if(!scrollHeight) {
    return;
  }

  const padding = entry.contentRect.bottom - entry.contentRect.height + entry.contentRect.top;
  // const margin = (entry.borderBoxSize[0].blockSize - entry.contentBoxSize[0].blockSize) * 2;
  const margin = 0;
  const diff = scrollHeight - padding - margin - Math.floor(entry.contentRect.height);
  const isExpanded = diff <= 1;

  // console.log('quote resize', entry, scrollHeight, entry.contentRect.height, isExpanded, diff);
  target.style.setProperty('--quote-max-height', scrollHeight + 'px');
  target.classList.toggle('is-truncated', !isExpanded);
}

function makeQuoteCollapsable(element: HTMLElement) {
  element.classList.add('quote-like-collapsable');

  const collapseIcon = document.createElement('span');
  collapseIcon.classList.add('quote-like-icon', 'quote-like-collapse');
  element.append(collapseIcon);

  return observeResize(element, onQuoteResize);
}

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
      property: 'alt',
      usedText = false,
      processingBlockElement = false;
    switch(entity._) {
      case 'messageEntityBold': {
        if(!options.noTextFormat) {
          if(options.wrappingDraft) {
            element = createMarkupFormatting('bold');
          } else {
            element = document.createElement('strong');
          }
        }

        break;
      }

      case 'messageEntityItalic': {
        if(!options.noTextFormat) {
          if(options.wrappingDraft) {
            element = createMarkupFormatting('italic');
          } else {
            element = document.createElement('em');
          }
        }

        break;
      }

      case 'messageEntityStrike': {
        if(options.wrappingDraft) {
          element = createMarkupFormatting('strikethrough');
          // element = document.createElement('span');
          // const styleName = IS_SAFARI ? 'text-decoration' : 'text-decoration-line';
          // element.style.cssText = `${styleName}: line-through;`;
          // element.style.fontFamily = 'markup-strikethrough';
        } else/*  if(!options.noTextFormat) */ {
          element = document.createElement('del');
        }

        break;
      }

      case 'messageEntityUnderline': {
        if(options.wrappingDraft) {
          element = createMarkupFormatting('underline');
          // element = document.createElement('span');
          // const styleName = IS_SAFARI ? 'text-decoration' : 'text-decoration-line';
          // element.style.cssText = `${styleName}: underline;`;
          // element.style.fontFamily = 'markup-underline';
        } else if(!options.noTextFormat) {
          element = document.createElement('u');
        }

        break;
      }

      case 'messageEntityPre':
      case 'messageEntityCode': {
        const entityLanguage = (entity as MessageEntity.messageEntityPre).language;
        if(options.wrappingDraft) {
          element = createMarkupFormatting('monospace');
          if(entityLanguage) {
            element.dataset.language = entityLanguage;
          }
          // element = document.createElement('span');
          // element.style.fontFamily = 'var(--font-monospace)';
          // element.style.fontFamily = 'markup-monospace';
        } else if(entity._ === 'messageEntityPre' && !options.noTextFormat) {
          const container = document.createElement('pre');
          const content = document.createElement('div');
          content.classList.add('code-content');
          element = document.createElement('code');
          element.classList.add('code-code');
          fragment.append(container);
          content.append(element);

          container.classList.add('quote-like', 'quote-like-border', 'code');

          const languageName = CodeLanguageAliases[entityLanguage.toLowerCase()];

          const header = document.createElement('div');
          header.classList.add('code-header');
          const headerName = document.createElement('span');
          headerName.classList.add('code-header-name');
          headerName.append(languageName || i18n('CopyCode'));
          const headerWrapButton = Icon('menu', 'code-header-button', 'code-header-toggle-wrap');
          header.append(headerName, headerWrapButton, Icon('copy', 'code-header-button', 'code-header-copy'));

          container.append(header, content);

          const result = languageName && highlightCode(fullEntityText, languageName);
          result && callbackify(result, (html) => {
            if(html) {
              element.innerHTML = html;
            }
          });

          usedText = true;
          if(!result || result instanceof Promise) {
            element.textContent = fullEntityText;
          }

          let lastInnerEntityIndex = findIndexFrom(entities, (n) => n.offset >= endOffset, nasty.i + 1);
          if(lastInnerEntityIndex === -1) lastInnerEntityIndex = entities.length - 1;
          else lastInnerEntityIndex -= 1;
          nasty.i = lastInnerEntityIndex;
          nasty.usedLength = endOffset;
          nasty.lastEntity = entities[lastInnerEntityIndex];
          nextEntity = undefined;
          processingBlockElement = true;
        } else if(!options.noTextFormat) {
          element = document.createElement('code');
          element.classList.add('monospace-text');
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
          element.className = 'emoji emoji-image';

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
          element.className = 'emoji emoji-native';
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
        // slice linebreaks before and after quote
        if(options.ignoreNextIndex === nasty.i || (options.wrappingDraft && nextEntity?._ === 'messageEntityBlockquote' && nextEntity.offset === endOffset)) {
          usedText = true;
        } else if(options.wrappingDraft && IS_FIREFOX) {
          element = document.createElement('br');
          usedText = true;
        }

        if(options.doubleLinebreak === nasty.i) {
          options.doubleLinebreak = undefined;
          (element || fragment).append('\n\n');
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
            masked = isMixedScriptUrl(url);
            // inner = encodeEntities(replaceUrlEncodings(entityText));
          }

          const currentContext = !!onclick;
          if(!onclick && masked && !currentContext && !options.passMaskedLinks) {
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

          if(!IS_FIREFOX) { // Firefox has very poor performance when drawing on canvas
            element = document.createElement('span');
            element.append(...partText.split('').map((encodedLetter, i) => createElementFromMarkup(`<span class="bluff-spoiler" style="--index:${i}">${encodedLetter}</span>`)))
            fragment.append(element);

            DotRenderer.attachBluffTextSpoilerTarget(element);

            usedText = true;
          }
        } else if(options.wrappingDraft) {
          element = createMarkupFormatting('spoiler');
          // element = document.createElement('span');
          // element.style.fontFamily = 'spoiler';
          // element.style.fontFamily = 'markup-spoiler';
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

      case 'messageEntityBlockquote': {
        if(options.noTextFormat) {
          break;
        }

        if(options.wrappingDraft) {
          element = createMarkupFormatting('quote');

          // * ? because of layer migration
          if(entity.pFlags?.collapsed) {
            element.dataset.collapsed = '1';
          }
        } else {
          element = document.createElement('blockquote');
          element.classList.add('quote');

          // * ? because of layer migration
          if(entity.pFlags?.collapsed/*  || true */) {
            const dispose = makeQuoteCollapsable(element);
            options.middleware.onClean(dispose);
          }
        }

        element.classList.add('quote-like', 'quote-like-border', 'quote-like-icon');
        setDirection(element);

        processingBlockElement = true;
        break;
      }
    }

    if(processingBlockElement) {
      let foundNextLinebreakIndex = -1;
      for(let i = nasty.i; i < length; ++i) {
        const n = entities[i];
        if(n._ === 'messageEntityLinebreak' && n.offset >= endOffset) {
          foundNextLinebreakIndex = i;
          break;
        }
      }

      if(foundNextLinebreakIndex !== -1 && nasty.text.slice(endOffset, entities[foundNextLinebreakIndex].offset).trim()) {
        foundNextLinebreakIndex = -1;
      }

      if(!options.wrappingDraft && endOffset < nasty.text.length) {
        // * ignore inner linebreak if found and double next linebreak
        if(!element.parentElement) {
          const container = document.createElement('div');
          container.append(element);
          fragment.append(container);
        }

        if(nasty.text[endOffset - 1] === '\n') {
          let lastInnerLinebreakIndex = -1;
          for(let i = nasty.i; i < length; ++i) {
            const n = entities[i];
            if(n.offset >= endOffset) {
              break;
            }

            if(n._ === 'messageEntityLinebreak') {
              lastInnerLinebreakIndex = i;
            }
          }

          if(lastInnerLinebreakIndex !== -1) {
            options.ignoreNextIndex = lastInnerLinebreakIndex;
          }
        } else if(foundNextLinebreakIndex !== -1) {
          options.ignoreNextIndex = foundNextLinebreakIndex;
        }

        // if(nasty.text[endOffset - 1] === '\n' &&
        //   foundNextLinebreakIndex !== -1 &&
        //   nasty.text[endPartOffset + 1] === '\n') {
        //   options.ignoreNextIndex = foundNextLinebreakIndex - 1;
        //   options.doubleLinebreak = foundNextLinebreakIndex;
        // }
      }

      if(options.wrappingDraft && foundNextLinebreakIndex !== -1) {
        options.ignoreNextIndex = foundNextLinebreakIndex;
      }

      // if(!options.wrappingDraft) {
      //   const i = Icon('quote', 'quote-icon');
      //   element.textContent = partText;
      //   usedText = true;
      //   element.prepend(i);
      // } else {
      //   element.classList.add('quote-use-before');
      // }
    }

    if(!usedText && partText) {
      if(element) {
        if(property) {
          // @ts-ignore
          element[property] = partText;
        } else {
          element.append(partText);
        }
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

    if(options.textColor) {
      renderer.setTextColor(options.textColor);
    }

    const loadPromise = renderer.add({
      addCustomEmojis: customEmojis,
      lazyLoadQueue: options.lazyLoadQueue,
      onlyThumb: options.wrappingDraft
    });
    options.loadPromises?.push(loadPromise);
    // recordPromise(loadPromise, 'render emojis: ' + docIds.length);
  }

  if(customWraps.size) {
    insertCustomFillers(customWraps);
  }

  fragment.normalize();

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
