/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createMemo, createSignal, JSX, Match, on, onCleanup, onMount, Show, Switch} from 'solid-js';
import type {Message, MessageAction, WalletTransaction} from '@layer';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import MediaHeader from '@components/mediaHeader';
import Table, {TableButton, TablePeer, TableRow} from '@components/table';
import {IconTsx} from '@components/iconTsx';
import {ButtonMenuToggleTsx} from '@components/buttonMenuToggleTsx';
import Scrollable from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import {walletNftKindText} from '@components/wallet/collectibles';
import {
  WALLET_COLLECTIBLE_MEDIA_SIZE,
  WalletCollectibleCollection,
  WalletCollectibleMedia,
  WalletCollectibleTitle
} from '@components/wallet/collectibleHeader';
import {copyWalletAddress, isSelfTransfer, WalletTonAmount} from '@components/wallet/parts';
import watchSendingTransfer from '@components/wallet/watchSendingTransfer';
import WalletAddressGroups from '@components/wallet/addressGroups';
import {encryptedCommentCoverLength, keepCommentFocus, showCommentDecryptError, wrapCommentCover} from '@components/wallet/transferComment';
import {loadWalletFiatRate, readWalletCurrency} from '@components/wallet/fiat';
import type {WalletPendingTransfer} from '@components/wallet/store';
import {requestWalletFrame} from '@components/wallet/frameLoop';
import {showWalletGramInfoPopup, WALLET_GASLESS_DAILY_DEFAULT} from '@components/wallet/howItWorks';
import {absNanos, formatFiat, formatGramsCut, walletProviderName} from '@components/wallet/format';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import apiManagerProxy from '@lib/apiManagerProxy';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {formatTonAddress, parseTonAddress} from '@lib/wallet/tonAddress';
import {SERVICE_PEER_ID} from '@appManagers/constants';
import {formatFullSentTime} from '@helpers/date';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import base64ToBytes from '@helpers/string/base64ToBytes';
import bytesToHex from '@helpers/bytes/bytesToHex';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';
import classNames from '@helpers/string/classNames';
import pause from '@helpers/schedulers/pause';
import Animated from '@helpers/solid/animations';
import {AnimationList} from '@helpers/solid/animationList';
import {CROSS_FADE_KEYFRAMES} from '@helpers/dom/crossfadeContent';
import updateScrollRegionFocusable from '@helpers/dom/scrollRegion';
import {getTransition} from '@config/transitions';
import Modes from '@config/modes';
import liteMode from '@helpers/liteMode';
import styles from '@components/wallet/transactionPopup.module.scss';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/** a transfer a message names reaches the server's history a moment after the message: asked again a while */
const LOOKUP_ATTEMPTS = 10;
const LOOKUP_INTERVAL = 1000;
/** the Gram animation as the wallet's other popups show it */
const STICKER_SIZE = 100;
/** iOS: the grey circle of a key update */
const KEY_CIRCLE_SIZE = 90;
/** iOS: an amount with at most three decimals, a fee with five, the fee's fiat value with four */
const AMOUNT_DECIMALS = 3;
const FEE_DECIMALS = 5;
const FEE_FIAT_DECIMALS = 4;
/** iOS: the comment fades in over its cover with a .35 s spring */
const REVEAL_DURATION = 350;
const MINUS = '−';

type Status = 'pending' | 'failed';

/** where Send of a transfer goes: the user, or the address (with the name it was found by) */
export type WalletSendTarget = {userId?: UserId, address?: string, domain?: string};

/** the transfer as it is now: a pending one settled or failed, a transaction that got its hash and its fee */
export type WalletTransactionLive = {transaction?: WalletTransaction, pending?: WalletPendingTransfer};

