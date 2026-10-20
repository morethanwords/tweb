/* @refresh reload */

import PopupElement, {createPopup} from '@components/popups/indexTsx';
import maybe2x from '@helpers/maybe2x';
import {InputInvoice, MessageMedia, PaymentsPaymentForm, Photo, Document, StarsTopupOption, StarsTransaction, StarsTransactionPeer, MessageExtendedMedia, ChatInvite, StarsSubscription, StarsGiftOption, InputStorePaymentPurpose, WebDocument} from '@layer';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import Section from '@components/section';
import {createMemo, createRoot, createSignal, For, JSX, Show} from 'solid-js';
import paymentsWrapCurrencyAmount, {formatNanoton} from '@helpers/paymentsWrapCurrencyAmount';
import {createPaymentPopup} from '@components/popups/payment';
import useStars, {prefetchStars} from '@stores/stars';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import {createLoadableList} from '@components/sidebarRight/tabs/statistics';
import Row from '@components/rowTsx';
import showSendGiftPicker from '@components/popups/sendGiftPicker';
import {formatFullSentTime} from '@helpers/date';
import {avatarNew} from '@components/avatarNew';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import Icon from '@components/icon';
import {Middleware} from '@helpers/middleware';
import generatePhotoForExtendedMediaPreview from '@appManagers/utils/photos/generatePhotoForExtendedMediaPreview';
import wrapMediaSpoiler from '@components/wrappers/mediaSpoiler';
import wrapPhoto from '@components/wrappers/photo';
import isWebDocument from '@appManagers/utils/webDocs/isWebDocument';
import {wrapChatInviteAvatar, wrapChatInviteTitle} from '@components/popups/joinChatInvite';
import MediaHeader from '@components/mediaHeader';
import tsNow from '@helpers/tsNow';
import {wrapCallDuration as wrapDuration} from '@components/wrappers/wrapDuration';
import {getStarsSubscriptionPresentation} from '@appManagers/utils/payments/starsSubscription';
import {useUser} from '@stores/peers';
import Button from '@components/buttonTsx';
import showPickUserPopup, {showContactPickerPopup} from '@components/popups/pickUser';
import anchorCallback from '@helpers/dom/anchorCallback';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import {MoreButton} from '@components/sidebarRight/tabs/statistics';
import {formatStarsAmountExact} from '@appManagers/utils/payments/formatStarsAmount';
import {getStarsTransactionPresentation, starsTransactionProviders} from '@appManagers/utils/payments/starsTransaction';
import wrapSticker from '@components/wrappers/sticker';
import wrapLocalSticker from '@components/wrappers/localSticker';
import bigInt from 'big-integer';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import Tabs from '@components/tabs';
import {GrowHeightReveal} from '@helpers/solid/animations';
import getStarsSpendPurposePeerId from '@helpers/getStarsSpendPurposePeerId';
import confirmationPopup from '@components/confirmationPopup';
import {getMiddleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';
import {ScrollableContextValue} from '@components/scrollable2';
import {onCleanup} from 'solid-js';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {StarsStackedStars, StarsBalance, StarsAmount, StarsChange} from '@components/stars/starsAmount';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export function getStarsTransactionTitle(transaction: StarsTransaction) {
  const presentation = getStarsTransactionPresentation(transaction);
  return i18n(presentation.titleKey, presentation.titleArgs);
}

export function getExamplesAnchor(hide: (callback: () => void) => void) {
  let loading = false;
  const popularAppBotsPromise = rootScope.managers.appAttachMenuBotsManager.getPopularAppBots();
  const anchor = anchorCallback(async() => {
    if(loading) return;
    loading = true;
    const {userIds: botIds} = await popularAppBotsPromise;
    loading = false;
    showPickUserPopup({
      onSelect: ([obj]) => {
        hide(() => {
          hotReloadGuard.appImManager.setInnerPeer(obj);
        });
      },
      peerType: ['custom'],
      getMoreCustom: async() => {
        return {
          result: botIds.map((botId) => botId.toPeerId(false)),
          isEnd: true
        };
      },
      titleLangKey: 'SearchAppsExamples'
    });
  });
  anchor.append(i18n('GiftStarsSubtitleLinkName'));
  return anchor;
}

const starsTransactionPeerIcons: Partial<Record<StarsTransactionPeer['_'], Icon>> = {
  starsTransactionPeerAppStore: 'apple_filled',
  starsTransactionPeerPlayMarket: 'android_filled',
  starsTransactionPeerPremiumBot: 'premium',
  starsTransactionPeerFragment: 'ton',
  starsTransactionPeerAds: 'ads',
  starsTransactionPeerAPI: 'bots',
  starsTransactionPeerUnsupported: 'info'
};

export async function getStarsTransactionTitleAndMedia({
  transaction,
  middleware,
  size,
  paidMedia,
  paidMediaPeerId,
  chatInvite,
  subscription,
  photo
}: {
  transaction: StarsTransaction,
  middleware: Middleware,
  size: number,
  paidMedia?: MessageMedia.messageMediaPaidMedia,
  paidMediaPeerId?: PeerId,
  chatInvite?: ChatInvite.chatInvite,
  subscription?: StarsSubscription,
  photo?: WebDocument.webDocument
}) {
  const managers = bindManagersToSession(rootScope.managers);
  const presentation = transaction && getStarsTransactionPresentation(transaction);
  const [title, media] = await Promise.all([
    (() => {
      if(subscription) {
        return wrapPeerTitle({peerId: getPeerId(subscription.peer)});
      }

      if(chatInvite) {
        return wrapChatInviteTitle(chatInvite, middleware);
      }

      if(paidMedia?.extended_media?.length || transaction?.extended_media?.length) {
        return wrapPeerTitle({peerId: paidMediaPeerId || getPeerId((transaction.peer as StarsTransactionPeer.starsTransactionPeer).peer)});
      }

      if(transaction?.stargift) {
        const gift = transaction.stargift;
        const title = gift._ === 'starGiftUnique' ? `${gift.title} #${gift.num}` : gift.title;
        if(title) return wrapEmojiText(title);
      }

      if(!transaction || transaction.peer._ === 'starsTransactionPeer') {
        return wrapPeerTitle({
          peerId: transaction ? getPeerId((transaction.peer as StarsTransactionPeer.starsTransactionPeer).peer) : paidMediaPeerId
        });
      }

      if(getStarsTransactionPresentation(transaction).anonymousGift) return i18n('Stars.Transaction.UnknownPeer');
      const provider = starsTransactionProviders[transaction.peer._];
      return i18n(provider || 'Stars.Transaction.Unsupported');
    })(),
    (async() => {
      const renderIcon = () => {
        const container = document.createElement('div');
        container.classList.add('popup-stars-transaction-media');
        const icon = presentation?.anonymousGift ? 'gift' : presentation?.kind === 'search' ? 'search' : presentation?.kind === 'api' ? 'bots' : presentation?.kind === 'adsProceeds' ? 'ads' : starsTransactionPeerIcons[transaction?.peer._] || presentation?.icon || 'star';
        container.append(Icon(icon));
        return container;
      };
      const _wrapPhoto = async(container: HTMLElement, photo: Parameters<typeof wrapPhoto>[0]['photo']) => {
        const loadPromises: Promise<any>[] = [];
        wrapPhoto({
          container,
          photo,
          boxWidth: size,
          boxHeight: size,
          middleware,
          loadPromises,
          withoutPreloader: true,
          size: isWebDocument(photo) ? {_: 'photoSizeEmpty', type: ''} : undefined
        });

        await Promise.all(loadPromises);
      };

      const itemPhoto = photo || subscription?.photo;
      if(itemPhoto) {
        const container = document.createElement('div');
        container.classList.add('popup-stars-transaction-media');
        container.style.width = container.style.height = size + 'px';
        await _wrapPhoto(container, itemPhoto);
        return container;
      }

      if(chatInvite) {
        const avatar = await wrapChatInviteAvatar(chatInvite, middleware, 90);
        return avatar.node;
      }

      if(paidMedia?.extended_media?.length || transaction?.extended_media?.length) {
        const array = paidMedia?.extended_media || transaction.extended_media;
        let media: Photo.photo | Document.document;

        if(paidMedia) {
          const extendedMedia = paidMedia.extended_media[0] as MessageExtendedMedia.messageExtendedMediaPreview;
          media = generatePhotoForExtendedMediaPreview(extendedMedia);
        } else {
          const extendedMedia = transaction.extended_media[0];
          media = (extendedMedia as MessageMedia.messageMediaPhoto).photo as Photo.photo ||
            (extendedMedia as MessageMedia.messageMediaDocument).document as Document.document;
        }

        if(!media) return renderIcon();
        const container = document.createElement('div');
        container.classList.add('popup-stars-transaction-media', 'is-paid-media');

        if(paidMedia) {
          const spoilerContainer = await wrapMediaSpoiler({
            media,
            animationGroup: 'chat',
            middleware,
            width: size,
            height: size
          });
          container.append(spoilerContainer);
        } else {
          await _wrapPhoto(container, media);
        }

        const length = array.length;
        if(length > 1) {
          const counter = document.createElement('span');
          counter.classList.add('popup-stars-transaction-media-counter');
          counter.textContent = '' + length;
          container.append(counter);
        }

        return container;
      }

      if(transaction?.stargift) {
        const container = document.createElement('div');
        container.classList.add('popup-stars-transaction-media');
        const gift = await managers.appGiftsManager.wrapGift(transaction.stargift);
        if(gift?.sticker) {
          await wrapSticker({doc: gift.sticker, div: container, width: size, height: size, middleware, play: false, loop: false});
        } else {
          container.append(Icon('gift'));
        }
        return container;
      }

      if(transaction?.photo) {
        const container = document.createElement('div');
        container.classList.add('popup-stars-transaction-media', 'is-paid-media');
        await _wrapPhoto(container, transaction?.photo);
        return container;
      }

      if(presentation && ['search', 'api', 'adsProceeds'].includes(presentation.kind)) return renderIcon();

      let peerId: PeerId;
      if(subscription) {
        peerId = getPeerId(subscription.peer);
      } else if(transaction && transaction.peer._ === 'starsTransactionPeer') {
        peerId = getPeerId(transaction.peer.peer);
      } else if(paidMediaPeerId) {
        peerId = paidMediaPeerId;
      }

      if(peerId) {
        const avatar = avatarNew({peerId, size, middleware});
        await avatar.readyThumbPromise;
        return avatar.node;
      }

      return renderIcon();
    })()
  ]);

  return {title, media};
}

/**
 * Picks who the stars are for, then opens the top-up for them — the row inside
 * this popup and `tg://settings/stars/gift` are the same thing.
 */
export function showGiftStarsPicker() {
  return showSendGiftPicker({
    titleLangKey: 'TelegramStarsGift',
    onSelect: ([{peerId}]) => {
      showStarsPopup({giftPeerId: peerId});
    }
  });
}

export async function renderStarsTransaction(transaction: StarsTransaction, middleware: Middleware, ledgerPeerId?: PeerId) {
  const {title, media} = await getStarsTransactionTitleAndMedia({
    transaction,
    middleware,
    size: 42
  });

  return createRoot((dispose) => {
    middleware.onDestroy(dispose);

    const presentation = getStarsTransactionPresentation(transaction);
    const operation = getStarsTransactionTitle(transaction);
    const useOperationTitle = ['media', 'search', 'api', 'adsProceeds', 'business'].includes(presentation.kind);
    const productTitle = ['payment', 'subscription'].includes(presentation.kind) && transaction.title;
    const _title = useOperationTitle ? operation : productTitle ? wrapEmojiText(productTitle) : title;
    const midtitle = useOperationTitle || productTitle ? title : operation;
    const subtitle = formatFullSentTime(transaction.date);
    const amount = formatStarsAmountExact(transaction.amount);
    const subtitleStatus = presentation.statusKey && i18n(presentation.statusKey);

    let container: HTMLDivElement;
    (
      <Row
        ref={container}
        class="popup-stars-transaction-row"
        noWrap
        role="button"
        tabIndex={0}
        style={{
          'grid-template-columns': amount.length > 14 ? '3.5rem minmax(0, 1fr)' : '3.5rem minmax(0, 1fr) auto',
          'grid-template-areas': amount.length > 14 ? '"left title" "left midtitle" "left subtitle" "right right"' : undefined
        }}
        clickable={() => {
          createPaymentPopup({
            transaction,
            ledgerPeerId
          });
        }}
      >
        <Row.Title><b>{_title}</b></Row.Title>
        <Row.Midtitle>{midtitle}</Row.Midtitle>
        <Row.Subtitle>{subtitleStatus ? [subtitle, ' — ', subtitleStatus] : subtitle}</Row.Subtitle>
        <Row.RightContent><StarsChange stars={amount} ton={transaction.amount._ === 'starsTonAmount'} /></Row.RightContent>
        <Row.Media size="abitbigger">{media}</Row.Media>
      </Row>
    );

    return container;
  });
}

export function StarsTransactionsList(props: {
  peerId?: PeerId,
  ton?: boolean,
  middleware: Middleware,
  setLoadMore: (callback: () => void) => void
}) {
  const [tab, setTab] = createSignal(0);
  const lists = [undefined, true, false].map((inbound) => {
    const [rows, setRows] = createSignal<HTMLElement[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal(false);
    const [ended, setEnded] = createSignal(false);
    let offset = '';
    const seen = new Set<string>();
    const key = (transaction: StarsTransaction) => `${transaction.id}:${!!transaction.pFlags.refund}:${getStarsTransactionPresentation(transaction).incoming}`;
    const load = async() => {
      if(loading() || ended()) return;
      setLoading(true);
      setError(false);
      try {
        const status = await rootScope.managers.appPaymentsManager.getStarsTransactions(offset, inbound, props.ton, props.peerId);
        if(!props.middleware()) return;
        const transactions = (status.history || []).filter((transaction) => !seen.has(key(transaction)));
        const rendered = await Promise.all(transactions.map((transaction) => renderStarsTransaction(transaction, props.middleware, props.peerId)));
        if(!props.middleware()) return;
        transactions.forEach((transaction) => seen.add(key(transaction)));
        setRows((rows) => [...rows, ...rendered]);
        setEnded(!status.next_offset || status.next_offset === offset);
        offset = status.next_offset;
      } catch(err) {
        if(props.middleware()) setError(true);
      } finally {
        if(props.middleware()) setLoading(false);
      }
    };
    return {rows, loading, error, ended, load};
  });
  void lists[0].load();
  props.setLoadMore(() => {
    const list = lists[tab()];
    if(!list.error()) void list.load();
  });
  return (
    <Tabs.Simple
      tab={tab}
      onChange={(index) => {
        setTab(index);
        if(!lists[index].rows().length) void lists[index].load();
      }}
      class="popup-stars-transactions"
      menu={[i18n('StarsTransactionsAll'), i18n('StarsTransactionsIncoming'), i18n('StarsTransactionsOutgoing')]}
      contentWrapper={(content) => (
        <Section class="popup-stars-transactions-section">{content}</Section>
      )}
      content={lists.map((list) => (
        <div>
          {list.rows()}
          <Show when={list.error()}><Button class="btn-primary btn-transparent" text="Stars.Transaction.Retry" onClick={() => void list.load()} /></Show>
          <Show when={list.ended() && !list.rows().length}><div class="popup-stars-empty text-center">{i18n('Stars.Transaction.Empty')}</div></Show>
          <Show when={!list.ended() && !list.error()}><Button class="btn-primary btn-transparent" text={list.loading() ? 'Loading' : 'ShowMoreOptions'} disabled={list.loading()} onClick={() => void list.load()} /></Show>
        </div>
      ))}
    />
  );
}

/** So `starsPay` can take away whichever Stars popup is open when it finishes. */
export const STARS_POPUP_KIND = Symbol('stars-popup');

export type PopupStarsOptions = {
  paymentForm?: PaymentsPaymentForm.paymentsPaymentFormStars,
  itemPrice?: Long,
  onTopup?: (amount: number) => void,
  onCancel?: () => void,
  purpose?: 'reaction' | 'stargift' | (string & {}),
  giftPeerId?: PeerId,
  peerId?: PeerId,
  ton?: boolean,
  historyPeerId?: PeerId,
  spendPurposePeerId?: PeerId
};

export default function showStarsPopup(options: PopupStarsOptions = {}) {
  // * the account session the popup is asked in: it opens only once what it shows is in, and not at all
  // * once the tab is on another account
  const managers = bindManagersToSession(rootScope.managers);
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();
  const listenerSetter = new ListenerSetter();
  const [show, setShow] = createSignal(false);
  const purposePeerId = getStarsSpendPurposePeerId(options.spendPurposePeerId);
  const handle = {hide: () => setShow(false)};

  let options$: (StarsTopupOption | StarsGiftOption)[];
  let appConfig$: MTAppConfig;
  let purchaseBlocked: boolean;
  let toppedUp: boolean;
  let content: JSX.Element;
  let scrollableRef: ScrollableContextValue;
  // the transactions list asks for more as the popup scrolls
  let onScrolledBottom: () => void;
  const setLoadMore = (load: () => void) => onScrolledBottom = load;

  const deferredCloseCallbacks: (() => void)[] = [];
  const hideWithCallback = (callback: () => void) => {
    deferredCloseCallbacks.push(callback);
    setShow(false);
  };

  const renderSubscription = async(subscription: StarsSubscription) => {
    const peerId = getPeerId(subscription.peer);
    const title = await wrapPeerTitle({peerId});
    title.classList.add('text-bold');
    const {media} = await getStarsTransactionTitleAndMedia({transaction: undefined, subscription, middleware, size: 42});
    const user = peerId.isUser() && useUser(peerId.toUserId());
    const business = user && user._ === 'user' && !user.pFlags.bot;
    const presentation = getStarsSubscriptionPresentation(subscription, tsNow(true), business);

    return createRoot((dispose) => {
      middleware.onDestroy(dispose);

      let container: HTMLDivElement;
      (
        <Row
          ref={container}
          class="popup-stars-transaction-row"
          noWrap
          clickable={async() => {
            const popup = await createPaymentPopup({
              subscription,
              noPaymentForm: true
            });

            popup.addEventListener('finish', (result) => {
              if(result === 'paid') {
                setShow(false);
              }
            });
          }}
        >
          {/* each line carries its own right-hand note — the price, the state, the period — so they
              line up in a column instead of one of them squeezing the copy on every line */}
          <Row.Title titleRight={presentation.showPrice && (<StarsAmount stars={subscription.pricing.amount} />)}>{title}</Row.Title>
          <Row.Midtitle midtitleRight={presentation.statusKey && (<span class="popup-stars-cancelled danger">{i18n(presentation.statusKey)}</span>)}>
            {subscription.title && wrapEmojiText(subscription.title)}
          </Row.Midtitle>
          <Row.Subtitle subtitleRight={presentation.showPrice && (subscription.pricing.period === 2592000 ? i18n('Stars.Subscriptions.PerMonth') : i18n('Stars.Subscription.PerPeriod', [wrapDuration(subscription.pricing.period)]))}>{
            i18n(presentation.dateKey, [formatFullSentTime(subscription.until_date, undefined, true)])
          }</Row.Subtitle>
          <Row.Media size="abitbigger">{media}</Row.Media>
        </Row>
      );

      return container;
    });
  };

  function renderContent(
    image: HTMLElement,
    peerTitle?: HTMLElement,
    avatar?: HTMLElement
  ) {
    const stars = useStars(options.ton);
    const starsNeeded = createMemo(() => {
      if(!options.itemPrice) return bigInt.zero;
      return bigInt(options.itemPrice.toString()).minus(stars());
    });
    const topupOptions = createMemo(() => {
      if(options.ton) return [];
      if(options.itemPrice) {
        const filtered = options$.filter((option) => starsNeeded().lt(option.stars));
        if(!filtered.length) {
          return [options$[options$.length - 1]];
        }

        return filtered;
      }

      return options$;
    });
    const alwaysVisible = topupOptions().length > 3 ? topupOptions().filter((option) => !option.pFlags.extended) : topupOptions();
    const [extended, setExtended] = createSignal(topupOptions().length <= 3);
    const displayingRows = createMemo(() => Math.ceil((extended() ? topupOptions().length : alwaysVisible.length) / 2));

    let busy = false;

    let title: JSX.Element;
    if(options.giftPeerId && !options.itemPrice) {
      title = i18n('GiftStarsTitle');
    } else if(options.itemPrice) {
      if(options.ton) {
        title = i18n('TonNeededTitle', [formatNanoton(starsNeeded().toString())]);
      } else {
        title = i18n('StarsNeededTitle', [starsNeeded().toJSNumber()]);
      }
    } else if(options.ton) {
      title = i18n('GramBalance');
    } else {
      title = i18n('TelegramStars');
    }

    let subtitle: JSX.Element;
    if(options.giftPeerId && !options.purpose) {
      subtitle = (
        <>
          {i18n('GiftStarsSubtitle', [peerTitle])}
          {' '}
          {getExamplesAnchor(hideWithCallback)}
        </>
      );
    } else if(options.ton) {
      subtitle = i18n('TonNeededText');
    } else if(options.purpose) {
      let langPackKey: LangPackKey;
      if(options.purpose === 'reaction') {
        langPackKey = 'Stars.TopUp.Reaction';
      } else {
        const key = `Stars.TopUp.Label_`;
        // @ts-ignore
        if(I18n.strings.get(key + options.purpose)) {
          // @ts-ignore
          langPackKey = key + options.purpose;
        } else {
          // @ts-ignore
          langPackKey = key + 'default';
        }
      }

      subtitle = i18n(langPackKey as LangPackKey, [peerTitle]);
    } else if(options.itemPrice) {
      subtitle = i18n(options.paymentForm ? 'StarsNeededText' : 'Stars.Subscribe.Need', [peerTitle]);
    } else {
      subtitle = i18n(purchaseBlocked ? 'StarsPurchaseUnavailable' : 'TelegramStarsInfo');
    }

    const firstSection = !purchaseBlocked && (
      <Section caption={options.ton ? 'Stars.Transaction.GramTOS' : 'Stars.TOS'}>
        <div class="popup-stars-options" style={{height: (displayingRows() * 79 + (displayingRows() - 1) * 8) + 'px'}}>
          <Show when={options.ton}>
            <Button
              class="btn-primary btn-color-primary"
              text="FragmentTopUp"
              onClick={() => {
                safeWindowOpen(appConfig$.ton_topup_url);
              }}
            />
          </Show>
          <For each={topupOptions()}>{(option, idx) => {
            const index = createMemo(() => extended() || option.pFlags.extended ? idx() : alwaysVisible.indexOf(option));
            // * the second column is toward the inline end — leftward in a right-to-left layout
            const translateX = createMemo(() => (index() % 2) ? 'calc((100% + .5rem) * var(--reflect))' : '0');
            const translateY = createMemo(() => (Math.floor(index() / 2) * 79 + Math.floor(index() / 2) * 8) + 'px');
            const isFullWidth = createMemo(() => {
              if(!((extended() ? topupOptions() : alwaysVisible).length % 2)) {
                return false;
              }

              if(extended() || option.pFlags.extended) {
                return index() === (topupOptions().length - 1);
              }

              return index() === (alwaysVisible.length - 1);
            });

            const iconsElements = StarsStackedStars({stars: +option.stars, size: 26});

            return (
              <div
                class="popup-stars-option"
                classList={{invisible: option.pFlags.extended && !extended(), full: isFullWidth()}}
                style={{transform: `translate(${translateX()}, ${translateY()})`}}
                onClick={async() => {
                  if(busy) {
                    return;
                  }

                  busy = true;

                  const purpose: InputStorePaymentPurpose = options.giftPeerId ? {
                    _: 'inputStorePaymentStarsGift',
                    amount: option.amount,
                    currency: option.currency,
                    stars: option.stars,
                    user_id: await managers.appUsersManager.getUserInput(options.giftPeerId.toUserId())
                  } : {
                    _: 'inputStorePaymentStarsTopup',
                    amount: option.amount,
                    currency: option.currency,
                    stars: option.stars,
                    spend_purpose_peer: purposePeerId ?
                      await managers.appPeersManager.getInputPeerById(purposePeerId) :
                      undefined
                  };

                  const inputInvoice: InputInvoice = {
                    _: 'inputInvoiceStars',
                    purpose
                  };
                  try {
                    const paymentForm = await managers.appPaymentsManager.getPaymentForm(inputInvoice);
                    const popup = await createPaymentPopup({
                      inputInvoice,
                      paymentForm
                    });

                    popup.addEventListener('finish', (result) => {
                      if(result === 'paid') {
                        toppedUp = true;

                        if(options.onTopup) {
                          setShow(false);
                          options.onTopup(+option.amount);
                        }
                      }
                    });
                  } catch(err) {
                    console.error('stars error', err);
                  }

                  busy = false;
                }}
              >
                <div class="popup-stars-option-title"><span dir="ltr">{`+${option.stars}`}</span>{iconsElements}</div>
                <div class="popup-stars-option-subtitle">{paymentsWrapCurrencyAmount(option.amount, option.currency)}</div>
              </div>
            );
          }}</For>
        </div>
        <GrowHeightReveal when={!extended()} appear={false}>
          <Button
            class="btn-primary btn-transparent primary popup-stars-more"
            icon="down"
            text="ShowMoreOptions"
            onClick={() => setExtended((v) => !v)}
          />
        </GrowHeightReveal>
      </Section>
    );

    let subscriptionsOffset: string;
    const loadMoreSubscriptions = async() => {
      const starsStatus = await rootScope.managers.appPaymentsManager.getStarsSubscriptions(subscriptionsOffset);
      if(!middleware()) {
        return;
      }

      const promises = (starsStatus.subscriptions || []).map(renderSubscription);
      const rendered = await Promise.all(promises);
      if(!middleware()) return;

      setSubscriptionsLoader((value) => {
        value.count += rendered.length;
        subscriptionsOffset = starsStatus.subscriptions_next_offset;
        if(!subscriptionsOffset) {
          value.loadMore = undefined;
        }

        value.rendered.push(...rendered);
        return value;
      });
    };

    const [subscriptionsLoader, setSubscriptionsLoader] = createLoadableList({
      loadMore: loadMoreSubscriptions
    });

    if(!options.ton) subscriptionsLoader().loadMore();
    const subscriptionsSection = (
      <Section class="popup-stars-subscriptions-section" name="Stars.Subscriptions">
        <div>{subscriptionsLoader().rendered}</div>
        <Show when={!!subscriptionsLoader().loadMore}>
          <MoreButton
            count={subscriptionsLoader().count - subscriptionsLoader().rendered.length}
            callback={() => subscriptionsLoader().loadMore()}
          />
        </Show>
      </Section>
    );

    const transactionsSection = <StarsTransactionsList ton={options.ton} middleware={middleware} setLoadMore={(load) => setLoadMore(load)} />;

    const restSection = (
      <>
        {appConfig$.stars_gifts_enabled && !options.ton && !purchaseBlocked && (
          <Section>
            <Button
              class="btn-primary btn-transparent primary"
              text="TelegramStarsGift"
              onClick={async() => {
                setShow(false);
                const peerId = await showContactPickerPopup();
                showStarsPopup({
                  giftPeerId: peerId,
                  onTopup: async(stars) => {
                    toastNew({
                      langPackKey: 'StarsGiftSentPopupInfo',
                      langPackArguments: [stars, await wrapPeerTitle({peerId})]
                    });
                  }
                });
              }}
            />
          </Section>
        )}
        {!!subscriptionsLoader().count && subscriptionsSection}
        {transactionsSection}
      </>
    );

    // Gifting stars is buying them for someone else, so it goes with the top-up
    // options and is out when buying is blocked or this popup is already a gift.
    const giftSection = !purchaseBlocked && !options.ton && !options.giftPeerId && !options.itemPrice && (
      <Section>
        <Row clickable={showGiftStarsPicker}>
          <Row.Icon icon="gift" />
          <Row.Title>{i18n('TelegramStarsGift')}</Row.Title>
        </Row>
      </Section>
    );

    return (
      <>
        <MediaHeader class="popup-stars-intro">
          {image}
          {avatar}
          <MediaHeader.Title>{title}</MediaHeader.Title>
          <MediaHeader.Subtitle>{subtitle}</MediaHeader.Subtitle>
        </MediaHeader>
        {firstSection}
        {giftSection}
        {starsNeeded() === bigInt.zero && !options.giftPeerId && restSection}
      </>
    );
  }

  function openPopup() {
    createPopup(() => {
      onCleanup(() => {
        listenerSetter.removeAll();
        middlewareHelper.destroy();
      });

      return (
        <PopupElement
          managers={managers}
          class="popup-stars"
          kind={STARS_POPUP_KIND}
          closable
          show={show()}
          onClose={() => {
            if(!toppedUp && options.onCancel) {
              options.onCancel();
            }
          }}
          onCloseAfterTimeout={() => deferredCloseCallbacks.splice(0).forEach((callback) => callback())}
        >
          <PopupElement.Header floating>
            <PopupElement.CloseButton />
            <PopupElement.Title title={options.ton ? 'GramBalance' : 'TelegramStars'} />
            {!options.historyPeerId && <StarsBalance ton={options.ton} />}
          </PopupElement.Header>
          <PopupElement.Scrollable
            contextRef={(ref) => scrollableRef = ref}
            onScrolledBottom={() => onScrolledBottom?.()}
          >
            <PopupElement.Body>
              {content}
            </PopupElement.Body>
          </PopupElement.Scrollable>
        </PopupElement>
      );
    });

    setShow(true);
  }

  async function construct() {
    if(options.historyPeerId) {
        const title = await wrapPeerTitle({peerId: options.historyPeerId});
      if(!middleware()) return;
      content = (
        <>
          <MediaHeader class="popup-stars-intro">
            <MediaHeader.Title class="popup-stars-history-title">{title}</MediaHeader.Title>
            <MediaHeader.Subtitle>{i18n('Stars.Transaction.History')}</MediaHeader.Subtitle>
          </MediaHeader>
          <StarsTransactionsList peerId={options.historyPeerId} ton={options.ton} middleware={middleware} setLoadMore={setLoadMore} />
        </>
      );
      openPopup();
      setShow(true);
      return;
    }

    const [image, peerTitle, topupOptions, avatar, appConfig, _] = await Promise.all([
      (async() => {
        if(options.ton) {
          const stickerDiv = document.createElement('div');
          stickerDiv.classList.add('popup-stars-image');
          stickerDiv.style.width = stickerDiv.style.height = '100px';
          return wrapLocalSticker({
            assetName: 'Diamond',
            width: 100,
            height: 100,
            middleware: middleware,
            loop: true,
            autoplay: true
          }).then(({container}) => {
            stickerDiv.append(container);
            return stickerDiv;
          });
        }
        const img = document.createElement('img');
        img.alt = '';
        img.classList.add('popup-stars-image');
        await renderImageFromUrlPromise(img, `assets/img/${maybe2x(options.giftPeerId ? 'stars_pay' : 'stars')}.png`);
        return img;
      })(),
      options.peerId || options.paymentForm?.bot_id || options.giftPeerId ? wrapPeerTitle({peerId: options.peerId || options.giftPeerId || options.paymentForm.bot_id.toPeerId(false)}) : undefined,
      options.giftPeerId ? managers.appPaymentsManager.getStarsGiftOptions(options.giftPeerId.toUserId()) : managers.appPaymentsManager.getStarsTopupOptions(),
      options.giftPeerId && (async() => {
        const avatar = avatarNew({peerId: options.giftPeerId, size: 100, middleware: middleware});
        await avatar.readyThumbPromise;
        avatar.node.classList.add('popup-stars-gift-avatar');
        return avatar.node;
      })(),
      managers.apiManager.getAppConfig(),
      options.itemPrice && prefetchStars(middleware)
    ]);
    options$ = topupOptions;
    appConfig$ = appConfig;

    // * stars can be unavailable for purchase at all, then only the balance and the history are left
    purchaseBlocked = !options.ton && !!appConfig.stars_purchase_blocked;
    if(purchaseBlocked && (options.itemPrice || options.giftPeerId)) {
      confirmationPopup({
        titleLangKey: 'StarsNotAvailableTitle',
        descriptionLangKey: 'StarsNotAvailableText',
        button: {langKey: 'OK', isCancel: true}
      }).catch(() => {});
      setShow(false);
      options.onCancel?.();
      return;
    }

    // * topping up for a spend on a bot or a channel can be forbidden, then there's nothing to offer
    if(!options.ton && purposePeerId && appConfig.stars_spend_topup_invoice_disabled) {
      toastNew({langPackKey: 'PaymentInvoiceDisabledStarsText'});
      setShow(false);
      options.onCancel?.();
      return;
    }

    content = renderContent(image, peerTitle, avatar);
    openPopup();
  }

  void construct();
  return handle;
}
