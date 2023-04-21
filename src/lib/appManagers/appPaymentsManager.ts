/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {InputInvoice, InputPaymentCredentials, PaymentRequestedInfo, PaymentsPaymentForm} from '../../layer';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';

export default class AppPaymentsManager extends AppManager {
  public getInputInvoiceBySlug(slug: string): InputInvoice.inputInvoiceSlug {
    return {
      _: 'inputInvoiceSlug',
      slug
    };
  }

  public getInputInvoiceByPeerId(peerId: PeerId, mid: number): InputInvoice.inputInvoiceMessage {
    return {
      _: 'inputInvoiceMessage',
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    };
  }

  public getPaymentForm(invoice: InputInvoice) {
    return this.apiManager.invokeApi('payments.getPaymentForm', {
      invoice
    }).then((paymentForm) => {
      this.appUsersManager.saveApiUsers(paymentForm.users);
      paymentForm.photo = this.appWebDocsManager.saveWebDocument(paymentForm.photo);

      return paymentForm;
    });
  }

  public getPaymentReceipt(peerId: PeerId, mid: number) {
    return this.apiManager.invokeApi('payments.getPaymentReceipt', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    }).then((paymentForm) => {
      this.appUsersManager.saveApiUsers(paymentForm.users);
      paymentForm.photo = this.appWebDocsManager.saveWebDocument(paymentForm.photo);

      return paymentForm;
    });
  }

  public validateRequestedInfo(invoice: InputInvoice, info: PaymentRequestedInfo, save?: boolean) {
    return this.apiManager.invokeApi('payments.validateRequestedInfo', {
      save,
      invoice,
      info
    });
  }

  public sendPaymentForm(
    invoice: InputInvoice,
    formId: PaymentsPaymentForm['form_id'],
    requestedInfoId: string,
    shippingOptionId: string,
    credentials: InputPaymentCredentials,
    tipAmount?: number
  ) {
    return this.apiManager.invokeApi('payments.sendPaymentForm', {
      form_id: formId,
      invoice,
      requested_info_id: requestedInfoId,
      shipping_option_id: shippingOptionId,
      credentials,
      tip_amount: tipAmount || undefined
    }).then((result) => {
      if(result._ === 'payments.paymentResult') {
        this.apiUpdatesManager.processUpdateMessage(result.updates);
      }

      return result;
    });
  }

  public clearSavedInfo(info?: boolean, credentials?: boolean) {
    return this.apiManager.invokeApi('payments.clearSavedInfo', {
      info,
      credentials
    });
  }
}
