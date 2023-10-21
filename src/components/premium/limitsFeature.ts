/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import LimitLine from '../limit';
import {_i18n} from '../../lib/langPack';
import {PremiumPromoFeature} from './featuresConfig';
import {AppManagers} from '../../lib/appManagers/managers';

export default class LimitsFeature {
  public limits: HTMLElement;

  public async construct(options: {limits: PremiumPromoFeature['content'], managers: AppManagers}) {
    this.limits = document.createElement('div');
    this.limits.classList.add('limits-list');
    const promises = options.limits.map(async(limit, index) => {
      const [free, premium] = limit.limitType ? await Promise.all([
        options.managers.apiManager.getLimit(limit.limitType, false),
        options.managers.apiManager.getLimit(limit.limitType, true)
      ]) : [];

      const limitTextContainer = document.createElement('div');
      limitTextContainer.classList.add('limit-text-container');
      if(!index) {
        limitTextContainer.classList.add('no-margin');
      }
      const limitContainer = document.createElement('div');
      limitContainer.classList.add('limit');
      const limitTitle = document.createElement('div');
      limitTitle.classList.add('limit-title');
      _i18n(limitTitle, limit.titleLangKey, limit.titleLangArgs);
      const limitSubtitle = document.createElement('div');
      limitSubtitle.classList.add('limit-subtitle');
      _i18n(limitSubtitle, limit.subtitleLangKey, limit.subtitleLangArgs);
      const limitLine = new LimitLine({
        limitFree: free ?? limit.free,
        limitPremium: premium ?? limit.premium,
        color: limit.backgroundColor
      });
      limitTextContainer.append(limitTitle, limitSubtitle);
      limitContainer.append(limitTextContainer, limitLine.container);
      return limitContainer;
    });
    const containers = await Promise.all(promises);
    this.limits.append(...containers);
    return this.limits;
  }
}
