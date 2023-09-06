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

import LatinizeMap from '../config/latinizeMap';

export const badCharsRe = /[`~!@#$%^&*()\-_=+\[\]\\|{}'";:\/?.>,<]+/g;
const trimRe = /^\s+|\s$/g;

const C2L: {[k: string]: string} = {
  'й': 'q',
  'ц': 'w',
  'у': 'e',
  'к': 'r',
  'е': 't',
  'н': 'y',
  'г': 'u',
  'ш': 'i',
  'щ': 'o',
  'з': 'p',
  'х': '[',
  'ъ': ']',
  'ф': 'a',
  'ы': 's',
  'в': 'd',
  'а': 'f',
  'п': 'g',
  'р': 'h',
  'о': 'j',
  'л': 'k',
  'д': 'l',
  'ж': ';',
  'э': '\'',
  'я': 'z',
  'ч': 'x',
  'с': 'c',
  'м': 'v',
  'и': 'b',
  'т': 'n',
  'ь': 'm',
  'б': ',',
  'ю': '.',
  '.': '/'
};

export function clearBadCharsAndTrim(text: string) {
  return text.replace(badCharsRe, '').replace(trimRe, '');
}

export function fixCyrillic(text: string) {
  return text.toLowerCase().replace(/[\wа-я]/g, (ch) => {
    const latinizeCh = C2L[ch];
    return latinizeCh ?? ch;
  });
}

export function latinizeString(text: string) {
  return text.replace(/[^A-Za-z0-9]/g, (ch) => {
    const latinizeCh = LatinizeMap[ch];
    return latinizeCh ?? ch;
  });
}

export default function cleanSearchText(text: string, latinize = true) {
  return processSearchText(text, {
    clearBadChars: true,
    latinize,
    ignoreCase: true
  });
}

export type ProcessSearchTextOptions = Partial<{
  clearBadChars: boolean,
  latinize: boolean,
  ignoreCase: boolean,
  includeTag: boolean
}>;

export function processSearchText(text = '', options: ProcessSearchTextOptions = {}) {
  const hasTag = options.includeTag && text.charAt(0) === '%';
  const originalText = text;
  if(options.clearBadChars) text = clearBadCharsAndTrim(text);
  if(options.latinize) text = latinizeString(text);
  if(options.ignoreCase) text = text.toLowerCase();
  if(hasTag) text = '%' + text;
  if(options.latinize) text += '\x01' + fixCyrillic(originalText);
  return text;
}
