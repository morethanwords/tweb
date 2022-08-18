/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function findUpAsChild(el: HTMLElement, parent: HTMLElement): HTMLElement {
  if(el.parentElement === parent) return el;

  while(el.parentElement) {
    el = el.parentElement;
    if(el.parentElement === parent) {
      return el;
    }
  }

  return null;
}
