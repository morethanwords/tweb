import PopupElement from '.';
import {i18n} from '@lib/langPack';
import {PaymentsPaymentForm, User} from '@layer';
import PopupPayment from '@components/popups/payment';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import PopupPaymentCard, {PaymentCardDetails, PaymentCardDetailsResult} from '@components/popups/paymentCard';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import Row from '@components/rowTsx';
import {JSX} from 'solid-js';

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

export default class PopupPaymentMethods extends PopupElement {
  private promise: CancellablePromise<PopupPaymentCard>;

  constructor(
    private paymentForm: PaymentsPaymentForm.paymentsPaymentForm,
    private user: User.user,
    private savedCard?: PaymentCardDetails
  ) {
    super('popup-payment popup-payment-methods', {
      closable: true,
      overlayClosable: true,
      body: true,
      title: 'PaymentMethod'
    });

    this.promise = deferredPromise();
    this.addEventListener('closeAfterTimeout', () => {
      this.promise.reject();
    });
    this.construct();
  }

  public waitForMethodPopup() {
    return this.promise;
  }

  private _construct() {
    const selectMethod = (onClick: () => PopupPaymentCard) => {
      this.hide();
      this.promise.resolve(onClick());
    };

    const savedCardTitle = this.savedCard && PopupPayment.getCardDetailsInfo(this.savedCard).str;

    return (
      <>
        <PaymentMethodRow
          title={i18n('PaymentMethodNewCard')}
          onSelect={() => selectMethod(() => PopupElement.createPopup(
            PopupPaymentCard,
            this.paymentForm,
            this.user
          ))}
        />
        {savedCardTitle && (
          <PaymentMethodRow
            checked
            title={savedCardTitle}
            onSelect={() => selectMethod(() => undefined)}
          />
        )}
        {this.paymentForm.additional_methods.map((method) => (
          <PaymentMethodRow
            title={wrapEmojiText(method.title)}
            onSelect={() => selectMethod(() => PopupElement.createPopup(
              PopupPaymentCard,
              this.paymentForm,
              this.user,
              undefined,
              method
            ))}
          />
        ))}
      </>
    );
  }

  private async construct() {
    this.appendSolid(() => this._construct());
    this.show();
  }
}
