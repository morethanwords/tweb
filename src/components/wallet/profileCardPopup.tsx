import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import PopupElement, {createPopup, usePopupContext} from '@components/popups/indexTsx';
import WalletCardView, {formatWalletBalanceFiat} from '@components/wallet/card';
import {pickWalletFiatRate, readWalletCurrency} from '@components/wallet/fiat';
import {useAppConfig} from '@stores/appState';
import {WalletCard} from '@layer';
import {AppManagers} from '@lib/managers';
import {bindManagersToSession, getSessionOf} from '@lib/accounts/bindManagersToAccount';
import {isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import rootScope from '@lib/rootScope';
import liteMode from '@helpers/liteMode';
import I18n, {i18n} from '@lib/langPack';
import noop from '@helpers/noop';
import loadFonts from '@helpers/dom/loadFonts';
import {splitGrams} from '@components/wallet/format';
import styles from '@components/wallet/profileCardPopup.module.scss';

export type WalletProfileCardOptions = {
  source: HTMLElement,
  peerId: PeerId,
  card: Pick<WalletCard, 'balance' | 'address'>,
  managers: AppManagers,
  name: string
};

/** The profile's public card; no wallet store or private wallet data is loaded to show it. */
export default function showWalletProfileCard(options: WalletProfileCardOptions) {
  const managers = bindManagersToSession(options.managers);
  const session = getSessionOf(managers);
  const isSelf = options.peerId === rootScope.myId;
  const {whole, fraction} = splitGrams(options.card.balance);
  const currency = readWalletCurrency();
  const usdPerGram = useAppConfig()?.ton_usd_rate;
  let close: () => void = noop;
  createPopup(() => {
    let card: HTMLDivElement, plane: HTMLDivElement;
    let animation: Animation;
    let action = false;
    const [visible, setVisible] = createSignal(false);
    const [ready, setReady] = createSignal(false);
    const [fiatRate, setFiatRate] = createSignal(pickWalletFiatRate(currency, usdPerGram));
    let disposed = false;
    onCleanup(() => { disposed = true; });
    // A late monospace font swaps the card's text and lays it out again during the flight.
    // Load its subsets while the popup is hidden; cached fonts do not add a network wait.
    loadFonts({monospace: [options.name.toUpperCase(), options.card.address, `${whole}${fraction} ${currency}`]}).then(() => {
      if(disposed) return;
      if(!options.source.isConnected || (session && isSessionLeaving(session))) {
        close();
        return;
      }
      setReady(true);
    });

    const sourceTransform = () => {
      const source = options.source;
      if(!source.isConnected || source.ownerDocument !== plane.ownerDocument) return;
      const from = source.getBoundingClientRect(), to = plane.getBoundingClientRect();
      if(!from.width || !from.height || !to.width || !to.height) return;
      return {
        x: from.x + from.width / 2 - to.x - to.width / 2,
        y: from.y + from.height / 2 - to.y - to.height / 2,
        scale: Math.min(from.width / to.height, from.height / to.width)
      };
    };

    const pose = (source: ReturnType<typeof sourceTransform>) => source ?
      `translate(${source.x}px, ${source.y}px) rotate(${I18n.getIsRTL() ? 90 : -90}deg) scale(${source.scale})` : 'none';

    onMount(() => {
      if(!liteMode.isAvailable('motion')) return;
      const source = sourceTransform();
      if(!source) return;
      // Paint the source pose during preparation, so its first raster is not part of the flight.
      card.style.transform = pose(source);
      card.style.visibility = 'visible';
      card.style.willChange = 'transform, opacity';
    });

    const animate = (closing: boolean) => {
      if(!card) return;
      // Capture an interrupted opening before cancelling it; closing never jumps to the final card.
      const current = closing && animation ? card.ownerDocument.defaultView.getComputedStyle(card) : undefined;
      const start = current ? {transform: current.transform, opacity: current.opacity} : undefined;
      const source = liteMode.isAvailable('motion') ? sourceTransform() : undefined;
      animation?.cancel();
      card.style.transform = '';
      card.style.visibility = '';
      card.style.willChange = '';
      if(!liteMode.isAvailable('animations')) return;
      const small = {
        transform: pose(source),
        // A travelling card must be visible at its source, not fade in near its destination.
        opacity: source ? 1 : 0
      };
      const full = {transform: 'none', opacity: 1};
      // One continuous transform: no intermediate keyframes that stop the rotation or overshoot the size.
      card.style.willChange = 'transform, opacity';
      const next = animation = card.animate(closing ? [start || full, small] : [small, full], {
        duration: source ? (closing ? 180 : 300) : 150,
        easing: closing ? 'ease-in' : 'cubic-bezier(.25, .1, .25, 1)',
        fill: 'both'
      });
      next.finished.then(() => {
        if(animation !== next || closing) return;
        next.cancel();
        animation = undefined;
        card.style.willChange = '';
      }, noop);
    };

    onCleanup(() => animation?.cancel());
    const Content = () => {
      const popup = usePopupContext();
      close = popup.hide;
      return <>
        <Show when={popup.element}>{(element) => (
          <Portal mount={element()}>
            <div class={styles.backdrop} data-wallet-profile-card-backdrop aria-hidden="true" />
          </Portal>
        )}</Show>
        <PopupElement.Header class="sr-only">
          <PopupElement.Title title="Wallet.Card.Name" class="sr-only" />
        </PopupElement.Header>
        <div class={styles.caption} dir="auto">
          {i18n('WalletProfileCardBalance', [
            <bdi dir="auto">{options.name}</bdi> as HTMLElement,
            <bdi dir="ltr">{whole + fraction} GRAM</bdi> as HTMLElement
          ])}
        </div>
        <div ref={plane} class={styles.plane}>
          <div ref={card} data-wallet-profile-card class={styles.card} aria-hidden={!visible()}>
            <WalletCardView
              balance={() => String(options.card.balance)}
              address={() => options.card.address}
              name={() => options.name}
              fiat={() => fiatRate() ? formatWalletBalanceFiat(String(options.card.balance), fiatRate().perGram, currency) : ''}
              fiatPerGram={() => fiatRate()?.perGram}
              currency={() => currency}
              visible={visible}
              still
            />
          </div>
        </div>
        <PopupElement.Footer>
          <PopupElement.Button
            class={styles.send}
            noDefaultClass
            iconLeft="gram_filled"
            langKey={isSelf ? 'WalletOpenMyWallet' : 'WalletProfileCardSend'}
            callback={() => { action = true; }}
          />
        </PopupElement.Footer>
      </>;
    };

    return <PopupElement
      managers={managers}
      show={ready()}
      class={`popup-wallet-profile-card ${styles.popup}`}
      containerClass={styles.container}
      closable
      onShow={() => {
        setVisible(true);
        animate(false);
        if(!fiatRate()) {
          // Do not repaint the face with a late rate while its surface is travelling.
          (animation?.finished || Promise.resolve()).then(() => {
            if(disposed || !visible()) return;
            return managers.appWalletManager.getRates();
          }).then((rates) => {
            if(!disposed) setFiatRate(pickWalletFiatRate(currency, usdPerGram, rates?.rates));
          }, noop);
        }
      }}
      onClose={() => {
        setVisible(false);
        animate(true);
      }}
      onCloseAfterTimeout={() => {
        if(!action || (session && isSessionLeaving(session))) return;
        void import('@components/wallet').then(({default: showWalletPopup}) => {
          if(!session || !isSessionLeaving(session)) {
            void showWalletPopup(isSelf ? undefined : {send: {userId: options.peerId.toUserId()}});
          }
        });
      }}
    ><Content /></PopupElement>;
  });
  return {close: () => close()};
}
