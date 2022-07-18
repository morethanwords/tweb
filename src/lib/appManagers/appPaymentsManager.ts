/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { InputPaymentCredentials, PaymentRequestedInfo, PaymentsPaymentForm } from "../../layer";
import { AppManager } from "./manager";
import getServerMessageId from "./utils/messageId/getServerMessageId";

export default class AppPaymentsManager extends AppManager {
  public getPaymentForm(peerId: PeerId, mid: number) {
    return this.apiManager.invokeApi('payments.getPaymentForm', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    }).then((paymentForm) => {
      this.appUsersManager.saveApiUsers(paymentForm.users);
      
      return paymentForm;
    });
  }

  public getPaymentReceipt(peerId: PeerId, mid: number) {
    return this.apiManager.invokeApi('payments.getPaymentReceipt', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    }).then((paymentForm) => {
      this.appUsersManager.saveApiUsers(paymentForm.users);
      
      return paymentForm;
    });
  }

  public validateRequestedInfo(peerId: PeerId, mid: number, info: PaymentRequestedInfo, save?: boolean) {
    return this.apiManager.invokeApi('payments.validateRequestedInfo', {
      save,
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid),
      info
    });
  }

  public sendPaymentForm(
    peerId: PeerId, 
    mid: number,
    formId: PaymentsPaymentForm['form_id'],
    requestedInfoId: string,
    shippingOptionId: string,
    credentials: InputPaymentCredentials,
    tipAmount?: number
  ) {
    return this.apiManager.invokeApi('payments.sendPaymentForm', {
      form_id: formId,
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid),
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
