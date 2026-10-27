/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * A text link held under the pointer gets a ripple that fills a rounded plate of its own colour on
 * every line of it (`scss/mixins/_linkPlate.scss`, `scss/partials/_linkPress.scss`), and the plate
 * stays, lightly, while a menu opened from the link is open; under the mouse the link is underlined.
 * For every link in the text of the app: messages, captions, bios, Instant View, popups, the names in
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

const LINK_SELECTOR = `a, [${TEXT_LINK_ATTRIBUTE}]`;
/** a link with its plate in it, which is placed against the link */
const PLATE_CLASS = 'has-link-plate';
/** a link under the mouse: underlined, as links are on the web (`scss/partials/_linkPress.scss`) */
const HOVERED_CLASS = 'is-link-hovered';
/** the plate lit: a menu opened from the link is open */
const LIT_CLASS = 'is-lit';
/** the plate filled for a press no ripple can show (animations off) */
const PRESSED_CLASS = 'is-pressed';
/** how long a lit plate takes to fade (`.link-plate:before`), after which it goes */
const FADE_OUT_DURATION = 150;
/**
 * A finger that lands on a link to scroll must not light it up: a touch takes the ripple only once
 * it has held still this long (Android's tap timeout), or when it is lifted as a tap.
 */
const TOUCH_DELAY = 100;
/** a finger that moves this far before then is passing over the link (Android's touch slop) */
const MOVE_SLOP = 8;

/**
 * A link's plate, mounted while anything draws on it and gone after. The link's own box is left
 * alone — padding there would re-wrap a balanced caption under the finger — so the plate is a box
 * laid over the link, a little larger than its lines and cut to them.
 */
type Plate = {
  link: HTMLElement,
  inline: boolean,
  container: HTMLElement,
  /** where the container is placed against the link (`left`, `top`) */
  x: number,
  y: number,
  /** its shape is measured: it shows nothing before */
  laidOut: boolean,
  /** menus opened from the link that are still open */
  holds: number,
  /** held with no ripple to show it (animations off) */
  pressed: boolean,
  /** waves still fading in it */
  waves: number,
  unmountTimeout?: number
};

type PlateShape = {
  x: number,
  y: number,
  width: number,
  height: number,
  clipPath: string
};

type Press = {
  link: HTMLElement,
  inline: boolean,
  pointerId: number,
  x: number,
  y: number,
  shown: boolean,
  timeout?: number,
  plate?: Plate,
  releaseRipple?: () => void
};

let press: Press;
/**
 * the text link under the mouse, the link (text or not) the pointer was last seen in, and whether it
 * came into that one with a button down
 */
let hovered: HTMLElement, hoverTarget: HTMLElement, hoverDragged: boolean;
const plates: Map<HTMLElement, Plate> = new Map();

