/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '@components/popups/indexTsx';
import Section from '@components/section';
import {createEffect, createMemo, createSignal, For, on, onCleanup, Show} from 'solid-js';
import Row from '@components/rowTsx';
import {i18n} from '@lib/langPack';
import I18n from '@lib/langPack';
import {useWallet} from '@components/wallet/context';
import {showWalletFeesInfo, WalletHeader, WalletTonAmount} from '@components/wallet/parts';
import WalletGem from '@components/wallet/gem';
import WalletCommentField, {WalletCommentFieldHandle} from '@components/wallet/commentField';
import {runWalletSendFlight} from '@components/wallet/sendAnimation';
import {
  canEncryptCommentTo,
  commentBytesLeft,
  getDeliveredNanos,
  isGaslessEligible,
  isUserCancel,
  openWalletRecipientChat,
  quoteFee,
  showWalletSendError,
  submitWalletTransfer,
  waitForCommentPrivacy,
  WalletRecipient,
  WalletSendDraft
} from '@components/wallet/send';
import {formatFiat, formatGrams, gramsToNumber, groupAddress} from '@components/wallet/format';
import styles from '@components/wallet/wallet.module.scss';
import detailsStyles from '@components/wallet/screens/details.module.scss';

const FEE_DEBOUNCE = 400;

/** Where it goes: the .ton name it was found by, and the address. */
export function WalletRecipientRow(props: {recipient: WalletRecipient}) {
  const lines = () => [...(props.recipient.domain ? [props.recipient.domain] : []), ...groupAddress(props.recipient.address, 6)];
  return (
    <Row>
      <Row.Title>
        {/* * each line reads left to right in either direction, and stands where the text around it would */}
        <span class={detailsStyles.address}>
          <For each={lines()}>{(line, index) => <>{index() ? '\n' : ''}<span dir="ltr">{line}</span></>}</For>
        </span>
      </Row.Title>
      <Row.Subtitle>{i18n('Wallet.Details.Recipient')}</Row.Subtitle>
    </Row>
  );
}

/** The quoted network fee: `undefined` while it is quoted, `''` when it could not be, `'free'` when Telegram pays. */
export function WalletFeeRow(props: {fee: string | undefined}) {
  return (
    <Row clickable={showWalletFeesInfo}>
      <Row.Title>
        <Show when={props.fee !== undefined} fallback={<span class="preloader" />}>
          <Show when={props.fee !== 'free'} fallback={i18n('Wallet.Details.FeeFree')}>
            <Show when={props.fee} fallback="—">
              <>≈ <WalletTonAmount nanos={props.fee} /></>
            </Show>
          </Show>
        </Show>
      </Row.Title>
      <Row.Subtitle>{i18n('Wallet.Details.Fee')}</Row.Subtitle>
    </Row>
  );
}

export type WalletConfirmParams = WalletSendDraft & {
  /** whether the recipient can read a private comment, as the amount screen found out; asked here when not known */
  canEncrypt?: boolean,
  /** the link's own body, for when the comment is taken away here again */
  linkPayload?: string,
  /** a link's or a profile's send: to a Telegram user it ends in their chat */
  openChat?: boolean
};

/**
 * The last look before Grams leave for a bare address, or for whoever a .ton name stands for: what, where, for how
 * much. The comment can still be changed here, and made private or public with its lock (Android's confirmation
 * sheet, iOS's transfer preview). Transfers to Telegram users picked as such skip it, their address is the one
 * Telegram knows.
 */
