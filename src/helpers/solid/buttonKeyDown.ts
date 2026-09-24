/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// Keyboard activation for an element that is not the native control it stands
// in for — a clickable <div>/<span>/custom element you gave a role. Pair one of
// these with that role, `tabindex="0"` and your existing `onClick`:
//
//   <div role="button" tabindex="0" onClick={fn} onKeyDown={buttonKeyDown}>
//   <div role="link"   tabindex="0" onClick={fn} onKeyDown={linkKeyDown}>
//
// Either one dispatches a real click, so the same onClick fires (and the click
// bubbles, so a delegated parent listener fires too). Native <button>/<a>/
// <input> already activate on their own and must NOT use these — they would
// fire twice.
//
// Which keys activate is not a detail to pick by convenience. A button answers
// to Enter AND Space; a link answers to Enter alone, because on a link Space
// belongs to the scroll. Give a link Space and you take a page-down away from
// whoever is reading the list it sits in.
function activateOn(keys: string[], e: KeyboardEvent, element: HTMLElement) {
  if(keys.includes(e.key) && !e.repeat && !e.defaultPrevented && !e.isComposing &&
    e.target === element && !element.matches('button, input, select, textarea, a[href], [disabled], [aria-disabled="true"]')) {
    e.preventDefault();
    element.click();
  }
}

/** For `role="button"`: Enter and Space, the way a native button behaves. */
export default function buttonKeyDown(e: KeyboardEvent, element = e.currentTarget as HTMLElement) {
  activateOn(['Enter', ' '], e, element);
}

/** For `role="link"`: Enter activates, Space is left to the scroll. */
export function linkKeyDown(e: KeyboardEvent, element = e.currentTarget as HTMLElement) {
  activateOn(['Enter'], e, element);
}
