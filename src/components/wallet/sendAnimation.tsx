/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createRoot, on, onCleanup, onMount} from 'solid-js';
import liteMode from '@helpers/liteMode';
import {getAppWindow, getOverlayRoot} from '@helpers/appWindow';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';
import {useWallet, WalletContextValue} from '@components/wallet/context';
import {getWalletCardScroll} from '@components/wallet/cardScroll';
import type {WalletPendingTransfer, WalletStore} from '@components/wallet/store';
import {
  addWalletFrameClient,
  isWalletElementOnScreen,
  requestWalletFrame,
  watchWalletElement
} from '@components/wallet/frameLoop';
import {flyWalletGemIntoChat} from '@components/wallet/chatCard/flight';
import {Flight, SendFlow} from '@components/wallet/visual/flow/sendFlow';
import {TransferRow} from '@components/wallet/visual/flow/transferRow';
import {clock} from '@components/wallet/visual/clock';
import {GemView, Appearance} from '@components/wallet/visual/gem/stage';
import type {AmountSceneLaunch} from '@components/wallet/visual/amount/scene';
import type {Vec2} from '@components/wallet/visual/math';
import walletStyles from '@components/wallet/wallet.module.scss';
import styles from '@components/wallet/sendAnimation.module.scss';

/**
 * The send after Continue, as the design plays it: the gem of the amount screen is tossed and falls along a
 * parabola into the new pending row of the history while the window slides back to the main screen. The row
 * rises over the list, sags from the hit and keeps the gem spinning while the transfer goes; when the server
 * has it, stars fly out across the row, the gem hops and shrinks into the icon, and the row sits back down.
 *
 * - the main screen's pending rows carry `WalletPendingRowDecor`: the plate, the sheen, the row's gem. Every
 *   transfer that goes plays (iOS), not only the one a gem flew into: the row rises with its own gem once the
 *   main screen shows it;
 * - a screen calls `runWalletSendFlight` once `submitWalletTransfer` resolved;
 * - the store awaits `waitWalletSendSettled(id)` before it swaps the pending row for the transaction.
 *
 * Frames come only from the wallet's frame loop; in lite mode nothing flies, the screen just goes back.
 */

const ROW_GEM_ICON_POP: Keyframe[] = [{transform: 'scale(0.2)', opacity: 0}, {transform: 'scale(1)', opacity: 1}];
/** The longest a confirmed transfer waits for its row to finish: frames may not come in a hidden tab. */
const SETTLE_TIMEOUT = 4000;
/** A row this young comes out from under the buttons as it starts; an older one was in the list already. */
const ENTRANCE_WINDOW = 2000;
const RESTING_WIDTH = 32;
const RESTING_SPIN = 2 * Math.PI / 26;

type RowParts = {
  row: HTMLElement,
  plate: HTMLElement,
  overlay: HTMLCanvasElement,
  gem: HTMLCanvasElement,
  badge: HTMLElement,
  /** "Sending" and the date under it, cross-fading when the transfer went */
  status?: HTMLElement,
  date?: HTMLElement
};

type Attached = {
  /** the flow it plays in; none for a row with no gem */
  state?: FlightState,
  row: TransferRow,
  settled: Promise<void>,
  release: () => void
};

type FlightState = {
  wallet: WalletContextValue,
  flow: SendFlow,
  detachFrame: () => void,
  disposeRoot: () => void,
  disposed: boolean
};

/** The decor of every pending row on screen, by pending id (an operation id: unique) */
const decors: Map<string, RowParts> = new Map();
const states: WeakMap<WalletStore, FlightState> = new WeakMap();
/** Rows that play, by pending id */
const attached: Map<string, Attached> = new Map();

/**
 * The pieces the flow draws over a pending history row. Render it inside the row (it positions itself
 * absolutely against it); it shows nothing until a flight lands in its row.
 */
