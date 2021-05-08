/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function reflowScrollableElement(element: HTMLElement) {
  element.style.display = 'none';
  void element.offsetLeft; // reflow
  element.style.display = '';
}
