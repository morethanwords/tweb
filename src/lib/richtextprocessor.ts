import Config from './config';

import emojiRegExp from '../emoji/regex';
import { encodeEmoji } from '../emoji';
import { MOUNT_CLASS_TO } from './mtproto/mtproto_config';
import { MessageEntity } from '../layer';
import { copy } from '../helpers/object';
import { encodeEntities } from '../helpers/string';

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
const urlRegExp = '((?:https?|ftp)://|mailto:)?' +
  // user:pass authentication
  '(?:\\S{1,64}(?::\\S{0,64})?@)?' +
  '(?:' +
  // sindresorhus/ip-regexp
  '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(?:\\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])){3}' +
  '|' +
  // host name
  '[' + alphaCharsRegExp + '0-9][' + alphaCharsRegExp + domainAddChars + '0-9\-]{0,64}' +
  // domain name
  '(?:\\.[' + alphaCharsRegExp + '0-9][' + alphaCharsRegExp + domainAddChars + '0-9\-]{0,64}){0,10}' +
  // TLD identifier
  '(?:\\.(xn--[0-9a-z]{2,16}|[' + alphaCharsRegExp + ']{2,24}))' +
  ')' +
  // port number
  '(?::\\d{2,5})?' +
  // resource path
  '(?:/(?:\\S{0,255}[^\\s.;,(\\[\\]{}<>"\'])?)?';
const usernameRegExp = '[a-zA-Z\\d_]{5,32}';
const botCommandRegExp = '\\/([a-zA-Z\\d_]{1,32})(?:@(' + usernameRegExp + '))?(\\b|$)';
const fullRegExp = new RegExp('(^| )(@)(' + usernameRegExp + ')|(' + urlRegExp + ')|(\\n)|(' + emojiRegExp + ')|(^|[\\s\\(\\]])(#[' + alphaNumericRegExp + ']{2,64})|(^|\\s)' + botCommandRegExp, 'i')
const emailRegExp = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const markdownTestRegExp = /[`_*@]/;
const markdownRegExp = /(^|\s|\n)(````?)([\s\S]+?)(````?)([\s\n\.,:?!;]|$)|(^|\s)(`|\*\*|__)([^\n]+?)\7([\s\.,:?!;]|$)|@(\d+)\s*\((.+?)\)/m;
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
const markdownEntities = {
  '`': 'messageEntityCode',
  '**': 'messageEntityBold',
  '__': 'messageEntityItalic'
};

namespace RichTextProcessor {
  export const emojiSupported = navigator.userAgent.search(/OS X|iPhone|iPad|iOS/i) != -1/*  && false *//*  || true */;

  export function getEmojiSpritesheetCoords(emojiCode: string) {
    let unified = encodeEmoji(emojiCode)/* .replace(/(-fe0f|fe0f)/g, '') */;
  
    if(unified == '1f441-200d-1f5e8') {
      unified = '1f441-fe0f-200d-1f5e8-fe0f';
    }
  
    if(!emojiData.hasOwnProperty(unified)/*  && !emojiData.hasOwnProperty(unified.replace(/(-fe0f|fe0f)/g, '')) */) {
    //if(!emojiData.hasOwnProperty(emojiCode) && !emojiData.hasOwnProperty(emojiCode.replace(/[\ufe0f\u200d]/g, ''))) {
      //console.error('lol', unified);
      return null;
    }
  
    return unified.replace(/(-fe0f|fe0f)/g, '');
  }

