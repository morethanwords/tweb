/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Row from '../row';
import {HelpPremiumPromo} from '../../layer';
import {avatarNew} from '../avatarNew';
import {Middleware} from '../../helpers/middleware';
import {PremiumPromoFeature} from './featuresConfig';

export default class UpgradedStoriesFeature {
  public features: HTMLElement;
  public avatar: ReturnType<typeof avatarNew>;

  constructor(options: {features: PremiumPromoFeature['content'], premiumPromo: HelpPremiumPromo, middleware: Middleware}) {
    this.avatar = avatarNew({
      middleware: options.middleware,
      size: 84,
      isBig: true,
      withStories: true,
      peerId: options.premiumPromo.users[0].id.toPeerId(false)
    });

    const features = document.createElement('div');
    features.classList.add('story-features-list');
    this.features = features;
    options.features.forEach((f) => {
      const feature = document.createElement('div');
      feature.classList.add('story-feature');
      const row = new Row({
        titleLangKey: f.titleLangKey,
        titleLangArgs: f.titleLangArgs,
        subtitleLangKey: f.subtitleLangKey,
        subtitleLangArgs: f.subtitleLangArgs,
        icon: f.icon,
        iconClasses: ['row-icon-custom-color'],
        clickable: false
      });

      row.container.style.setProperty('--custom-icon-color', f.iconColor);
      feature.append(row.container);
      features.append(feature);
    });
  }
}
