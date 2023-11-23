/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from './index';
import PromoSlideTab from '../premium/promoSlideTab';
import TransitionSlider from '../transition';
import FeatureSlideTab from '../premium/featureSlideTab';
import I18n, {FormatterArguments} from '../../lib/langPack';
import Button from '../button';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {HelpPremiumPromo, PremiumSubscriptionOption} from '../../layer';
import {PREMIUM_FEATURES, PremiumPromoFeature} from '../premium/featuresConfig';
import Icon from '../icon';
import {Middleware} from '../../helpers/middleware';
import {AppManagers} from '../../lib/appManagers/managers';
import type {MTAppConfig} from '../../lib/mtproto/appConfig';
import appImManager from '../../lib/appManagers/appImManager';
import rootScope from '../../lib/rootScope';

export type PopupPremiumProps = {
  order: PremiumPromoFeatureType[],
  features: PremiumPromoFeature[],
  middleware: Middleware,
  managers: AppManagers,
  premiumPromo: HelpPremiumPromo,
  appConfig: MTAppConfig,
  isPremiumActive: boolean
};

export default class PopupPremium extends PopupElement {
  private promoSlideTab: PromoSlideTab;
  private featureSlideTab: FeatureSlideTab;

  private actionButtonContainer: HTMLDivElement;
  private selectedTab: number;
  private actionButtonText: I18n.IntlElement;
  private selectedFeature: PremiumPromoFeature;
  private actionButton: HTMLButtonElement;
  private props: PopupPremiumProps;
  private option: PremiumSubscriptionOption;

  constructor(public feature?: PremiumPromoFeatureType) {
    super('popup-premium', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: 'Premium.Boarding.Title'
    });

    this.initTabs();
  }

  public cleanup() {
    super.cleanup();
    this.featureSlideTab.cleanup();
    this.promoSlideTab.tab.remove();
  }

  private async initTabs() {
    const [premiumPromo, appConfig] = await Promise.all([
      this.managers.appPaymentsManager.getPremiumPromo(),
      this.managers.apiManager.getAppConfig()
    ]);

    const order = (appConfig.premium_promo_order || []).filter((feature) => {
      const hasFeature = !!PREMIUM_FEATURES[feature];
      if(!hasFeature) {
        console.warn('premium feature is not implemented', feature);
        const videoIndex = premiumPromo.video_sections.indexOf(feature);
        if(videoIndex !== -1) {
          premiumPromo.video_sections.splice(videoIndex, 1);
          premiumPromo.videos.splice(videoIndex, 1);
        }
      }

      return hasFeature;
    });

    const prepareArguments = async(obj: {
      _titleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>,
      _subtitleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>
    }) => {
      const [titleLangArgs, subtitleLangArgs] = await Promise.all([
        obj._titleLangArgs,
        obj._subtitleLangArgs
      ].map((c) => c && c(this.managers)));

      return {titleLangArgs, subtitleLangArgs};
    };

    const isPremiumActive = rootScope.premium;
    this.props = {
      order,
      features: await Promise.all(order.map(async(feature) => {
        const f = PREMIUM_FEATURES[feature];

        let content = f.content;
        if(content) {
          content = await Promise.all(content.map(async(c) => {
            return {
              ...(await prepareArguments(c)),
              ...c
            };
          }));
        }

        return {
          ...(await prepareArguments(f)),
          ...f,
          ...{content},
          video: premiumPromo.videos[premiumPromo.video_sections.indexOf(f.feature)] as any
        } as PremiumPromoFeature;
      })),
      premiumPromo,
      managers: this.managers,
      middleware: this.middlewareHelper.get(),
      appConfig,
      isPremiumActive
    };

    this.actionButton = Button(`btn-primary popup-gift-premium-confirm action-button shimmer`);
    const tabsContainer = document.createElement('div');
    this.actionButtonContainer = document.createElement('div');
    tabsContainer.classList.add('tabs-container', 'premium-tabs');
    this.actionButtonContainer.classList.add('action-button-container');
    this.actionButtonText = new I18n.IntlElement({key: 'OK'});
    this.actionButton.append(this.actionButtonText.element);
    this.actionButtonContainer.append(this.actionButton);
    this.option = this.props.premiumPromo.period_options[0];
    const shortestOption = this.props.premiumPromo.period_options.slice().sort((a, b) => a.months - b.months)[0];
    const wrapCurrency = (amount: number | string) => paymentsWrapCurrencyAmount(amount, shortestOption.currency, false, true);

    const selectFeature = async(feature: PremiumPromoFeatureType) => {
      this.selectedFeature = this.props.features.find((f) => f.feature === feature);
      await this.featureSlideTab.setCarouselSlide(feature);
      updateActionLayout(this.selectedFeature);
    };

    const updateActionLayout = (feature?: PremiumPromoFeature) => {
      if(this.props.isPremiumActive) {
        return;
      }

      this.actionButtonText.compareAndUpdate({
        key: feature?.actionTitleLangKey || 'Premium.Boarding.Subscribe',
        args: [wrapCurrency(+this.option.amount / this.option.months)]
      });

      const previousIcon = this.actionButton.querySelector('.tgico');
      const newIcon = feature?.actionIcon && Icon(feature.actionIcon, 'row-icon', 'action-button-icon');
      if(!newIcon) previousIcon?.remove();
      else if(previousIcon) previousIcon?.replaceWith(newIcon);
      else this.actionButton.append(newIcon);
    };

    this.container.append(tabsContainer);

    const headerBackground = document.createElement('div');
    headerBackground.classList.add('popup-header-background');
    this.header.prepend(headerBackground);

    this.promoSlideTab = new PromoSlideTab({
      container: tabsContainer,
      header: this.header,
      body: this.body,
      ...this.props
    });
    this.featureSlideTab = new FeatureSlideTab({
      header: this.header.cloneNode(true) as HTMLElement,
      actionButtonContainer: this.actionButtonContainer,
      ...this.props
    });
    const tabs = [this.promoSlideTab.tab, this.featureSlideTab.tab];
    tabs.forEach((tab) => {
      tab.classList.add('tabs-tab', 'premium-tab');
    });
    tabsContainer.append(...tabs, this.actionButtonContainer);

    const transition = TransitionSlider({
      content: tabsContainer,
      type: 'navigation',
      transitionTime: 150,
      animateFirst: false,
      onTransitionEnd: (id) => {
        this.selectedTab = id;
        if(id) {
          this.featureSlideTab.featureCarousel.ready(updateActionLayout);
        } else {
          updateActionLayout();
        }
      }
    });
    this.promoSlideTab.transition = transition;
    this.promoSlideTab.selectFeature = selectFeature;
    this.promoSlideTab.selectPeriod = (option) => {
      this.option = option;
      updateActionLayout();
    };
    this.promoSlideTab.close = this.close;
    this.featureSlideTab.transition = transition;

    this.actionButton.addEventListener('click', () => {
      if(this.props.isPremiumActive) {
        this.hide();
        return;
      }

      this.buyPremium();
    }, {once: true});
    this.actionButton.append(this.actionButtonText.element);
    this.actionButtonContainer.append(this.actionButton);

    this.feature && await selectFeature(this.feature);
    transition(this.feature ? 1 : 0);

    this.show();
  }

  public close = (callback: () => void) => {
    this.addEventListener('closeAfterTimeout', callback);
    this.hide();
  };

  public buyPremium() {
    this.close(() => {
      appImManager.openUrl(this.option.bot_url);
    });
  }

  public static show(...args: ConstructorParameters<typeof PopupPremium>) {
    PopupElement.createPopup(PopupPremium, ...args);
  }
}
