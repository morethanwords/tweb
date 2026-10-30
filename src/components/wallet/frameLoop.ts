/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createComputed, createRoot, on} from 'solid-js';
import {bindActiveWindowListener, getAppWindow, onAppWindowChange} from '@helpers/appWindow';
import {clock} from '@components/wallet/visual/clock';
import {hotEffect} from '@helpers/hotModule';

/**
 * One frame loop for the whole wallet window: the card, the amount screen and the send flight draw in the same
 * frame, after the deferred storyboard steps of `clock`. It runs only while something is visible on a visible
 * page. At rest it draws at most ~60 times a second (the gems are smooth enough and the GPU is shared), while
 * something moves it follows the display, or a gem would stutter against a page that moves twice as often.
 *
 * With nothing to draw it asks for no frames: it looks again now and then (`IDLE_POLL`, the clock's timers run
 * then), and a client that shows again — its visibility signal, its element back on screen — wakes it at once.
 * The frames, the page's visibility and the viewport are those of the window the app is in: the tab, or the
 * Document PiP window it moved to.
 */

/** with nothing to draw, how often the loop looks whether something came back, ms */
const IDLE_POLL = 200;

export type WalletFrameClient = {
  frame: (now: number) => void,
  /** draws only while this says so; a signal read here wakes the resting loop when it turns true */
  isVisible: () => boolean,
  /**
   * draws only while this element is on screen too: not scrolled away, its screen not hidden under another. One
   * intersection observer watches them all, nothing is measured per frame
   */
  element?: Element,
  /** moving right now: follow the display's rate */
  isBusy?: () => boolean,
  /** the page was hidden: drop the time step so nothing jumps on return */
  onHidden?: () => void
};

const clients: Set<WalletFrameClient> = new Set();
/** cancels the next tick: a frame, or a poll while resting */
let cancelNext: () => void;
let resting = false;
let last = 0;
let wasHidden = false;
let unbindVisibility: () => void;

// * an element counts as on screen until the observer says otherwise: the first frame is drawn at once
const offScreen: Set<Element> = new Set();
const observed: Map<Element, number> = new Map();
let observer: IntersectionObserver;

function createObserver() {
  // * its viewport is the one of the window whose constructor made it
  const IO = (getAppWindow() as Window & typeof globalThis).IntersectionObserver;
  if(!IO) return;
  observer = new IO((entries) => {
    let back = false;
    for(const entry of entries) {
      if(entry.isIntersecting) back = offScreen.delete(entry.target) || back;
      else offScreen.add(entry.target);
    }

    if(back) wake();
  });
}

/** `element` is watched for being on screen until the returned function is called (see `isWalletElementOnScreen`) */
export function watchWalletElement(element: Element) {
  if(!observer) createObserver();
  const count = observed.get(element) || 0;
  observed.set(element, count + 1);
  if(!count) observer?.observe(element);

  let watched = true;
  return () => {
    if(!watched) return;
    watched = false;
    const count = observed.get(element);
    if(count > 1) {
      observed.set(element, count - 1);
      return;
    }

    observed.delete(element);
    offScreen.delete(element);
    observer?.unobserve(element);
  };
}

/** a watched element is on screen: not scrolled away, its screen not hidden under another */
export function isWalletElementOnScreen(element: Element) {
  return !offScreen.has(element);
}

/** A frame of the window the app is in; the function it gives cancels it */
export function requestWalletFrame(callback: FrameRequestCallback): () => void {
  const win = getAppWindow();
  const id = win.requestAnimationFrame(callback);
  return () => win.cancelAnimationFrame(id);
}

const isShown = (client: WalletFrameClient) => client.isVisible() && !(client.element && offScreen.has(client.element));

function stop() {
  cancelNext?.();
  cancelNext = undefined;
}

function requestFrame() {
  stop();
  resting = false;
  cancelNext = requestWalletFrame(tick);
}

function requestPoll() {
  stop();
  resting = true;
  const win = getAppWindow();
  const id = win.setTimeout(poll, IDLE_POLL);
  cancelNext = () => win.clearTimeout(id);
}

/** something may show again: the loop looks in the next frame instead of the next poll */
function wake() {
  if(clients.size && (resting || !cancelNext)) {
    requestFrame();
  }
}

/** the page is hidden: the clients are told once, nothing is drawn */
function isPageHidden() {
  if(!getAppWindow().document.hidden) {
    wasHidden = false;
    return false;
  }

  if(!wasHidden) {
    wasHidden = true;
    clients.forEach((client) => client.onHidden?.());
  }

  return true;
}

/** nothing to draw: the clock's due timers run, and the loop rests unless the next one is due before its poll */
function rest() {
  const now = clock.now();
  clock.run(now);
  // * a timer showed something: the loop is awake already
  if(cancelNext) return;
  let due = Infinity;
  for(const timer of clock.timers) {
    if(!timer.cancelled) due = Math.min(due, timer.at);
  }

  if(due - now < IDLE_POLL / 1000) requestFrame();
  else requestPoll();
}

function poll() {
  cancelNext = undefined;
  if(!clients.size) return;
  // * a hidden page gives no frames: the next one comes when it shows
  if(clock.manual || isPageHidden()) requestFrame();
  else if([...clients].some(isShown)) requestFrame();
  else rest();
}

function tick(ms: number) {
  cancelNext = undefined;
  if(!clients.size) return;
  if(clock.manual || isPageHidden()) {
    requestFrame();
    return;
  }

  let shown = false, busy = false;
  for(const client of clients) {
    if(!isShown(client)) continue;
    shown = true;
    if(client.isBusy?.()) {
      busy = true;
      break;
    }
  }

  if(!shown) {
    rest();
    return;
  }

  // * asked before the clients draw: one that goes in its frame cancels it with the last of them
  requestFrame();
  if(!busy && ms - last < 1000 / 64) {
    return;
  }

  last = ms;
  const now = clock.now();
  clock.run(now);
  for(const client of clients) {
    if(isShown(client)) {
      client.frame(now);
    }
  }
}

// * the app moved into a Document PiP window or back: its frames, its viewport, its visibility
hotEffect(import.meta.hot, () => onAppWindowChange(() => {
  // * the frame times count from that window's own origin
  last = 0;
  if(observer) {
    observer.disconnect();
    observer = undefined;
    offScreen.clear();
    if(observed.size) {
      createObserver();
      for(const element of observed.keys()) observer?.observe(element);
    }
  }

  if(cancelNext) {
    // * the window it was asked of may be closed already
    const cancel = cancelNext;
    cancelNext = undefined;
    try {
      cancel();
    } catch(err) {}

    requestFrame();
  }
}));

export function addWalletFrameClient(client: WalletFrameClient) {
  clients.add(client);
  const unwatch = client.element ? watchWalletElement(client.element) : undefined;
  // * what shows it again wakes the loop at once, not at its next poll
  const disposeWatch = createRoot((dispose) => {
    createComputed(on(client.isVisible, (visible) => visible && wake(), {defer: true}));
    return dispose;
  });

  unbindVisibility ??= bindActiveWindowListener((win) => win.document, 'visibilitychange', () => {
    if(!isPageHidden()) wake();
  });
  wake();

  return () => {
    if(!clients.delete(client)) return;
    disposeWatch();
    unwatch?.();
    if(!clients.size) {
      stop();
      unbindVisibility?.();
      unbindVisibility = undefined;
    }
  };
}
