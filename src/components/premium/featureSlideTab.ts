/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ButtonIcon from '../buttonIcon';
import FeaturesCarousel from './featuresCarousel';
import {PopupPremiumProps} from '../popups/premium';
import TransitionSlider from '../transition';
import {attachClickEvent} from '../../helpers/dom/clickEvent';

type FeatureSlideTabOptions = PopupPremiumProps & {
  header: HTMLElement,
  actionButtonContainer: HTMLElement
};

export default class FeatureSlideTab {
  private backBtn: HTMLButtonElement;
  public tab: HTMLElement;
  public transition: ReturnType<typeof TransitionSlider>;
  public featureCarousel: FeaturesCarousel;

  constructor(options: FeatureSlideTabOptions) {
    this.backBtn = ButtonIcon('left popup-close back-button', {noRipple: true});
    this.initFeaturesTab(options);
  }

  public cleanup() {
    this.featureCarousel?.cleanup();
  }

  private initFeaturesTab(options: FeatureSlideTabOptions) {
    const tab = document.createElement('div');
    tab.classList.add('premium-feature-tab');
    options.header.querySelector('.popup-close').replaceWith(this.backBtn);
    tab.append(options.header);
    this.featureCarousel = new FeaturesCarousel({
      ...options,
      header: options.header
    });
    tab.append(this.featureCarousel.container, this.featureCarousel.controlsContainer);
    this.tab = tab;

    attachClickEvent(this.backBtn, () => {
      this.featureCarousel.slideIndex = undefined;
      this.transition(0);
    }, {listenerSetter: options.listenerSetter});
  }

  public setCarouselSlide(feature: PremiumPromoFeatureType) {
    return this.featureCarousel.selectSlide(feature);
  }
}
