/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, createMemo, createSignal, For, JSX, Match, on, onCleanup, Show, Switch, untrack} from 'solid-js';
import liteMode from '@helpers/liteMode';
import {bindActiveWindowListener} from '@helpers/appWindow';
import {AnimationList} from '@helpers/solid/animationList';
import {CROSS_FADE_KEYFRAMES} from '@helpers/dom/crossfadeContent';
import createHistoryMotion from '@components/wallet/historyMotion';
import watchWalletListEnd from '@components/wallet/listEnd';
import useStars from '@stores/stars';
import A11yButton from '@components/a11yButton';
import Icon from '@components/icon';
import {ButtonMenuToggleTsx} from '@components/buttonMenuToggleTsx';
import Button from '@components/buttonTsx';
import Section from '@components/section';
import Row from '@components/rowTsx';
import FeatureRows from '@components/featureRows';
import PopupElement from '@components/popups/indexTsx';
import {IconTsx} from '@components/iconTsx';
import {walletAboutRows} from '@components/wallet/howItWorks';
import I18n, {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {useWallet} from '@components/wallet/context';
import {openWalletTransaction, WalletHeader, WalletHistoryRow, WalletHistorySkeletonRow} from '@components/wallet/parts';
import {prepareWalletSendKey} from '@components/wallet/send';
import {WalletCollectibles} from '@components/wallet/collectibles';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import {I18nTsx} from '@helpers/solid/i18n';
import WalletCardView, {formatWalletBalanceFiat, WALLET_NO_FIAT, WalletCardHandle} from '@components/wallet/card';
import type {WalletCardScrollHeader} from '@components/wallet/cardScroll';
import type {WalletHistoryItem} from '@components/wallet/store';
import {absNanos, compareNanos, formatGrams, gramsToNumber, splitGrams} from '@components/wallet/format';
import classNames from '@helpers/string/classNames';
import {canShowWalletGramTooltip, showWalletGramTooltip, WalletGramTooltip} from '@components/wallet/gramTooltip';
import styles from '@components/wallet/wallet.module.scss';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

const DUST_NANOS = '1000000';
const EARNINGS_MIN_NANOS = '10000000000';

/** the hint over the gem waits for the window to settle */
const TOOLTIP_DELAY = 600;
/** iOS: the tabs' contents and what comes and goes on the screen change over 0.25 s, ease in and out */
const TAB_FADE = 250;
/** placeholder rows while the first page of the history loads (Android: three) */
const SKELETON_ROWS = [0, 1, 2];

/** What comes and goes on the screen (a notice, the empty state) fades in and out where it stands (iOS) */
function WalletFade(props: {children: JSX.Element}) {
  return (
    <AnimationList
      animationOptions={{duration: TAB_FADE, easing: 'ease-in-out'}}
      keyframes={CROSS_FADE_KEYFRAMES}
      mode="add-remove"
    >
      {props.children}
    </AnimationList>
  );
}

export default function WalletMainScreen(props: {active: Accessor<boolean>}) {
  const wallet = useWallet();
  const store = wallet.store;
  const isCurrent = wallet.router.watchCurrent();
  const [name, setName] = createSignal('');
  const [scroller, setScroller] = createSignal<HTMLDivElement>();
  const [cardHandle, setCardHandle] = createSignal<WalletCardHandle>();
  const [folded, setFolded] = createSignal(false);

  getPeerTitle({peerId: rootScope.myId, plainText: true}).then(setName);

  const state = () => store.status().state;
  // * every poll brings a new status: the card hears of the balance only when it changed. Less than a thousandth of
  // * a Gram reads as nothing (iOS displayBalance)
  const balance = createMemo(() => {
    const nanos = String(state()?.balance ?? 0);
    return compareNanos(absNanos(nanos), DUST_NANOS) < 0 ? '0' : nanos;
  });
  // * nothing until the rate is known, not a zero
  const fiat = () => store.fiatPerGram() ? formatWalletBalanceFiat(balance(), store.fiatPerGram(), store.currency()) : '';

  const openItem = (item: WalletHistoryItem) => {
    openWalletTransaction(wallet, item);
  };

  const menuButtons = () => [{
    icon: 'cash_circle' as Icon,
    className: 'with-subtitle',
    // * what the wallet counts in, under the item (iOS)
    get regularText() {
      const text = document.createElement('span');
      text.classList.add(styles.menuTwoLines);
      const subtitle = document.createElement('span');
      subtitle.classList.add('btn-menu-item-subtitle');
      subtitle.textContent = store.currency();
      text.append(i18n('Wallet.Menu.Currency'), subtitle);
      return text;
    },
    onClick: () => wallet.router.push('currency')
  }, {
    icon: 'key' as Icon,
    text: 'Wallet.Menu.Keys' as const,
    onClick: () => wallet.router.push('keys')
  }, {
    // * while an app is connected (iOS, Android)
    icon: 'apps' as Icon,
    text: 'Wallet.Menu.Apps' as const,
    onClick: () => wallet.router.push('apps'),
    verify: () => hasApps()
  }, {
    icon: 'lock' as Icon,
    text: 'Wallet.Menu.Lock' as const,
    onClick: () => store.session.vault.lock(),
    verify: () => store.session.vault.isUnlocked()
  }, {
    // * another passcode for the key on this device, or none (iOS: "Passcode & Face ID")
    icon: 'shield' as Icon,
    text: 'Wallet.Menu.Passcode' as const,
    onClick: () => import('@components/wallet/vaultPrompts').then(({showWalletPasscodeSettings}) => showWalletPasscodeSettings(store.session.vault)),
    verify: async() => !!(await store.session.vault.getKind().catch((): undefined => undefined))
  }, {
    icon: 'info' as Icon,
    text: 'Wallet.Menu.What' as const,
    separator: true,
    onClick: () => import('@components/wallet/howItWorks').then(({default: showWalletHowItWorksPopup}) => showWalletHowItWorksPopup())
  }];

  // * TON Connect: what this device still owes the connected apps goes when the window opens, and the menu offers the
  // * apps while there are any
  const [hasApps, setHasApps] = createSignal(false);
  const onTonConnectSession = () => {
    rootScope.managers.appWalletManager.getCachedTonConnectSessions().then((sessions) => {
      setHasApps(!!sessions?.some((session) => !session.pFlags.pending && !session.pFlags.closed));
    });
  };
  rootScope.addEventListener('wallet_tonconnect_session', onTonConnectSession);
  onCleanup(() => rootScope.removeEventListener('wallet_tonconnect_session', onTonConnectSession));
  rootScope.managers.appWalletManager.getTonConnectSessions().then(onTonConnectSession, () => {});
  // * after the window's own entrance: the flow's code (and its crypto) is not the window's
  const tonConnectTimeout = window.setTimeout(() => {
    import('@components/wallet/tonConnect').then(({refreshTonConnect}) => refreshTonConnect()).then(onTonConnectSession, () => {});
  }, 1000);
  onCleanup(() => clearTimeout(tonConnectTimeout));

  // * without Two-Step Verification anyone with this login could export the phrase: tdesktop nudges here too. A
  // * password that waits for its email's confirmation counts as one (tdesktop, iOS)
  const [noPassword, setNoPassword] = createSignal(false);
  let passwordToast: number, passwordCheck: Promise<void>;
  onCleanup(() => clearTimeout(passwordToast));
  const checkPassword = () => passwordCheck ??= rootScope.managers.passwordManager.getState().then((state) => {
    setNoPassword(!state.pFlags.has_password && !state.email_unconfirmed_pattern);
    // * back from setting the password up: say it worked (iOS, 0.4 s after the screen is back)
    if(awaitingTwoStep && state.pFlags.has_password) {
      awaitingTwoStep = false;
      passwordToast = window.setTimeout(showPasswordSetToast, 400);
    }
  }).catch(() => {}).finally(() => {
    passwordCheck = undefined;
  });
  checkPassword();
  // * turned on or off elsewhere (another tab, another device) while the wallet is open: read again when its window
  // * is back in front (tdesktop follows the password's state, Android hears of a change)
  onCleanup(bindActiveWindowListener((win) => win, 'focus', checkPassword));
  const openTwoStep = async() => {
    const state = await wallet.store.managers.passwordManager.getState();
    awaitingTwoStep = true;
    wallet.close();
    hotReloadGuard.appSidebarLeft.createTab(hotReloadGuard.tabs.AppTwoStepVerificationTab).open({state});
  };

  // * money left in the old wallet bot: its own app takes it from there
  const [waltUrl, setWaltUrl] = createSignal<string>();
  rootScope.managers.appWalletManager.getExistingWaltBalance().then((result) => {
    if(result.pFlags.has_balance && result.url) setWaltUrl(result.url);
  }).catch(() => {});
  const openWalt = () => {
    const url = waltUrl();
    wallet.close();
    hotReloadGuard.appImManager.openUrl(url);
  };

  // * what the account earned in Grams (a channel's or a bot's revenue), once it is worth taking (iOS: 10 Grams)
  const earnings = useStars(true);
  const hasEarnings = () => {
    const value = earnings();
    return !!value && compareNanos(value, EARNINGS_MIN_NANOS) >= 0;
  };
  const openEarnings = () => {
    import('@components/popups/stars').then(({default: showStarsPopup}) => showStarsPopup({ton: true}));
  };
  const earningsText = () => {
    const amount = document.createElement('span');
    amount.classList.add(styles.earningsAmount);
    amount.append(Icon('gram_filled'), formatGrams(earnings()));
    return i18n('Wallet.EarningsBalance', [amount]);
  };

  // * the key of a wallet used before on this device: what it holds, when the chain said. Its own screen comes
  // * first, and the read-only notice waits for it, as in tdesktop
  const parkedText = () => {
    const nanos = store.parked().nanos;
    return nanos && nanos !== '0' ? i18n('Wallet.Conflict.Existing', [formatGrams(nanos)]) : i18n('Wallet.Conflict.Bar');
  };

  // * the tabs show up only for a wallet that holds collectibles, the way the desktop client does it; once the
  // * last one left, the transactions are the tab again
  const [tab, setTab] = createSignal<'transactions' | 'collectibles'>('transactions');
  createEffect(() => {
    if(!store.nfts.items().length) setTab('transactions');
  });
  // * a transfer just sent shows in the history: a collectible's too, from the collectibles tab (tdesktop)
  createEffect(on(() => store.pending.list().length, (length, previous) => {
    if(length > (previous ?? 0)) setTab('transactions');
  }, {defer: true}));

  // * the tab that leaves fades out over the one that comes, then hides (iOS: 0.25 s ease in and out)
  let historyPane: HTMLDivElement, collectiblesPane: HTMLDivElement;
  const [leavingPane, setLeavingPane] = createSignal<'transactions' | 'collectibles'>();
  const paneShown = (pane: 'transactions' | 'collectibles') => tab() === pane || leavingPane() === pane;
  createEffect(on(tab, (value, previous) => {
    if(!previous || previous === value || !liteMode.isAvailable('animations')) return;
    const entering = value === 'collectibles' ? collectiblesPane : historyPane;
    const leaving = value === 'collectibles' ? historyPane : collectiblesPane;
    const options: KeyframeAnimationOptions = {duration: TAB_FADE, easing: 'ease-in-out'};
    setLeavingPane(previous);
    entering?.animate([{opacity: 0}, {opacity: 1}], options);
    const animation = leaving?.animate([{opacity: 1}, {opacity: 0}], {...options, fill: 'forwards'});
    const done = () => {
      animation?.cancel();
      if(leavingPane() === previous) setLeavingPane();
    };

    animation ? animation.finished.then(done, done) : done();
    onCleanup(done);
  }, {defer: true}));

  // * the rows fade in and out as they come and go, the others move (iOS)
  const historyMotion = createHistoryMotion({items: store.history.items, scroller});

  // * under the list: transfers below the minimum are not listed (iOS: always said)
  const historyCaption = () => i18n('Wallet.HiddenBelow', [formatGrams(store.config().minNanos)]);

  const ready = () => store.status().presence === 'ready';
  // * what the wallet is shows while it has nothing — no transfer, and no collectible either (Android)
  const historyEmpty = createMemo(() => store.history.loaded() && !store.history.items().length && store.history.ended() && !store.nfts.items().length);

  // * the header lies over the history: the card folds away under it and its balance settles in its middle
  let top: HTMLDivElement, edge: HTMLDivElement, navClip: HTMLDivElement, navPrimary: HTMLSpanElement, navIcon: HTMLElement, navText: HTMLSpanElement, navFiat: HTMLSpanElement;
  const [overlay, setOverlay] = createSignal<HTMLDivElement>();
  const [room, setRoom] = createSignal<HTMLDivElement>();
  const header = (): WalletCardScrollHeader => ({
    top,
    title: top.querySelector<HTMLElement>('.popup-title'),
    edge,
    navClip,
    navPrimary,
    navIcon,
    navText,
    navFiat
  });

  // * the next page of the tab's list once its end (the fold's room under it) is near: on a scroll, and while a page
  // * of mostly hidden dust leaves too few rows to scroll. The first page is the store's; a failed one waits for its
  // * Retry, a collectible's retries are spaced by the store
  watchWalletListEnd({
    root: scroller,
    end: room,
    margin: 400,
    canLoad: () => tab() === 'collectibles' ?
      !store.nfts.loading() && !store.nfts.ended() :
      store.history.loaded() && !store.history.loading() && !store.history.ended() && !store.history.error(),
    loadMore: () => tab() === 'collectibles' ? store.nfts.loadMore() : store.history.loadMore()
  });

  const navParts = () => splitGrams(balance());

  // * "Gram — Digital currency for Telegram" over the gem, once the window settled on the unfolded card (iOS)
  let tooltip: WalletGramTooltip;
  const address = createMemo(() => state()?.address);
  createEffect(() => {
    const handle = cardHandle(), walletAddress = address();
    // * the count it reads is a store: showing the hint changes it, which must not take the hint away
    if(!handle || !props.active() || !wallet.shown() || !untrack(() => canShowWalletGramTooltip(walletAddress))) return;
    const timeout = window.setTimeout(() => {
      if(!handle.root.isConnected || handle.scroll?.fraction || !canShowWalletGramTooltip(walletAddress)) return;
      tooltip = showWalletGramTooltip({
        address: walletAddress,
        card: handle.root,
        screen: handle.root.closest<HTMLElement>('[data-screen]') || handle.root,
        gem: handle.gem(),
        onDismiss: () => tooltip = undefined
      });
    }, TOOLTIP_DELAY);
    onCleanup(() => {
      clearTimeout(timeout);
      tooltip?.dismiss(false);
    });
  });

  const onCardReady = (handle: WalletCardHandle) => {
    setCardHandle(handle);
    if(handle.scroll) {
      handle.scroll.onFolded = setFolded;
      // * a scroll sends the hint away
      handle.scroll.onScroll = () => tooltip?.dismiss();
    }
  };

  return (
    <>
      <div ref={top} class={styles.top}>
        <WalletHeader title="Wallet.Title">
          <ButtonMenuToggleTsx
            buttonOptions={{ariaLabel: 'MultiAccount.More'}}
            direction="bottom-left"
            buttons={menuButtons()}
          />
        </WalletHeader>

        {/* * the balance the card's own flies into: tapped once the card folded away, it scrolls back up (iOS) */}
        <div ref={navClip} class={styles.navClip} style={{'clip-path': 'inset(100%)'}}>
          <A11yButton
            as="div"
            role="button"
            class={styles.navBalance}
            classList={{[styles.isFolded]: folded()}}
            aria-hidden={!folded() || undefined}
            inert={!folded() || undefined}
            onClick={() => cardHandle()?.scroll?.scrollToTop()}
          >
            {/* * named by what it shows — "Balance 1,720.58 Grams $3,647.63": the card's own figures are folded away
              * by then, and the gem stands for the unit on screen only */}
            <span class="sr-only">{i18n('StarsBalance')}</span>
            <span ref={navPrimary} class={styles.navPrimary}>
              <IconTsx ref={navIcon} icon="gram_filled" class={styles.navIcon} />
              <span ref={navText}>{navParts().whole}<span class={styles.navFraction}>{navParts().fraction}</span></span>
            </span>
            <span class="sr-only">{I18n.format('Wallet.Card.Ticker', true, [gramsToNumber(balance())])}</span>
            <span ref={navFiat} class={styles.navFiat}>{fiat() || WALLET_NO_FIAT}</span>
          </A11yButton>
        </div>
      </div>

      <div ref={edge} class={styles.topEdge} />

      <div
        ref={setScroller}
        class={classNames(styles.content, styles.contentScrolled)}
      >
        <div class={styles.contentInner}>
          <Switch>
            <Match when={store.status().presence === 'unknown'}>
              <div class={styles.state}><span class="preloader" /></div>
            </Match>
            <Match when={store.status().presence === 'provisioning'}>
              <div class={styles.state}>{i18n('Wallet.Provisioning')}</div>
            </Match>
            <Match when={store.status().presence === 'unavailable' || store.status().presence === 'missing'}>
              <div class={styles.state}>{i18n('Wallet.Unavailable')}</div>
            </Match>
            <Match when={store.status().presence === 'error'}>
              <div class={styles.state}>
                {i18n('Wallet.LoadError')}
                <Button primaryTransparent text="Wallet.Retry" onClick={() => store.refreshStatus(true)} />
              </div>
            </Match>
            <Match when={ready()}>
              <WalletCardView
                balance={balance}
                fiat={fiat}
                fiatPerGram={store.fiatPerGram}
                currency={store.currency}
                name={name}
                address={() => store.friendlyAddress() || state()?.address}
                visible={() => props.active() && wallet.shown()}
                scroller={scroller}
                header={header}
                overlay={overlay}
                room={room}
                onReady={onCardReady}
                onClick={() => wallet.router.push('receive')}
              />

              {/* * the footer's buttons, side by side under the card */}
              <div class={styles.actions}>
                <PopupElement.FooterButton langKey="Wallet.AddFunds" callback={() => {
                  wallet.router.push('receive');
                  return false;
                }} />
                <PopupElement.FooterButton langKey="Wallet.Send" preloader callback={async() => {
                  // * a device that cannot sign gets the key first, before the recipient (iOS, Android)
                  if(await prepareWalletSendKey(wallet) && isCurrent()) wallet.router.push('recipient');
                  return false;
                }} />
              </div>

              {/* * what wants attention, as settings rows: the row acts, the caption explains; they fade in and
                * out as they come and go (iOS) */}
              <WalletFade>
                <Show when={store.parked().wallets.length}>
                  <Section>
                    <Row clickable={() => wallet.router.push('conflict')}>
                      <Row.Icon icon="key" />
                      <Row.Title>{parkedText()}</Row.Title>
                    </Row>
                  </Section>
                </Show>
              </WalletFade>

              <WalletFade>
                <Show when={waltUrl()}>
                  <Section>
                    <Row clickable={openWalt}>
                      <Row.Icon icon="wallet" />
                      <Row.Title>{i18n('Wallet.Walt')}</Row.Title>
                    </Row>
                  </Section>
                </Show>
              </WalletFade>

              <WalletFade>
                <Show when={hasEarnings()}>
                  <Section>
                    <Row clickable={openEarnings}>
                      <Row.Icon icon="gram_filled" />
                      <Row.Title>{earningsText()}</Row.Title>
                    </Row>
                  </Section>
                </Show>
              </WalletFade>

              <WalletFade>
                {/* * while there is something to lose: a balance or a history (tdesktop) */}
                <Show when={noPassword() && (balance() !== '0' || store.history.items().length)}>
                  <Section caption="Wallet.ProtectAccount">
                    <Row clickable={openTwoStep}>
                      <Row.Icon icon="lock" />
                      <Row.Title>{i18n('TwoStepVerification')}</Row.Title>
                    </Row>
                  </Section>
                </Show>
              </WalletFade>

              <WalletFade>
                <Show when={store.deviceMode() === 'notRestorable' && !store.parked().wallets.length}>
                  <Section caption="Wallet.ReadOnly">
                    <Row clickable={() => wallet.router.push('restore')}>
                      <Row.Icon icon="key" />
                      <Row.Title>{i18n('Wallet.ReadOnly.Restore')}</Row.Title>
                    </Row>
                  </Section>
                </Show>
              </WalletFade>

              <Show when={store.nfts.items().length}>
                <ChipTabs center class={styles.tabs} value={tab()} view="surface" onChange={(value) => {
                  setTab(value as 'transactions' | 'collectibles');
                }}>
                  <ChipTab value="transactions"><I18nTsx key="Wallet.Tab.Transactions" /></ChipTab>
                  <ChipTab value="collectibles"><I18nTsx key="Wallet.Tab.Collectibles" /></ChipTab>
                </ChipTabs>
              </Show>

              {/* * the two tabs' contents stand in one place and cross-fade (iOS: 0.25 s) */}
              <div class={styles.tabPanes}>
                <Show when={store.nfts.items().length}>
                  <div
                    ref={collectiblesPane}
                    class={styles.history}
                    hidden={!paneShown('collectibles')}
                    inert={tab() !== 'collectibles' || undefined}
                  >
                    <WalletCollectibles items={store.nfts.items()} onOpen={(item) => wallet.router.push('collectible', {item})} />
                    <Show when={store.nfts.loading()}>
                      <div class={styles.state}><span class="preloader" /></div>
                    </Show>
                    <Show when={store.nfts.error() && !store.nfts.loading()}>
                      <Button class={styles.historyMore} primaryTransparent text="Wallet.Retry" onClick={() => store.nfts.loadMore()} />
                    </Show>
                  </div>
                </Show>

                <div
                  ref={historyPane}
                  class={styles.history}
                  hidden={!paneShown('transactions')}
                  inert={tab() !== 'transactions' || undefined}
                >
                  <WalletFade>
                    <Show
                      when={!historyEmpty()}
                      fallback={
                        // * nothing yet: what the wallet is, and the terms that come with it (iOS)
                        <Section caption="Wallet.Terms">
                          <FeatureRows rows={walletAboutRows(store.config().gaslessDaily)} />
                        </Section>
                      }
                    >
                      <div class={styles.history} aria-busy={store.history.loading() || undefined}>
                        <Show when={store.history.items().length}>
                          <Section caption={historyCaption()}>
                            <For each={historyMotion.items()}>
                              {(item) => (
                                <WalletHistoryRow
                                  item={item}
                                  onClick={openItem}
                                  ref={(element) => historyMotion.register(item.key, element)}
                                />
                              )}
                            </For>
                          </Section>
                        </Show>
                        {/* * the first page: rows of the history's own shape while it loads (Android); a spinner under
                          * the later ones */}
                        <Show when={store.history.loading()}>
                          <Show
                            when={store.history.loaded()}
                            fallback={
                              <Section>
                                <For each={SKELETON_ROWS}>{(index) => <WalletHistorySkeletonRow index={index} />}</For>
                              </Section>
                            }
                          >
                            <div class={styles.state}><span class="preloader" /></div>
                          </Show>
                        </Show>
                        <Show when={store.history.error()}>
                          <Button class={styles.historyMore} primaryTransparent text="Wallet.Retry" onClick={() => store.history.loadMore()} />
                        </Show>
                      </div>
                    </Show>
                  </WalletFade>
                </div>
              </div>
            </Match>
          </Switch>
          <div ref={setRoom} class={styles.foldRoom} />
        </div>
      </div>

      <div ref={setOverlay} class={styles.flightLayer} />
    </>
  );
}

/** Set while the user sets a password up from the wallet: the wallet says it worked when it is back */
let awaitingTwoStep = false;

function showPasswordSetToast() {
  import('@components/toast').then(({toast}) => {
    const content = document.createElement('span'), title = document.createElement('b');
    title.append(i18n('Wallet.PasswordSetTitle'));
    content.append(title, document.createElement('br'), i18n('Wallet.PasswordSetText'));
    toast(content);
  });
}
