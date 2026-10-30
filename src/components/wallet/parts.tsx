/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createRoot, For, JSX, Show, Suspense} from 'solid-js';
import type {WalletNftItem, WalletTransaction} from '@layer';
import {IconTsx} from '@components/iconTsx';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {AvatarNewTsx} from '@components/avatarNew';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import Row from '@components/rowTsx';
import CurrencyAmount, {CurrencyBalance} from '@components/currencyAmount';
import {i18n, LangPackKey} from '@lib/langPack';
import I18n from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import {formatFullSentTime} from '@helpers/date';
import {copyTextToClipboard} from '@helpers/clipboard';
import {toastNew} from '@components/toast';
import type {WalletHistoryItem, WalletPendingTransfer} from '@components/wallet/store';
import {absNanos, formatGrams, formatGramsCut, isCryptoTopUp, shortAddress, splitGrams, walletProviderName} from '@components/wallet/format';
import liteMode from '@helpers/liteMode';
import bigInt from 'big-integer';
import {WalletNftImage, WalletNftName, walletNftKindText, walletNftPicture} from '@components/wallet/collectibles';
import {useWallet, WalletContextValue} from '@components/wallet/context';
import {WalletPendingRowDecor} from '@components/wallet/sendAnimation';
import {canonicalTonAddress} from '@lib/wallet/transferMessages';
import {findSettledTransfer} from '@components/wallet/settledTransfer';
import {normalizeWalletHash, WALLET_STREAM_ID_PREFIX} from '@lib/wallet/stream';
import {Skeleton} from '@components/skeleton';
import styles from '@components/wallet/wallet.module.scss';

/**
 * A screen's header, drawn as the app's popups draw theirs (PopupElement.Header, CloseButton and Title): every
 * screen keeps its own, since the screens slide past each other inside one popup
 */
export function WalletHeader(props: {
  title?: LangPackKey,
  titleElement?: JSX.Element,
  /** back instead of close */
  back?: boolean,
  children?: JSX.Element
}) {
  const wallet = useWallet();
  return (
    <div class="popup-header">
      <button
        type="button"
        class="btn-icon popup-close"
        aria-label={I18n.format(props.back ? 'AccDescr.Back' : 'Close', true)}
        onClick={() => props.back ? wallet.router.pop() : wallet.close()}
      >
        <Show when={props.back} fallback={<IconTsx icon="close" />}>
          <div class="animated-close-icon state-back" />
        </Show>
      </button>
      <div class="popup-title" dir="auto">{props.titleElement ?? (props.title && i18n(props.title))}</div>
      {props.children}
    </div>
  );
}

/**
 * The balance at the end of a header
 */
export function WalletHeaderBalance(props: {nanos: string}) {
  const parts = () => splitGrams(props.nanos);
  return <CurrencyBalance icon={<IconTsx icon="gram_filled" />}>{parts().whole}{parts().fraction}</CurrencyBalance>;
}

/**
 * An amount of Grams inside a line of text, as the app's receipts write one
 */
export function WalletTonAmount(props: {nanos: string | number, /** cut to this many decimals */ decimals?: number}) {
  return <span class="ton-amount"><IconTsx icon="gram_filled" class="ton-amount-icon" /> {props.decimals ? formatGramsCut(props.nanos, props.decimals) : formatGrams(props.nanos)}</span>;
}

/**
 * `+2.46` as the history shows an amount (iOS WalletTransactionItemComponent): up to three decimals cut, never
 * rounded up (five for a key update), the fraction smaller, an en dash for what left. The send animation finds the
 * text by its `span` and the icon by its data attribute.
 */
function GramsChange(props: {nanos: string | number, incoming?: boolean, decimals?: number, color?: AmountColor}) {
  const parts = () => {
    const text = formatGramsCut(props.nanos, props.decimals ?? 3);
    const dot = text.lastIndexOf('.');
    return dot === -1 ? {whole: text, fraction: ''} : {whole: text.slice(0, dot), fraction: text.slice(dot)};
  };

  return (
    <CurrencyAmount
      amount={<span>{props.incoming ? '+' : '\u2013'}{parts().whole}<span class={styles.amountFraction}>{parts().fraction}</span></span>}
      icon={<IconTsx icon="gram_filled" class={!props.color || props.color === 'green' ? styles.amountGram : undefined} data-wallet-amount-icon />}
      color={props.color}
    />
  );
}

