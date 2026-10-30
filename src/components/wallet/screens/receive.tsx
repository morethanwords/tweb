/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {batch, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import {IconTsx} from '@components/iconTsx';
import {PreloaderTsx} from '@components/putPreloader';
import {showWalletAlert} from '@components/wallet/alerts';
import {i18n} from '@lib/langPack';
import I18n from '@lib/langPack';
import rootScope from '@lib/rootScope';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import Modes from '@config/modes';
import liteMode from '@helpers/liteMode';
import mediaSizes from '@helpers/mediaSizes';
import {bindActiveWindowListener, getAppWindow} from '@helpers/appWindow';
import classNames from '@helpers/string/classNames';
import {copyTextToClipboard} from '@helpers/clipboard';
import {useWallet} from '@components/wallet/context';
import {addWalletFrameClient} from '@components/wallet/frameLoop';
import {groupAddress} from '@components/wallet/format';
import {pixelRatio} from '@components/wallet/visual/dom';
import {easeOut, layoutWalletQr, loadWalletQrMatrix, paintWalletQr, WalletQrLayout, WalletQrMatrix, WalletQrReveal} from '@components/wallet/receive/qr';
import {WalletAddressRing} from '@components/wallet/receive/ring';
import {WalletQrGem} from '@components/wallet/receive/gem';
import styles from '@components/wallet/screens/receive.module.scss';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/**
 * Add Funds, as on iOS (WalletReceiveScreen): a blue sheet with the white card in the middle — the code with the
 * live gem in it, or, after a copy, the address itself — the address running around the card, and a way to buy
 * GRAM. The colours are the same in every theme.
 */

type Face = 'qr' | 'address';

const CARD_RADIUS = 28;
const PILL_HEIGHT = 28;
const RING_OFFSET = 14;
/** the card turning over */
const FLIP_DURATION = 400;
/** the code and the card's faces coming in without movement */
const FADE_DURATION = 180;
/** the code is a transfer link to the address, as on iOS */
const QR_PREFIX = 'ton://transfer/';

/**
 * iOS's geometry for a sheet `width` wide in a window at most `height` tall: the card is 256 wide where there is
 * room, never under 216 unless the width says so; a small card tightens the gaps
 */
function receiveLayout(width: number, height: number) {
  const widthLimited = Math.max(1, width - 104);
  const cardWidth = Math.min(256, widthLimited, Math.max(Math.min(216, widthLimited), Math.max(1, height - 338)));
  const small = cardWidth < 230;
  const qrSize = Math.max(1, cardWidth - 20);
  const cardHeight = qrSize + PILL_HEIGHT + 24;
  const cardTop = small ? 58 : 70;
  const ringWidth = Math.max(1, Math.min(Math.max(1, width - 32), cardWidth + 76));
  return {
    width,
    small,
    cardWidth,
    cardHeight,
    cardTop,
    cardLeft: Math.floor((width - cardWidth) / 2),
    qrSize,
    imageSide: Math.max(1, qrSize - 12),
    ringWidth,
    ringHeight: cardHeight + 56,
    ringLeft: Math.floor((width - ringWidth) / 2),
    ringTop: cardTop - 28
  };
}

/** the tallest the wallet window may be (`--wallet-panel-max`), in the window the app is in (the tab, or its PiP) */
const windowHeight = () => mediaSizes.isMobile ? getAppWindow().innerHeight : Math.min(720, getAppWindow().innerHeight - 48);

/** a curve that goes there and back, as keyframes */
const arc = (frame: (value: number) => Keyframe) => Array.from({length: 21}, (_, index) => frame(Math.sin(Math.PI * index / 20)));

export default function WalletReceiveScreen(props: {params?: {face?: Face}}) {
  const wallet = useWallet();
  const store = wallet.store;
  const address = () => store.friendlyAddress() || store.status().state?.address;
  const [layout, setLayout] = createSignal(receiveLayout(mediaSizes.isMobile ? getAppWindow().innerWidth : 420, windowHeight()));
  const [face, setFace] = createSignal<Face>(props.params?.face === 'address' ? 'address' : 'qr');
  // * the face turning away: it stays on screen until the turn is over
  const [leaving, setLeaving] = createSignal<Face>();
  const [cutout, setCutout] = createSignal<WalletQrLayout['cutoutRect']>();
  const [flatGem, setFlatGem] = createSignal(!liteMode.isAvailable('animations'));
  // * read live: the system's reduced motion (with the a11y layer) can come or go while the sheet is open
  const motion = createMemo(() => liteMode.isAvailable('motion'));
  const [fontsReady, setFontsReady] = createSignal(false);
  const [announcement, setAnnouncement] = createSignal('');
  const groups = createMemo(() => groupAddress(address() || '', 1));

  let root: HTMLDivElement, ringCanvas: HTMLCanvasElement, flip: HTMLDivElement, qrBlock: HTMLDivElement,
    qrCanvas: HTMLCanvasElement, gemCanvas: HTMLCanvasElement, gemHit: HTMLDivElement;
  const faces: {[face in Face]?: HTMLDivElement} = {}, shades: {[face in Face]?: HTMLDivElement} = {};
  let ring: WalletAddressRing, gem: WalletQrGem;
  let flipAnimations: Animation[] = [], flipTimeout: number;

  // * the screen comes in with its code ready: it starts to appear as the screen does
  let codeSettled: () => void;
  wallet.router.holdEntrance(new Promise<void>((resolve) => codeSettled = resolve));

  // MARK: The code

  let code: {address: string, matrix: WalletQrMatrix, layout: WalletQrLayout, canvas: HTMLCanvasElement};
  /** the address whose code has come in: the reveal plays once per address */
  let revealedAddress: string;
  let revealPending = false;
  let reveal: {start: number, runner?: WalletQrReveal};
  let buildId = 0;

  const isFaceShown = (value: Face) => face() === value || leaving() === value;

  const drawCode = () => {
    const ctx = qrCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
    ctx.drawImage(code.canvas, 0, 0);
  };

  const finishReveal = () => {
    if(revealPending || reveal) {
      revealPending = false;
      reveal = undefined;
      qrBlock.style.opacity = '';
      drawCode();
    }
  };

  // * the raw address comes first and the friendly one a moment later: only the last build started goes on
  createEffect(on([address, layout], async([value, {imageSide}]) => {
    if(!value) return;
    const id = ++buildId;
    try {
      const matrix = code?.address === value ? code.matrix : await loadWalletQrMatrix(QR_PREFIX + value);
      if(id !== buildId) return;
      const qrLayout = layoutWalletQr(matrix, imageSide, pixelRatio());
      const canvas = document.createElement('canvas');
      paintWalletQr(canvas, matrix, qrLayout);
      code = {address: value, matrix, layout: qrLayout, canvas};
      qrCanvas.width = canvas.width;
      qrCanvas.height = canvas.height;
      const rect = qrLayout.cutoutRect;
      setCutout(rect);
      gem?.setCutout(rect.side);
      gem?.setCode(canvas, [rect.x + rect.side / 2, rect.y + rect.side / 2], imageSide);
      reveal = undefined;
      revealPending = revealedAddress !== value && liteMode.isAvailable('animations');
      if(!revealPending) {
        qrBlock.style.opacity = '';
        drawCode();
      }
    } catch(err) {
      console.error('wallet: QR paint failed', err);
    } finally {
      codeSettled();
    }
  }));

  // MARK: Frames

  onMount(() => {
    const screen = root.closest<HTMLElement>('[data-screen]');
    const measure = (width: number) => {
      const next = receiveLayout(width, windowHeight());
      const current = layout();
      if(next.width !== current.width || next.cardWidth !== current.cardWidth) setLayout(next);
    };

    // * sized before it comes in: the window's height follows the screen's as it slides
    measure(screen?.parentElement?.clientWidth || layout().width);
    const resizeObserver = new ResizeObserver(([entry]) => {
      if(entry.contentRect.width) measure(entry.contentRect.width);
    });
    resizeObserver.observe(root);
    const unbindResize = bindActiveWindowListener((win) => win, 'resize', () => measure(layout().width));
    onCleanup(() => {
      resizeObserver.disconnect();
      unbindResize();
    });

    const fonts = document.fonts?.load(`500 13px "Roboto Mono"`) || Promise.resolve();
    fonts.catch(() => {}).then(() => setFontsReady(true));

    if(!flatGem()) {
      try {
        gem = new WalletQrGem(gemCanvas, gemHit, {
          motion: motion(),
          // * a press on the gem during the reveal shows the code at once
          onHold: finishReveal
        });
        const rect = cutout();
        if(rect && code) {
          gem.setCutout(rect.side);
          gem.setCode(code.canvas, [rect.x + rect.side / 2, rect.y + rect.side / 2], code.layout.imageSide);
        }
      } catch(err) {
        console.warn('wallet: flat gem, no WebGL2', err);
        gem = undefined;
        setFlatGem(true);
      }
    }

    if(!liteMode.isAvailable('animations')) {
      return;
    }

    const frame = (now: number) => {
      if(revealPending && code && isFaceShown('qr')) {
        revealPending = false;
        revealedAddress = code.address;
        reveal = {start: now, runner: motion() ? new WalletQrReveal(qrCanvas, code.canvas, code.layout) : undefined};
        if(motion()) {
          gem?.drop(now);
        } else {
          // * without movement the code just fades in
          drawCode();
        }
      }

      if(reveal) {
        const elapsed = now - reveal.start;
        if(reveal.runner) {
          if(!reveal.runner.frame(elapsed)) reveal = undefined;
        } else if(elapsed >= FADE_DURATION / 1000) {
          qrBlock.style.opacity = '';
          reveal = undefined;
        } else {
          qrBlock.style.opacity = String(easeOut(elapsed / (FADE_DURATION / 1000)));
        }
      }

      if(motion()) ring?.frame(now);
      if(gem && code && isFaceShown('qr')) gem.frame(now);
    };

    // * nothing is drawn while the screen is under another one or the window is closing
    const detach = addWalletFrameClient({
      frame,
      isVisible: () => wallet.shown() && !!screen && !screen.hidden,
      element: root,
      isBusy: () => revealPending || !!reveal || !!gem?.busy,
      onHidden: () => {
        finishReveal();
        ring?.resetClock();
        gem?.resetClock();
      }
    });

    onCleanup(detach);
  });

  // * the ring and the gem stop where they are, or turn on from there with no jump
  createEffect(on(motion, (value) => {
    gem?.setMotion(value);
    ring?.resetClock();
  }, {defer: true}));

  onCleanup(() => {
    flipAnimations.forEach((animation) => animation.cancel());
    clearTimeout(flipTimeout);
    gem?.destroy();
  });

  // * the address around the card, once its font is in
  createEffect(() => {
    const value = address(), {ringWidth, ringHeight, cardWidth, cardHeight} = layout();
    if(!fontsReady()) return;
    ring ??= new WalletAddressRing(ringCanvas);
    ring.setup(value, {
      width: ringWidth,
      height: ringHeight,
      cardWidth,
      cardHeight,
      cardRadius: CARD_RADIUS,
      offset: RING_OFFSET
    }, pixelRatio());
  });

  // MARK: The card

  /**
   * The card turns over to the other face: half a turn about its vertical axis with a dip in size and a shade at
   * the edge; without movement the faces crossfade. Nothing on it answers until it is done.
   */
  const turn = (to: Face) => {
    const from = face();
    if(from === to || leaving()) return;
    const outgoing = faces[from], incoming = faces[to];
    const hadFocus = Modes.a11y && outgoing.contains(outgoing.ownerDocument.activeElement);
    const done = () => {
      flipAnimations.forEach((animation) => animation.cancel());
      flipAnimations = [];
      clearTimeout(flipTimeout);
      setLeaving();
      if(hadFocus) incoming.querySelector<HTMLElement>('button')?.focus({preventScroll: true});
    };

    if(!liteMode.isAvailable('animations')) {
      setFace(to);
      done();
      return;
    }

    batch(() => {
      setLeaving(from);
      setFace(to);
    });

    if(liteMode.isAvailable('motion')) {
      const options: KeyframeAnimationOptions = {duration: FLIP_DURATION, easing: 'ease-out', fill: 'both'};
      // * it turns over the other way right to left, as the line runs
      const half = I18n.getIsRTL() ? -180 : 180;
      flipAnimations = [
        outgoing.animate([{transform: 'rotateY(0deg)'}, {transform: `rotateY(${half}deg)`}], options),
        incoming.animate([{transform: `rotateY(${-half}deg)`}, {transform: 'rotateY(0deg)'}], options),
        flip.animate(arc((value) => ({transform: `scale(${1 - 0.1 * value})`})), options),
        shades[from].animate(arc((value) => ({opacity: 0.55 * value})), options),
        shades[to].animate(arc((value) => ({opacity: 0.55 * value})), options)
      ];
    } else {
      const options: KeyframeAnimationOptions = {duration: FADE_DURATION, easing: 'ease-in-out', fill: 'both'};
      flipAnimations = [
        outgoing.animate([{opacity: 1}, {opacity: 0}], options),
        incoming.animate([{opacity: 0}, {opacity: 1}], options)
      ];
    }

    // * the end comes by the clock: an animation's promise may never settle in a hidden tab
    flipTimeout = window.setTimeout(done, (liteMode.isAvailable('motion') ? FLIP_DURATION : FADE_DURATION) + 20);
  };

  // * the plain address goes to the clipboard; the card's other face is what says so
  const copyAddress = () => {
    const value = address();
    if(!value || leaving()) return;
    copyTextToClipboard(value);
    setAnnouncement(I18n.format('Wallet.Receive.AddressCopied', true));
    turn('address');
  };

  const showQr = () => {
    if(leaving()) return;
    setAnnouncement('');
    turn('qr');
  };

  // MARK: Buy

  // * Telegram's own provider sells GRAM here; without it the button explains that buying is unavailable
  const [onramp, setOnramp] = createSignal<boolean>();
  const [opening, setOpening] = createSignal(false);
  rootScope.managers.appWalletManager.isOnrampAvailable().then((available) => setOnramp(available), () => setOnramp(false));

  const buy = async() => {
    const available = onramp(), value = address();
    if(available === undefined || opening() || !value) return;
    if(!available) {
      showWalletAlert({title: 'Wallet.Receive.PurchaseUnavailableTitle', text: 'Wallet.Receive.PurchaseUnavailableText'});
      return;
    }

    setOpening(true);
    try {
      const session = await rootScope.managers.appWalletManager.createOnrampSession(value);
      // * the provider is a bot's Mini App: the app opens the link itself, as it opens the old wallet's bot
      if(!session?.url || !wrapUrl(session.url).onclick) {
        throw new Error('wallet: the onramp link is not an app link');
      }

      const appImManager = hotReloadGuard.appImManager;
      wallet.close();
      appImManager.openUrl(session.url);
    } catch(err) {
      setOpening(false);
      showWalletAlert({title: 'Wallet.Receive.PurchaseFailedTitle', text: 'Wallet.Receive.PurchaseFailedText'});
    }
  };

  const gemCenter = () => {
    const rect = cutout();
    return rect && {left: `${6 + rect.x + rect.side / 2}px`, top: `${6 + rect.y + rect.side / 2}px`};
  };

  return (
    // * a short window scrolls the sheet, with no bar on the blue (the app's scrollers hide theirs too)
    <div ref={root} class={classNames(styles.root, 'no-scrollbar', layout().small && styles.small)}>
      <h2 class="sr-only">{i18n('Wallet.AddFunds')}</h2>
      <button
        type="button"
        class={styles.close}
        aria-label={I18n.format('Close', true)}
        onClick={() => wallet.router.pop()}
      >
        <IconTsx icon="close" />
      </button>

      <div class={styles.stage} style={{height: `${layout().ringTop + layout().ringHeight}px`}}>
        <canvas
          ref={ringCanvas}
          class={styles.ring}
          aria-hidden="true"
          style={{
            'left': `${layout().ringLeft}px`,
            'top': `${layout().ringTop}px`,
            'width': `${layout().ringWidth}px`,
            'height': `${layout().ringHeight}px`
          }}
        />
        <div
          class={styles.card}
          style={{
            'left': `${layout().cardLeft}px`,
            'top': `${layout().cardTop}px`,
            'width': `${layout().cardWidth}px`,
            'height': `${layout().cardHeight}px`
          }}
        >
          <div ref={flip} class={classNames(styles.flip, leaving() && styles.flipping)}>
            <div
              ref={(element) => faces.qr = element}
              class={styles.face}
              hidden={!isFaceShown('qr')}
              inert={face() !== 'qr' || undefined}
            >
              <div
                ref={qrBlock}
                class={styles.qr}
                role="img"
                aria-label={I18n.format('QRCode.Title', true)}
                style={{'width': `${layout().qrSize}px`, 'height': `${layout().qrSize}px`}}
              >
                <canvas
                  ref={qrCanvas}
                  class={styles.qrCanvas}
                  aria-hidden="true"
                  style={{'width': `${layout().imageSide}px`, 'height': `${layout().imageSide}px`}}
                />
                <div class={styles.gem} style={gemCenter()} hidden={!cutout()} aria-hidden="true">
                  <Show
                    when={!flatGem()}
                    fallback={<IconTsx icon="gram_filled" class={styles.gemFlat} style={{'font-size': `${(cutout()?.side || 0) * 0.72}px`}} />}
                  >
                    <canvas ref={gemCanvas} class={styles.gemCanvas} />
                    <div ref={gemHit} class={styles.gemHit} />
                  </Show>
                </div>
              </div>
              <button type="button" class={styles.pill} disabled={!address()} onClick={copyAddress}>
                <IconTsx icon="copy" class={styles.pillIcon} />
                {i18n('Wallet.Receive.CopyAddress')}
              </button>
              <div ref={(element) => shades.qr = element} class={styles.shade} />
            </div>

            <div
              ref={(element) => faces.address = element}
              class={styles.face}
              hidden={!isFaceShown('address')}
              inert={face() !== 'address' || undefined}
            >
              {/* * the address reads left to right, its groups too */}
              <div class={styles.grid} style={{'top': `${layout().small ? 34 : 54}px`}} dir="ltr" aria-hidden="true">
                <For each={groups()}>{(group, index) => <span class={index() % 2 ? styles.groupOdd : undefined}>{group}</span>}</For>
              </div>
              <span class="sr-only">{address()}</span>
              <div
                class={styles.copied}
                style={{'top': `${(layout().small ? 34 + 8 : 54 + 16) + Math.ceil(groups().length / 3) * 26}px`}}
              >
                <span class={styles.check} aria-hidden="true">✓</span>
                {i18n('Wallet.Receive.AddressCopied')}
              </div>
              <button type="button" class={styles.pill} onClick={showQr}>
                {i18n('Wallet.Receive.ShowQR')}
              </button>
              <div ref={(element) => shades.address = element} class={styles.shade} />
            </div>
          </div>
        </div>
      </div>

      <div class={styles.text}>{i18n('Wallet.Receive.Text')}</div>

      <button
        type="button"
        class={classNames(styles.buy, opening() && styles.buyOpening)}
        aria-disabled={onramp() === undefined || opening() || undefined}
        aria-busy={opening() || undefined}
        onClick={buy}
      >
        <span class={styles.buyContent}>
          <IconTsx icon="dollar_circle" class={styles.buyIcon} />
          {i18n('Wallet.Receive.Buy')}
        </span>
        <Show when={opening()}>
          <PreloaderTsx class={styles.buySpinner} />
        </Show>
      </button>

      <div class="sr-only" role="status" aria-live="polite">{announcement()}</div>
    </div>
  );
}
