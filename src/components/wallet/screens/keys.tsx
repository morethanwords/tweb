/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, Show} from 'solid-js';
import Row from '@components/rowTsx';
import Section from '@components/section';
import confirmationPopup from '@components/confirmationPopup';
import {putPreloader} from '@components/putPreloader';
import I18n, {i18n} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import {useWallet} from '@components/wallet/context';
import {showWalletAlert} from '@components/wallet/alerts';
import {toastNew} from '@components/toast';
import {WalletHeader} from '@components/wallet/parts';
import {enableWalletBackup, startWalletBackupDisable} from '@components/wallet/rotation';
import styles from '@components/wallet/wallet.module.scss';
import keysStyles from '@components/wallet/screens/keys.module.scss';

/**
 * Keys & Backup (iOS: WalletSettingsScreen): the secret phrase — shown when this device can get at it, typed in when it
 * cannot — the encrypted backup switched on and off, the wallet replaced, and what this device keeps.
 */
export default function WalletKeysScreen() {
  const wallet = useWallet();
  const store = wallet.store;
  const state = () => store.status().state;
  const mode = () => store.deviceMode();
  const full = () => mode() === 'full';
  // * one or the other: the phrase is there to show (the key, or the backup to restore it from), or it is typed in
  const canReveal = () => mode() === 'full' || mode() === 'restorable';
  const canEnter = () => mode() === 'notRestorable';

  const forget = async() => {
    // * the key the question is about: one another tab put in its place meanwhile is not dropped on this answer
    const recordId = (await store.session.vault.getCustody().catch((): undefined => undefined))?.recordId;
    if(!recordId) {
      store.refreshDeviceMode();
      return;
    }

    // * what goes with the key, said as the logout confirmation says it: a key with no backup takes the money along
    let description: DocumentFragment;
    try {
      const {readWalletLoss, describeWalletLoss} = await import('@lib/wallet/logoutLoss');
      const loss = await readWalletLoss(store.session.vault.ownerId, () => store.managers.appWalletManager.getCachedStatus(), {currentOnly: true});
      description = describeWalletLoss('Wallet.Keys.ForgetText', loss);
    } catch(err) {}

    try {
      await confirmationPopup({
        titleLangKey: 'Wallet.Keys.Forget',
        descriptionLangKey: description ? undefined : 'Wallet.Keys.ForgetText',
        description,
        button: {langKey: 'Wallet.Keys.Forget', isDanger: true}
      });
    } catch(err) {
      return;
    }

    try {
      if(!(await store.session.forgetKey(recordId))) {
        toastNew({langPackKey: 'Wallet.Error.Generic'});
      }
    } catch(err) {
      if((err as any)?.type === 'ROTATION_PENDING') {
        showWalletAlert({title: 'Wallet.Backup.PhraseUpdatePendingTitle', text: 'Wallet.Keys.ForgetUpdatePendingText'});
        return;
      }

      throw err;
    }

    store.refreshDeviceMode();
  };

  // * one at a time, a spinner on the row meanwhile; no question first (iOS)
  const [enabling, setEnabling] = createSignal(false);
  const enableBackup = async() => {
    if(enabling()) return;
    setEnabling(true);
    try {
      await enableWalletBackup(wallet, {
        retry: enableBackup,
        // * the phrase is typed, then the backup goes on with it
        enterPhrase: () => wallet.router.push('restore', {mode: 'enableBackup'})
      });
    } finally {
      setEnabling(false);
    }
  };

  const deleteWallet = async() => {
    try {
      await confirmationPopup({
        titleLangKey: 'Wallet.Keys.Delete',
        descriptionLangKey: 'Wallet.Keys.DeleteText',
        button: {langKey: 'Wallet.Keys.DeleteAnyway', isDanger: true}
      });
    } catch(err) {
      return;
    }

    wallet.router.push('replace');
  };

  // * one at a time: the steps before the question (the key, the passcode) take a moment
  let disabling = false;
  const disableBackup = async() => {
    if(disabling) return;
    disabling = true;
    try {
      await startWalletBackupDisable(wallet);
    } finally {
      disabling = false;
    }
  };

  return (
    <>
      <WalletHeader title="Wallet.Keys.Title" back />
      <div class={classNames(styles.body, keysStyles.body)}>
        <Show when={canReveal() || canEnter()}>
          <Section
            name="Wallet.Keys.PhraseSection"
            caption={canEnter() ? 'Wallet.Keys.RestoreCaption' : 'Wallet.Keys.PhraseCaption'}
            class={keysStyles.section}
          >
            <Show
              when={canEnter()}
              fallback={
                <Row clickable={() => wallet.router.push('phrase', {})}>
                  <Row.Icon icon="key" />
                  <Row.Title>{i18n('Wallet.Keys.ShowPhrase')}</Row.Title>
                </Row>
              }
            >
              <Row clickable={() => wallet.router.push('restore', {})}>
                <Row.Icon icon="edit" />
                <Row.Title>{i18n('Wallet.Keys.Restore')}</Row.Title>
              </Row>
            </Show>
          </Section>
        </Show>

        <Show when={state()?.pFlags.backup_enabled || state()?.pFlags.can_enable_backup}>
          <Section
            name="Wallet.Keys.BackupSection"
            caption={state()?.pFlags.backup_enabled ? 'Wallet.Keys.BackupOn' : 'Wallet.Keys.BackupOff'}
            class={keysStyles.section}
          >
            <Show
              when={state()?.pFlags.backup_enabled}
              fallback={
                <Row clickable={enableBackup}>
                  <Row.Icon icon="lock" />
                  <Row.Title
                    titleRight={enabling() && (
                      <span class={keysStyles.spinner} role="status" aria-label={I18n.format('Loading', true)}>
                        {putPreloader(undefined, true)}
                      </span>
                    )}
                  >
                    {i18n('Wallet.Keys.BackupEnable')}
                  </Row.Title>
                </Row>
              }
            >
              <Row clickable={disableBackup} color="danger">
                <Row.Icon icon="lockoff" />
                <Row.Title>{i18n('Wallet.Keys.BackupDisable')}</Row.Title>
              </Row>
            </Show>
          </Section>
        </Show>

        <Section caption="Wallet.Keys.DeleteText" class={keysStyles.section}>
          <Row clickable={deleteWallet} color="danger">
            <Row.Icon icon="delete" />
            <Row.Title>{i18n('Wallet.Keys.Delete')}</Row.Title>
          </Row>
        </Section>

        <Section name="Wallet.Keys.DeviceSection" caption="Wallet.Keys.ForgetText" class={keysStyles.section}>
          <Row>
            <Row.Icon icon="devices" />
            <Row.Title>{i18n(full() ? 'Wallet.Keys.DeviceKey' : 'Wallet.Keys.DeviceNoKey')}</Row.Title>
          </Row>
          <Show when={full()}>
            <Row clickable={forget} color="danger">
              <Row.Icon icon="delete" />
              <Row.Title>{i18n('Wallet.Keys.Forget')}</Row.Title>
            </Row>
          </Show>
        </Section>
      </div>
    </>
  );
}
