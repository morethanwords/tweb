/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '@components/popups/indexTsx';
import Section from '@components/section';
import {batch, createEffect, createMemo, createSignal, on, onCleanup, Show} from 'solid-js';
import bigInt from 'big-integer';
import type {WalletNftItem} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import {NFT_TRANSFER_ATTACHED_NANOS} from '@lib/wallet/walletSession';
import {useWallet} from '@components/wallet/context';
import {WalletHeader} from '@components/wallet/parts';
import WalletCollectibleHeader from '@components/wallet/collectibleHeader';
import {WalletFeeRow, WalletRecipientRow} from '@components/wallet/screens/confirm';
import {
  commentBytesLeft,
  getWalletErrorLangKey,
  isUserCancel,
  quoteNftFee,
  submitNftTransfer,
  toastWalletError,
  WalletNftDraft,
  WalletRecipient
} from '@components/wallet/send';
import {compareNanos, formatGrams, walletNftName} from '@components/wallet/format';
import {playWalletPendingRow} from '@components/wallet/sendAnimation';
import WalletCommentField, {WalletCommentFieldHandle} from '@components/wallet/commentField';
import styles from '@components/wallet/wallet.module.scss';

const FEE_DEBOUNCE = 400;

type NftQuote = {
  /** the preview's, and the send's after it: the transfer's query id comes from it */
  operationId: string,
  fee?: string,
  error?: any
};

/**
 * The last look before a collectible leaves (tdesktop's collectible transfer box): what, to whom, the network
 * fee from a fresh emulation that also checks the wallet still owns it, and an optional public comment. The
 * wallet attaches a little Gram to the call and gets back what the transfer leaves, so the fee and that must fit
 * the balance.
 */
export default function WalletCollectibleSendScreen(props: {params: {recipient: WalletRecipient, nft: WalletNftItem}}) {
  const wallet = useWallet();
  const store = wallet.store;
  const {recipient, nft} = props.params;
  const name = walletNftName(nft);
  const [comment, setComment] = createSignal('');
  const [quote, setQuote] = createSignal<NftQuote>();
  // * the last fee quoted: a comment being typed asks again, and what the transfer needs should not flicker
  const [knownFee, setKnownFee] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  let commentField: WalletCommentFieldHandle;
  let revision = 0, timer: number, disposed = false;

  const draft = (): WalletNftDraft => ({recipient, nft, comment: comment().trim() || undefined});

  // * every quote is a fresh emulation with its own operation: the send goes with the last one's
  const requote = () => {
    const current = ++revision;
    const operationId = crypto.randomUUID();
    setQuote(undefined);
    return quoteNftFee(store, draft(), operationId).then(
      (fee) => current === revision && !disposed && batch(() => {
        setQuote({operationId, fee});
        setKnownFee(fee);
      }),
      (error) => current === revision && !disposed && setQuote({operationId, error})
    );
  };

  createEffect(on(() => comment().trim(), () => {
    clearTimeout(timer);
    ++revision;
    setQuote(undefined);
    timer = window.setTimeout(requote, FEE_DEBOUNCE);
  }, {defer: true}));

  requote();
  onCleanup(() => {
    disposed = true;
    clearTimeout(timer);
  });

  // * what the transfer takes from the balance: the Grams it carries, and the fee once it is known
  const needed = createMemo(() => bigInt(NFT_TRANSFER_ATTACHED_NANOS).add(bigInt(knownFee() ?? '0')).toString());
  const insufficient = createMemo(() => {
    // * before the fee is known the Grams it carries alone may already not fit; an unknown balance is no verdict
    const balance = store.status().state?.balance;
    if(balance !== undefined && compareNanos(needed(), String(balance)) > 0) return true;
    const error = quote()?.error;
    return !!error && getWalletErrorLangKey(error) === 'Wallet.Error.Insufficient';
  });

  // * a refusal the user cannot get past by trying again: no collectible to send. Too few Grams is told apart:
  // * Top Up takes the user to Add Funds (iOS)
  const refusal = createMemo((): LangPackKey => {
    const error = quote()?.error;
    return error && !insufficient() ? getWalletErrorLangKey(error) : undefined;
  });

  const blocked = () => insufficient() || refusal() === 'Wallet.Collectible.NotOwned';

  const tooLong = () => commentBytesLeft(comment()) < 0;

  const send = async() => {
    if(busy() || blocked()) return;
    // * a comment past its limit is not cut: the field says so and nothing goes (tdesktop)
    if(tooLong()) {
      commentField?.refuse();
      return;
    }

    setBusy(true);
    try {
      // * nothing goes out without a fresh emulation that passed; one still waiting for the typing to stop is
      // * asked now, and the timer is dropped so it cannot supersede this one mid-send
      if(quote()?.fee === undefined) {
        clearTimeout(timer);
        await requote();
      }
      const quoted = quote();
      if(quoted?.fee === undefined || insufficient()) return;
      const pending = await submitNftTransfer(store, draft(), quoted.operationId);
      playWalletPendingRow(wallet, pending);
    } catch(err) {
      if(isUserCancel(err)) return;
      if((err as any)?.type === 'WALLET_KEY_MISSING') {
        wallet.router.push('restore', {});
        return;
      }

      toastWalletError(err);
      // * a refused transfer used up its operation: the next press goes with a fresh quote
      if(!disposed) requote();
    } finally {
      if(!disposed) setBusy(false);
    }
  };

  return (
    <>
      <WalletHeader title="Wallet.Confirm.Title" back />
      <div class={styles.body}>
        <WalletCollectibleHeader item={nft} />

        <Section>
          <WalletRecipientRow recipient={recipient} />
          <WalletFeeRow fee={quote() ? quote().fee ?? '' : undefined} />
        </Section>

        <WalletCommentField
          value={comment()}
          onInput={setComment}
          onEnter={send}
          disabled={busy()}
          handleRef={(handle) => commentField = handle}
        />
        <Show when={comment().trim()}>
          <div class={styles.caption}>{i18n('Wallet.CommentPublic')}</div>
        </Show>
        <Show when={insufficient()}>
          <div class={classNames(styles.caption, styles.captionError)} role="alert">
            {i18n('Wallet.Collectible.TopUpText', [formatGrams(needed(), 4)])}
          </div>
        </Show>
        <Show when={refusal()}>
          <div class={classNames(styles.caption, styles.captionError)} role="alert">{i18n(refusal())}</div>
        </Show>
      </div>
      <PopupElement.Footer>
        <Show
          when={insufficient()}
          fallback={
            <PopupElement.FooterButton
              langKey="Wallet.Collectible.Send"
              langArgs={[name]}
              disabled={busy() || !quote() || blocked() || tooLong()}
              callback={() => {
                send();
                return false;
              }}
            />
          }
        >
          <PopupElement.FooterButton
            langKey="Wallet.Backup.TopUp"
            callback={() => {
              wallet.router.push('receive');
              return false;
            }}
          />
        </Show>
      </PopupElement.Footer>
    </>
  );
}