export function WalletPendingRowDecor(props: {pending: WalletPendingTransfer}) {
  const wallet = useWallet();
  let plate: HTMLDivElement, overlay: HTMLCanvasElement, gem: HTMLCanvasElement, badge: HTMLSpanElement;

  onMount(() => {
    const id = props.pending.id;
    const row = plate.parentElement;
    const parts: RowParts = {
      row,
      plate,
      overlay,
      gem,
      badge,
      status: row.querySelector<HTMLElement>('[data-wallet-row-sending]'),
      date: row.querySelector<HTMLElement>('[data-wallet-row-date]')
    };
    decors.set(id, parts);
    onCleanup(() => {
      if(decors.get(id) === parts) decors.delete(id);
      attached.get(id)?.release();
    });
  });

  // * a transfer that failed stops playing at once
  createEffect(on(() => props.pending.failed, (failed) => {
    if(failed) attached.get(props.pending.id)?.release();
  }, {defer: true}));

  // * every transfer that goes plays once the main screen shows it (iOS); a send about to throw its gem into the
  // * row takes it first — it pops back to this screen and attaches in the same call, before the next frame
  createEffect(() => {
    if(props.pending.failed || !wallet.shown() || wallet.router.current()?.name !== 'main') return;
    const pending = props.pending;
    onCleanup(requestWalletFrame(() => startPendingRow(wallet, pending)));
  });

  return (
    <>
      <div ref={plate} class={styles.plate} hidden />
      <canvas ref={overlay} class={styles.overlay} hidden aria-hidden="true" />
      <canvas ref={gem} class={styles.gem} hidden aria-hidden="true" />
      <span ref={badge} class={styles.badge} hidden aria-hidden="true">
        <svg viewBox="0 0 17 17">
          <circle class={styles.badgeBackground} cx="8.5" cy="8.5" r="8.5" />
          <circle class={styles.badgeRing} cx="8.5" cy="8.5" r="5.6" />
          <g class={`${styles.hand} ${styles.hour}`}>
            <rect class={styles.badgeHand} x="7.85" y="8.5" width="1.3" height="3.6" rx="0.65" transform="rotate(180 8.5 8.5)" />
          </g>
          <g class={`${styles.hand} ${styles.minute}`}>
            <rect class={styles.badgeHand} x="7.85" y="5.95" width="1.3" height="3.2" rx="0.65" transform="rotate(90 8.5 8.5)" />
          </g>
        </svg>
      </span>
    </>
  );
}

function disposeState(state: FlightState) {
  if(state.disposed) return;
  state.disposed = true;
  for(const entry of [...attached.values()]) {
    if(entry.state === state) entry.release();
  }

  state.detachFrame();
  state.disposeRoot();
  state.flow.destroy();
  if(states.get(state.wallet.store) === state) states.delete(state.wallet.store);
}

/** The flow of a wallet window: created with its first flight, gone once nothing plays. Throws without WebGL2. */
function getFlightState(wallet: WalletContextValue, parts: RowParts): FlightState {
  const existing = states.get(wallet.store);
  if(existing && !existing.disposed) return existing;

  const flow = new SendFlow({
    list: parts.row.parentElement,
    // * the window is a fixed full-screen layer: the flying gem goes above its screens, not under them
    parent: parts.row.closest<HTMLElement>('.popup') || getOverlayRoot()
  });

  const state: FlightState = {wallet, flow, detachFrame: undefined, disposeRoot: undefined, disposed: false};
  state.detachFrame = addWalletFrameClient({
    frame: (now) => {
      flow.frame(now);
      if(!flow.active) disposeState(state);
    },
    // * a gem in the air crosses the screens and draws all the way; once it landed, the rows draw only while one
    // * of them is on screen: not under another wallet screen, not scrolled away
    isVisible: () => wallet.shown() && (
      flow.flights.some((flight) => !flight.landed) ||
      flow.rows.some((row) => isWalletElementOnScreen(row.row))
    ),
    isBusy: () => flow.active
  });

  createRoot((dispose) => {
    state.disposeRoot = dispose;
    // * the window closed: nothing of the flight may stay behind
    createEffect(on(wallet.shown, (shown) => {
      if(!shown) queueMicrotask(() => disposeState(state));
    }, {defer: true}));
  });

  states.set(wallet.store, state);
  return state;
}

/** A gem at rest to fly from, for a screen that has none of its own. */
function restingLaunch(from: Vec2): AmountSceneLaunch {
  const gem = new GemView(document.createElement('canvas'), {appearance: Appearance.blue, rotationSpeed: RESTING_SPIN});
  return {gem, from, width: RESTING_WIDTH, spin: RESTING_SPIN};
}

/**
 * Lifts a pending row for the flow to play: the plate, the sheen's canvas, the clock on the avatar, the amount
 * ready to grow and the gram icon hidden until the gem becomes it. `restore` puts the row back as it was.
 */