export default function WalletConfirmScreen(props: {params: WalletConfirmParams}) {
  const wallet = useWallet();
  const store = wallet.store;
  const draft = props.params;
  const recipient = draft.recipient;
  const [busy, setBusy] = createSignal(false);
  let button: HTMLElement, commentField: WalletCommentFieldHandle;
  let revision = 0, timer: number, disposed = false;
  onCleanup(() => {
    disposed = true;
    clearTimeout(timer);
  });

  const [comment, setComment] = createSignal(draft.comment || '');
  // * as the amount screen left it; a comment first written here is private where it can be (tdesktop)
  const [encrypt, setEncrypt] = createSignal(draft.comment ? !!draft.encryptComment : true);
  // * unknown until checked: meanwhile nothing goes private and nothing claims it does (Android)
  const [canEncrypt, setCanEncrypt] = createSignal<boolean>(draft.canEncrypt ?? (draft.encryptComment || undefined));
  const encryptionCheck = canEncrypt() === undefined ? canEncryptCommentTo(store, recipient) : undefined;
  encryptionCheck?.then((value) => {
    if(!disposed) setCanEncrypt(value);
  });

  const encrypting = () => !!comment().trim() && encrypt() && canEncrypt() === true;
  const tooLong = createMemo(() => commentBytesLeft(comment()) < 0);

  const current = (): WalletSendDraft => {
    const text = comment().trim();
    return {
      ...draft,
      comment: text || undefined,
      encryptComment: text ? encrypting() : undefined,
      // * the link's own body goes when no comment is written (iOS)
      payload: text ? undefined : draft.payload ?? draft.linkPayload
    };
  };

  // * a signal, not a resource: the quote takes seconds and a resource would suspend the whole screen
  const [fee, setFee] = createSignal<string>();
  // * decided once: the send goes the way the fee row says, "Free" is never followed by a paid transfer; the whole
  // * balance is never free, its fee comes out of it
  const gasless = draft.sendAll ? Promise.resolve(false) : isGaslessEligible(store, draft);
  const requote = () => {
    const quote = ++revision;
    gasless
    .then((free) => free ? 'free' : quoteFee(store, current()))
    .then((value) => quote === revision && !disposed && setFee(value), () => quote === revision && !disposed && setFee(''));
  };

  requote();

  // * a comment changes the fee much: it is quoted again once the typing stops; a free transfer stays free
  createEffect(on(() => `${comment().trim()}|${encrypting()}`, () => {
    clearTimeout(timer);
    if(fee() === 'free') return;
    ++revision;
    setFee(undefined);
    timer = window.setTimeout(requote, FEE_DEBOUNCE);
  }, {defer: true}));

  /** what arrives: all of it, or for the whole balance what the fee leaves of it */
  const quotedFee = () => fee() && fee() !== 'free' ? fee() : draft.fee;
  const delivered = () => getDeliveredNanos({...draft, fee: quotedFee()});
  const amountText = () => I18n.format('Wallet.GramsAmount', true, [
    formatGrams(delivered()),
    I18n.format('Wallet.Card.Ticker', true, [gramsToNumber(delivered())])
  ]);

  // * the whole balance goes less its fee: the button says what arrives once the fee for this comment is in
  const waitsForFee = () => !!draft.sendAll && fee() === undefined;

  const send = async() => {
    if(busy() || waitsForFee()) return;
    if(tooLong()) {
      commentField?.refuse();
      return;
    }

    setBusy(true);
    try {
      // * a comment meant to be private whose privacy is not known yet waits for it, as on the amount screen: one that
      // * turns out public is not sent before the screen said so, nor the whole balance before its fee is quoted again
      if(comment().trim() && encrypt() && canEncrypt() === undefined) {
        const value = await waitForCommentPrivacy(encryptionCheck);
        if(disposed) return;
        if(canEncrypt() === undefined) setCanEncrypt(value);
        if(!value || waitsForFee()) return;
      }

      const pending = await submitWalletTransfer(store, {
        ...current(),
        gasless: await gasless,
        fee: quotedFee()
      });

      // * a link's send to a Telegram user found by its name ends in their chat (iOS OpenResolvedUrl)
      if(draft.openChat && recipient.userId) {
        openWalletRecipientChat(wallet, recipient.userId.toPeerId(false));
        return;
      }

      const rect = button?.getBoundingClientRect();
      runWalletSendFlight(wallet, {pending, from: rect ? [rect.left + rect.width / 2, rect.top + rect.height / 2] : undefined});
    } catch(err) {
      if((err as any)?.type === 'WALLET_KEY_MISSING') {
        wallet.router.push('restore', {});
      } else if(!isUserCancel(err)) {
        showWalletSendError(err);
      }
    } finally {
      if(!disposed) setBusy(false);
    }
  };

  return (
    <>
      <WalletHeader title="Wallet.Confirm.Title" back />
      <div class={styles.body}>
        <div class={detailsStyles.hero}>
          <WalletGem size={96} widthPoints={52} visible={wallet.shown} />
          {/* * an amount and its code read left to right in any layout */}
          <div class={detailsStyles.amount} dir="ltr">
            {formatGrams(delivered())}
            <span class={detailsStyles.code}>GRAM</span>
          </div>
          <Show when={store.fiatPerGram()}>
            <div class={detailsStyles.fiat} dir="ltr">{formatFiat(delivered(), store.fiatPerGram(), store.currency())}</div>
          </Show>
        </div>

        <Section>
          <WalletRecipientRow recipient={recipient} />
          <WalletFeeRow fee={fee()} />
        </Section>

        <WalletCommentField
          value={comment()}
          onInput={setComment}
          onEnter={send}
          disabled={busy()}
          lock={canEncrypt() === true ? {encrypted: encrypt(), onToggle: () => setEncrypt((value) => !value)} : undefined}
          handleRef={(handle) => commentField = handle}
        />
        <Show when={comment().trim() && (canEncrypt() !== undefined || !encrypt())}>
          <div class={styles.caption}>{i18n(encrypting() ? 'Wallet.CommentPrivate' : 'Wallet.CommentPublic')}</div>
        </Show>
      </div>
      <PopupElement.Footer>
        <PopupElement.FooterButton
          ref={(element) => button = element}
          langKey="Wallet.Send.Amount"
          langArgs={[amountText()]}
          disabled={busy() || waitsForFee() || tooLong()}
          callback={() => {
            send();
            return false;
          }}
        />
      </PopupElement.Footer>
    </>
  );
}