type AmountColor = 'green' | 'danger' | 'secondary';

/** iOS: green in, the text's own colour out, red when it failed; grey while a transfer goes unanimated */
function amountColor(props: {incoming?: boolean, failed?: boolean, muted?: boolean}): AmountColor {
  return props.failed ? 'danger' : props.muted ? 'secondary' : props.incoming ? 'green' : undefined;
}

function Badge(props: {icon: Icon, outgoing?: boolean, children?: JSX.Element}) {
  return (
    <span class={classNames(styles.badge, props.outgoing && styles.badgeOutgoing)}>
      <IconTsx icon={props.icon} />
      {props.children}
    </span>
  );
}

/** `incoming`: the way the row shows it went, a transfer to oneself reads as incoming (iOS) */
export function getTransactionKind(transaction: WalletTransaction, incoming = isIncoming(transaction)): LangPackKey {
  if(transaction.pFlags.key_change) return 'Wallet.Row.KeyChange';
  if(transaction.nft) return incoming ? 'Wallet.Row.CollectibleIn' : 'Wallet.Row.CollectibleOut';
  const peer = transaction.peer;
  if(peer._ === 'walletTransactionPeerOnramp') return isCryptoTopUp(peer.provider_name) ? 'Wallet.Row.CryptoTopUp' : 'Wallet.Row.CardTopUp';
  if(peer._ === 'walletTransactionPeerAddress') return incoming ? 'Wallet.Row.Deposit' : 'Wallet.Row.Withdrawal';
  return incoming ? 'Wallet.Row.Incoming' : 'Wallet.Row.Outgoing';
}

export function isIncoming(transaction: WalletTransaction) {
  return !!transaction.pFlags.incoming;
}

/** A transfer from the wallet to itself: iOS shows it as incoming, with its amount unsigned */
export function isSelfTransfer(transaction: WalletTransaction, walletAddress: string) {
  const peer = transaction.peer;
  if(!walletAddress || transaction.pFlags.key_change || peer._ === 'walletTransactionPeerOnramp' || !('address' in peer)) {
    return false;
  }

  const own = canonicalTonAddress(walletAddress);
  return !!own && canonicalTonAddress(peer.address) === own;
}

export function TransactionMedia(props: {transaction?: WalletTransaction, pending?: WalletPendingTransfer, size?: number}) {
  const peerId = (): PeerId => {
    const peer = props.transaction?.peer;
    if(peer?._ === 'walletTransactionPeerUser') return peer.user_id.toPeerId(false);
    return props.pending?.userId ? props.pending.userId.toPeerId(false) : undefined;
  };

  const badge = (): JSX.Element => {
    const transaction = props.transaction;
    if(transaction?.pFlags.key_change) return <Badge icon="key_filled" />;
    if(transaction?.peer._ === 'walletTransactionPeerOnramp') {
      return <Badge icon={isCryptoTopUp(transaction.peer.provider_name) ? 'wallet' : 'card_filled'} />;
    }
    if(transaction && isIncoming(transaction)) return <Badge icon="gram_filled" />;
    return <Badge icon="arrow_up_circle_filled" outgoing />;
  };

  return (
    <Show when={peerId()} fallback={badge()}>
      <AvatarNewTsx peerId={peerId()} size={props.size || 42} />
    </Show>
  );
}

/**
 * An address as a history row's title (iOS WalletTransactionAddressTitleComponent): its start, its middle fading
 * out and its end, in three monospace chips
 */
function WalletAddressChips(props: {address: string}) {
  const groups = () => {
    const address = props.address;
    return [address.slice(0, 4), address.slice(4, 6) + address.slice(-6, -4), address.slice(-4)];
  };

  return (
    <span class={styles.addressChips} dir="ltr">
      <span class="sr-only">{props.address}</span>
      <For each={groups()}>{(group, index) => (
        <span class={classNames(styles.addressChip, index() === 1 && styles.addressChipMasked)} aria-hidden="true">{group}</span>
      )}</For>
    </span>
  );
}

