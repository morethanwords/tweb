import PopupElement, {createPopup} from '@components/popups/indexTsx';
import accumulate from '@helpers/array/accumulate';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {PaymentsPaymentForm, PaymentsValidatedRequestedInfo, ShippingOption} from '@layer';
import RadioFormTsx from '@components/radioFormTsx';
import Section from '@components/section';

export default function showPaymentShippingMethodsPopup(options: {
  paymentForm: PaymentsPaymentForm,
  requestedInfo: PaymentsValidatedRequestedInfo,
  shippingOption: ShippingOption,
  onFinish?: (shippingOption: ShippingOption) => void
}) {
  const {paymentForm, requestedInfo, shippingOption} = options;
  const selectedShippingId = shippingOption?.id || requestedInfo.shipping_options[0].id;
  const values = requestedInfo.shipping_options.map((option) => ({
    checked: option.id === selectedShippingId,
    text: option.title,
    value: option.id,
    subtitle: paymentsWrapCurrencyAmount(
      accumulate(option.prices.map(({amount}) => +amount), 0),
      paymentForm.invoice.currency
    )
  }));

  let lastShippingId = selectedShippingId;

  createPopup(() => (
    <PopupElement
      class="popup-payment popup-payment-shipping-methods"
      closable
      show
    >
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="PaymentShippingMethod" />
      </PopupElement.Header>
      <PopupElement.Scrollable>
        <PopupElement.Body>
          <Section name="PaymentCheckoutShippingMethod">
            <RadioFormTsx<string>
              name="shipping-method"
              values={values}
              onChange={(value) => lastShippingId = value}
            />
          </Section>
        </PopupElement.Body>
      </PopupElement.Scrollable>
      <PopupElement.Footer>
        <PopupElement.FooterButton
          confirm
          langKey="PaymentInfo.Done"
          callback={() => {
            options.onFinish?.(requestedInfo.shipping_options.find((option) => option.id === lastShippingId));
          }}
        />
      </PopupElement.Footer>
    </PopupElement>
  ));
}