function liftRow(parts: RowParts) {
  const {row, plate, overlay, gem, badge} = parts;
  // * nothing moves (iOS reduce motion): the clock and "Sending" only, the row stays in the list
  const reduced = !liteMode.isAvailable('motion');
  const amount = row.querySelector<HTMLElement>('.currency-amount');
  const amountText = amount?.querySelector<HTMLElement>('span') || amount;
  const icon = amount?.querySelector<HTMLElement>('[data-wallet-amount-icon]');
  const media = row.querySelector<HTMLElement>('.row-media');

  plate.hidden = overlay.hidden = gem.hidden = badge.hidden = false;
  if(!reduced) row.classList.add(styles.lifted);
  if(media) {
    // * the clock sits on the avatar's bottom corner at its inline end, 3 px out: a physical place, measured
    const rowRect = row.getBoundingClientRect(), mediaRect = media.getBoundingClientRect();
    const x = isDocumentRTL(row.ownerDocument) ? mediaRect.left - 3 : mediaRect.right - 14;
    badge.style.left = `${x - rowRect.left}px`;
    badge.style.top = `${mediaRect.bottom - rowRect.top - 14}px`;
  } else {
    badge.hidden = true;
  }

  if(amountText) {
    amountText.style.display = 'inline-block';
    // * it grows from the row's end it stands by
    amountText.style.transformOrigin = 'var(--transform-origin-inline-end) 50%';
  }

  // * the icon next to the amount is what the gem becomes: hidden until it does, when there is a gem
  const hideIcon = () => {
    if(!icon) return;
    icon.style.opacity = '0';
    icon.style.transform = 'scale(0.2)';
  };

  const restore = () => {
    badge.getAnimations().forEach((animation) => animation.cancel());
    row.classList.remove(styles.lifted);
    row.style.transform = row.style.transformOrigin = '';
    plate.hidden = overlay.hidden = gem.hidden = badge.hidden = true;
    if(amountText) {
      amountText.style.display = amountText.style.transformOrigin = amountText.style.transform = '';
    }

    if(icon) {
      icon.getAnimations().forEach((animation) => animation.cancel());
      icon.style.opacity = icon.style.transform = '';
    }
  };

  return {amountText, icon, hideIcon, restore, reduced};
}

/** the icon pops in where the gem shrank into it */
function revealIcon(icon: HTMLElement) {
  if(!icon) return;
  icon.style.opacity = icon.style.transform = '';
  icon.animate(ROW_GEM_ICON_POP, {duration: 450, easing: 'cubic-bezier(0.34, 1.9, 0.5, 1)', fill: 'backwards'});
}

const rowElements = (parts: RowParts, amountText: HTMLElement) => ({
  shell: parts.row,
  row: parts.row,
  plate: parts.plate,
  amountText,
  overlay: parts.overlay,
  gemCanvas: parts.gem,
  badge: parts.badge,
  status: parts.status,
  date: parts.date
});

/**
 * A transfer's row plays with no gem flying into it (iOS: every pending transfer animates): it rises with its
 * sheen and clock and — for Grams, with WebGL2 — its own gem, which becomes the icon when the transfer went.
 * Nothing when nothing may move, when it plays already or when its row is gone.
 */
function startPendingRow(wallet: WalletContextValue, pending: WalletPendingTransfer) {
  const parts = decors.get(pending.id);
  if(!parts?.row.isConnected || attached.has(pending.id) || pending.failed || !liteMode.isAvailable('animations')) {
    return;
  }

  const {amountText, icon, hideIcon, restore, reduced} = liftRow(parts);
  const elements = rowElements(parts, amountText);
  const callbacks = {onMorph: () => revealIcon(icon), onFinish: () => entry.release()};
  const entrance = Date.now() - pending.date < ENTRANCE_WINDOW;
  let transferRow: TransferRow;
  try {
    // * a collectible's transfer has no gem (tdesktop)
    transferRow = new TransferRow(elements, clock.now(), callbacks, {gemless: !!pending.nft, noFlight: true, entrance, reduced});
  } catch(err) {
    // * no WebGL2: the row plays without its gem
    transferRow = new TransferRow(elements, clock.now(), callbacks, {gemless: true, noFlight: true, entrance: false, reduced});
  }

  if(transferRow.gem) hideIcon();
  const detachFrame = addWalletFrameClient({
    frame: (now) => transferRow.frame(now),
    isVisible: () => wallet.shown(),
    isBusy: () => !transferRow.finished,
    element: parts.row
  });

  // * `entry` is read only once the row finishes, after it was made here
  const entry = trackRow(pending.id, transferRow, undefined, () => {
    detachFrame();
    restore();
  });
}

/** back on the main screen, the new row is scrolled into view under the header, not the whole list to the top */
function revealRow(parts: RowParts) {
  requestWalletFrame(() => {
    const scroller = parts?.row.closest<HTMLElement>('.' + walletStyles.content);
    const scroll = getWalletCardScroll(scroller);
    if(scroll) scroll.reveal(parts.row);
    else if(scroller) scroller.scrollTop = 0;
  });
}