const addressTitle = (address: string, chips?: boolean): JSX.Element => {
  return chips && address.length > 12 ? <WalletAddressChips address={address} /> : shortAddress(address);
};

export function TransactionTitle(props: {
  transaction?: WalletTransaction,
  pending?: WalletPendingTransfer,
  /** a bare address as three chips, as the history writes it */
  chips?: boolean
}) {
  const peer = () => props.transaction?.peer;
  return (
    <Show
      when={(() => {
        const p = peer();
        return p?._ === 'walletTransactionPeerUser' ? p.user_id.toPeerId(false) : props.pending?.userId?.toPeerId(false);
      })()}
      fallback={(() => {
        const p = peer();
        // * a top-up is named by how it was paid, its provider under it (iOS, Android)
        if(p?._ === 'walletTransactionPeerOnramp') return i18n(getTransactionKind(props.transaction));
        if(p && 'address' in p) return p.domain || addressTitle(p.address, props.chips);
        if(props.pending) return addressTitle(props.pending.address, props.chips);
        return i18n(props.transaction?.pFlags.key_change ? 'Wallet.Row.KeyChange' : 'Wallet.Row.Withdrawal');
      })()}
    >
      {/* * the name loads as a resource: its own boundary waits for it, not the screen's — that one would take the whole
        * screen out of the page meanwhile, and the history's scroll with it (a page of older rows jumped to the top) */}
      {(peerId) => <Suspense><PeerTitleTsx peerId={peerId()} /></Suspense>}
    </Show>
  );
}

/** A collectible's transfer in place of an amount: one item in or out (tdesktop's item amount) */
function ItemsChange(props: {incoming?: boolean, color?: AmountColor}) {
  return (
    <CurrencyAmount
      amount={<span>{props.incoming ? '+' : '\u2013'}{i18n('Wallet.Row.Items', [1])}</span>}
      color={props.color}
    />
  );
}

/** The collectible a history row moved, under the row: its picture, its name and what it is */
function WalletNftChip(props: {item: WalletNftItem}) {
  return (
    <div class={styles.rowChip}>
      <WalletNftImage document={walletNftPicture(props.item, true)} size={40} class={styles.rowChipImage} />
      <div class={styles.rowChipText}>
        <div class={styles.rowChipTitle}><WalletNftName item={props.item} /></div>
        <div class={styles.rowChipKind}>{walletNftKindText(props.item)}</div>
      </div>
    </div>
  );
}

