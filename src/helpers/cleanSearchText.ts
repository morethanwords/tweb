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

import LatinizeMap from "../config/latinizeMap";

const badCharsRe = /[`~!@#$%^&*()\-_=+\[\]\\|{}'";:\/?.>,<]+/g;
const trimRe = /^\s+|\s$/g;

export function clearBadCharsAndTrim(text: string) {
  return text.replace(badCharsRe, '').replace(trimRe, '');
}

export function latinizeString(text: string) {
  return text.replace(/[^A-Za-z0-9]/g, (ch) => {
    const latinizeCh = LatinizeMap[ch];
    return latinizeCh !== undefined ? latinizeCh : ch;
  });
}

export default function cleanSearchText(text: string, latinize = true) {
  const hasTag = text.charAt(0) === '%';
  text = clearBadCharsAndTrim(text);
  if(latinize) text = latinizeString(text);
  
  text = text.toLowerCase();
  if(hasTag) text = '%' + text;

  return text;
}

export type ProcessSearchTextOptions = Partial<{
  clearBadChars: boolean,
  latinize: boolean,
  ignoreCase: boolean,
  includeTag: boolean
}>;

export function processSearchText(text: string, options: ProcessSearchTextOptions = {}) {
  const hasTag = options.includeTag && text.charAt(0) === '%';
  if(options.clearBadChars) text = clearBadCharsAndTrim(text);
  if(options.latinize) text = latinizeString(text);
  if(options.ignoreCase) text = text.toLowerCase();
  if(hasTag) text = '%' + text;
  return text;
}
