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

import emojiRegExp from '../../vendor/emoji/regex';
import {MessageEntity} from '../../layer';

const EmojiHelper = {
  emojiMap: (code: string) => { return code; },
  shortcuts: [] as any,
  emojis: [] as any
};

export const ALPHA_CHARS_REG_EXP = 'a-z' +
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
export const ALPHA_NUMERIC_REG_EXP = '0-9\_' + ALPHA_CHARS_REG_EXP;
export const DOMAIN_ADD_CHARS = '\u00b7';
// Based on Regular Expression for URL validation by Diego Perini
export const URL_ALPHANUMERIC_REG_EXP_PART = '[' + ALPHA_CHARS_REG_EXP + '0-9]';
export const URL_PROTOCOL_REG_EXP_PART = '((?:https?|ftp)://|mailto:)?';
export const URL_REG_EXP = URL_PROTOCOL_REG_EXP_PART +
  // user:pass authentication
  '(?:' + URL_ALPHANUMERIC_REG_EXP_PART + '{1,64}(?::' + URL_ALPHANUMERIC_REG_EXP_PART + '{0,64})?@)?' +
  '(?:' +
  // sindresorhus/ip-regexp
  '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(?:\\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])){3}' +
  '|' +
  // host name
  URL_ALPHANUMERIC_REG_EXP_PART + '[' + ALPHA_CHARS_REG_EXP + DOMAIN_ADD_CHARS + '0-9\-]{0,64}' +
  // domain name
  '(?:\\.' + URL_ALPHANUMERIC_REG_EXP_PART + '[' + ALPHA_CHARS_REG_EXP + DOMAIN_ADD_CHARS + '0-9\-]{0,64}){0,10}' +
  // TLD identifier
  '(?:\\.(xn--[0-9a-z]{2,16}|[' + ALPHA_CHARS_REG_EXP + ']{2,24}))' +
  ')' +
  // port number
  '(?::\\d{2,5})?' +
  // resource path
  '(?:/(?:\\S{0,255}[^\\s.;,(\\[\\]{}<>"\'])?)?';
export const URL_PROTOCOL_REG_EXP = new RegExp('^' + URL_PROTOCOL_REG_EXP_PART.slice(0, -1), 'i');
export const USERNAME_REG_EXP = '[a-zA-Z\\d_]{5,32}';
export const TIMESTAMP_REG_EXP = '(?:\\s|^)((?:\\d{1,2}:)?(?:[0-5]?[0-9]):(?:[0-5][0-9]))(?:\\s|$)';
export const BOT_COMMAND_REG_EXP = '\\/([a-zA-Z\\d_]{1,32})(?:@(' + USERNAME_REG_EXP + '))?(\\b|$)';
export const FULL_REG_EXP = new RegExp('(^| )(@)(' + USERNAME_REG_EXP + ')|(' + URL_REG_EXP + ')|(\\n)|(' + emojiRegExp + ')|(^|[\\s\\(\\]])(#[' + ALPHA_NUMERIC_REG_EXP + ']{2,64})|(^|\\s)' + BOT_COMMAND_REG_EXP + '|' + TIMESTAMP_REG_EXP + '', 'i');
export const EMAIL_REG_EXP = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
// const markdownTestRegExp = /[`_*@~]/;
export const MARKDOWN_REG_EXP = /(^|\s|\n)(````?)([\s\S]+?)(````?)([\s\n\.,:?!;]|$)|(^|\s|\x01)(`|~~|\*\*|__|_-_|\|\|)([^\n]+?)\7([\x01\s\.,:?!;]|$)|@(\d+)\s*\((.+?)\)|(\[(.+?)\]\((.+?)\))/m;
export const SITE_HASHTAGS: {[siteName: string]: string} = {
  'Telegram': 'tg://search_hashtag?hashtag={1}',
  'Twitter': 'https://twitter.com/hashtag/{1}',
  'Instagram': 'https://instagram.com/explore/tags/{1}/',
  'Google Plus': 'https://plus.google.com/explore/{1}'
};

// export const SITE_MENTIONS: {[siteName in 'Telegram' | 'Twitter' | 'Instagram' | 'GitHub']: string} = {
//   Telegram: '#{1}',
//   Twitter: 'https://twitter.com/{1}',
//   Instagram: 'https://instagram.com/{1}/',
//   GitHub: 'https://github.com/{1}'
// };

export const MARKDOWN_ENTITIES: {[markdown: string]: MessageEntity['_']} = {
  '`': 'messageEntityCode',
  '``': 'messageEntityPre',
  '**': 'messageEntityBold',
  '__': 'messageEntityItalic',
  '~~': 'messageEntityStrike',
  '_-_': 'messageEntityUnderline',
  '||': 'messageEntitySpoiler'
};

export const MARKDOWN_ENTITIES_TYPES = new Set(Object.values(MARKDOWN_ENTITIES));

export const PASS_CONFLICTING_ENTITIES: Set<MessageEntity['_']> = new Set([
  'messageEntityEmoji',
  'messageEntityLinebreak',
  'messageEntityCaret'
]);
export const PASS_SINGLE_CONFLICTING_ENTITIES = new Set(PASS_CONFLICTING_ENTITIES);
for(const i in MARKDOWN_ENTITIES) {
  PASS_CONFLICTING_ENTITIES.add(MARKDOWN_ENTITIES[i]);
}

export const PHONE_NUMBER_REG_EXP = /^\+\d+$/;

/* export function parseEmojis(text: string) {
  return text.replace(/:([a-z0-9\-\+\*_]+?):/gi, function (all, shortcut) {
    var emojiCode = EmojiHelper.shortcuts[shortcut]
    if (emojiCode !== undefined) {
      return EmojiHelper.emojis[emojiCode][0]
    }
    return all
  })
} */


/* export function replaceUrlEncodings(urlWithEncoded: string) {
  return urlWithEncoded.replace(/(%[A-Z\d]{2})+/g, (str) => {
    try {
      return decodeURIComponent(str);
    } catch (e) {
      return str;
    }
  });
} */
