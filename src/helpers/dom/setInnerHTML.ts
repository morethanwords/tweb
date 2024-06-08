/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// import I18n from '../../lib/langPack';

export default function setInnerHTML(elem: Element, html: string | DocumentFragment | Element) {
  setDirection(elem);
  if(html === undefined) {
    elem.replaceChildren();
  } else if(typeof(html) === 'string') {
    if(!html) elem.replaceChildren();
    else elem.textContent = html;
  } else {
    elem.replaceChildren(html);
  }
}

export function setDirection(elem: Element) {
  // if(!I18n.isRTL) {
  elem.setAttribute('dir', 'auto');
  // }
}

export function getDirection(): 'auto' {
  return 'auto';
}
