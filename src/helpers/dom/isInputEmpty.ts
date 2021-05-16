/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getRichValue from "./getRichValue";

export default function isInputEmpty(element: HTMLElement) {
  if(element.hasAttribute('contenteditable') || element.tagName !== 'INPUT') {
    /* const value = element.innerText;

    return !value.trim() && !serializeNodes(Array.from(element.childNodes)).trim(); */
    return !getRichValue(element, false).value.trim();
  } else {
    return !(element as HTMLInputElement).value.trim();
  }
}