export type WalletTransactionPopupOptions = {
  /** the transaction as served */
  transaction?: WalletTransaction,
  /** a transfer this device sends, not served yet */
  pending?: WalletPendingTransfer,
  /** what a chat's message says of its transfer: shown at once, and the served record looked up by its id */
  message?: Message.messageService,
  /** the transfer as the wallet's history has it now: the popup follows it while open; nothing keeps what it showed */
  live?: () => WalletTransactionLive | undefined,
  /** opens the comment of an encrypted transfer; nothing comes back when that went on elsewhere */
  decryptComment?: (transaction: WalletTransaction) => Promise<string | undefined>,
  /** the comment opens as the popup does: the wallet was opened for it (iOS: decryptCommentOnOpen) */
  decryptCommentOnOpen?: boolean,
  /** "Your first Grams!" over an incoming transfer once it shows, while the server suggests it (iOS) */
  suggestFirstGrams?: boolean,
  /** the footer opens the wallet (a chat's transfer) instead of closing */
  openWallet?: () => void,
  /** the Send button of a user or an address */
  sendTo?: (target: WalletSendTarget) => void,
  /** the popup leads somewhere else (a chat): what is under it closes too */
  onLeave?: () => void
};

type TransferRecord = {
  transaction: WalletTransaction,
  status?: Status
};

function recordFromTransaction(transaction: WalletTransaction): TransferRecord {
  return {transaction, status: transaction.pFlags.failed ? 'failed' : undefined};
}

function recordFromPending(pending: WalletPendingTransfer): TransferRecord {
  return {
    transaction: {
      _: 'walletTransaction',
      pFlags: {gasless: pending.gasless || undefined},
      id: '',
      amount: '-' + pending.nanograms,
      fee: 0,
      date: Math.floor(pending.date / 1000),
      peer: pending.userId ?
        {_: 'walletTransactionPeerUser', user_id: pending.userId, address: pending.address} :
        {_: 'walletTransactionPeerAddress', address: pending.address},
      comment: pending.comment,
      nft: pending.nft
    },
    status: pending.failed ? 'failed' : 'pending'
  };
}

function recordFromMessage(message: Message.messageService): TransferRecord {
  const transfer = message.action as MessageAction.messageActionGramTransfer;
  const out = !!message.pFlags.out;
  // * the service account's transfers name nobody
  const userId = message.peerId === SERVICE_PEER_ID ? undefined : (out ? message.peerId : message.fromId).toUserId();
  const nanos = absNanos(transfer.amount);
  return {
    transaction: {
      _: 'walletTransaction',
      // * a comment this device typed into a transfer it still sends is the text itself, not its payload
      pFlags: {incoming: out ? undefined : true, comment_encrypted: transfer.pFlags.comment_encrypted && !message.pFlags.is_outgoing || undefined},
      id: transfer.transaction_id,
      amount: out ? '-' + nanos : nanos,
      fee: 0,
      date: message.date,
      peer: userId ?
        {_: 'walletTransactionPeerUser', user_id: userId, address: transfer.peer_address} :
        {_: 'walletTransactionPeerAddress', address: transfer.peer_address},
      comment: transfer.comment
    },
    status: (message as any).error ? 'failed' : (message.pFlags.is_outgoing ? 'pending' : undefined)
  };
}

/** Telegram's own accounts (Android UserObject.isService): nobody to open, nobody to send to */
const SERVICE_USER_IDS = new Set<number>([+SERVICE_PEER_ID, 333000, 42777]);

/**
 * Whom the popup names: a transfer through a service account reads as its address alone, as Android shows it — no
 * peer to open and no Send toward the account
 */
function displayedPeer(peer: WalletTransaction['peer']): WalletTransaction['peer'] {
  if(peer._ !== 'walletTransactionPeerUser' || !SERVICE_USER_IDS.has(+peer.user_id)) return peer;
  return {_: 'walletTransactionPeerAddress', address: peer.address, domain: peer.domain};
}

/** the explorer's id of a transaction: its 32-byte hash in hex */
function transactionHashHex(txHash: string) {
  if(/^[0-9a-f]{64}$/i.test(txHash)) return txHash.toLowerCase();
  try {
    const bytes = base64ToBytes(txHash);
    if(bytes.length === 32) return bytesToHex(bytes);
  } catch(err) {}
}

/**
 * An address the way the chain gave it, user-friendly: a friendly one keeps its bounceable flag (a contract's EQ…
 * stays EQ…), a raw one reads non-bounceable, as wallets show it (iOS: transferAddress with preserveBounce)
 */
