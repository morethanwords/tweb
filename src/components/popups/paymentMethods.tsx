/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import {i18n} from '../../lib/langPack';
import {PaymentsPaymentForm, User} from '../../layer';
import PopupPayment from './payment';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import CheckboxField from '../checkboxField';
import PopupPaymentCard, {PaymentCardDetails, PaymentCardDetailsResult} from './paymentCard';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import Row from '../row';

export default class PopupPaymentMethods extends PopupElement {
  private promise: CancellablePromise<PopupPaymentCard>;

  constructor(
    private paymentForm: PaymentsPaymentForm.paymentsPaymentForm,
    private user: User.user,
    private savedCard?: PaymentCardDetails,
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
    const createRow = (
      title: HTMLElement | DocumentFragment,
      onClick: () => PopupPaymentCard,
      checked?: boolean
    ) => {
      return PopupPayment.createRow({
        title,
        checkboxField: new CheckboxField({round: true, checked}),
        clickable: () => {
          this.hide();
          this.promise.resolve(onClick());
        }
      });
    };

    const newCardRow = createRow(i18n('PaymentMethodNewCard'), () => {
      return PopupElement.createPopup(
        PopupPaymentCard,
        this.paymentForm,
        this.user
      );
    });

    let currentCardRow: Row;
    if(this.savedCard) {
      const {str} = PopupPayment.getCardDetailsInfo(this.savedCard);
      const span = document.createElement('span');
      span.textContent = str;
      currentCardRow = createRow(span, () => undefined, true);
    }

    const additionalContainers = this.paymentForm.additional_methods.map((method) => {
      return createRow(wrapEmojiText(method.title), () => {
        return PopupElement.createPopup(
          PopupPaymentCard,
          this.paymentForm,
          this.user,
          undefined,
          method
        );
      }).container;
    });

    return (
      <>
        {newCardRow.container}
        {currentCardRow.container}
        {additionalContainers}
      </>
    );
  }

  private async construct() {
    this.appendSolid(() => this._construct());
    this.show();
  }
}
