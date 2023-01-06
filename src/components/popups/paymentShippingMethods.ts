/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import accumulate from '../../helpers/array/accumulate';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {PaymentsPaymentForm, PaymentsValidatedRequestedInfo, ShippingOption} from '../../layer';
import RadioField from '../radioField';
import Row, {RadioFormFromRows} from '../row';
import SettingSection from '../settingSection';
import {PaymentButton} from './payment';

export default class PopupPaymentShippingMethods extends PopupElement<{
  finish: (shippingOption: ShippingOption) => void
}> {
  constructor(
    private paymentForm: PaymentsPaymentForm,
    private requestedInfo: PaymentsValidatedRequestedInfo,
    private shippingOption: ShippingOption
  ) {
    super('popup-payment popup-payment-shipping-methods', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      title: 'PaymentShippingMethod'
    });

    this.d();
  }

  private d() {
    const section = new SettingSection({name: 'PaymentCheckoutShippingMethod', noDelimiter: true, noShadow: true});

    const rows = this.requestedInfo.shipping_options.map((shippingOption) => {
      return new Row({
        radioField: new RadioField({
          text: shippingOption.title,
          name: 'shipping-method',
          value: shippingOption.id
        }),
        subtitle: paymentsWrapCurrencyAmount(
          accumulate(shippingOption.prices.map(({amount}) => +amount), 0),
          this.paymentForm.invoice.currency
        )
      });
    });

    let lastShippingId: string;
    const form = RadioFormFromRows(rows, (value) => {
      lastShippingId = value;
    });

    if(this.shippingOption) {
      rows.find((row) => row.radioField.input.value === this.shippingOption.id).radioField.checked = true;
    } else {
      rows[0].radioField.checked = true;
    }

    section.content.append(form);

    this.scrollable.append(section.container);

    const payButton = PaymentButton({
      key: 'PaymentInfo.Done',
      onClick: () => {
        this.dispatchEvent('finish', this.requestedInfo.shipping_options.find((option) => option.id === lastShippingId));
        this.hide();
      }
    });
    this.body.append(this.btnConfirmOnEnter = payButton);

    this.show();
  }
}
