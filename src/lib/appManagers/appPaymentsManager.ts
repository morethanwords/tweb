/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {HelpPremiumPromo, InputInvoice, InputPaymentCredentials, InputStorePaymentPurpose, PaymentRequestedInfo, PaymentsPaymentForm, PaymentsPaymentResult, PaymentsStarsStatus, Update} from '../../layer';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';

export default class AppPaymentsManager extends AppManager {
  private premiumPromo: MaybePromise<HelpPremiumPromo>;
  private starsStatus: MaybePromise<PaymentsStarsStatus>;

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
      this.appPeersManager.saveApiPeers(paymentForm);
      paymentForm.photo = this.appWebDocsManager.saveWebDocument(paymentForm.photo);

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

  public getPremiumGiftCodeOptions(peerId: PeerId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.getPremiumGiftCodeOptions',
      params: {
        boost_peer: this.appPeersManager.getInputPeerById(peerId)
      },
      processResult: (premiumGiftCodeOptions) => {
        return premiumGiftCodeOptions/* .filter((option) => !option.store_product) */;
      }
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
    return starsStatus;
  };

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

  public getStarsTransactions(offset: string = '', inbound?: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'payments.getStarsTransactions',
      params: {
        peer: this.appPeersManager.getInputPeerById(this.rootScope.myId),
        offset,
        inbound,
        outbound: inbound === false
      },
      processResult: this.saveStarsStatus
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

  private processPaymentResult = (result: PaymentsPaymentResult) => {
    if(result._ === 'payments.paymentResult') {
      this.apiUpdatesManager.processUpdateMessage(result.updates);
    }

    return result;
  };

  private onUpdateStarsBalance = (update: Update.updateStarsBalance) => {
    const {starsStatus} = this;
    if(!starsStatus || starsStatus instanceof Promise) {
      return;
    }

    (starsStatus as PaymentsStarsStatus).balance = update.balance;
    this.rootScope.dispatchEvent('stars_balance', update.balance);
  };
}
