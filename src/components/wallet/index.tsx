/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, lazy, Match, onCleanup, Suspense, Switch} from 'solid-js';
import type {WalletSessionUi} from '@lib/wallet/walletSession';
import PopupElement, {createPopup, usePopupContext} from '@components/popups/indexTsx';
import classNames from '@helpers/string/classNames';
import {createWalletStore} from '@components/wallet/store';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {createWalletRouter} from '@components/wallet/router';
import {WalletContext, WalletContextValue, WalletScreenName} from '@components/wallet/context';
import WalletMainScreen from '@components/wallet/screens/main';
import createWalletSessionUi from '@components/wallet/vaultPrompts';
import {resolveSendRequest, WalletSendRequest} from '@components/wallet/recipient';
import {prepareWalletSendKey, toastWalletError} from '@components/wallet/send';
import {openWalletTransaction} from '@components/wallet/parts';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import {toastNew} from '@components/toast';
import styles from '@components/wallet/wallet.module.scss';

const WalletReceiveScreen = lazy(() => import('@components/wallet/screens/receive'));
const WalletAmountScreen = lazy(() => import('@components/wallet/screens/amount'));
const WalletConfirmScreen = lazy(() => import('@components/wallet/screens/confirm'));
const WalletKeysScreen = lazy(() => import('@components/wallet/screens/keys'));
const WalletPhraseScreen = lazy(() => import('@components/wallet/screens/phrase'));
const WalletRestoreScreen = lazy(() => import('@components/wallet/screens/restore'));
const WalletCurrencyScreen = lazy(() => import('@components/wallet/screens/currency'));
const WalletQuizScreen = lazy(() => import('@components/wallet/screens/quiz'));
const WalletCollectibleScreen = lazy(() => import('@components/wallet/screens/collectible'));
const WalletReplaceScreen = lazy(() => import('@components/wallet/screens/replace'));
const WalletCollectibleSendScreen = lazy(() => import('@components/wallet/screens/collectibleSend'));
const WalletConflictScreen = lazy(() => import('@components/wallet/screens/conflict'));
const WalletRecipientScreen = lazy(() => import('@components/wallet/screens/recipient'));
const WalletAppsScreen = lazy(() => import('@components/wallet/tonConnect/appsScreen'));

const LAZY_SCREENS: {[name in Exclude<WalletScreenName, 'main'>]: {preload: () => Promise<unknown>}} = {
  receive: WalletReceiveScreen,
  amount: WalletAmountScreen,
  confirm: WalletConfirmScreen,
  keys: WalletKeysScreen,
  phrase: WalletPhraseScreen,
  restore: WalletRestoreScreen,
  currency: WalletCurrencyScreen,
  quiz: WalletQuizScreen,
  collectible: WalletCollectibleScreen,
  collectibleSend: WalletCollectibleSendScreen,
  conflict: WalletConflictScreen,
  replace: WalletReplaceScreen,
  recipient: WalletRecipientScreen,
  apps: WalletAppsScreen
};

export type ShowWalletPopupOptions = {
  /** open straight on a screen above the main one */
  screen?: WalletScreenName,
  params?: any,
  /** a send link: resolve the recipient and open straight on the amount screen */
  send?: WalletSendRequest,
  /** the send was started in the recipient's chat: once it is out the window closes and the gem flies into the
   * chat's new transfer card (iOS ChatWalletTransferAnimation) */
  fromChat?: boolean,
  /** a send to a Telegram user ends in their chat: the window closes and the chat opens at its end (iOS: a link's
   * or a profile's send, Android setAllowOpenChat). A request naming its recipient by a link or an address (a send
   * link, an address in a message) does so unless this says no; one from the recipient's chat (`fromChat`) never */
  openChat?: boolean,
  /** a transfer a chat named, in its popup over the window: the window restores the key its comment needs */
  transactionId?: string
};

/** after the window opened: its own animation goes first */
const PRELOAD_DELAY = 600;

/** Tall screens keep the window at its full height, like the design's send screens. */
const TALL_SCREENS: Set<WalletScreenName> = new Set(['amount', 'currency', 'recipient', 'restore']);
const WHITE_SCREENS: Set<WalletScreenName> = new Set(['amount']);

