/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * A text link held under the pointer gets a ripple that fills a rounded plate of its own colour
 * on every line of it (`scss/mixins/_linkPlate.scss`, `scss/partials/_linkPress.scss`). For every
 * link in the text of the app: messages, captions, bios, Instant View, popups, the names in
 * messages (PeerTitle `link`) — and for what acts as one without being an `<a>`
 * (`TEXT_LINK_ATTRIBUTE`).
 *
 * Only an `<a>` that runs with the text takes it (`display: inline`): a link drawn as a row, a
 * button or a chip keeps the press look it has (ripple, hover background).
 */

import {bindActiveWindowListener, onAppWindowChange} from '@helpers/appWindow';
import liteMode from '@helpers/liteMode';
import {RICH_TEXT_BUTTON_SELECTOR} from '@lib/richTextProcessor/richTextButtons';
import {startRippleWave} from '@components/ripple';

/** marks an element that is pressed as a link is without being one: "via @bot" starts a draft */
export const TEXT_LINK_ATTRIBUTE = 'data-text-link';

/** a held link (tinted while held when no ripple can run) */
const PRESSED_CLASS = 'is-link-pressed';
/** a link with a ripple's wave in it, which is placed against the link */
const RIPPLE_CLASS = 'is-link-rippling';
/**
 * A finger that lands on a link to scroll must not light it up: a touch takes the ripple only once
 * it has held still this long (Android's tap timeout), or when it is lifted as a tap.
 */
const TOUCH_DELAY = 100;
/** a finger that moves this far before then is passing over the link (Android's touch slop) */
const MOVE_SLOP = 8;

type Press = {
  link: HTMLElement,
  inline: boolean,
  pointerId: number,
  x: number,
  y: number,
  shown: boolean,
  timeout?: number,
  releaseRipple?: () => void
};

let press: Press;
/** waves still fading in a link */
const rippleWaves: WeakMap<HTMLElement, number> = new WeakMap();

function getPressableLink(target: EventTarget) {
  const link = (target as Element).closest?.<HTMLElement>(`a, [${TEXT_LINK_ATTRIBUTE}]`);
  if(
    !link ||
    // the composer: a press places the caret there
    link.isContentEditable ||
    // a link in a button presses the button, which has its own look for it (ripple, .PageButton)
    link.closest(`button, ${RICH_TEXT_BUTTON_SELECTOR}`) ||
    // a link under a hidden spoiler must not give its shape away
    isUnderHiddenSpoiler(link)
  ) {
    return;
  }

  const inline = link.ownerDocument.defaultView.getComputedStyle(link).display === 'inline';
  // a name (PeerTitle `link`) or a marked element is a link however it is laid out: beside its
  // rank, with its icons
  if(!inline && !link.classList.contains('peer-title') && !link.hasAttribute(TEXT_LINK_ATTRIBUTE)) {
    return;
  }

  return {link, inline};
}

/**
 * A spoiler over the link (or in it) still hides it: a message's spoilers are a particle overlay,
 * shown until its canvas goes, others open in place (`.is-spoiler-visible`).
 */
function isUnderHiddenSpoiler(link: HTMLElement) {
  if(!link.closest('.spoiler') && !link.querySelector('.spoiler')) {
    return false;
  }

  const container = link.closest('.spoilers-container');
  const overlay = container?.querySelector('.message-spoiler-overlay__canvas');
  if(overlay) {
    return !overlay.classList.contains('message-spoiler-overlay__canvas--hidden') ||
      !container.classList.contains('can-show-spoiler-text');
  }

  return !link.closest('.is-spoiler-visible');
}

function show(current: Press) {
  current.shown = true;
  // from now on only letting the link go ends the press, wherever the pointer goes meanwhile
  current.link.removeEventListener('pointermove', onPointerMove);
  current.link.classList.add(PRESSED_CLASS);
  ripple(current);
}

/**
 * The press's ripple. A link gets its ripple when it is pressed and loses it once the wave has
 * faded, rather than carrying one all the time as a button does: there are links in every message.
 * Without animations there is none, and the link is simply tinted while it is held.
 *
 * The link's own box is left alone — padding there would re-wrap a balanced caption under the
 * finger — so its plates, a little larger than its lines, are drawn by the ripple's clip alone.
 */
