/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createRoot, createSignal, Match, on, Show, Switch} from 'solid-js';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import confirmationPopup from '@components/confirmationPopup';
import type {PopupPeerButton, PopupPeerHandle} from '@components/popups/peer';
import {putPreloader} from '@components/putPreloader';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import {HeightTransition} from '@helpers/solid/heightTransition';
import bytesToHex from '@helpers/bytes/bytesToHex';
import bigInt from 'big-integer';
import type {WalletStatus} from '@appManagers/appWalletManager';
import {isRotationFeeCovered, type WalletRotationQuote} from '@lib/wallet/rotation';
import type {WalletContextValue} from '@components/wallet/context';
import type {WalletStore} from '@components/wallet/store';
import Currencies from '@config/currencies';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {formatFiat, formatGrams, gramsToNumber} from '@components/wallet/format';
import {ensureWalletKey, isUserCancel, toastWalletError} from '@components/wallet/send';
import {isWalletNetworkError, showWalletAlert, showWalletError, toastWallet, walletAuthorizationMessage, WalletMessage} from '@components/wallet/alerts';
import styles from '@components/wallet/alerts.module.scss';

/**
 * The encrypted backup switched on and off, as iOS runs it (WalletSettingsScreen). Enable goes at once, a spinner on
 * its row. Disable asks first, "Update Secret Phrase" ticked or not: the update is priced (or a top-up asked for)
 * and the words to write down are got ready under the question, a failure said in red under it. The words are
 * written down and checked, then "Disable Backup?" once more says what happens; only that sends the update, when
 * there is one, confirms it on chain and turns the backup off. The whole way a wallet that changes under the flow
 * ends it ("Wallet Changed"), and leaving the write-down asks first: it drops the disable.
 */

/** what an amount is shown in besides Grams */
type WalletFiat = Pick<WalletStore, 'fiatPerGram' | 'currency'>;

/** under it the update asks for a top-up instead of a price (iOS: 0.0005 Gram) */
const ROTATION_MIN_BALANCE = 500000;
/** the fee's decimals (iOS) */
const FEE_DECIMALS = 5;

/**
 * The fiat beside a fee: `~$0.01`, or `<$0.01` when it rounds to nothing (iOS); nothing without a rate
 */
function feeFiat(store: WalletFiat, nanos: string) {
  const rate = store.fiatPerGram();
  if(!rate) {
    return;
  }

  const currency = store.currency();
  const exp = Currencies[currency]?.exp ?? 2;
  if(!Math.round(gramsToNumber(nanos) * rate * 10 ** exp)) {
    return '<' + paymentsWrapCurrencyAmount(1, currency, false, false, true);
  }

  return '~' + formatFiat(nanos, rate, store.currency());
}

/** "Network fee: …", or the balance the fee needs; the fiat part only when a rate is known */
function rotationFeeLang(store: WalletFiat, fee: string, required?: boolean): [LangPackKey, string[]] {
  const amount = formatGrams(fee, FEE_DECIMALS);
  const fiat = feeFiat(store, fee);
  if(!fiat) {
    return [required ? 'Wallet.Backup.RequiredBalanceGrams' : 'Wallet.Backup.UpdateFeeGrams', [amount]];
  }

  return [required ? 'Wallet.Backup.RequiredBalance' : 'Wallet.Backup.UpdateFee', [amount, fiat]];
}

export function isLowWalletBalance(balance: string | number) {
  return bigInt(String(balance ?? 0)).lesser(ROTATION_MIN_BALANCE);
}

// MARK: Flow

function walletIdentity(status: WalletStatus) {
  const state = status?.state;
  return state && state.address + ':' + bytesToHex(state.public_key);
}

/**
 * One run of Disable Backup, from its question to the last screen, handed from screen to screen
 */