  export function parseEntities(text: string) {
    var match;
    var raw = text, url;
    const entities: MessageEntity[] = [];
    let matchIndex;
    var rawOffset = 0;
    // var start = tsNow()
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
          var url: any = false;
          var protocol = match[5];
          var tld = match[6];
          var excluded = '';
          if(tld) { // URL
            if(!protocol && (tld.substr(0, 4) === 'xn--' || Config.TLD.indexOf(tld.toLowerCase()) !== -1)) {
              protocol = 'http://';
            }
  
            if(protocol) {
              var balanced = checkBrackets(match[4]);
              if (balanced.length !== match[4].length) {
                excluded = match[4].substring(balanced.length);
                match[4] = balanced;
              }
  
              url = (match[5] ? '' : protocol) + match[4];
            }
          } else { // IP address
            url = (match[5] ? '' : 'http://') + match[4];
          }
  
          if (url) {
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
        let emojiCoords = getEmojiSpritesheetCoords(match[8]);
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
      } else if(match[12]) { // Bot command
        entities.push({
          _: 'messageEntityBotCommand',
          offset: matchIndex + (match[11] ? match[11].length : 0),
          length: 1 + match[12].length + (match[13] ? 1 + match[13].length : 0)
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

  export function parseMarkdown(text: string, entities: MessageEntity[], noTrim?: any) {
     if(!markdownTestRegExp.test(text)) {
      return noTrim ? text : text.trim();
    }
  
    var raw = text;
    var match;
    var newText: any = [];
    var rawOffset = 0;
    var matchIndex;
    while (match = raw.match(markdownRegExp)) {
      matchIndex = rawOffset + match.index
      newText.push(raw.substr(0, match.index))
      var text = (match[3] || match[8] || match[11])
      rawOffset -= text.length
      text = text.replace(/^\s+|\s+$/g, '')
      rawOffset += text.length
      if (text.match(/^`*$/)) {
        newText.push(match[0])
      }
      else if (match[3]) { // pre
        if (match[5] == '\n') {
          match[5] = ''
          rawOffset -= 1
        }
        newText.push(match[1] + text + match[5])
        entities.push({
          _: 'messageEntityPre',
          language: '',
          offset: matchIndex + match[1].length,
          length: text.length
        })
        rawOffset -= match[2].length + match[4].length
      } else if (match[7]) { // code|italic|bold
        newText.push(match[6] + text + match[9])
        entities.push({
          // @ts-ignore
          _: markdownEntities[match[7]],
          offset: matchIndex + match[6].length,
          length: text.length
        })
        rawOffset -= match[7].length * 2
      } else if (match[11]) { // custom mention
        newText.push(text)
        entities.push({
          _: 'messageEntityMentionName',
          user_id: +match[10],
          offset: matchIndex,
          length: text.length
        })
        rawOffset -= match[0].length - text.length
      }
      raw = raw.substr(match.index + match[0].length)
      rawOffset += match.index + match[0].length
    }
    newText.push(raw)
    newText = newText.join('')
    if (!newText.replace(/\s+/g, '').length) {
      newText = text
      entities.splice(0, entities.length)
    }
    if (!entities.length && !noTrim) {
      newText = newText.trim()
    }
    return newText
  }

  export function mergeEntities(currentEntities: MessageEntity[], newEntities: MessageEntity[], fromApi?: boolean) {
    const totalEntities = newEntities.slice();
    const newLength = newEntities.length;
    let startJ = 0;
    for(let i = 0, length = currentEntities.length; i < length; i++) {
      const curEntity = currentEntities[i];
      /* if(fromApi &&
        curEntity._ != 'messageEntityLinebreak' &&
        curEntity._ != 'messageEntityEmoji') {
        continue;
      } */
      // console.log('s', curEntity, newEntities);
      const start = curEntity.offset;
      const end = start + curEntity.length;
      let bad = false;
      for(let j = startJ; j < newLength; j++) {
        const newEntity = newEntities[j];
        const cStart = newEntity.offset;
        const cEnd = cStart + newEntity.length;
        if(cStart <= start) {
          startJ = j;
        }
  
        if(start >= cStart && start < cEnd ||
          end > cStart && end <= cEnd) {
          // console.log('bad', curEntity, newEntity)
          if(fromApi && start >= cStart && end <= cEnd) {
            if(newEntity.nested === undefined) {
              newEntity.nested = [];
            }
  
            curEntity.offset -= cStart;
            newEntity.nested.push(copy(curEntity));
          }
  
          bad = true;
          break;
        }
  
        if(cStart >= end) {
          break;
        }
      }
  
      if(bad) {
        continue;
      }
  
      totalEntities.push(curEntity);
    }
  
    totalEntities.sort((a, b) => {
      return a.offset - b.offset;
    });
    // console.log('merge', currentEntities, newEntities, totalEntities)
    return totalEntities;
  }

  export function wrapRichNestedText(text: string, nested: MessageEntity[], options: any) {
    if(nested === undefined) {
      return encodeEntities(text);
    }
  
    options.hasNested = true;
    return wrapRichText(text, {entities: nested, nested: true});
  }

  export function wrapRichText(text: string, options: Partial<{
    entities: MessageEntity[],
    contextSite: string,
    highlightUsername: string,
    noLinks: true,
    noLinebreaks: true,
    noCommands: true,
    fromBot: boolean,
    noTextFormat: true,
    nested?: true,
    contextHashtag?: string
  }> = {}) {
    if(!text || !text.length) {
      return '';
    }
  
    const entities = options.entities || parseEntities(text);
    const contextSite = options.contextSite || 'Telegram';
    const contextExternal = contextSite != 'Telegram';

    //console.log('wrapRichText got entities:', text, entities);
    const html: string[] = [];
    let lastOffset = 0;
    for(let i = 0, len = entities.length; i < len; i++) {
      const entity = entities[i];
      if(entity.offset > lastOffset) {
        html.push(
          encodeEntities(text.substr(lastOffset, entity.offset - lastOffset))
        );
      } else if(entity.offset < lastOffset) {
        continue;
      }
  
      let skipEntity = false;
      const entityText = text.substr(entity.offset, entity.length);
      switch(entity._) {
        case 'messageEntityMention':
          var contextUrl = !options.noLinks && siteMentions[contextSite]
          if (!contextUrl) {
            skipEntity = true
            break
          }
          var username = entityText.substr(1)
          var attr = ''
          if (options.highlightUsername &&
            options.highlightUsername.toLowerCase() == username.toLowerCase()) {
            attr = 'class="im_message_mymention"'
          }
          html.push(
            '<a ',
            attr,
            contextExternal ? ' target="_blank" rel="noopener noreferrer" ' : '',
            ' href="',
            contextUrl.replace('{1}', encodeURIComponent(username)),
            '">',
            encodeEntities(entityText),
            '</a>'
          )
          break;

        case 'messageEntityMentionName':
          if(options.noLinks) {
            skipEntity = true;
            break;
          }

          html.push(
            '<a href="#/im?p=u',
            encodeURIComponent(entity.user_id),
            '">',
            encodeEntities(entityText),
            '</a>'
          );
          break;

        case 'messageEntityHashtag':
          var contextUrl = !options.noLinks && siteHashtags[contextSite];
          if(!contextUrl) {
            skipEntity = true;
            break;
          }

          var hashtag = entityText.substr(1);
          html.push(
            '<a ',
            contextExternal ? ' target="_blank" rel="noopener noreferrer" ' : '',
            'href="',
            contextUrl.replace('{1}', encodeURIComponent(hashtag))
            ,
            '">',
            encodeEntities(entityText),
            '</a>'
          );
          break;

        case 'messageEntityEmail':
          if(options.noLinks) {
            skipEntity = true;
            break;
          }

          html.push(
            '<a href="',
            encodeEntities('mailto:' + entityText),
            '" target="_blank" rel="noopener noreferrer">',
            encodeEntities(entityText),
            '</a>'
          );
          break;

        case 'messageEntityUrl':
        case 'messageEntityTextUrl':
          let inner: string;
          let url: string;
          if (entity._ == 'messageEntityTextUrl') {
            url = (entity as MessageEntity.messageEntityTextUrl).url;
            url = wrapUrl(url, true);
            inner = wrapRichNestedText(entityText, entity.nested, options);
          } else {
            url = wrapUrl(entityText, false);
            inner = encodeEntities(replaceUrlEncodings(entityText));
          }

          if(options.noLinks) {
            html.push(inner);
          } else {
            html.push(
              '<a href="',
              encodeEntities(url),
              '" target="_blank" rel="noopener noreferrer">',
              inner,
              '</a>'
            );
          }
          break;

        case 'messageEntityLinebreak':
          html.push(options.noLinebreaks ? ' ' : '<br/>');
          break;

        case 'messageEntityEmoji':
          html.push(emojiSupported ? 
            `<span class="emoji" contenteditable="false">${encodeEntities(entityText)}</span>` : 
            `<img src="assets/img/emoji/${entity.unicode}.png" alt="${encodeEntities(entityText)}" class="emoji">`);
          break;

        case 'messageEntityBotCommand':
          if(options.noLinks || options.noCommands || contextExternal) {
            skipEntity = true;
            break;
          }

          var command = entityText.substr(1);
          var bot;
          var atPos;
          if ((atPos = command.indexOf('@')) != -1) {
            bot = command.substr(atPos + 1);
            command = command.substr(0, atPos);
          } else {
            bot = options.fromBot;
          }

          html.push(
            '<a href="',
            encodeEntities('tg://bot_command?command=' + encodeURIComponent(command) + (bot ? '&bot=' + encodeURIComponent(bot) : '')),
            '">',
            encodeEntities(entityText),
            '</a>'
          );
          break;

        case 'messageEntityBold':
          if(options.noTextFormat) {
            html.push(wrapRichNestedText(entityText, entity.nested, options));
            break;
          }
          
          html.push(
            '<strong>',
            wrapRichNestedText(entityText, entity.nested, options),
            '</strong>'
          );
          break;

        case 'messageEntityItalic':
          if(options.noTextFormat) {
            html.push(wrapRichNestedText(entityText, entity.nested, options));
            break;
          }
  
          html.push(
            '<em>',
            wrapRichNestedText(entityText, entity.nested, options),
            '</em>'
          );
          break;

        case 'messageEntityHighlight':
          html.push(
            '<i>',
            wrapRichNestedText(entityText, entity.nested, options),
            '</i>'
          );
          break;

        case 'messageEntityStrike':
          html.push(
            '<del>',
            wrapRichNestedText(entityText, entity.nested, options),
            '</del>'
          );
          break;

        case 'messageEntityCode':
          if(options.noTextFormat) {
            html.push(encodeEntities(entityText));
            break;
          }
  
          html.push(
            '<code>',
            encodeEntities(entityText),
            '</code>'
          );
          break;

        case 'messageEntityPre':
          if(options.noTextFormat) {
            html.push(encodeEntities(entityText));
            break;
          }
          
          html.push(
            '<pre><code', (entity.language ? ' class="language-' + encodeEntities(entity.language) + '"' : ''), '>',
            encodeEntities(entityText),
            '</code></pre>'
          );
          break;

        default:
          skipEntity = true;
      }

      lastOffset = entity.offset + (skipEntity ? 0 : entity.length);
    }
  
    html.push(encodeEntities(text.substr(lastOffset))); // may be empty string
    //console.log(html);
    text = html.join('');

    return text;
  }

  export function wrapDraftText(text: string, options: any = {}) {
    if(!text || !text.length) {
      return '';
    }
  
    var entities = options.entities;
    if(entities === undefined) {
      entities = parseEntities(text);
    }
    var i = 0;
    var len = entities.length;
    var entity;
    var entityText;
    var skipEntity;
    var code = [];
    var lastOffset = 0;
    for(i = 0; i < len; i++) {
      entity = entities[i];
      if(entity.offset > lastOffset) {
        code.push(
          text.substr(lastOffset, entity.offset - lastOffset)
        );
      } else if(entity.offset < lastOffset) {
        continue;
      }
  
      skipEntity = false;
      entityText = text.substr(entity.offset, entity.length);
      switch(entity._) {
        case 'messageEntityEmoji':
          code.push(
            ':',
            entity.title,
            ':'
          );
          break;
  
        case 'messageEntityCode':
          code.push(
            '`', entityText, '`'
          );
          break;
  
        case 'messageEntityBold':
          code.push(
            '**', entityText, '**'
          );
          break;
  
        case 'messageEntityItalic':
          code.push(
            '__', entityText, '__'
          );
          break;
  
        case 'messageEntityPre':
          code.push(
            '```', entityText, '```'
          );
          break;
  
        case 'messageEntityMentionName':
          code.push(
            '@', entity.user_id, ' (', entityText, ')'
          );
          break;
  
        default:
          skipEntity = true;
      }
      lastOffset = entity.offset + (skipEntity ? 0 : entity.length);
    }
    code.push(text.substr(lastOffset));
    return code.join('');
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
  
    let entities = parseEntities(text).filter(e => e._ == 'messageEntityEmoji');
    return wrapRichText(text, {entities});
  }

  export function wrapUrl(url: string, unsafe?: number | boolean): string {
    if(!url.match(/^https?:\/\//i)) {
      url = 'https://' + url;
    }
  
    var tgMeMatch;
    var telescoPeMatch;
    /* if(unsafe == 2) {
      url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
    } else  */if((tgMeMatch = url.match(/^https?:\/\/t(?:elegram)?\.me\/(.+)/))) {
      var fullPath = tgMeMatch[1];
      var path = fullPath.split('/');
      switch(path[0]) {
        case 'joinchat':
          url = 'tg://join?invite=' + path[1];
          break;
  
        case 'addstickers':
          url = 'tg://addstickers?set=' + path[1];
          break;
  
        default:
          if(path[1] && path[1].match(/^\d+$/)) {
            url = 'tg://resolve?domain=' + path[0] + '&post=' + path[1];
          } else if(path.length == 1) {
            var domainQuery = path[0].split('?');
            var domain = domainQuery[0];
            var query = domainQuery[1];
            if(domain == 'iv') {
              var match = (query || '').match(/url=([^&=]+)/);
              if(match) {
                url = match[1];
                try {
                  url = decodeURIComponent(url);
                } catch (e) {}
  
                return wrapUrl(url, unsafe);
              }
            }
  
            url = 'tg://resolve?domain=' + domain + (query ? '&' + query : '');
          }
      }
    } else if((telescoPeMatch = url.match(/^https?:\/\/telesco\.pe\/([^/?]+)\/(\d+)/))) {
      url = 'tg://resolve?domain=' + telescoPeMatch[1] + '&post=' + telescoPeMatch[2];
    }/*  else if(unsafe) {
      url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
    } */
  
    return url;
  }
  
  export function matchUrl(text: string) {
    return text.match(urlRegExp);
  }

  const el = document.createElement('span');
  export function getAbbreviation(str: string, onlyFirst = false) {
    const wrapped = wrapEmojiText(str);
    el.innerHTML = wrapped;

    const childNodes = el.childNodes;
    let first = '', last = '';

    const firstNode = childNodes[0];
    if('length' in firstNode) first = (firstNode as any).textContent.trim().charAt(0).toUpperCase(); 
    else first = (firstNode as HTMLElement).outerHTML;

    if(onlyFirst) return first;

    if(str.indexOf(' ') !== -1) {
      const lastNode = childNodes[childNodes.length - 1];
      if(lastNode == firstNode) last = lastNode.textContent.split(' ').pop().trim().charAt(0).toUpperCase();
      else if('length' in lastNode) last = (lastNode as any).textContent.trim().charAt(0).toUpperCase(); 
      else last = (lastNode as HTMLElement).outerHTML;
    }

    return first + last;
  }
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.RichTextProcessor = RichTextProcessor);

export {RichTextProcessor};
export default RichTextProcessor;