function displayAddress(address: string) {
  const parts = parseTonAddress(address);
  if(!parts) return address;
  const raw = /^-?\d+:/.test(address.trim());
  return formatTonAddress({...parts, bounceable: !raw && parts.bounceable, testnet: false});
}

/** `12,345` and `.678`: the fraction is written smaller */
function splitAmount(nanos: string) {
  const [whole, fraction] = formatGramsCut(nanos, AMOUNT_DECIMALS).split('.');
  return {whole, fraction: fraction ? '.' + fraction : ''};
}

type SendingHandlers = Parameters<typeof watchSendingTransfer>[1];

/**
 * A transfer this device still sends, watched from the moment its popup is asked for: what comes before the popup is
 * up is kept and handed to it (`attach`), or the popup would say "Processing" for good
 */
function watchSendingEarly(message: Message.messageService) {
  let handlers: SendingHandlers, early: (handlers: SendingHandlers) => void;
  const stop = watchSendingTransfer(message, {
    onSent: (sent) => handlers ? handlers.onSent(sent) : early = (h) => h.onSent(sent),
    onError: (error) => handlers ? handlers.onError(error) : early = (h) => h.onError(error)
  });

  return {
    stop,
    attach: (value: SendingHandlers) => {
      handlers = value;
      early?.(value);
      early = undefined;
    }
  };
}

/**
 * "Network fees", from the "?" of a transfer Telegram paid for: what such a fee is worth and how many transfers
 * a day are free (iOS)
 */
function showGaslessInfo(feeFiat: string, daily: number) {
  import('@components/confirmationPopup').then(({default: confirmationPopup}) => confirmationPopup({
    titleLangKey: 'Wallet.FeesTitle',
    descriptionLangKey: 'Wallet.Details.FeesText',
    descriptionLangArgs: [feeFiat ? ` (${feeFiat})` : '', i18n('Wallet.Details.Transfers', [daily])],
    button: {langKey: 'Wallet.GotIt', isCancel: true}
  })).catch(() => {});
}

/**
 * One transfer: what tdesktop's WalletTransactionBox tells of it — the amount and its comment over a table of who it
 * went to or came from, the fee and the date — drawn the way the app draws a Gram receipt, looking as iOS's does.
 */
