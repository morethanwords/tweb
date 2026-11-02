/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createSignal, Match, Show, Switch} from 'solid-js';
import type {TonConnectManifestInfo} from '@lib/wallet/tonConnect';
import type {WalletRates, WalletStatus} from '@appManagers/appWalletManager';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import MediaHeader from '@components/mediaHeader';
import WalletCardView, {formatWalletBalanceFiat} from '@components/wallet/card';
import {readCurrency} from '@components/wallet/store';
import {PopupCloser, TonConnectAppIcon, TonConnectText} from '@components/wallet/tonConnect/parts';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {toFriendlyTonAddress} from '@lib/wallet/tonAddress';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import styles from '@components/wallet/tonConnect/tonConnect.module.scss';

/** loading the manifest, asking, a dead end with its reason, or a device without the key */
export type TonConnectConnectPhase = 'loading' | 'confirm' | 'notice' | 'restore';

export type TonConnectConnectPopupOptions = {
  phase: Accessor<TonConnectConnectPhase>,
  info: Accessor<TonConnectManifestInfo | undefined>,
  /** the app asks for a proof of the wallet */
  proof: boolean,
  notice?: Accessor<LangPackKey | undefined>,
  /** a failure the next press tries again */
  error?: Accessor<LangPackKey | undefined>,
  status: WalletStatus,
  /** settles once connected; a rejection keeps the sheet */
  onConnect: () => Promise<void>,
  onRestore?: () => void,
  /** the sheet closed, whichever way */
  onClose?: () => void
};

/**
 * "Connect to {app}" (iOS WalletConnectScreen, tdesktop's connect box): the app's icon, name and domain, what it will
 * see, the wallet's card, and that it cannot move funds by itself. Connect stays busy until the manifest is there.
 */
export default function showTonConnectConnectPopup(options: TonConnectConnectPopupOptions) {
  const [show, setShow] = createSignal(false);
  let close: () => void;
  createPopup(() => {
    const phase = options.phase;
    const state = options.status.state;
    const [name, setName] = createSignal('');
    const [rates, setRates] = createSignal<WalletRates>();
    const currency = readCurrency();
    getPeerTitle({peerId: rootScope.myId, plainText: true}).then(setName);
    rootScope.managers.appWalletManager.getRates().then(setRates, () => {});
    const balance = () => String(state?.balance ?? 0);
    const fiatPerGram = () => rates()?.rates[currency] || 0;
    const appName = () => options.info()?.name;
    // * the app's name and its domain in a sentence: each reads in its own direction, apart from the words around it
    const appNameText = () => <span dir="auto">{appName()}</span> as HTMLElement;

    return (
      <PopupElement
        class={styles.popup}
        show={show()}
        closable
        onClose={() => options.onClose?.()}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Body class={styles.body}>
          <MediaHeader marginTop marginBottom>
            <MediaHeader.Sticker
              size={88}
              element={() => (
                <Show when={phase() === 'confirm' && options.info()} keyed fallback={<TonConnectAppIcon loading={phase() === 'loading'} name={appName()} />}>
                  {(info) => <TonConnectAppIcon icon={info.icon} name={info.name} />}
                </Show>
              )}
            />
            <MediaHeader.Title tag="h2">
              {phase() === 'loading' ? i18n('Loading') : appName() ? i18n('Wallet.Connect.Title', [appNameText()]) : i18n('Wallet.Connect.TitleUnknown')}
            </MediaHeader.Title>
            <Show when={options.info()?.domain}>
              <MediaHeader.Subtitle class={styles.domain}><span dir="ltr">{options.info().domain}</span></MediaHeader.Subtitle>
            </Show>
          </MediaHeader>
          <Switch>
            <Match when={phase() === 'notice'}>
              <TonConnectText>{i18n(options.notice?.() || 'Wallet.Connect.Error')}</TonConnectText>
            </Match>
            <Match when={phase() === 'restore'}>
              <TonConnectText>{i18n('Wallet.Connect.Restore')}</TonConnectText>
            </Match>
            <Match when={true}>
              <TonConnectText>{i18n('Wallet.Connect.Permissions')}</TonConnectText>
              <Show when={options.proof && options.info()}>
                <TonConnectText>{i18n('Wallet.Connect.Proof', [<span dir="ltr">{options.info().domain}</span> as HTMLElement])}</TonConnectText>
              </Show>
              <Show when={state}>
                <div class={styles.card}>
                  <WalletCardView
                    balance={balance}
                    fiat={() => fiatPerGram() ? formatWalletBalanceFiat(balance(), fiatPerGram(), currency) : ''}
                    fiatPerGram={fiatPerGram}
                    currency={() => currency}
                    name={name}
                    address={() => toFriendlyTonAddress(state.address) || state.address}
                    visible={show}
                  />
                </div>
              </Show>
              <div class={styles.caption}>{appName() ? i18n('Wallet.Connect.Disclaimer', [appNameText()]) : i18n('Wallet.Connect.DisclaimerUnknown')}</div>
              <Show when={options.error?.()}>
                <div class={styles.error} role="alert">{i18n(options.error())}</div>
              </Show>
            </Match>
          </Switch>
        </PopupElement.Body>
        <PopupElement.Footer class={styles.footer}>
          <Switch>
            <Match when={phase() === 'notice'}>
              <PopupElement.FooterButton langKey="Close" />
            </Match>
            <Match when={phase() === 'restore'}>
              <PopupElement.FooterButton color="secondary" langKey="Cancel" />
              <PopupElement.FooterButton langKey="Wallet.Connect.RestoreAction" callback={() => options.onRestore?.()} />
            </Match>
            <Match when={true}>
              <PopupElement.FooterButton color="secondary" langKey="Cancel" />
              <PopupElement.FooterButton
                langKey="Wallet.Connect.Action"
                disabled={phase() !== 'confirm'}
                preloader
                callback={() => options.onConnect().then(() => true, () => false)}
              />
            </Match>
          </Switch>
        </PopupElement.Footer>
        <PopupCloser register={(hide) => close = hide} />
      </PopupElement>
    );
  });

  setShow(true);
  return {close: () => close?.()};
}
