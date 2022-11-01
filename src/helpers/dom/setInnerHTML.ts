/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function setInnerHTML(elem: Element, html: string | DocumentFragment | Element) {
  elem.setAttribute('dir', 'auto');
  if(typeof(html) === 'string') {
    if(!html) elem.textContent = '';
    else elem.innerHTML = html;
  } else {
    elem.replaceChildren(html);
  }
}
