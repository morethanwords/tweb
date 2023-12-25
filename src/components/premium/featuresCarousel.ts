/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {PremiumPromoFeature} from './featuresConfig';
import {i18n} from '../../lib/langPack';
import {HelpPremiumPromo} from '../../layer';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import wrapVideo from '../wrappers/video';
import Icon from '../icon';
import LimitsFeature from './limitsFeature';
import UpgradedStoriesFeature from './upgradedStoriesFeature';
import PremiumStickersCarousel from './premiumStickersCarousel';
import {AppManagers} from '../../lib/appManagers/managers';
import TransitionSlider from '../transition';
import {Middleware} from '../../helpers/middleware';
import {PopupPremiumProps} from '../popups/premium';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';

export default class FeaturesCarousel {
  private features: PremiumPromoFeature[];
  public container: HTMLElement;
  private carouselItems: HTMLElement[];
  private outerLayoutUpdater: (feature: any) => void;
  private selectedFeature: PremiumPromoFeatureType;
  private managers: AppManagers;
  private dotsContainer: HTMLDivElement;
  public controlsContainer: HTMLDivElement;
  public slideIndex: number;
  private header: HTMLElement;
  private carouselItemsContainer: HTMLDivElement;
  private premiumPromo: HelpPremiumPromo;
  private premiumStickersCarousel: PremiumStickersCarousel;
  private middleware: Middleware;

  private selectTab: ReturnType<typeof TransitionSlider>;

  constructor(options: PopupPremiumProps & {
    header: HTMLElement
  }) {
    this.middleware = options.middleware;
    this.header = options.header;
    this.managers = options.managers;
    this.premiumPromo = options.premiumPromo;
    this.features = options.features;
    this.container = document.createElement('div');
    this.container.classList.add('carousel-container');
    this.carouselItems = this.features.map((feature) => {
      const container = document.createElement('div');
      container.classList.add('carousel-item', 'tabs-tab');
      if(feature.videoPosition || feature.type === 'premium-stickers') {
        const title = document.createElement('div');
        title.classList.add('carousel-item-content-title');
        const subtitle = document.createElement('div');
        subtitle.classList.add('carousel-item-content-subtitle');
        const bottomSection = document.createElement('div');
        bottomSection.classList.add('carousel-item-content-bottom-section');
        title.append(i18n(feature.titleLangKey, feature.titleLangArgs));
        subtitle.append(i18n(feature.subtitleLangKey, feature.subtitleLangArgs));
        bottomSection.append(title);
        bottomSection.append(subtitle);
        container.append(bottomSection);
      }

      return container;
    });

    this.header.classList.add('absolute');

    this.carouselItemsContainer = document.createElement('div');
    this.carouselItemsContainer.classList.add('carousel-items-container', 'tabs-container');
    this.selectTab = TransitionSlider({
      content: this.carouselItemsContainer,
      type: 'premiumTabs',
      transitionTime: 250,
      animateFirst: false
    });
    this.carouselItemsContainer.append(...this.carouselItems);
    this.container.append(this.carouselItemsContainer);

    this.features.forEach((feature, index) => {
      let slideTopSectionContainer = this.carouselItems[index].querySelector<HTMLElement>('.carousel-item-content-top-section');
      if(!slideTopSectionContainer) {
        slideTopSectionContainer = document.createElement('div');
        slideTopSectionContainer.classList.add('carousel-item-content-top-section');
        this.carouselItems[index].prepend(slideTopSectionContainer);
      }

      if(feature.videoPosition) {
        this.downloadVideo(index);
        let frame = slideTopSectionContainer.querySelector<HTMLElement>('.device-frame');
        if(!frame) {
          const img = document.createElement('img');
          img.classList.add('device-frame-image');
          frame = document.createElement('div');
          frame.classList.add('device-frame');
          frame.append(img);
          renderImageFromUrl(img, 'assets/img/android-device.svg');
          frame.classList.toggle('bottom', feature.videoPosition !== 'top');
          slideTopSectionContainer.append(frame);
        }
      }
    });

    this.initCarouselControls(options);
  }

  public cleanup() {
    this.premiumStickersCarousel?.cleanup();
  }

  public ready(outerLayoutUpdater: (feature: any) => void) {
    this.outerLayoutUpdater = outerLayoutUpdater;
  }

  public scrollListener = (e: Event) => {
    const target = e.target as HTMLElement;
    const {scrollTop, scrollHeight} = target;
    target.classList.toggle('top-border', scrollTop > 0);
    target.classList.toggle('bottom-border', (scrollHeight - scrollTop) > target.clientHeight);
  };

