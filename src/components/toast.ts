/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import replaceContent from "../helpers/dom/replaceContent";
import { i18n, LangPackKey } from "../lib/langPack";

const toastEl = document.createElement('div');
toastEl.classList.add('toast');
export function toast(content: string | Node) {
  replaceContent(toastEl, content);
  document.body.append(toastEl);

  if(toastEl.dataset.timeout) clearTimeout(+toastEl.dataset.timeout);
  toastEl.dataset.timeout = '' + setTimeout(() => {
    toastEl.remove();
    delete toastEl.dataset.timeout;
  }, 3000);
}

export function toastNew(options: Partial<{
  langPackKey: LangPackKey
}>) {
  toast(i18n(options.langPackKey));
}
