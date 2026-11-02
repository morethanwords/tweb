/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createSignal, For, on, onCleanup} from 'solid-js';
import Row from '@components/rowTsx';
import Section from '@components/section';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import {i18n} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import type {WalletParkedWallet} from '@lib/wallet/walletSession';
import {useWallet} from '@components/wallet/context';
import {copyWalletAddress, WalletHeader} from '@components/wallet/parts';
import {formatGrams, gramsToNumber} from '@components/wallet/format';
import WalletAddressGroups from '@components/wallet/addressGroups';
import {showWalletAlert} from '@components/wallet/alerts';
import {formatFullSentTimeRaw} from '@helpers/date';
import styles from '@components/wallet/wallet.module.scss';
import keysStyles from '@components/wallet/screens/keys.module.scss';
import conflictStyles from '@components/wallet/screens/conflict.module.scss';

/**
 * The wallet used before on this device (tdesktop's conflict box): its address, its phrase to save, and "Switch
 * Now", which drops its key so the Telegram wallet goes on alone. Opened from the main screen's notice, or by an
 * action that needs the key: that one goes on once no old key is left, and ends when the user leaves first.
 */
export default function WalletConflictScreen(props: {params?: {onSwitched?: () => void, onLeft?: () => void}}) {
  const wallet = useWallet();
  const store = wallet.store;
  const [busy, setBusy] = createSignal(false);
  const wallets = () => store.parked().wallets;
  // * back past what this screen opened (an old wallet's phrase), not just the screen on top
  const leave = wallet.router.bindLeave();
  let shown = false, settled = false;

  onCleanup(() => {
    if(!settled) props.params?.onLeft?.();
  });

  // * no old key left, by a switch here or anywhere else: the screen is done
  createEffect(on(() => wallets().length, (length) => {
    if(length) {
      shown = true;
      return;
    }

    if(!shown || settled) return;
    settled = true;
    leave();
    props.params?.onSwitched?.();
  }));

  const switchNow = async(item: WalletParkedWallet) => {
    if(busy()) return;
    try {
      await confirmationPopup({
        titleLangKey: 'Wallet.Conflict.Switch',
        descriptionLangKey: 'Wallet.Conflict.SwitchText',
        button: {langKey: 'Wallet.Conflict.Switch', isDanger: true}
      });
    } catch(err) {
      return;
    }

    setBusy(true);
    try {
      await store.session.dropParked(item.record);
      await store.refreshParked();
    } catch(err) {
      // * a key update of that wallet is not settled yet: its new phrase may be the one that signs
      if((err as any)?.type === 'ROTATION_PENDING') {
        showWalletAlert({title: 'Wallet.Backup.PhraseUpdatePendingTitle', text: 'Wallet.Conflict.UpdatePendingText'});
      } else {
        toastNew({langPackKey: 'Wallet.Conflict.SwitchError'});
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <WalletHeader title="Wallet.Conflict.Title" back />
      <div class={classNames(styles.body, keysStyles.body)}>
        <For each={wallets()}>{(item, index) => (
          <Section caption={index() ? undefined : 'Wallet.Conflict.Text'} captionTop class={keysStyles.section}>
            <ParkedAddressRow item={item} />
            <Row clickable={() => wallet.router.push('phrase', {parked: item.record})}>
              <Row.Icon icon="key" />
              <Row.Title>{i18n('Wallet.Keys.ShowPhrase')}</Row.Title>
            </Row>
            <Row clickable={() => switchNow(item)} color="danger" disabled={busy()}>
              <Row.Icon icon="delete" />
              <Row.Title>{i18n('Wallet.Conflict.Switch')}</Row.Title>
            </Row>
          </Section>
        )}</For>
      </div>
    </>
  );
}

/**
 * The old wallet's address in iOS's checkerboard of groups, and under it what it holds and when it was last used
 * here (iOS: the previous wallets of Keys & Backup)
 */
function ParkedAddressRow(props: {item: WalletParkedWallet}) {
  const {store} = useWallet();
  const record = props.item.record;
  const [address, setAddress] = createSignal(record.address);
  store.session.friendlyAddress(record.address).then(setAddress, () => {});

  const copy = () => copyWalletAddress(address());
  const amount = () => {
    const nanos = props.item.nanos;
    const fragment = document.createDocumentFragment();
    fragment.append(
      nanos !== undefined ? formatGrams(nanos, 2) : '—',
      ' ',
      i18n('Wallet.Card.Ticker', [nanos !== undefined ? gramsToNumber(nanos) : 2])
    );
    return fragment;
  };

  return (
    <Row clickable={copy}>
      <Row.Icon icon="wallet" />
      <Row.Title class={conflictStyles.addressTitle}>
        <WalletAddressGroups address={address()} perLine={6} class={conflictStyles.address} />
      </Row.Title>
      <Row.Subtitle>
        {i18n('Wallet.Conflict.LastUsed', [amount(), formatFullSentTimeRaw(Math.floor(record.date / 1000)).dateEl])}
      </Row.Subtitle>
    </Row>
  );
}
