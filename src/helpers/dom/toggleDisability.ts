/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import toArray from '../array/toArray';

export default function toggleDisability(elements: HTMLElement | HTMLElement[], disable: boolean): () => void {
  elements = toArray(elements);

  if(disable) {
    elements.forEach((el) => el.setAttribute('disabled', 'true'));
  } else {
    elements.forEach((el) => el.removeAttribute('disabled'));
  }

  return () => toggleDisability(elements, !disable);
}
