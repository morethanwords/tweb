/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import {IconTsx} from '@components/iconTsx';
import liteMode from '@helpers/liteMode';
import {i18n} from '@lib/langPack';
import I18n from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import {WalletCard} from '@components/wallet/visual/card/card';
import {cardGemCenter, DESIGN} from '@components/wallet/visual/card/layout';
import {addWalletFrameClient, requestWalletFrame} from '@components/wallet/frameLoop';
import {WalletCardScroll, WalletCardScrollHeader} from '@components/wallet/cardScroll';
import {formatFiat, groupAddress, splitGrams} from '@components/wallet/format';
import styles from '@components/wallet/wallet.module.scss';

/** iOS writes a dash where the fiat value goes until the rate is known */
export const WALLET_NO_FIAT = '—';

/** a balance's value in fiat: an empty wallet's without decimals (iOS: `$0`) */
export function formatWalletBalanceFiat(nanos: string, fiatPerGram: number, currency: string) {
  return formatFiat(nanos, fiatPerGram, currency, nanos === '0' ? 0 : undefined);
}

export type WalletCardHandle = {
  root: HTMLElement,
  /** the screen's scroll choreography; none without a header to fly to */
  scroll?: WalletCardScroll,
  /** the gem's middle and visible width on the card, px from the card's corner */
  gem: () => {x: number, y: number, width: number}
};

/**
 * The balance card. With WebGL2 it is the design's 3D card (tilt, light, live gem), held still with reduced
 * animations; without it, or with the animations off, the flat card of the design with the same text on it. Given
 * the screen's header, it folds away under it as the history scrolls, and its balance flies into the header
 * (cardScroll.ts). Right to left its text stands mirrored, the gem and the QR chip with it.
 */
