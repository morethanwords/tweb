import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {i18n} from '@lib/langPack';
import {PaymentsPaymentForm, User} from '@layer';
import {getCardDetailsInfo} from '@components/popups/payment';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import showPaymentCardPopup, {PaymentCardDetails} from '@components/popups/paymentCard';
import Row from '@components/rowTsx';
import {createSignal, JSX} from 'solid-js';
import Section from '@components/section';

function PaymentMethodRow(props: {
  checked?: boolean,
  onSelect: () => void,
  title: JSX.Element
}) {
  return (
    <Row
      class="payment-item-row"
      noWrap
    >
      <Row.Title>{props.title}</Row.Title>
      <Row.CheckboxField>
        <CheckboxFieldTsx
          class="disable-hover"
          checked={props.checked}
          round
          onChange={() => props.onSelect()}
        />
      </Row.CheckboxField>
    </Row>
  );
}

export default function showPaymentMethodsPopup(options: {
  paymentForm: PaymentsPaymentForm.paymentsPaymentForm,
  user: User.user,
  savedCard?: PaymentCardDetails,
  /** Forwarded to the card popup this one opens — the saved card answers nothing. */
  onFinish?: Parameters<typeof showPaymentCardPopup>[0]['onFinish']
}) {
  const {paymentForm, user, savedCard} = options;
  const [show, setShow] = createSignal(true);

  createPopup(() => {
    const selectMethod = (onClick: () => void) => {
      setShow(false);
      onClick();
    };

    const savedCardTitle = savedCard && getCardDetailsInfo(savedCard).str;

    return (
      <PopupElement
        class="popup-payment popup-payment-methods"
        closable
        show={show()}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="PaymentMethod" />
        </PopupElement.Header>
        <PopupElement.Body>
          <Section>
            <PaymentMethodRow
              title={i18n('PaymentMethodNewCard')}
              onSelect={() => selectMethod(() => showPaymentCardPopup({
                paymentForm,
                user,
                onFinish: options.onFinish
              }))}
            />
            {savedCardTitle && (
              <PaymentMethodRow
                checked
                title={savedCardTitle}
                onSelect={() => selectMethod(() => {})}
              />
            )}
            {paymentForm.additional_methods?.map((method) => (
              <PaymentMethodRow
                title={wrapEmojiText(method.title)}
                onSelect={() => selectMethod(() => showPaymentCardPopup({
                  paymentForm,
                  user,
                  method,
                  onFinish: options.onFinish
                }))}
              />
            ))}
          </Section>
        </PopupElement.Body>
      </PopupElement>
    );
  });
}