export type WalletBackupFlow = {
  /** the flow's screens leave without asking: it is being taken down */
  dismissing: boolean,
  /** the final Disable was pressed: what changes now is the flow's own doing */
  committing: boolean,
  /** the update went out: Disable again only turns the backup off */
  rotationSent: boolean,
  /** the wallet as the flow's own update left it: the same address with the new key is no other wallet */
  rotatedIdentity?: string,
  ended: boolean,
  /** the flow's question that is up */
  popup?: PopupPeerHandle,
  end: () => void,
  /** the watch's check, run now on the status as it is: false once it took the flow down */
  check: () => boolean
};

/**
 * Starts watching the wallet for the flow: another address, or another key (it moved on elsewhere), takes the flow
 * down with "Wallet Changed"; a backup turned off elsewhere takes it down quietly — there is nothing to disable. A
 * status that is still loading, or the wallet being made, is no change (iOS: reconcileBackupDisableWalletState).
 */
export function createWalletBackupFlow(wallet: WalletContextValue): WalletBackupFlow {
  const store = wallet.store;
  // * the wallet the flow is for: the one served as it starts, or — opened before the status came — the first one served
  let identity = walletIdentity(store.status());
  let dispose: () => void;
  const check = (status: WalletStatus) => {
    const presence = status.presence;
    if(presence === 'unknown' || presence === 'error' || presence === 'provisioning') return true;
    if(!identity) {
      identity = walletIdentity(status);
      return true;
    }

    const current = walletIdentity(status);
    if(current === identity || (flow.rotatedIdentity && current === flow.rotatedIdentity)) {
      if(!status.state.pFlags.backup_enabled) leaveWalletBackupFlow(wallet, flow);
      return !flow.ended;
    }

    leaveWalletBackupFlow(wallet, flow);
    showWalletAlert({title: 'Wallet.Backup.WalletChangedTitle', text: 'Wallet.Backup.DisableWalletChangedText'});
    return false;
  };

  const flow: WalletBackupFlow = {
    dismissing: false,
    committing: false,
    rotationSent: false,
    ended: false,
    end: () => {
      if(flow.ended) return;
      flow.ended = true;
      dispose?.();
    },
    check: () => !flow.ended && check(store.status())
  };

  createRoot((_dispose) => {
    dispose = _dispose;
    createEffect(on(store.status, (status) => {
      if(flow.committing || flow.ended) return;
      check(status);
    }, {defer: true}));
  });

  return flow;
}

/**
 * Takes the flow down: its question closes, its screens go back to the keys
 */
export function leaveWalletBackupFlow(wallet: WalletContextValue, flow: WalletBackupFlow) {
  if(flow.ended) return;
  flow.dismissing = true;
  flow.popup?.hide();
  const name = wallet.router.current().name;
  if(name === 'phrase' || name === 'quiz') wallet.router.pop('keys');
  flow.end();
}

/**
 * Leaving the write-down of the words or their quiz drops the disable (and a prepared update with it): while it still
 * would — `abandons` — leaving asks "Cancel Disabling Backup?" first (iOS). To be called in the screen.
 */
export function guardWalletBackupDisable(wallet: WalletContextValue, flow?: WalletBackupFlow, abandons: () => boolean = () => true) {
  wallet.router.guardLeave(() => {
    if(!abandons() || flow?.dismissing) return;
    return confirmationPopup({
      titleLangKey: 'Wallet.Backup.CancelTitle',
      descriptionLangKey: 'Wallet.Backup.CancelText',
      button: {langKey: 'Wallet.Backup.CancelDisabling'},
      cancelButton: {langKey: 'Wallet.Continue'}
    });
  });
}

// MARK: Disable

