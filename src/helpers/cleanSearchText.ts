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

import Config from "../lib/config";

const badCharsRe = /[`~!@#$%^&*()\-_=+\[\]\\|{}'";:\/?.>,<]+/g;
const trimRe = /^\s+|\s$/g;

export default function cleanSearchText(text: string, latinize = true) {
  const hasTag = text.charAt(0) === '%';
  text = text.replace(badCharsRe, '').replace(trimRe, '');
  if(latinize) {
    text = text.replace(/[^A-Za-z0-9]/g, (ch) => {
      const latinizeCh = Config.LatinizeMap[ch];
      return latinizeCh !== undefined ? latinizeCh : ch;
    });
  }
  
  text = text.toLowerCase();
  if(hasTag) {
    text = '%' + text;
  }

  return text;
}
