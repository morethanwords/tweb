/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function setInnerHTML(elem: Element, html: string | DocumentFragment) {
  elem.setAttribute('dir', 'auto');
  if(typeof(html) === 'string') {
    elem.innerHTML = html;
  } else {
    elem.textContent = '';
    elem.append(html);
  }
}
