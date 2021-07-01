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

import Config from './config';

import emojiRegExp from '../vendor/emoji/regex';
import { encodeEmoji, toCodePoints } from '../vendor/emoji';
import { MessageEntity } from '../layer';
import { encodeEntities } from '../helpers/string';
import { isSafari } from '../helpers/userAgent';
import { MOUNT_CLASS_TO } from '../config/debug';
import IS_EMOJI_SUPPORTED from '../helpers/emojiSupport';

const EmojiHelper = {
  emojiMap: (code: string) => { return code; },
  shortcuts: [] as any,
  emojis: [] as any
};

const emojiData = Config.Emoji;

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
const urlAnyProtocolRegExp = /^((?:.+?):\/\/|mailto:)/;
const usernameRegExp = '[a-zA-Z\\d_]{5,32}';
const botCommandRegExp = '\\/([a-zA-Z\\d_]{1,32})(?:@(' + usernameRegExp + '))?(\\b|$)';
const fullRegExp = new RegExp('(^| )(@)(' + usernameRegExp + ')|(' + urlRegExp + ')|(\\n)|(' + emojiRegExp + ')|(^|[\\s\\(\\]])(#[' + alphaNumericRegExp + ']{2,64})|(^|\\s)' + botCommandRegExp, 'i');
const emailRegExp = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
//const markdownTestRegExp = /[`_*@~]/;
const markdownRegExp = /(^|\s|\n)(````?)([\s\S]+?)(````?)([\s\n\.,:?!;]|$)|(^|\s|\x01)(`|~~|\*\*|__|_-_)([^\n]+?)\7([\x01\s\.,:?!;]|$)|@(\d+)\s*\((.+?)\)|(\[(.+?)\]\((.+?)\))/m;
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
  '_-_': 'messageEntityUnderline'
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
  export const emojiSupported = IS_EMOJI_SUPPORTED;

  export function getEmojiSpritesheetCoords(emojiCode: string) {
    let unified = encodeEmoji(emojiCode).replace(/-?fe0f/g, '');
  
    /* if(unified === '1f441-200d-1f5e8') {
      //unified = '1f441-fe0f-200d-1f5e8-fe0f';
      unified = '1f441-fe0f-200d-1f5e8';
    } */
  
    if(!emojiData.hasOwnProperty(unified) 
      // && !emojiData.hasOwnProperty(unified.replace(/-?fe0f$/, ''))
    ) {
      //console.error('lol', unified);
      return null;
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
            if(!protocol && (tld.substr(0, 4) === 'xn--' || Config.TLD.indexOf(tld.toLowerCase()) !== -1)) {
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
        const emojiCoords = getEmojiSpritesheetCoords(match[8]);
        if(emojiCoords) {
          entities.push({
            _: 'messageEntityEmoji',
            offset: matchIndex,
            length: match[8].length,
            unicode: emojiCoords
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

  export function parseMarkdown(text: string, currentEntities: MessageEntity[], noTrim?: boolean): string {
    /* if(!markdownTestRegExp.test(text)) {
      return noTrim ? text : text.trim();
    } */

    const entities: MessageEntity[] = [];
    let pushedEntity = false;
    const pushEntity = (entity: MessageEntity) => !findConflictingEntity(currentEntities, entity) ? (entities.push(entity), pushedEntity = true) : pushedEntity = false;

    let raw = text;
    let match;
    let newText: any = [];
    let rawOffset = 0;
    while(match = raw.match(markdownRegExp)) {
      const matchIndex = rawOffset + match.index;
      newText.push(raw.substr(0, match.index));
      let text = (match[3] || match[8] || match[11] || match[13]);
      rawOffset -= text.length;
      //text = text.replace(/^\s+|\s+$/g, '');
      rawOffset += text.length;

      let entity: MessageEntity;
      pushedEntity = false;
      if(text.match(/^`*$/)) {
        newText.push(match[0]);
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
  
          newText.push(match[1] + text + match[5]);
          
          rawOffset -= match[2].length + match[4].length;
        }
      } else if(match[7]) { // code|italic|bold
        const isSOH = match[6] === '\x01';

        entity = {
          _: markdownEntities[match[7]] as (MessageEntity.messageEntityBold | MessageEntity.messageEntityCode | MessageEntity.messageEntityItalic)['_'],
          //offset: matchIndex + match[6].length,
          offset: matchIndex + (isSOH ? 0 : match[6].length),
          length: text.length
        };

        if(pushEntity(entity)) {
          if(!isSOH) {
            newText.push(match[6] + text + match[9]);
          } else {
            newText.push(text);
          }
  
          rawOffset -= match[7].length * 2 + (isSOH ? 2 : 0);
        }
      } else if(match[11]) { // custom mention
        entity = {
          _: 'messageEntityMentionName',
          user_id: +match[10],
          offset: matchIndex,
          length: text.length
        };
        
        if(pushEntity(entity)) {
          newText.push(text);
          
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
          newText.push(text);

          rawOffset -= match[12].length - text.length;
        }
      }

      if(!pushedEntity) {
        newText.push(match[0]);
      }

      raw = raw.substr(match.index + match[0].length);
      rawOffset += match.index + match[0].length;
    }

    newText.push(raw);
    newText = newText.join('');
    if(!newText.replace(/\s+/g, '').length) {
      newText = text;
      entities.splice(0, entities.length);
    }

    if(!entities.length && !noTrim) {
      newText = newText.trim();
    }

    mergeEntities(currentEntities, entities);
    combineSameEntities(currentEntities);

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
    currentEntities.sort((a, b) => a.offset - b.offset);
    return currentEntities;
  }

  export function combineSameEntities(entities: MessageEntity[]) {
    //entities = entities.slice();
    for(let i = 0; i < entities.length; ++i) {
      const entity = entities[i];

      let nextEntityIdx = -1;
      do {
        nextEntityIdx = entities.findIndex((e, _i) => _i !== i && e._ === entity._ && (e.offset - entity.length) === entity.offset);
        if(nextEntityIdx !== -1) {
          const nextEntity = entities[nextEntityIdx];
          entity.length += nextEntity.length;
          entities.splice(nextEntityIdx, 1);
        }
      } while(nextEntityIdx !== -1);
    }
    //return entities;
  }

  export function wrapRichText(text: string, options: Partial<{
    entities: MessageEntity[],
    contextSite: string,
    highlightUsername: string,
    noLinks: true,
    noLinebreaks: true,
    noCommands: true,
    wrappingDraft: true,
    //mustWrapEmoji: boolean,
    fromBot: boolean,
    noTextFormat: true,
    passEntities: Partial<{
      [_ in MessageEntity['_']]: boolean
    }>,

    contextHashtag?: string,
  }> = {}) {
    if(!text) {
      return '';
    }

    const lol: {
      part: string,
      offset: number
    }[] = [];
    const entities = options.entities || parseEntities(text);

    const passEntities: typeof options.passEntities = options.passEntities || {};
    const contextSite = options.contextSite || 'Telegram';
    const contextExternal = contextSite !== 'Telegram';

    const insertPart = (entity: MessageEntity, startPart: string, endPart?: string) => {
      lol.push({part: startPart, offset: entity.offset});

      if(endPart) {
        lol.unshift({part: endPart, offset: entity.offset + entity.length});
      }
    };

    for(let i = 0, length = entities.length; i < length; ++i) {
      const entity = entities[i];
      switch(entity._) {
        case 'messageEntityBold': {
          if(!options.noTextFormat) {
            if(options.wrappingDraft) {
              insertPart(entity, '<span style="font-weight: bold;">', '</span>');
            } else {
              insertPart(entity, '<strong>', '</strong>');
            }
          }

          break;
        }

        case 'messageEntityItalic': {
          if(!options.noTextFormat) {
            if(options.wrappingDraft) {
              insertPart(entity, '<span style="font-style: italic;">', '</span>');
            } else {
              insertPart(entity, '<em>', '</em>');
            }
          }

          break;
        }

        case 'messageEntityStrike': {
          if(options.wrappingDraft) {
            const styleName = isSafari ? 'text-decoration' : 'text-decoration-line';
            insertPart(entity, `<span style="${styleName}: line-through;">`, '</span>');
          } else {
            insertPart(entity, '<del>', '</del>');
          }

          break;
        }

        case 'messageEntityUnderline': {
          if(options.wrappingDraft) {
            const styleName = isSafari ? 'text-decoration' : 'text-decoration-line';
            insertPart(entity, `<span style="${styleName}: underline;">`, '</span>');
          } else {
            insertPart(entity, '<u>', '</u>');
          }

          break;
        }
          
        case 'messageEntityCode': {
          if(options.wrappingDraft) {
            insertPart(entity, '<span style="font-family: monospace;">', '</span>');
          } else {
            insertPart(entity, '<code>', '</code>');
          }
          
          break;
        }
          
        case 'messageEntityPre': {
          if(!options.noTextFormat) {
            insertPart(entity, `<pre><code${entity.language ? ' class="language-' + encodeEntities(entity.language) + '"' : ''}>`, '</code></pre>');
          }
          
          break;
        }

        case 'messageEntityHighlight': {
          insertPart(entity, '<i class="text-highlight">', '</i>');
          break;
        }

        case 'messageEntityBotCommand': {
          // if(!(options.noLinks || options.noCommands || contextExternal)/*  && !entity.unsafe */) {
          if(!options.noLinks && passEntities[entity._]) {
            const entityText = text.substr(entity.offset, entity.length);
            let command = entityText.substr(1);
            let bot: string | boolean;
            let atPos: number;
            if((atPos = command.indexOf('@')) !== -1) {
              bot = command.substr(atPos + 1);
              command = command.substr(0, atPos);
            } else {
              bot = options.fromBot;
            }

            insertPart(entity, `<a href="${encodeEntities('tg://bot_command?command=' + encodeURIComponent(command) + (bot ? '&bot=' + encodeURIComponent(bot) : ''))}" ${contextExternal ? '' : 'onclick="execBotCommand(this)"'}>`, `</a>`);
          }

          break;
        }

        case 'messageEntityEmoji': {
          //if(!(options.wrappingDraft && emojiSupported)) { // * fix safari emoji
          if(!emojiSupported) { // no wrapping needed
            // if(emojiSupported) { // ! contenteditable="false" нужен для поля ввода, иначе там будет меняться шрифт в Safari, или же рендерить смайлик напрямую, без контейнера
            //   insertPart(entity, '<span class="emoji">', '</span>');
            // } else {
              insertPart(entity, `<img src="assets/img/emoji/${entity.unicode}.png" alt="`, `" class="emoji">`);
            // }
          }/*  else if(options.mustWrapEmoji) {
            insertPart(entity, '<span class="emoji">', '</span>');
          } */
          /* if(!emojiSupported) {
            insertPart(entity, `<img src="assets/img/emoji/${entity.unicode}.png" alt="`, `" class="emoji">`);
          } */

          break;
        }
        
        case 'messageEntityCaret': {
          insertPart(entity, '<span class="composer-sel"></span>');
          break;
        }

        /* case 'messageEntityLinebreak': {
          if(options.noLinebreaks) {
            insertPart(entity, ' ');
          } else {
            insertPart(entity, '<br/>');
          }
          
          break;
        } */

        case 'messageEntityUrl':
        case 'messageEntityTextUrl': {
          if(!(options.noLinks && !passEntities[entity._])) {
            const entityText = text.substr(entity.offset, entity.length);

            // let inner: string;
            let url: string = (entity as MessageEntity.messageEntityTextUrl).url || entityText;
            let masked = false;
            let onclick: string;

            const wrapped = wrapUrl(url, true);
            url = wrapped.url;
            onclick = wrapped.onclick;

            if(entity._ === 'messageEntityTextUrl') {
              const nextEntity = entities[i + 1];
              if(nextEntity?._ === 'messageEntityUrl' && 
                nextEntity.length === entity.length && 
                nextEntity.offset === entity.offset) {
                i++;
              }

              if(url !== entityText) {
                masked = true;
              }
            } else {
              //inner = encodeEntities(replaceUrlEncodings(entityText));
            }

            const currentContext = url[0] === '#';
            if(!onclick && masked && !currentContext) {
              onclick = 'showMaskedAlert';
            }

            const href = (currentContext || typeof electronHelpers === 'undefined') 
              ? encodeEntities(url)
              : `javascript:electronHelpers.openExternal('${encodeEntities(url)}');`;

            const target = (currentContext || typeof electronHelpers !== 'undefined')
              ? '' : ' target="_blank" rel="noopener noreferrer"';

            insertPart(entity, `<a class="anchor-url" href="${href}"${target}${onclick ? `onclick="${onclick}(this)"` : ''}>`, '</a>');
          }

          break;
        }

        case 'messageEntityEmail': {
          if(!options.noLinks) {
            const entityText = text.substr(entity.offset, entity.length);
            insertPart(entity, `<a href="${encodeEntities('mailto:' + entityText)}" target="_blank" rel="noopener noreferrer">`, '</a>');
          }

          break;
        }
          
        case 'messageEntityHashtag': {
          const contextUrl = !options.noLinks && siteHashtags[contextSite];
          if(contextUrl) {
            const entityText = text.substr(entity.offset, entity.length);
            const hashtag = entityText.substr(1);
            insertPart(entity, `<a class="anchor-hashtag" href="${contextUrl.replace('{1}', encodeURIComponent(hashtag))}"${contextExternal ? ' target="_blank" rel="noopener noreferrer"' : ' onclick="searchByHashtag(this)"'}>`, '</a>');
          }

          break;
        }

        case 'messageEntityMentionName': {
          if(!(options.noLinks && !passEntities[entity._])) {
            insertPart(entity, `<a href="#/im?p=${encodeURIComponent(entity.user_id)}" class="follow" data-follow="${entity.user_id}">`, '</a>');
          }

          break;
        }

        case 'messageEntityMention': {
          const contextUrl = !options.noLinks && siteMentions[contextSite];
          if(contextUrl) {
            const entityText = text.substr(entity.offset, entity.length);
            const username = entityText.substr(1);

            insertPart(entity, `<a class="mention" href="${contextUrl.replace('{1}', encodeURIComponent(username))}"${contextExternal ? ' target="_blank" rel="noopener noreferrer"' : ''}>`, '</a>');
          }
          
          break;
        }
      }
    }

    lol.sort((a, b) => a.offset - b.offset);

    const arr: string[] = [];
    let usedLength = 0;
    for(const {part, offset} of lol) {
      if(offset > usedLength) {
        arr.push(encodeEntities(text.slice(usedLength, offset)));
        usedLength = offset;
      }

      arr.push(part);
    }

    if(usedLength < text.length) {
      arr.push(encodeEntities(text.slice(usedLength)));
    }

    return arr.join('');
  }

  export function fixEmoji(text: string, entities?: MessageEntity[]) {
    /* if(!emojiSupported) {
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
      return '';
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
  
  export function replaceUrlEncodings(urlWithEncoded: string) {
    return urlWithEncoded.replace(/(%[A-Z\d]{2})+/g, (str) => {
      try {
        return decodeURIComponent(str);
      } catch (e) {
        return str;
      }
    });
  }
  
  export function wrapPlainText(text: any) {
    if(emojiSupported) {
      return text;
    }
  
    if(!text || !text.length) {
      return '';
    }
  
    text = text.replace(/\ufe0f/g, '', text);
    var match;
    var raw = text;
    var text: any = [],
      emojiTitle;
    fullRegExp.lastIndex = 0;
    while((match = raw.match(fullRegExp))) {
      text.push(raw.substr(0, match.index))
      if(match[8]) {
        // @ts-ignore
        const emojiCode = EmojiHelper.emojiMap[match[8]];
        if(emojiCode &&
        // @ts-ignore
          (emojiTitle = emojiData[emojiCode][1][0])) {
          text.push(':' + emojiTitle + ':');
        } else {
          text.push(match[0]);
        }
      } else {
        text.push(match[0]);
      }
  
      raw = raw.substr(match.index + match[0].length);
    }
    text.push(raw);
    return text.join('');
  }

  export function wrapEmojiText(text: string) {
    if(!text) return '';
  
    let entities = parseEntities(text).filter(e => e._ === 'messageEntityEmoji');
    return wrapRichText(text, {entities});
  }

  export function wrapUrl(url: string, unsafe?: number | boolean): {url: string, onclick: string} {
    if(!matchUrlProtocol(url)) {
      url = 'https://' + url;
    }
  
    let tgMeMatch;
    let telescoPeMatch;
    let onclick: string;
    /* if(unsafe === 2) {
      url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
    } else  */if((tgMeMatch = url.match(/^(?:https?:\/\/)?t(?:elegram)?\.me\/(.+)/))) {
      const fullPath = tgMeMatch[1];
      const path = fullPath.split('/');
      switch(path[0]) {
        case 'joinchat':
        case 'addstickers':
          onclick = path[0];
          break;
  
        /* case 'joinchat':
          onclick = 'joinchat';
          url = 'tg://join?invite=' + path[1];
          break;
  
        case 'addstickers':
          onclick = 'addstickers';
          url = 'tg://addstickers?set=' + path[1];
          break; */
  
        default:
          if(path[1] && path[1].match(/^\d+$/)) {               // https://t.me/.+/[0-9]+ (channel w/ username)
            if(path[0] === 'c' && path[2]) {                    // https://t.me/c/111111111/111 (channel w/o username)
              url = '#/im?p=' + path[1] + '&post=' + path[2];
            } else {                                            // https://t.me/durov/151 (channel w/ username)
              url = siteMentions['Telegram'].replace('{1}', path[0] + '&post=' + path[1]);
            }
          } else if(path.length === 1) {
            const domainQuery = path[0].split('?');
            const domain = domainQuery[0];
            const query = domainQuery[1];

            if(domain === 'iv') {
              const match = (query || '').match(/url=([^&=]+)/);
              if(match) {
                url = match[1];
                try {
                  url = decodeURIComponent(url);
                } catch (e) {}
  
                return wrapUrl(url, unsafe);
              }
            }
  
            url = siteMentions['Telegram'].replace('{1}', domain + (query ? '&' + query : ''));
            //url = 'tg://resolve?domain=' + domain + (query ? '&' + query : '');
          }

          break;
      }
    } else if((telescoPeMatch = url.match(/^(?:https?:\/\/)?telesco\.pe\/([^/?]+)\/(\d+)/))) {
      url = 'tg://resolve?domain=' + telescoPeMatch[1] + '&post=' + telescoPeMatch[2];
    }/*  else if(unsafe) {
      url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
    } */
  
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