export function WalletHistoryRow(props: {
  item: WalletHistoryItem,
  onClick: (item: WalletHistoryItem) => void,
  /** the row's element, for the list's motion */
  ref?: (element: HTMLElement) => void
}) {
  const wallet = useWallet();
  const transaction = () => props.item.transaction;
  const pending = () => props.item.pending;
  const nft = () => pending()?.nft || transaction()?.nft;
  const self = () => !!transaction() && isSelfTransfer(transaction(), wallet.store.status().state?.address);
  const incoming = () => !pending() && (isIncoming(transaction()) || self());
  const failed = () => pending() ? !!pending().failed : !!transaction().pFlags.failed;
  // * nothing moves: a transfer that goes has iOS's look of one that is not animated — grey, a spinner on the
  // * avatar; otherwise the send animation lifts the row (sendAnimation.tsx)
  const animated = liteMode.isAvailable('animations');
  const sending = () => !!pending() && !pending().failed;
  const kind = (): JSX.Element => {
    if(failed()) return i18n('Wallet.Row.Failed');
    if(pending()) return i18n(pending().nft ? 'Wallet.Row.CollectibleOut' : pending().userId ? 'Wallet.Row.Outgoing' : 'Wallet.Row.Withdrawal');
    const peer = transaction().peer;
    if(peer._ === 'walletTransactionPeerOnramp') return walletProviderName(peer.provider_name);
    return i18n(getTransactionKind(transaction(), incoming()));
  };

  const date = () => formatFullSentTime(pending() ? Math.floor(pending().date / 1000) : transaction().date);
  const color = () => amountColor({incoming: incoming(), failed: failed(), muted: sending() && !animated});
  // * a key update costs what it moved and its fee (iOS); a transfer to oneself shows its amount unsigned
  const nanos = (): string | number => {
    if(pending()) return pending().nanograms;
    const value = transaction();
    if(value.pFlags.key_change) return bigInt(absNanos(value.amount)).add(bigInt(String(value.fee || 0))).toString();
    return value.amount;
  };

  return (
    <Row
      ref={(element) => props.ref?.(element)}
      class="transaction-row"
      noWrap
      role="button"
      tabIndex={0}
      style={{'grid-template-columns': '3.5rem minmax(0, 1fr) auto'}}
      clickable={() => props.onClick(props.item)}
    >
      <Show when={sending() && animated}><WalletPendingRowDecor pending={pending()} /></Show>
      <Row.Title><b><TransactionTitle transaction={transaction()} pending={pending()} chips /></b></Row.Title>
      <Row.Midtitle>{kind()}</Row.Midtitle>
      <Row.Subtitle class={nft() && styles.rowSubtitleChip}>
        {/* * "Sending" in the date's place while the transfer goes; the date fades in once it went (iOS) */}
        <Show when={sending() && animated} fallback={date()}>
          <span class={styles.rowStatus}>
            <span data-wallet-row-date style={{opacity: 0}} aria-hidden="true">{date()}</span>
            <span data-wallet-row-sending>{i18n('Wallet.Row.Sending')}</span>
          </span>
        </Show>
        <Show when={nft()}>{(item) => <WalletNftChip item={item()} />}</Show>
      </Row.Subtitle>
      <Row.RightContent>
        <Show
          when={nft()}
          fallback={<GramsChange
            nanos={nanos()}
            incoming={incoming()}
            decimals={transaction()?.pFlags.key_change ? 5 : 3}
            color={color()}
          />}
        >
          <ItemsChange incoming={incoming()} color={color()} />
        </Show>
      </Row.RightContent>
      <Row.Media size="abitbigger">
        <span class={classNames(styles.rowMedia, sending() && !animated && styles.rowMediaPending)}>
          <TransactionMedia transaction={transaction()} pending={pending()} />
          <Show when={sending() && !animated}>
            <span class={styles.rowSpinner} aria-hidden="true">
              <svg viewBox="0 0 9 9"><circle cx="4.5" cy="4.5" r="3.75" /></svg>
            </span>
          </Show>
        </span>
      </Row.Media>
    </Row>
  );
}

/** the lines of the placeholder rows, % of their cell: a few lengths, as text would have */
const SKELETON_WIDTHS = [[46, 30, 24], [58, 36, 28], [38, 26, 20]];

/**
 * A row of the history while its first page loads (Android's flicker rows): the history row's own shape, its parts in
 * the app's skeleton, so nothing moves when the rows come
 */
export function WalletHistorySkeletonRow(props: {index: number}) {
  const widths = SKELETON_WIDTHS[props.index % SKELETON_WIDTHS.length];
  const line = (width: number) => (
    <Skeleton.Div textLine secondary class={styles.skeleton} style={{width: width + '%'}} aria-hidden="true" />
  );

  return (
    <Row class="transaction-row" noWrap style={{'grid-template-columns': '3.5rem minmax(0, 1fr) auto'}}>
      <Row.Title>{line(widths[0])}</Row.Title>
      <Row.Midtitle>{line(widths[1])}</Row.Midtitle>
      <Row.Subtitle>{line(widths[2])}</Row.Subtitle>
      <Row.RightContent>
        <Skeleton.Div textLine secondary class={classNames(styles.skeleton, styles.skeletonAmount)} aria-hidden="true" />
      </Row.RightContent>
      <Row.Media size="abitbigger">
        <Skeleton.Div secondary class={classNames(styles.skeleton, styles.skeletonAvatar)} aria-hidden="true" />
      </Row.Media>
    </Row>
  );
}

/**
 * Restores the key from the phrase, then opens the transfer again on its comment (iOS pushes the import over the
 * transfer and decrypts once it is back): nothing happens when the restore is left unfinished
 */
