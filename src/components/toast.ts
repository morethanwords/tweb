/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import replaceContent from '../helpers/dom/replaceContent';
import OverlayClickHandler from '../helpers/overlayClickHandler';
import {FormatterArguments, i18n, LangPackKey} from '../lib/langPack';

const toastsContainer = document.createElement('div');
toastsContainer.classList.add('toasts-container');

const toastEl = document.createElement('div');
toastEl.classList.add('toast');
let timeout: number;

const x = new OverlayClickHandler('toast');
x.addEventListener('toggle', (open) => {
  if(!open) {
    hideToast();
  }
});

export function hideToast() {
  x.close();

  toastEl.classList.remove('is-visible');
  timeout && clearTimeout(+timeout);

  timeout = window.setTimeout(() => {
    toastEl.remove();
    timeout = undefined;
  }, 200);
}

export function toast(content: string | Node, onClose?: () => void) {
  x.close();

  replaceContent(toastEl, content);

  if(!toastEl.parentElement) {
    if(!toastsContainer.parentNode) {
      document.body.append(toastsContainer);
    }

    toastsContainer.append(toastEl);
    void toastEl.offsetLeft; // reflow
  }

  toastEl.classList.add('is-visible');

  timeout && clearTimeout(+timeout);
  x.open(toastEl);

  timeout = window.setTimeout(hideToast, 3000);

  if(onClose) {
    x.addEventListener('toggle', onClose, {once: true});
  }
}

export function toastNew(options: Partial<{
  langPackKey: LangPackKey,
  langPackArguments: FormatterArguments,
  onClose: () => void
}>) {
  toast(i18n(options.langPackKey, options.langPackArguments), options.onClose);
}
