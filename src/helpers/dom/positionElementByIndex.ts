/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import whichChild from './whichChild';

export default function positionElementByIndex(element: HTMLElement, container: HTMLElement, pos: number, prevPos?: number) {
  if(prevPos === undefined) {
    prevPos = element.parentElement === container ? whichChild(element) : -1;
  }

  if(prevPos === pos) {
    return false;
  } else if(prevPos !== -1 && prevPos < pos) { // was higher
    pos += 1;
  }

  if(!pos) {
    container.prepend(element);
  } else if(container.childElementCount > pos) {
    container.insertBefore(element, container.children[pos]);
  } else {
    container.append(element);
  }

  return true;
}
