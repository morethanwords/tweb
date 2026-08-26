import PopupElement from '.';
import accumulate from '@helpers/array/accumulate';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {PaymentsPaymentForm, PaymentsValidatedRequestedInfo, ShippingOption} from '@layer';
import {PaymentButton} from '@components/popups/payment';
import RadioFormTsx from '@components/radioFormTsx';
import Section from '@components/section';
import {createComponent} from 'solid-js';

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
    const selectedShippingId = this.shippingOption?.id || this.requestedInfo.shipping_options[0].id;
    const values = this.requestedInfo.shipping_options.map((shippingOption) => ({
      checked: shippingOption.id === selectedShippingId,
      text: shippingOption.title,
      value: shippingOption.id,
      subtitle: paymentsWrapCurrencyAmount(
        accumulate(shippingOption.prices.map(({amount}) => +amount), 0),
        this.paymentForm.invoice.currency
      )
    }));

    let lastShippingId = selectedShippingId;
    this.appendSolid(() => createComponent(Section, {
      name: 'PaymentCheckoutShippingMethod',
      noDelimiter: true,
      noShadow: true,
      get children() {
        return createComponent(RadioFormTsx<string>, {
          name: 'shipping-method',
          values,
          onChange: (value) => {
            lastShippingId = value;
          }
        });
      }
    }));

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
