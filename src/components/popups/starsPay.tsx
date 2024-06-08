/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {formatFullSentTime} from '../../helpers/date';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {renderImageFromUrlPromise} from '../../helpers/dom/renderImageFromUrl';
import toggleDisability from '../../helpers/dom/toggleDisability';
import maybe2x from '../../helpers/maybe2x';
import safeAssign from '../../helpers/object/safeAssign';
import classNames from '../../helpers/string/classNames';
import {InputInvoice, PaymentsPaymentForm, PaymentsPaymentReceipt, StarsTransaction} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import {avatarNew} from '../avatarNew';
import {replaceButtonIcon} from '../button';
import Icon from '../icon';
import {putPreloader} from '../putPreloader';
import Table, {TablePeer} from '../table';
import {toastNew} from '../toast';
import wrapPeerTitle from '../wrappers/peerTitle';
import wrapPhoto from '../wrappers/photo';
import PopupPayment, {PopupPaymentResult} from './payment';
import PopupStars, {getStarsTransactionTitle, getStarsTransactionTitleAndMedia, StarsBalance, StarsChange, StarsStar} from './stars';
import {JSX} from 'solid-js';

export default class PopupStarsPay extends PopupElement<{
  finish: (result: PopupPaymentResult) => void
}> {
  private paymentForm: PaymentsPaymentForm.paymentsPaymentFormStars | PaymentsPaymentReceipt.paymentsPaymentReceiptStars;
  private result: PopupPaymentResult;
  private inputInvoice: InputInvoice;
  private isReceipt: boolean;
  private peerId: PeerId;
  private transaction: StarsTransaction;

  constructor(options: ConstructorParameters<typeof PopupPayment>[0]) {
    super('popup-stars popup-stars-pay', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      footer: true,
      withConfirm: true,
      title: true
    });

    safeAssign(this, options);
    this.footer.classList.add('abitlarger');
    this.result = 'cancelled';

    const onConfirm = async() => {
      const {paymentForm} = this;
      if(this.isReceipt || !paymentForm) {
        this.hide();
        return;
      }

      const d = putPreloader(this.btnConfirm);
      const toggle = toggleDisability([this.btnConfirm], true);
      this.result = 'pending';
      const result = this.managers.appPaymentsManager.sendStarsForm(options.inputInvoice, (paymentForm as PaymentsPaymentForm.paymentsPaymentFormStars).form_id);
      try {
        await result;
        this.result = 'paid';
        this.hide();
      } catch(err) {
        let shouldRetry = false;
        if((err as ApiError).type === 'BALANCE_TOO_LOW') {
          PopupElement.createPopup(PopupStars, {
            paymentForm: paymentForm as PaymentsPaymentForm.paymentsPaymentFormStars,
            onTopup: async() => {
              await this.reloadForm();
              onConfirm();
            }
          });
        } else if((err as ApiError).type === 'FORM_EXPIRED') {
          await this.reloadForm();
          shouldRetry = true;
        } else {
          this.result = 'failed';
        }

        toggle();
        d.remove();

        if(shouldRetry) {
          onConfirm();
        }
      }
    };

    attachClickEvent(this.btnConfirm, onConfirm, {listenerSetter: this.listenerSetter});
  }

  private get form() {
    return this.paymentForm || this.transaction;
  }

  public hide() {
    this.dispatchEvent('finish', this.result);
    return super.hide();
  }

  private async reloadForm() {
    this.paymentForm = await this.managers.appPaymentsManager.getPaymentForm(this.inputInvoice) as PaymentsPaymentForm.paymentsPaymentFormStars;
  }

  public setPaymentForm(paymentForm: PopupStarsPay['paymentForm']) {
    this.paymentForm = paymentForm;
    this.isReceipt = !!this.transaction || paymentForm._ === 'payments.paymentReceiptStars';
    this.construct();
  }

  private _construct(image: HTMLElement, botTitle: HTMLElement, avatar: HTMLElement, itemImage?: HTMLElement) {
    if(!this.isReceipt) {
      this.header.append(StarsBalance() as HTMLElement);
    }

    this.footer.append(this.btnConfirm);
    this.body.after(this.footer);
    let amount: Long;
    if(this.paymentForm) {
      const labeledPrice = this.paymentForm.invoice.prices[0];
      amount = labeledPrice.amount;
    } else {
      amount = this.transaction.stars;
    }

    if(this.isReceipt) {
      this.btnConfirm.append(i18n('OK'));
    } else {
      this.btnConfirm.append(i18n('Stars.ConfirmPurchaseButton', [amount]));
      replaceButtonIcon(this.btnConfirm, 'star');
    }

    let title: JSX.Element, subtitle: JSX.Element;
    if(this.transaction && !this.form.title) {
      title = i18n('Stars.TopUp');
    } else {
      title = this.isReceipt ? wrapEmojiText(this.form.title) : i18n('StarsConfirmPurchaseTitle');
      subtitle = this.isReceipt ? wrapEmojiText(this.form.description) : i18n('StarsConfirmPurchaseText', [amount, wrapEmojiText(this.paymentForm.title), botTitle]);
    }

    const transactionId = this.transaction?.id ?? (this.paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceiptStars).transaction_id;
    const onTransactionClick = () => {
      copyTextToClipboard(transactionId);
      toastNew({langPackKey: 'StarsTransactionIDCopied'});
    };

    return (
      <div class="popup-stars-pay-padding">
        {image}
        <div class="popup-stars-pay-images">
          {itemImage}
          <div class="popup-stars-pay-avatar">{avatar}</div>
        </div>
        <div class="popup-stars-title">{title}</div>
        {subtitle && <div class="popup-stars-subtitle">{subtitle}</div>}
        {this.isReceipt && (
          <>
            <StarsChange stars={!this.transaction ? -+amount : amount} />
            <Table content={[
              this.peerId ? ['BoostingTo', TablePeer({peerId: this.peerId, onClick: () => {
                this.hideWithCallback(() => {
                  appImManager.setInnerPeer({peerId: this.peerId})
                });
              }})] : ['Stars.Via', botTitle],
              ['StarsTransactionID', <span onClick={onTransactionClick}>{wrapRichText(transactionId, {entities: [{_: 'messageEntityCode', length: transactionId.length, offset: 0}]})}</span>],
              ['StarsTransactionDate', formatFullSentTime((this.form as PaymentsPaymentReceipt.paymentsPaymentReceiptStars).date, undefined, true)]
            ]} />
            <div class="popup-stars-pay-tos">{i18n('Stars.TransactionTOS')}</div>
          </>
        )}
      </div>
    );
  }

  private async construct() {
    if(this.paymentForm) {
      this.peerId = this.paymentForm.bot_id.toPeerId(false);
    } else if(this.transaction.peer._ === 'starsTransactionPeer') {
      this.peerId = getPeerId(this.transaction.peer.peer);
    }

    const [image, {title, media}, itemImage] = await Promise.all([
      (async() => {
        const img = document.createElement('img');
        img.classList.add('popup-stars-image');
        await renderImageFromUrlPromise(img, `assets/img/${maybe2x('stars_pay')}.png`);
        return img;
      })(),
      (async() => {
        if(this.peerId) {
          const [title, avatar] = await Promise.all([
            wrapPeerTitle({
              peerId: this.peerId
            }),
            avatarNew({
              peerId: this.peerId,
              size: 90,
              middleware: this.middlewareHelper.get()
            })
          ]);

          await avatar.readyThumbPromise;

          return {title, media: avatar.node};
        } else {
          return getStarsTransactionTitleAndMedia(this.transaction, this.middlewareHelper.get(), 90);
        }
      })(),
      (async() => {
        if(!this.form.photo) {
          return;
        }

        const div = document.createElement('div');
        div.classList.add('popup-stars-pay-item');
        const loadPromises: Promise<any>[] = [];
        wrapPhoto({
          photo: this.form.photo,
          container: div,
          boxWidth: 90,
          boxHeight: 90,
          size: {_: 'photoSizeEmpty', type: ''},
          loadPromises
        });
        await Promise.all(loadPromises);
        return div;
      })()
    ]);
    this.body.classList.toggle('is-receipt', this.isReceipt);
    this.appendSolid(() => this._construct(image, title, media, itemImage));
    this.show();
  }
}