function getPressableLink(target: EventTarget) {
  const link = (target as Element).closest?.<HTMLElement>(LINK_SELECTOR);
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

/**
 * The link's plate, mounted unless it is there already. A link gets one only while something draws
 * on it, rather than carrying one all the time as a button does its ripple: there are links in
 * every message.
 */
function mountPlate(link: HTMLElement, inline: boolean) {
  let plate = plates.get(link);
  if(!plate) {
    const container = link.ownerDocument.createElement('span');
    container.classList.add('c-ripple', 'link-plate');
    plate = {link, inline, container, x: 0, y: 0, laidOut: false, holds: 0, pressed: false, waves: 0};
    plates.set(link, plate);
  }

  clearTimeout(plate.unmountTimeout);
  // first, as a button's ripple goes: placed after the text, Chromium gives the link an empty piece
  // on a line of its own past a balanced caption's last. (The link's content can be set anew under
  // it, a name renamed, which takes the plate away)
  if(plate.container.parentElement !== link) {
    link.classList.add(PLATE_CLASS);
    link.prepend(plate.container);
    plate.laidOut = false;
  }

  return plate;
}

function unmountPlate(plate: Plate) {
  clearTimeout(plate.unmountTimeout);
  plates.delete(plate.link);
  plate.container.remove();
  plate.link.classList.remove(PLATE_CLASS);
}

/** draws what the plate is for now, and lets it go once it is for nothing */
function updatePlate(plate: Plate) {
  const {container} = plate;
  const wasLit = container.classList.contains(LIT_CLASS);
  container.classList.toggle(LIT_CLASS, plate.laidOut && plate.holds > 0);
  container.classList.toggle(PRESSED_CLASS, plate.laidOut && plate.pressed);
  clearTimeout(plate.unmountTimeout);
  if(plate.holds || plate.pressed || plate.waves) {
    return;
  }

  if(wasLit && liteMode.isAvailable('animations')) {
    plate.unmountTimeout = window.setTimeout(() => unmountPlate(plate), FADE_OUT_DURATION);
  } else {
    unmountPlate(plate);
  }
}

/** shapes the plate at once: for a press or a menu, once per action */
function layoutPlate(plate: Plate) {
  const shape = measurePlate(plate);
  applyPlate(plate, shape);
  return !!shape;
}

/**
 * The plate's shape: a rounded plate a little larger than each line of the link, as far as what
 * clips the link lets it show. Reads only.
 */
function measurePlate(plate: Plate): PlateShape {
  const {link, inline, container} = plate;
  const lines = Array.from(link.getClientRects()).filter((rect) => rect.width && rect.height);
  if(!lines.length) {
    return;
  }

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
    return;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const width = Math.max(...rects.map((rect) => rect.right)) - left;
  const height = Math.max(...rects.map((rect) => rect.bottom)) - top;
  const plates = rects.map((rect) => roundedRectPath(rect.left - left, rect.top - top, rect.width, rect.height, radius));

  // where an absolutely placed child of an inline box starts depends on the box's lines: measured,
  // against where the container stands now
  const placed = container.getBoundingClientRect();
  return {
    x: plate.x + left - placed.left,
    y: plate.y + top - placed.top,
    width,
    height,
    clipPath: `path('${plates.join(' ')}')`
  };
}

/** writes only; a plate with no shape (nothing of the link shows) is cut away whole */
function applyPlate(plate: Plate, shape: PlateShape) {
  const {style} = plate.container;
  plate.laidOut = true;
  if(!shape) {
    style.clipPath = 'inset(50%)';
    return;
  }

  plate.x = shape.x;
  plate.y = shape.y;
  style.left = shape.x + 'px';
  style.top = shape.y + 'px';
  style.width = shape.width + 'px';
  style.height = shape.height + 'px';
  style.clipPath = shape.clipPath;
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

/**
 * The press's ripple, run in the link's plate. Without animations there is none: the plate is
 * simply filled while the link is held.
 */
function show(current: Press) {
  current.shown = true;
  // from now on only letting the link go ends the press, wherever the pointer goes meanwhile
  current.link.removeEventListener('pointermove', onPointerMove);
  // shaped anew: the text may have moved under a plate still fading from the last press
  const plate = current.plate = mountPlate(current.link, current.inline);
  if(layoutPlate(plate)) {
    if(liteMode.isAvailable('animations')) {
      ++plate.waves;
      current.releaseRipple = startRippleWave(plate.container, current.x, current.y, {
        onEnd: () => {
          --plate.waves;
          updatePlate(plate);
        }
      });
    } else {
      plate.pressed = true;
    }
  }

  updatePlate(plate);
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
  current.plate.pressed = false;
  updatePlate(current.plate);
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
  if(hoverDragged && e.type === 'pointerup') {
    hoverDragged = false;
    setHovered(getPressableLink(hoverTarget)?.link);
  }

  if(press?.pointerId === e.pointerId) {
    release(e.type === 'pointerup');
  }
}

/** underlines the text link under the mouse, and no other */
function setHovered(link: HTMLElement) {
  hovered?.classList.remove(HOVERED_CLASS);
  hovered = link;
  link?.classList.add(HOVERED_CLASS);
}

/** a mouse or a pen over a text link underlines it (a finger hovers over nothing) */
function onPointerOver(e: PointerEvent) {
  if(e.pointerType === 'touch') {
    return;
  }

  // the link the pointer is in: asked about once, not for every element of it the pointer crosses
  const link = (e.target as Element).closest?.<HTMLElement>(LINK_SELECTOR);
  if(link === hoverTarget) {
    return;
  }

  hoverTarget = link;
  // a pointer brought over the link with a button down is dragging something past it, a selection:
  // the link is underlined once the button is let go over it
  hoverDragged = !!link && !!e.buttons;
  setHovered(link && !e.buttons ? getPressableLink(link)?.link : undefined);
}

/** the pointer leaving the window, or into a frame */
function onPointerOut(e: PointerEvent) {
  if(!e.relatedTarget) {
    hoverTarget = undefined;
    hoverDragged = false;
    setHovered(undefined);
  }
}

/** the first of the link's own nodes, past the plate a press or a menu may have put in it */
export function getLinkFirstChild(link: Element) {
  const first = link.firstChild;
  return first && first === plates.get(link as HTMLElement)?.container ? first.nextSibling : first;
}

/**
 * Keeps the plate of the link `target` is in lit while a menu opened from it stays open, so that the
 * menu shows what it was opened on. Returns what lets it go, or nothing when `target` is in no link.
 */
export function holdLinkPlate(target: EventTarget) {
  const pressable = getPressableLink(target);
  if(!pressable) {
    return;
  }

  const plate = mountPlate(pressable.link, pressable.inline);
  if(!plate.laidOut) {
    layoutPlate(plate);
  }

  ++plate.holds;
  updatePlate(plate);
  let held = true;
  return () => {
    if(held) {
      held = false;
      --plate.holds;
      updatePlate(plate);
    }
  };
}

export default function listenForLinkPress() {
  // capture: a handler that stops the event on its way still leaves the ripple to come and go
  const options: AddEventListenerOptions = {capture: true, passive: true};
  bindActiveWindowListener((w) => w.document, 'pointerdown', onPointerDown, options);
  bindActiveWindowListener((w) => w.document, 'pointerup', onPointerEnd, options);
  bindActiveWindowListener((w) => w.document, 'pointercancel', onPointerEnd, options);
  bindActiveWindowListener((w) => w.document, 'pointerover', onPointerOver, options);
  bindActiveWindowListener((w) => w.document, 'pointerout', onPointerOut, options);
  // a dragged link takes the pointer away without a pointerup in some engines; a context menu (a
  // Ctrl+click on macOS, a long press) may swallow it; the client moving into or out of a Document
  // PiP window leaves it in the other document, and the mouse over nothing of it
  bindActiveWindowListener((w) => w.document, 'dragstart', () => release(false), options);
  bindActiveWindowListener((w) => w.document, 'contextmenu', () => release(false), options);
  onAppWindowChange(() => {
    release(false);
    hoverTarget = undefined;
    hoverDragged = false;
    setHovered(undefined);
  });
}
