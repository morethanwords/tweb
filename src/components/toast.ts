/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

const toastEl = document.createElement('div');
toastEl.classList.add('toast');
export function toast(html: string) {
  toastEl.innerHTML = html;
  document.body.append(toastEl);

  if(toastEl.dataset.timeout) clearTimeout(+toastEl.dataset.timeout);
  toastEl.dataset.timeout = '' + setTimeout(() => {
    toastEl.remove();
    delete toastEl.dataset.timeout;
  }, 3000);
}
