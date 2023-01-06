/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {doubleRaf} from '../schedulers';

export default function disableTransition(elements: HTMLElement[]) {
  elements.forEach((el) => el.classList.add('no-transition'));

  doubleRaf().then(() => {
    elements.forEach((el) => el.classList.remove('no-transition'));
  });
}
