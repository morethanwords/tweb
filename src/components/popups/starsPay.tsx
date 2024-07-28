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
import {InputInvoice, MessageMedia, PaymentsPaymentForm, PaymentsPaymentReceipt, StarsTransaction, Message, MessageExtendedMedia, Photo, Document} from '../../layer';
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
import PopupStars, {getStarsTransactionTitleAndMedia, StarsBalance, StarsChange} from './stars';
import {createMemo, JSX} from 'solid-js';
import partition from '../../helpers/array/partition';
import generatePhotoForExtendedMediaPreview from '../../lib/appManagers/utils/photos/generatePhotoForExtendedMediaPreview';
import wrapMediaSpoiler from '../wrappers/mediaSpoiler';
import getServerMessageId from '../../lib/appManagers/utils/messageId/getServerMessageId';
import wrapTelegramUrlToAnchor from '../../lib/richTextProcessor/wrapTelegramUrlToAnchor';
import cancelEvent from '../../helpers/dom/cancelEvent';
import AppMediaViewer from '../appMediaViewer';
import AppMediaViewerBase from '../appMediaViewerBase';
import SearchListLoader from '../../helpers/searchListLoader';

export default class PopupStarsPay extends PopupElement<{
  finish: (result: PopupPaymentResult) => void
}> {
  private paymentForm: PaymentsPaymentForm.paymentsPaymentFormStars | PaymentsPaymentReceipt.paymentsPaymentReceiptStars;
  private result: PopupPaymentResult;
  private inputInvoice: InputInvoice;
  private isReceipt: boolean;
  private isTopUp: boolean;
  private paidMedia: MessageMedia.messageMediaPaidMedia;
  private message: Message.message;
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

  private _construct(
    image: HTMLElement,
    _title: HTMLElement,
    avatar: HTMLElement,
    itemImage?: HTMLElement,
    link?: string
  ) {
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
    if(this.transaction?.extended_media) {
      title = i18n('StarMediaPurchase');
    } else if(this.paidMedia) {
      const [photos, videos] = partition(this.paidMedia.extended_media, (extendedMedia) => {
        if(extendedMedia._ === 'messageExtendedMedia') {
          return extendedMedia.media._ !== 'messageMediaDocument';
        } else {
          return extendedMedia.video_duration === undefined;
        }
      });

      const multiplePhotosLang = i18n('Stars.Unlock.Photos', [photos.length]);
      const multipleVideosLang = i18n('Stars.Unlock.Videos', [videos.length]);

      title = i18n('StarsConfirmPurchaseTitle');
      subtitle = i18n('Stars.Unlock', [
        photos.length && videos.length ?
          i18n('Stars.Unlock.Media', [multiplePhotosLang, multipleVideosLang]) :
          (photos.length || videos.length) === 1 ? i18n(photos.length ? 'Stars.Unlock.Photo' : 'Stars.Unlock.Video') : (photos.length ? multiplePhotosLang : multipleVideosLang),
        _title,
        i18n('Stars.Unlock.Stars', [amount])
      ]);
    } else if(this.transaction && !this.form.title) {
      title = i18n('Stars.TopUp');
    } else {
      title = this.isReceipt ? wrapEmojiText(this.form.title) : i18n('StarsConfirmPurchaseTitle');
      subtitle = this.isReceipt ? wrapEmojiText(this.form.description) : i18n('StarsConfirmPurchaseText', [amount, wrapEmojiText(this.paymentForm.title), _title]);
    }

    const transactionId = this.transaction?.id ?? (this.paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceiptStars).transaction_id;
    const onTransactionClick = () => {
      copyTextToClipboard(transactionId);
      toastNew({langPackKey: 'StarsTransactionIDCopied'});
    };

    const hidePopupsWithCallback = (callback: () => void, e?: Event) => {
      cancelEvent(e);
      this.hide();
      const starsPopups = PopupElement.getPopups(PopupStars);
      starsPopups?.[0]?.hide();
      this.hideWithCallback(callback);
    };

    const messageAnchor = link && wrapTelegramUrlToAnchor(link);
    if(messageAnchor) {
      messageAnchor.textContent = link.replace('https://', '');
      messageAnchor.onclick = (e) => hidePopupsWithCallback(() => appImManager.openUrl(link), e);
    }

    const tableContent: Parameters<typeof Table>[0]['content'] = this.isReceipt && [
      this.peerId ? ['BoostingTo', TablePeer({peerId: this.peerId, onClick: () => {
        hidePopupsWithCallback(() => {
          appImManager.setInnerPeer({peerId: this.peerId})
        });
      }})] : ['Stars.Via', _title],
      this.transaction?.extended_media && ['StarsTransactionMedia', messageAnchor],
      ['StarsTransactionID', <span onClick={onTransactionClick}>{wrapRichText(transactionId, {entities: [{_: 'messageEntityCode', length: transactionId.length, offset: 0}]})}</span>],
      ['StarsTransactionDate', formatFullSentTime((this.form as PaymentsPaymentReceipt.paymentsPaymentReceiptStars).date, undefined, true)]
    ];

    return (
      <div class="popup-stars-pay-padding">
        {image}
        <div class="popup-stars-pay-images">
          {itemImage}
          <div
            class="popup-stars-pay-avatar"
            onClick={async() => {
              if(!this.isReceipt || !this.transaction.extended_media) {
                return;
              }

              const extendedMedia = this.transaction.extended_media;
              const media = extendedMedia.map((messageMedia) => {
                return (messageMedia as MessageMedia.messageMediaPhoto).photo as Photo.photo ||
                  (messageMedia as MessageMedia.messageMediaDocument).document as Document.document;
              });

              const message = await this.managers.appMessagesManager.generateStandaloneOutgoingMessage(this.peerId);
              message.media = {
                _: 'messageMediaPaidMedia',
                extended_media: extendedMedia.map((messageMedia) => {
                  return {_: 'messageExtendedMedia', media: messageMedia};
                }),
                stars_amount: 0
              };
              message.id = getServerMessageId(this.transaction.msg_id);
              message.mid = this.transaction.msg_id;

              const targets: AppMediaViewer['target'][] = media.map((media, index) => {
                return {element: null, mid: 0, peerId: 0, index, message};
              });

              targets[0].element = avatar;

              new AppMediaViewer(true)
              .setSearchContext({peerId: 0, inputFilter: {_: 'inputMessagesFilterEmpty'}, useSearch: false})
              .openMedia({
                message,
                target: targets[0].element,
                fromRight: 0,
                reverse: false,
                prevTargets: [],
                nextTargets: targets.slice(1)
              });
            }}
          >{avatar}</div>
        </div>
        <div class="popup-stars-title">{title}</div>
        {subtitle && <div class="popup-stars-subtitle">{subtitle}</div>}
        {this.isReceipt && (
          <>
            <StarsChange stars={!this.transaction ? -+amount : amount} isRefund={!!this.transaction?.pFlags?.refund} />
            <Table content={tableContent.filter(Boolean)} />
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

    const [image, {title, media}, itemImage, link] = await Promise.all([
      (async() => {
        const img = document.createElement('img');
        img.classList.add('popup-stars-image');
        await renderImageFromUrlPromise(img, `assets/img/${maybe2x('stars_pay')}.png`);
        return img;
      })(),
      (async() => {
        const result = await getStarsTransactionTitleAndMedia(
          this.transaction,
          this.middlewareHelper.get(),
          90,
          this.paidMedia,
          this.message ? this.message.fwdFromId || this.message.peerId : this.peerId
        );

        result.media.classList.add('popup-stars-pay-item');

        return result;
      })(),
      (async() => {
        return undefined as HTMLElement;
        // if(!this.form.photo || true) {
        //   return;
        // }

        // const div = document.createElement('div');
        // div.classList.add('popup-stars-pay-item');
        // const loadPromises: Promise<any>[] = [];
        // wrapPhoto({
        //   photo: this.form.photo,
        //   container: div,
        //   boxWidth: 90,
        //   boxHeight: 90,
        //   size: {_: 'photoSizeEmpty', type: ''},
        //   loadPromises
        // });
        // await Promise.all(loadPromises);
        // return div;
      })(),
      (async() => {
        if(!this.transaction?.extended_media) {
          return;
        }

        return this.managers.apiManager.invokeApi('channels.exportMessageLink', {
          channel: await this.managers.appChatsManager.getChannelInput(this.peerId.toChatId()),
          id: getServerMessageId(this.transaction.msg_id)
        }).then((exportedMessageLink) => {
          return exportedMessageLink.link;
        });
      })()
    ]);
    this.body.classList.toggle('is-receipt', this.isReceipt);
    this.appendSolid(() => this._construct(image, title, media, itemImage, link));
    this.show();
  }
}