type WalletWindowHandle = {
  /** closes the window for another one: a screen's guard may ask first, `false` once it said no */
  close: () => Promise<boolean>,
  /** what closing the window waits for: a screen's guard may ask first */
  confirmClose?: () => Promise<void> | void
};

let opened: WalletWindowHandle;

function WalletWindow(props: {options: ShowWalletPopupOptions, handle: WalletWindowHandle, onReady: () => void}) {
  const popup = usePopupContext();
  const store = createWalletStore();
  const options = props.options;
  const router = createWalletRouter<WalletScreenName>(
    'main',
    !options.send && options.screen && options.screen !== 'main' ? {name: options.screen, params: options.params} : undefined,
    (name) => name !== 'main' && LAZY_SCREENS[name].preload(),
    popup.shown
  );
  const close = () => popup.hide();
  // * asked once: the window then goes without asking again
  let leaving = false;
  props.handle.close = async() => {
    const answer = router.askClose();
    if(answer && !await answer) return false;
    leaving = true;
    close();
    return true;
  };
  props.handle.confirmClose = () => {
    if(leaving) return;
    const answer = router.askClose();
    // * a no keeps the window: the popup closes only on a promise that resolves
    return answer && new Promise<void>((resolve) => answer.then((leave) => leave && resolve()));
  };

  const ui: WalletSessionUi = store.session.ui = {
    ...createWalletSessionUi(),
    // * an action that needs the key meets an old wallet's key first: the screen settles it, or the action ends
    resolveConflict: () => new Promise<void>((resolve, reject) => {
      router.push('conflict', {onSwitched: resolve, onLeft: () => reject('canceled')});
    })
  };
  // * the prompts outlive the window (a chat's card opens a comment with them), its screens do not
  onCleanup(() => delete ui.resolveConflict);

  const context: WalletContextValue = {store, router, shown: popup.shown, close};

  // * a send request opens the window on its amount screen, not on the main one sliding over to it
  if(options.send) {
    openSend(options.send).catch(() => false).then((opened) => {
      props.onReady();
      // * "Send Money" to someone (a chat, a profile): the key comes onto the device before the amount is typed, over
      // * the window once it shows, as the main screen's Send does. A link asks at its Send, as iOS and Android do
      if(opened && options.send.userId) prepareWalletSendKey(context);
    });
  } else {
    queueMicrotask(props.onReady);
  }

  // * what the main screen's buttons open is loaded while the window settles, so it is there on the first click
  const preloadTimeout = window.setTimeout(() => {
    LAZY_SCREENS.receive.preload();
    LAZY_SCREENS.recipient.preload();
    LAZY_SCREENS.amount.preload();
    import('qr-code-styling' as any).catch(() => {});
  }, PRELOAD_DELAY);
  onCleanup(() => clearTimeout(preloadTimeout));

  if(options.transactionId) {
    openTransaction(options.transactionId);
  }

  async function openTransaction(id: string) {
    try {
      const result = await rootScope.managers.appWalletManager.getTransactionsByIds([id]);
      const transaction = result.transactions[0];
      // * the window was opened for the transfer's comment: it opens as the transfer does (iOS: decryptCommentOnOpen)
      if(transaction) openWalletTransaction(context, {transaction}, {decryptCommentOnOpen: true});
    } catch(err) {}
  }

  /** true once the amount screen is open */
  async function openSend(request: WalletSendRequest) {
    // * a send link that names nobody opens the wallet itself (iOS, Android)
    if(!request.userId && !request.tonLink && !request.to?.trim()) {
      return false;
    }

    try {
      const status = await store.refreshStatus();
      if(status.presence !== 'ready') return false;
      const link = await resolveSendRequest(store, request);
      // * a link names its recipient: a send to a Telegram user from it ends in their chat (iOS OpenResolvedUrl)
      const openChat = !options.fromChat && (options.openChat ?? !!(request.to || request.tonLink));
      await router.push('amount', {...link, fromChat: options.fromChat, openChat}, {instant: true});
      return true;
    } catch(err) {
      toastWalletError(err);
      // * someone else can be picked instead of a recipient that did not resolve; a broken link leaves the wallet as is
      if((err as any)?.type !== 'WALLET_LINK_INVALID') {
        await router.push('recipient', undefined, {instant: true});
      }

      return false;
    }
  }

  return (
    <WalletContext.Provider value={context}>
      <router.Screens
        class={styles.screens}
        screenClass={(entry) => classNames(
          styles.screen,
          entry.name === 'main' && styles.screenWallet,
          TALL_SCREENS.has(entry.name) && styles.screenTall,
          WHITE_SCREENS.has(entry.name) && styles.screenWhite
        )}
      >
        {(entry, isActive) => (
          <Suspense>
            <Switch>
              <Match when={entry.name === 'main'}><WalletMainScreen active={isActive} /></Match>
              <Match when={entry.name === 'collectible'}><WalletCollectibleScreen params={entry.params} /></Match>
              <Match when={entry.name === 'collectibleSend'}><WalletCollectibleSendScreen params={entry.params} /></Match>
              <Match when={entry.name === 'conflict'}><WalletConflictScreen params={entry.params} /></Match>
              <Match when={entry.name === 'receive'}><WalletReceiveScreen params={entry.params} /></Match>
              <Match when={entry.name === 'amount'}><WalletAmountScreen params={entry.params} active={isActive} /></Match>
              <Match when={entry.name === 'confirm'}><WalletConfirmScreen params={entry.params} /></Match>
              <Match when={entry.name === 'keys'}><WalletKeysScreen /></Match>
              <Match when={entry.name === 'phrase'}><WalletPhraseScreen params={entry.params} /></Match>
              <Match when={entry.name === 'quiz'}><WalletQuizScreen params={entry.params} /></Match>
              <Match when={entry.name === 'restore'}><WalletRestoreScreen params={entry.params} /></Match>
              <Match when={entry.name === 'replace'}><WalletReplaceScreen /></Match>
              <Match when={entry.name === 'currency'}><WalletCurrencyScreen /></Match>
              <Match when={entry.name === 'recipient'}><WalletRecipientScreen params={entry.params} /></Match>
              <Match when={entry.name === 'apps'}><WalletAppsScreen /></Match>
            </Switch>
          </Suspense>
        )}
      </router.Screens>
    </WalletContext.Provider>
  );
}