  private async buildSlide(featureIndex: number) {
    const feature = this.features[featureIndex];
    const slideTopSectionContainer = this.carouselItems[featureIndex].querySelector('.carousel-item-content-top-section') as HTMLElement;
    slideTopSectionContainer.removeEventListener('scroll', this.scrollListener);
    slideTopSectionContainer.removeAttribute('style');
    if(feature.videoPosition) {
      await this.appendVideo(featureIndex, this.carouselItems[featureIndex].querySelector('.device-frame'));
    } else {
      if(feature.type !== 'premium-stickers') {
        slideTopSectionContainer.addEventListener('scroll', this.scrollListener);
      }

      switch(feature.type) {
        case 'limits': {
          const hasLimits = !!slideTopSectionContainer.querySelector('.limits-list');
          if(!hasLimits) {
            const limitsFeature = new LimitsFeature();
            const promise = limitsFeature.construct({limits: feature.content, managers: this.managers});
            const limits = limitsFeature.limits;
            slideTopSectionContainer.append(limits);
            slideTopSectionContainer.classList.add('scrollable', 'scrollable-y', 'no-scrollbar', 'bottom-border', 'top-margin');
            await promise;
          }
          break;
        }

        case 'upgraded-stories': {
          const hasStories = !!slideTopSectionContainer.querySelector('.story-features-list');
          if(!hasStories) {
            const stories = new UpgradedStoriesFeature({
              middleware: this.middleware,
              features: feature.content,
              premiumPromo: this.premiumPromo
            });
            const aboveTopSection = document.createElement('div');
            aboveTopSection.classList.add('above-top-section');
            aboveTopSection.prepend(stories.avatar.node);
            const title = i18n(feature.titleLangKey);
            title.classList.add('above-top-section-title');
            aboveTopSection.append(title);
            this.carouselItems[featureIndex].prepend(aboveTopSection);
            this.carouselItems[featureIndex].classList.add('upgraded-stories');
            slideTopSectionContainer.append(stories.features);
          }
          slideTopSectionContainer.style.position = 'relative';
          slideTopSectionContainer.classList.add('scrollable', 'scrollable-y', 'no-scrollbar', 'bottom-border');
          break;
        }

        case 'premium-stickers': {
          const hasStickers = !!slideTopSectionContainer.querySelector('.premium-stickers-carousel');
          if(!hasStickers) {
            this.premiumStickersCarousel = new PremiumStickersCarousel({
              topSection: slideTopSectionContainer,
              managers: this.managers
            });
          }
          break;
        }
      }
    }
  }

  private async processSlideContent(featureIndex: number) {
    let headerText = this.header.querySelector('.popup-title') as HTMLElement;
    const backButton = this.header.querySelector('.back-button') as HTMLElement;

    const hasHeader = !!this.features[featureIndex].headerLangKey;
    if(hasHeader) {
      headerText.remove();
      headerText = document.createElement('div');
      headerText.classList.add('popup-title');
      headerText.append(i18n(this.features[featureIndex].headerLangKey));
      this.header.append(headerText);
    }

    this.header.classList.toggle('is-visible', !!hasHeader);
    if(!hasHeader) {
      this.header.classList.remove('not-top');
    }

    if(this.features[featureIndex].videoPosition || this.features[featureIndex].type === 'premium-stickers') {
      backButton.style.color = '#ffffff';
      this.carouselItems[featureIndex].classList.remove('feature-background');
      this.carouselItemsContainer.classList.remove('full');
    } else {
      backButton.style.color = 'var(--secondary-text-color)';
      this.carouselItems[featureIndex].classList.add('feature-background');
      this.carouselItemsContainer.classList.add('full');
    }

    await this.buildSlide(featureIndex);
  }

  public async selectSlide(type: PremiumPromoFeatureType) {
    this.selectedFeature = type;
    const featureIndex = this.features.findIndex((f) => f.feature === type);
    await this.processSlideContent(featureIndex);
    const prevIndex = this.slideIndex;
    this.slideIndex = featureIndex;
    this.outerLayoutUpdater?.(this.features.find((feature) => feature.feature === type));
    this.dots(type, featureIndex);

    this.selectTab(featureIndex, prevIndex !== undefined);
  }