/** what Disable failed on, in iOS's words (disableBackupErrorMessage) */
async function disableBackupErrorMessage(store: WalletFiat, error: any): Promise<WalletMessage> {
  const type = String(error?.type || '');
  switch(type) {
    case 'WALLET_PROOF_INVALID': return {title: 'Wallet.Auth.VerifyWalletErrorTitle', text: 'Wallet.Backup.DisableVerificationErrorText'};
    case 'WALLET_PROOF_EXPIRED': return {title: 'Wallet.Auth.VerificationExpiredTitle', text: 'Wallet.Backup.DisableVerificationExpiredText'};
    case 'WALLET_ROTATION_NOT_FOUND':
    case 'ROTATION_PENDING': return {title: 'Wallet.Backup.PhraseUpdatePendingTitle', text: 'Wallet.Backup.DisablePhraseUpdatePendingText'};
    case 'ROTATION_FEES': {
      const [text, textArgs] = rotationFeeLang(store, error.fee, true);
      return {title: 'Wallet.Backup.InsufficientFundsTitle', text, textArgs};
    }
  }

  if(isWalletNetworkError(error)) {
    return {title: 'Wallet.Backup.DisableErrorTitle', text: 'Wallet.NetworkError'};
  }

  if(isRotationError(error)) {
    return {title: 'Wallet.Backup.UpdatePhraseErrorTitle', text: 'Wallet.Backup.DisablePhraseUpdateErrorText'};
  }

  return await walletAuthorizationMessage(error) ?? {title: 'Wallet.Backup.DisableErrorTitle', text: 'Wallet.Backup.DisableErrorText'};
}

export type WalletBackupDisableOptions = {
  fiat: WalletFiat,
  /** nanograms the wallet holds: too few, and the update asks for a top-up instead */
  balance: () => string | number,
  /** the update is offered: this device signs, no update is on its way, the key was not updated since the backup */
  offered: boolean,
  /** prices the update: once as the question opens, again on a press after it failed */
  quote: () => Promise<WalletRotationQuote>,
  /** the words to write down: the current ones, or — given the update's price — the update's new ones */
  prepare: (quote?: WalletRotationQuote) => Promise<string[]>,
  flow?: WalletBackupFlow
};

export type WalletBackupDisableChoice = {update: boolean, words: string[]} | {topUp: true};

/**
 * "Disable Backup?" with "Update Secret Phrase" under it (iOS: presentDisableBackupAlert). Ticked, the update's price
 * shows under it once quoted — or, on a balance too low for any fee, a note that it needs funds, and Disable becomes
 * Top Up. Disable gets the words ready with a spinner on it; what fails is said in red under the question, and the
 * next press tries again. Resolves with the words to write down (or the top-up), rejects when cancelled.
 */
