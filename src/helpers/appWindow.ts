/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * The window whose viewport the app's layout should track. Normally the tab's own `window`; while the
 * client is popped out into a Document Picture-in-Picture window the whole app DOM lives in THAT
 * window, so every viewport-driven measurement (column widths, `--vh`, mediaSizes breakpoints) must
 * read its size instead — otherwise the moved app keeps sizing itself to the now-background tab.
 *
 * Single source of truth: `windowSize`, `mediaSizes`, `updateColumnWidths` and the `--vh` setter all
 * read `getAppWindow()` and re-subscribe via `onAppWindowChange`. When it equals `window` (no PiP)
 * everything behaves exactly as before — flipping it is the only thing PiP does to the metrics layer.
 */

let activeWindow: Window = typeof window !== 'undefined' ? window : undefined;

const listeners = new Set<(win: Window, prev: Window) => void>();
const beforeListeners = new Set<(next: Window, prev: Window) => void>();

export function getAppWindow(): Window {
  return activeWindow;
}

/**
 * The body where transient overlays (context menus, popups, tooltips, the media viewer) should mount.
 * It's the active app window's body — so an overlay opened while the client is popped out lands in the
 * Document PiP window instead of the now-background tab. The whole app lives in one window at a time,
 * so this single atomic target is all the overlay layer needs.
 */
export function getOverlayRoot(): HTMLElement {
  return activeWindow.document.body;
}

export function setAppWindow(win: Window): void {
  const prev = activeWindow;
  if(!win || win === prev) return;
  // Fire BEFORE flipping the active window — while the app DOM is still in the old window at its old
  // size and nothing (mediaSizes, column widths) has reflowed yet. The chat uses this to snapshot its
  // true pre-move scroll position before the PiP move rewraps the bubbles.
  beforeListeners.forEach((listener) => {
    try {
      listener(win, prev);
    } catch{}
  });
  activeWindow = win;
  listeners.forEach((listener) => {
    try {
      listener(win, prev);
    } catch{}
  });
}

/** Subscribe to active-window changes. Callback gets `(newWindow, previousWindow)`. */
export function onAppWindowChange(cb: (win: Window, prev: Window) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Subscribe to the moment JUST BEFORE the active window changes — fired while the DOM is still in the
 * outgoing window at its current size, before any metric (mediaSizes / column widths / `--vh`) has
 * recomputed. Use it to capture pre-reflow state (e.g. scroll position). Callback gets `(next, prev)`.
 */
export function onBeforeAppWindowChange(cb: (next: Window, prev: Window) => void): () => void {
  beforeListeners.add(cb);
  return () => beforeListeners.delete(cb);
}

/**
 * Attach a global listener that FOLLOWS the active app window. Always-on document/window listeners
 * (keyboard shortcuts, the global "type anywhere → focus input" handler, Esc/back navigation,
 * paste/drop) are registered once at app init against the tab's realm; when the client pops into a
 * Document PiP window those events fire on the PiP document instead, so a main-realm listener goes
 * dead. This re-binds the listener to the new window's target on every active-window change (and
 * back on restore). `getTarget` selects the target from a window — `w => w`, `w => w.document`,
 * `w => w.document.body`; the return type picks the matching overload so the listener keeps its
 * exact event type. Returns a disposer that removes the listener and stops following. When the app
 * window never changes (no PiP) this behaves exactly like a plain `addEventListener`.
 */
export function bindActiveWindowListener<K extends keyof WindowEventMap>(
  getTarget: (win: Window) => Window,
  type: K,
  listener: (ev: WindowEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): () => void;
export function bindActiveWindowListener<K extends keyof DocumentEventMap>(
  getTarget: (win: Window) => Document,
  type: K,
  listener: (ev: DocumentEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): () => void;
export function bindActiveWindowListener<K extends keyof HTMLElementEventMap>(
  getTarget: (win: Window) => HTMLElement,
  type: K,
  listener: (ev: HTMLElementEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): () => void;
export function bindActiveWindowListener(
  getTarget: (win: Window) => EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): () => void {
  let target: EventTarget;
  const attach = (win: Window) => {
    target = getTarget(win);
    target.addEventListener(type, listener, options);
  };
  const detach = () => target?.removeEventListener(type, listener, options);
  attach(activeWindow);
  const off = onAppWindowChange((win) => {
    detach();
    attach(win);
  });
  return () => {
    detach();
    off();
  };
}
