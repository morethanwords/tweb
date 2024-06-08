/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {LangPackKey, i18n} from '../../lib/langPack';
import Row from '../row';
import {PREMIUM_FEATURES_COLORS, PremiumPromoFeature} from './featuresConfig';
import TransitionSlider from '../transition';
import Icon from '../icon';
import {PopupPremiumProps} from '../popups/premium';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import CheckboxField from '../checkboxField';
import {PremiumGiftCodeOption, PremiumSubscriptionOption} from '../../layer';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {onMediaCaptionClick} from '../appMediaViewer';
import {formatMonthsDuration} from '../../helpers/date';
import wrapPeerTitle from '../wrappers/peerTitle';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import rootScope from '../../lib/rootScope';
import {PeerTitleOptions} from '../peerTitle';
import {InviteLink} from '../sidebarLeft/tabs/sharedFolder';
import anchorCallback from '../../helpers/dom/anchorCallback';
import PopupGiftLink from '../popups/giftLink';

type PromoSlideTabOptions = PopupPremiumProps & {
  container: HTMLElement,
  header: HTMLElement,
  body: HTMLElement
};

export function premiumOptionsForm<T extends PremiumSubscriptionOption | PremiumGiftCodeOption>({
  periodOptions,
  onOption,
  checked = 0,
  users = 1,
  discountInTitle
}: {
  periodOptions: T[],
  onOption: (option: T) => void,
  checked?: number,
  users?: number,
  discountInTitle?: boolean
}) {
  const isGiftCode = periodOptions[0]._ === 'premiumGiftCodeOption';
  const shortestOption = periodOptions.slice().sort((a, b) => a.months - b.months)[0];
  const wrapCurrency = (amount: number | string) => paymentsWrapCurrencyAmount(amount, shortestOption.currency, false, true, true);
  const keys: {[key: number]: LangPackKey} = isGiftCode ? undefined : {
    12: 'PremiumTierAnnual',
    6: 'PremiumTierSemiannual',
    1: 'PremiumTierMonthly'
  };

  const rows = periodOptions.map((option, idx) => {
    const amountPerUser = +option.amount / (isGiftCode ? (option as PremiumGiftCodeOption).users : 1);
    let title = keys ? i18n(keys[option.months] || 'Months', [option.months]) : formatMonthsDuration(option.months, false);
    let subtitle: HTMLElement;
    if(isGiftCode) {
      subtitle = i18n('Multiplier', [wrapCurrency(amountPerUser), users]);
    } else if(option !== shortestOption) {
      subtitle = i18n('PricePerMonth', [wrapCurrency(+option.amount / option.months)]);
    }

    if(option !== shortestOption) {
      const span = document.createElement('span');
      const badge = document.createElement('span');
      badge.classList.add('popup-gift-premium-discount');
      const shortestAmount = +shortestOption.amount * option.months / shortestOption.months;
      const discount = Math.round((1 - +option.amount / shortestAmount) * 100);
      badge.textContent = '-' + discount + '%';
      span.append(badge, discountInTitle ? title : subtitle);
      if(discountInTitle) {
        title = span;
      } else {
        subtitle = span;
      }
    }

    const checkboxField = new CheckboxField({
      checked: idx === checked,
      round: true,
      name: 'premium-period',
      asRadio: true
    });

    const row = new Row({
      title,
      checkboxField,
      clickable: true,
      subtitle,
      rightTextContent: wrapCurrency(isGiftCode ? amountPerUser * users : option.amount)
    });

    row.container.classList.add('popup-gift-premium-option');

    return row;
  });

  const form = document.createElement('form');
  form.classList.add('popup-gift-premium-options');
  form.append(...rows.map((row) => row.container));

  const getSelectedOption = () => periodOptions[rows.findIndex((row) => row.checkboxField.checked)];

  form.addEventListener('change', () => {
    onOption(getSelectedOption());
  });

  onOption(getSelectedOption());

  return form;
}

