/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function setInnerHTML(elem: HTMLElement, html: string) {
  elem.setAttribute('dir', 'auto');
  elem.innerHTML = html;
}