export default async function showWalletTransactionPopup(options: WalletTransactionPopupOptions) {
  const initial: TransferRecord = options.message ? recordFromMessage(options.message) :
    options.pending ? recordFromPending(options.pending) :
    recordFromTransaction(options.transaction);
  const nft = initial.transaction.nft;
  // * before anything is awaited: the transfer may settle while the popup gets ready
  const sending = options.message?.pFlags.is_outgoing ? watchSendingEarly(options.message) : undefined;
  // * the account it is opened on: it does not open over another one the tab switched to meanwhile
  const managers = bindManagersToSession(rootScope.managers);

  const [appConfig, walletStatus] = await Promise.all([
    apiManagerProxy.getAppConfig(),
    managers.appWalletManager.getCachedStatus().catch((): undefined => undefined)
  ]).catch((err) => {
    sending?.stop();
    throw err;
  });

  createPopup(() => {
    const [show, setShow] = createSignal(true);
    // * a chat's transfer: the served record, or the message that replaced the one it was opened with
    const [served, setServed] = createSignal<TransferRecord>();
    const [fee, setFee] = createSignal<'known' | 'loading' | 'failed'>('known');
    const [fiatPerGram, setFiatPerGram] = createSignal(0);
    const currency = readWalletCurrency();
    const close = () => setShow(false);
    let left = false;
    onCleanup(() => left = true);

    // * the history's copy changes only when the transfer does: the table is not rebuilt on every poll
    const live = createMemo(() => options.live?.(), undefined, {
      equals: (a, b) => a?.pending === b?.pending && a?.transaction === b?.transaction
    });
    // * what the transfer is now; a transfer that left the history keeps what it showed last
    const record = createMemo<TransferRecord>((previous) => {
      const value = live();
      if(value?.pending) return recordFromPending(value.pending);
      if(value?.transaction) return recordFromTransaction(value.transaction);
      return served() || previous;
    }, initial);

    loadWalletFiatRate().then((rate) => rate?.currency === currency && setFiatPerGram(rate.perGram));

    const lookup = async(id: string) => {
      setFee('loading');
      try {
        for(let i = 0; i < LOOKUP_ATTEMPTS && !left; ++i) {
          const result = await managers.appWalletManager.getTransactionsByIds([id]);
          const transaction = result.transactions[0];
          if(transaction) {
            if(!left) {
              setServed(recordFromTransaction(transaction));
              setFee('known');
            }

            return;
          }

          await pause(LOOKUP_INTERVAL);
        }

        if(!left) setFee('failed');
      } catch(err) {
        if(!left) setFee('failed');
      }
    };

    const message = options.message;
    if(message) {
      // * a message's transfer has no fee until the served record comes
      if(initial.transaction.id) lookup(initial.transaction.id);

      // * a transfer this device still sends: the served message takes the draft's place, or the draft fails
      if(sending) {
        onCleanup(sending.stop);
        sending.attach({
          onSent: (sent) => {
            const next = recordFromMessage(sent);
            setServed(next);
            if(next.transaction.id) lookup(next.transaction.id);
          },
          onError: () => setServed({...record(), status: 'failed'})
        });
      }
    }

    const transaction = () => record().transaction;
    const shownPeer = createMemo(() => displayedPeer(transaction().peer));
    const status = () => record().status;
    const pending = () => status() === 'pending';
    const keyChange = () => !!transaction().pFlags.key_change;
    const peerAddress = () => {
      const peer = shownPeer();
      return peer._ !== 'walletTransactionPeerUnsupported' ? peer.address : undefined;
    };
    // * a transfer to one's own address reads as incoming (iOS)
    const selfTransfer = createMemo(() => isSelfTransfer(transaction(), walletStatus?.state?.address));
    const incoming = () => !!transaction().pFlags.incoming || selfTransfer();
    const nanos = () => absNanos(transaction().amount);
    const amount = createMemo(() => splitAmount(nanos()));
    const sign = () => +nanos() ? (incoming() ? '+' : MINUS) : '';
    const fiat = (value: string, fractionDigits?: number) => {
      return fiatPerGram() ? formatFiat(value, fiatPerGram(), currency, fractionDigits) : '';
    };

    const explorerUrl = () => {
      const hex = transaction().tx_hash && transactionHashHex(transaction().tx_hash);
      const base = appConfig.ton_blockchain_explorer_url || 'https://tonviewer.com';
      return hex && `${base.replace(/\/$/, '')}/transaction/${hex}`;
    };

    const openChat = (peerId: PeerId) => {
      close();
      options.onLeave?.();
      hotReloadGuard.appImManager.setInnerPeer({peerId});
    };

    const sendTo = async(target: WalletSendTarget) => {
      if(options.sendTo) {
        close();
        options.sendTo(target);
        return;
      }

      // * the wallet opens straight on the amount over this popup, which goes once it is there; the send stays in
      // * the wallet (iOS WalletTransactionScreen openSend)
      const {default: showWalletPopup} = await import('@components/wallet');
      await showWalletPopup({send: target.userId ? {userId: target.userId} : {to: target.address}, openChat: false});
      close();
    };

    // * iOS: Send for whoever the transfer went to or came from, a user or an address, but not for a key update
    const sendTarget = (): WalletSendTarget => {
      const peer = shownPeer();
      if(keyChange()) return;
      if(peer._ === 'walletTransactionPeerUser') return {userId: peer.user_id.toUserId()};
      if(peer._ === 'walletTransactionPeerAddress') return {address: peer.address, domain: peer.domain};
    };

    if(options.suggestFirstGrams && initial.transaction.pFlags.incoming && !nft && !initial.transaction.pFlags.key_change) {
      // * iOS: over the transfer once it is on screen, unless it closed before the server answered
      import('@components/wallet/firstGrams').then(({showWalletFirstGramsIfPending}) => {
        return !left && showWalletFirstGramsIfPending(() => !left && show());
      });
    }

    const AddressValue = (props: {address: string}) => {
      const address = displayAddress(props.address);
      return (
        <span
          class={styles.address}
          role="button"
          tabindex={Modes.a11y ? 0 : undefined}
          onClick={() => copyWalletAddress(address, 'Wallet.TonAddressCopied')}
          onKeyDown={buttonKeyDown}
        >
          <WalletAddressGroups address={address} />
        </span>
      );
    };

    const counterparty = (): JSX.Element => {
      const peer = shownPeer();
      if(peer._ === 'walletTransactionPeerUser') {
        const peerId = peer.user_id.toPeerId(false);
        return <TablePeer peerId={peerId} onClick={() => openChat(peerId)} />;
      }

      if(peer._ === 'walletTransactionPeerUnsupported') {
        return i18n('Wallet.Details.UnknownAddress');
      }

      const name = peer._ === 'walletTransactionPeerOnramp' ? walletProviderName(peer.provider_name) : peer.domain;
      return name || <AddressValue address={peer.address} />;
    };

    // * how the transfer goes while it has not settled: after the fiat value, or alone
    const TransferStatus = (props: {alone?: boolean}) => (
      <span class={styles.status} role="status">
        <Animated type="cross-fade" mode="add-remove" noItemClass>
          <Show when={status()} keyed>{(value) => (
            <span class={classNames(
              styles.statusText,
              props.alone && styles.statusAlone,
              value === 'failed' ? styles.statusFailed : styles.statusPending
            )}>
              <Show when={!props.alone}>
                <span class={styles.statusDot} aria-hidden="true">•</span>
              </Show>
              {i18n(value === 'failed' ? 'Wallet.Details.Failed' : 'Wallet.Details.Processing')}
            </span>
          )}</Show>
        </Animated>
      </span>
    );

    const FeeValue = (props: {nanos: string}) => (
      <span>
        <WalletTonAmount nanos={props.nanos} decimals={FEE_DECIMALS} />
        <Show when={fiat(props.nanos)}>
          {' '}<span class={styles.feeFiat}>~ {fiat(props.nanos, FEE_FIAT_DECIMALS)}</span>
        </Show>
      </span>
    );

    // * an incoming transfer was paid for by whoever sent it; a transfer to oneself shows what it cost (iOS)
    const feeContent = (): JSX.Element => {
      if(incoming() && !selfTransfer()) return;
      if(fee() === 'loading') {
        return (
          <>
            <Skeleton.Div secondary class={styles.feeSkeleton} aria-hidden="true" />
            <span class="sr-only">{i18n('Loading')}</span>
          </>
        );
      }

      if(fee() === 'failed') return i18n('Wallet.Details.FeeUnknown');

      const feeNanos = absNanos(transaction().fee);
      if(transaction().pFlags.gasless && !selfTransfer()) {
        const daily = appConfig.wallet_gasless_daily_transfers ?? WALLET_GASLESS_DAILY_DEFAULT;
        return (
          <>
            {i18n('Wallet.Details.FeeFree')}
            <TableButton
              aria-label={I18n.format('Wallet.FeesTitle', true)}
              onClick={() => showGaslessInfo(+feeNanos ? fiat(feeNanos, FEE_FIAT_DECIMALS) : '', daily)}
            >
              ?
            </TableButton>
          </>
        );
      }

      if(+feeNanos) return <FeeValue nanos={feeNanos} />;
    };

    const tableContent = (): TableRow[] => {
      const rows: TableRow[] = [];
      const peer = shownPeer();
      const counterpartyKey: LangPackKey = incoming() ? 'Wallet.Details.Sender' : 'Wallet.Details.Recipient';
      const target = sendTarget();
      const value = counterparty();
      rows.push([counterpartyKey, target ? (
        <>
          {value}
          <span class={classNames(!target.userId && !target.domain && styles.sendTop)}>
            <TableButton text="Wallet.Send" onClick={() => sendTo(target)} />
          </span>
        </>
      ) : value]);

      // * the name the user's address was sent to by (Android)
      if(peer._ === 'walletTransactionPeerUser' && peer.domain) {
        rows.push(['Wallet.Details.Domain', <span dir="ltr">{peer.domain}</span>]);
      }

      // * a name says who; the address under it says where
      const address = peerAddress();
      if(address && peer._ !== 'walletTransactionPeerUnsupported' && (peer._ !== 'walletTransactionPeerAddress' || peer.domain)) {
        rows.push(['Wallet.Details.Address', <AddressValue address={address} />]);
      }

      const feeValue = feeContent();
      if(feeValue) {
        rows.push(['Wallet.Details.Fee', feeValue]);
      }

      if(transaction().date) {
        rows.push(['Wallet.Details.Date', formatFullSentTime(transaction().date, undefined, true)]);
      }

      return rows;
    };

    return (
      <PopupElement
        managers={managers}
        class={styles.popup}
        closable
        old
        show={show()}
        // * left as it starts to close: what was to go over it (Your first Grams) is not shown after
        onClose={() => left = true}
      >
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
          <ButtonMenuToggleTsx
            class={styles.menu}
            icon="more"
            buttonOptions={{ariaLabel: 'MultiAccount.More'}}
            direction="bottom-left"
            buttons={[{
              icon: 'search',
              text: 'Wallet.Menu.Explorer',
              onClick: () => safeWindowOpen(explorerUrl()),
              verify: () => !!explorerUrl()
            }, {
              icon: 'help',
              text: 'Wallet.Menu.WhatGram',
              onClick: showWalletGramInfoPopup,
              verify: () => !nft
            }]}
          />
        </PopupElement.Header>
        <PopupElement.Scrollable>
          <PopupElement.Body class={styles.body}>
            <MediaHeader marginTop marginBottom>
              <Switch>
                <Match when={nft}>
                  <MediaHeader.Sticker
                    size={WALLET_COLLECTIBLE_MEDIA_SIZE}
                    element={() => <WalletCollectibleMedia item={nft} />}
                  />
                  <WalletCollectibleTitle item={nft} />
                  <WalletCollectibleCollection item={nft} fallback={walletNftKindText(nft)} />
                </Match>
                <Match when={keyChange()}>
                  <MediaHeader.Sticker
                    size={KEY_CIRCLE_SIZE}
                    element={<div class={styles.keyCircle} aria-hidden="true"><IconTsx icon="key_filled" /></div>}
                  />
                  <MediaHeader.Title>{i18n('Wallet.Details.KeyUpdate')}</MediaHeader.Title>
                </Match>
                <Match when={true}>
                  <MediaHeader.Sticker name="Gram" size={STICKER_SIZE} />
                  <div
                    class={classNames(
                      styles.amount,
                      incoming() ? styles.incoming : styles.outgoing,
                      pending() && styles.pending,
                      // * a transfer still processing shimmers (iOS); a decoration, so only with the motion
                      pending() && liteMode.isAvailable('motion') && 'shimmer'
                    )}
                    data-popup-title
                    aria-label={`${sign()}${amount().whole}${amount().fraction} GRAM`}
                  >
                    {/* * the signed digits read left to right in either direction; the ticker reads after them */}
                    <span dir="ltr"><span class={styles.whole}>{sign()}{amount().whole}</span>{amount().fraction}</span>
                    <span class={styles.suffix}>GRAM</span>
                  </div>
                  <MediaHeader.Subtitle color="secondary">
                    {fiat(nanos()) || '—'}
                    <TransferStatus />
                  </MediaHeader.Subtitle>
                </Match>
              </Switch>
              {/* * a collectible or a key update has no fiat line for the status to follow: it gets a line of its own */}
              <Show when={(nft || keyChange()) && status()}>
                <MediaHeader.Subtitle color="secondary">
                  <TransferStatus alone />
                </MediaHeader.Subtitle>
              </Show>
              <Show when={transaction().comment?.trim()}>
                <MediaHeader.Subtitle>
                  <TransferComment
                    comment={transaction().comment}
                    encrypted={!!transaction().pFlags.comment_encrypted}
                    decrypt={options.decryptComment && (() => options.decryptComment(transaction()))}
                    decryptOnOpen={options.decryptCommentOnOpen}
                    onElsewhere={close}
                  />
                </MediaHeader.Subtitle>
              </Show>
            </MediaHeader>
            <Table content={tableContent()} />
            <Show when={!nft && !keyChange()}>
              <div class={styles.gramInfo}>
                <span
                  class={styles.gramInfoLink}
                  role="button"
                  tabindex={Modes.a11y ? 0 : undefined}
                  onClick={showWalletGramInfoPopup}
                  onKeyDown={buttonKeyDown}
                >
                  {i18n('Wallet.Details.GramInfo')}
                </span>
              </div>
            </Show>
          </PopupElement.Body>
        </PopupElement.Scrollable>
        <PopupElement.Footer>
          <PopupElement.FooterButton callback={() => options.openWallet?.()}>
            {i18n(options.openWallet ? 'Wallet.Details.OpenWallet' : 'OK')}
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}

/**
 * The comment, as the transfer's description: an encrypted one under a spoiler until a click opens it with the
 * wallet's key (tdesktop's EncryptedCommentLabel). The cover dims while that runs, the text fades in over it, and a
 * failure says why and leaves the cover for another try (iOS).
 */
function TransferComment(props: {
  comment: string,
  encrypted: boolean,
  decrypt?: () => Promise<string | undefined>,
  decryptOnOpen?: boolean,
  onElsewhere: () => void
}) {
  const [plain, setPlain] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  let container: HTMLDivElement, disposed = false;
  onCleanup(() => disposed = true);
  // * another comment (a sent transfer's text became its served payload) is closed again
  createEffect(on(() => props.comment, () => setPlain(undefined), {defer: true}));

  const open = async() => {
    if(busy() || plain() !== undefined || !props.decrypt) return;
    const comment = props.comment;
    setBusy(true);
    try {
      const text = await props.decrypt();
      if(disposed || comment !== props.comment) return;
      if(text === undefined) {
        props.onElsewhere();
      } else {
        setPlain(text);
        keepCommentFocus(container);
      }
    } catch(err) {
      if(disposed) return;
      const {isUserCancel} = await import('@components/wallet/send');
      if(!isUserCancel(err)) showCommentDecryptError(err, open);
    } finally {
      if(!disposed) setBusy(false);
    }
  };

  if(props.decryptOnOpen && props.encrypted) {
    onMount(open);
  }

  const text = () => props.encrypted ? plain() : props.comment.trim();

  return (
    <div ref={container} class={styles.comment} tabindex={Modes.a11y ? -1 : undefined}>
      <AnimationList
        animationOptions={{duration: REVEAL_DURATION, easing: getTransition('standard').easing}}
        keyframes={CROSS_FADE_KEYFRAMES}
        mode="replacement"
      >
        <Show
          when={text() !== undefined}
          fallback={(
            <span
              class={classNames(styles.cover, busy() && styles.coverBusy)}
              role="button"
              tabindex={Modes.a11y ? 0 : undefined}
              aria-label={I18n.format('Wallet.Card.DecryptComment', true)}
              aria-busy={busy() || undefined}
              aria-disabled={busy() || undefined}
              onClick={open}
              onKeyDown={buttonKeyDown}
            >
              {wrapCommentCover('x'.repeat(encryptedCommentCoverLength(props.comment)))}
            </span>
          )}
        >
          <CommentText text={text()} />
        </Show>
      </AnimationList>
    </div>
  );
}

/**
 * A comment's text, selectable: a long one scrolls in its own box, which a keyboard can reach with the a11y layer
 */
function CommentText(props: {text: string}) {
  let scrollable: HTMLDivElement;
  onMount(() => {
    if(!Modes.a11y) return;
    // * read once, after the popup laid it out: only a box that scrolls takes a tab stop
    requestWalletFrame(() => {
      if(scrollable.scrollHeight > scrollable.clientHeight) {
        updateScrollRegionFocusable(scrollable, I18n.format('Wallet.Details.Comment', true));
      }
    });
  });

  return (
    <Scrollable ref={scrollable} class={styles.commentScroll} withBorders="manual" hideThumb>
      <div class={styles.commentText} dir="auto">{wrapEmojiText(props.text)}</div>
    </Scrollable>
  );
}