export function getGiftDetails(options: PopupPremiumProps) {
  const gift = options.gift;
  if(!gift) {
    return;
  }

  let fromPeerId: PeerId, toPeerId: PeerId;
  if(gift._ === 'payments.checkedGiftCode') {
    fromPeerId = getPeerId(gift.from_id) || options.peerId;
  } else {
    fromPeerId = options.isOut ? rootScope.myId : options.peerId;
  }

  toPeerId = options.isOut ? options.peerId : rootScope.myId;
  toPeerId ||= rootScope.myId;

  const isOutbound = toPeerId !== rootScope.myId;
  const isUnclaimed = gift._ !== 'payments.checkedGiftCode' || !gift.used_date;
  return {fromPeerId, toPeerId, isOutbound, isUnclaimed, gift};
}

export default class PromoSlideTab {
  public tab: HTMLElement;
  public transition: ReturnType<typeof TransitionSlider>;
  public selectFeature: (feature: PremiumPromoFeatureType) => Promise<void>;
  public selectPeriod: (option: PremiumSubscriptionOption) => void;
  public close: (callback?: () => void) => void;

  constructor(public options: PromoSlideTabOptions) {
    this.initPremiumTab(options);
  }

  private async initPremiumTab(options: PromoSlideTabOptions) {
    const tab = this.tab = document.createElement('div');
    tab.append(options.header, options.body);
    tab.classList.add('premium-promo-tab', 'not-bottom', 'scrollable', 'scrollable-y');
    tab.addEventListener('scroll', this.onTabScroll);

    options.body.append(...[
      this.createImageContainer(),
      await this.createHeading(),
      options.type === 'premium' && !options.isPremiumActive && this.createOptionsForm(),
      this.createFeaturesContainer()
    ].filter(Boolean));
    options.container.classList.add('fixed-size');
  }

  private async createHeading() {
    const headingTextContainer = document.createElement('div');
    headingTextContainer.classList.add('popup-premium-heading-text-container');
    const headingTextTitle = document.createElement('div');
    headingTextTitle.classList.add('popup-premium-heading-text-title');
    const headingTextDescription = document.createElement('div');
    headingTextDescription.classList.add('popup-premium-heading-text-description');

    const wrapTitleOptions: PeerTitleOptions = {onlyFirstName: true};

    let title: HTMLElement, description: HTMLElement;
    const giftDetails = getGiftDetails(this.options);
    if(giftDetails) {
      headingTextTitle.classList.add('smaller-text');
      const {fromPeerId, toPeerId, isOutbound, isUnclaimed, gift} = giftDetails;
      const giftMonths = i18n('GiftMonths', [gift.months]);
      if(isOutbound) {
        title = i18n(
          'GiftModal.Title.You',
          [
            await wrapPeerTitle({...wrapTitleOptions, peerId: toPeerId}),
            giftMonths
          ]
        );
      } else {
        title = i18n(
          fromPeerId ?
            'TelegramPremiumUserGiftedPremiumDialogTitleWithPlural' :
            'TelegramPremiumUserGiftedPremiumDialogTitleWithPluralSomeone',
          [
            fromPeerId && await wrapPeerTitle({...wrapTitleOptions, peerId: fromPeerId}),
            giftMonths
          ].filter(Boolean)
        );
      }

      if(isOutbound) {
        description = i18n(
          'TelegramPremiumUserGiftedPremiumOutboundDialogSubtitle',
          [await wrapPeerTitle({...wrapTitleOptions, peerId: toPeerId})]
        );
      } else {
        if(gift._ === 'messageActionGiftPremium') {
          description = i18n('TelegramPremiumUserGiftedPremiumDialogSubtitle');
        } else {
          const url = 'https://t.me/giftcode/' + gift.slug;

          const inviteLink = new InviteLink({
            button: false,
            listenerSetter: this.options.listenerSetter,
            url
          });

          let text: HTMLElement;
          if(!isUnclaimed) {
            text = i18n('BoostingLinkUsed');
          } else {
            text = i18n(
              'GiftCode.ShareReceived',
              [
                anchorCallback(async() => {
                  this.close();
                  PopupGiftLink.shareGiftLink(url);
                })
              ]
            );
          }

          description = document.createElement('div');
          description.append(text, inviteLink.container);
        }
      }
    } else {
      title = this.options.isPremiumActive ? i18n('TelegramPremiumSubscribedTitle') : i18n('Premium.Boarding.Title');
      description = this.options.isPremiumActive ? i18n('TelegramPremiumSubscribedSubtitle') : i18n('Premium.Boarding.Info');
    }

    headingTextTitle.append(title);
    headingTextDescription.append(description);
    headingTextContainer.append(headingTextTitle, headingTextDescription);
    return headingTextContainer;
  }

