/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {PremiumGiftCodeOption} from '../../layer';
import I18n, {i18n, _i18n} from '../../lib/langPack';
import {avatarNew} from '../avatarNew';
import Button from '../button';
import CheckboxField from '../checkboxField';
import Row from '../row';
import wrapPeerTitle from '../wrappers/peerTitle';
import PopupPayment from './payment';

const className = 'popup-gift-premium';

export default class PopupGiftPremium extends PopupElement {
  constructor(
    private peerId: PeerId,
    private giftOptions: PremiumGiftCodeOption[]
  ) {
    super(className, {closable: true, overlayClosable: true, body: true, scrollable: true});

    this.construct();
  }

  public async construct() {
    const {peerId, giftOptions} = this;
    const avatar = avatarNew({
      middleware: this.middlewareHelper.get(),
      size: 100,
      peerId
    });
    avatar.node.classList.add(className + '-avatar');

    const title = document.createElement('span');
    _i18n(title, 'GiftTelegramPremiumTitle');
    title.classList.add(className + '-title');

    const subtitle = i18n('GiftTelegramPremiumDescription', [await wrapPeerTitle({peerId})]);
    subtitle.classList.add(className + '-subtitle');

    const shortestOption = this.giftOptions.slice().sort((a, b) => a.months - b.months)[0];

    const wrapCurrency = (amount: number | string) => paymentsWrapCurrencyAmount(amount, shortestOption.currency, false, true, true);

    const rows = this.giftOptions.map((giftOption, idx) => {
      let subtitle = i18n('PricePerMonth', [wrapCurrency(+giftOption.amount / giftOption.months)]);
      if(giftOption !== shortestOption) {
        const span = document.createElement('span');
        const badge = document.createElement('span');
        badge.classList.add(className + '-discount');
        const shortestAmount = +shortestOption.amount * giftOption.months / shortestOption.months;
        const discount = Math.round((1 - +giftOption.amount / shortestAmount) * 100);
        badge.textContent = '-' + discount + '%';
        span.append(badge, subtitle);
        subtitle = span;
      }

      const isYears = !(giftOption.months % 12);
      const checkboxField = new CheckboxField({
        checked: idx === 0,
        round: true,
        name: 'gift-months',
        asRadio: true
      });

      const row = new Row({
        title: i18n(isYears ? 'Years' : 'Months', [isYears ? giftOption.months / 12 : giftOption.months]),
        checkboxField,
        clickable: true,
        subtitle,
        rightTextContent: wrapCurrency(giftOption.amount)
      });

      row.container.classList.add(className + '-option');

      return row;
    });

    const form = document.createElement('form');
    form.classList.add(className + '-options');
    form.append(...rows.map((row) => row.container));

    const buttonText = new I18n.IntlElement({key: 'GiftSubscriptionFor', args: [wrapCurrency(giftOptions[0].amount)]});

    const getSelectedOption = () => giftOptions[rows.findIndex((row) => row.checkboxField.checked)];

    this.listenerSetter.add(form)('change', () => {
      buttonText.compareAndUpdate({
        args: [
          wrapCurrency(getSelectedOption().amount)
        ]
      });
    });

    const giftButton = Button(`btn-primary ${className}-confirm shimmer`);
    giftButton.append(buttonText.element);

    attachClickEvent(giftButton, async() => {
      const giftOption = getSelectedOption();
      PopupPayment.create({
        inputInvoice: {
          _: 'inputInvoicePremiumGiftCode',
          option: giftOption,
          purpose: {
            _: 'inputStorePaymentPremiumGiftCode',
            amount: giftOption.amount,
            currency: giftOption.currency,
            users: [await this.managers.appUsersManager.getUserInput(peerId.toUserId())]
          }
        }
      });
      this.hide();
    }, {listenerSetter: this.listenerSetter});

    this.scrollable.append(
      avatar.node,
      title,
      subtitle,
      form,
      giftButton
    );

    this.show();
  }
}
