import PopupElement, {createPopup} from '@components/popups/indexTsx';
import PopupElementOld from '@components/popups';
import Scrollable from '@components/scrollable2';
import {copyTextToClipboard} from '@helpers/clipboard';
import {formatFullSentTime} from '@helpers/date';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import maybe2x from '@helpers/maybe2x';
import getGiftAssetName from '@helpers/getGiftAssetName';
import {InputInvoice, MessageMedia, PaymentsPaymentForm, PaymentsPaymentReceipt, StarsTransaction, Message, Photo, Document, Chat, WebDocument} from '@layer';
import appImManager from '@lib/appImManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {i18n, LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {putPreloader} from '@components/putPreloader';
import Table, {TablePeer} from '@components/table';
import {toastNew} from '@components/toast';
import type PopupPayment from '@components/popups/payment';
import type {PopupPaymentResult} from '@components/popups/payment';
import PopupStars, {getStarsTransactionTitleAndMedia, StarsAmount, StarsBalance, StarsChange} from '@components/popups/stars';
import {createSignal, JSX} from 'solid-js';
import partition from '@helpers/array/partition';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import cancelEvent from '@helpers/dom/cancelEvent';
import AppMediaViewer from '@components/mediaViewer';
import {NULL_PEER_ID, TON_CURRENCY} from '@appManagers/constants';
import tsNow from '@helpers/tsNow';
import classNames from '@helpers/string/classNames';
import {useChat, useUser} from '@stores/peers';
import {getStarsSubscriptionPresentation} from '@appManagers/utils/payments/starsSubscription';
import {wrapCallDuration as wrapDuration} from '@components/wrappers/wrapDuration';
import wrapLocalSticker from '@components/wrappers/localSticker';
import liteMode from '@helpers/liteMode';
import rootScope from '@lib/rootScope';
import {IconTsx} from '@components/iconTsx';
import formatStarsAmount, {formatStarsAmountExact} from '@appManagers/utils/payments/formatStarsAmount';
import {getStarsTransactionPresentation, getStarsTransactionMessagePeerId, getStarsTransactionFullAmount, starsTransactionProviders} from '@appManagers/utils/payments/starsTransaction';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import anchorCallback from '@helpers/dom/anchorCallback';
import DEBUG from '@config/debug';
import makeError from '@helpers/makeError';
import bigInt from 'big-integer';
import {formatNanoton} from '@helpers/paymentsWrapCurrencyAmount';
import EventListenerBase from '@helpers/eventListenerBase';
import {getMiddleware} from '@helpers/middleware';

const TEST_FIRST_TIME = DEBUG && false;

export type StarsPayOptions = ConstructorParameters<typeof PopupPayment>[0];

type StarsPaymentForm =
  | PaymentsPaymentForm.paymentsPaymentFormStars
  | PaymentsPaymentReceipt.paymentsPaymentReceiptStars
  | PaymentsPaymentForm.paymentsPaymentFormStarGift;

/** What the caller gets back: the same `finish` event the class popup dispatched. */
export type StarsPayHandle = EventListenerBase<{
  finish: (result: PopupPaymentResult) => void
}>;

