/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../config/debug';
import {_tgico} from '../helpers/tgico';

export function putPreloader(elem: Element, returnDiv = false): HTMLElement {
  const html = `
  <svg xmlns="http://www.w3.org/2000/svg" class="preloader-circular" viewBox="25 25 50 50">
  <circle class="preloader-path" cx="50" cy="50" r="20" fill="none" stroke-miterlimit="10"/>
  </svg>`;

  if(returnDiv) {
    const div = document.createElement('div');
    div.classList.add('preloader');
    div.innerHTML = html;

    if(elem) {
      elem.appendChild(div);
    }

    return div;
  }

  elem.insertAdjacentHTML('beforeend', html);
  return elem.lastElementChild as HTMLElement;
}

MOUNT_CLASS_TO.putPreloader = putPreloader;

export function setButtonLoader(elem: HTMLButtonElement, icon: Icon = 'check') {
  const iconElement = elem.querySelector('.tgico');
  iconElement?.remove();
  elem.disabled = true;
  putPreloader(elem);

  return () => {
    elem.replaceChildren();
    if(iconElement) elem.append(iconElement);
    elem.removeAttribute('disabled');
  };
}

/* export function parseMenuButtonsTo(to: {[name: string]: HTMLElement}, elements: HTMLCollection | NodeListOf<HTMLElement>) {
  Array.from(elements).forEach((el) => {
    const match = el.className.match(/(?:^|\s)menu-(.+?)(?:$|\s)/);
    if(!match) return;
    to[match[1]] = el as HTMLElement;
  });
} */

export function PreloaderTsx() {
  const div = document.createElement('div');
  div.classList.add('preloader');
  putPreloader(div);
  return div;
}