  private createFeaturesContainer() {
    const featuresContainer = document.createElement('div');
    featuresContainer.classList.add('popup-premium-features-container');
    featuresContainer.append(...[
      ...this.createFeatures(this.options.features, this.options.order),
      this.options.type === 'premium' && this.options.premiumPromo.status_text && this.createStatusText()
    ].filter(Boolean));
    return featuresContainer;
  }

  private createImageContainer() {
    const premiumImageContainer = document.createElement('div');
    premiumImageContainer.classList.add('popup-premium-header-image-container');
    const premiumImage = document.createElement('img');
    premiumImage.src = `assets/img/premium-star${window.devicePixelRatio > 1 ? '@2x' : ''}.png`;
    premiumImage.classList.add('popup-premium-header-image');
    premiumImageContainer.append(premiumImage);
    return premiumImageContainer;
  }

  private createStatusText() {
    const statusText = document.createElement('div');
    statusText.classList.add('popup-premium-status-text');
    const wrapped = wrapRichText(this.options.premiumPromo.status_text, {entities: this.options.premiumPromo.status_entities});
    setInnerHTML(statusText, wrapped);

    const onClick = (e: MouseEvent) => {
      const callback = onMediaCaptionClick(statusText, e);
      if(!callback) {
        return;
      }

      this.close(() => {
        statusText.removeEventListener('click', onClick, {capture: true});
        callback();
      });
    };

    statusText.addEventListener('click', onClick, {capture: true});
    return statusText;
  }

  private createOptionsForm() {
    return premiumOptionsForm({
      periodOptions: this.options.premiumPromo.period_options,
      onOption: (option) => {
        this.selectPeriod?.(option);
      }
    });
  }

  private createFeatures(features: PremiumPromoFeature[], order: PremiumPromoFeatureType[]) {
    return order.map((type, idx) => {
      const f = features.find((feature) => feature.feature === type);
      const row = new Row({
        titleLangKey: f.titleLangKey,
        titleLangArgs: f.titleLangArgs,
        subtitleLangKey: f.subtitleLangKey,
        subtitleLangArgs: f.subtitleLangArgs,
        clickable: async() => {
          this.transition(1);
          await this.selectFeature(f.feature);
        }
      });

      const media = row.createMedia('small');
      media.classList.add('premium-promo-tab-icon');
      media.append(Icon(f.icon));
      media.style.backgroundColor = PREMIUM_FEATURES_COLORS[idx];

      if(f.new) {
        const badge = i18n('New');
        badge.classList.add('row-title-badge');
        row.title.append(badge);
        badge.style.backgroundColor = PREMIUM_FEATURES_COLORS[idx];
      }

      return row.container;
    });
  }

  private onTabScroll = () => {
    const {tab, options} = this;
    const {scrollTop, scrollHeight} = tab;
    options.header.classList.toggle('is-visible', scrollTop > 100);
    options.header.classList.toggle('not-top', scrollTop > 0);
    tab.classList.toggle('not-bottom', (scrollHeight - scrollTop) > tab.offsetHeight);
  };
}
