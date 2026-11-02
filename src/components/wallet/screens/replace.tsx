/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal} from 'solid-js';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {i18n} from '@lib/langPack';
import {useWallet} from '@components/wallet/context';
import {WalletHeader} from '@components/wallet/parts';
import {isUserCancel, withWalletPassword} from '@components/wallet/send';
import {showWalletError, toastWalletAfterBack} from '@components/wallet/alerts';
import styles from '@components/wallet/wallet.module.scss';

/**
 * "How do you want to replace the old wallet?" — the desktop client's choice after Delete Wallet: a new wallet
 * the server makes, or one brought in by its phrase.
 */
export default function WalletReplaceScreen() {
  const wallet = useWallet();
  const store = wallet.store;
  const [busy, setBusy] = createSignal(false);

  const createNew = async() => {
    if(busy()) return;
    setBusy(true);
    try {
      await withWalletPassword('Wallet.Replace.PasswordText', (password) => store.session.replaceWithNew(password));
      await store.refreshStatus(true);
      await store.refreshDeviceMode();
      wallet.router.pop('main');
      toastWalletAfterBack('Wallet.Replace.CreatedTitle', 'Wallet.Replace.CreatedText');
    } catch(err) {
      if(!isUserCancel(err)) showWalletError(err, 'Wallet.Replace.ErrorTitle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <WalletHeader title="Wallet.Replace.Title" back />
      <div class={styles.body}>
        <div class={styles.caption}>{i18n('Wallet.Replace.Text')}</div>
        <Section>
          <Row clickable={createNew} disabled={busy()}>
            <Row.Icon icon="add" />
            <Row.Title>{i18n('Wallet.Replace.Create')}</Row.Title>
            <Row.Subtitle>{i18n('Wallet.Replace.CreateText')}</Row.Subtitle>
          </Row>
          <Row clickable={() => wallet.router.push('restore', {mode: 'import'})} disabled={busy()}>
            <Row.Icon icon="key" />
            <Row.Title>{i18n('Wallet.Replace.Import')}</Row.Title>
            <Row.Subtitle>{i18n('Wallet.Replace.ImportText')}</Row.Subtitle>
          </Row>
        </Section>
      </div>
    </>
  );
}