function restoreKeyForComment(wallet: WalletContextValue, reopen: () => void) {
  wallet.router.push('restore', {});
  createRoot((dispose) => {
    let entered = false;
    createEffect(() => {
      const restoring = wallet.router.stack().some((entry) => entry.name === 'restore');
      if(!wallet.shown()) {
        dispose();
      } else if(restoring) {
        entered = true;
      } else if(entered) {
        dispose();
        if(wallet.store.deviceMode() === 'full') reopen();
      }
    });
  });
}

/**
 * A transfer of the wallet in its own popup over the window (tdesktop: ShowWalletTransactionBox): it follows the
 * history while open, its comment opens with the key this window restores, Send goes on to the amount screen.
 * `decryptCommentOnOpen`: the window was opened for the comment (a chat's transfer this device had no key for).
 */
export async function openWalletTransaction(
  wallet: WalletContextValue,
  item: {transaction?: WalletTransaction, pending?: WalletPendingTransfer},
  options: {decryptCommentOnOpen?: boolean} = {}
) {
  const store = wallet.store;
  const [{default: showWalletTransactionPopup}, {WalletCommentKeyError}] = await Promise.all([
    import('@components/wallet/transactionPopup'),
    import('@components/wallet/transferComment')
  ]);
  // * the row as it was seen last: one that failed while open is matched to nothing once it leaves
  let lastPending = item.pending;
  showWalletTransactionPopup({
    transaction: item.transaction,
    pending: item.pending,
    live: () => {
      const transactions = store.history.transactions();
      if(item.pending) {
        const pending = store.pending.list().find((transfer) => transfer.id === item.pending.id);
        if(pending) return {pending: lastPending = pending};
        const settled = findSettledTransfer(transactions, lastPending, store.pending.settledAs(item.pending.id));
        return settled && {transaction: settled};
      }

      const id = item.transaction.id;
      let transaction = transactions.find((transaction) => transaction.id === id);
      // * a transfer read off the stream becomes the server's copy, the transaction of the same hash
      if(!transaction && id.startsWith(WALLET_STREAM_ID_PREFIX)) {
        const hash = normalizeWalletHash(item.transaction.tx_hash);
        transaction = transactions.find((transaction) => normalizeWalletHash(transaction.tx_hash) === hash);
      }

      return transaction && {transaction};
    },
    decryptComment: async(transaction) => {
      const {ensureWalletKey, isUserCancel} = await import('@components/wallet/send');
      try {
        await ensureWalletKey(store);
      } catch(err) {
        // * no key here and no backup of it: the phrase restores it, the transfer opens again after
        if((err as any)?.type === 'WALLET_KEY_MISSING') {
          restoreKeyForComment(wallet, () => openWalletTransaction(wallet, item, {decryptCommentOnOpen: true}));
          return;
        }

        throw isUserCancel(err) ? err : new WalletCommentKeyError(err);
      }

      const status = store.status();
      return store.session.decryptComment(status, transaction, status.state.address);
    },
    decryptCommentOnOpen: options.decryptCommentOnOpen,
    suggestFirstGrams: !options.decryptCommentOnOpen,
    sendTo: async(target) => {
      const [{resolveAddressRecipient, resolveUserRecipient}, {toastWalletError}] = await Promise.all([
        import('@components/wallet/recipient'),
        import('@components/wallet/send')
      ]);
      try {
        const recipient = target.userId ?
          await resolveUserRecipient(store, target.userId) :
          await resolveAddressRecipient(store, target.address, target.domain);
        wallet.router.push('amount', {recipient});
      } catch(err) {
        toastWalletError(err);
      }
    },
    onLeave: wallet.close
  });
}

/**
 * An address onto the clipboard, with the toast that says so
 */
export function copyWalletAddress(address: string, langPackKey: LangPackKey = 'Wallet.AddressCopied') {
  copyTextToClipboard(address);
  toastNew({langPackKey});
}

/**
 * "Network fees", from the "?" of a fee
 */
export function showWalletFeesInfo() {
  import('@components/confirmationPopup').then(({default: confirmationPopup}) => confirmationPopup({
    titleLangKey: 'Wallet.FeesTitle',
    descriptionLangKey: 'Wallet.FeesText',
    button: {langKey: 'OK'}
  })).catch(() => {});
}

