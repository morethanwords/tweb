/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { EMOJI_VERSION } from "../../environment/emojiVersionsSupport";
import { SITE_HASHTAGS } from ".";
import { EmojiVersions } from "../../config/emoji";
import IS_EMOJI_SUPPORTED from "../../environment/emojiSupport";
import { IS_SAFARI } from "../../environment/userAgent";
import buildURLHash from "../../helpers/buildURLHash";
import copy from "../../helpers/object/copy";
import encodeEntities from "../../helpers/string/encodeEntities";
import { MessageEntity } from "../../layer";
import encodeSpoiler from "./encodeSpoiler";
import parseEntities from "./parseEntities";
import setBlankToAnchor from "./setBlankToAnchor";
import wrapUrl from "./wrapUrl";
import EMOJI_VERSIONS_SUPPORTED from "../../environment/emojiVersionsSupport";
import { CLICK_EVENT_NAME } from "../../helpers/dom/clickEvent";

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
  //mustWrapEmoji: boolean,
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
  voodoo?: boolean
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

        //if(!(options.wrappingDraft && isSupported)) { // * fix safari emoji
        if(!isSupported) { // no wrapping needed
          // if(isSupported) { // ! contenteditable="false" нужен для поля ввода, иначе там будет меняться шрифт в Safari, или же рендерить смайлик напрямую, без контейнера
          //   insertPart(entity, '<span class="emoji">', '</span>');
          // } else {
            element = document.createElement('img');
            (element as HTMLImageElement).src = `assets/img/emoji/${entity.unicode}.png`;
            property = 'alt';
            element.className = 'emoji';
          // }
        //} else if(options.mustWrapEmoji) {
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
              nasty.i++;
            }

            if(url !== fullEntityText) {
              masked = true;
            }
          } else {
            //inner = encodeEntities(replaceUrlEncodings(entityText));
          }

          const currentContext = !!onclick;
          if(!onclick && masked && !currentContext) {
            onclick = 'showMaskedAlert';
          }

          if(options.wrappingDraft) {
            onclick = undefined;
          }

          const href = (currentContext || typeof electronHelpers === 'undefined') 
            ? url
            : `javascript:electronHelpers.openExternal('${url}');`;

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

  return fragment;
}

(window as any).wrapRichText = wrapRichText;
