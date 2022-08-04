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

export default function checkBrackets(url: string) {
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
