/* @refresh reload */

import PopupElement, {createPopup} from '@components/popups/indexTsx';
import maybe2x from '@helpers/maybe2x';
import {InputInvoice, MessageMedia, PaymentsPaymentForm, Photo, Document, StarsTopupOption, StarsTransaction, StarsTransactionPeer, MessageExtendedMedia, ChatInvite, StarsSubscription, StarsGiftOption, InputStorePaymentPurpose, WebDocument} from '@layer';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import Section from '@components/section';
import {createMemo, createRoot, createSignal, For, JSX, Show, untrack} from 'solid-js';
import paymentsWrapCurrencyAmount, {formatNanoton} from '@helpers/paymentsWrapCurrencyAmount';
import classNames from '@helpers/string/classNames';
import {createPaymentPopup} from '@components/popups/payment';
import useStars, {prefetchStars} from '@stores/stars';
import safeAssign from '@helpers/object/safeAssign';
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
import currencyStarIcon from '@components/currencyStarIcon';
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
import appImManager from '@lib/appImManager';
import {toastNew} from '@components/toast';
import toggleDisability from '@helpers/dom/toggleDisability';
import {MoreButton} from '@components/sidebarRight/tabs/statistics';
import formatStarsAmount, {formatStarsAmountExact} from '@appManagers/utils/payments/formatStarsAmount';
import {getStarsTransactionPresentation, starsTransactionProviders} from '@appManagers/utils/payments/starsTransaction';
import wrapSticker from '@components/wrappers/sticker';
import wrapLocalSticker from '@components/wrappers/localSticker';
import bigInt from 'big-integer';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import {IconTsx} from '@components/iconTsx';
import Tabs from '@components/tabs';
import {GrowHeightReveal} from '@helpers/solid/animations';
import getStarsSpendPurposePeerId from '@helpers/getStarsSpendPurposePeerId';
import confirmationPopup from '@components/confirmationPopup';
import {getMiddleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';
import {ScrollableContextValue} from '@components/scrollable2';
import {onCleanup} from 'solid-js';

export function StarsStrokeStar(props: {stroke?: boolean, style?: JSX.HTMLAttributes<HTMLDivElement>['style']}) {
  return (
    <svg class={classNames('stars-star-icon', props.stroke && 'stars-star-icon-stroke')} width="26" height="25" viewBox="0 0 26 25" fill="none" xmlns="http://www.w3.org/2000/svg" style={props.style}>
      {props.stroke && <path d="M1.55275 9.54149L2.08783 9.9899L1.55275 9.54149C0.839803 10.3922 0.951509 11.6599 1.80225 12.3728L3.70157 13.9645C4.85897 14.9344 6.38486 15.3453 7.87281 15.0877L10.9718 14.5512L8.2359 15.8647C6.9783 16.4685 6.05307 17.5988 5.70955 18.9509L4.94315 21.9674C4.80966 22.4929 4.89409 23.0499 5.17728 23.5122C5.75711 24.4587 6.99445 24.7559 7.94094 24.1761L12.8919 21.1432C12.9484 21.1085 13.0197 21.1085 13.0762 21.1432L18.0678 24.201C18.5226 24.4796 19.0695 24.5661 19.5881 24.4412C20.6672 24.1815 21.3315 23.096 21.0717 22.0169L19.7036 16.3336C19.6881 16.269 19.7101 16.2012 19.7607 16.1581L24.2107 12.3643L23.616 11.6668L24.2107 12.3643C24.617 12.0179 24.8688 11.524 24.9105 10.9917C24.9971 9.8851 24.1702 8.91782 23.0636 8.83122L17.2288 8.37458C17.1626 8.3694 17.1049 8.32752 17.0795 8.26619L16.2326 8.61702L17.0795 8.26619L14.8408 2.86217C14.6368 2.36977 14.2456 1.97856 13.7532 1.77457C12.7278 1.34976 11.5521 1.83669 11.1273 2.86216L8.88858 8.26619C8.86318 8.32752 8.8055 8.3694 8.73932 8.37458L2.93635 8.82872C2.39814 8.87084 1.8995 9.12772 1.55275 9.54149Z" stroke="var(--star-background-color)" stroke-width="1.83333"/>}
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12.413 20.3615L7.4621 23.3945C6.9473 23.7098 6.27431 23.5482 5.95894 23.0333C5.80491 22.7819 5.75899 22.4789 5.8316 22.1931L6.598 19.1766C6.87465 18.0876 7.61981 17.1774 8.63265 16.6911L14.0338 14.0979C14.2857 13.977 14.3918 13.6749 14.2709 13.4231C14.173 13.2191 13.9516 13.105 13.7287 13.1436L7.71644 14.1845C6.49429 14.3961 5.24099 14.0586 4.29035 13.2619L2.39103 11.6702C1.92831 11.2825 1.86756 10.593 2.25533 10.1303C2.44393 9.90522 2.71514 9.7655 3.00787 9.74259L8.81084 9.28846C9.2208 9.25637 9.57808 8.99693 9.73546 8.61702L11.9741 3.21299C12.2052 2.65524 12.8447 2.39039 13.4024 2.62145C13.6702 2.7324 13.883 2.94518 13.9939 3.21299L16.2326 8.61702C16.39 8.99693 16.7473 9.25637 17.1572 9.28846L22.9921 9.74509C23.594 9.79219 24.0437 10.3183 23.9966 10.9202C23.974 11.2097 23.837 11.4783 23.616 11.6668L19.166 15.4605C18.8527 15.7275 18.7161 16.148 18.8124 16.5482L20.1805 22.2314C20.3218 22.8184 19.9605 23.4087 19.3735 23.55C19.0915 23.6179 18.794 23.5709 18.5467 23.4194L13.5551 20.3615C13.2046 20.1468 12.7634 20.1468 12.413 20.3615Z" fill="url(#paint0_linear_4300_30119)" stroke="url(#paint1_linear_4300_30119)" stroke-width="1.22222"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12.413 20.3615L7.4621 23.3945C6.9473 23.7098 6.27431 23.5482 5.95894 23.0334C5.80491 22.7819 5.75899 22.4789 5.8316 22.1931L6.598 19.1766C6.87465 18.0876 7.61981 17.1774 8.63265 16.6911L14.0338 14.0979C14.2857 13.977 14.3918 13.6749 14.2709 13.4231C14.173 13.2191 13.9516 13.105 13.7287 13.1436L7.71644 14.1845C6.49429 14.3961 5.24099 14.0586 4.29035 13.2619L2.39103 11.6702C1.92831 11.2825 1.86756 10.593 2.25533 10.1303C2.44393 9.90522 2.71514 9.7655 3.00787 9.74259L8.81084 9.28846C9.2208 9.25637 9.57808 8.99693 9.73546 8.61702L11.9741 3.21299C12.2052 2.65524 12.8447 2.39039 13.4024 2.62145C13.6702 2.7324 13.883 2.94518 13.9939 3.21299L16.2326 8.61702C16.39 8.99693 16.7473 9.25637 17.1572 9.28846L22.9921 9.74509C23.594 9.79219 24.0437 10.3183 23.9966 10.9202C23.974 11.2097 23.837 11.4783 23.616 11.6668L19.166 15.4605C18.8527 15.7275 18.7161 16.148 18.8124 16.5482L20.1805 22.2314C20.3218 22.8184 19.9605 23.4087 19.3735 23.55C19.0915 23.6179 18.794 23.5709 18.5467 23.4194L13.5551 20.3615C13.2046 20.1468 12.7634 20.1468 12.413 20.3615Z" stroke="url(#paint2_linear_4300_30119)" stroke-width="2.44444" style="mix-blend-mode:soft-light"/>
      <defs>
        <linearGradient id="paint0_linear_4300_30119" x1="0.0870915" y1="28.1529" x2="41.4" y2="-18.3997" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FDEB32"/>
          <stop offset="0.439058" stop-color="#FEBD04"/>
          <stop offset="1" stop-color="#D75902"/>
        </linearGradient>
        <linearGradient id="paint1_linear_4300_30119" x1="27.0556" y1="3.61111" x2="9.33333" y2="15.8333" gradientUnits="userSpaceOnUse">
          <stop stop-color="#DB5A00"/>
          <stop offset="1" stop-color="#FF9145"/>
        </linearGradient>
        <linearGradient id="paint2_linear_4300_30119" x1="29.5" y1="3.00001" x2="13" y2="13.0592" gradientUnits="userSpaceOnUse">
          <stop stop-color="var(--star-background-color)" stop-opacity="0"/>
          <stop offset="0.395833" stop-color="var(--star-background-color)" stop-opacity="0.85"/>
          <stop offset="0.520833" stop-color="var(--star-background-color)"/>
          <stop offset="0.645833" stop-color="var(--star-background-color)" stop-opacity="0.85"/>
          <stop offset="1" stop-color="var(--star-background-color)" stop-opacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export function StarsStackedStars(props: {stars: number, size: number}) {
  let icons = 1;
  if(props.stars >= 2500) icons = 6;
  else if(props.stars >= 1000) icons = 5;
  else if(props.stars >= 500) icons = 4;
  else if(props.stars >= 250) icons = 3;
  else if(props.stars >= 50) icons = 2;
  let iconsElements: JSX.Element;
  const m = props.size + (props.size === 18 ? 4 : 6);
  if(icons > 1) {
    iconsElements = [];
    for(let i = 0; i < icons; ++i) iconsElements.push((
      <StarsStrokeStar
        stroke={i !== (icons - 1)}
        style={{
          'margin-right': (Math.min(i, 1) * -m) + 'px'
        }}
      />
    ));
  } else {
    iconsElements = <StarsStrokeStar />;
  }

  iconsElements = (
    <div
      class="stars-stacked"
      style={{
        'width': `${props.size + (icons - 1) * 6}px`,
        '--size': props.size + 'px'
      }}
    >
      {iconsElements}
    </div>
  );
  return iconsElements;
}

export function StarsStar() {
  return currencyStarIcon();
}

export function StarsBalance(props: {ton?: boolean} = {}) {
  const stars = useStars(props.ton);
  return (
    <div class="stars-balance">
      <div class="stars-balance-title">{i18n('StarsBalance')}</div>
      <div class="stars-balance-subtitle">{props.ton ? <IconTsx icon="ton" /> : <StarsStar />}{props.ton ? formatNanoton(stars() ?? 0, 9) : '' + (stars() ?? 0)}</div>
    </div>
  );
}

export function StarsAmount(props: {stars: Long}) {
  return (
    <div class={classNames('popup-stars-pay-amount', 'popup-stars-pay-amount-plain')}>
      <StarsStar />
      {props.stars}
    </div>
  );
}

export function StarsChange(props: {
  stars: Long,
  isRefund?: boolean,
  noSign?: boolean,
  reverse?: boolean,
  inline?: boolean,
  ton?: boolean
}) {
  return (
    <div class={classNames('popup-stars-pay-amount', +props.stars >= 0 ? 'green' : 'danger', props.reverse && 'reverse', props.inline && 'inline')}>
      {`${+props.stars > 0 && !props.noSign ? '+' : ''}${props.stars}`}
      {props.ton ? <IconTsx icon="ton" /> : <StarsStar />}
      {props.isRefund && <span class="popup-stars-pay-amount-status">{i18n('StarsRefunded')}</span>}
    </div>
  );
}

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
          appImManager.setInnerPeer(obj);
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
        const gift = await rootScope.managers.appGiftsManager.wrapGift(transaction.stargift);
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
    <Section class="popup-stars-transactions-section">
      <Tabs.Simple
        tab={tab}
        onChange={(index) => {
          setTab(index);
          if(!lists[index].rows().length) void lists[index].load();
        }}
        class="popup-stars-transactions"
        menu={[i18n('StarsTransactionsAll'), i18n('StarsTransactionsIncoming'), i18n('StarsTransactionsOutgoing')]}
        content={lists.map((list) => (
          <div>
            {list.rows()}
            <Show when={list.error()}><Button class="btn-primary btn-transparent" text="Stars.Transaction.Retry" onClick={() => void list.load()} /></Show>
            <Show when={list.ended() && !list.rows().length}><div class="popup-stars-empty text-center">{i18n('Stars.Transaction.Empty')}</div></Show>
            <Show when={!list.ended() && !list.error()}><Button class="btn-primary btn-transparent" text={list.loading() ? 'Loading' : 'ShowMoreOptions'} disabled={list.loading()} onClick={() => void list.load()} /></Show>
          </div>
        ))}
      />
    </Section>
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
            const translateX = createMemo(() => (index() % 2) ? 'calc(100% + .5rem)' : '0');
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
                    user_id: await rootScope.managers.appUsersManager.getUserInput(options.giftPeerId.toUserId())
                  } : {
                    _: 'inputStorePaymentStarsTopup',
                    amount: option.amount,
                    currency: option.currency,
                    stars: option.stars,
                    spend_purpose_peer: purposePeerId ?
                      await rootScope.managers.appPeersManager.getInputPeerById(purposePeerId) :
                      undefined
                  };

                  const inputInvoice: InputInvoice = {
                    _: 'inputInvoiceStars',
                    purpose
                  };
                  try {
                    const paymentForm = await rootScope.managers.appPaymentsManager.getPaymentForm(inputInvoice);
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
                <div class="popup-stars-option-title">{`+${option.stars}`}{iconsElements}</div>
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
        img.classList.add('popup-stars-image');
        await renderImageFromUrlPromise(img, `assets/img/${maybe2x(options.giftPeerId ? 'stars_pay' : 'stars')}.png`);
        return img;
      })(),
      options.peerId || options.paymentForm?.bot_id || options.giftPeerId ? wrapPeerTitle({peerId: options.peerId || options.giftPeerId || options.paymentForm.bot_id.toPeerId(false)}) : undefined,
      options.giftPeerId ? rootScope.managers.appPaymentsManager.getStarsGiftOptions(options.giftPeerId.toUserId()) : rootScope.managers.appPaymentsManager.getStarsTopupOptions(),
      options.giftPeerId && (async() => {
        const avatar = avatarNew({peerId: options.giftPeerId, size: 100, middleware: middleware});
        await avatar.readyThumbPromise;
        avatar.node.classList.add('popup-stars-gift-avatar');
        return avatar.node;
      })(),
      rootScope.managers.apiManager.getAppConfig(),
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
