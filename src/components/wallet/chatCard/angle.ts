/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import liteMode from '@helpers/liteMode';
import {bindActiveWindowListener, getAppWindow} from '@helpers/appWindow';
import {requestWalletFrame} from '@components/wallet/frameLoop';
import {observeWalletCards, WalletCardObserver} from '@components/wallet/chatCard/observe';

/**
 * The sweep of every transfer card in sight follows the cursor across the window, as the desktop client's
 * CardAngle does: one angle for all the cards, read off the cursor's distance from the middle card's centre —
 * flat near it, 30° at 320 px, never past 60°. Positions come from an IntersectionObserver, which hands them over
 * without a forced layout; a card's horizontal position changes only when the chat column does, so they are
 * re-read (by observing again) at most once a second while the cursor moves. The cursor, the frames and the
 * positions are those of the window the app is in: the tab, or the Document PiP window it moved to.
 */

const ANGLE_LIMIT = 60;
const ANGLE_REACH = 320;
const ANGLE_STEP = .25;
const REMEASURE_AFTER = 1000;

const PROPERTY = '--wallet-card-angle';

const centers: Map<HTMLElement, number> = new Map();
let observer: WalletCardObserver;
let cursorX: number;
let angle = 0;
let cancelFrame: () => void;
let measuredAt = 0;
let unlisten: () => void;

function cursorAngle(dx: number) {
  const squared = dx * dx;
  return (dx < 0 ? -ANGLE_LIMIT : ANGLE_LIMIT) * squared / (squared + ANGLE_REACH * ANGLE_REACH);
}

function apply() {
  cancelFrame = undefined;
  if(cursorX === undefined || !centers.size || !getAppWindow().document.hasFocus()) {
    return;
  }

  if(performance.now() - measuredAt > REMEASURE_AFTER) {
    measuredAt = performance.now();
    for(const element of centers.keys()) {
      observer.unobserve(element);
      observer.observe(element);
    }
  }

  const sorted = [...centers.values()].sort((a, b) => a - b);
  const middle = sorted[sorted.length >> 1];
  const target = Math.trunc(cursorAngle(cursorX - middle) / ANGLE_STEP) * ANGLE_STEP;
  if(target === angle) {
    return;
  }

  angle = target;
  for(const element of centers.keys()) {
    element.style.setProperty(PROPERTY, angle + 'deg');
  }
}

function onPointerMove(e: PointerEvent) {
  cursorX = e.clientX;
  cancelFrame ||= requestWalletFrame(apply);
}

function listen(value: boolean) {
  if(!!unlisten === value) {
    return;
  }

  if(value) {
    unlisten = bindActiveWindowListener((win) => win, 'pointermove', onPointerMove, {passive: true});
  } else {
    unlisten();
    unlisten = undefined;
    cancelFrame?.();
    cancelFrame = undefined;
  }
}

function getObserver() {
  return observer ??= observeWalletCards((entries) => {
    for(const entry of entries) {
      const element = entry.target as HTMLElement;
      if(entry.isIntersecting) {
        const rect = entry.boundingClientRect;
        centers.set(element, rect.left + rect.width / 2);
        element.style.setProperty(PROPERTY, angle + 'deg');
      } else {
        centers.delete(element);
      }
    }

    listen(!!centers.size);
  });
}

/**
 * Starts turning a card with the others while it is on screen; returns the release
 */
export function trackWalletCardAngle(element: HTMLElement) {
  // * the sweep turning after the cursor is movement
  if(!liteMode.isAvailable('motion')) {
    return () => {};
  }

  getObserver().observe(element);
  return () => {
    observer.unobserve(element);
    centers.delete(element);
    listen(!!centers.size);
  };
}