export function confirmWalletBackupDisable(options: WalletBackupDisableOptions) {
  return createRoot(async(dispose) => {
    const {fiat, offered} = options;
    const [update, setUpdate] = createSignal(false);
    const [quoted, setQuoted] = createSignal<WalletRotationQuote>();
    const [quoteError, setQuoteError] = createSignal<any>();
    const [error, setError] = createSignal<any>();
    const [errorText, setErrorText] = createSignal<WalletMessage>();
    const lowBalance = () => isLowWalletBalance(options.balance());
    const topUp = () => update() && lowBalance();
    let quoting: Promise<WalletRotationQuote>;

    const quote = () => {
      setQuoteError(undefined);
      const promise = quoting = options.quote();
      promise.then((value) => {
        if(quoting === promise) setQuoted(value);
      }, (err) => {
        if(quoting === promise) setQuoteError(err);
      });
      return promise;
    };

    if(offered && !lowBalance()) {
      quote();
    }

    // * the failure under the question: the press's own, or the quote's while the update is ticked
    createEffect(() => {
      const shown = error() || (update() && !lowBalance() && quoteError());
      if(!shown) {
        setErrorText(undefined);
        return;
      }

      disableBackupErrorMessage(fiat, shown).then((message) => {
        if(error() === shown || quoteError() === shown) setErrorText(message);
      });
    });

    let choice: WalletBackupDisableChoice;
    const disable = async() => {
      if(topUp()) {
        choice = {topUp: true};
        return;
      }

      setError(undefined);
      try {
        let price: WalletRotationQuote;
        if(update()) {
          price = quoted();
          if(!price) {
            const fresh = !!quoteError() || !quoting;
            price = await (fresh ? quote() : quoting);
            // * a fresh price is shown first, the next press goes on (iOS)
            if(fresh) return false;
          }

          // * against the balance as it is now: a top-up made while the question is open counts
          if(!isRotationFeeCovered(price.fee, options.balance())) {
            setError({type: 'ROTATION_FEES', fee: price.fee});
            return false;
          }
        }

        choice = {update: !!price, words: await options.prepare(price)};
      } catch(err) {
        // * the quote's own failure is shown already, under the question; any other is the press's
        if(!isUserCancel(err) && err !== quoteError()) setError(err);
        return false;
      }
    };

    const button: PopupPeerButton = {
      get langKey() {
        return topUp() ? 'Wallet.Backup.TopUp' : 'Wallet.Backup.Disable';
      },
      get isDanger() {
        return !topUp();
      },
      preloader: true,
      callback: disable
    };

    try {
      await confirmationPopup({
        titleLangKey: 'Wallet.Backup.DisableTitle',
        descriptionLangKey: 'Wallet.Keys.BackupDisableText',
        onPopup: (popup) => options.flow && (options.flow.popup = popup),
        content: (
          <div>
            <Show when={offered}>
              <Row class="popup-peer-checkbox-row">
                <Row.Title>{i18n('Wallet.Backup.UpdateCheck')}</Row.Title>
                <Row.CheckboxField>
                  <CheckboxFieldTsx
                    signal={[update, setUpdate]}
                    onChange={() => setError(undefined)}
                  />
                </Row.CheckboxField>
              </Row>
            </Show>
            <HeightTransition>
              <Show when={update()}>
                <div>
                  <Switch>
                    <Match when={lowBalance()}>
                      <p class={`${styles.plate} ${styles.plateCenter}`}>{i18n('Wallet.Backup.UpdateTopUpText')}</p>
                    </Match>
                    <Match when={quoted()}>
                      <p class={`${styles.plate} ${styles.plateCenter}`}>
                        {i18n('Wallet.Backup.UpdateText')}
                        {'\n\n'}
                        {i18n(...rotationFeeLang(fiat, quoted().fee))}
                      </p>
                    </Match>
                    <Match when={!quoteError()}>
                      <div class={styles.loading} role="status" aria-label={I18n.format('Loading', true)}>
                        {putPreloader(undefined, true)}
                      </div>
                    </Match>
                  </Switch>
                </div>
              </Show>
            </HeightTransition>
            <HeightTransition>
              <Show when={errorText()}>
                <div>
                  <p class={styles.error} role="alert">
                    {i18n('Wallet.Backup.RetryText', [I18n.format(errorText().text, true, errorText().textArgs)])}
                  </p>
                </div>
              </Show>
            </HeightTransition>
          </div>
        ),
        button
      });

      return choice;
    } finally {
      if(options.flow) options.flow.popup = undefined;
      dispose();
    }
  });
}

/**
 * From the keys screen: the question, then the words to write down — the current phrase, or the update's new one
 */
export async function startWalletBackupDisable(wallet: WalletContextValue) {
  const store = wallet.store;
  const session = store.session;
  let quoting: Promise<WalletRotationQuote>;
  let flow: WalletBackupFlow;
  try {
    await ensureWalletKey(store, 'Wallet.Phrase.PasswordText');
    const offered = await session.isRotationOffered(store.status());
    if(offered && !isLowWalletBalance(store.status().state?.balance)) {
      // * one passcode prompt, before the question: the price under it needs the key
      await session.ensureUnlocked('prepareKeyRotation');
    }

    flow = createWalletBackupFlow(wallet);
    const choice = await confirmWalletBackupDisable({
      fiat: store,
      balance: () => store.status().state?.balance ?? 0,
      offered,
      quote: () => quoting = session.quoteRotationFee(store.status()),
      // * the words are written down and checked before anything changes on the server
      prepare: (quote) => quote ? session.prepareRotation(store.status(), quote) : session.revealPhrase(store.status()),
      flow
    });

    if(flow.ended) {
      return;
    }

    if('topUp' in choice) {
      flow.end();
      wallet.router.push('receive');
      return;
    }

    wallet.router.push('phrase', {mode: choice.update ? 'rotation' : 'disableBackup', words: choice.words, flow});
  } catch(err) {
    flow?.end();
    if((err as any)?.type === 'WALLET_KEY_MISSING') wallet.router.push('restore', {});
    else if(!isUserCancel(err)) showWalletError(err, 'Wallet.Backup.DisableErrorTitle');
  } finally {
    // * the keys screen stays busy until the price answers: a quote still out refuses every other custody action,
    // * a fresh quote first of all, so a question reopened over it would see only failures (tdesktop)
    await quoting?.catch(() => {});
  }
}

