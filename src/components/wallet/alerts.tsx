/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX} from 'solid-js';
import confirmationPopup from '@components/confirmationPopup';
import type {PopupPeerButton} from '@components/popups/peer';
import {toast} from '@components/toast';
import {FormatterArguments, i18n, LangPackKey} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import WalletAddressGroups from '@components/wallet/addressGroups';
import styles from '@components/wallet/alerts.module.scss';

/**
 * What the keys and backup screens tell: iOS's alerts (a title, a text, OK or a choice) on the app's confirmation
 * popup, its titled toasts on the app's toast, and the wallet address the way iOS spells one out.
 */

export type WalletMessage = {
  title: LangPackKey,
  text: LangPackKey,
  textArgs?: FormatterArguments
};

/** a bold title over its text: iOS's "actionSucceeded" toast */
export function toastWallet(title: LangPackKey, text: LangPackKey, textArgs?: FormatterArguments) {
  const content = document.createDocumentFragment();
  const strong = document.createElement('strong');
  strong.append(i18n(title));
  content.append(strong, document.createElement('br'), i18n(text, textArgs));
  toast(content);
}

/** the same, once the window went back to another screen: the screens slide first (iOS waits 0.4 s) */
export function toastWalletAfterBack(title: LangPackKey, text: LangPackKey) {
  setTimeout(() => toastWallet(title, text), 400);
}

/**
 * A title and a text with OK, or with `actions` and Cancel. Each action runs its own callback; the alert closes
 * after it. Settles when the alert is closed, whichever way.
 */
export function showWalletAlert(message: WalletMessage, options: {
  actions?: PopupPeerButton[],
  /** under the text: the address a wrong phrase belongs to, say */
  content?: JSX.Element
} = {}): Promise<void> {
  const actions = options.actions || [];
  return confirmationPopup({
    titleLangKey: message.title,
    descriptionLangKey: message.text,
    descriptionLangArgs: message.textArgs,
    content: options.content,
    button: actions[0] || {langKey: 'OK', isCancel: true},
    buttons: actions.length ? [...actions, {langKey: 'Cancel', isCancel: true}] : undefined
  }).then(() => {}, () => {});
}

const TOO_FRESH_REGEXP = /^(PASSWORD|SESSION)_TOO_FRESH_(\d+)$/;

/** what an unanswered request, or the provider, failed on: worth another try as it is */
export function isWalletNetworkError(error: any) {
  const type = String(error?.type || '');
  const code: number = error?.code;
  return type.startsWith('NETWORK_') ||
    type === 'RPC_CALL_FAIL' ||
    type === 'WALLET_TONCENTER_ERROR' ||
    type === 'ROTATION_QUOTE_FAILED' ||
    (typeof(code) === 'number' && (code >= 500 || code < 0));
}

/**
 * The alert iOS shows for what the server and the 2FA check refuse (walletAuthorizationErrorMessage); nothing for
 * any other failure, which the caller words itself
 */
export async function walletAuthorizationMessage(error: any): Promise<WalletMessage | undefined> {
  const type = String(error?.type || '');
  const fresh = type.match(TOO_FRESH_REGEXP);
  if(fresh) {
    const [{default: formatDuration}, {wrapFormattedDuration}] = await Promise.all([
      import('@helpers/formatDuration'),
      import('@components/wrappers/wrapDuration')
    ]);
    const password = fresh[1] === 'PASSWORD';
    return {
      title: password ? 'Wallet.Auth.PasswordTooNewTitle' : 'Wallet.Auth.SessionTooNewTitle',
      text: password ? 'Wallet.Auth.PasswordRetryAfter' : 'Wallet.Auth.SessionRetryAfter',
      textArgs: [wrapFormattedDuration(formatDuration(+fresh[2]), true)]
    };
  }

  switch(type) {
    case 'WALLET_PHRASE_OUTDATED': return {title: 'Wallet.Import.PhraseChangedTitle', text: 'Wallet.Import.PhraseChangedText'};
    case 'NO_PASSWORD':
    case 'INTERNAL_NO_PASSWORD': return {title: 'Wallet.Auth.TwoStepRequiredTitle', text: 'Wallet.Auth.TwoStepRequiredText'};
    case 'WALLET_BACKUP_DISABLED': return {title: 'Wallet.Auth.BackupDisabledTitle', text: 'Wallet.Auth.BackupDisabledText'};
    case 'WALLET_BACKUP_NOT_AVAILABLE': return {title: 'Wallet.Auth.BackupUnavailableTitle', text: 'Wallet.Auth.BackupUnavailableText'};
    case 'ROTATION_PREPARE_FAILED': return {title: 'Wallet.Backup.UpdatePhraseErrorTitle', text: 'Wallet.Auth.UpdatePhraseErrorText'};
    case 'WALLET_PROOF_INVALID': return {title: 'Wallet.Auth.VerifyWalletErrorTitle', text: 'Wallet.Auth.VerifyWalletErrorText'};
    case 'WALLET_PROOF_EXPIRED': return {title: 'Wallet.Auth.VerificationExpiredTitle', text: 'Wallet.Auth.VerificationExpiredText'};
  }
}

/** the alert for a failure with no words of its own: `title`, and the network as the likely cause */
export async function showWalletError(error: any, title: LangPackKey, text: LangPackKey = 'Wallet.NetworkError') {
  return showWalletAlert(await walletAuthorizationMessage(error) ?? {title, text});
}

/** an address on a plate under an alert's text */
export function WalletAddressPlate(props: {address: string}) {
  return (
    <div class={classNames(styles.plate, styles.plateCenter)}>
      <WalletAddressGroups address={props.address} />
    </div>
  );
}
