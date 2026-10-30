/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '@components/popups/indexTsx';
import {createEffect, createMemo, createRenderEffect, createSignal, createUniqueId, For, JSX, Match, on, onCleanup, onMount, Show, Switch} from 'solid-js';
import bigInt from 'big-integer';
import {i18n} from '@lib/langPack';
import I18n from '@lib/langPack';
import rootScope from '@lib/rootScope';
import liteMode from '@helpers/liteMode';
import shake from '@helpers/dom/shake';
import classNames from '@helpers/string/classNames';
import {formatNanoton, parseNanotonFromDecimal} from '@helpers/paymentsWrapCurrencyAmount';
import {bindActiveWindowListener, getAppWindow} from '@helpers/appWindow';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';
import Currencies from '@config/currencies';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {AvatarNewTsx} from '@components/avatarNew';
import {IconTsx} from '@components/iconTsx';
import A11yButton from '@components/a11yButton';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import type {PopupPeerHandle} from '@components/popups/peer';
import {useWallet} from '@components/wallet/context';
import {copyWalletAddress, WalletHeader, WalletHeaderBalance} from '@components/wallet/parts';
import WalletAddressGroups from '@components/wallet/addressGroups';
import WalletCommentField, {WalletCommentFieldHandle} from '@components/wallet/commentField';
import {addWalletFrameClient} from '@components/wallet/frameLoop';
import {
  canEncryptCommentTo,
  commentBytesLeft,
  isUserCancel,
  loadGaslessRule,
  openWalletRecipientChat,
  prepareWalletSendKey,
  quoteFee,
  showWalletSendError,
  submitWalletTransfer,
  waitForCommentPrivacy,
  WalletSendDraft
} from '@components/wallet/send';
import type {WalletTransferLink} from '@components/wallet/recipient';
import type {WalletConfirmParams} from '@components/wallet/screens/confirm';
import {compareNanos, formatGramsCut, gramsToNumber, groupAddress} from '@components/wallet/format';
import {fiatToNanos, nanosToFiat} from '@components/wallet/fiatAmount';
import {runWalletSendFlight} from '@components/wallet/sendAnimation';
import {clock} from '@components/wallet/visual/clock';
import {AmountEntry, grouped, parseTypedAmount} from '@components/wallet/visual/amount/entry';
import {Digits} from '@components/wallet/visual/amount/digits';
import {RollSegment, RollText} from '@components/wallet/visual/amount/roll';
import {MatrixChip} from '@components/wallet/visual/amount/matrix';
import {AmountScene} from '@components/wallet/visual/amount/scene';
import {AmountIntroClock, AmountIntroFrame, introAlpha, introRise} from '@components/wallet/visual/amount/intro';
import styles from '@components/wallet/screens/amount.module.scss';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/**
 * The amount screen, after the design's «Send Grams Filled» and iOS's send screen: the recipient chip assembles
 * «Matrix»-style while the screen comes in (the gem drops into the amount line, the amount wipes in behind it), the
 * amount is typed with the design's animations (a digit pops in, zero melts into a digit, the gem bounces on every
 * glyph), the pill swaps Grams and the chosen fiat currency on a drum, and Send goes: the gem spins up, and once the
 * transfer went through it flies into the history (sendAnimation). A Telegram user is paid at once, like tdesktop
 * and iOS do; a bare address, and a user found by a .ton name, go through the confirmation screen (Android). The whole
 * balance goes with its fee taken out of it — unless Telegram pays the fee, then all of it goes.
 */

const GRAM_DECIMALS = 9;
/** In fiat the amount rolls back into Grams before it is sent: the drum takes this long. */
const SWAP_SETTLE = 0.54;
const FEE_DEBOUNCE = 400;
const CARET_PAUSE = 500;
/** The fee as iOS writes it: up to five decimals, cut. */
const FEE_DECIMALS = 5;
/** The amount wipes in this far behind the gem's centre, over this much (iOS's reveal ramp, for this gem's size). */
const REVEAL_BEHIND = 10;
const REVEAL_RAMP = 26;
/** The amount starts this far from the line's middle towards the gem, behind it (iOS: to the left). */
const INTRO_TEXT_OFFSET = 64;

const SWAP_ICON_PATH = 'M12.4286 5.5L12.4286 13.5M9.85718 10.9286L12.4286 13.5L15 10.9286M5.57143 13.5L5.57143 5.5M3 8.07143L5.57143 5.5L8.14286 8.07143';

function SwapHalf() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d={SWAP_ICON_PATH} stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** The currency's sign for the gem's place: the native one when it is short, else the code. */
function fiatSymbol(code: string) {
  const data = Currencies[code];
  return [data?.native, data?.symbol].find((value) => value && [...value].length <= 2) || code;
}

function fiatExponent(code: string) {
  return Currencies[code]?.exp ?? 2;
}

/** `1234.50` → `1,234.5`, the way the design's line writes numbers; a whole amount loses its zeros. */
function displayDecimal(text: string) {
  const [whole, tail = ''] = text.split('.');
  const fraction = tail.replace(/0+$/, '');
  return grouped(whole) + (fraction ? '.' + fraction : '');
}

/** `12.5 Grams`, `1 Gram`: an amount with the ticker in its plural */
function gramsText(nanos: string, text: string) {
  return I18n.format('Wallet.GramsAmount', true, [text, I18n.format('Wallet.Card.Ticker', true, [gramsToNumber(nanos)])]);
}

function errorType(error: any): string {
  return error?.type || error?.message || '';
}

/** the element's style as its own window computes it: the tab's, or the Document PiP window's */
function computedStyle(element: HTMLElement) {
  return (element.ownerDocument.defaultView || getAppWindow()).getComputedStyle(element);
}

