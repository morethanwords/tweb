/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import emojiRegExp from '../vendor/emoji/regex';
import { encodeEmoji, toCodePoints } from '../vendor/emoji';
import { Message, MessageEntity } from '../layer';
import { IS_SAFARI } from '../environment/userAgent';
import { MOUNT_CLASS_TO } from '../config/debug';
import IS_EMOJI_SUPPORTED from '../environment/emojiSupport';
import copy from '../helpers/object/copy';
import encodeEntities from '../helpers/string/encodeEntities';
import Emoji, { EmojiVersions } from '../config/emoji';
import TLD from '../config/tld';

const EmojiHelper = {
  emojiMap: (code: string) => { return code; },
  shortcuts: [] as any,
  emojis: [] as any
};

const alphaCharsRegExp = 'a-z' +
  '\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u00ff' + // Latin-1
  '\\u0100-\\u024f' + // Latin Extended A and B
  '\\u0253\\u0254\\u0256\\u0257\\u0259\\u025b\\u0263\\u0268\\u026f\\u0272\\u0289\\u028b' + // IPA Extensions
  '\\u02bb' + // Hawaiian
  '\\u0300-\\u036f' + // Combining diacritics
  '\\u1e00-\\u1eff' + // Latin Extended Additional (mostly for Vietnamese)
  '\\u0400-\\u04ff\\u0500-\\u0527' + // Cyrillic
  '\\u2de0-\\u2dff\\ua640-\\ua69f' + // Cyrillic Extended A/B
  '\\u0591-\\u05bf\\u05c1-\\u05c2\\u05c4-\\u05c5\\u05c7' +
  '\\u05d0-\\u05ea\\u05f0-\\u05f4' + // Hebrew
  '\\ufb1d-\\ufb28\\ufb2a-\\ufb36\\ufb38-\\ufb3c\\ufb3e\\ufb40-\\ufb41' +
  '\\ufb43-\\ufb44\\ufb46-\\ufb4f' + // Hebrew Pres. Forms
  '\\u0610-\\u061a\\u0620-\\u065f\\u066e-\\u06d3\\u06d5-\\u06dc' +
  '\\u06de-\\u06e8\\u06ea-\\u06ef\\u06fa-\\u06fc\\u06ff' + // Arabic
  '\\u0750-\\u077f\\u08a0\\u08a2-\\u08ac\\u08e4-\\u08fe' + // Arabic Supplement and Extended A
  '\\ufb50-\\ufbb1\\ufbd3-\\ufd3d\\ufd50-\\ufd8f\\ufd92-\\ufdc7\\ufdf0-\\ufdfb' + // Pres. Forms A
  '\\ufe70-\\ufe74\\ufe76-\\ufefc' + // Pres. Forms B
  '\\u200c' + // Zero-Width Non-Joiner
  '\\u0e01-\\u0e3a\\u0e40-\\u0e4e' + // Thai
  '\\u1100-\\u11ff\\u3130-\\u3185\\uA960-\\uA97F\\uAC00-\\uD7AF\\uD7B0-\\uD7FF' + // Hangul (Korean)
  '\\u3003\\u3005\\u303b' + // Kanji/Han iteration marks
  '\\uff21-\\uff3a\\uff41-\\uff5a' + // full width Alphabet
  '\\uff66-\\uff9f' + // half width Katakana
  '\\uffa1-\\uffdc'; // half width Hangul (Korean)
