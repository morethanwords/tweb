/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX, onCleanup} from 'solid-js';
import {usePopupContext} from '@components/popups/indexTsx';
import type {WebDocument} from '@layer';
import type {TonConnectFailure} from '@lib/wallet/tonConnect';
import {WalletNftImage} from '@components/wallet/collectibles';
import {toastNew} from '@components/toast';
import {showWalletAlert} from '@components/wallet/alerts';
import {LangPackKey} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import styles from '@components/wallet/tonConnect/tonConnect.module.scss';

/** an app's icon from its manifest (proxied by Telegram, never fetched from the app), or the first letter of its name */
export function TonConnectAppIcon(props: {icon?: WebDocument, name?: string, size?: number, loading?: boolean, class?: string}) {
  const size = () => props.size ?? 88;
  const letter = () => Array.from(props.name?.trim() || '')[0];
  return (
    <div
      class={classNames(styles.icon, props.class)}
      style={{'--tonconnect-icon-size': size() + 'px'}}
      aria-hidden="true"
    >
      <WalletNftImage
        document={props.loading ? undefined : props.icon}
        size={size()}
        class={styles.iconImage}
        placeholder={<div class={classNames(styles.iconLetter, (props.loading || !letter()) && styles.iconLoading)}>{props.loading ? '' : letter()}</div>}
      />
    </div>
  );
}

const FAILURE_TEXTS: {[failure in TonConnectFailure | 'failed']?: LangPackKey} = {
  unavailable: 'Wallet.Connect.Unavailable',
  invalidLink: 'Wallet.Connect.InvalidLink',
  invalidManifest: 'Wallet.Connect.ManifestInvalid',
  wrongNetwork: 'Wallet.Connect.WrongNetwork',
  keyMismatch: 'Wallet.Connect.KeyMismatch',
  keyChanging: 'Wallet.Connect.KeyChanging',
  noKey: 'Wallet.Connect.Restore',
  expired: 'Wallet.Request.Expired',
  handledElsewhere: 'Wallet.Connect.HandledElsewhere',
  outcomeUnknown: 'Wallet.Connect.OutcomeUnknown',
  bridgeUnavailable: 'Wallet.Connect.Undelivered',
  failed: 'Wallet.Request.NotSent'
};

export function getTonConnectFailureText(failure: TonConnectFailure | 'failed') {
  return FAILURE_TEXTS[failure] || 'Wallet.Connect.Failed';
}

/**
 * Says what became of a request: what may have gone out gets an alert that waits for an answer (iOS outcomeUnknown),
 * the rest a toast
 */
export function showTonConnectFailure(failure: TonConnectFailure | 'failed') {
  if(failure === 'outcomeUnknown') {
    showWalletAlert({title: 'Wallet.Transfer.PendingTitle', text: 'Wallet.Connect.OutcomeUnknown'});
    return;
  }

  toastNew({langPackKey: getTonConnectFailureText(failure)});
}

/** a block of text that keeps its line breaks, under a popup's header */
export function TonConnectText(props: {children: JSX.Element, class?: string}) {
  return <div class={classNames(styles.text, props.class)}>{props.children}</div>;
}

/** hands a popup's own hide out, so the flow can close the sheet when what it shows is gone */
export function PopupCloser(props: {register: (hide: () => void) => void}) {
  const context = usePopupContext();
  props.register(() => context.hide());
  onCleanup(() => props.register(undefined));
  return <></>;
}