/**
 * "All Done?": Continue came too soon after the words appeared to have written them down; the words stay
 */
export function showWalletWriteDownTooQuick() {
  confirmationPopup({
    titleLangKey: 'Wallet.Backup.SureTitle',
    descriptionLangKey: 'Wallet.Backup.SureText',
    button: {langKey: 'Wallet.Backup.SureOk', isCancel: true}
  }).catch(() => {});
}

export function isRotationError(error: any) {
  return String(error?.type || '').startsWith('ROTATION_');
}

/**
 * An update that did not take effect: "Action Failed", the reason, and that the old phrase stays the one in use.
 * One the chain has not answered for yet is no failure: it settles by itself.
 */
export function showWalletRotationFailed(error: any) {
  const type: string = error?.type;
  if(type === 'ROTATION_PENDING') {
    toastWalletError(error);
    return;
  }

  const reason: LangPackKey = type === 'ROTATION_FEES' ?
    'Wallet.Error.Insufficient' :
    type === 'ROTATION_ALREADY_SENDING' ? 'Wallet.Error.InProgress' : 'Wallet.Backup.RotateReasonFailed';
  confirmationPopup({
    titleLangKey: 'Wallet.Backup.RotateFailedTitle',
    descriptionLangKey: 'Wallet.Backup.RotateFailedText',
    descriptionLangArgs: [I18n.format(reason, true)],
    button: {langKey: 'OK', isCancel: true}
  }).catch(() => {});
}

/**
 * The quiz passed: "Disable Backup?" once more, saying what happens (iOS: presentFinalDisableBackupAlert). Disable
 * sends the update, when there is one, waits for the chain, and turns the backup off with the proof of the record's
 * key; the screens go once it is done, or once the update failed. A disable that failed says why and may be pressed
 * again. Cancel goes back to the keys and drops an update that was not sent.
 */
export async function confirmWalletBackupDisableDone(wallet: WalletContextValue, flow: WalletBackupFlow, rotation: boolean) {
  const store = wallet.store;
  const disable = async() => {
    // * every press is for the wallet the quiz checked: one that changed meanwhile (the watch waits while a press is
    // * out) takes the flow down instead
    if(!flow.check()) return;
    flow.committing = true;
    if(rotation && !flow.rotationSent) {
      try {
        const address = store.status().state?.address;
        const newKey = await store.session.submitRotation(store.status());
        flow.rotationSent = true;
        flow.rotatedIdentity = address && address + ':' + newKey;
        // * the watch waited while the update was out: a wallet replaced meanwhile is seen now, before its backup
        // * could be turned off — the quiz checked this one's phrase only
        await store.refreshStatus(true).catch(() => {});
        if(!flow.check()) return;
      } catch(err) {
        if(isUserCancel(err)) {
          flow.committing = false;
          return false;
        }

        showWalletRotationFailed(err);
        return;
      }
    }

    try {
      await store.session.disableBackup(store.status());
      await store.refreshStatus(true);
      toastWallet('Wallet.Backup.DisabledTitle', 'Wallet.Keys.BackupDisabled');
    } catch(err) {
      // * the watch goes on between the presses: the key the flow's own update installed is known to it, a wallet
      // * replaced meanwhile is not, and the quiz checked the phrase of this one only
      flow.committing = false;
      if(isUserCancel(err)) return false;
      const message = await disableBackupErrorMessage(store, err);
      // * what changed while it was out is seen now: another wallet ends the flow, it is not offered again
      if(!flow.check()) return;
      showWalletAlert(message);
      return false;
    }
  };

  try {
    await confirmationPopup({
      titleLangKey: 'Wallet.Backup.DisableTitle',
      descriptionLangKey: rotation ? 'Wallet.Backup.DisableWithNewPhraseText' : 'Wallet.Backup.DisableConfirmationText',
      onPopup: (popup) => flow.popup = popup,
      button: {langKey: 'Wallet.Backup.Disable', isDanger: true, preloader: true, callback: disable}
    });
  } catch(err) {
  } finally {
    flow.popup = undefined;
  }

  leaveWalletBackupFlow(wallet, flow);
}