const alphaNumericRegExp = '0-9\_' + alphaCharsRegExp;
const domainAddChars = '\u00b7';
// Based on Regular Expression for URL validation by Diego Perini
const urlAlphanumericRegExpPart = '[' + alphaCharsRegExp + '0-9]';
const urlProtocolRegExpPart = '((?:https?|ftp)://|mailto:)?';
const urlRegExp = urlProtocolRegExpPart +
  // user:pass authentication
  '(?:' + urlAlphanumericRegExpPart + '{1,64}(?::' + urlAlphanumericRegExpPart + '{0,64})?@)?' +
  '(?:' +
  // sindresorhus/ip-regexp
  '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(?:\\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])){3}' +
  '|' +
  // host name
  urlAlphanumericRegExpPart + '[' + alphaCharsRegExp + domainAddChars + '0-9\-]{0,64}' +
  // domain name
  '(?:\\.' + urlAlphanumericRegExpPart + '[' + alphaCharsRegExp + domainAddChars + '0-9\-]{0,64}){0,10}' +
  // TLD identifier
  '(?:\\.(xn--[0-9a-z]{2,16}|[' + alphaCharsRegExp + ']{2,24}))' +
  ')' +
  // port number
  '(?::\\d{2,5})?' +
  // resource path
  '(?:/(?:\\S{0,255}[^\\s.;,(\\[\\]{}<>"\'])?)?';
const urlProtocolRegExp = new RegExp('^' + urlProtocolRegExpPart.slice(0, -1), 'i');
const urlAnyProtocolRegExp = /^((?:[^\/]+?):\/\/|mailto:)/;
const usernameRegExp = '[a-zA-Z\\d_]{5,32}';
const botCommandRegExp = '\\/([a-zA-Z\\d_]{1,32})(?:@(' + usernameRegExp + '))?(\\b|$)';
const fullRegExp = new RegExp('(^| )(@)(' + usernameRegExp + ')|(' + urlRegExp + ')|(\\n)|(' + emojiRegExp + ')|(^|[\\s\\(\\]])(#[' + alphaNumericRegExp + ']{2,64})|(^|\\s)' + botCommandRegExp, 'i');
const emailRegExp = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
//const markdownTestRegExp = /[`_*@~]/;
const markdownRegExp = /(^|\s|\n)(````?)([\s\S]+?)(````?)([\s\n\.,:?!;]|$)|(^|\s|\x01)(`|~~|\*\*|__|_-_|\|\|)([^\n]+?)\7([\x01\s\.,:?!;]|$)|@(\d+)\s*\((.+?)\)|(\[(.+?)\]\((.+?)\))/m;
const siteHashtags: {[siteName: string]: string} = {
  Telegram: 'tg://search_hashtag?hashtag={1}',
  Twitter: 'https://twitter.com/hashtag/{1}',
  Instagram: 'https://instagram.com/explore/tags/{1}/',
  'Google Plus': 'https://plus.google.com/explore/{1}'
};

const siteMentions: {[siteName: string]: string} = {
  Telegram: '#/im?p=%40{1}',
  Twitter: 'https://twitter.com/{1}',
  Instagram: 'https://instagram.com/{1}/',
  GitHub: 'https://github.com/{1}'
};
const markdownEntities: {[markdown: string]: MessageEntity['_']} = {
  '`': 'messageEntityCode',
  '``': 'messageEntityPre',
  '**': 'messageEntityBold',
  '__': 'messageEntityItalic',
  '~~': 'messageEntityStrike',
  '_-_': 'messageEntityUnderline',
  '||': 'messageEntitySpoiler'
};

const passConflictingEntities: Set<MessageEntity['_']> = new Set([
  'messageEntityEmoji',
  'messageEntityLinebreak',
  'messageEntityCaret'
]);
for(let i in markdownEntities) {
  passConflictingEntities.add(markdownEntities[i]);
}

namespace RichTextProcessor {
  export const PHONE_NUMBER_REG_EXP = /^\+\d+$/;

  export function getEmojiUnified(emojiCode: string) {
    let unified = encodeEmoji(emojiCode).replace(/-?fe0f/g, '');
  
    /* if(unified === '1f441-200d-1f5e8') {
      //unified = '1f441-fe0f-200d-1f5e8-fe0f';
      unified = '1f441-fe0f-200d-1f5e8';
    } */
  
    if(!Emoji.hasOwnProperty(unified) 
      // && !emojiData.hasOwnProperty(unified.replace(/-?fe0f$/, ''))
    ) {
      //console.error('lol', unified);
      return;
    }
  
    return unified;
  }