export default function showStarsPayPopup(options: StarsPayOptions): StarsPayHandle {
  const emitter: StarsPayHandle = new EventListenerBase();
  const managers = rootScope.managers;
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();

  const {
    inputInvoice, paidMedia, message, transaction, ledgerPeerId,
    chatInvite, subscription, boost, noShowIfStars, purpose
  } = options;

  let paymentForm = options.paymentForm as StarsPaymentForm;
  const isReceipt = !!transaction || paymentForm?._ === 'payments.paymentReceiptStars';
  const isOutGift = !!transaction?.pFlags.gift && getStarsTransactionPresentation(transaction).outgoing;
  const form = paymentForm || transaction;

  let peerId: PeerId;
  if(chatInvite || paymentForm?._ === 'payments.paymentFormStarGift') {
    peerId = NULL_PEER_ID;
  } else if(paymentForm) {
    peerId = paymentForm.bot_id.toPeerId(false);
  } else if(subscription) {
    peerId = getPeerId(subscription.peer);
  } else if(transaction.peer._ === 'starsTransactionPeer') {
    peerId = getPeerId(transaction.peer.peer);
  }

  const isTon = transaction?.amount._ === 'starsTonAmount' || paymentForm?.invoice.currency === TON_CURRENCY;

  let result: PopupPaymentResult = 'cancelled';
  let finished = false;
  let popupOpened = false;
  const deferredCloseCallbacks: (() => void)[] = [];

  const [show, setShow] = createSignal(true);
  const [paying, setPaying] = createSignal(false);
  const [fulfilling, setFulfilling] = createSignal(false);

  const emitFinish = () => {
    if(finished) return;
    finished = true;
    emitter.dispatchEvent('finish', result);
  };

  const drainDeferred = () => deferredCloseCallbacks.splice(0).forEach((callback) => callback());

  /** The popup only exists once its content has loaded — before that, finishing is all there is to do. */
  const closePopup = () => {
    if(popupOpened) {
      setShow(false);
      return;
    }

    middlewareHelper.destroy();
    emitFinish();
    drainDeferred();
  };

  const hidePopupsWithCallback = (callback: () => void, e?: Event) => {
    cancelEvent(e);
    deferredCloseCallbacks.push(callback);
    closePopup();
    const starsPopups = PopupElementOld.getPopups(PopupStars);
    starsPopups?.[0]?.hide();
  };

  const reloadForm = async() => {
    if(!paymentForm) {
      return;
    }

    paymentForm = await managers.appPaymentsManager.getPaymentForm(inputInvoice) as PaymentsPaymentForm.paymentsPaymentFormStars;
  };

  let test = TEST_FIRST_TIME;
  const onConfirm = async() => {
    if(isReceipt || subscription?.pFlags.bot_canceled || (!paymentForm && !chatInvite && !subscription)) {
      closePopup();
      return;
    }

    const itemPrice = paymentForm ? +paymentForm.invoice.prices[0].amount : (chatInvite ? +chatInvite.subscription_pricing.amount : +subscription.pricing.amount);

    setPaying(true);
    result = 'pending';

    let promise: Promise<any>;
    if(test) {
      test = false;
      promise = Promise.reject(makeError('BALANCE_TOO_LOW'));
    } else if(subscription) {
      promise = managers.appPaymentsManager.changeStarsSubscription(
        subscription.id,
        !subscription.pFlags.canceled
      );
    } else {
      const balance = await managers.appPaymentsManager[isTon ? 'getStarsStatusTon' : 'getStarsStatus']();
      if(bigInt(balance.balance.amount as number).lt(itemPrice)) {
        promise = Promise.reject(makeError('BALANCE_TOO_LOW'));
      } else {
        promise = managers.appPaymentsManager.sendStarsForm(
          inputInvoice,
          (paymentForm as PaymentsPaymentForm.paymentsPaymentFormStars)?.form_id || chatInvite.subscription_form_id
        );
      }
    }

    try {
      await promise;
      result = 'paid';
      closePopup();
    } catch(err) {
      let shouldRetry = false;
      if((err as ApiError).type === 'BALANCE_TOO_LOW') {
        PopupElementOld.createPopup(PopupStars, {
          itemPrice,
          paymentForm: paymentForm as PaymentsPaymentForm.paymentsPaymentFormStars,
          ton: isTon,
          onTopup: async() => {
            await reloadForm();
            onConfirm();
          },
          onCancel: () => {
            result = 'cancelled';
            closePopup();
          },
          purpose,
          spendPurposePeerId: peerId
        });
      } else if((err as ApiError).type === 'FORM_EXPIRED') {
        await reloadForm();
        shouldRetry = true;
      } else {
        result = 'failed';
      }

      setPaying(false);

      if(shouldRetry) {
        onConfirm();
      }
    }
  };

  const construct = async() => {
    const [image, {title: transactionTitle, media: avatar}, link] = await Promise.all([
      (async() => {
        const img = document.createElement('img');
        img.classList.add('popup-stars-image');
        await renderImageFromUrlPromise(img, `assets/img/${maybe2x(boost ? 'stars' : 'stars_pay')}.png`);
        return img;
      })(),
      (async() => {
        const result = await getStarsTransactionTitleAndMedia({
          transaction,
          middleware,
          size: 90,
          paidMedia,
          paidMediaPeerId: message ? message.fwdFromId || message.fromId : peerId,
          chatInvite,
          subscription,
          photo: form?._ === 'payments.paymentFormStarGift' ? undefined : form?.photo as WebDocument.webDocument
        });

        if(boost) {
          result.media = undefined;
        } else if(transaction && (transaction.pFlags.gift || transaction.giveaway_post_id || transaction.premium_gift_months)) {
          const size = 128;
          result.media = await wrapLocalSticker({
            width: size,
            height: size,
            assetName: transaction.premium_gift_months ? getGiftAssetName(transaction.premium_gift_months * 30) : transaction.amount._ === 'starsTonAmount' ? 'Diamond' : 'Gift3',
            middleware,
            loop: false,
            autoplay: liteMode.isAvailable('stickers_chat')
          }).then(({container, promise}) => {
            container.classList.add('popup-stars-pay-sticker');
            container.style.width = container.style.height = size + 'px';
            // A decorative first frame must not delay opening a receipt (the container is still detached).
            void promise.catch(() => {
              if(middleware()) container.replaceChildren(IconTsx({icon: transaction.amount._ === 'starsTonAmount' ? 'ton' : 'gift'}) as HTMLElement);
            });
            return container as HTMLDivElement;
          });
        } else {
          result.media.classList.add('popup-stars-pay-item');
        }

        return result;
      })(),
      (async() => {
        if(!transaction) return;
        const peerId = getStarsTransactionMessagePeerId(transaction, ledgerPeerId || rootScope.myId, rootScope.myId);
        const mid = transaction.giveaway_post_id || transaction.msg_id;
        if(!peerId || !mid) return;
        const serverMsgId = getServerMessageId(mid);
        return peerId.isUser() ? undefined : `https://t.me/c/${peerId.toChatId()}/${serverMsgId}`;
      })()
    ]);

    if(noShowIfStars) {
      onConfirm();
      return;
    }

    popupOpened = true;
    createPopup(() => {
      const _title = transactionTitle;

      // `useUser` / `useChat` are store subscriptions — they belong to this root, and reading them
      // once here keeps the footer and the table on the same snapshot
      const subscriptionUser = subscription && peerId.isUser() && useUser(peerId.toUserId());
      const subscriptionPresentation = subscription && getStarsSubscriptionPresentation(
        subscription,
        tsNow(true),
        subscriptionUser && subscriptionUser._ === 'user' && !subscriptionUser.pFlags.bot
      );

      /** The price the popup talks about — from the form, the invite, the subscription or the transaction. */
      let amount: Long;
      if(paymentForm) {
        const labeledPrice = paymentForm.invoice.prices[0];
        amount = isTon ? formatNanoton(labeledPrice.amount, 9, false) : labeledPrice.amount;
      } else if(chatInvite) {
        amount = chatInvite.subscription_pricing.amount;
      } else if(subscription) {
        amount = subscription.pricing.amount;
      } else {
        amount = formatStarsAmountExact(transaction.amount);
      }

      const Footer = () => {
        let confirmText: JSX.Element, confirmColor: 'danger', confirmIcon: Icon;
        let caption: JSX.Element, fulfillKey: LangPackKey;

        if(isReceipt) {
          confirmText = i18n('OK');
        } else if(chatInvite) {
          confirmText = i18n('Stars.Subscribe.Button');
          caption = <div class="popup-footer-caption">{i18n('Stars.Subscribe.Terms')}</div>;
        } else if(subscription) {
          if(subscription.pFlags.bot_canceled) {
            confirmText = i18n('OK');
          } else if(subscription.pFlags.canceled) {
            confirmText = i18n('Stars.Subscription.Renew');
          } else {
            confirmText = i18n('Stars.Subscription.Cancel');
            confirmColor = 'danger';
          }

          if(subscriptionPresentation.canRefulfill || (!subscription.pFlags.bot_canceled && !peerId.isUser() && !subscriptionPresentation.expired)) {
            const chat = !peerId.isUser() && useChat(peerId.toChatId());
            if(subscriptionPresentation.canRefulfill || (chat as Chat.channel)?.pFlags?.left) {
              fulfillKey = peerId.isUser() ? 'Stars.Subscription.Restore' : 'Stars.Subscription.Fulfill';
            }
          }
        } else {
          confirmText = i18n('Stars.ConfirmPurchaseButton', [amount]);
          confirmIcon = isTon ? 'ton' : 'star';
        }

        const onFulfill = async() => {
          setFulfilling(true);
          try {
            await managers.appPaymentsManager.fulfillStarsSubscription(subscription.id);
            hidePopupsWithCallback(() => {
              appImManager.setInnerPeer({peerId});
            });
          } catch(err) {
            console.error('fulfill error', err);
            setFulfilling(false);
          }
        };

        return (
          <PopupElement.Footer>
            <PopupElement.FooterButton
              color={confirmColor}
              iconRight={confirmIcon}
              disabled={paying() || fulfilling()}
              callback={() => {
                onConfirm();
                return false; // * `onConfirm` decides when (and whether) the popup closes
              }}
            >
              {confirmText}
              {paying() && putPreloader(undefined, true)}
            </PopupElement.FooterButton>
            {caption}
            {fulfillKey && (
              <PopupElement.FooterButton
                disabled={paying() || fulfilling()}
                callback={() => {
                  onFulfill();
                  return false;
                }}
              >
                {i18n(fulfillKey)}
              </PopupElement.FooterButton>
            )}
          </PopupElement.Footer>
        );
      };

      const Content = () => {
        const presentation = transaction && getStarsTransactionPresentation(transaction);

        let noStarsChange = false;
        let title: JSX.Element, subtitle: JSX.Element;
        if(transaction && !boost) {
          title = presentation.kind === 'payment' && transaction.title ? wrapEmojiText(transaction.title) : i18n(presentation.titleKey, presentation.titleArgs);
          subtitle = (transaction.description || (presentation.kind === 'subscription' && transaction.title)) && wrapEmojiText(transaction.description || transaction.title);
          if(['messages', 'live'].includes(presentation.kind) && presentation.incoming && !transaction.pFlags.refund) {
            const commission = transaction.starref_commission_permille;
            subtitle = commission === undefined ? undefined : i18n('PaidMessages.YouReceiveWithCommissionNotice', [(1000 - commission) / 10]);
          }
        } else if(paidMedia) {
          const [photos, videos] = partition(paidMedia.extended_media, (extendedMedia) => {
            if(extendedMedia._ === 'messageExtendedMedia') {
              return extendedMedia.media._ !== 'messageMediaDocument';
            } else {
              return extendedMedia.video_duration === undefined;
            }
          });

          const multiplePhotosLang = i18n('Stars.Unlock.Photos', [photos.length]);
          const multipleVideosLang = i18n('Stars.Unlock.Videos', [videos.length]);

          title = i18n('StarsConfirmPurchaseTitle');
          subtitle = i18n(peerId.isUser() ? 'Stars.Unlock.FromBot' : 'Stars.Unlock', [
            photos.length && videos.length ?
              i18n('Stars.Unlock.Media', [multiplePhotosLang, multipleVideosLang]) :
              (photos.length || videos.length) === 1 ? i18n(photos.length ? 'Stars.Unlock.Photo' : 'Stars.Unlock.Video') : (photos.length ? multiplePhotosLang : multipleVideosLang),
            _title,
            i18n('Stars.Unlock.Stars', [amount])
          ]);
        } else if(transaction?.giveaway_post_id) {
          title = i18n(!transaction.id ? 'Stars' : 'StarsGiveawayPrizeReceived', [formatStarsAmount(transaction.amount)]);
          if(!transaction.id) {
            subtitle = (
              <span class="popup-stars-pay-boosts">
                <IconTsx icon="boost_filled" />
                {i18n('BoostingBoostsCountTitle', [boost.multiplier || 1])}
              </span>
            );
            noStarsChange = true;
          }
        } else if(form?._ === 'payments.paymentFormStarGift') {
          title = i18n('StarsConfirmPurchaseTitle');
          subtitle = i18n(inputInvoice._ === 'inputInvoiceStarGiftTransfer' ? (isTon ? 'Stars.Transaction.ConfirmGramTransfer' : 'StarGiftConfirmTransferText') : (isTon ? 'Stars.Transaction.ConfirmGramPurchase' : 'StarGiftConfirmPurchaseText'), [amount]);
        } else if(inputInvoice?._ === 'inputInvoiceStarGiftDropOriginalDetails') {
          title = i18n('StarGiftDropOriginalDetailsTitle');
          subtitle = i18n('StarGiftDropOriginalDetailsText');
        } else if(chatInvite) {
          title = i18n('Stars.Subscribe.Title');
          if(_title instanceof HTMLElement) _title.style.display = 'inline';
          subtitle = i18n('Stars.Subscribe.Description', [_title, i18n('Stars.Unlock.Stars', [amount])]);
        } else if(subscription) {
          title = subscription.title ? wrapEmojiText(subscription.title) : i18n('Stars.Subscription');
          subtitle = subscription.pricing.period === 2592000 ?
            i18n('Stars.Subscription.Fee', [StarsAmount({stars: amount}) as HTMLElement]) :
            i18n('Stars.Subscription.FeeForPeriod', [StarsAmount({stars: amount}) as HTMLElement, wrapDuration(subscription.pricing.period)]);
          (subtitle as HTMLElement).classList.add('secondary');
        } else {
          title = isReceipt ? wrapEmojiText(form.title) : i18n('StarsConfirmPurchaseTitle');
          subtitle = isReceipt ?
            wrapEmojiText(form.description) :
            i18n('StarsConfirmPurchaseText', [amount, wrapEmojiText((paymentForm as PaymentsPaymentForm.paymentsPaymentFormStars).title), _title]);
        }

        const transactionId = transaction?.id ?? (paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceiptStars)?.transaction_id;
        const onTransactionClick = () => {
          copyTextToClipboard(transactionId);
          toastNew({langPackKey: 'StarsTransactionIDCopied'});
        };

        const messagePeerId = transaction && getStarsTransactionMessagePeerId(transaction, ledgerPeerId || rootScope.myId, rootScope.myId);
        const messageMid = transaction && (transaction.giveaway_post_id || transaction.msg_id);
        const messageAnchor = messagePeerId && messageMid && anchorCallback((e) => {
          hidePopupsWithCallback(() => appImManager.setInnerPeer({peerId: messagePeerId, lastMsgId: messageMid}), e);
        });
        if(messageAnchor) messageAnchor.append(link || i18n('Message'));

        const makeTablePeer = (tablePeerId: PeerId) => TablePeer({
          peerId: tablePeerId,
          onClick: () => {
            hidePopupsWithCallback(() => {
              appImManager.setInnerPeer({
                peerId: tablePeerId,
                stack: message ? {
                  peerId: message.peerId,
                  mid: message.mid
                } : undefined
              });
            });
          }
        });

        const tablePeer = (isReceipt || subscription) && peerId && makeTablePeer(peerId);

        const transactionIdSpan = transactionId && (<span onClick={onTransactionClick}>{wrapRichText(transactionId, {entities: [{_: 'messageEntityCode', length: transactionId.length, offset: 0}]})}</span>);

        let tableContent: Parameters<typeof Table>[0]['content'];
        if(subscription) {
          tableContent = [
            ['Stars.Subscription', tablePeer],
            ['Stars.Subscription.Subscribed', formatFullSentTime(subscription.until_date - subscription.pricing.period)],
            [subscriptionPresentation.dateLabelKey, formatFullSentTime(subscription.until_date)],
            subscriptionPresentation.statusKey && ['StarGiftStatus', i18n(subscriptionPresentation.statusKey)]
          ];
        } else if(transaction && !boost) {
          const ownerId = ledgerPeerId || rootScope.myId;
          const amountElement = (value: StarsTransaction['amount']) => <StarsChange reverse noSign inline stars={formatStarsAmountExact(value)} ton={value._ === 'starsTonAmount'} />;
          const provider = starsTransactionProviders[transaction.peer._];
          const hasAffiliate = transaction.starref_peer && !['messages', 'live', 'resale', 'offer'].includes(presentation.kind);
          let peerLabel: LangPackKey = presentation.incoming ? 'BoostingFrom' : 'BoostingTo';
          if(presentation.kind === 'affiliate') peerLabel = 'Stars.Transaction.MiniApp';
          else if(hasAffiliate) peerLabel = 'Stars.Transaction.Referred';
          else if(presentation.kind === 'resale') peerLabel = presentation.outgoing ? 'Stars.Transaction.BoughtFrom' : 'Stars.Transaction.SoldTo';
          tableContent = [
            peerId ? [peerLabel, tablePeer] : presentation.anonymousGift ? ['BoostingFrom', i18n('Stars.Transaction.UnknownPeer')] : ['Stars.Via', i18n(provider || 'Stars.Transaction.Unsupported')],
            transaction.giveaway_post_id && ['BoostingTo', makeTablePeer(ownerId)],
            transaction.giveaway_post_id && ['BoostingGift', amountElement(transaction.amount)],
            messageAnchor && [transaction.giveaway_post_id ? 'BoostingReason' : transaction.extended_media?.length ? 'StarsTransactionMedia' : 'Message', messageAnchor]
          ];
          if(presentation.kind === 'affiliate' || hasAffiliate) {
            tableContent.push(['BoostingReason', i18n('Stars.Transaction.AffiliateProgram')]);
          }
          const gift = transaction.stargift;
          if(gift) {
            const giftTitle = gift._ === 'starGiftUnique' ? `${gift.title} #${gift.num}` : gift.title || i18n('StarGiftTitle');
            const giftAnchor = gift._ === 'starGiftUnique' && anchorCallback(() => {
              hidePopupsWithCallback(() => appImManager.openUrl(`https://t.me/nft/${gift.slug}`));
            });
            if(giftAnchor) giftAnchor.append(giftTitle);
            tableContent.push(['StarGiftTitle', giftAnchor || giftTitle]);
            if(gift._ === 'starGiftUnique') {
              for(const attribute of gift.attributes) {
                const key = attribute._ === 'starGiftAttributeModel' ? 'StarGiftModel' : attribute._ === 'starGiftAttributeBackdrop' ? 'StarGiftBackdrop' : attribute._ === 'starGiftAttributePattern' ? 'StarGiftPattern' : undefined;
                if(key && 'name' in attribute) tableContent.push([key, wrapEmojiText(attribute.name)]);
              }
              tableContent.push(['StarGiftAvailability', i18n('StarGiftAvailabilityIssued', [gift.availability_issued, gift.availability_total])]);
            } else if(gift.availability_total !== undefined) {
              tableContent.push(['StarGiftAvailability', i18n('StarGiftAvailabilityValue2', [gift.availability_remains || 0, gift.availability_total])]);
            }
          }
          if(hasAffiliate) {
            tableContent.push(['Stars.Transaction.Referrer', makeTablePeer(getPeerId(transaction.starref_peer))]);
          }
          if(transaction.starref_amount) {
            tableContent.push(['Stars.Transaction.CommissionAmount', amountElement(transaction.starref_amount)]);
          }
          const fullAmount = getStarsTransactionFullAmount(transaction);
          if(fullAmount) tableContent.push(['PaidMessages.FullPrice', amountElement(fullAmount)]);

          if(transaction.starref_commission_permille !== undefined) {
            tableContent.push(['Stars.Transaction.CommissionLabel', `${transaction.starref_commission_permille / 10}%`]);
          }
          if(transaction.subscription_period) {
            tableContent.push(['Stars.Transaction.Period', i18n('Stars.Transaction.PeriodSeconds', [transaction.subscription_period])]);
          }
          if(transaction.premium_gift_months) {
            tableContent.push(['Stars.Transaction.Duration', i18n('Stars.Transaction.Months', [transaction.premium_gift_months])]);
          }
          if(transaction.floodskip_number !== undefined || transaction.paid_messages !== undefined) {
            tableContent.push(['Stars.Transaction.Messages', String(transaction.floodskip_number ?? transaction.paid_messages)]);
          }
          if(transaction.ads_proceeds_from_date !== undefined && transaction.ads_proceeds_to_date !== undefined) {
            tableContent.push(['Stars.Transaction.RevenuePeriod', <>{formatFullSentTime(transaction.ads_proceeds_from_date)}{' — '}{formatFullSentTime(transaction.ads_proceeds_to_date)}</>]);
          }
          tableContent.push(transactionIdSpan && ['StarsTransactionID', transactionIdSpan], ['StarsTransactionDate', formatFullSentTime(transaction.date, undefined, true)]);
          if(presentation.statusKey) tableContent.push(['StarGiftStatus', i18n(presentation.statusKey)]);
          if(!transaction.pFlags.pending && !transaction.pFlags.failed) {
            if(transaction.transaction_date) tableContent.push(['Stars.Transaction.Completed', formatFullSentTime(transaction.transaction_date, undefined, true)]);
            if(transaction.transaction_url && /^https?:\/\//i.test(transaction.transaction_url)) {
              const anchor = anchorCallback(() => safeWindowOpen(transaction.transaction_url));
              anchor.append(i18n('Stars.Transaction.View'));
              tableContent.push(['Stars.Transaction.Blockchain', anchor]);
            }
          }
        } else if(transaction?.giveaway_post_id) {
          messageAnchor?.replaceChildren(i18n('BoostingGiveaway'));
          tableContent = [
            ['BoostingFrom', tablePeer],
            transaction.id && ['BoostingTo', makeTablePeer(rootScope.myId)],
            [transaction.id ? 'BoostingGift' : 'Giveaway.Prize', i18n('Stars', [formatStarsAmount(transaction.amount)])],
            ['BoostingReason', messageAnchor],
            transaction.id && ['StarsTransactionID', transactionIdSpan],
            ['StarsTransactionDate', formatFullSentTime((form as PaymentsPaymentReceipt.paymentsPaymentReceiptStars).date, undefined, true)]
          ];
        } else if(isReceipt) {
          tableContent = [
            peerId ? [
              transaction?.subscription_period ? 'Stars.Subscription' : 'BoostingTo',
              tablePeer
            ] : ['Stars.Via', _title],
            ['StarsTransactionID', transactionIdSpan],
            ['StarsTransactionDate', formatFullSentTime((form as PaymentsPaymentReceipt.paymentsPaymentReceiptStars).date, undefined, true)]
          ];
        }

        return (
          <div class="popup-stars-pay-padding">
            {image}
            <div class="popup-stars-pay-images">
              <div
                class="popup-stars-pay-avatar"
                onClick={async() => {
                  if(!isReceipt || !transaction?.extended_media?.length) {
                    return;
                  }

                  const extendedMedia = transaction.extended_media;
                  const media = extendedMedia.map((messageMedia) => {
                    return (messageMedia as MessageMedia.messageMediaPhoto).photo as Photo.photo ||
                      (messageMedia as MessageMedia.messageMediaDocument).document as Document.document;
                  });

                  const standaloneMessage = await managers.appMessagesManager.generateStandaloneOutgoingMessage(messagePeerId || peerId);
                  standaloneMessage.media = {
                    _: 'messageMediaPaidMedia',
                    extended_media: extendedMedia.map((messageMedia) => {
                      return {_: 'messageExtendedMedia', media: messageMedia};
                    }),
                    stars_amount: 0
                  };
                  standaloneMessage.id = getServerMessageId(transaction.msg_id);
                  standaloneMessage.mid = transaction.msg_id;

                  const targets: AppMediaViewer['target'][] = media.map((media, index) => {
                    return {element: null as HTMLElement, mid: 0, peerId: 0, index, message: standaloneMessage};
                  });

                  targets[0].element = avatar;

                  new AppMediaViewer(true)
                  .setSearchContext({peerId: 0, inputFilter: {_: 'inputMessagesFilterEmpty'}, useSearch: false})
                  .openMedia({
                    message: standaloneMessage,
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
            {tableContent && !subscription && !noStarsChange && (
              <StarsChange
                stars={!transaction ? (String(amount).startsWith('-') ? String(amount).slice(1) : '-' + amount) : amount}
                isRefund={!!transaction?.pFlags?.refund}
                noSign={isOutGift}
                ton={isTon}
              />
            )}
            {subtitle && <div class={classNames('popup-stars-subtitle', tableContent && !subscription && !boost && 'mt')}>{subtitle}</div>}
            {tableContent && (
              <>
                <Table class="popup-stars-pay-table" content={tableContent.filter(Boolean)} />
                <div class="popup-stars-pay-tos">{i18n(isTon ? 'Stars.Transaction.GramTOS' : 'Stars.TransactionTOS')}</div>
                {subscription && (
                  <div class={classNames('popup-stars-pay-tos', 'popup-stars-pay-tos2', subscriptionPresentation.statusKey && 'danger')}>{
                    i18n(
                      subscriptionPresentation.captionKey,
                      [formatFullSentTime(subscription.until_date)]
                    )
                  }</div>
                )}
              </>
            )}
          </div>
        );
      };

      return (
        <PopupElement
          class="popup-stars popup-stars-pay"
          closable
          old
          show={show()}
          onClose={emitFinish}
          onCloseAfterTimeout={() => {
            middlewareHelper.destroy();
            drainDeferred();
          }}
        >
          <PopupElement.Header>
            <PopupElement.CloseButton />
            {!isReceipt && (!subscription || tsNow(true) > subscription.until_date) && <StarsBalance ton={isTon} />}
          </PopupElement.Header>
          <PopupElement.Body class={isReceipt ? 'is-receipt' : undefined}>
            <Scrollable withBorders="both">
              <Content />
            </Scrollable>
          </PopupElement.Body>
          <Footer />
        </PopupElement>
      );
    });
  };

  construct();

  return emitter;
}