/** One playing row: released when it finished, failed, left the screen or the window closed */
function trackRow(id: string, row: TransferRow, state: FlightState, cleanup: () => void) {
  let resolveSettled: () => void;
  const settled = new Promise<void>((resolve) => resolveSettled = resolve);
  let released = false;
  const entry: Attached = {
    state,
    row,
    settled,
    release: () => {
      if(released) return;
      released = true;
      if(attached.get(id) === entry) attached.delete(id);
      row.destroy();
      cleanup();
      resolveSettled();
    }
  };

  attached.set(id, entry);
  return entry;
}

function attachRow(state: FlightState, flight: Flight, id: string, parts: RowParts) {
  const {amountText, icon, hideIcon, restore} = liftRow(parts);
  hideIcon();
  const unwatch = watchWalletElement(parts.row);
  // * `entry` is read only once the row finishes, after it was made below
  const transferRow = state.flow.addRow(flight, rowElements(parts, amountText), {
    onMorph: () => revealIcon(icon),
    onFinish: () => entry.release()
  });

  const entry = trackRow(id, transferRow, state, () => {
    unwatch();
    state.flow.rows = state.flow.rows.filter((item) => item !== transferRow);
    for(const item of state.flow.flights) {
      if(item.row === transferRow) item.landed = true;
    }

    restore();
    // * released while nothing drew it (its screen under another one): the flow goes without waiting for a frame
    queueMicrotask(() => !state.flow.active && disposeState(state));
  });
}

/**
 * A collectible's transfer, as the desktop client plays it: no gem flies, the new row rises with its sheen and
 * clock while the transfer goes and sits back down once the store found it. Back to the main screen first.
 */
export function playWalletPendingRow(wallet: WalletContextValue, pending: WalletPendingTransfer) {
  wallet.router.pop('main');
  // * the row is rendered by the store's change: it plays once the main screen shows it
  requestWalletFrame(() => {
    const parts = decors.get(pending.id);
    if(!parts) return;
    revealRow(parts);
    startPendingRow(wallet, pending);
  });
}

export type WalletSendFlightOptions = {
  /** what `submitWalletTransfer` resolved with */
  pending: WalletPendingTransfer,
  /** the amount screen's gem; without it a gem at rest flies from `from` */
  launch?: AmountSceneLaunch,
  /** where that gem starts, client px: the middle of the window by default */
  from?: Vec2,
  /** the send was started in the recipient's chat: the window closes and the gem flies into the chat instead */
  fromChat?: boolean
};

/**
 * Back to the main screen with the new row scrolled into view, and — unless nothing may move — the gem's flight
 * into it. Call it once the transfer went through.
 */
export function runWalletSendFlight(wallet: WalletContextValue, options: WalletSendFlightOptions) {
  // * a send from the recipient's chat ends in the chat, at its new transfer card (iOS ChatWalletTransferAnimation)
  if(options.fromChat && options.pending.draftRandomId) {
    if(options.launch && liteMode.isAvailable('motion')) flyWalletGemIntoChat(options.launch, options.pending.draftRandomId);
    wallet.close();
    return;
  }

  wallet.router.pop('main');
  const parts = decors.get(options.pending.id);
  if(parts) revealRow(parts);
  // * nothing may fly: the row plays as any pending one does
  if(!parts?.row.isConnected || !liteMode.isAvailable('motion') || attached.has(options.pending.id)) {
    return;
  }

  let state: FlightState, launch = options.launch;
  try {
    state = getFlightState(wallet, parts);
    if(!launch) {
      const box = parts.row.closest<HTMLElement>('.popup')?.querySelector<HTMLElement>('.' + walletStyles.screens);
      const rect = box?.getBoundingClientRect();
      const win = getAppWindow();
      launch = restingLaunch(options.from ?? (rect ? [rect.left + rect.width / 2, rect.top + rect.height * 0.6] : [win.innerWidth / 2, win.innerHeight / 2]));
    }
  } catch(err) {
    // * no WebGL2: the row plays without the flight
    startPendingRow(wallet, options.pending);
    return;
  }

  const flight = state.flow.launch(launch);
  if(!options.launch) launch.gem.destroy();
  attachRow(state, flight, options.pending.id, parts);
}

/**
 * The store found the transfer on the chain: the row plays its ending (stars, the gem turning into the icon,
 * the row sitting down) and this resolves when it is done — or at once when the row does not play.
 */
export function waitWalletSendSettled(pendingId: string): Promise<void> {
  const entry = attached.get(pendingId);
  if(!entry) return Promise.resolve();
  entry.row.complete();
  return Promise.race([entry.settled, new Promise<void>((resolve) => setTimeout(resolve, SETTLE_TIMEOUT))]);
}