  export function parseEntities(text: string) {
    let match: any;
    let raw = text;
    const entities: MessageEntity[] = [];
    let matchIndex;
    let rawOffset = 0;
    // var start = tsNow()
    fullRegExp.lastIndex = 0;
    while((match = raw.match(fullRegExp))) {
      matchIndex = rawOffset + match.index;
  
      //console.log('parseEntities match:', match);
  
      if(match[3]) { // mentions
        entities.push({
          _: 'messageEntityMention',
          offset: matchIndex + match[1].length,
          length: match[2].length + match[3].length
        });
      } else if(match[4]) {
        if(emailRegExp.test(match[4])) { // email
          entities.push({
            _: 'messageEntityEmail',
            offset: matchIndex,
            length: match[4].length
          });
        } else {
          let url: string;
          let protocol = match[5];
          const tld = match[6];
          // let excluded = '';
          if(tld) { // URL
            if(!protocol && (tld.substr(0, 4) === 'xn--' || TLD.indexOf(tld.toLowerCase()) !== -1)) {
              protocol = 'http://';
            }
  
            if(protocol) {
              const balanced = checkBrackets(match[4]);
              if(balanced.length !== match[4].length) {
                // excluded = match[4].substring(balanced.length);
                match[4] = balanced;
              }
  
              url = (match[5] ? '' : protocol) + match[4];
            }
          } else { // IP address
            url = (match[5] ? '' : 'http://') + match[4];
          }
  
          if(url) {
            entities.push({
              _: 'messageEntityUrl',
              offset: matchIndex,
              length: match[4].length
            });
          }
        }
      } else if(match[7]) { // New line
        entities.push({
          _: 'messageEntityLinebreak',
          offset: matchIndex,
          length: 1
        });
      } else if(match[8]) { // Emoji
        //console.log('hit', match[8]);
        const unified = getEmojiUnified(match[8]);
        if(unified) {
          entities.push({
            _: 'messageEntityEmoji',
            offset: matchIndex,
            length: match[8].length,
            unicode: unified
          });
        }
      } else if(match[11]) { // Hashtag
        entities.push({
          _: 'messageEntityHashtag',
          offset: matchIndex + (match[10] ? match[10].length : 0),
          length: match[11].length
        });
      } else if(match[13]) { // Bot command
        entities.push({
          _: 'messageEntityBotCommand',
          offset: matchIndex + (match[11] ? match[11].length : 0) + (match[12] ? match[12].length : 0),
          length: 1 + match[13].length + (match[14] ? 1 + match[14].length : 0),
          unsafe: true
        });
      }
  
      raw = raw.substr(match.index + match[0].length);
      rawOffset += match.index + match[0].length;
    }
  
    // if (entities.length) {
    //   console.log('parse entities', text, entities.slice())
    // }
    return entities;
  }

  /* export function parseEmojis(text: string) {
    return text.replace(/:([a-z0-9\-\+\*_]+?):/gi, function (all, shortcut) {
      var emojiCode = EmojiHelper.shortcuts[shortcut]
      if (emojiCode !== undefined) {
        return EmojiHelper.emojis[emojiCode][0]
      }
      return all
    })
  } */

