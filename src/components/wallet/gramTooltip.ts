/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import liteMode from '@helpers/liteMode';
import {i18n} from '@lib/langPack';
import {appSettings, setAppSettings} from '@stores/appSettings';
import {linearEasing, spring} from '@components/wallet/visual/motion';
import styles from '@components/wallet/gramTooltip.module.scss';

/**
 * "Gram — Digital currency for Telegram" over the card's gem (iOS WalletScreen.maybePresentGramTooltip and
 * WalletTooltipComponent): once per wallet address in a session, three times per account at most. It goes
 * by itself after five seconds, at a tap anywhere, at a scroll, and when the screen is left.
 */

const MAX_SHOWN = 3;
const LIFETIME = 5000;
/** the window's sides the bubble keeps away from (iOS 26 pt) */
const SIDE_INSET = 26;
/** the bubble stands this far above the gem's frame, raised by 4 (iOS) */
const GAP = 10;
const RAISE = 4;
const ARROW_WIDTH = 18;
const ARROW_HEIGHT = 7;
// * the original rounded arrow of the Gram tooltip, at a third of 0.62
const ARROW_PATH = 'M17.749 0C16.434 0 15.172 .5225 14.242 1.4525L10.628 5.0656C9.66 6.034 8.0894 6.034 7.121 5.0656L3.507 1.4525C2.5771 .5225 1.3155 0 0 0Z';
/** the bubble's gradient, sampled for the arrow where it stands */
const FROM = [0x47, 0xba, 0xfe], TO = [0x44, 0xb5, 0xff];
/** iOS animateSpring(duration: 0.4, damping: 105): mass 5, stiffness 900 */
const SPRING_IN = linearEasing((t) => spring(t * 0.6, 10.5, 8.35), 30);

const shownAddresses: Set<string> = new Set();

export type WalletGramTooltip = {
  dismiss: (animated?: boolean) => void
};

export function canShowWalletGramTooltip(address: string) {
  return !!address && !shownAddresses.has(address) && (appSettings.seenTooltips?.walletGram || 0) < MAX_SHOWN;
}

/**
 * Shows the hint over the gem: `gem` is its middle and width in `card`'s pixels, `screen` the element whose
 * sides the bubble keeps away from
 */
export function showWalletGramTooltip(options: {
  address: string,
  card: HTMLElement,
  screen: HTMLElement,
  gem: {x: number, y: number, width: number},
  onDismiss?: () => void
}): WalletGramTooltip {
  const {card, screen, gem} = options;
  shownAddresses.add(options.address);
  setAppSettings('seenTooltips', 'walletGram', (appSettings.seenTooltips?.walletGram || 0) + 1);

  const tooltip = document.createElement('div');
  tooltip.classList.add(styles.tooltip);
  tooltip.setAttribute('role', 'tooltip');
  const bubble = document.createElement('div');
  bubble.classList.add(styles.bubble);
  bubble.append(i18n('Wallet.GramTooltip'));
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.classList.add(styles.arrow);
  arrow.setAttribute('viewBox', `0 0 ${ARROW_WIDTH} ${ARROW_HEIGHT}`);
  arrow.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ARROW_PATH);
  arrow.append(path);
  tooltip.append(bubble, arrow);
  card.append(tooltip);

  // * one layout when it shows: the bubble over the gem, kept inside the window's sides, the arrow on the gem
  const available = screen.clientWidth - SIDE_INSET * 2;
  bubble.style.maxWidth = `${Math.min(614, available)}px`;
  const width = tooltip.offsetWidth, height = bubble.offsetHeight;
  const cardLeft = card.getBoundingClientRect().left - screen.getBoundingClientRect().left;
  const minX = SIDE_INSET - cardLeft, maxX = SIDE_INSET + available - cardLeft;
  const sourceTop = gem.y - gem.width * 0.75 - RAISE;
  const x = Math.max(minX, Math.min(maxX - width, gem.x - width / 2));
  const y = sourceTop - GAP - height;
  const arrowCenter = Math.max(ARROW_WIDTH / 2, Math.min(width - ARROW_WIDTH / 2, gem.x - x));
  // * `translate`, not `transform`: the scale of its entrance then grows it from the arrow's tip where it stands
  tooltip.style.translate = `${x}px ${y}px`;
  arrow.style.left = `${arrowCenter - ARROW_WIDTH / 2}px`;
  const k = arrowCenter / width;
  path.setAttribute('fill', `rgb(${FROM.map((value, i) => Math.round(value + (TO[i] - value) * k)).join(',')})`);
  // * it grows from the arrow's tip
  tooltip.style.transformOrigin = `${arrowCenter}px ${height + ARROW_HEIGHT}px`;

  const inner = tooltip;
  const appear = () => {
    const animations = liteMode.isAvailable('animations'), motion = liteMode.isAvailable('motion');
    if(motion) {
      inner.animate([{scale: '0.01'}, {scale: '1'}], {duration: 600, easing: SPRING_IN});
    }

    if(animations) {
      inner.animate([{opacity: 0}, {opacity: 1}], {duration: 200});
    }
  };

  // * the taps of the document the card is in: the tab's, or the Document PiP window's the app moved to
  const doc = card.ownerDocument;
  let dismissed = false;
  const dismiss = (animated = true) => {
    if(dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    options.onDismiss?.();
    if(!animated || !liteMode.isAvailable('animations')) {
      tooltip.remove();
      return;
    }

    const keyframes: Keyframe[] = liteMode.isAvailable('motion') ?
      [{opacity: 1, scale: '1'}, {opacity: 0, scale: '0.01'}] :
      [{opacity: 1}, {opacity: 0}];
    inner.animate(keyframes, {duration: 200, easing: 'ease-in-out', fill: 'forwards'}).finished
    .catch(() => {})
    .then(() => tooltip.remove());
  };

  // * a tap anywhere sends it away, and still does what it does
  const onPointerDown = () => dismiss();
  doc.addEventListener('pointerdown', onPointerDown, true);
  const timer = window.setTimeout(() => dismiss(), LIFETIME);
  appear();

  return {dismiss};
}
