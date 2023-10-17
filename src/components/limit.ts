/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {_i18n, i18n} from '../lib/langPack';

export default class LimitLine {
  public limit: HTMLElement;

  constructor(options: {limitPremium: number, limitFree?: number | string, color?: string}) {
    const limit = document.createElement('div');
    limit.classList.add('limit-line');

    const free = document.createElement('div');
    free.classList.add('limit-line-free');

    const premium = document.createElement('div');
    if(options.color !== undefined) {
      premium.style.setProperty('--limit-color', options.color);
      premium.classList.add('limit-line-custom');
    } else {
      premium.classList.add('limit-line-premium');
    }

    limit.append(free, premium);
    if(options.limitFree === undefined) {
      _i18n(free, 'LimitFree');
    } else {
      free.append(i18n('LimitFree'), '' + options.limitFree);
    }
    premium.append(i18n('LimitPremium'), '' + options.limitPremium);
    this.limit = limit;
  }
}
