/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MTAppConfig} from '../../lib/mtproto/appConfig';
import PopupElement from './index';
import PromoSlideTab, {getGiftDetails} from '../premium/promoSlideTab';
import TransitionSlider from '../transition';
import FeatureSlideTab from '../premium/featureSlideTab';
import I18n, {FormatterArguments} from '../../lib/langPack';
import Button from '../button';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {HelpPremiumPromo, MessageAction, PaymentsCheckedGiftCode, PremiumSubscriptionOption} from '../../layer';
import {PREMIUM_FEATURES, PremiumPromoFeature} from '../premium/featuresConfig';
import Icon from '../icon';
import {Middleware} from '../../helpers/middleware';
import {AppManagers} from '../../lib/appManagers/managers';
import appImManager, {ChatSetPeerOptions} from '../../lib/appManagers/appImManager';
import rootScope from '../../lib/rootScope';
import safeAssign from '../../helpers/object/safeAssign';
import ListenerSetter from '../../helpers/listenerSetter';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import PopupGiftLink from './giftLink';

export type PopupPremiumProps = {
  order: PremiumPromoFeatureType[],
  features: PremiumPromoFeature[],
  middleware: Middleware,
  managers: AppManagers,
  premiumPromo: HelpPremiumPromo,
  appConfig: MTAppConfig,
  isPremiumActive?: boolean,
  gift: MessageAction.messageActionGiftPremium | PaymentsCheckedGiftCode,
  peerId: PeerId,
  isOut: boolean,
  type: 'premium' | 'gift',
  stack: ChatSetPeerOptions['stack'],
  listenerSetter: ListenerSetter
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
  private feature: PremiumPromoFeatureType;
  private gift: PopupPremiumProps['gift'];
  private peerId: PeerId;
  private isOut: boolean;
  private stack: PopupPremiumProps['stack'];
  private transition: ReturnType<typeof TransitionSlider>;
  private wrapCurrency: (amount: Long) => string;
  private tabsContainer: HTMLElement;
  private giftDetails: ReturnType<typeof getGiftDetails>;

  constructor(options: {
    feature?: PopupPremium['feature'],
    gift?: PopupPremium['gift'],
    peerId?: PopupPremium['peerId'],
    isOut?: PopupPremium['isOut'],
    stack?: PopupPremium['stack']
  } = {}) {
    super('popup-premium', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: 'Premium.Boarding.Title'
    });

    safeAssign(this, options);
    this.initTabs();
  }

  public cleanup() {
    super.cleanup();
    this.featureSlideTab.cleanup();
    this.promoSlideTab.tab.remove();
  }

  private prepareArguments = async(obj: {
    _titleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>,
    _subtitleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>
  }) => {
    const [titleLangArgs, subtitleLangArgs] = await Promise.all([
      obj._titleLangArgs,
      obj._subtitleLangArgs
    ].map((c) => c && c(this.managers)));

    return {titleLangArgs, subtitleLangArgs};
  };

  private filterOrder(premiumPromo: HelpPremiumPromo, order: PremiumPromoFeatureType[]) {
    return (order || []).filter((feature) => {
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
  }

  private async createFeatures(premiumPromo: HelpPremiumPromo, order: PremiumPromoFeatureType[]) {
    return Promise.all(order.map(async(feature) => {
      const f = PREMIUM_FEATURES[feature];

      let content = f.content;
      if(content) {
        content = await Promise.all(content.map(async(c) => {
          return {
            ...(await this.prepareArguments(c)),
            ...c
          };
        }));
      }

      const video = premiumPromo.videos[premiumPromo.video_sections.indexOf(feature)];
      const ff = {
        ...(await this.prepareArguments(f)),
        ...f,
        ...{content},
        video
      } as PremiumPromoFeature;
      if(video) ff.videoPosition ??= 'bottom';

      return ff;
    }));
  }

  private async initTabs() {
    const [premiumPromo, appConfig] = await Promise.all([
      this.managers.appPaymentsManager.getPremiumPromo(),
      this.managers.apiManager.getAppConfig()
    ]);

    const order = this.filterOrder(premiumPromo, appConfig.premium_promo_order);

    const isPremiumActive = rootScope.premium;
    this.props = {
      order,
      features: await this.createFeatures(premiumPromo, order),
      premiumPromo,
      managers: this.managers,
      middleware: this.middlewareHelper.get(),
      appConfig,
      isPremiumActive,
      gift: this.gift,
      peerId: this.peerId || this.stack?.peerId,
      isOut: this.isOut || this.stack?.isOut,
      type: this.gift ? 'gift' : 'premium',
      stack: this.stack,
      listenerSetter: this.listenerSetter
    };

    this.giftDetails = getGiftDetails(this.props);

    const tabsContainer = this.tabsContainer = document.createElement('div');
    tabsContainer.classList.add('tabs-container', 'premium-tabs');

    this.option = this.props.premiumPromo.period_options[0];
    const shortestOption = this.props.premiumPromo.period_options.slice().sort((a, b) => a.months - b.months)[0];
    this.wrapCurrency = (amount) => paymentsWrapCurrencyAmount(amount, shortestOption.currency, false, true, true);

    const headerBackground = document.createElement('div');
    headerBackground.classList.add('popup-header-background');
    this.header.prepend(headerBackground);

    this.createTransitionSlider();
    this.createActionButton();
    this.createPromoSlideTab();
    this.createFeatureSlideTab();

    const tabs = [this.promoSlideTab.tab, this.featureSlideTab.tab].filter(Boolean);
    tabs.forEach((tab) => {
      tab.classList.add('tabs-tab', 'premium-tab');
    });
    tabsContainer.append(...tabs);

    this.container.append(...[tabsContainer, this.actionButtonContainer].filter(Boolean));
    if(!this.actionButtonContainer) {
      this.container.classList.add('no-button');
    }

    this.feature && await this.selectFeature(this.feature);
    this.transition(this.feature ? 1 : 0);

    this.show();
  }

  private selectFeature = async(feature: PremiumPromoFeatureType) => {
    this.selectedFeature = this.props.features.find((f) => f.feature === feature);
    await this.featureSlideTab.setCarouselSlide(feature);
    this.updateActionLayout(this.selectedFeature);
  };

  private createTransitionSlider() {
    this.transition = TransitionSlider({
      content: this.tabsContainer,
      type: 'navigation',
      transitionTime: 150,
      animateFirst: false,
      onTransitionEnd: (id) => {
        this.selectedTab = id;
        if(id) {
          this.featureSlideTab.featureCarousel.ready(this.updateActionLayout);
        } else {
          this.updateActionLayout();
        }
      }
    });
  }

  private createActionButton() {
    if(this.props.type === 'gift') {
      if(this.giftDetails.isOutbound || !this.giftDetails.isUnclaimed) {
        return;
      }
    }

    this.actionButtonText = new I18n.IntlElement({key: 'OK'});
    this.actionButtonContainer = document.createElement('div');
    this.actionButtonContainer.classList.add('action-button-container');
    this.actionButton = Button(`btn-primary popup-gift-premium-confirm action-button shimmer`);
    this.actionButton.append(this.actionButtonText.element);

    let callback: () => void;
    if(this.props.type === 'gift') {
      callback = () => {
        const gift = this.props.gift as PaymentsCheckedGiftCode;
        PopupGiftLink.applyGiftCode(gift.slug, this.actionButton, this);
      };
    } else {
      callback = () => {
        if(this.props.isPremiumActive) {
          this.hide();
          return;
        }

        this.buyPremium();
      };
    }

    attachClickEvent(this.actionButton, callback, {listenerSetter: this.listenerSetter, once: true});

    this.actionButtonContainer.append(this.actionButton);
  }

  private createPromoSlideTab() {
    this.promoSlideTab = new PromoSlideTab({
      container: this.tabsContainer,
      header: this.header,
      body: this.body,
      ...this.props
    });

    this.promoSlideTab.transition = this.transition;
    this.promoSlideTab.selectFeature = this.selectFeature;
    this.promoSlideTab.selectPeriod = (option) => {
      this.option = option;
      this.updateActionLayout();
    };
    this.promoSlideTab.close = this.close;
  }

  private createFeatureSlideTab() {
    this.featureSlideTab = new FeatureSlideTab({
      header: this.header.cloneNode(true) as HTMLElement,
      actionButtonContainer: this.actionButtonContainer,
      ...this.props
    });
    this.featureSlideTab.transition = this.transition;
  }

  private updateActionLayout = (feature?: PremiumPromoFeature) => {
    if(!this.actionButtonText) {
      return;
    }

    if(this.props.type === 'gift') {
      const {isOutbound, isUnclaimed} = this.giftDetails;
      if(!isOutbound && isUnclaimed) {
        this.actionButtonText.compareAndUpdate({
          key: 'GiftPremiumActivateForFree'
        });
      }

      return;
    }

    if(this.props.isPremiumActive) {
      return;
    }

    this.actionButtonText.compareAndUpdate({
      key: feature?.actionTitleLangKey || 'Premium.Boarding.Subscribe',
      args: [this.wrapCurrency(+this.option.amount / this.option.months)]
    });

    const previousIcon = this.actionButton.querySelector('.tgico');
    const newIcon = feature?.actionIcon && Icon(feature.actionIcon, 'row-icon', 'action-button-icon');
    if(!newIcon) previousIcon?.remove();
    else if(previousIcon) previousIcon?.replaceWith(newIcon);
    else this.actionButton.append(newIcon);
  };

  public close = (callback?: () => void) => {
    callback && this.addEventListener('closeAfterTimeout', callback);
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