/**
 * Opens the wallet window; settles once it shows — for a send request, once its amount screen is ready
 */
export default async function showWalletPopup(options: ShowWalletPopupOptions = {}): Promise<void> {
  // * the account it is asked for on: the window does not open over another one the tab switched to meanwhile
  const managers = bindManagersToSession(rootScope.managers);
  // * the server can switch the wallet off for an account: every way in says so instead (iOS, Android)
  if((await apiManagerProxy.getAppConfig()).wallet_available === false) {
    toastNew({langPackKey: 'Wallet.Unavailable'});
    return;
  }

  // * opening straight on a screen: its code is in before the window shows, so the window never opens empty
  if(options.screen && options.screen !== 'main') {
    await LAZY_SCREENS[options.screen].preload();
  }

  // * one window at a time: the open one goes first — a screen's guard may ask, and a no keeps it instead of this one
  const previous = opened;
  if(previous && !await previous.close()) return;
  // * another open came while it was asked: that one is the window now
  if(opened && opened !== previous) return;
  // * this handle is the open one until its own window closes
  const handle: WalletWindowHandle = opened = {close: async() => true};

  const [show, setShow] = createSignal(false);
  let shown: () => void;
  const showing = new Promise<void>((resolve) => shown = resolve);
  createPopup(() => (
    <PopupElement
      managers={managers}
      class={styles.popup}
      containerClass={styles.container}
      show={show()}
      closable
      isConfirmationNeededOnClose={() => handle.confirmClose?.()}
      onClose={() => {
        if(opened === handle) opened = undefined;
      }}
    >
      <WalletWindow options={options} handle={handle} onReady={() => {
        setShow(true);
        shown();
      }} />
    </PopupElement>
  ));

  return showing;
}
