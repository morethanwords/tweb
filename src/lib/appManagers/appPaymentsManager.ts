/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {
  HelpPremiumPromo,
  InputInvoice,
  InputPaymentCredentials,
  InputStorePaymentPurpose,
  PaymentRequestedInfo,
  PaymentsPaymentForm,
  PaymentsPaymentResult,
  PaymentsStarsStatus,
  StarsAmount,
  StarsTransactionPeer,
  Update
} from '../../layer';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';
import formatStarsAmount from './utils/payments/formatStarsAmount';

export default class AppPaymentsManager extends AppManager {
  private premiumPromo: MaybePromise<HelpPremiumPromo>;
  private starsStatus: MaybePromise<PaymentsStarsStatus>;
  private starsStatusTon: MaybePromise<PaymentsStarsStatus>;

  protected after() {
    // * reset premium promo
    this.rootScope.addEventListener('premium_toggle', () => {
      this.getPremiumPromo(true);
    });

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateStarsBalance: this.onUpdateStarsBalance
    });
  }

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
      invoice,
      theme_params: this.apiManager.getThemeParams()
    }).then((paymentForm) => {
      if(paymentForm._ !== 'payments.paymentFormStarGift') {
        this.appPeersManager.saveApiPeers(paymentForm);
        paymentForm.photo = this.appWebDocsManager.saveWebDocument(paymentForm.photo);
      }

      return paymentForm;
    });
  }

  public getPaymentReceipt(peerId: PeerId, mid: number) {
    return this.apiManager.invokeApi('payments.getPaymentReceipt', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    }).then((paymentForm) => {
      this.appPeersManager.saveApiPeers(paymentForm);
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
    }).then(this.processPaymentResult);
  }

  public clearSavedInfo(info?: boolean, credentials?: boolean) {
    return this.apiManager.invokeApi('payments.clearSavedInfo', {
      info,
      credentials
    });
  }

  public getPremiumGiftCodeOptions(peerId?: PeerId) {
    return this.apiManager.invokeApiCacheable('payments.getPremiumGiftCodeOptions', {
      boost_peer: peerId !== undefined ? this.appPeersManager.getInputPeerById(peerId) : undefined
    });
  }

  public getPremiumPromo(overwrite?: boolean) {
    if(overwrite && this.premiumPromo) {
      this.premiumPromo = undefined;
    }

    return this.premiumPromo ??= this.apiManager.invokeApiSingleProcess({
      method: 'help.getPremiumPromo',
      params: {},
      processResult: (helpPremiumPromo) => {
        this.appPeersManager.saveApiPeers(helpPremiumPromo);
        helpPremiumPromo.videos = helpPremiumPromo.videos.map((doc) => {
          return this.appDocsManager.saveDoc(doc, {type: 'premiumPromo'});
        });

        return this.premiumPromo = helpPremiumPromo;
      }
    });
  }

  public checkGiftCode(slug: string) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.checkGiftCode',
      params: {slug},
      processResult: (checkedGiftCode) => {
        this.appPeersManager.saveApiPeers(checkedGiftCode);
        checkedGiftCode.slug = slug;

        if(checkedGiftCode.giveaway_msg_id) {
          const fromPeerId = checkedGiftCode.from_id && this.appPeersManager.getPeerId(checkedGiftCode.from_id);
          checkedGiftCode.giveaway_msg_id = this.appMessagesIdsManager.generateMessageId(
            checkedGiftCode.giveaway_msg_id,
            !fromPeerId || fromPeerId.isUser() ? undefined : fromPeerId.toChatId()
          );
        }

        return checkedGiftCode;
      }
    });
  }

  public applyGiftCode(slug: string) {
    // return Promise.reject({type: 'PREMIUM_SUB_ACTIVE_UNTIL_1703345751'});

    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.applyGiftCode',
      params: {slug},
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      }
    });
  }

  public getGiveawayInfo(peerId: PeerId, mid: number) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.getGiveawayInfo',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        msg_id: getServerMessageId(mid)
      }
    });
  }

  public launchPrepaidGiveaway(peerId: PeerId, id: Long, purpose: InputStorePaymentPurpose) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.launchPrepaidGiveaway',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        giveaway_id: id,
        purpose
      },
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      }
    });
  }

  public getStarsTopupOptions() {
    return this.apiManager.invokeApi('payments.getStarsTopupOptions');
  }

  private saveStarsStatus = (starsStatus: PaymentsStarsStatus) => {
    this.appPeersManager.saveApiPeers(starsStatus);

    starsStatus.history?.forEach((transaction) => {
      const transactionPeer = transaction.peer as StarsTransactionPeer.starsTransactionPeer;
      const peerId = transactionPeer && this.appPeersManager.getPeerId(transactionPeer.peer);
      if(transaction.msg_id) {
        transaction.msg_id = this.appMessagesIdsManager.generateMessageId(
          transaction.msg_id,
          this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined
        );
      }

      if(transaction.extended_media) {
        transaction.extended_media.forEach((messageMedia) => {
          this.appMessagesManager.saveMessageMedia(
            {media: messageMedia},
            {type: 'starsTransaction', peerId, mid: transaction.msg_id}
          );
        });
      }
    });

    return starsStatus;
  };

  public getCachedStarsStatus() {
    if(this.starsStatus instanceof Promise) return;
    return this.starsStatus;
  }

  public getStarsStatus(overwrite?: boolean) {
    if(overwrite) {
      this.starsStatus = undefined;
    }

    return this.starsStatus ??= this.apiManager.invokeApiSingleProcess({
      method: 'payments.getStarsStatus',
      params: {
        peer: this.appPeersManager.getInputPeerById(this.rootScope.myId)
      },
      processResult: (starsStatus) => {
        return this.starsStatus = this.saveStarsStatus(starsStatus);
      }
    });
  }

  public getStarsStatusTon(overwrite?: boolean) {
    if(overwrite) {
      this.starsStatusTon = undefined;
    }

    return this.starsStatusTon ??= this.apiManager.invokeApiSingleProcess({
      method: 'payments.getStarsStatus',
      params: {
        peer: this.appPeersManager.getInputPeerById(this.rootScope.myId),
        ton: true
      },
      processResult: (starsStatus) => {
        return this.starsStatusTon = this.saveStarsStatus(starsStatus);
      }
    });
  }

  public getStarsTransactions(offset: string = '', inbound?: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.getStarsTransactions',
      params: {
        peer: this.appPeersManager.getInputPeerById(this.rootScope.myId),
        offset,
        inbound,
        outbound: inbound === false,
        limit: 30
      },
      processResult: this.saveStarsStatus
    });
  }

  public getStarsSubscriptions(offset?: string, missingBalance?: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.getStarsSubscriptions',
      params: {
        // peer: this.appPeersManager.getInputPeerById(peerId),
        peer: this.appPeersManager.getInputPeerById(this.rootScope.myId),
        offset,
        missing_balance: missingBalance
      },
      processResult: this.saveStarsStatus
    });
  }

  public changeStarsSubscription(subscriptionId: string, canceled: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.changeStarsSubscription',
      params: {
        subscription_id: subscriptionId,
        peer: this.appPeersManager.getInputPeerById(this.rootScope.myId),
        canceled
      }
    });
  }

  public fulfillStarsSubscription(subscriptionId: string) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.fulfillStarsSubscription',
      params: {
        subscription_id: subscriptionId,
        peer: this.appPeersManager.getInputPeerById(this.rootScope.myId)
      }
    });
  }

  public sendStarsForm(
    invoice: InputInvoice,
    formId: PaymentsPaymentForm['form_id']
  ) {
    return this.apiManager.invokeApi('payments.sendStarsForm', {
      form_id: formId,
      invoice
    }).then(this.processPaymentResult);
  }

  public getStarsTransactionsByID(transactionId: string) {
    if(!transactionId) return;
    return this.apiManager.invokeApi('payments.getStarsTransactionsByID', {
      peer: this.appPeersManager.getInputPeerById(this.rootScope.myId),
      id: [{_: 'inputStarsTransaction', pFlags: {}, id: transactionId}]
    }).then((starsStatus) => {
      return starsStatus.history?.[0];
    });
  }

  public getStarsGiftOptions(userId: UserId) {
    return this.apiManager.invokeApi('payments.getStarsGiftOptions', {user_id: this.appUsersManager.getUserInput(userId)});
  }

  public getStarsGiveawayOptions() {
    return this.apiManager.invokeApi('payments.getStarsGiveawayOptions');
  }

  private processPaymentResult = (result: PaymentsPaymentResult) => {
    if(result._ === 'payments.paymentResult') {
      this.apiUpdatesManager.processUpdateMessage(result.updates);
    }

    return result;
  };

  public updateLocalStarsBalance(balance: StarsAmount, fulfilledReservedStars?: number) {
    const ton = balance._ === 'starsTonAmount';
    const starsStatus = balance._ === 'starsTonAmount' ? this.starsStatusTon : this.starsStatus;

    (starsStatus as PaymentsStarsStatus).balance = balance;
    this.rootScope.dispatchEvent('stars_balance', {
      balance: formatStarsAmount(balance),
      ton
    });
  }

  private onUpdateStarsBalance = (update: Update.updateStarsBalance) => {
    const isTon = update.balance._ === 'starsTonAmount';
    const starsStatus = isTon ? this.starsStatusTon : this.starsStatus;
    if(!starsStatus || starsStatus instanceof Promise) {
      return;
    }

    this.updateLocalStarsBalance(update.balance);
  };
}
