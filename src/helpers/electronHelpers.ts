/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * The Electron wrapper injects `electronHelpers` as a page global so links can be handed to the
 * system browser instead of navigating the app window.
 *
 * A bare `typeof electronHelpers !== 'undefined'` must never be used to detect it: every element
 * carrying an `id` is exposed on `window` under that id, so rendered message content can forge the
 * binding (a LaTeX `\label{electronHelpers}` becomes `<mtr id="electronHelpers">`). Requiring a
 * callable `openExternal` rules that out — DOM clobbering only ever yields elements and
 * collections, never a function.
 */
export function getElectronHelpers() {
  const helpers = typeof electronHelpers === 'undefined' ? undefined : electronHelpers;
  return typeof helpers?.openExternal === 'function' ? helpers : undefined;
}

const EXTERNAL_ANCHOR_ATTRIBUTE = 'data-open-external';

let listening = false;
function listenForExternalAnchors() {
  if(listening) {
    return;
  }

  listening = true;
  document.addEventListener('click', (e) => {
    if(e.defaultPrevented) {
      return;
    }

    const helpers = getElectronHelpers();
    if(!helpers) {
      return;
    }

    const anchor = (e.target as Element)?.closest?.<HTMLAnchorElement>('a[' + EXTERNAL_ANCHOR_ATTRIBUTE + ']');
    if(!anchor?.href) {
      return;
    }

    e.preventDefault();
    helpers.openExternal(anchor.href);
  });
}

/**
 * Mark an anchor as belonging to the system browser. The URL stays in `href` as data and is read
 * back at click time — it is never interpolated into executable markup, so a URL containing quotes
 * cannot escape into script.
 */
export default function setExternalToAnchor(anchor: HTMLAnchorElement) {
  anchor.setAttribute(EXTERNAL_ANCHOR_ATTRIBUTE, '');
  listenForExternalAnchors();
  return anchor;
}
