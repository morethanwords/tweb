/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function findUpAttribute(el: any, attribute: string): HTMLElement {
  return el.closest(`[${attribute}]`);
  /* if(el.getAttribute(attribute) !== null) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.getAttribute(attribute) !== null)
      return el;
  }
  return null; */
}
