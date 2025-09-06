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
import {InputInvoice, MessageMedia, PaymentsPaymentForm, PaymentsPaymentReceipt, StarsTransaction, Message, MessageExtendedMedia, Photo, Document, ChatInvite, StarsSubscription, Chat, MessageAction, Boost, WebDocument} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import I18n, {i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import {replaceButtonIcon} from '../button';
import {putPreloader} from '../putPreloader';
import Table, {TablePeer} from '../table';
import {toastNew} from '../toast';
import PopupPayment, {PopupPaymentResult} from './payment';
import PopupStars, {getExamplesAnchor, getStarsTransactionTitleAndMedia, StarsAmount, StarsBalance, StarsChange} from './stars';
import {JSX} from 'solid-js';
import partition from '../../helpers/array/partition';
import getServerMessageId from '../../lib/appManagers/utils/messageId/getServerMessageId';
import wrapTelegramUrlToAnchor from '../../lib/richTextProcessor/wrapTelegramUrlToAnchor';
import cancelEvent from '../../helpers/dom/cancelEvent';
import AppMediaViewer from '../appMediaViewer';
import {NULL_PEER_ID, TON_CURRENCY} from '../../lib/mtproto/mtproto_config';
import tsNow from '../../helpers/tsNow';
import classNames from '../../helpers/string/classNames';
import {useChat} from '../../stores/peers';
import wrapLocalSticker from '../wrappers/localSticker';
import liteMode from '../../helpers/liteMode';
import PeerTitle from '../peerTitle';
import rootScope from '../../lib/rootScope';
import {IconTsx} from '../iconTsx';
import formatStarsAmount from '../../lib/appManagers/utils/payments/formatStarsAmount';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import DEBUG from '../../config/debug';
import makeError from '../../helpers/makeError';
import bigInt from 'big-integer';

const TEST_FIRST_TIME = DEBUG && false;

export default class PopupStarsPay extends PopupElement<{
  finish: (result: PopupPaymentResult) => void
}> {
  private paymentForm:
    | PaymentsPaymentForm.paymentsPaymentFormStars
    | PaymentsPaymentReceipt.paymentsPaymentReceiptStars
    | PaymentsPaymentForm.paymentsPaymentFormStarGift;
  private result: PopupPaymentResult;
  private inputInvoice: InputInvoice;
  private isReceipt: boolean;
  private isTopUp: boolean;
  private paidMedia: MessageMedia.messageMediaPaidMedia;
  private message: Message.message;
  private peerId: PeerId;
  private transaction: StarsTransaction;
  private chatInvite: ChatInvite.chatInvite;
  private subscription: StarsSubscription;
  private isOutGift: boolean;
  private boost: Boost;
  private noShowIfStars: boolean;
  private purpose: ConstructorParameters<typeof PopupPayment>[0]['purpose'];

  private onConfirm: () => void;

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
    let test = TEST_FIRST_TIME;

    const onConfirm = this.onConfirm = async() => {
      const {paymentForm} = this;
      if(this.isReceipt || (!paymentForm && !this.chatInvite && !this.subscription)) {
        this.hide();
        return;
      }

      const isTon = paymentForm?.invoice.currency === TON_CURRENCY
      const itemPrice = paymentForm ? +paymentForm.invoice.prices[0].amount : (this.chatInvite ? +this.chatInvite.subscription_pricing.amount : +this.subscription.pricing.amount)

      const d = putPreloader(this.btnConfirm);
      const toggle = toggleDisability([this.btnConfirm], true);
      this.result = 'pending';

      let result: Promise<any>;
      if(test) {
        test = false;
        result = Promise.reject(makeError('BALANCE_TOO_LOW'));
        // result = Promise.resolve();
      } else if(this.subscription) {
        result = this.managers.appPaymentsManager.changeStarsSubscription(
          this.subscription.id,
          !this.subscription.pFlags.canceled
        );
      } else {
        const balance = await this.managers.appPaymentsManager[isTon ? 'getStarsStatusTon' : 'getStarsStatus']();
        if(bigInt(balance.balance.amount as number).lt(itemPrice)) {
          result = Promise.reject(makeError('BALANCE_TOO_LOW'));
        } else {
          result = this.managers.appPaymentsManager.sendStarsForm(
            this.inputInvoice,
            (paymentForm as PaymentsPaymentForm.paymentsPaymentFormStars)?.form_id || this.chatInvite.subscription_form_id
          );
        }
      }

      try {
        await result;
        this.result = 'paid';
        this.hide();
      } catch(err) {
        let shouldRetry = false;
        if((err as ApiError).type === 'BALANCE_TOO_LOW') {
          PopupElement.createPopup(PopupStars, {
            itemPrice,
            paymentForm: paymentForm as PaymentsPaymentForm.paymentsPaymentFormStars,
            ton: isTon,
            onTopup: async() => {
              await this.reloadForm();
              onConfirm();
            },
            onCancel: () => {
              this.result = 'cancelled';
              this.hide();
            },
            purpose: this.purpose
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
    if(!this.paymentForm) {
      return;
    }

    this.paymentForm = await this.managers.appPaymentsManager.getPaymentForm(this.inputInvoice) as PaymentsPaymentForm.paymentsPaymentFormStars;
  }

  public setPaymentForm(paymentForm: PopupStarsPay['paymentForm']) {
    this.paymentForm = paymentForm;
    this.isReceipt = !!this.transaction || paymentForm?._ === 'payments.paymentReceiptStars';
    this.isOutGift = !!this.transaction && !this.transaction.id;
    this.construct();
  }

  private _construct(
    image: HTMLElement,
    _title: HTMLElement,
    avatar: HTMLElement,
    link?: string
  ) {
    if(!this.isReceipt && (!this.subscription || tsNow(true) > this.subscription.until_date)) {
      this.header.append(StarsBalance() as HTMLElement);
    }

    this.footer.append(this.btnConfirm);
    this.body.after(this.footer);
    let amount: Long;
    if(this.paymentForm) {
      const labeledPrice = this.paymentForm.invoice.prices[0];
      amount = labeledPrice.amount;
    } else if(this.chatInvite) {
      amount = this.chatInvite.subscription_pricing.amount;
    } else if(this.subscription) {
      amount = this.subscription.pricing.amount;
    } else {
      amount = formatStarsAmount(this.transaction.amount);
    }

    if(this.isReceipt) {
      this.btnConfirm.append(i18n('OK'));
    } else if(this.chatInvite) {
      this.btnConfirm.append(i18n('Stars.Subscribe.Button'));
      const terms = i18n('Stars.Subscribe.Terms');
      terms.classList.add('popup-footer-caption');
      this.btnConfirm.after(terms);
    } else if(this.subscription) {
      if(this.subscription.pFlags.canceled) {
        this.btnConfirm.append(i18n('Stars.Subscription.Renew'));
      } else {
        this.btnConfirm.className = 'btn-primary btn-secondary btn-primary-transparent danger';
        this.btnConfirm.append(i18n('Stars.Subscription.Cancel'));
      }

      if(this.subscription.until_date > tsNow(true)) {
        const chat = useChat(this.peerId.toChatId());
        if((chat as Chat.channel).pFlags.left) {
          const btnFulfill = document.createElement('button');
          btnFulfill.classList.add('btn-primary', 'btn-color-primary');
          btnFulfill.append(i18n('Stars.Subscription.Fulfill'));
          btnFulfill.style.marginTop = '.5rem';
          attachClickEvent(btnFulfill, async() => {
            const toggle = toggleDisability([this.btnConfirm, btnFulfill], true);
            try {
              await this.managers.appPaymentsManager.fulfillStarsSubscription(this.subscription.id);
              hidePopupsWithCallback(() => {
                appImManager.setInnerPeer({peerId: this.peerId});
              });
            } catch(err) {
              console.error('fulfill error', err);
              toggle();
            }
          }, {listenerSetter: this.listenerSetter});
          this.btnConfirm.after(btnFulfill);
        }
      }
    } else {
      this.btnConfirm.append(i18n('Stars.ConfirmPurchaseButton', [amount]));
      replaceButtonIcon(this.btnConfirm, 'star');
    }

    const hidePopupsWithCallback = (callback: () => void, e?: Event) => {
      cancelEvent(e);
      this.hide();
      const starsPopups = PopupElement.getPopups(PopupStars);
      starsPopups?.[0]?.hide();
      this.hideWithCallback(callback);
    };

    let noStarsChange = false;
    let title: JSX.Element, subtitle: JSX.Element;
    if(this.transaction && this.transaction.pFlags.gift) {
      title = i18n(this.isOutGift ? 'StarsGiftSent' : 'StarsGiftReceived');
      subtitle = document.createDocumentFragment();
      const anchor = getExamplesAnchor(hidePopupsWithCallback);
      const title1 = new PeerTitle();
      title1.update({peerId: this.peerId, wrapOptions: {middleware: this.middlewareHelper.get()}});
      (subtitle as DocumentFragment).append(
        i18n(this.isOutGift ? 'ActionGiftStarsSubtitle' : 'ActionGiftStarsSubtitleYou', [title1.element]),
        ' ',
        anchor
      );
    } else if(this.transaction?.extended_media) {
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
      subtitle = i18n(this.peerId.isUser() ? 'Stars.Unlock.FromBot' : 'Stars.Unlock', [
        photos.length && videos.length ?
          i18n('Stars.Unlock.Media', [multiplePhotosLang, multipleVideosLang]) :
          (photos.length || videos.length) === 1 ? i18n(photos.length ? 'Stars.Unlock.Photo' : 'Stars.Unlock.Video') : (photos.length ? multiplePhotosLang : multipleVideosLang),
        _title,
        i18n('Stars.Unlock.Stars', [amount])
      ]);
    } else if(this.transaction && this.transaction.pFlags.reaction) {
      title = i18n('StarsReactionTitle');
    } else if(this.transaction?.giveaway_post_id) {
      title = i18n(!this.transaction.id ? 'Stars' : 'StarsGiveawayPrizeReceived', [formatStarsAmount(this.transaction.amount)]);
      if(!this.transaction.id) {
        subtitle = (
          <span class="popup-stars-pay-boosts">
            <IconTsx icon="boost" />
            {i18n('BoostingBoostsCountTitle', [this.boost.multiplier || 1])}
          </span>
        );
        noStarsChange = true;
      }
    } else if(this.form._ === 'payments.paymentFormStarGift') {
      title = i18n('StarsConfirmPurchaseTitle');
      subtitle = i18n(this.inputInvoice._ === 'inputInvoiceStarGiftTransfer' ? 'StarGiftConfirmTransferText' : 'StarGiftConfirmPurchaseText', [amount]);
    } else if(this.transaction && !this.form.title) {
      title = i18n(this.transaction.subscription_period ? 'Stars.Subscription.Title' : 'Stars.TopUp');
    } else if(this.chatInvite) {
      title = i18n('Stars.Subscribe.Title');
      _title.style.display = 'inline';
      subtitle = i18n('Stars.Subscribe.Description', [_title, i18n('Stars.Unlock.Stars', [amount])]);
    } else if(this.subscription) {
      title = i18n('Stars.Subscription');
      subtitle = i18n('Stars.Subscription.Fee', [StarsAmount({stars: amount}) as HTMLElement]);
      (subtitle as HTMLElement).classList.add('secondary');
    } else if(this.transaction?.paid_messages) {
      title = i18n('PaidMessages.FeeForMessages', [this.transaction.paid_messages]);
      if(!this.transaction.pFlags.refund && +amount > 0) {
        subtitle = i18n('PaidMessages.YouReceiveWithCommissionNotice');
        Promise.resolve(apiManagerProxy.getAppConfig()).then((config) => {
          const intlElement = I18n.weakMap.get(subtitle as HTMLElement) as I18n.IntlElement;
          intlElement.compareAndUpdate({
            key: 'PaidMessages.YouReceiveWithCommissionNotice',
            args: [Math.round(config.stars_paid_message_commission_permille / 10)]
          })
        });
      }
    } else {
      title = this.isReceipt ? wrapEmojiText(this.form.title) : i18n('StarsConfirmPurchaseTitle');
      subtitle = this.isReceipt ?
        wrapEmojiText(this.form.description) :
        i18n('StarsConfirmPurchaseText', [amount, wrapEmojiText((this.paymentForm as PaymentsPaymentForm.paymentsPaymentFormStars).title), _title]);
    }

    const transactionId = this.transaction?.id ?? (this.paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceiptStars)?.transaction_id;
    const onTransactionClick = () => {
      copyTextToClipboard(transactionId);
      toastNew({langPackKey: 'StarsTransactionIDCopied'});
    };

    const messageAnchor = link && wrapTelegramUrlToAnchor(link);
    if(messageAnchor) {
      messageAnchor.textContent = link.replace('https://', '');
      messageAnchor.onclick = (e) => hidePopupsWithCallback(() => appImManager.openUrl(link), e);
    }

    const makeTablePeer = (peerId: PeerId) => TablePeer({
      peerId,
      onClick: () => {
        hidePopupsWithCallback(() => {
          appImManager.setInnerPeer({
            peerId,
            stack: this.message ? {
              peerId: this.message.peerId,
              mid: this.message.mid
            } : undefined
          });
        });
      }
    });

    const tablePeer = (this.isReceipt || this.subscription) && makeTablePeer(this.peerId);

    const transactionIdSpan = transactionId && (<span onClick={onTransactionClick}>{wrapRichText(transactionId, {entities: [{_: 'messageEntityCode', length: transactionId.length, offset: 0}]})}</span>);

    let tableContent: Parameters<typeof Table>[0]['content'];
    if(this.subscription) {
      tableContent = [
        ['Stars.Subscription', tablePeer],
        ['Stars.Subscription.Subscribed', formatFullSentTime(this.subscription.until_date - this.subscription.pricing.period)],
        ['Stars.Subscription.Renews', formatFullSentTime(this.subscription.until_date)]
      ];
    } else if(this.transaction?.giveaway_post_id) {
      messageAnchor.replaceChildren(i18n('BoostingGiveaway'));
      tableContent = [
        ['BoostingFrom', tablePeer],
        this.transaction.id && ['BoostingTo', makeTablePeer(rootScope.myId)],
        [this.transaction.id ? 'BoostingGift' : 'Giveaway.Prize', i18n('Stars', [formatStarsAmount(this.transaction.amount)])],
        ['BoostingReason', messageAnchor],
        this.transaction.id && ['StarsTransactionID', transactionIdSpan],
        ['StarsTransactionDate',  formatFullSentTime((this.form as PaymentsPaymentReceipt.paymentsPaymentReceiptStars).date, undefined, true)]
      ];
    } else if(this.transaction && this.transaction.pFlags.gift) {
      tableContent = [
        [this.isOutGift ? 'BoostingTo' : 'BoostingFrom', tablePeer],
        ['StarsTransactionDate',  formatFullSentTime((this.form as PaymentsPaymentReceipt.paymentsPaymentReceiptStars).date, undefined, true)]
      ];
    } else if(this.isReceipt) {
      const realAmount = this.transaction?.paid_messages &&
        !this.transaction.pFlags.refund &&
        this.transaction.starref_amount &&
        this.transaction.amount &&
        +amount > 0 &&
        (formatStarsAmount(this.transaction.starref_amount) + formatStarsAmount(this.transaction.amount));

      tableContent = [
        this.peerId ? [
          this.transaction?.subscription_period ? 'Stars.Subscription' : 'BoostingTo',
          tablePeer
        ] : ['Stars.Via', _title],
        realAmount && ['PaidMessages.FullPrice', <StarsChange reverse noSign inline stars={realAmount} />],
        this.transaction && (this.transaction.extended_media || this.transaction.pFlags.reaction) && messageAnchor && [this.transaction.pFlags.reaction ? 'Message' : 'StarsTransactionMedia', messageAnchor],
        ['StarsTransactionID', transactionIdSpan],
        ['StarsTransactionDate', formatFullSentTime((this.form as PaymentsPaymentReceipt.paymentsPaymentReceiptStars).date, undefined, true)]
      ];
    }

    return (
      <div class="popup-stars-pay-padding">
        {image}
        <div class="popup-stars-pay-images">
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
                return {element: null as HTMLElement, mid: 0, peerId: 0, index, message};
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
        {tableContent && !this.subscription && !noStarsChange && <StarsChange stars={!this.transaction ? -+amount : amount} isRefund={!!this.transaction?.pFlags?.refund} noSign={this.isOutGift} />}
        {subtitle && <div class={classNames('popup-stars-subtitle', tableContent && !this.subscription && !this.boost && 'mt')}>{subtitle}</div>}
        {tableContent && (
          <>
            <Table class="popup-stars-pay-table" content={tableContent.filter(Boolean)} />
            <div class="popup-stars-pay-tos">{i18n('Stars.TransactionTOS')}</div>
            {this.subscription && (
              <div class={classNames('popup-stars-pay-tos', 'popup-stars-pay-tos2', this.subscription.pFlags.canceled && 'danger')}>{
                i18n(
                  this.subscription.pFlags.canceled ?
                    'Stars.Subscription.Cancelled' :
                    'Stars.Subscription.Active',
                  [formatFullSentTime(this.subscription.until_date)]
                )
              }</div>
            )}
          </>
        )}
      </div>
    );
  }

  private async construct() {
    if(this.chatInvite || this.paymentForm?._ === 'payments.paymentFormStarGift') {
      this.peerId = NULL_PEER_ID;
    } else if(this.paymentForm) {
      this.peerId = this.paymentForm.bot_id.toPeerId(false);
    } else if(this.subscription) {
      this.peerId = getPeerId(this.subscription.peer);
    } else if(this.transaction.peer._ === 'starsTransactionPeer') {
      this.peerId = getPeerId(this.transaction.peer.peer);
    }

    const [image, {title, media}, link] = await Promise.all([
      (async() => {
        const img = document.createElement('img');
        img.classList.add('popup-stars-image');
        await renderImageFromUrlPromise(img, `assets/img/${maybe2x(this.boost ? 'stars' : 'stars_pay')}.png`);
        return img;
      })(),
      (async() => {
        const result = await getStarsTransactionTitleAndMedia({
          transaction: this.transaction,
          middleware: this.middlewareHelper.get(),
          size: 90,
          paidMedia: this.paidMedia,
          paidMediaPeerId: this.message ? this.message.fwdFromId || this.message.fromId : this.peerId,
          chatInvite: this.chatInvite,
          subscription: this.subscription,
          photo: this.form._ === 'payments.paymentFormStarGift' ? undefined : this.form?.photo as WebDocument.webDocument
        });

        if(this.boost) {
          result.media = undefined;
          // const img = document.createElement('img');
          // await renderImageFromUrlPromise(img, `assets/img/${maybe2x('stars')}.png`);
          // result.media = img;
          // img.classList.add('popup-stars-pay-star');
        } else if(this.transaction && (this.transaction.pFlags.gift || this.transaction.giveaway_post_id)) {
          const size = 128;
          result.media = await wrapLocalSticker({
            width: size,
            height: size,
            assetName: 'Gift3',
            middleware: this.middlewareHelper.get(),
            loop: false,
            autoplay: liteMode.isAvailable('stickers_chat')
          }).then(async({container, promise}) => {
            container.classList.add('popup-stars-pay-sticker');
            await promise;
            return container as HTMLDivElement;
          });
        } else {
          result.media.classList.add('popup-stars-pay-item');
        }

        return result;
      })(),
      (async() => {
        if(
          (!this.transaction || (!this.transaction.extended_media && !this.transaction.pFlags.reaction && !this.transaction.giveaway_post_id)) ||
          !this.peerId ||
          this.peerId.isUser()
        ) {
          return;
        }

        const channelId = this.peerId.toChatId()
        const serverMsgId = getServerMessageId(this.transaction.msg_id || this.transaction.giveaway_post_id)
        return `https://t.me/c/${channelId}/${serverMsgId}`;
      })()
    ]);
    this.body.classList.toggle('is-receipt', this.isReceipt);
    this.appendSolid(() => this._construct(image, title, media, link));
    if(this.noShowIfStars) {
      this.onConfirm();
    } else {
      this.show();
    }
  }
}