function ripple(current: Press) {
  const {link, inline, x, y} = current;
  if(!liteMode.isAvailable('animations')) {
    return;
  }

  const lines = Array.from(link.getClientRects()).filter((rect) => rect.width && rect.height);
  if(!lines.length) {
    return;
  }

  const container = link.ownerDocument.createElement('span');
  container.classList.add('c-ripple', 'link-press-ripple');
  link.classList.add(RIPPLE_CLASS);
  rippleWaves.set(link, (rippleWaves.get(link) || 0) + 1);
  // first, as a button's ripple goes: placed after the text, Chromium gives the link an empty piece
  // on a line of its own past a balanced caption's last
  link.prepend(container);
  const unmount = () => {
    container.remove();
    const waves = rippleWaves.get(link) - 1;
    if(waves) {
      rippleWaves.set(link, waves);
      return;
    }

    rippleWaves.delete(link);
    link.classList.remove(RIPPLE_CLASS);
  };

  // how far a plate reaches past its line, in the link's own font: the container's padding says
  // (a box laid out as one, a name beside its rank, is as tall as its plate already)
  const style = link.ownerDocument.defaultView.getComputedStyle(container);
  const bleedX = parseFloat(style.paddingLeft) || 0;
  const bleedY = inline ? parseFloat(style.paddingTop) || 0 : 0;
  const radius = parseFloat(style.borderTopLeftRadius) || 0;
  // as far as what clips the link lets it show (the edge of a name's line): cut there, a plate
  // keeps its rounded corners
  const clip = getClipRect(link);
  const rects = lines.map((rect) => {
    let left = rect.left - bleedX, right = rect.right + bleedX;
    let top = rect.top - bleedY, bottom = rect.bottom + bleedY;
    if(clip) {
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }

    return new DOMRect(left, top, right - left, bottom - top);
  }).filter((rect) => rect.width > 0 && rect.height > 0);
  if(!rects.length) {
    unmount();
    return;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const width = Math.max(...rects.map((rect) => rect.right)) - left;
  const height = Math.max(...rects.map((rect) => rect.bottom)) - top;

  // where an absolutely placed child of an inline box starts depends on the box's lines: measured
  const placed = container.getBoundingClientRect();
  container.style.left = left - placed.left + 'px';
  container.style.top = top - placed.top + 'px';
  container.style.width = width + 'px';
  container.style.height = height + 'px';
  const plates = rects.map((rect) => roundedRectPath(rect.left - left, rect.top - top, rect.width, rect.height, radius));
  container.style.clipPath = `path('${plates.join(' ')}')`;

  current.releaseRipple = startRippleWave(container, x, y, {onEnd: unmount});
}

/**
 * What the nearest ancestor that clips its overflow lets show of the link: its padding box, grown by
 * its `overflow-clip-margin` where the engine has one (WebKit has none).
 */
function getClipRect(link: HTMLElement) {
  const view = link.ownerDocument.defaultView;
  for(let element = link.parentElement; element; element = element.parentElement) {
    const style = view.getComputedStyle(element);
    // (an inline box does not clip, whatever its overflow says)
    if((style.overflowX === 'visible' && style.overflowY === 'visible') || style.display === 'inline' || style.display === 'contents') {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const margin = style.overflowX === 'clip' ? parseFloat(style.overflowClipMargin) || 0 : 0;
    const left = rect.left + element.clientLeft - margin, top = rect.top + element.clientTop - margin;
    return new DOMRect(left, top, element.clientWidth + margin * 2, element.clientHeight + margin * 2);
  }
}

/** an SVG path of a rounded rectangle, for a clip path */
function roundedRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const right = x + width, bottom = y + height;
  return `M${x + r},${y}H${right - r}A${r},${r} 0 0 1 ${right},${y + r}V${bottom - r}` +
    `A${r},${r} 0 0 1 ${right - r},${bottom}H${x + r}A${r},${r} 0 0 1 ${x},${bottom - r}` +
    `V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
}

/** `tap`: the press ended as a press does, so one that has not lit up yet ripples now */
function release(tap: boolean) {
  if(!press) {
    return;
  }

  const current = press;
  press = undefined;
  clearTimeout(current.timeout);
  current.link.removeEventListener('pointermove', onPointerMove);
  if(!current.shown && !tap) {
    return;
  }

  if(!current.shown) {
    show(current);
  }

  current.releaseRipple?.();
  current.link.classList.remove(PRESSED_CLASS);
}

function onPointerDown(e: PointerEvent) {
  release(false);
  if(!e.isPrimary || e.button !== 0) {
    return;
  }

  const pressable = getPressableLink(e.target);
  if(!pressable) {
    return;
  }

  const current: Press = press = {...pressable, pointerId: e.pointerId, x: e.clientX, y: e.clientY, shown: false};
  if(e.pointerType === 'touch') {
    current.timeout = window.setTimeout(() => show(current), TOUCH_DELAY);
    // a touch stays captured by the link, so its moves come here; a scroll cancels it by itself
    current.link.addEventListener('pointermove', onPointerMove);
  } else {
    show(current);
  }
}

/** a finger moving on before its ripple has shown: a swipe over the link, not a press */
function onPointerMove(e: PointerEvent) {
  if(press?.pointerId === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_SLOP) {
    release(false);
  }
}

function onPointerEnd(e: PointerEvent) {
  if(press?.pointerId === e.pointerId) {
    release(e.type === 'pointerup');
  }
}

export default function listenForLinkPress() {
  // capture: a handler that stops the event on its way still leaves the ripple to come and go
  const options: AddEventListenerOptions = {capture: true, passive: true};
  bindActiveWindowListener((w) => w.document, 'pointerdown', onPointerDown, options);
  bindActiveWindowListener((w) => w.document, 'pointerup', onPointerEnd, options);
  bindActiveWindowListener((w) => w.document, 'pointercancel', onPointerEnd, options);
  // a dragged link takes the pointer away without a pointerup in some engines; a context menu (a
  // Ctrl+click on macOS, a long press) may swallow it; the client moving into or out of a Document
  // PiP window leaves it in the other document
  bindActiveWindowListener((w) => w.document, 'dragstart', () => release(false), options);
  bindActiveWindowListener((w) => w.document, 'contextmenu', () => release(false), options);
  onAppWindowChange(() => release(false));
}
