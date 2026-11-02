/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, For, onCleanup, Show} from 'solid-js';
import type {TonConnectSession} from '@layer';
import type {WalletStatus} from '@appManagers/appWalletManager';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import MediaHeader from '@components/mediaHeader';
import Section from '@components/section';
import Row from '@components/rowTsx';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import {useWallet} from '@components/wallet/context';
import {WalletHeader} from '@components/wallet/parts';
import {TonConnectAppIcon, TonConnectText} from '@components/wallet/tonConnect/parts';
import {getTonConnectManifestInfo} from '@lib/wallet/tonConnect';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import walletStyles from '@components/wallet/wallet.module.scss';
import styles from '@components/wallet/tonConnect/tonConnect.module.scss';

/** the sessions the list shows: connected ones, and ones on their way out */
export function getTonConnectListedSessions(sessions: TonConnectSession[]) {
  return sessions.filter((session) => !session.pFlags.closed && !session.pFlags.pending).sort((a, b) => b.date - a.date);
}

function appName(session: TonConnectSession) {
  return getTonConnectManifestInfo(session)?.name || i18n('Wallet.Apps.Unknown');
}

/**
 * Disconnects apps with the wallet's key: each gets the wallet's disconnect event first (iOS, tdesktop). The toast
 * says what happened; a failure leaves the list as it is.
 */
async function disconnect(status: WalletStatus, sessions: TonConnectSession[]) {
  const [{disconnectTonConnectSessions}, {default: WalletSession}, {default: createWalletSessionUi}] = await Promise.all([
    import('@lib/wallet/tonConnect'),
    import('@lib/wallet/walletSession'),
    import('@components/wallet/vaultPrompts')
  ]);
  WalletSession.get().ui ??= createWalletSessionUi();
  try {
    await disconnectTonConnectSessions(status, sessions);
  } catch(err) {
    const {isUserCancel} = await import('@components/wallet/send');
    if(!isUserCancel(err)) {
      toastNew({langPackKey: sessions.length > 1 ? 'Wallet.Apps.DisconnectAllError' : 'Wallet.Apps.DisconnectError'});
    }

    throw err;
  }

  if(sessions.length > 1) {
    toastNew({langPackKey: 'Wallet.Apps.AllDisconnected'});
  } else {
    const name = getTonConnectManifestInfo(sessions[0])?.name;
    const nameText = name ? <span dir="auto">{wrapEmojiText(name)}</span> as HTMLElement : i18n('Wallet.Apps.Unknown');
    toastNew({langPackKey: 'Wallet.Apps.Disconnected', langPackArguments: [nameText]});
  }
}

/**
 * One app (iOS WalletAppInfoScreen): its icon, name and domain, what it can see, and Disconnect
 */
export function showTonConnectAppPopup(options: {session: TonConnectSession, status: WalletStatus, onDisconnected?: () => void}) {
  const [show, setShow] = createSignal(false);
  const info = getTonConnectManifestInfo(options.session);
  createPopup(() => (
    <PopupElement class={styles.popup} show={show()} closable>
      <PopupElement.Header>
        <PopupElement.CloseButton />
      </PopupElement.Header>
      <PopupElement.Body class={styles.body}>
        <MediaHeader marginTop marginBottom>
          <MediaHeader.Sticker size={88} element={<TonConnectAppIcon icon={info?.icon} name={info?.name} />} />
          <MediaHeader.Title tag="h2">{info?.name ? <span dir="auto">{wrapEmojiText(info.name)}</span> : i18n('Wallet.Apps.Unknown')}</MediaHeader.Title>
          <Show when={info?.domain}>
            <MediaHeader.Subtitle class={styles.domain}><span dir="ltr">{info.domain}</span></MediaHeader.Subtitle>
          </Show>
        </MediaHeader>
        <TonConnectText>{i18n('Wallet.Apps.Permissions')}</TonConnectText>
      </PopupElement.Body>
      <PopupElement.Footer>
        <PopupElement.FooterButton
          color="danger"
          langKey="Wallet.Apps.Disconnect"
          preloader
          callback={() => disconnect(options.status, [options.session]).then(() => {
            options.onDisconnected?.();
            return true;
          }, () => false)}
        />
      </PopupElement.Footer>
    </PopupElement>
  ));
  setShow(true);
}

/**
 * Connected Apps (iOS WalletAppsScreen): the apps with a session, each opening its own sheet, and Disconnect All with
 * its question. A session that changes on the server changes its row.
 */
export default function WalletAppsScreen() {
  const wallet = useWallet();
  const managers = wallet.store.managers.appWalletManager;
  const [sessions, setSessions] = createSignal<TonConnectSession[]>([]);
  const refresh = () => managers.getCachedTonConnectSessions().then((list) => setSessions(getTonConnectListedSessions(list)));
  managers.getTonConnectSessions(true).then((list) => setSessions(getTonConnectListedSessions(list)), refresh);
  rootScope.addEventListener('wallet_tonconnect_session', refresh);
  onCleanup(() => rootScope.removeEventListener('wallet_tonconnect_session', refresh));

  const disconnectAll = async() => {
    try {
      await confirmationPopup({
        titleLangKey: 'Wallet.Apps.DisconnectAllTitle',
        descriptionLangKey: 'Wallet.Apps.DisconnectAllText',
        button: {langKey: 'Wallet.Apps.DisconnectAllAction', isDanger: true}
      });
    } catch(err) {
      return;
    }

    await disconnect(wallet.store.status(), sessions()).catch(() => {});
    refresh();
  };

  return (
    <>
      <WalletHeader title="Wallet.Apps.Title" back />
      <div class={walletStyles.body}>
        <Show
          when={sessions().length}
          fallback={<div class={styles.empty}>{i18n('Wallet.Apps.Empty')}</div>}
        >
          <Section name="Wallet.Apps.ActiveConnections">
            <For each={sessions()}>
              {(session) => {
                const info = getTonConnectManifestInfo(session);
                return (
                  <Row clickable={() => showTonConnectAppPopup({session, status: wallet.store.status(), onDisconnected: refresh})}>
                    <Row.Media size="40" class={styles.rowIcon}>
                      <TonConnectAppIcon icon={info?.icon} name={info?.name} size={40} />
                    </Row.Media>
                    <Row.Title>{info?.name ? <span dir="auto">{wrapEmojiText(info.name)}</span> : appName(session)}</Row.Title>
                    <Row.Subtitle>
                      {session.pFlags.closing ? i18n('Wallet.Apps.Disconnecting') : <span dir="ltr">{info?.domain}</span>}
                    </Row.Subtitle>
                  </Row>
                );
              }}
            </For>
          </Section>
          <Section caption="Wallet.Apps.AllPermissions">
            <Row clickable={disconnectAll} color="danger">
              <Row.Icon icon="delete" />
              <Row.Title>{i18n('Wallet.Apps.DisconnectAll')}</Row.Title>
            </Row>
          </Section>
        </Show>
      </div>
    </>
  );
}