  export function parseMarkdown(raw: string, currentEntities: MessageEntity[], noTrim?: boolean): string {
    /* if(!markdownTestRegExp.test(text)) {
      return noTrim ? text : text.trim();
    } */

    const entities: MessageEntity[] = [];
    let pushedEntity = false;
    const pushEntity = (entity: MessageEntity) => !findConflictingEntity(currentEntities, entity) ? (entities.push(entity), pushedEntity = true) : pushedEntity = false;

    const newTextParts: string[] = [];
    let rawOffset = 0, match;
    while(match = raw.match(markdownRegExp)) {
      const matchIndex = rawOffset + match.index;
      newTextParts.push(raw.substr(0, match.index));
      const text = (match[3] || match[8] || match[11] || match[13]);
      rawOffset -= text.length;
      //text = text.replace(/^\s+|\s+$/g, '');
      rawOffset += text.length;

      let entity: MessageEntity;
      pushedEntity = false;
      if(text.match(/^`*$/)) {
        newTextParts.push(match[0]);
      } else if(match[3]) { // pre
        entity = {
          _: 'messageEntityPre',
          language: '',
          offset: matchIndex + match[1].length,
          length: text.length
        };

        if(pushEntity(entity)) {
          if(match[5] === '\n') {
            match[5] = '';
            rawOffset -= 1;
          }
  
          newTextParts.push(match[1] + text + match[5]);
          
          rawOffset -= match[2].length + match[4].length;
        }
      } else if(match[7]) { // code|italic|bold
        const isSOH = match[6] === '\x01';

        entity = {
          _: markdownEntities[match[7]] as (MessageEntity.messageEntityBold | MessageEntity.messageEntityCode | MessageEntity.messageEntityItalic | MessageEntity.messageEntitySpoiler)['_'],
          //offset: matchIndex + match[6].length,
          offset: matchIndex + (isSOH ? 0 : match[6].length),
          length: text.length
        };

        if(pushEntity(entity)) {
          if(!isSOH) {
            newTextParts.push(match[6] + text + match[9]);
          } else {
            newTextParts.push(text);
          }
  
          rawOffset -= match[7].length * 2 + (isSOH ? 2 : 0);
        }
      } else if(match[11]) { // custom mention
        entity = {
          _: 'messageEntityMentionName',
          user_id: match[10].toUserId(),
          offset: matchIndex,
          length: text.length
        };
        
        if(pushEntity(entity)) {
          newTextParts.push(text);
          
          rawOffset -= match[0].length - text.length;
        }
      } else if(match[12]) { // text url
        entity = {
          _: 'messageEntityTextUrl',
          url: match[14],
          offset: matchIndex,
          length: text.length
        };
        
        if(pushEntity(entity)) {
          newTextParts.push(text);

          rawOffset -= match[12].length - text.length;
        }
      }

      if(!pushedEntity) {
        newTextParts.push(match[0]);
      }

      raw = raw.substr(match.index + match[0].length);
      rawOffset += match.index + match[0].length;
    }

    newTextParts.push(raw);
    let newText = newTextParts.join('');
    if(!newText.replace(/\s+/g, '').length) {
      newText = raw;
      entities.splice(0, entities.length);
    }

    // ! idk what it was here for
    // if(!entities.length && !noTrim) {
    //   newText = newText.trim();
    // }

    mergeEntities(currentEntities, entities);
    combineSameEntities(currentEntities);

    let length = newText.length;
    if(!noTrim) {
      // trim left
      newText = newText.replace(/^\s*/, '');

      let diff = length - newText.length;
      if(diff) {
        currentEntities.forEach(entity => {
          entity.offset = Math.max(0, entity.offset - diff);
        });
      }

      // trim right
      newText = newText.replace(/\s*$/, '');
      diff = length - newText.length;
      length = newText.length;
      if(diff) {
        currentEntities.forEach(entity => {
          if((entity.offset + entity.length) > length) {
            entity.length = length - entity.offset;
          }
        });
      }
    }

    return newText;
  }

  export function findConflictingEntity(currentEntities: MessageEntity[], newEntity: MessageEntity) {
    return currentEntities.find(currentEntity => {
      const isConflictingTypes = newEntity._ === currentEntity._ || 
        (!passConflictingEntities.has(newEntity._) && !passConflictingEntities.has(currentEntity._));

      if(!isConflictingTypes) {
        return false;
      }

      const isConflictingOffset = newEntity.offset >= currentEntity.offset && 
        (newEntity.length + newEntity.offset) <= (currentEntity.length + currentEntity.offset);

      return isConflictingOffset;
    });
  }

  export function mergeEntities(currentEntities: MessageEntity[], newEntities: MessageEntity[]) {
    const filtered = newEntities.filter(e => {
      return !findConflictingEntity(currentEntities, e);
    });

    currentEntities.push(...filtered);
    sortEntities(currentEntities);
    // currentEntities.sort((a, b) => a.offset - b.offset);
    // currentEntities.sort((a, b) => (a.offset - b.offset) || (a._ === 'messageEntityCaret' && -1));

    // * fix splitted emoji. messageEntityTextUrl can split the emoji if starts before its end (e.g. on fe0f)
    // * have to fix even if emoji supported since it's being wrapped in span
    // if(!IS_EMOJI_SUPPORTED) {
      for(let i = 0; i < currentEntities.length; ++i) {
        const entity = currentEntities[i];
        if(entity._ === 'messageEntityEmoji') {
          const nextEntity = currentEntities[i + 1];
          if(nextEntity /* && nextEntity._ !== 'messageEntityCaret' */ && nextEntity.offset < (entity.offset + entity.length)) {
            entity.length = nextEntity.offset - entity.offset;
          }
        }
      }
    // }

    return currentEntities;
  }

  const CAN_COMBINE_ENTITIES: Set<MessageEntity['_']> = new Set([
    'messageEntityBold',
    'messageEntityItalic',
    'messageEntityCode',
    'messageEntityPre',
    'messageEntityUnderline',
    'messageEntityStrike',
    'messageEntityBlockquote',
    'messageEntitySpoiler'
  ]);
  export function combineSameEntities(entities: MessageEntity[]) {
    //entities = entities.slice();
    for(let i = 0; i < entities.length; ++i) {
      const entity = entities[i];

      let nextEntityIdx = -1;
      do {
        nextEntityIdx = entities.findIndex((e, _i) => {
          return CAN_COMBINE_ENTITIES.has(e._) && _i !== i && e._ === entity._ && (e.offset - entity.length) === entity.offset;
        });

        if(nextEntityIdx !== -1) {
          const nextEntity = entities[nextEntityIdx];
          entity.length += nextEntity.length;
          entities.splice(nextEntityIdx, 1);
        }
      } while(nextEntityIdx !== -1);
    }
    //return entities;
  }

  export function sortEntities(entities: MessageEntity[]) {
    entities.sort((a, b) => {
      return (a.offset - b.offset) || (b.length - a.length);
    });
  }

  function setBlankToAnchor(anchor: HTMLAnchorElement) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }

  /**
   * * Expecting correctly sorted nested entities (RichTextProcessor.sortEntities)
   */
   export function wrapRichText(text: string, options: Partial<{
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
                const emojiData = EmojiVersions[version];
                if(emojiData.hasOwnProperty(entity.unicode)) {
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
          const contextUrl = !options.noLinks && siteHashtags[contextSite];
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
            (element as HTMLAnchorElement).href = `#/im?p=${encodeURIComponent(entity.user_id)}`;
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
            const before = nasty.text.slice(0, entity.offset);
            const spoilerBefore = nasty.text.slice(entity.offset, entity.offset + entity.length);
            const spoilerAfter = partText = spoiler(spoilerBefore)/*  '▚'.repeat(entity.length) */;
            const after = nasty.text.slice(entity.offset + entity.length);
            nasty.text = before + spoilerAfter + after;
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

      while(nextEntity && nextEntity.offset < (endOffset - 1)) {
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

      if(entity.length > partText.length && element) {
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

  export function fixEmoji(text: string, entities?: MessageEntity[]) {
    /* if(!IS_EMOJI_SUPPORTED) {
      return text;
    } */
    // '$`\ufe0f'

    text = text.replace(/[\u2640\u2642\u2764](?!\ufe0f)/g, (match, offset, string) => {
      if(entities) {
        const length = match.length;

        offset += length;
        entities.forEach(entity => {
          const end = entity.offset + entity.length;
          if(end === offset) { // current entity
            entity.length += length;
          } else if(end > offset) {
            entity.offset += length;
          }
        });
      }
      
      // console.log([match, offset, string]);
      return match + '\ufe0f';
    });

    return text;
  }

  export function wrapDraftText(text: string, options: Partial<{
    entities: MessageEntity[]
  }> = {}) {
    if(!text) {
      return wrapRichText('');
    }

    return wrapRichText(text, {
      entities: options.entities, 
      noLinks: true,
      wrappingDraft: true,
      passEntities: {
        messageEntityTextUrl: true,
        messageEntityMentionName: true
      }
    });
  }

  export function checkBrackets(url: string) {
    var urlLength = url.length;
    var urlOpenBrackets = url.split('(').length - 1;
    var urlCloseBrackets = url.split(')').length - 1;
    while(urlCloseBrackets > urlOpenBrackets &&
      url.charAt(urlLength - 1) === ')') {
      url = url.substr(0, urlLength - 1)
      urlCloseBrackets--;
      urlLength--;
    }
    if(urlOpenBrackets > urlCloseBrackets) {
      url = url.replace(/\)+$/, '');
    }
    return url;
  }

  export function spoiler(text: string): string {
    const chars = '⠁⠂⠄⠈⠐⠠⡀⢀⠃⠅⠆⠉⠊⠌⠑⠒⠔⠘⠡⠢⠤⠨⠰⡁⡂⡄⡈⡐⡠⢁⢂⢄⢈⢐⢠⣀⠇⠋⠍⠎⠓⠕⠖⠙⠚⠜⠣⠥⠦⠩⠪⠬⠱⠲⠴⠸⡃⡅⡆⡉⡊⡌⡑⡒⡔⡘⡡⡢⡤⡨⡰⢃⢅⢆⢉⢊⢌⢑⢒⢔⢘⢡⢢⢤⢨⢰⣁⣂⣄⣈⣐⣠⠏⠗⠛⠝⠞⠧⠫⠭⠮⠳⠵⠶⠹⠺⠼⡇⡋⡍⡎⡓⡕⡖⡙⡚⡜⡣⡥⡦⡩⡪⡬⡱⡲⡴⡸⢇⢋⢍⢎⢓⢕⢖⢙⢚⢜⢣⢥⢦⢩⢪⢬⢱⢲⢴⢸⣃⣅⣆⣉⣊⣌⣑⣒⣔⣘⣡⣢⣤⣨⣰⠟⠯⠷⠻⠽⠾⡏⡗⡛⡝⡞⡧⡫⡭⡮⡳⡵⡶⡹⡺⡼⢏⢗⢛⢝⢞⢧⢫⢭⢮⢳⢵⢶⢹⢺⢼⣇⣋⣍⣎⣓⣕⣖⣙⣚⣜⣣⣥⣦⣩⣪⣬⣱⣲⣴⣸⠿⡟⡯⡷⡻⡽⡾⢟⢯⢷⢻⢽⢾⣏⣗⣛⣝⣞⣧⣫⣭⣮⣳⣵⣶⣹⣺⣼⡿⢿⣟⣯⣷⣻⣽⣾⣿';
    const charsLength = chars.length;
    
    const out: string[] = [];
    for(let i = 0; i < text.length; ++i) {
      let char = text.charCodeAt(i);
      out.push(chars[char % charsLength]);
    }

    return out.join('');
  }
  
  /* export function replaceUrlEncodings(urlWithEncoded: string) {
    return urlWithEncoded.replace(/(%[A-Z\d]{2})+/g, (str) => {
      try {
        return decodeURIComponent(str);
      } catch (e) {
        return str;
      }
    });
  } */
  
  /**
   * ! This function is still unsafe to use with .innerHTML
   */
  export function wrapPlainText(text: string, entities: MessageEntity[] = []) {
    if(entities?.length) {
      entities = entities.filter(entity => entity._ === 'messageEntitySpoiler');
    }
  
    return wrapRichText(text, {
      entities, 
      noEncoding: true,
      noTextFormat: true,
      noLinebreaks: true,
      noLinks: true
    }).textContent;
  }

  export function wrapEmojiText(text: string, isDraft = false) {
    if(!text) return wrapRichText('');
  
    let entities = parseEntities(text).filter(e => e._ === 'messageEntityEmoji');
    return wrapRichText(text, {entities, wrappingDraft: isDraft});
  }

  export function wrapUrl(url: string, unsafe?: number | boolean): {url: string, onclick: string} {
    if(!matchUrlProtocol(url)) {
      url = 'https://' + url;
    }
  
    let tgMeMatch, telescoPeMatch, tgMatch;
    let onclick: string;
    /* if(unsafe === 2) {
      url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
    } else  */if((tgMeMatch = url.match(/^(?:https?:\/\/)?t(?:elegram)?\.me\/(.+)/))) {
      const fullPath = tgMeMatch[1];

      // second regexp is for phone numbers (t.me/+38050...)
      if(/^\W/.test(fullPath) && !PHONE_NUMBER_REG_EXP.test(fullPath)) {
        onclick = 'joinchat';
        return {url, onclick};
      }

      const path = fullPath.split('/');
      switch(path[0]) {
        case 'joinchat':
        case 'addstickers':
        case 'voicechat':
          onclick = path[0];
          break;

        default:
          if((path[1] && path[1].match(/^\d+(?:\?(?:comment|thread)=\d+)?$/)) || path.length === 1) {
            onclick = 'im';
            break;
          }

          break;
      }
    } else if((telescoPeMatch = url.match(/^(?:https?:\/\/)?telesco\.pe\/([^/?]+)\/(\d+)/))) {
      onclick = 'im';
    } else if((tgMatch = url.match(/tg:(?:\/\/)?(.+?)(?:\?|$)/))) {
      onclick = 'tg_' + tgMatch[1];
    }/*  else if(unsafe) {
      url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
    } */

    if(!(window as any)[onclick]) {
      onclick = undefined;
    }
  
    return {url, onclick};
  }

  export function matchUrlProtocol(text: string) {
    return !text ? null : text.match(urlAnyProtocolRegExp);
  }
  
  export function matchUrl(text: string) {
    return !text ? null : text.match(urlRegExp);
  }

  export function matchEmail(text: string) {
    return !text ? null : text.match(emailRegExp);
  }

  export function getAbbreviation(str: string, onlyFirst = false) {
    if(!str) return '';
    const splitted = str.trim().split(' ');
    if(!splitted[0]) return '';

    const first = [...splitted[0]][0];

    if(onlyFirst || splitted.length === 1) return wrapEmojiText(first);

    const last = [...splitted[splitted.length - 1]][0];

    return wrapEmojiText(first + last);
  }

  export function isUsernameValid(username: string) {
    return ((username.length >= 5 && username.length <= 32) || !username.length) && /^[a-zA-Z0-9_]*$/.test(username);
  }

  export function getEmojiEntityFromEmoji(emoji: string): MessageEntity.messageEntityEmoji {
    return {
      _: 'messageEntityEmoji',
      offset: 0,
      length: emoji.length,
      unicode: toCodePoints(emoji).join('-').replace(/-?fe0f/g, '')
    };
  }

  export function wrapSingleEmoji(emoji: string) {
    return wrapRichText(emoji, {
      entities: [getEmojiEntityFromEmoji(emoji)]
    });
  }
}

MOUNT_CLASS_TO.RichTextProcessor = RichTextProcessor;

export {RichTextProcessor};
export default RichTextProcessor;