  private dots(type: PremiumPromoFeatureType, featureIndex: number) {
    const dots = this.dotsContainer.querySelectorAll<HTMLElement>('.popup-premium-controls-dot');
    dots.forEach((node) => {
      node.classList.remove('active');
      node.style.transform = '';
    });

    const featureDotEl = this.dotsContainer.querySelector(`[data-feature=${type}]`);
    featureDotEl?.classList.add('active');
    const startFrom = (featureIndex / 2 - 1) < 1 ? 0 : Math.ceil(featureIndex / 2);
    const length = this.features.length;
    const lastIndex = length - 1;
    const maxSteps = Math.ceil(length / 2) - 1;
    if(startFrom < 1) {
      const n = dots[lastIndex - maxSteps + startFrom];
      dots[lastIndex - maxSteps + startFrom - 1].style.transform = 'scale(.75)';
      n && (n.style.transform = 'scale(.5)');
    } else if(startFrom >= 1 && startFrom < maxSteps) {
      const n = dots[lastIndex - maxSteps + startFrom];
      dots[startFrom + 1].style.transform = 'scale(.75)';
      dots[startFrom].style.transform = 'scale(.5)';
      dots[lastIndex - maxSteps + startFrom - 1].style.transform = 'scale(.75)';
      n && (n.style.transform = 'scale(.5)');
    } else {
      dots[startFrom + 1].style.transform = 'scale(.75)';
      dots[startFrom].style.transform = 'scale(.5)';
    }

    this.dotsContainer.style.setProperty('--amount', '' + length);
    this.dotsContainer.style.setProperty('--start', '' + startFrom);
  }

  private initCarouselControls(options: PopupPremiumProps) {
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.classList.add('popup-premium-controls');
    this.dotsContainer = document.createElement('div');
    this.dotsContainer.classList.add('popup-premium-controls-dots');
    this.controlsContainer.append(this.dotsContainer);
    this.features.forEach((f, i) => this.dotsContainer.append(this.createFeatureDot(options, f.feature, i)));
    attachClickEvent(this.dotsContainer, (e) => {
      e.stopPropagation();
    }, {listenerSetter: options.listenerSetter});
    attachClickEvent(this.container, (e) => {
      const rect = this.container.getBoundingClientRect();
      const selectedFeatureIndex = this.features.findIndex((f) => f.feature === this.selectedFeature);
      const add = (rect.left + rect.width / 2) < e.clientX ? 1 : -1;
      const feature = this.features[selectedFeatureIndex + add];
      feature && this.selectSlide(feature.feature);
    }, {listenerSetter: options.listenerSetter});
  }

  private createFeatureDot(options: PopupPremiumProps, feature: PremiumPromoFeatureType, index: number) {
    const dot = document.createElement('div');
    dot.classList.add('popup-premium-controls-dot');
    if(feature === this.selectedFeature) {
      dot.classList.add('active');
    }
    dot.dataset.feature = feature;
    attachClickEvent(dot, (e) => {
      cancelEvent(e);
      if(feature !== this.selectedFeature) {
        this.selectSlide(feature);
      }
    }, {listenerSetter: options.listenerSetter});
    return dot;
  }

  private async downloadVideo(featureIndex: number, deviceFrame?: Element, mount = false) {
    const doc = this.features[featureIndex].video;
    if(!doc) {
      return {
        video: undefined as HTMLVideoElement,
        loadPromise: new Promise(() => {})
      };
    }

    const wrappedVideo = await wrapVideo({
      doc: doc as any,
      withoutPreloader: true,
      noInfo: true,
      noPlayButton: true,
      middleware: this.middleware,
      ...(mount && {container: deviceFrame as HTMLElement})
    });

    return this.features[featureIndex].wrappedVideo = wrappedVideo;
  }

  private async appendVideo(featureIndex: number, deviceFrame: Element) {
    if(this.features[featureIndex].builded) {
      return;
    }

    this.features[featureIndex].builded = true;
    let shimmer: HTMLElement, premiumIcon: HTMLElement;

    let wrappedVideo = this.features[featureIndex].wrappedVideo;
    if(!wrappedVideo?.loaded) {
      shimmer = document.createElement('div');
      shimmer.classList.add('shimmer');
      premiumIcon = Icon('star', 'device-frame-preload-icon');
      deviceFrame.append(...[wrappedVideo?.thumb?.images?.thumb, shimmer, premiumIcon].filter(Boolean));
    }

    if(wrappedVideo) {
      deviceFrame.append(this.features[featureIndex].wrappedVideo.video);
    } else {
      wrappedVideo = await this.downloadVideo(featureIndex, deviceFrame, true);
      wrappedVideo.loadPromise.then(() => {
        wrappedVideo.loaded = true;
      });
    }

    if(shimmer) {
      wrappedVideo.loadPromise.then(() => {
        shimmer.remove();
        premiumIcon.remove();
      });
    }
  }
}
