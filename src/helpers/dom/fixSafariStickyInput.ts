/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {doubleRaf} from '../schedulers';

export default function fixSafariStickyInput(input: HTMLElement) {
  input.style.transform = 'translateY(-99999px)';
  /* input.style.position = 'fixed';
  input.style.top = '-99999px';
  input.style.left = '0'; */
  input.focus();

  // setTimeout(() => {
  doubleRaf().then(() => {
    // fastSmoothScroll(findUpClassName(input, 'scrollable-y') || window as any, document.activeElement as HTMLElement, 'start', 4, undefined, FocusDirection.Static);
    /* input.style.position = '';
    input.style.top = ''; */
    input.style.transform = '';
    // fastSmoothScroll(findUpClassName(input, 'scrollable-y') || window as any, document.activeElement as HTMLElement, 'start', 4, undefined, FocusDirection.Static);

    /* setTimeout(() => {
      fastSmoothScroll(findUpClassName(input, 'scrollable-y') || window as any, document.activeElement as HTMLElement, 'start', 4);
    }, 50); */
  });
  // }, 0);
}
