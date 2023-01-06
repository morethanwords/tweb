/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function isInputEmpty(element: HTMLElement) {
  if(element.isContentEditable || element.tagName !== 'INPUT') {
    /* const value = element.innerText;

    return !value.trim() && !serializeNodes(Array.from(element.childNodes)).trim(); */
    // return !getRichValueWithCaret(element, false, false).value.trim();
    return !element.textContent.trim() && !element.querySelector('.emoji, .custom-emoji, .custom-emoji-placeholder');
  } else {
    return !(element as HTMLInputElement).value.trim();
  }
}