/** The chip's photo for the «Matrix» decoding: the avatar's picture, or its gradient with the initials. */
function chipAvatarImage(slot: HTMLElement): CanvasImageSource {
  const img = slot.querySelector('img');
  if(img) return img;
  const avatar = slot.firstElementChild as HTMLElement;
  const size = 72;
  const canvas = slot.ownerDocument.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const style = avatar && computedStyle(avatar);
  const top = style?.getPropertyValue('--color-top').trim() || '#ffcd6a';
  const bottom = style?.getPropertyValue('--color-bottom').trim() || '#ffa85c';
  const gradient = g.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const initials = avatar?.textContent.trim();
  if(initials) {
    g.fillStyle = '#fff';
    g.font = `500 ${size * 0.4}px ${style.fontFamily}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(initials, size / 2, size / 2 + 1);
  }

  return canvas;
}

/** Hidden, it is out of the way: no clicks, no tab stop, nothing for a screen reader */
function inertWhen(hidden: () => boolean) {
  return (element: HTMLElement) => createRenderEffect(() => {
    element.inert = hidden();
  });
}

/** A line that comes and goes: it grows into its place and fades in (iOS re-lays the screen around it) */
function Collapse(props: {open: boolean, class?: string, children: JSX.Element}) {
  return (
    <div
      ref={inertWhen(() => !props.open)}
      class={classNames(styles.collapse, props.open && styles.open, props.class)}
    >
      <div class={styles.collapseInner}>{props.children}</div>
    </div>
  );
}

/** «Deposit funds ›»: on to Add Funds */
function DepositLink(props: {onClick: () => void}) {
  return (
    <A11yButton as="span" class={styles.deposit} onClick={props.onClick}>
      {i18n('Wallet.Send.DepositFunds')}
      <IconTsx icon="next" class={styles.depositArrow} />
    </A11yButton>
  );
}

/**
 * The recipient's address the way iOS's alert shows it: four groups of four to a line, the groups in two inks like a
 * checkerboard; a click copies it
 */
function RecipientAddressCard(props: {address: string, onCopy: () => void}) {
  return (
    <A11yButton class={styles.addressCard} onClick={props.onCopy} aria-label={props.address}>
      <WalletAddressGroups address={props.address} mutedClass={styles.addressMuted} />
    </A11yButton>
  );
}

type FeeQuote = {key: string, nanos?: string};
type FeeDisplay = {kind: 'hidden' | 'loading' | 'unavailable'} | {kind: 'value', nanos: string};

export default function WalletAmountScreen(props: {
  /** `fromChat`: started in the recipient's chat, the send ends there (runWalletSendFlight); `openChat`: started by
   * a link or a profile, a send to a Telegram user opens their chat */
  params: WalletTransferLink & {fromChat?: boolean, openChat?: boolean},
  active: () => boolean
}) {
  const wallet = useWallet();
  const store = wallet.store;
  const recipient = props.params.recipient;
  const peerId = recipient.userId ? recipient.userId.toPeerId(false) : undefined;
  // * a user found by a .ton or .t.me name is confirmed like an address: the name is what was asked for (Android)
  const confirms = !peerId || !!recipient.domain;
  // * fades and sizes play at any level that animates; what travels or pops (the chip's decoding, the digits, the
  // * drum, the gem's bounces and flips), only with motion — with reduced animations digits change in place
  const animated = liteMode.isAvailable('animations');
  const motion = animated && liteMode.isAvailable('motion');
  const amountTextId = createUniqueId();

  let root: HTMLDivElement, chip: HTMLDivElement, avatarSlot: HTMLElement, nameEl: HTMLSpanElement,
    nickEl: HTMLSpanElement, addressEl: HTMLElement, matrixCanvas: HTMLCanvasElement, line: HTMLDivElement,
    symbolBox: HTMLSpanElement, slot: HTMLSpanElement, symbolEl: HTMLSpanElement, valueEl: HTMLSpanElement,
    digitsEl: HTMLSpanElement, caret: HTMLSpanElement, codeEl: HTMLSpanElement, input: HTMLInputElement,
    pillTextEl: HTMLSpanElement, arrows: HTMLSpanElement, layer: HTMLDivElement, glow: HTMLDivElement,
    ring: HTMLDivElement, gemCanvas: HTMLCanvasElement, probeGram: HTMLSpanElement, probeFiat: HTMLSpanElement,
    probeMuted: HTMLSpanElement, summary: HTMLDivElement, sendButton: HTMLButtonElement, amountBlock: HTMLDivElement;

  const [fiatMode, setFiatMode] = createSignal(false);
  const [nanos, setNanos] = createSignal('0');
  // * an amount typed here, not one a link brought: only such an amount may be the whole balance (iOS)
  const [manual, setManual] = createSignal(!props.params.nanograms);
  const [entryDecimal, setEntryDecimal] = createSignal('0');
  const [comment, setComment] = createSignal(props.params.comment || '');
  const [makePublic, setMakePublic] = createSignal(!!props.params.publicComment);
  // * whether the recipient can read a private comment: unknown until checked, and meanwhile the comment is no
  // * private one — the screen claims neither, a send waits for the answer (Android: no key, no encryption)
  const [canEncrypt, setCanEncrypt] = createSignal<boolean>();
  const [gaslessRule, setGaslessRule] = createSignal<(nanograms: string) => boolean>();
  const [feeQuote, setFeeQuote] = createSignal<FeeQuote>();
  const [lastFee, setLastFee] = createSignal<FeeQuote>();
  const [busy, setBusy] = createSignal(false);
  /** a send waits for whether a private comment can go: the button spins, nothing else changes */
  const [checking, setChecking] = createSignal(false);
  const [title, setTitle] = createSignal('');
  const [firstName, setFirstName] = createSignal('');
  const [nick, setNick] = createSignal('');
  const [chipReady, setChipReady] = createSignal(!peerId);
  const [amountText, setAmountText] = createSignal('');
  const [hasScene, setHasScene] = createSignal(false);

  let digits: Digits, codeRoll: RollText, pillRoll: RollText, matrix: MatrixChip, scene: AmountScene;
  let intro: AmountIntroClock;
  let commentField: WalletCommentFieldHandle;
  let entry = new AmountEntry('0', null, GRAM_DECIMALS);
  let converted = false;
  let pillShown: RollSegment[];
  let opened = false, matrixPlaying = false, matrixPlayed = !motion, arming = false, disposed = false;
  // * the entrance's travel, mirrored right to left: the gem stands at the line's inline start
  let introReflect = 1;
  let caretTimer: number, feeTimer: number, armTimer: number, feeRevision = 0;

  const status = () => store.status();
  /** the balance is known: a wallet that is still loading shows none, and no deposit link either */
  const balanceKnown = () => status().presence === 'ready' && !!status().state;
  // * a memo: the status is a new object on every poll, the balance mostly the same
  const balance = createMemo(() => String(status().state?.balance ?? 0));
  const rate = () => store.fiatPerGram();
  const code = () => fiatMode() ? store.currency() : 'GRAM';
  const hasAmount = createMemo(() => compareNanos(nanos(), '0') > 0);
  const positiveBalance = () => balanceKnown() && compareNanos(balance(), '0') > 0;
  const zeroBalance = () => balanceKnown() && !positiveBalance();
  const exceedsBalance = createMemo(() => compareNanos(nanos(), balance()) > 0);
  const tooSmall = createMemo(() => hasAmount() && compareNanos(nanos(), store.config().minNanos) < 0);
  const encrypting = () => !!comment().trim() && canEncrypt() === true && !makePublic();
  /** past the limit: the counter is red and nothing is sent (tdesktop) */
  const commentTooLong = createMemo(() => commentBytesLeft(comment()) < 0);
  /** Telegram pays the fee of this amount */
  const free = createMemo(() => !!gaslessRule()?.(nanos()));
  // * the whole balance, typed here and not fee-free: everything goes and the fee comes out of it. One Telegram pays
  // * the fee of goes in full as an exact amount, the relayer's fee none of it (iOS prepareTransfer, tdesktop)
  const sendAll = createMemo(() => manual() && hasAmount() && compareNanos(nanos(), balance()) === 0 && !free());

  // * the fee depends on the amount only a little, on the comment much: a new amount keeps showing the last fee
  // * for the same comment while it is quoted again
  const commentKey = () => `${comment().trim()}|${encrypting()}|${sendAll()}`;
  const feeKey = createMemo(() => `${nanos()}|${commentKey()}`);
  const quotedFee = () => {
    const quote = feeQuote();
    return quote?.key === feeKey() ? quote : undefined;
  };

  // * more than there is — or not enough left for the fee next to it, or for the whole balance not even the fee
  const insufficient = createMemo(() => {
    if(!balanceKnown() || !hasAmount()) return false;
    if(exceedsBalance()) return true;
    const fee = quotedFee()?.nanos;
    if(!fee) return false;
    if(sendAll()) return compareNanos(fee, nanos()) >= 0;
    return !free() && compareNanos(bigInt(nanos()).add(bigInt(fee)).toString(), balance()) > 0;
  });

  const feeDisplay = createMemo((): FeeDisplay => {
    // * iOS: no fee line until it knows who pays it, none when Telegram does
    if(!balanceKnown() || !hasAmount() || exceedsBalance() || tooSmall() || !gaslessRule()) return {kind: 'hidden'};
    if(free() && !sendAll()) return {kind: 'hidden'};
    const quote = quotedFee();
    if(quote) {
      if(!quote.nanos) return {kind: 'unavailable'};
      return quote.nanos === '0' ? {kind: 'hidden'} : {kind: 'value', nanos: quote.nanos};
    }

    const last = lastFee();
    return last?.key === commentKey() && last.nanos ? {kind: 'value', nanos: last.nanos} : {kind: 'loading'};
  });
  // * what the fee line says: the last of it stays while the line fades away
  const feeShown = createMemo<FeeDisplay>((prev) => feeDisplay().kind === 'hidden' ? prev : feeDisplay(), {kind: 'loading'});

  // * the deposit link: in place of the balance when there is none, after "Insufficient funds." otherwise (iOS)
  const showDeposit = () => balanceKnown() && (zeroBalance() || insufficient() || (!hasAmount() && !positiveBalance()));
  const depositInline = () => !zeroBalance() && (hasAmount() || positiveBalance());
  const showBalance = () => balanceKnown() && (hasAmount() || positiveBalance()) && !zeroBalance();
  const showRate = () => hasAmount() && !!rate();

  const canSend = () => hasAmount() &&
    balanceKnown() &&
    !insufficient() &&
    !commentTooLong() &&
    !busy() &&
    !checking() &&
    status().presence === 'ready';

  // MARK: The recipient

  const addressLines = groupAddress(recipient.address, 6).slice(0, 2).map((line) => line.split(' '));
  if(peerId) {
    Promise.all([
      getPeerTitle({peerId, plainText: true}),
      getPeerTitle({peerId, plainText: true, onlyFirstName: true}),
      rootScope.managers.appPeersManager.getPeerUsername(peerId)
    ]).then(([peerTitle, peerFirstName, username]) => {
      if(disposed) return;
      setTitle(peerTitle);
      setFirstName(peerFirstName);
      setNick(username ? '@' + username : '');
      setChipReady(true);
    }, () => setChipReady(true));
  } else {
    setTitle(recipient.domain || I18n.format('Wallet.Recipient.Address', true));
  }

  let encryptionCheck: Promise<boolean>;
  const checkEncryption = () => {
    encryptionCheck ??= canEncryptCommentTo(store, recipient);
    encryptionCheck.then((value) => {
      if(!disposed) setCanEncrypt(value);
    });
    return encryptionCheck;
  };

  // * tdesktop: a comment is private by default; where no key can be found for the recipient it becomes public.
  // * Who pays the fee is asked once, then known for any amount as it is typed (iOS)
  createEffect(on(() => store.status().presence === 'ready', (ready) => {
    if(!ready) return;
    checkEncryption();
    loadGaslessRule(store, recipient).then((rule) => {
      if(!disposed) setGaslessRule(() => rule);
    });
  }));

  const openChat = () => {
    if(!peerId || busy()) return;
    wallet.close();
    hotReloadGuard.appImManager.setInnerPeer({peerId});
  };

  const copyAddress = () => copyWalletAddress(recipient.address, 'Wallet.TonAddressCopied');

  /** ⓘ: whose wallet this is — a Telegram user's, linked to their account, or an address of nobody known (iOS) */
  const showRecipientInfo = async() => {
    if(busy()) return;
    const {default: confirmationPopup} = await import('@components/confirmationPopup');
    let handle: PopupPeerHandle;
    const then = (action: () => void) => () => {
      handle?.hide();
      action();
    };

    let description: HTMLElement;
    if(peerId) {
      const link = getAppWindow().document.createElement('a');
      link.classList.add(styles.recipientLink);
      link.textContent = nick() || title();
      link.addEventListener('click', then(openChat));
      description = i18n('Wallet.Recipient.LinkedAddress', [link]);
    } else {
      description = i18n('Wallet.Recipient.UnlinkedAddress');
    }

    confirmationPopup({
      title: peerId ?
        I18n.format('Wallet.Send.RecipientWallet', true, [firstName() || title()]) :
        I18n.format('Wallet.Send.UnlinkedWallet', true),
      description,
      content: <RecipientAddressCard address={recipient.address} onCopy={then(copyAddress)} />,
      button: {langKey: 'OK', isCancel: true},
      onPopup: (popup) => handle = popup
    }).catch(() => {});
  };

  // MARK: Amount entry

  // * exact decimals both ways (fiatAmount): no float stands between what is typed, shown and sent
  const fiatEntry = (n: string, roundUp?: boolean) => {
    const exp = fiatExponent(store.currency());
    // * a minimum in fiat goes up to the next cent: rounded down it would be under it again
    return AmountEntry.fromDecimal(nanosToFiat(n, rate(), exp, roundUp ? 'up' : 'halfUp'), exp);
  };

  const gramEntry = (n: string) => AmountEntry.fromDecimal(formatNanoton(n, GRAM_DECIMALS, false), GRAM_DECIMALS);

  // * typed in fiat, Grams go in whole hundredths (Android): the button says them to the last digit
  const entryNanos = () => fiatMode() ?
    fiatToNanos(entry.decimal, rate()) :
    parseNanotonFromDecimal(entry.decimal).toString();

  const syncNanos = () => {
    // * a swap only shows the amount in the other unit: what is sent stays as it was until something is typed (iOS)
    if(!converted) setNanos(entryNanos());
    setEntryDecimal(entry.decimal);
  };

  const colorOf = (probe: HTMLElement) => computedStyle(probe).color;

  /** The pill: the amount in the other unit — prefix, integer part, fraction, code; in fiat the gem stands for GRAM. */
  const pillSegments = (): RollSegment[] => {
    const inGrams = !fiatMode();
    // * iOS: the Grams in the pill have two decimals at most
    const text = inGrams ?
      displayDecimal(nanosToFiat(nanos(), rate(), fiatExponent(store.currency()))) :
      formatNanoton(nanos(), 2, true);
    const dot = text.indexOf('.');
    return [
      {text: inGrams ? '~' : '', letters: true},
      {text: dot < 0 ? text : text.slice(0, dot), align: 'right'},
      {text: dot < 0 ? '' : text.slice(dot)},
      {text: inGrams ? ' ' : ''},
      {text: inGrams ? store.currency() : '', letters: true}
    ];
  };

  const renderPill = () => {
    const segments = pillSegments();
    pillRoll.set(segments.map((segment) => segment.text).join(''));
    pillShown = segments;
  };

  const renderAmount = (mode: 'type' | 'spin', instant = false, up = true) => {
    digits.set(entry.integerText, entry.fractionText, mode, up, instant || !motion);
    const segments = pillSegments();
    if(mode === 'spin' && !instant && motion) {
      const muted = colorOf(probeMuted);
      pillRoll.spin(pillShown || segments, segments, {up, colorFrom: muted, colorTo: muted, start: clock.now()});
    } else {
      pillRoll.set(segments.map((segment) => segment.text).join(''));
    }

    pillShown = segments;
    setAmountText(`${entry.integerText}${entry.fractionText} ${code()}`);
  };

  /** The amount changed: the gem and the sign bounce, the caret stays lit. */
  const changedNow = () => {
    scene?.changedNow();
    caret.classList.add(styles.typing);
    clearTimeout(caretTimer);
    caretTimer = window.setTimeout(() => caret.classList.remove(styles.typing), CARET_PAUSE);
  };

  /** A refusal: the line shakes its head. */
  const refuse = () => {
    navigator.vibrate?.([12, 60, 10]);
    if(!motion) return;
    line.animate([...Array(13)].map((_, i) => {
      const t = i / 12;
      return {translate: `${9 * Math.sin(t * Math.PI * 6) * (1 - t)}px 0`};
    }), {duration: 420});
  };

  /**
   * Under the minimum the amount goes up to it and the line shakes (iOS: as Grams are typed, and on send in fiat).
   * False when it had to.
   */
  const snapToMinimum = () => {
    if(!tooSmall()) return true;
    const min = store.config().minNanos;
    entry = fiatMode() ? fiatEntry(min, true) : gramEntry(min);
    converted = false;
    syncNanos();
    changedNow();
    renderAmount('type');
    navigator.vibrate?.([12, 60, 10]);
    if(motion) shake(line);
    return false;
  };

  const maxFraction = () => fiatMode() ? fiatExponent(store.currency()) : GRAM_DECIMALS;

  /** Typed: the amount is the person's own now, and in Grams it is never under the minimum */
  const typed = () => {
    setManual(true);
    syncNanos();
    changedNow();
    renderAmount('type');
    if(!fiatMode()) snapToMinimum();
  };

  const typeDigit = (d: string) => {
    if(converted) {
      converted = false;
      entry = new AmountEntry(d, null, maxFraction());
    } else if(!entry.acceptsDigit) {
      return refuse();
    } else {
      entry.append(d);
    }

    // * a big digit pushes a little harder — it is a hit, not a switch
    scene?.kick(-(5.5 + 0.25 * Number(d)), 0.7);
    typed();
  };

  const typePoint = () => {
    if(converted && maxFraction() > 0) {
      converted = false;
      entry = new AmountEntry('0', '', maxFraction());
    } else if(!entry.acceptsPoint) {
      return refuse();
    } else {
      entry.startFraction();
    }

    scene?.kick(-3.5, 0.7);
    typed();
  };

  /**
   * A paste, a drop or an autofill: the number read as a whole (parseTypedAmount) and typed in one go, under the
   * same limits as keys; a part that would not be taken refuses it all — an amount is never cut to something else
   */
  const typeText = (text: string) => {
    const typedText = parseTypedAmount(text);
    // * after a swap the typing starts over, as with a key
    const next = typedText !== null && (converted ? new AmountEntry('0', null, maxFraction()) : entry).typed(typedText);
    if(!next) return refuse();
    converted = false;
    entry = next;
    scene?.kick(-8, 0.7);
    typed();
  };

  const erase = () => {
    if(!converted && entry.isZero) return refuse();
    converted = false;
    entry.deleteBackward();
    // * erasing spins the other way — with the same body
    scene?.kick(6.5, 0.7);
    setManual(true);
    syncNanos();
    changedNow();
    renderAmount('type', false, false);
  };

  /** A currency swap: the number rolls on a drum, the sign flips, the gem spins the way the number goes. */
  const swap = () => {
    if(busy() || arming || !opened || !rate()) return;
    intro?.fastForward(clock.now());
    const toFiat = !fiatMode();
    const next = toFiat ? fiatEntry(nanos()) : gramEntry(nanos());
    const up = Number(next.decimal) >= Number(entry.decimal);
    if(scene) scene.swap(up);
    setFiatMode(toFiat);
    entry = next;
    converted = true;
    syncNanos();
    changedNow();
    renderAmount('spin', false, up);
    // * the code rolls on the same drum, letter by letter, its colour in the same phase
    const currency = store.currency();
    const from = toFiat ? 'GRAM' : currency, to = toFiat ? currency : 'GRAM';
    const colorTo = colorOf(toFiat ? probeFiat : probeGram);
    if(motion) {
      codeRoll.spin([{text: from, letters: true}], [{text: to, letters: true}], {
        up, colorFrom: colorOf(toFiat ? probeGram : probeFiat), colorTo, start: clock.now()
      });
    } else {
      codeRoll.set(to, colorTo);
    }

    caret.classList.toggle(styles.fiat, toFiat);
  };

  // MARK: Send

  const makeDraft = (): WalletSendDraft => {
    const text = comment().trim();
    return {
      recipient,
      nanograms: nanos(),
      comment: text || undefined,
      encryptComment: text ? encrypting() : undefined,
      payload: text ? undefined : props.params.payload,
      expiresAt: props.params.expiresAt,
      sendAll: sendAll() || undefined
    };
  };

  /** The draft as it goes: fee-free the way the screen said, a whole balance less the fee it showed */
  const finalDraft = (): WalletSendDraft => {
    const fee = quotedFee()?.nanos || (lastFee()?.key === commentKey() ? lastFee().nanos : undefined);
    // * before the screen knows who pays, the send finds out itself
    return {...makeDraft(), gasless: gaslessRule() ? free() : undefined, fee};
  };

  const send = async() => {
    const draft = finalDraft();
    setBusy(true);
    input.blur();
    try {
      // * the gem spins up and bursts only where things move: otherwise the button's spinner is what goes on
      if(motion) scene?.charge();
      const pending = await submitWalletTransfer(store, draft);
      const fromChat = props.params.fromChat;
      // * a link's or a profile's send to a Telegram user ends in their chat (iOS: no flight for those)
      if(props.params.openChat && peerId && !fromChat) {
        openWalletRecipientChat(wallet, peerId);
        return;
      }

      if(disposed || !scene || scene.sendStart === null) {
        runWalletSendFlight(wallet, {pending, fromChat});
        return;
      }

      scene.requestLaunch((launch) => runWalletSendFlight(wallet, {pending, launch, fromChat}));
    } catch(err) {
      // * the user may have left the screen meanwhile: a refusal is still worth telling
      if(disposed) {
        if(!isUserCancel(err)) showWalletSendError(err);
        return;
      }

      setBusy(false);
      scene?.cancelCharge();
      if(isUserCancel(err)) return;
      if(errorType(err) === 'WALLET_KEY_MISSING') {
        wallet.router.push('restore');
        return;
      }

      showWalletSendError(err);
    }
  };

  /**
   * The comment was private when the send went on its way and is public now: a check that hung and answered late,
   * while the key was asked for or the amount rolled into Grams. It is not sent so — the screen says it is public
   * now, and Send is pressed again (as on the confirmation screen)
   */
  const wentPublic = (armedPrivate: boolean) => armedPrivate && !encrypting();

  /**
   * Send pressed: the amount and the comment checked, what is not known yet waited for, then the confirmation or the
   * send. `keyReady`: the key was seen to already; `armedPrivate`: whether the comment was private once its privacy
   * was known
   */
  const commit = (keyReady?: boolean, armedPrivate?: boolean) => {
    if(busy() || arming || !opened) return;
    if(!snapToMinimum()) return;
    if(commentTooLong()) {
      commentField?.refuse();
      return;
    }

    if(!canSend()) {
      return refuse();
    }

    // * a comment whose privacy is not known yet waits for it; one that turns out public is not sent before the
    // * screen said so
    if(comment().trim() && canEncrypt() === undefined && !makePublic()) {
      arming = true;
      setChecking(true);
      waitForCommentPrivacy(checkEncryption()).then((value) => {
        arming = false;
        if(disposed) return;
        setChecking(false);
        if(canEncrypt() === undefined) setCanEncrypt(value);
        if(value) commit(keyReady);
      });
      return;
    }

    armedPrivate ??= encrypting();
    if(wentPublic(armedPrivate)) return;

    // * a device that cannot sign gets the key first — the password asked for, or the phrase to type — before the
    // * confirmation (iOS performSend) or before the gem spins up (resolveSigningAccess)
    if(!keyReady && store.deviceMode() !== 'full') {
      arming = true;
      setChecking(true);
      prepareWalletSendKey(wallet).then((ready) => {
        arming = false;
        if(disposed) return;
        setChecking(false);
        if(ready) commit(true, armedPrivate);
      });
      return;
    }

    // * a bare address, or a name, is confirmed on its own screen; a Telegram user is paid at once, like in tdesktop
    if(confirms) {
      const params: WalletConfirmParams = {
        ...finalDraft(),
        canEncrypt: canEncrypt(),
        linkPayload: props.params.payload,
        openChat: props.params.openChat && !props.params.fromChat
      };
      wallet.router.push('confirm', params);
      return;
    }

    // * Grams are always sent: an amount in fiat rolls back into Grams first. The send waits on a real timer, not
    // * the wallet's clock: that one only ticks in frames, which stop while the page is hidden. With reduced
    // * animations the amount changes in place, nothing to wait for
    if(fiatMode() && animated) {
      swap();
      if(!motion) {
        send();
        return;
      }

      arming = true;
      armTimer = window.setTimeout(() => {
        arming = false;
        if(!disposed && !wentPublic(armedPrivate)) send();
      }, SWAP_SETTLE * 1000);
      return;
    }

    send();
  };

  const handle = (kind: 'digit' | 'point' | 'text' | 'erase' | 'send', data?: string) => {
    if(!opened || busy() || arming) return;
    intro?.fastForward(clock.now());
    if(kind === 'digit') typeDigit(data);
    else if(kind === 'point') typePoint();
    else if(kind === 'text') typeText(data);
    else if(kind === 'erase') erase();
    else commit();
  };

  // MARK: Fee

  createEffect(on([feeKey, gaslessRule, balanceKnown, balance], () => {
    clearTimeout(feeTimer);
    const revision = ++feeRevision;
    if(!gaslessRule() || !balanceKnown() || !hasAmount() || exceedsBalance() || tooSmall() || (free() && !sendAll())) {
      return;
    }

    const key = feeKey(), lastKey = commentKey();
    feeTimer = window.setTimeout(async() => {
      const quoted = await quoteFee(store, makeDraft()).then((value) => String(value), (): string => undefined);
      if(revision !== feeRevision || disposed) return;
      setFeeQuote({key, nanos: quoted});
      if(quoted) setLastFee({key: lastKey, nanos: quoted});
    }, FEE_DEBOUNCE);
  }));

  // * a new rate: the pill and, for fiat typed, the amount in Grams follow it; fiat only shown for Grams follows them
  createEffect(on([rate, () => store.currency()], () => {
    if(!opened) return;
    if(converted && fiatMode()) {
      entry = fiatEntry(nanos());
      renderAmount('type', true);
    }

    syncNanos();
    renderPill();
  }, {defer: true}));

  // MARK: The entrance

  /** The entrance at this frame (intro.ts); null puts everything where it rests */
  const applyIntro = (frame: AmountIntroFrame) => {
    if(!frame) {
      intro = undefined;
      scene?.setOpening(null);
      caret.classList.remove(styles.opening);
      for(const element of [valueEl, caret, chip, summary, sendButton]) {
        ['opacity', 'translate', 'scale', 'mask-image', '-webkit-mask-image'].forEach((name) => element?.style.removeProperty(name));
      }

      return;
    }

    chip.style.translate = `0 ${26 * frame.chip}px`;
    chip.style.scale = String(1 - 0.07 * frame.chip);
    // * the amount's part is over (1.2 s): only the chip still settles
    if(frame.progress === 1 && frame.caret === 1) {
      if(!caret.classList.contains(styles.opening)) return;
      scene?.setOpening(null);
      caret.classList.remove(styles.opening);
      for(const element of [valueEl, caret, summary, sendButton]) {
        ['opacity', 'translate', 'mask-image', '-webkit-mask-image'].forEach((name) => element?.style.removeProperty(name));
      }

      return;
    }

    caret.classList.add(styles.opening);
    caret.style.opacity = String(frame.caret);
    const rise = `0 ${introRise(frame.progress)}px`;
    summary.style.translate = rise;
    if(sendButton) sendButton.style.translate = rise;

    valueEl.style.opacity = String(introAlpha(frame.progress));
    if(!scene) return;
    // * the amount comes from behind the gem, wiped in after it (right of it, left of it right to left) as the gem
    // * goes to its place. The offsets are the line's own, physical: the wipe starts at the amount's edge by the gem
    scene.setOpening(frame.progress);
    const p = frame.progress, r = introReflect;
    const lineWidth = line.offsetWidth;
    const valueLeft = valueEl.offsetLeft, valueWidth = valueEl.offsetWidth;
    const slotX = symbolBox.offsetLeft + symbolBox.offsetWidth / 2;
    const gemX = lineWidth / 2 + (slotX - lineWidth / 2) * p;
    const shift = (lineWidth / 2 - r * INTRO_TEXT_OFFSET - (valueLeft + valueWidth / 2)) * (1 - p);
    const edge = valueLeft + shift + (r > 0 ? 0 : valueWidth);
    const from = r * (gemX - r * REVEAL_BEHIND - edge);
    const mask = `linear-gradient(to ${r > 0 ? 'right' : 'left'}, transparent ${from}px, #000 ${from + REVEAL_RAMP}px)`;
    valueEl.style.translate = `${shift}px 0`;
    valueEl.style.setProperty('mask-image', mask);
    valueEl.style.setProperty('-webkit-mask-image', mask);
  };

  // MARK: Frames

  const openNow = () => {
    opened = true;
    entry = props.params.nanograms ? gramEntry(props.params.nanograms) : new AmountEntry('0', null, GRAM_DECIMALS);
    converted = false;
    scene?.setGramMode(true);
    scene?.open();
    syncNanos();
    renderAmount('type', true);
    codeRoll.set('GRAM', '');
    input.focus({preventScroll: true});
    root.ownerDocument.fonts?.ready.then(() => {
      if(!disposed) digits.remeasure();
    });

    // * the entrance is all travel (the gem's drop, the wipe, the rise): with reduced animations the screen comes in
    // * by the window's own cross-fade, at rest
    if(motion) {
      introReflect = isDocumentRTL(root.ownerDocument) ? -1 : 1;
      intro = new AmountIntroClock(clock.now());
    }
  };

  const playMatrix = () => {
    matrixPlayed = true;
    try {
      matrix.play({address: groupAddress(recipient.address).join(' ')}, chipAvatarImage(avatarSlot));
      matrixPlaying = true;
    } catch(err) {
      chip.classList.remove('assembling');
    }
  };

  const frame = (now: number) => {
    if(!opened) {
      // * the first frame the screen is laid out in: widths are measured from it
      if(!root.offsetWidth) return;
      openNow();
    }

    scene?.measure();
    if(intro) applyIntro(intro.frame(now));
    if(!matrixPlayed && chipReady()) playMatrix();
    if(matrixPlaying) matrixPlaying = matrix.frame(now);
    digits.tick(now);
    codeRoll.frame(now);
    pillRoll.frame(now);
    scene?.frame(now);
  };

  onMount(() => {
    digits = new Digits(digitsEl);
    codeRoll = new RollText(codeEl, {pitch: 32 * 0.71 * 0.8});
    pillRoll = new RollText(pillTextEl, {pitch: 13 * 0.71 * 0.8});
    matrix = new MatrixChip({chip, canvas: matrixCanvas, name: nameEl, nick: nickEl, address: addressEl, avatarSlot});
    if(motion) chip.classList.add('assembling');
    if(animated) {
      try {
        scene = new AmountScene({
          root, line, slot, symbol: symbolEl, code: codeEl, layer, glow, ring, gem: gemCanvas,
          arrows: [...arrows.children] as SVGElement[]
        }, {
          digits,
          motion,
          onFocus: () => input.focus({preventScroll: true}),
          // * holding grows the gem fourfold over the amount: a zoom, only where things may move
          canHold: () => motion && !fiatMode() && !busy()
        });
      } catch(err) {
        console.warn('wallet: the amount gem is flat, no WebGL2', err);
      }
    }

    setHasScene(!!scene);

    // * a key brings one character; more at once is a paste, a drop or an autofill: a number read as a whole
    const onInput = () => {
      const text = input.value;
      input.value = '';
      if([...text].length > 1) {
        handle('text', text);
        return;
      }

      if(/\d/.test(text)) handle('digit', text);
      else if(text === '.' || text === ',') handle('point');
    };

    const onInputKey = (e: KeyboardEvent) => {
      if(e.key === 'Enter') {
        // * the Enter that picks an IME candidate, or one held down, is no send
        if(isImeOrRepeat(e)) return;
        e.preventDefault();
        handle('send');
      } else if(e.key === 'Backspace') {
        e.preventDefault();
        handle('erase');
      }
    };

    // * typing with the focus nowhere in particular goes into the amount too — never into another control
    const onDocumentKey = (e: KeyboardEvent) => {
      if(!props.active() || !wallet.shown() || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if(target === input) return;
      if(target && target !== target.ownerDocument?.body && !root.contains(target)) return;
      if(target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="button"], [role="checkbox"]')) return;
      if(/^\d$/.test(e.key)) {
        e.preventDefault();
        handle('digit', e.key);
      } else if(e.key === '.' || e.key === ',') {
        e.preventDefault();
        handle('point');
      } else if(e.key === 'Backspace') {
        e.preventDefault();
        handle('erase');
      }
    };

    // * a touch anywhere on the screen plays the rest of the entrance out at once (iOS)
    const onPointerDown = () => intro?.fastForward(clock.now());

    // * a long amount scales down to the width there is, centred, as iOS fits its text. The observer hands over the
    // * layout's own sizes when they change (a scale does not change them): nothing is measured here, per frame or not
    let lineWidth = 0, roomWidth = 0;
    const fit = new ResizeObserver((entries) => {
      for(const entry of entries) {
        const own = entry.target === line;
        const size = (own ? entry.borderBoxSize : entry.contentBoxSize)?.[0];
        const width = size ? size.inlineSize : entry.contentRect.width;
        if(own) lineWidth = width;
        else roomWidth = width;
      }

      const scale = roomWidth && lineWidth > roomWidth ? roomWidth / lineWidth : 1;
      line.style.scale = scale === 1 ? '' : String(scale);
      if(scene) scene.lineScale = scale;
    });
    fit.observe(line);
    fit.observe(amountBlock);

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onInputKey);
    // * the document the app is in: the tab's, or the Document PiP window's once it moved there
    const unbindDocumentKey = bindActiveWindowListener((win) => win.document, 'keydown', onDocumentKey);
    root.addEventListener('pointerdown', onPointerDown, true);

    const detach = addWalletFrameClient({
      frame,
      isVisible: () => props.active() && wallet.shown(),
      isBusy: () => !!scene?.busy || !!intro || matrixPlaying || codeRoll.spinning || pillRoll.spinning,
      onHidden: () => scene?.gem.resetClock()
    });

    onCleanup(() => {
      disposed = true;
      detach();
      fit.disconnect();
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onInputKey);
      unbindDocumentKey();
      root.removeEventListener('pointerdown', onPointerDown, true);
      clearTimeout(caretTimer);
      clearTimeout(feeTimer);
      clearTimeout(armTimer);
      scene?.destroy();
      matrix.destroy();
      codeRoll.destroy();
      pillRoll.destroy();
      digits.destroy();
    });
  });

  // * without the gem's canvas the gem is the icon, and the sign simply takes its place
  createEffect(() => {
    if(hasScene()) return;
    symbolEl.style.opacity = fiatMode() ? '1' : '0';
  });

  // MARK: Layout

  /**
   * "Send 12.5 Grams" to a Telegram user, with the fiat it was typed in under it; "Continue" for what is confirmed.
   * The Grams to the last digit: what the button says is what goes (fiat typed is in whole hundredths of a Gram)
   */
  const sendTitle = (): string => {
    if(confirms) return I18n.format('Wallet.Continue', true);
    const amount = hasAmount() ?
      gramsText(nanos(), formatNanoton(nanos(), GRAM_DECIMALS, true)) :
      I18n.format('Wallet.Card.Ticker', true, [0]);
    return I18n.format('Wallet.Send.Amount', true, [amount]);
  };

  const sendSubtitle = (): string => {
    if(confirms || !hasAmount() || !fiatMode()) return '';
    return '~' + displayDecimal(entryDecimal()) + ' ' + store.currency();
  };

  // * the subtitle keeps its last text while it fades out
  let lastSubtitle = '';
  const shownSubtitle = () => sendSubtitle() || lastSubtitle;
  createEffect(() => {
    if(sendSubtitle()) lastSubtitle = sendSubtitle();
  });

  return (
    <div ref={root} class={styles.root}>
      <WalletHeader title="Wallet.SendTitle" back>
        <WalletHeaderBalance nanos={balance()} />
      </WalletHeader>

      <div class={styles.body}>
        <div ref={chip} class={styles.chip}>
          <Show
            when={peerId}
            fallback={
              <span ref={avatarSlot} class={styles.chipAvatar}>
                <span class={styles.chipBadge}><IconTsx icon="arrow_up_circle_filled" /></span>
              </span>
            }
          >
            <A11yButton
              ref={avatarSlot}
              as="span"
              class={classNames(styles.chipAvatar, styles.clickable)}
              aria-label={title()}
              onClick={openChat}
            >
              <AvatarNewTsx peerId={peerId} size={36} />
            </A11yButton>
          </Show>
          <div class={styles.chipBody}>
            <div class={styles.chipLabel}>
              <span ref={nameEl} class={styles.chipName} dir="auto">{title()}</span>
              <span ref={nickEl} class={styles.chipNick} dir="ltr">{nick()}</span>
            </div>
            <A11yButton
              ref={addressEl}
              class={classNames(styles.chipAddress, styles.clickable)}
              dir="ltr"
              aria-label={recipient.address}
              onClick={copyAddress}
            >
              <For each={addressLines}>{(lineGroups, row) => (
                <>
                  {row() > 0 && '\n'}
                  <For each={lineGroups}>{(group, index) => (
                    <>{index() > 0 && ' '}{(index() + row()) % 2 === 1 ? <b>{group}</b> : group}</>
                  )}</For>
                </>
              )}</For>
            </A11yButton>
          </div>
          <button
            type="button"
            class={classNames('btn-icon', styles.chipHelp)}
            aria-label={I18n.format(peerId ? 'Wallet.Send.RecipientWallet' : 'Wallet.Send.UnlinkedWallet', true, [firstName() || title()])}
            onClick={showRecipientInfo}
          >
            <IconTsx icon="info" />
          </button>
          <canvas ref={matrixCanvas} class={styles.chipMatrix} aria-hidden="true" />
        </div>

        <div ref={amountBlock} class={styles.amountBlock}>
          <div ref={line} class={styles.amountLine}>
            <span ref={symbolBox} class={styles.amountSymbol} aria-hidden="true">
              <span ref={slot} class={styles.amountGemSlot}>
                <Show when={!hasScene()}>
                  <IconTsx icon="gram_filled" class={styles.amountGemIcon} style={{opacity: fiatMode() ? 0 : 1}} />
                </Show>
              </span>
              <span
                ref={symbolEl}
                class={classNames(styles.amountFiatSymbol, [...fiatSymbol(store.currency())].length > 1 && styles.small)}
              >
                {fiatSymbol(store.currency())}
              </span>
            </span>
            {/* * the amount and its code read left to right in any layout; the gem stands at the line's inline start */}
            <span ref={valueEl} class={styles.amountValue} dir="ltr" aria-hidden="true">
              <span ref={digitsEl} class={styles.amountDigits} />
              <span ref={caret} class={styles.amountCaret} />
              <span ref={codeEl} class={styles.amountCode}>GRAM</span>
            </span>
            <input
              ref={input}
              class={styles.amountInput}
              inputmode="decimal"
              autocomplete="off"
              aria-label={I18n.format('Wallet.SendAmountLabel', true)}
              aria-describedby={amountTextId}
            />
            <span id={amountTextId} class="sr-only">{amountText()}</span>
          </div>

          <button
            ref={inertWhen(() => !showRate() || busy())}
            type="button"
            class={classNames(styles.pill, !showRate() && styles.pillHidden, busy() && styles.leaving)}
            style={{visibility: rate() ? undefined : 'hidden'}}
            aria-label={I18n.format('Wallet.SendSwitchCurrency', true)}
            onClick={() => swap()}
          >
            <IconTsx icon="gram_filled" class={classNames(styles.pillGem, fiatMode() && styles.shown)} />
            <span ref={pillTextEl} class={styles.pillText} dir="ltr" />
            <span ref={arrows} class={styles.swapArrows}>
              <SwapHalf />
              <SwapHalf />
            </span>
          </button>

          <Collapse open={insufficient()}>
            <div class={styles.status}>
              <span class={styles.insufficient}>{i18n('Wallet.Send.InsufficientFunds')}</span>
              <Show when={depositInline()}>
                <DepositLink onClick={() => wallet.router.push('receive')} />
              </Show>
            </div>
          </Collapse>
          <span class="sr-only" role="alert">{insufficient() && i18n('Wallet.Send.InsufficientFunds')}</span>
        </div>

        {/* * faded out while the gem is sent, it is out of reach too */}
        <div ref={inertWhen(busy)} class={classNames(styles.comment, busy() && styles.leaving)}>
          <WalletCommentField
            value={comment()}
            onInput={setComment}
            onEnter={() => handle('send')}
            handleRef={(handle) => commentField = handle}
          />
          <Show when={comment().trim()}>
            <Show when={canEncrypt()}>
              <Row class={styles.commentPrivacy}>
                <Row.CheckboxField>
                  <CheckboxFieldTsx checked={makePublic()} onChange={setMakePublic} />
                </Row.CheckboxField>
                <Row.Title>{i18n('Wallet.CommentMakePublic')}</Row.Title>
              </Row>
            </Show>
            {/* * nothing is claimed while it is not known whether the recipient can read a private one */}
            <Show when={canEncrypt() !== undefined || makePublic()}>
              <div class={styles.commentCaption}>{i18n(encrypting() ? 'Wallet.CommentPrivate' : 'Wallet.CommentPublic')}</div>
            </Show>
          </Show>
        </div>

        <div ref={summary} class={styles.summary}>
          <div class={styles.balanceSlot}>
            <div ref={inertWhen(() => !showBalance())} class={classNames(styles.summaryLine, !showBalance() && styles.faded)}>
              {i18n('Wallet.Send.Balance', [gramsText(balance(), formatGramsCut(balance(), 2))])}
            </div>
            <div
              ref={inertWhen(() => !(showDeposit() && !depositInline()))}
              class={classNames(styles.summaryLine, styles.depositSlot, !(showDeposit() && !depositInline()) && styles.faded)}
            >
              <DepositLink onClick={() => wallet.router.push('receive')} />
            </div>
          </div>
          <Collapse open={feeDisplay().kind !== 'hidden'}>
            <div class={styles.summaryLine}>
              {i18n('Wallet.Send.NetworkFee')}
              {' '}
              <Switch fallback="—">
                <Match when={feeShown().kind === 'loading'}>
                  <span class={classNames('shimmer', styles.feePlaceholder)} aria-hidden="true" />
                </Match>
                <Match when={feeShown().kind === 'value' && (feeShown() as {nanos: string}).nanos} keyed>
                  {(fee) => gramsText(fee, formatGramsCut(fee, FEE_DECIMALS))}
                </Match>
              </Switch>
            </div>
          </Collapse>
        </div>
      </div>

      <PopupElement.Footer>
        <PopupElement.FooterButton
          ref={(element) => sendButton = element}
          class={classNames(styles.continue, (busy() || checking()) && styles.busy)}
          disabled={!canSend()}
          callback={() => {
            handle('send');
            return false;
          }}
        >
          <span class={styles.continueLabel}>
            <span class={styles.sendTitle}>{sendTitle()}</span>
            <span class={classNames(styles.sendSubtitle, sendSubtitle() && styles.open)} aria-hidden={!sendSubtitle()}>
              <span dir="ltr">{shownSubtitle()}</span>
            </span>
          </span>
          <span class={styles.spinner} aria-hidden="true" />
        </PopupElement.FooterButton>
      </PopupElement.Footer>

      <div ref={layer} class={styles.gemLayer} hidden={!hasScene()} aria-hidden="true">
        <div ref={glow} class={styles.glow} />
        <div ref={ring} class={styles.ring} />
        <canvas ref={gemCanvas} class={styles.gem} />
      </div>

      <span class={styles.probe} aria-hidden="true">
        <span ref={probeGram} class={styles.probeGram} />
        <span ref={probeFiat} class={styles.probeFiat} />
        <span ref={probeMuted} class={styles.probeMuted} />
      </span>
    </div>
  );
}

function isImeOrRepeat(e: KeyboardEvent) {
  return e.isComposing || e.keyCode === 229 || e.repeat;
}