export default function WalletCardView(props: {
  /** nanos */
  balance: Accessor<string>,
  /** empty until the rate is known */
  fiat: Accessor<string>,
  fiatPerGram: Accessor<number>,
  currency: Accessor<string>,
  name: Accessor<string>,
  address: Accessor<string>,
  /** the card is on screen and its screen is the active one */
  visible: Accessor<boolean>,
  scroller?: Accessor<HTMLElement>,
  /** what the scroll needs from the screen: its header, the layer over the history, the history's last piece */
  header?: Accessor<WalletCardScrollHeader>,
  overlay?: Accessor<HTMLElement>,
  room?: Accessor<HTMLElement>,
  onReady?: (handle: WalletCardHandle) => void,
  onClick?: () => void
}) {
  let root: HTMLDivElement, fold: HTMLDivElement, shadow: HTMLDivElement, background: HTMLCanvasElement,
    face: HTMLDivElement, design: HTMLDivElement, shading: HTMLDivElement, gem: HTMLCanvasElement,
    balance: HTMLDivElement, gemSlot: HTMLSpanElement, gemClip: HTMLDivElement, amount: HTMLSpanElement,
    fraction: HTMLSpanElement, currency: HTMLSpanElement, fiat: HTMLDivElement, fiatValue: HTMLSpanElement,
    name: HTMLDivElement, address: HTMLDivElement;

  const [flat, setFlat] = createSignal(!liteMode.isAvailable('animations'));
  let card: WalletCard;

  const fiatText = (value: string) => value || WALLET_NO_FIAT;
  const showStaticBalance = () => {
    const {whole, fraction: fractionText} = splitGrams(props.balance());
    amount.textContent = whole;
    // * the space before the ticker is its margin (visual/card/card.ts showBalance)
    fraction.textContent = fractionText;
    fiatValue.textContent = fiatText(props.fiat());
  };

  // * the card's balance on its way to the header: built here, shown in the screen's layer over the history
  let flightRoot: HTMLDivElement, flightGroup: HTMLDivElement, flightPrimary: HTMLDivElement,
    flightIcon: HTMLDivElement, flightGem: HTMLCanvasElement, flightText: HTMLSpanElement,
    flightAmount: HTMLSpanElement, flightFraction: HTMLSpanElement, flightCurrency: HTMLSpanElement,
    flightSecondary: HTMLDivElement;
  const flight = (
    <div ref={flightRoot} class={styles.flight} hidden aria-hidden="true">
      <div ref={flightGroup} class={styles.flightGroup}>
        <div ref={flightPrimary} class={styles.flightPrimary}>
          <div ref={flightIcon} class={styles.flightIcon}>
            <Show
              when={!flat()}
              fallback={<IconTsx icon="gram_filled" class={styles.cardGemFallback} />}
            >
              <canvas ref={flightGem} class={styles.flightGem} />
            </Show>
          </div>
          <span ref={flightText} class={classNames(styles.cardAmount, styles.flightText)}>
            <span ref={flightAmount} />
            <span ref={flightFraction} class={styles.cardFraction} />
            <span ref={flightCurrency} class={styles.cardCurrency}>GRAM</span>
          </span>
        </div>
        <div ref={flightSecondary} class={classNames(styles.cardFiatText, styles.flightSecondary)} dir="ltr" />
      </div>
    </div>
  ) as HTMLDivElement;

  let scroll: WalletCardScroll;

  onMount(() => {
    if(!flat()) {
      try {
        card = new WalletCard({root, fold, shadow, background, face, design, gem, balance, amount, fraction, currency, fiat: fiatValue});
        card.setMirrored(I18n.getIsRTL());
      } catch(err) {
        console.warn('wallet: flat card, no WebGL2', err);
        setFlat(true);
      }
    }

    // * the language turned the other way: the gem and the chip follow the text once it stands mirrored, and the
    // * balance's flight is measured again (the direction is put on the document after the signal changes)
    createEffect(on(I18n.isRTL, (rtl) => {
      const cancel = requestWalletFrame(() => {
        card?.setMirrored(rtl);
        scroll?.measure();
        scroll?.update();
      });
      onCleanup(cancel);
    }, {defer: true}));

    const scroller = props.scroller?.(), header = props.header?.(), overlay = props.overlay?.();
    if(scroller && header && overlay) {
      overlay.append(flight);
      scroll = new WalletCardScroll({
        scroller,
        room: props.room(),
        card: {
          root, fold, shadow, shading, design, balance, gemSlot, gemClip, amount, fraction, currency, fiat,
          details: [name, address],
          card
        },
        flight: {
          root: flightRoot,
          group: flightGroup,
          primary: flightPrimary,
          icon: flightIcon,
          gem: card ? flightGem : undefined,
          text: flightText,
          amount: flightAmount,
          fraction: flightFraction,
          currency: flightCurrency,
          secondary: flightSecondary
        },
        header
      });

      onCleanup(() => {
        scroll.destroy();
        flight.remove();
      });
    }

    props.onReady?.({
      root,
      scroll,
      gem: () => {
        const s = root.offsetWidth / DESIGN.width;
        const [x, y] = card ? card.gemCenter() : cardGemCenter(I18n.getIsRTL());
        return {x: x * s, y: y * s, width: DESIGN.gemWidth * s};
      }
    });

    if(!card) {
      // * the flat card's design units follow its width too, as the 3D card's do
      const resizeObserver = new ResizeObserver(() => {
        if(root.clientWidth) design.style.transform = `scale(${root.clientWidth / DESIGN.width})`;
      });
      resizeObserver.observe(root);
      onCleanup(() => resizeObserver.disconnect());
      createEffect(() => {
        showStaticBalance();
        scroll?.syncText();
      });
      return;
    }

    // * the digits as every other amount of the wallet writes them, the flat card's included
    card.setBalanceFormatter(splitGrams);
    createEffect(on(props.balance, (nanos) => card.setBalance(nanos)));

    // * the fiat line follows the counting balance, in the chosen currency; a dash until the rate is known
    createEffect(() => {
      const perGram = props.fiatPerGram(), code = props.currency();
      card.setFiatFormatter((nanos) => fiatText(perGram ? formatWalletBalanceFiat(nanos, perGram, code) : ''));
    });

    // * the background canvas covers all the card paints, its rim included: scrolled away, nothing is drawn
    const detach = addWalletFrameClient({
      frame: (now) => {
        card.frame(now);
        // * the balance in flight follows the card's own tilt and its running count
        if(scroll?.isFlying) {
          scroll.syncText();
          scroll.onCardFrame();
        }
      },
      isVisible: props.visible,
      element: background,
      onHidden: () => card.resetClock()
    });

    onCleanup(() => {
      detach();
      card.destroy();
    });
  });

  // * a click is a press that did not move: dragging tilts the card or turns the gem; a press on the gem turns
  // * it and opens nothing (iOS)
  let down: [number, number];
  const onPointerDown = (e: PointerEvent) => {
    down = [e.clientX, e.clientY];
  };

  const onClick = (e: MouseEvent) => {
    if(card?.pressedGem || (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6)) {
      return;
    }

    props.onClick?.();
  };

  const addressLines = () => groupAddress(props.address() || '', 6);

  return (
    <div
      ref={root}
      class={classNames(styles.card, flat() && styles.cardFlat)}
      role="group"
      aria-label={I18n.format('Wallet.Card.Name', true)}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <div ref={fold} class={styles.cardFold}>
        <div ref={shadow} class={styles.cardShadow} />
        <canvas ref={background} class={styles.cardBackground} aria-hidden="true" />
        <div ref={face} class={styles.cardFace}>
          <div ref={design} class={styles.cardDesign}>
            <div ref={shading} class={styles.cardShading} />
            <div ref={balance} class={styles.cardBalance}>
              <span ref={gemSlot} class={styles.cardGemSlot}>
                <IconTsx icon="gram_filled" class={styles.cardGemFallback} />
              </span>
              <span class={styles.cardAmount}>
                <span ref={amount} />
                <span ref={fraction} class={styles.cardFraction} />
                <span ref={currency} class={styles.cardCurrency}>GRAM</span>
              </span>
            </div>
            {/* * the direction goes on the text inside: on the line itself it would turn its inset-inline-start round */}
            <div ref={fiat} class={classNames(styles.cardFiat, styles.cardFiatText)}><span ref={fiatValue} dir="ltr" /></div>
            <div ref={name} class={styles.cardName}><span dir="auto">{props.name()}</span></div>
            {/* * the address's label beside the turned column, not in it: there it would stand at the lines' start, a
              * place the turn does not mirror */}
            <span class="sr-only">{i18n('Wallet.Card.Address')}</span>
            <div ref={address} class={styles.cardAddress}>
              <span dir="ltr">
                <For each={addressLines()}>{(line, index) => (
                  <>{index() > 0 && <br />}{line}</>
                )}</For>
              </span>
            </div>
            <div ref={gemClip} class={styles.cardGemClip}>
              <canvas ref={gem} class={styles.cardGem} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
