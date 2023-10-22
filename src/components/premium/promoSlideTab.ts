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
import {PremiumSubscriptionOption} from '../../layer';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {onMediaCaptionClick} from '../appMediaViewer';

type PromoSlideTabOptions = PopupPremiumProps & {
  container: HTMLElement,
  header: HTMLElement,
  body: HTMLElement
};

export default class PromoSlideTab {
  public tab: HTMLElement;
  public transition: ReturnType<typeof TransitionSlider>;
  public selectFeature: (feature: PremiumPromoFeatureType) => Promise<void>;
  public selectPeriod: (option: PremiumSubscriptionOption) => void;
  public close: (callback: () => void) => void;

  constructor(options: PromoSlideTabOptions) {
    this.initPremiumTab(options);
  }

  private initPremiumTab(options: PromoSlideTabOptions) {
    const tab = document.createElement('div');
    const premiumImageContainer = document.createElement('div');
    premiumImageContainer.classList.add('popup-premium-header-image-container');
    const premiumImage = document.createElement('img');
    premiumImage.src = `assets/img/premium-star${window.devicePixelRatio > 1 ? '@2x' : ''}.png`;
    premiumImage.classList.add('popup-premium-header-image');
    premiumImageContainer.append(premiumImage);
    options.body.append(premiumImageContainer);
    const headingTextContainer = document.createElement('div');
    headingTextContainer.classList.add('popup-premium-heading-text-container');
    const headingTextTitle = document.createElement('div');
    headingTextTitle.append(options.isPremiumActive ? i18n('TelegramPremiumSubscribedTitle') : i18n('Premium.Boarding.Title'));
    headingTextTitle.classList.add('popup-premium-heading-text-title');
    const headingTextDescription = document.createElement('div');
    headingTextDescription.classList.add('popup-premium-heading-text-description');
    headingTextDescription.append(options.isPremiumActive ? i18n('TelegramPremiumSubscribedSubtitle') : i18n('Premium.Boarding.Info'));
    headingTextContainer.append(headingTextTitle, headingTextDescription);

    const periodOptions = options.premiumPromo.period_options;
    const shortestOption = periodOptions.slice().sort((a, b) => a.months - b.months)[0];
    const wrapCurrency = (amount: number | string) => paymentsWrapCurrencyAmount(amount, shortestOption.currency, false, true);
    const keys: {[key: number]: LangPackKey} = {
      12: 'PremiumTierAnnual',
      6: 'PremiumTierSemiannual',
      1: 'PremiumTierMonthly'
    };

    const rows = options.isPremiumActive ? [] : periodOptions.map((option, idx) => {
      let subtitle = option !== shortestOption ? i18n('PricePerMonth', [wrapCurrency(+option.amount / option.months)]) : undefined;
      if(option !== shortestOption) {
        const span = document.createElement('span');
        const badge = document.createElement('span');
        badge.classList.add('popup-gift-premium-discount');
        const shortestAmount = +shortestOption.amount * option.months / shortestOption.months;
        const discount = Math.round((1 - +option.amount / shortestAmount) * 100);
        badge.textContent = '-' + discount + '%';
        span.append(badge, subtitle);
        subtitle = span;
      }

      const checkboxField = new CheckboxField({
        checked: idx === 0,
        round: true,
        name: 'premium-period',
        asRadio: true
      });

      const row = new Row({
        title: i18n(keys[option.months] || 'Months', [option.months]),
        checkboxField,
        clickable: true,
        subtitle: subtitle,
        titleRightSecondary: wrapCurrency(option.amount)
      });

      row.container.classList.add('popup-gift-premium-option');

      return row;
    });

    let form: HTMLFormElement;
    if(rows.length) {
      form = document.createElement('form');
      form.classList.add('popup-gift-premium-options');
      form.append(...rows.map((row) => row.container));
    }

    const getSelectedOption = () => periodOptions[rows.findIndex((row) => row.checkboxField.checked)];

    form?.addEventListener('change', () => {
      this.selectPeriod(getSelectedOption());
    });

    const featuresContainer = document.createElement('div');
    featuresContainer.classList.add('popup-premium-features-container');
    featuresContainer.append(...this.createFeatures(options.features, options.order));
    if(options.premiumPromo.status_text) {
      const statusText = document.createElement('div');
      statusText.classList.add('popup-premium-status-text');
      const wrapped = wrapRichText(options.premiumPromo.status_text, {entities: options.premiumPromo.status_entities});
      setInnerHTML(statusText, wrapped);
      featuresContainer.append(statusText);

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
    }
    options.body.append(...[headingTextContainer, form, featuresContainer].filter(Boolean));
    tab.append(options.header, options.body);

    tab.classList.add('premium-promo-tab', 'not-bottom', 'scrollable', 'scrollable-y');
    options.container.classList.add('fixed-size');
    this.tab = tab;

    tab.addEventListener('scroll', (e) => {
      const {scrollTop, scrollHeight} = tab;
      options.header.classList.toggle('is-visible', scrollTop > 100);
      options.header.classList.toggle('not-top', scrollTop > 0);
      tab.classList.toggle('not-bottom', (scrollHeight - scrollTop) > tab.offsetHeight);
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

      return row.container;
    });
  }
}
