import {createSignal, onCleanup} from 'solid-js';
import PopupElement, {createPopup, usePopupContext} from '@components/popups/indexTsx';
import WalletCardView from '@components/wallet/card';
import {WalletCard} from '@layer';
import {AppManagers} from '@lib/managers';
import {bindManagersToSession, getSessionOf} from '@lib/accounts/bindManagersToAccount';
import {isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import rootScope from '@lib/rootScope';
import liteMode from '@helpers/liteMode';
import I18n, {i18n} from '@lib/langPack';
import noop from '@helpers/noop';
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
  let close: () => void = noop;
  createPopup(() => {
    let card: HTMLDivElement, plane: HTMLDivElement;
    let animation: Animation;
    let action = false;
    const [visible, setVisible] = createSignal(false);

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

    const animate = (closing: boolean) => {
      if(!card) return;
      // Capture an interrupted opening before cancelling it; closing never jumps to the final card.
      const current = closing && animation ? card.ownerDocument.defaultView.getComputedStyle(card) : undefined;
      const start = current ? {transform: current.transform, opacity: current.opacity} : undefined;
      const source = liteMode.isAvailable('motion') ? sourceTransform() : undefined;
      animation?.cancel();
      if(!liteMode.isAvailable('animations')) return;
      const angle = I18n.getIsRTL() ? 90 : -90;
      const small = {
        transform: source ? `translate(${source.x}px, ${source.y}px) rotate(${angle}deg) scale(${source.scale})` : 'none',
        opacity: 0
      };
      const full = {transform: 'none', opacity: 1};
      const opening: Keyframe[] = source ? [
        {...small, offset: 0},
        {transform: `translate(${source.x * .25}px, ${source.y * .25}px) rotate(${angle}deg) scale(.8)`, opacity: 1, offset: .28},
        {transform: 'rotate(0deg) scale(1.02)', opacity: 1, offset: .86},
        {...full, offset: 1}
      ] : [small, full];
      animation = card.animate(closing ? [start || full, small] : opening, {
        duration: source ? (closing ? 220 : 640) : 150,
        easing: 'cubic-bezier(.2, .8, .2, 1)',
        fill: 'both'
      });
    };

    onCleanup(() => animation?.cancel());
    const Content = () => {
      const popup = usePopupContext();
      close = popup.hide;
      return <>
        <PopupElement.Header class={styles.header}>
          <PopupElement.CloseButton />
          <PopupElement.Title title="Wallet.Card.Name" class="sr-only" />
        </PopupElement.Header>
        <div class={styles.caption} dir="auto">
          {i18n('WalletProfileCardBalance', [
            <bdi dir="auto">{options.name}</bdi> as HTMLElement,
            <bdi dir="ltr">{whole + fraction} GRAM</bdi> as HTMLElement
          ])}
        </div>
        <div ref={plane} class={styles.plane}>
          <div ref={card} data-wallet-profile-card class={styles.card}>
            <WalletCardView
              balance={() => String(options.card.balance)}
              address={() => options.card.address}
              name={() => options.name}
              fiat={() => ''}
              fiatPerGram={() => undefined}
              currency={() => 'USD'}
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
      class={`popup-wallet-profile-card ${styles.popup}`}
      containerClass={styles.container}
      closable
      onShow={() => {
        setVisible(true);
        animate(false);
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