// MARK: Enable

/** what Enable failed on, in iOS's words (walletBackupEnableErrorMessage), and what may help */
async function enableBackupErrorMessage(error: any): Promise<WalletMessage & {retry?: boolean, enterPhrase?: boolean}> {
  const type = String(error?.type || '');
  switch(type) {
    case 'WALLET_KEY_MISMATCH':
    case 'WALLET_PROOF_INVALID':
    case 'WALLET_PHRASE_OTHER_WALLET':
      return {title: 'Wallet.Backup.VerifyPhraseErrorTitle', text: 'Wallet.Backup.VerifyPhraseErrorText', enterPhrase: true};
    case 'WALLET_PHRASE_OUTDATED':
      return {title: 'Wallet.Backup.VerifyPhraseErrorTitle', text: 'Wallet.Backup.VerifyPhraseErrorText'};
    case 'WALLET_ROTATION_NOT_FOUND':
    case 'ROTATION_PENDING':
      return {title: 'Wallet.Backup.PhraseUpdatePendingTitle', text: 'Wallet.Backup.EnablePhraseUpdatePendingText', retry: true, enterPhrase: true};
    case 'WALLET_PROOF_EXPIRED':
      return {title: 'Wallet.Auth.VerificationExpiredTitle', text: 'Wallet.Backup.EnableVerificationExpiredText', retry: true};
    case 'WALLET_PHRASE_INVALID':
    case 'WALLET_PHRASE_FOREIGN':
      return {title: 'Wallet.Import.InvalidPhraseTitle', text: 'Wallet.Backup.InvalidPhraseText', enterPhrase: true};
  }

  if(isWalletNetworkError(error)) {
    return {title: 'Wallet.Backup.EnableErrorTitle', text: 'Wallet.NetworkError', retry: true};
  }

  return await walletAuthorizationMessage(error) ?? {title: 'Wallet.Backup.EnableErrorTitle', text: 'Wallet.NetworkError'};
}

/**
 * Turns the backup on with the key on this device (iOS: enableBackup, no question first). Without the key the phrase
 * is typed first (`enterPhrase`), and the enable goes on from there. A failure says why, with Retry where another try
 * may help and "Enter Current Secret Phrase" where the key itself may be the wrong one. Resolves with whether it is on.
 */
export async function enableWalletBackup(wallet: WalletContextValue, handlers: {
  retry: () => void,
  enterPhrase: () => void
}) {
  const store = wallet.store;
  try {
    await ensureWalletKey(store, 'Wallet.Phrase.PasswordText');
    await store.session.enableBackup(store.status());
    await store.refreshStatus(true);
    toastWallet('Wallet.Backup.EnabledTitle', 'Wallet.Keys.BackupEnabled');
    return true;
  } catch(err) {
    if((err as any)?.type === 'WALLET_KEY_MISSING') {
      handlers.enterPhrase();
    } else if(!isUserCancel(err)) {
      showWalletEnableBackupError(err, handlers);
    }

    return false;
  }
}

export async function showWalletEnableBackupError(error: any, handlers: {retry: () => void, enterPhrase: () => void}) {
  const message = await enableBackupErrorMessage(error);
  const actions: PopupPeerButton[] = [];
  if(message.retry) actions.push({langKey: 'Wallet.Retry', callback: () => void handlers.retry()});
  if(message.enterPhrase) actions.push({langKey: 'Wallet.Backup.EnterCurrentPhrase', callback: () => void handlers.enterPhrase()});
  return showWalletAlert(message, {actions});
}
