/*
 * What is sent flies out of where it was sent from into its message, as in Telegram for iOS
 * (ChatMessageTransitionNode) and Android (TextMessageEnterTransition and the sticker and voice
 * transitions of ChatActivity):
 *
 * - text from the composer: the bubble's background grows out of the composer's capsule and goes to
 *   where the bubble stands, and the text goes with it from where it was typed. The field's own text, a
 *   copy of it, gives way to the bubble's when the two are laid out differently. The time and the ticks
 *   ride the background's corner and come in over most of the way; a reply's quote flies from the panel
 *   above the field into the bubble's;
 * - an emoji-only message (and a dice): the emoji grow out of the field's into the big ones, the field's
 *   growing with them as they go;
 * - a sticker or a GIF from the panel, a round video from its preview: the picture goes from where it was
 *   to the message's media and grows or shrinks to its size; the rest of the message (its time) comes late,
 *   where it stands. A sticker or a GIF starts on the frame it was chosen at;
 * - a voice message: the send button's circle becomes the message's play button.
 *
 * Across and up have curves of their own, iOS's — across fast, up slower — which bends the way; both last
 * 300 ms.
 *
 * What flies is a copy, drawn over the chat (above the composer and the panel), while the message stands
 * where it goes, unseen. The list lays it out and scrolls to its end as always, only in the copy's time and
 * curve, so the older messages make room the way iOS has them do; the copy goes to where the message will
 * stand at that end. Then the copy goes and the message shows where it was, drawn on the same pixels. A
 * sticker, a GIF and the big emoji are not copied: the message's own picture is taken out of it to fly, held
 * still on the way (a picture that plays as it flies costs every frame), and put back; it plays on from there.
 *
 * The way is handed to the compositor, as iOS hands it to Core Animation: the copy is laid out once, and
 * then only moved, stretched and faded by animations of transform and opacity, so nothing of it is laid
 * out or drawn again on the way, and the page's own work then (the message being made, the list) cannot
 * hold it up. Every part moves across in a wrapper and up in itself, each on its own curve, from where it
 * starts to where it ends: two keyframes. A text bubble's background, which changes its size, is made of
 * bands and corners that only move and stretch, so that its corners stay round. Should the message's place
 * at the end change on the way, the copy follows it. A later send moves the whole earlier copy with
 * the list on its own clock, including after that copy's original flight has finished.
 *
 * A source is captured as it is let go (the composer about to be cleared, the panel to close), and its copy
 * stands in its place from then on, so nothing blinks while the message is being made. The next own
 * message of the chat that matches it claims it; if none comes in time, the copy fades.
 *
 * Only with full animations ("motion"): at the reduced level and below the message just appears, as before.
 * Nothing flies when the chat is not at its end (the list jumps there), in the schedule, or when the
 * message is taller than the chat.
 */

import BezierEasing from '@vendor/bezierEasing';
import liteMode from '@helpers/liteMode';
import {getAppWindow} from '@helpers/appWindow';
import pause from '@helpers/schedulers/pause';
import noop from '@helpers/noop';
import deferredPromise from '@helpers/cancellablePromise';
import animationIntersector from '@components/animationIntersector';
import drawMediaToCanvas, {DrawableMedia} from '@helpers/canvas/drawMediaToCanvas';
import shouldSnapshotImage from '@components/mediaViewer/shouldSnapshotImage';
import clamp from '@helpers/number/clamp';
import {lerp} from '@helpers/lerp';
import lottieLoader from '@lib/lottie/lottieLoader';
import type LottiePlayer from '@lib/lottie/lottiePlayer';
import {getSendingStatusIconState, setSendingStatusIconState, settleSendingStatusIconCopy} from '@components/sendingStatusIcon';
import {Message, MessageMedia} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import styles from '@components/chat/sendFlights.module.scss';

const DURATION = 300;
const CURVE_X = [.23, 1, .32, 1] as const;
const CURVE_Y = [.1992, .0106, .2792, .9103] as const;
const EASE_X = BezierEasing(...CURVE_X);
const EASE_Y = BezierEasing(...CURVE_Y);
const EASING_X = `cubic-bezier(${CURVE_X.join(', ')})`;
const EASING_Y = `cubic-bezier(${CURVE_Y.join(', ')})`;
// how long the message may take to come out after its source was let go
const HOLD_TIMEOUT = 1500;
// how long the copy may stay on a message the list is still scrolling to, after its way is over
const SETTLE_TIMEOUT = 300;
// how long the way may wait for the message's pictures to load, which lay it out
const IMAGES_WAIT = 150;
// the bubble's background shows within this much of the way
const BACKGROUND_IN = 100;
// the bubble's text comes as the field's goes, both at once, as on iOS
const TEXT_IN = 80;
const TEXT_OUT = 100;
// the time and the ticks come with the bubble's corner, over most of the way
const STATUS_IN = 250;
// a reply's quote goes from the composer's panel into the bubble: the panel's goes as the bubble's comes
const REPLY_IN = 100;
const REPLY_OUT = 150;
// the field's emoji go as the big ones grow out of them
const EMOJI_TEXT_OUT = 150;
// what comes with a picture rather than in it (its time, a reply) shows late, where it stands
const REST_IN_DELAY = 160;
const REST_IN = 150;
// a copy of a picture fades from over the message's own
const LAND_FADE = 100;
// the picture of a sticker or a GIF as it was chosen gives way to the message's own, which flies, as on iOS:
// once that shows the same moment (it may still be loading, and the landing waits for it), or once the way is
// over and the landing has waited as long as it may, whatever happens
const SNAPSHOT_OUT = 80;
const MOMENT_WAIT = DURATION + SETTLE_TIMEOUT;
const ABORT_FADE = 150;
// a change of the message's place this late in the way is jumped with, as the message itself jumps
const BEND_UNTIL = .98;

/** the list's scroll to a message that flies in: in the time and the curve of its way up, as on iOS */
export const SEND_FLIGHT_SCROLL = {duration: DURATION, transition: EASE_Y};

type Box = {left: number, top: number, right: number, bottom: number};
type Point = {x: number, y: number};
type Glyphs = {first: DOMRect, last: DOMRect, text: string, color: string};
type Radii = {topLeft: number, topRight: number, bottomRight: number, bottomLeft: number};
/** an animation of a part of a copy: its keyframes over the whole way, and the curve between them */
type Track = {element: HTMLElement, keyframes: Keyframe[], easing: string};
/** a part that moves across in a wrapper, and up in itself */
type Axes = {across: HTMLElement, part: HTMLElement};

export type SendFlightsHost = {
  /** the chat's element: the copies are drawn in it */
  container: () => HTMLElement,
  /** whether a message sent now is shown at once, at the end of the list */
  canFly: () => boolean,
  /** the height of the visible list: a message taller than it does not fly */
  viewportHeight: () => number,
  /** how far the list still has to scroll to its end, where the message will stand */
  scrollToEnd: () => number,
  /**
   * What moves the message's place at the list's end when its size changes: the list, what it scrolls, and
   * the paddings around that, one of which follows the composer's height
   */
  observed: () => Element[]
};

type Layer = {
  element: HTMLElement,
  /** how much it shows, by how far the way up has gone */
  opacity?: (pY: number) => number
};

/** where a picture that plays was as it was chosen: a sticker's frame, a video's time */
type Moment = {frame?: number, time?: number};

type FlightTarget = {
  /** the element the copy flies into */
  target: HTMLElement,
  /** what is not seen while the copy flies */
  hidden: HTMLElement[],
  /** what comes late, where it stands */
  lateIn?: HTMLElement[],
  /** more layers of the copy */
  layers?: Layer[]
};

const toBox = (rect: DOMRect | Box): Box => ({left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom});
const boxWidth = (box: Box) => box.right - box.left;
const boxHeight = (box: Box) => box.bottom - box.top;
const centerX = (box: Box) => (box.left + box.right) / 2;
const centerY = (box: Box) => (box.top + box.bottom) / 2;

// a box, empty rather than turned inside out
const makeBox = (left: number, top: number, right: number, bottom: number): Box => ({
  left,
  top,
  right: Math.max(left, right),
  bottom: Math.max(top, bottom)
});

const moveBox = (box: Box, by: Box): Box => ({
  left: box.left + by.left,
  top: box.top + by.top,
  right: box.right + by.right,
  bottom: box.bottom + by.bottom
});

const boxAround = (boxes: Box[]) => makeBox(
  Math.min(...boxes.map((box) => box.left)),
  Math.min(...boxes.map((box) => box.top)),
  Math.max(...boxes.map((box) => box.right)),
  Math.max(...boxes.map((box) => box.bottom))
);

// a box from the overlay's corner
const fromOrigin = (box: Box, {x, y}: Point) => makeBox(box.left - x, box.top - y, box.right - x, box.bottom - y);

// where the page draws a box, a picture, a background: on whole device pixels (of the window the chat is in). The
// copy lands where its message is drawn, not a fraction of a pixel off it
const snap = (value: number) => {
  const {devicePixelRatio} = getAppWindow();
  return Math.round(value * devicePixelRatio) / devicePixelRatio;
};
const snapBox = (box: Box): Box => ({left: snap(box.left), top: snap(box.top), right: snap(box.right), bottom: snap(box.bottom)});

// where an element of the list will be once the list has scrolled the rest of the way to its end
const atEnd = (rect: DOMRect, scrollToEnd: number): Box => ({
  left: rect.left,
  right: rect.right,
  top: rect.top - scrollToEnd,
  bottom: rect.bottom - scrollToEnd
});

const clamp01 = (value: number) => clamp(value, 0, 1);

// a box as far from its source towards its place as the way has gone: across and up are their own ways, but
// a box is only ever asked for at the way's start or end, where they are one
function lerpBox(source: Box, place: Box, progress: number): Box {
  return {
    left: lerp(source.left, place.left, progress),
    right: lerp(source.right, place.right, progress),
    top: lerp(source.top, place.top, progress),
    bottom: lerp(source.bottom, place.bottom, progress)
  };
}

// where a picture of this aspect is drawn in a box that fits it in
function fitInto(box: Box, aspect: number): Box {
  const width = Math.min(boxWidth(box), boxHeight(box) * aspect);
  const height = width / aspect;
  const x = (box.left + box.right - width) / 2;
  const y = (box.top + box.bottom - height) / 2;
  return {left: x, top: y, right: x + width, bottom: y + height};
}

const translate = (x: number, y: number) => `translate(${x}px, ${y}px)`;

// the way of a part across, on its curve, in its wrapper, and up, on its own, in itself
function across(element: HTMLElement, from: string, to: string): Track {
  return {element, keyframes: [{transform: from}, {transform: to}], easing: EASING_X};
}

function up(element: HTMLElement, from: string, to: string): Track {
  return {element, keyframes: [{transform: from}, {transform: to}], easing: EASING_Y};
}

// an element of a copied message, which cannot be wrapped without changing how it is laid out, going from one
// offset to another: across by its own `translate`, up by its `transform`, each on its curve
function shift(element: HTMLElement, from: Point, to: Point): Track[] {
  return [
    {element, keyframes: [{translate: `${from.x}px 0px`}, {translate: `${to.x}px 0px`}], easing: EASING_X},
    up(element, `translateY(${from.y}px)`, `translateY(${to.y}px)`)
  ];
}

// a part going from one point to another, across and up
function move({across: wrapper, part}: Axes, from: Point, to: Point): Track[] {
  return [
    across(wrapper, `translateX(${from.x}px)`, `translateX(${to.x}px)`),
    up(part, `translateY(${from.y}px)`, `translateY(${to.y}px)`)
  ];
}

// a part laid out as `base` (from the corner of what it is in) going from one box to another: moved and
// stretched from its top left corner
function stretch({across: wrapper, part}: Axes, base: Box, from: Box, to: Box): Track[] {
  const alongX = (box: Box) => `translateX(${box.left - base.left}px) scaleX(${boxWidth(box) / boxWidth(base)})`;
  const alongY = (box: Box) => `translateY(${box.top - base.top}px) scaleY(${boxHeight(box) / boxHeight(base)})`;
  return [across(wrapper, alongX(from), alongX(to)), up(part, alongY(from), alongY(to))];
}

// a picture laid out as `base` going from one box to another: its middle across and up, and its size, from
// its middle, on the across curve, as on iOS. Here the part moves across and its wrapper up
function grow(wrapper: HTMLElement, part: HTMLElement, base: Box, from: Box, to: Box): Track[] {
  const alongX = (box: Box) => {
    return `translateX(${centerX(box) - centerX(base)}px) scale(${boxWidth(box) / boxWidth(base)}, ${boxHeight(box) / boxHeight(base)})`;
  };
  const alongY = (box: Box) => `translateY(${centerY(box) - centerY(base)}px)`;
  return [across(part, alongX(from), alongX(to)), up(wrapper, alongY(from), alongY(to))];
}

// a fade in time: its opacity at moments of the way, straight between them
function fade(element: HTMLElement, ...stops: [opacity: number, at: number][]): Track {
  return {
    element,
    keyframes: stops.map(([opacity, at]) => ({opacity, offset: at / DURATION})),
    easing: 'linear'
  };
}

function layOut(element: HTMLElement, box: Box) {
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${boxWidth(box)}px`;
  element.style.height = `${boxHeight(box)}px`;
}

function createPart(className: string) {
  const element = document.createElement('div');
  element.classList.add(className);
  return element;
}

function createAxes(part: HTMLElement): Axes {
  const wrapper = createPart(styles.part);
  wrapper.append(part);
  return {across: wrapper, part};
}

function isVisible(element: Element) {
  return !!element?.isConnected && element.getClientRects().length > 0;
}

function hasBackground(color: string) {
  return color !== 'transparent' && !/,\s*0\)$/.test(color);
}

/** an element's corners as they are drawn: CSS makes them all smaller together when two are more than a side */
function getRadii(style: CSSStyleDeclaration, rect: DOMRect): Radii {
  const toLength = (value: string, size: number) => value.endsWith('%') ? parseFloat(value) * size / 100 : parseFloat(value) || 0;
  const radii: Radii = {
    topLeft: toLength(style.borderTopLeftRadius, rect.width),
    topRight: toLength(style.borderTopRightRadius, rect.width),
    bottomRight: toLength(style.borderBottomRightRadius, rect.width),
    bottomLeft: toLength(style.borderBottomLeftRadius, rect.width)
  };
  const {topLeft, topRight, bottomRight, bottomLeft} = radii;
  const factor = Math.min(
    1,
    rect.width / (topLeft + topRight),
    rect.width / (bottomLeft + bottomRight),
    rect.height / (topLeft + bottomLeft),
    rect.height / (topRight + bottomRight)
  );
  for(const key in radii) {
    radii[key as keyof Radii] *= factor;
  }

  return radii;
}

// a box's shadow as the shadow of whatever is drawn: the shape is made of pieces, and casts one shadow. A
// box's blur is twice the deviation of its Gaussian, a drop shadow's is the deviation itself
function toDropShadow(boxShadow: string) {
  return boxShadow.split(/,(?![^(]*\))/).map((shadow) => {
    const color = shadow.match(/[a-z-]+\([^)]*\)|#[\da-f]+/i)?.[0];
    const lengths = color && shadow.replace(color, '').match(/-?[\d.]+px/g);
    return lengths?.length >= 2 && !shadow.includes('inset') ?
      `drop-shadow(${lengths[0]} ${lengths[1]} ${(parseFloat(lengths[2]) || 0) / 2}px ${color})` :
      '';
  }).join(' ');
}

// the quarter of a circle in each corner, in the order `getShape` has them
const CORNERS: {radius: keyof Radii, corner: 'TopLeft' | 'TopRight' | 'BottomRight' | 'BottomLeft'}[] = [
  {radius: 'topLeft', corner: 'TopLeft'},
  {radius: 'topRight', corner: 'TopRight'},
  {radius: 'bottomRight', corner: 'BottomRight'},
  {radius: 'bottomLeft', corner: 'BottomLeft'}
];

// a band of the background is laid out as this, and stretched to its place
const PIECE_SIZE = 100;
const PIECE_BOX: Box = {left: 0, top: 0, right: PIECE_SIZE, bottom: PIECE_SIZE};

/**
 * A rounded box in pieces that only move and stretch, so that it changes its size and its corners do not:
 * the four bands between the corners, from one side to past the middle (each a pixel into the corners it
 * meets, where they are round, so that no seam shows), and where each corner's quarter of a circle stands.
 * What is across of each depends only on the box's sides across, and what is up only on its top and bottom.
 */
function getShape(box: Box, radii: Radii): {bands: Box[], corners: Point[]} {
  const {left, top, right, bottom} = box;
  const {topLeft, topRight, bottomRight, bottomLeft} = radii;
  const into = (radius: number) => Math.min(1, radius);
  return {
    bands: [
      makeBox(left + topLeft - into(topLeft), top, right - topRight + into(topRight), bottom - Math.max(bottomLeft, bottomRight)),
      makeBox(left + bottomLeft - into(bottomLeft), top + Math.max(topLeft, topRight), right - bottomRight + into(bottomRight), bottom),
      makeBox(left, top + topLeft - into(topLeft), right - Math.max(topRight, bottomRight), bottom - bottomLeft + into(bottomLeft)),
      makeBox(left + Math.max(topLeft, bottomLeft), top + topRight - into(topRight), right, bottom - bottomRight + into(bottomRight))
    ],
    corners: [
      {x: left, y: top},
      {x: right - topRight, y: top},
      {x: right - bottomRight, y: bottom - bottomRight},
      {x: left, y: bottom - bottomLeft}
    ]
  };
}

/** the first and the last letter of a text, the text itself with its spaces collapsed, and its colour */
function getGlyphs(root: Element, skip?: string): Glyphs {
  if(!root) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      return !node.textContent.trim() || (skip && node.parentElement?.closest(skip)) ?
        NodeFilter.FILTER_SKIP :
        NodeFilter.FILTER_ACCEPT;
    }
  });

  let first: Text, last: Text, text = '';
  for(let node = walker.nextNode() as Text; node; node = walker.nextNode() as Text) {
    first ??= node;
    last = node;
    text += node.textContent;
  }

  if(!first) {
    return;
  }

  const range = document.createRange();
  const firstText = first.textContent;
  const start = firstText.search(/\S/);
  range.setStart(first, start);
  range.setEnd(first, start + (firstText.codePointAt(start) > 0xFFFF ? 2 : 1));
  const firstRect = range.getBoundingClientRect();

  const lastText = last.textContent;
  const end = lastText.trimEnd().length;
  const lowSurrogate = end > 1 && /[\uDC00-\uDFFF]/.test(lastText[end - 1]);
  range.setStart(last, end - (lowSurrogate ? 2 : 1));
  range.setEnd(last, end);
  const lastRect = range.getBoundingClientRect();

  return {
    first: firstRect,
    last: lastRect,
    text: text.replace(/\s+/g, ' ').trim(),
    color: getComputedStyle(first.parentElement).color
  };
}

// a custom emoji of the field, as it is drawn there
type FieldEmoji = {docId: string, picture: HTMLCanvasElement, box: Box};

/**
 * The field's custom emoji as they are drawn. The field holds transparent placeholders for them, and they are
 * drawn on a canvas next to it, which a copy of the field does not take along; nor does a copy of the bubble get
 * its own ones, drawn by a worker.
 */
function getFieldEmoji(input: HTMLElement): FieldEmoji[] {
  const placeholders = Array.from(input.querySelectorAll<HTMLElement>('.custom-emoji-placeholder'));
  const renderer = placeholders.length ? input.previousElementSibling : undefined;
  const source = renderer?.matches('custom-emoji-renderer-element') && renderer.querySelector('canvas');
  if(!source?.width || !source.height) {
    return [];
  }

  const sourceRect = source.getBoundingClientRect();
  const scaleX = source.width / sourceRect.width;
  const scaleY = source.height / sourceRect.height;
  return placeholders.map((placeholder) => {
    const box = toBox(placeholder.getBoundingClientRect());
    const picture = document.createElement('canvas');
    picture.width = Math.max(1, Math.round(boxWidth(box) * scaleX));
    picture.height = Math.max(1, Math.round(boxHeight(box) * scaleY));
    picture.getContext('2d').drawImage(
      source,
      (box.left - sourceRect.left) * scaleX, (box.top - sourceRect.top) * scaleY, picture.width, picture.height,
      0, 0, picture.width, picture.height
    );
    return {docId: placeholder.dataset.docId, picture, box};
  });
}

/** puts a custom emoji's picture on a copy, over where the emoji is (`box`, with the copy's corner at `from`) */
function putEmoji(copy: HTMLElement, picture: HTMLCanvasElement, box: Box, from: Point) {
  const element = document.createElement('canvas');
  element.width = picture.width;
  element.height = picture.height;
  element.getContext('2d').drawImage(picture, 0, 0);
  element.style.cssText = `position: absolute; left: ${box.left - from.x}px; top: ${box.top - from.y}px; ` +
    `width: ${boxWidth(box)}px; height: ${boxHeight(box)}px`;
  copy.append(element);
}

/**
 * A copy of an element that shows what it shows: its canvases have their pixels drawn in, its videos (and its
 * images whose object URL may be gone) are pictures of what they show, and what is not shown in it (hidden by a
 * rule through its ancestors, which the copy, drawn elsewhere, would not get) is left out. A copy is no message,
 * field or button: ids and keys are dropped.
 */
function copyElement<T extends HTMLElement>(source: T, pairs: CopyPairs = new Map()): T {
  const copy = cloneWithPairs(source, pairs);
  const hidden: Element[] = [];
  pairs.forEach((element, original) => {
    if(original === source) {
      return;
    }

    if(
      original instanceof HTMLElement &&
      !original.getClientRects().length &&
      getComputedStyle(original).display !== 'contents'
    ) {
      hidden.push(element);
      pairs.delete(original);
    } else if(original instanceof HTMLCanvasElement) {
      // a sticker drawn by a worker (a reply's thumbnail) has its frame asked for
      const player = original.dataset.offscreen ? lottieLoader.getAnimation(original.parentElement) : undefined;
      if(player?.offscreen) {
        paintPlayerFrame(player, element as HTMLCanvasElement, player.curFrame);
      } else if(original.width && original.height) try {
        (element as HTMLCanvasElement).getContext('2d').drawImage(original, 0, 0);
      } catch{}
    } else if(
      original instanceof HTMLVideoElement ||
      // a picture by a worker's object URL that may be revoked by now: the original shows what it decoded, a copy
      // would load the URL anew
      (original instanceof HTMLImageElement && shouldSnapshotImage(original))
    ) {
      const frame = drawMediaToCanvas(original) || document.createElement('canvas');
      frame.className = original.className;
      frame.style.cssText = original.style.cssText;
      // laid out and cropped as it was, by rules of its tag too (`.reply-media > img`), which a canvas does not get
      keepStyle(original, frame, ['width', 'height', 'object-fit', 'object-position']);
      element.replaceWith(frame);
      pairs.set(original, frame);
    }
  });
  hidden.forEach((element) => element.remove());

  dropIdentity(copy);
  return copy;
}

// which element of a copy is which of its source's
type CopyPairs = Map<Element, Element>;

/**
 * A deep copy, and which of its elements is which of the source's. Not by their order: an element of the page's
 * own may add children as it is made (a custom emoji renderer, its canvas), and its copy does it again.
 */
function cloneWithPairs<T extends Element>(source: T, pairs: CopyPairs): T {
  const copy = source.cloneNode(false) as T;
  pairs.set(source, copy);
  source.childNodes.forEach((child) => {
    copy.appendChild(child instanceof Element ? cloneWithPairs(child, pairs) : child.cloneNode(true));
  });
  return copy;
}

// a copy is no message, field or button: its ids and keys go
function dropIdentity(copy: HTMLElement) {
  for(const element of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))]) {
    for(const name of ['id', 'data-mid', 'data-peer-id', 'data-doc-id', 'contenteditable', 'tabindex', 'role', 'aria-label']) {
      element.removeAttribute(name);
    }
  }
}

/**
 * A copy of a control (a button, a play button): small, and styled by rules through its ancestors, which a
 * copy drawn elsewhere would not get — so how each of its elements looks is put on it.
 */
function copyControl(original: HTMLElement) {
  const pairs: CopyPairs = new Map();
  const copy = copyElement(original, pairs);
  pairs.forEach((value, element) => {
    const elementCopy = value as HTMLElement;
    if(!elementCopy.style || !copy.contains(elementCopy)) {
      return;
    }

    // its size too: a glyph is often sized only through an ancestor (`.audio .audio-animated-icon`), and its
    // own is its artwork's
    keepStyle(element, elementCopy, ['color', 'background-color', 'opacity', 'transform', 'visibility', 'border-radius', 'fill', 'stroke', 'width', 'height']);
  });

  return copy;
}

// puts on an element of a copy how its original's properties came out, which rules it no longer gets gave it
function keepStyle(original: Element, copy: HTMLElement, properties: string[]) {
  const style = getComputedStyle(original);
  for(const property of properties) {
    copy.style.setProperty(property, style.getPropertyValue(property));
  }
}

/**
 * A copy is drawn out of its original's place: the custom properties the original gets there (set on it by
 * a selector through its ancestors, or inherited from them) and the copy would not, are put on the copy.
 */
function keepContext(original: Element, copy: HTMLElement, context: Element) {
  const originalStyle = getComputedStyle(original);
  const contextStyle = getComputedStyle(context);
  for(let i = 0, length = originalStyle.length; i < length; ++i) {
    const property = originalStyle[i];
    if(!property.startsWith('--')) {
      continue;
    }

    const value = originalStyle.getPropertyValue(property);
    if(value !== contextStyle.getPropertyValue(property)) {
      copy.style.setProperty(property, value);
    }
  }
}

/**
 * Paints a frame of a sticker drawn by a worker on a canvas, once it arrives: the sticker's own canvas, handed
 * over to the worker, cannot be drawn from
 */
function paintPlayerFrame(player: LottiePlayer, canvas: HTMLCanvasElement, frameNo?: number) {
  player.exportFrame(frameNo).then(({frame}) => {
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.getContext('2d').drawImage(frame, 0, 0);
    frame.close?.();
  }).catch(noop);
}

/**
 * The picture a media element (a sticker's canvas, an image, a video) shows now, with where it is drawn. A
 * sticker drawn by a worker has its frame asked for: the canvas comes at once and is painted when the
 * frame arrives.
 */
function snapshotMedia(container: HTMLElement) {
  const candidates = container.matches('canvas, img, video') ?
    [container] :
    Array.from(container.querySelectorAll<HTMLElement>('canvas, img, video'));
  // the topmost of what is shown: a thumb goes under the sticker that replaces it
  const media = candidates.reverse().find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width && rect.height && getComputedStyle(element).opacity !== '0';
  }) as DrawableMedia;
  if(!media) {
    return;
  }

  // the moment it shows, which the message's own picture starts at
  const moment: Moment = {};
  const player = media instanceof HTMLCanvasElement ?
    lottieLoader.getAnimation(container) || lottieLoader.getAnimation(media.parentElement) :
    undefined;
  if(player) {
    moment.frame = player.curFrame;
  } else if(media instanceof HTMLVideoElement) {
    moment.time = media.currentTime;
  }

  let canvas: HTMLCanvasElement;
  if(media instanceof HTMLCanvasElement && media.dataset.offscreen) {
    if(!player?.offscreen) {
      return;
    }

    canvas = document.createElement('canvas');
    canvas.width = media.width;
    canvas.height = media.height;
    paintPlayerFrame(player, canvas, moment.frame);
  } else {
    try {
      canvas = drawMediaToCanvas(media);
    } catch{}
  }

  if(!canvas) {
    return;
  }

  const style = getComputedStyle(media);
  const objectFit = style.objectFit === 'fill' ? 'contain' : style.objectFit;
  canvas.style.objectFit = objectFit;
  if(style.transform !== 'none') {
    canvas.style.transform = style.transform;
  }

  const rect = toBox(media.getBoundingClientRect());
  return {
    canvas,
    rect,
    // where the picture itself is: a picture fitted in leaves the rest of its element empty
    picture: objectFit === 'contain' && canvas.width && canvas.height ? fitInto(rect, canvas.width / canvas.height) : rect,
    moment
  };
}

// where a reply's quote has its title, in it
function getTitleOffset(reply: Element): Point {
  const title = reply.querySelector('.reply-title');
  const replyRect = reply.getBoundingClientRect();
  const titleRect = (title || reply).getBoundingClientRect();
  return {x: titleRect.left - replyRect.left, y: titleRect.top - replyRect.top};
}

function getMessageDocument(message: Message.message) {
  return (message.media as MessageMedia.messageMediaDocument)?.document as MyDocument;
}

function isVoiceDocument(document: MyDocument) {
  return document?.type === 'voice' || !!document?.attributes?.some((attribute) => {
    return attribute._ === 'documentAttributeAudio' && attribute.pFlags.voice;
  });
}

function isRoundDocument(document: MyDocument) {
  return document?.type === 'round' || !!document?.attributes?.some((attribute) => {
    return attribute._ === 'documentAttributeVideo' && attribute.pFlags.round_message;
  });
}

/** a box showing a picture (and whatever else fills it), laid out once and stretched to where it is */
function createPictureBox(layers: HTMLElement[], round?: boolean) {
  const box = createPart(styles.box);
  if(round) {
    box.classList.add(styles.round);
  }

  for(const layer of layers) {
    layer.classList.add(styles.fill);
    box.append(layer);
  }

  return box;
}

type MovableParent = Element & {moveBefore?: (node: Node, child: Node | null) => void};

// moves an element as it is: a video playing goes on playing. Says whether it did; moved the old way, a canvas drawn
// by a worker may show nothing till its frame is put on it again
function moveTo(parent: MovableParent, element: Element, before: Node | null) {
  if(parent.moveBefore) try {
    parent.moveBefore(element, before);
    return true;
  } catch{}

  parent.insertBefore(element, before);
  return false;
}

/**
 * Takes a picture out of its message to fly it: the very element (a sticker, a GIF, the big emoji), so that
 * nothing of it is drawn anew when it is back. Nothing of it plays on the way — what comes into it on the way
 * neither, a sticker or a video loaded late — and it goes on once it is back. An empty element as big as it,
 * unseen, holds its place in the message meanwhile. Where it flies it stays in empty copies of what holds it, up
 * to its bubble, which are neither laid out nor drawn: the rules that style it through them style it there too.
 */
function borrow(element: HTMLElement, into: HTMLElement, bubble: HTMLElement, size: {width: number, height: number}) {
  // what holds its place is laid out as it is: an element of a size of its own (a sticker, a GIF) by an empty one
  // as big, any other (the big emoji, laid out by their pictures and their line) by a copy of it
  let placeholder: HTMLElement;
  if(element.style.width && element.style.height) {
    placeholder = document.createElement(element.tagName);
    placeholder.className = element.className;
    placeholder.style.cssText = element.style.cssText;
    placeholder.style.boxSizing = 'border-box';
    placeholder.style.width = `${size.width}px`;
    placeholder.style.height = `${size.height}px`;
  } else {
    placeholder = element.cloneNode(true) as HTMLElement;
    dropIdentity(placeholder);
  }

  placeholder.classList.add(styles.hidden);
  element.before(placeholder);

  let holder = into;
  const chain: HTMLElement[] = [];
  for(let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    chain.unshift(ancestor);
    if(ancestor === bubble) {
      break;
    }
  }

  for(const ancestor of chain) {
    const shell = document.createElement(ancestor.tagName);
    shell.className = ancestor.className;
    shell.style.cssText = ancestor.style.cssText;
    shell.classList.add(styles.context);
    // under what else the box shows
    holder.insertBefore(shell, holder === into ? into.firstChild : null);
    holder = shell;
  }

  element.classList.add(styles.borrowed);
  moveTo(holder, element, null);
  // a canvas drawn by a worker may lose its frame on a move
  lottieLoader.nudgePresentWithin(element);

  // a video plays by itself: it is not let to till it is back, and is stopped should anything start it (media
  // events do not bubble, but they are caught on their way down)
  const autoplaying = new Set<HTMLVideoElement>();
  const hold = () => {
    animationIntersector.toggleAnimationsUnder(element, true);
    element.querySelectorAll('video').forEach((video) => {
      if(video.autoplay) {
        video.autoplay = false;
        autoplaying.add(video);
      }

      video.pause();
    });
  };
  const stop = (e: Event) => (e.target as HTMLVideoElement).pause();
  const observer = new MutationObserver(hold);
  observer.observe(element, {childList: true, subtree: true});
  element.addEventListener('play', stop, true);
  hold();
  return {
    placeholder,
    /** puts it back; moved there the old way, says when its picture is drawn again */
    giveBack: (): Promise<void> | undefined => {
      observer.disconnect();
      element.removeEventListener('play', stop, true);
      element.classList.remove(styles.borrowed);
      let presented: Promise<void>;
      if(placeholder.parentElement) {
        if(!moveTo(placeholder.parentElement, element, placeholder)) {
          presented = getPlayer(element)?.ensurePresented();
        }

        lottieLoader.nudgePresentWithin(element);
      }

      placeholder.remove();
      // let to play again: whether it plays now (the window idle or hidden, the chat's group not the playing one) is
      // the intersector's call
      autoplaying.forEach((video) => video.autoplay = true);
      animationIntersector.toggleAnimationsUnder(element, false);
      return presented;
    }
  };
}

// what of an element is around a part of it: whatever stands beside the part, or beside what holds it
function getAround(part: HTMLElement, root: HTMLElement) {
  const around: HTMLElement[] = [];
  for(let element = part; element !== root && element.parentElement; element = element.parentElement) {
    for(const sibling of Array.from(element.parentElement.children)) {
      if(sibling !== element && sibling instanceof HTMLElement) {
        around.push(sibling);
      }
    }
  }

  return around;
}

function getPlayer(element: HTMLElement) {
  const canvas = element.querySelector('canvas');
  return lottieLoader.getAnimation(element) || (canvas && lottieLoader.getAnimation(canvas.parentElement));
}

// a sticker on a frame: it starts there when it is sent from the panel, one that has played on is put back
function showFrame(player: LottiePlayer, frame: number) {
  return new Promise<void>((resolve) => player.onFirstFrame(() => {
    if(player.curFrame === frame) {
      resolve();
      return;
    }

    const onFrame = (frameNo: number) => {
      if(frameNo === frame) {
        player.removeEventListener('enterFrame', onFrame);
        resolve();
      }
    };
    player.addEventListener('enterFrame', onFrame);
    player.curFrame = frame;
    player.requestFrame(frame);
  }));
}

// a video at a time, once it knows its length
function showTime(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    const seek = () => {
      video.addEventListener('seeked', () => resolve(), {once: true});
      video.currentTime = time;
    };

    if(video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seek();
    } else {
      video.addEventListener('loadedmetadata', seek, {once: true});
    }
  });
}

/**
 * The message's own picture shows the moment its source showed as it was chosen: its sticker that frame, its
 * video that time, as soon as it has them, which may be on the way. Says once it does, or at the way's end
 * whatever happens.
 */
function showMoment(element: HTMLElement, moment: Moment): Promise<unknown> {
  let observer: MutationObserver;
  const shown = new Promise<void>((resolve) => {
    const show = () => {
      const player = moment.frame !== undefined && getPlayer(element);
      const video = moment.time !== undefined && element.querySelector('video');
      if(!player && !video && (moment.frame !== undefined || moment.time !== undefined)) {
        return false;
      }

      observer?.disconnect();
      (player ? showFrame(player, moment.frame) : video ? showTime(video, moment.time) : Promise.resolve()).then(resolve);
      return true;
    };

    if(!show()) {
      observer = new MutationObserver(show);
      observer.observe(element, {childList: true, subtree: true});
    }
  });

  return Promise.race([shown, pause(MOMENT_WAIT)]).finally(() => observer?.disconnect());
}

export abstract class SendFlight {
  public root: HTMLElement;
  public done: boolean;
  protected target: HTMLElement;
  /** what of the message is not seen while the copy flies */
  protected hidden: HTMLElement[] = [];
  /** what of the message comes late, where it stands, while its picture flies */
  protected lateIn: HTMLElement[] = [];
  /** what of the source is not seen while its copy stands in for it */
  protected sourceHidden: HTMLElement[] = [];
  /** how long the copy fades from over the message once there */
  protected landFade = 0;
  /**
   * What it carries is laid out at the width it was copied at (a bubble's text): a target laid out anew at another
   * width on the way (a sidebar opened, the window resized) cannot be followed, and the flight is let go
   */
  protected fixedWidth = false;
  /** its height is stretched across, with its width (a picture grown from its middle), rather than up (a bubble) */
  protected heightAcross = false;
  /**
   * What comes late waits for the landing: the message's own picture flies over it, and in the message it is
   * drawn over the picture
   */
  protected lateOnLanding = false;
  private lateAnimations: Animation[] = [];
  /** what the landing waits for besides the list: the message's own picture showing the moment it flies from */
  protected landingReady = true;
  /** the message that claimed it: the server's once it is sent */
  public message: Message.message;
  /** the id it claimed it under, which what was drawn of it before it was sent still goes by */
  public claimedMid: number;
  /** the frame the message's sticker is to start at, the one its source was at */
  public startFrame: number;
  // the message's own picture, which flies rather than a copy, and its bubble
  private own: {picture: HTMLElement, bubble: HTMLElement};
  private borrowed: ReturnType<typeof borrow>;
  /** where the target was measured to stand at the list's end: what the copy is laid out as */
  protected base: Box;
  /** where the target will stand at the list's end */
  protected end: Box;
  /** how far the way's start is moved back for the way to bend to a new end from where it was then */
  protected shift: Box = {left: 0, top: 0, right: 0, bottom: 0};
  private animations: Animation[] = [];
  // A later send moves the whole finished shape with the list on its own clock. Bending the original
  // 300 ms flight instead would squeeze this movement into its last frames, or jump once it is over.
  private listMovement: {animation: Animation, from: Point, to: Point};
  private followedEnd: Box;
  /** its message is there: the copy goes to it, or is about to */
  public launched = false;
  /** the message's bubble, once it is there */
  public bubble: HTMLElement;
  /**
   * The overlay's corner, in the page, as the copy was put in: the copy is laid out from it all the way. The overlay
   * and the copy with it move with the chat, and what is measured later is taken back by as far (`sinceHeld`)
   */
  protected origin: Point;
  /** resolved when it is over: landed, or let go */
  public landed = deferredPromise<void>();
  // when the way was over, and the copy began to wait for the list
  private arrivedAt: number;
  private holdTimeout: number;
  private settleTimeout: number;
  private observer: ResizeObserver;

  constructor(
    protected flights: SendFlights,
    public matches: (message: Message.message) => boolean
  ) {
    this.root = createPart(styles.flight);
  }

  /** stands the copy in its source's place until the message comes */
  public hold() {
    this.flights.mount(this);
    this.origin = {...this.flights.origin};
    this.holdTimeout = window.setTimeout(() => this.abort(true), HOLD_TIMEOUT);
    this.place();
    for(const element of this.sourceHidden) {
      element.classList.add(styles.hidden);
    }
  }

  /** the message is there: from now on the copy goes to it */
  public launch(bubble: HTMLElement) {
    clearTimeout(this.holdTimeout);
    if(this.done || this.launched) {
      return;
    }

    this.launched = true;
    this.bubble = bubble;
    this.flights.followOthers(this);
    const go = () => {
      bubble?.classList.remove(styles.hidden);
      if(this.done) {
        return;
      }

      try {
        this.start(bubble);
      } catch(err) {
        console.error('send flight', err);
        this.abort();
      }
    };

    // pictures of the message still loading (the big emoji) would change its size under what flies into it; it is not
    // seen meanwhile, as it is not while the copy flies
    const loading = Array.from(bubble?.querySelectorAll<HTMLImageElement>('.attachment img') || [])
    .filter((image) => !image.complete);
    if(loading.length) {
      bubble.classList.add(styles.hidden);
      Promise.race([Promise.all(loading.map((image) => image.decode().catch(noop))), pause(IMAGES_WAIT)]).then(go);
    } else {
      go();
    }
  }

  private start(bubble: HTMLElement) {
    // every read first: what the copy goes into and where it will stand, and where the copy is drawn from
    const rect = bubble?.isConnected ? this.prepare(bubble) : undefined;
    if(!rect?.width || rect.height > this.flights.host.viewportHeight()) {
      this.abort(true);
      return;
    }

    this.base = this.end = this.sinceHeld(atEnd(rect, this.flights.host.scrollToEnd()));

    // then the writes, and the way, to the compositor
    this.build();
    for(const element of this.hidden) {
      element.classList.add(styles.hidden);
    }

    // on their own: they run out whether the copy lands or not
    this.lateAnimations = this.lateIn.map((element) => {
      const animation = element.animate([{opacity: 0}, {opacity: 1}], {
        duration: REST_IN,
        delay: this.lateOnLanding ? 0 : REST_IN_DELAY,
        fill: 'backwards'
      });
      if(this.lateOnLanding) {
        animation.pause();
      }

      return animation;
    });

    this.animate();
    this.watch();
    this.settleTimeout = window.setTimeout(this.settle, DURATION);
  }

  /** a box measured now, in the page as it was when the copy was put in: the chat may have moved since */
  private sinceHeld(box: Box) {
    const now = this.flights.readOrigin();
    const x = this.origin.x - now.x, y = this.origin.y - now.y;
    return moveBox(box, {left: x, right: x, top: y, bottom: y});
  }

  /** a box of the way's start, moved back as far as the way has been bent */
  protected getSource(box: Box) {
    return moveBox(box, this.shift);
  }

  // how far the way has gone, on the animations' clock
  private getElapsed() {
    return (this.animations[0]?.currentTime as number) || 0;
  }

  /**
   * The way to the compositor. It starts with the next frame: that frame shows where the way starts, whenever
   * the page gets to draw it, and the way is timed from then — a way waiting for the compositor to start it
   * would wait again each time it is planned anew. Planned again, the same animations get new keyframes and
   * go on on their clock, from where they are.
   */
  protected animate() {
    const tracks = this.getTracks();
    if(this.animations.length === tracks.length) {
      tracks.forEach(({keyframes}, index) => (this.animations[index].effect as KeyframeEffect).setKeyframes(keyframes));
      return;
    }

    const animations = this.animations = tracks.map(({element, keyframes, easing}) => {
      return element.animate(keyframes, {duration: DURATION, easing, fill: 'forwards'});
    });
    // the frames and the clock of the window the chat is in: a Document PiP window has its own, which start later
    getAppWindow().requestAnimationFrame(() => {
      for(const animation of animations) {
        const time = animation.timeline?.currentTime;
        if(animation.startTime === null && time !== null) {
          animation.startTime = time;
        }
      }
    });
  }

  // what may move the message's place is watched, rather than its place read every frame
  private watch() {
    this.observer = new ResizeObserver(() => this.follow());
    for(const element of [this.target, ...this.flights.host.observed()]) {
      this.observer.observe(element, {box: 'border-box'});
    }
  }

  /**
   * Something changed its size, and has been laid out: the message's place is read again. If it has moved,
   * the way goes to the new one from where it is now: everything on it is the same straight line between its
   * start and its end, only drawn on a curve, so the start is moved back as far as makes the line pass where
   * the copy is.
   */
  private follow() {
    this.measureFollow()?.();
  }

  public measureFollow(newMessage = false): (() => void) | undefined {
    if(this.done || !this.target) {
      return;
    }

    if(!this.target.isConnected) {
      return () => this.abort(true);
    }

    const now = this.sinceHeld(atEnd(this.target.getBoundingClientRect(), this.flights.host.scrollToEnd()));
    const end = this.followedEnd || this.end;
    const delta: Box = {
      left: now.left - end.left,
      top: now.top - end.top,
      right: now.right - end.right,
      bottom: now.bottom - end.bottom
    };
    if(Object.values(delta).every((value) => Math.abs(value) < .5)) {
      return;
    }

    const sameSize = Math.abs(boxWidth(now) - boxWidth(end)) < .5 && Math.abs(boxHeight(now) - boxHeight(end)) < .5;
    if(
      this.fixedWidth && Math.abs(boxWidth(now) - boxWidth(this.base)) >= .5 ||
      (newMessage || this.listMovement) && !sameSize
    ) {
      return () => this.abort(true);
    }

    return () => {
      // The list may resize before the next flight launches. Follow positional changes on the list's
      // clock even then, rather than moving a finished flight's keyframes directly to the new end.
      if(sameSize) {
        const movement = this.listMovement;
        const progress = movement?.animation.effect.getComputedTiming().progress || 0;
        const from = movement ? {
          x: lerp(movement.from.x, movement.to.x, progress),
          y: lerp(movement.from.y, movement.to.y, progress)
        } : {x: 0, y: 0};
        const to = {x: now.left - this.end.left, y: now.top - this.end.top};
        const animation = this.root.animate([
          {transform: translate(from.x, from.y)},
          {transform: translate(to.x, to.y)}
        ], {duration: DURATION, easing: EASING_Y, fill: 'forwards'});
        movement?.animation.cancel();
        this.listMovement = {animation, from, to};
        this.followedEnd = now;
        this.arrivedAt = undefined;
        return;
      }

      const t = clamp01(this.getElapsed() / DURATION);
      const back = (progress: number) => progress >= BEND_UNTIL ? 0 : progress / (1 - progress);
      const x = back(EASE_X(t)), y = back(EASE_Y(t));
      // up, its middle goes on the up curve and its height on the curve it is stretched on
      const height = this.heightAcross ? x : y;
      const middleDelta = (delta.top + delta.bottom) / 2, heightDelta = delta.bottom - delta.top;
      this.shift = moveBox(this.shift, {
        left: -delta.left * x,
        right: -delta.right * x,
        top: -middleDelta * y + heightDelta * height / 2,
        bottom: -middleDelta * y - heightDelta * height / 2
      });
      this.end = now;
      this.animate();
    };
  }

  // the way is over: the copy goes once the list is at its end, where the message is under it
  private settle = () => {
    if(this.done) {
      return;
    }

    const elapsed = Math.min(this.getElapsed(), (this.listMovement?.animation.currentTime as number) ?? DURATION);
    if(elapsed < DURATION) {
      this.settleTimeout = window.setTimeout(this.settle, DURATION - elapsed);
      return;
    }

    this.arrivedAt ??= performance.now();
    if(!this.target.isConnected) {
      this.abort(true);
    } else if(
      (this.flights.host.scrollToEnd() < .5 && this.landingReady) ||
      performance.now() - this.arrivedAt > SETTLE_TIMEOUT
    ) {
      this.land();
    } else {
      getAppWindow().requestAnimationFrame(this.settle);
    }
  };

  public land() {
    const presented = this.finish();
    if(presented) {
      // its own picture, put back the old way, is drawn again some frames on: the copy stays over it till then
      this.cover();
      presented.then(() => this.leave(this.landFade));
    } else {
      this.leave(this.landFade);
    }

    if(this.lateOnLanding) {
      this.lateAnimations.forEach((animation) => animation.play());
    }
  }

  public abort(fade?: boolean) {
    if(this.done) {
      return;
    }

    clearTimeout(this.holdTimeout);
    // what was to come late is there at once, as the message is
    this.lateAnimations.forEach((animation) => animation.cancel());
    this.finish();
    this.leave(fade ? ABORT_FADE : 0);
  }

  /** goes at once, whatever it is doing: on its way, or already fading from over its message */
  public cancel() {
    this.abort();
    this.leave(0);
  }

  private finish() {
    this.done = true;
    clearTimeout(this.settleTimeout);
    this.observer?.disconnect();
    for(const element of [this.bubble, ...this.hidden, ...this.sourceHidden].filter(Boolean)) {
      element.classList.remove(styles.hidden);
    }

    this.hidden = this.sourceHidden = [];
    const presented = this.borrowed?.giveBack();
    this.restore();
    this.flights.forget(this);
    this.landed.resolve();
    return presented;
  }

  /** lets go of what of the message it follows */
  protected restore() {}

  /** shows what of the copy stands for the message's own picture, over it, where it landed */
  protected cover() {}

  /**
   * The message's own picture is to fly rather than a copy: what is around it in its message (its time, a
   * reply) comes once it is back
   */
  protected flyOwn(picture: HTMLElement, bubble: HTMLElement, wrappers: HTMLElement[] = []) {
    this.own = {picture, bubble};
    this.landFade = 0;
    this.lateOnLanding = true;
    this.lateIn.push(...wrappers.flatMap((wrapper) => getAround(picture, wrapper)));
  }

  /** takes the message's own picture into the box that flies it; where it was is followed from now on */
  protected takeOwn(into: HTMLElement) {
    if(!this.own) {
      return;
    }

    const {picture, bubble} = this.own;
    this.borrowed = borrow(picture, into, bubble, {width: boxWidth(this.base), height: boxHeight(this.base)});
    this.target = this.borrowed.placeholder;
    return picture;
  }

  private leave(fade: number) {
    const {root} = this;
    if(!fade || !root.isConnected) {
      root.remove();
      this.flights.forget(this);
      return;
    }

    root.animate([{opacity: 1}, {opacity: 0}], {duration: fade, fill: 'forwards'})
    .finished.catch(() => {}).finally(() => {
      root.remove();
      this.flights.forget(this);
    });
  }

  /** stands the copy where its source was */
  protected abstract place(): void;
  /**
   * Reads what of the message the copy flies into, and makes the rest of the copy, not on the page yet.
   * Says where the target is.
   */
  protected abstract prepare(bubble: HTMLElement): DOMRect | undefined;
  /** puts the copy together, laid out as it ends */
  protected abstract build(): void;
  /** the way of each part, from where it starts (`getSource`) to where it ends (`end`) */
  protected abstract getTracks(): Track[];
}

/**
 * Text from the composer. The bubble's background (and its tail) grows from the capsule into the bubble,
 * and what it carries is clipped by its box: a copy of the bubble, which goes from where its text stands on
 * the field's text to its place, and a copy of the field's text, which goes the same way and gives way to it.
 */
class TextFlight extends SendFlight {
  private field: Box;
  private fieldText: Box;
  private fieldGlyphs: Glyphs;
  private fieldCopy: HTMLElement;
  private fieldEmoji: FieldEmoji[];
  // the field showed only a part of its text, scrolled: its copy has no more
  private fieldClipped: boolean;

  // where the bubble's content box is in the bubble
  private contentOffset: Point;
  // where the content box starts, so that the bubble's text stands on the field's
  private contentFrom: Point;
  // the field's text is the bubble's all the way
  private keepFieldText: boolean;
  private background: {color: string, shadow: string, radii: Radii};
  // the bubble's corners and tail change as it joins a group or leaves one, on the way too
  private shapeObserver: MutationObserver;
  private tail: HTMLElement;
  private tailOffset: Point & {end: boolean};
  private bubbleCopy: HTMLElement;
  // the clip is two boxes as big as the chat that only move: one cuts what is before the background's top
  // left corner, the other one what is after its bottom right one
  private clipSize: Point;
  // the time and the ticks of the bubble's copy, and whether they stand at its end (or start) side; the
  // message's own, whose ticks the copy's follow as it is sent and read
  private status: HTMLElement;
  private statusAtEnd: boolean;
  private messageStatus: HTMLElement;
  private statusObserver: MutationObserver;
  // the reply's quote: a copy of the composer's panel, where it was, and the bubble's, and where it stands in it;
  // the two go title on title, as on iOS
  private panelReply: HTMLElement;
  private panelReplyFrom: Box;
  private panelTitleOffset: Point;
  private bubbleReply: HTMLElement;
  private bubbleReplyOffset: Point;
  private bubbleTitleOffset: Point;
  // an emoji-only message, which has no bubble, and where its emoji start
  private emoji: HTMLElement;
  private emojiFrom: Box;
  // what moves, put together: a bubble's, or the emoji's
  private parts: Partial<{
    background: HTMLElement,
    bands: Axes[],
    corners: Axes[],
    tail: Axes,
    clipStart: Axes,
    clipEnd: Axes,
    bubble: Axes,
    field: Axes,
    panelReply: Axes,
    emoji: HTMLElement
  }>;

  constructor(flights: SendFlights, options: {field: HTMLElement, input: HTMLElement, reply?: HTMLElement}) {
    super(flights, (message) => {
      return !message.fwd_from && (
        !message.media ||
        message.media._ === 'messageMediaWebPage' ||
        message.media._ === 'messageMediaDice'
      );
    });

    const {field, input} = options;
    this.field = toBox(field.getBoundingClientRect());
    this.fieldText = toBox(input.getBoundingClientRect());
    this.fieldGlyphs = getGlyphs(input);

    // the field's visible part: a scrolled field shows what it showed
    const fieldCopy = this.fieldCopy = createPart(styles.window);
    fieldCopy.style.width = `${boxWidth(this.fieldText)}px`;
    fieldCopy.style.height = `${boxHeight(this.fieldText)}px`;
    const copy = copyElement(input);
    const style = getComputedStyle(input);
    copy.removeAttribute('style');
    copy.classList.add(styles.fieldText);
    for(const property of [
      'font', 'line-height', 'color', 'letter-spacing', 'text-align', 'direction', 'white-space',
      'word-break', 'overflow-wrap', 'padding'
    ]) {
      copy.style.setProperty(property, style.getPropertyValue(property));
    }
    copy.style.width = `${input.clientWidth}px`;
    copy.style.top = `${-input.scrollTop}px`;
    keepContext(input, copy, flights.host.container());
    // its custom emoji, drawn next to it
    this.fieldEmoji = getFieldEmoji(input);
    this.fieldClipped = input.scrollHeight > input.clientHeight + 1;
    const copyFrom = {
      x: this.fieldText.left + input.clientLeft,
      y: this.fieldText.top + input.clientTop - input.scrollTop
    };
    this.fieldEmoji.forEach(({picture, box}) => putEmoji(copy, picture, box, copyFrom));
    fieldCopy.append(copy);
    this.root.append(fieldCopy);

    // the quote of the message replied to, from the panel above the field: it flies into the bubble's, and the
    // panel, which folds, does not show it meanwhile
    const panelReply = options.reply?.querySelector<HTMLElement>('.reply');
    if(isVisible(panelReply)) {
      this.panelReplyFrom = toBox(panelReply.getBoundingClientRect());
      this.panelTitleOffset = getTitleOffset(panelReply);
      const replyCopy = this.panelReply = copyElement(panelReply);
      replyCopy.classList.add(styles.quote);
      replyCopy.style.width = `${boxWidth(this.panelReplyFrom)}px`;
      replyCopy.style.height = `${boxHeight(this.panelReplyFrom)}px`;
      keepContext(panelReply, replyCopy, flights.host.container());
      this.root.append(replyCopy);
      this.sourceHidden.push(panelReply);
    }
  }

  protected place() {
    const {origin} = this;
    this.fieldCopy.style.transform = translate(this.fieldText.left - origin.x, this.fieldText.top - origin.y);
    if(this.panelReply) {
      this.panelReply.style.transform = translate(this.panelReplyFrom.left - origin.x, this.panelReplyFrom.top - origin.y);
    }

    // what of the field's layout the copy still misses: its letters are put on the field's. They are read once
    // the page has laid the copy out, before it is drawn, rather than laid out for it here, in the keypress
    const copy = this.fieldCopy.firstElementChild as HTMLElement;
    const glyphs = this.fieldGlyphs;
    const observer = new ResizeObserver(() => {
      observer.disconnect();
      const copied = !this.done && !this.launched && glyphs && getGlyphs(copy);
      if(copied) {
        copy.style.left = `${glyphs.first.left - copied.first.left}px`;
        copy.style.top = `${parseFloat(copy.style.top) + glyphs.first.top - copied.first.top}px`;
      }
    });
    observer.observe(copy);
  }

  protected prepare(bubble: HTMLElement) {
    const content = bubble.querySelector<HTMLElement>('.bubble-content');
    const wrapper = bubble.querySelector<HTMLElement>('.bubble-content-wrapper') || content;
    if(!content) {
      return;
    }

    const contentStyle = getComputedStyle(content);
    if(!hasBackground(contentStyle.backgroundColor)) {
      return this.prepareEmoji(bubble, wrapper);
    }

    this.hidden.push(wrapper);
    const bubbleRect = bubble.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    this.target = content;
    this.fixedWidth = true;
    this.contentOffset = {x: contentRect.left - bubbleRect.left, y: contentRect.top - bubbleRect.top};

    // the bubble's text stands on the field's: by their first letters, or where the texts start
    const textRoot = bubble.querySelector('[data-message-text-source]') || bubble.querySelector('.message');
    const bubbleGlyphs = getGlyphs(textRoot, '.time, .reply, .webpage, .name');
    const fieldGlyphs = this.fieldGlyphs;
    if(bubbleGlyphs && fieldGlyphs) {
      this.contentFrom = {
        x: fieldGlyphs.first.left - (bubbleGlyphs.first.left - contentRect.left),
        y: fieldGlyphs.first.top - (bubbleGlyphs.first.top - contentRect.top)
      };

      // laid out alike and of one colour, the two texts are one on the other all the way: the field's flies,
      // as the bubble's would, and the bubble's is not drawn over it a second time. Not with a spoiler, which
      // the field shows and the bubble hides, nor from a field scrolled, which showed only a part of it
      this.keepFieldText = !this.fieldClipped &&
        textRoot.matches('[data-message-text-source]') &&
        !textRoot.querySelector('.spoiler-text') &&
        fieldGlyphs.text === bubbleGlyphs.text &&
        fieldGlyphs.color === bubbleGlyphs.color &&
        Math.abs((fieldGlyphs.last.left - fieldGlyphs.first.left) - (bubbleGlyphs.last.left - bubbleGlyphs.first.left)) < 1 &&
        Math.abs((fieldGlyphs.last.top - fieldGlyphs.first.top) - (bubbleGlyphs.last.top - bubbleGlyphs.first.top)) < 1;
    } else {
      const textRect = (textRoot || content).getBoundingClientRect();
      this.contentFrom = {
        x: this.fieldText.left - (textRect.left - contentRect.left),
        y: this.fieldText.top - (textRect.top - contentRect.top)
      };
    }

    const radii = getRadii(contentStyle, contentRect);
    this.background = {color: contentStyle.backgroundColor, shadow: toDropShadow(contentStyle.boxShadow), radii};
    this.prepareTail(content, contentRect);

    // the bubble as it is, without its background: the one under it is it
    const bubbleCopy = this.bubbleCopy = copyElement(bubble);
    bubbleCopy.classList.add(styles.bubble);
    bubbleCopy.style.width = `${bubbleRect.width}px`;
    const container = this.flights.host.container();
    keepContext(bubble, bubbleCopy, container);
    bubbleCopy.querySelector('.bubble-content').classList.add(styles.bubbleContent);
    if(this.keepFieldText) {
      bubbleCopy.querySelector<HTMLElement>('[data-message-text-source]').style.visibility = 'hidden';
    } else if(textRoot && this.fieldEmoji.length && bubble.querySelector('custom-emoji-renderer-element > canvas[data-offscreen]')) {
      // its custom emoji, drawn by a worker and not copied with it, are the field's, one by one
      const pictures = new Map<string, HTMLCanvasElement[]>();
      this.fieldEmoji.forEach(({docId, picture}) => {
        let queue = pictures.get(docId);
        if(!queue) pictures.set(docId, queue = []);
        queue.push(picture);
      });
      const bubbleFrom = {x: bubbleRect.left, y: bubbleRect.top};
      textRoot.querySelectorAll<HTMLElement>('custom-emoji-element').forEach((element) => {
        const picture = pictures.get(element.dataset.docId)?.shift();
        if(picture) {
          putEmoji(bubbleCopy, picture, toBox(element.getBoundingClientRect()), bubbleFrom);
        }
      });
    }

    // the time and the ticks go with the background's corner on their side, not with the text, as on iOS
    const time = content.querySelector<HTMLElement>('.time-inner');
    if(isVisible(time)) {
      const timeRect = time.getBoundingClientRect();
      this.status = bubbleCopy.querySelector<HTMLElement>('.time-inner');
      this.statusAtEnd = timeRect.left + timeRect.width / 2 > contentRect.left + contentRect.width / 2;
      this.messageStatus = time;
    }

    const reply = this.panelReply && content.querySelector('.reply');
    if(isVisible(reply)) {
      const replyRect = reply.getBoundingClientRect();
      this.bubbleReply = bubbleCopy.querySelector<HTMLElement>('.reply');
      this.bubbleReplyOffset = {x: replyRect.left - contentRect.left, y: replyRect.top - contentRect.top};
      this.bubbleTitleOffset = getTitleOffset(reply);
    }

    const {width, height} = container.getBoundingClientRect();
    this.clipSize = {x: width, y: height};
    return contentRect;
  }

  // the tail goes with the background's corner, reflected as it is
  private prepareTail(content: HTMLElement, contentRect: DOMRect) {
    const tail = content.querySelector<SVGElement>('.bubble-tail');
    if(!isVisible(tail)) {
      return;
    }

    const tailRect = tail.getBoundingClientRect();
    const tailStyle = getComputedStyle(tail);
    const end = tailRect.left + tailRect.width / 2 > contentRect.left + contentRect.width / 2;
    this.tailOffset = {
      end,
      x: tailRect.left - (end ? contentRect.right : contentRect.left),
      y: tailRect.top - contentRect.bottom
    };

    const matrix = new DOMMatrix(tailStyle.transform === 'none' ? undefined : tailStyle.transform);
    matrix.e = matrix.f = 0;
    const tailCopy = tail.cloneNode(true) as SVGElement;
    tailCopy.removeAttribute('class');
    tailCopy.style.cssText = `display: block; width: 100%; height: 100%; fill: ${tailStyle.fill}; transform: ${matrix}`;
    const wrapper = this.tail = createPart(styles.tail);
    wrapper.style.width = `${tailRect.width}px`;
    wrapper.style.height = `${tailRect.height}px`;
    wrapper.append(tailCopy);
  }

  // the big emoji (or the dice) grow out of the field's: their line there into their line in the message, the
  // media around it alike; the message's time comes late, where it stands, as on iOS
  private prepareEmoji(bubble: HTMLElement, wrapper: HTMLElement) {
    const media = bubble.querySelector<HTMLElement>('.attachment');
    // the field's line of them: its letters, and its custom emoji, which are no letters there
    const glyphs = this.fieldGlyphs;
    const boxes: Box[] = [...(glyphs ? [glyphs.first, glyphs.last] : []), ...this.fieldEmoji.map(({box}) => box)];
    if(!media || !boxes.length) {
      return;
    }

    // the message's own emoji fly, held still on the way, on their own frame: a custom emoji's player is shared by
    // every one of its kind and size on the screen, so it is not set to the field's
    this.flyOwn(media, bubble, wrapper !== media ? [wrapper] : []);
    this.heightAcross = true;
    const rect = toBox(media.getBoundingClientRect());
    const from = boxAround(boxes);
    // their line in the message, without the room the media has around it; a single emoji drawn as a sticker is its
    // media
    const emoji = Array.from(media.querySelectorAll('.emoji, custom-emoji-element'), (element) => element.getBoundingClientRect());
    const to = emoji.length ? boxAround(emoji) : rect;
    const scale = boxHeight(from) / (boxHeight(to) || 1);
    const x = centerX(from) - centerX(to) * scale, y = centerY(from) - centerY(to) * scale;
    this.emojiFrom = {left: x + rect.left * scale, top: y + rect.top * scale, right: x + rect.right * scale, bottom: y + rect.bottom * scale};
    this.emoji = createPictureBox([]);
    this.target = media;
    return media.getBoundingClientRect();
  }

  protected build() {
    const {origin} = this;
    this.fieldCopy.style.transform = '';
    if(this.emoji) {
      const wrapper = createPart(styles.part);
      wrapper.append(this.emoji);
      layOut(this.emoji, fromOrigin(snapBox(this.base), origin));

      // the field's text grows with them, from their middle: it goes up in a wrapper, across and bigger in itself
      const fieldWrapper = createPart(styles.part);
      fieldWrapper.append(this.fieldCopy);
      this.fieldCopy.style.left = `${this.fieldText.left - origin.x}px`;
      this.fieldCopy.style.top = `${this.fieldText.top - origin.y}px`;
      const middle = {x: centerX(this.emojiFrom) - this.fieldText.left, y: centerY(this.emojiFrom) - this.fieldText.top};
      this.fieldCopy.style.transformOrigin = `${middle.x}px ${middle.y}px`;
      this.root.append(wrapper, fieldWrapper);
      this.takeOwn(this.emoji);
      this.parts = {emoji: this.emoji};
      return;
    }

    const field = createAxes(this.fieldCopy);

    const background = createPart(styles.part);
    const shape = createPart(styles.part);
    shape.style.color = this.background.color;
    shape.style.filter = this.background.shadow;
    const bands = Array.from({length: 4}, () => {
      const band = createPart(styles.piece);
      band.style.width = band.style.height = `${PIECE_SIZE}px`;
      return createAxes(band);
    });
    // every corner, a square one too (of no size): it may round on the way
    const corners = CORNERS.map(({radius, corner}) => {
      const element = createPart(styles.piece);
      element.style.width = element.style.height = `${this.background.radii[radius]}px`;
      element.style[`border${corner}Radius`] = '100%';
      return createAxes(element);
    });
    shape.append(...[...bands, ...corners].map(({across}) => across));
    const tail = this.tail && createAxes(this.tail);
    // over the background and its shadow, as the bubble's is: drawn in it, after its background
    background.append(...[shape, tail?.across].filter(Boolean));

    const [clipStart, clipEnd] = [0, 1].map(() => {
      const clip = createPart(styles.clip);
      clip.style.width = `${this.clipSize.x}px`;
      clip.style.height = `${this.clipSize.y}px`;
      return createAxes(clip);
    });
    const bubble = createAxes(this.bubbleCopy);
    let panelReply: Axes;
    if(this.panelReply) {
      this.panelReply.style.transform = '';
      panelReply = createAxes(this.panelReply);
    }

    clipEnd.part.append(...[bubble.across, field.across, panelReply?.across].filter(Boolean));
    clipStart.part.append(clipEnd.across);
    this.root.append(background, clipStart.across);
    this.parts = {background, bands, corners, tail, clipStart, clipEnd, bubble, field, panelReply};
    this.followStatus();
    this.followShape();
  }

  /**
   * The bubble joins a group on the way (a message sent right after it) or leaves one: its corners and its tail
   * change at once, and the copy's with them, so that it lands on the bubble as it is then
   */
  private followShape() {
    const bubble = this.bubble;
    const isGrouping = (classes: string) => ['is-group-first', 'is-group-last'].map((name) => classes.split(' ').includes(name)).join();
    this.shapeObserver = new MutationObserver((mutations) => {
      if(this.done || !mutations.some(({oldValue}) => isGrouping(oldValue || '') !== isGrouping(bubble.className))) {
        return;
      }

      const content = this.target;
      const radii = this.background.radii = getRadii(getComputedStyle(content), content.getBoundingClientRect());
      this.parts.corners.forEach(({part}, index) => {
        part.style.width = part.style.height = `${radii[CORNERS[index].radius]}px`;
      });
      this.parts.tail?.across.classList.toggle(styles.hidden, !isVisible(content.querySelector('.bubble-tail')));
      this.animate();
    });
    this.shapeObserver.observe(bubble, {attributes: true, attributeFilter: ['class'], attributeOldValue: true});
  }

  // the message's ticks change as it is sent and read, a change that plays: the copy's play it with them,
  // rather than change at once when the copy goes
  private followStatus() {
    const icon = this.status?.querySelector<HTMLElement>(':scope > .time-sending-status');
    if(!icon) {
      return;
    }

    // copied maybe while a change of it played: it stands in its state, and follows the message's from there
    settleSendingStatusIconCopy(icon);
    this.statusObserver = new MutationObserver(() => {
      const messageIcon = this.messageStatus.querySelector<HTMLElement>(':scope > .time-sending-status');
      const state = messageIcon && getSendingStatusIconState(messageIcon);
      if(state) {
        setSendingStatusIconState(icon, state);
      }
    });
    this.statusObserver.observe(this.messageStatus, {subtree: true, childList: true, attributes: true, attributeFilter: ['class']});
  }

  protected restore() {
    this.statusObserver?.disconnect();
    this.shapeObserver?.disconnect();
  }

  // where everything is at the way's start or end, from the overlay's corner
  private getPlaces(atEnd: boolean) {
    const {origin} = this;
    const progress = +atEnd;
    // the background and the tail on whole pixels, as the bubble's are drawn
    const page = snapBox(lerpBox(this.getSource(this.field), this.end, progress));
    const box = fromOrigin(page, origin);
    // the content box: from where its text stands on the field's to its place in the bubble
    const content = {
      x: lerp(this.contentFrom.x + this.shift.left, this.end.left, progress) - origin.x,
      y: lerp(this.contentFrom.y + this.shift.top, this.end.top, progress) - origin.y
    };
    // what the clip's second box holds is placed from its corner, which is the background's bottom right one
    const clip = {x: box.right - this.clipSize.x, y: box.bottom - this.clipSize.y};
    const tail = this.tailOffset && {
      x: snap((this.tailOffset.end ? page.right : page.left) + this.tailOffset.x) - origin.x,
      y: snap(page.bottom + this.tailOffset.y) - origin.y
    };
    // the reply's quote, by its title: from the panel's to the bubble's; with none in the bubble, where it was
    const replyFrom = this.panelReplyFrom;
    const titleFrom = replyFrom && {x: replyFrom.left + this.panelTitleOffset.x, y: replyFrom.top + this.panelTitleOffset.y};
    const titleTo = this.bubbleReplyOffset ? {
      x: this.end.left + this.bubbleReplyOffset.x + this.bubbleTitleOffset.x,
      y: this.end.top + this.bubbleReplyOffset.y + this.bubbleTitleOffset.y
    } : titleFrom;
    const title = titleFrom && {
      x: lerp(titleFrom.x + this.shift.left, titleTo.x, progress) - origin.x,
      y: lerp(titleFrom.y + this.shift.top, titleTo.y, progress) - origin.y
    };

    return {
      box,
      shape: getShape(box, this.background.radii),
      tail,
      clipStart: {x: box.left, y: box.top},
      clipEnd: {x: clip.x - box.left, y: clip.y - box.top},
      bubble: {x: content.x - this.contentOffset.x - clip.x, y: content.y - this.contentOffset.y - clip.y},
      // the field's text goes with the bubble's
      field: {
        x: this.fieldText.left - this.contentFrom.x + content.x - clip.x,
        y: this.fieldText.top - this.contentFrom.y + content.y - clip.y
      },
      // the time stands at the corner of its side as it stands in the bubble: how far from there the copy has it
      status: {x: (this.statusAtEnd ? box.right : box.left) - content.x, y: box.bottom - content.y},
      panelReply: title && {x: title.x - this.panelTitleOffset.x - clip.x, y: title.y - this.panelTitleOffset.y - clip.y},
      // how far from where the bubble's copy has its quote: none at the end
      bubbleReply: title && this.bubbleReplyOffset && {
        x: title.x - this.bubbleTitleOffset.x - (content.x + this.bubbleReplyOffset.x),
        y: title.y - this.bubbleTitleOffset.y - (content.y + this.bubbleReplyOffset.y)
      }
    };
  }

  protected getTracks() {
    return this.emoji ? this.getEmojiTracks() : this.getBubbleTracks();
  }

  private getBubbleTracks() {
    const {parts} = this;
    const from = this.getPlaces(false), to = this.getPlaces(true);
    const backgroundIn: [number, number][] = [[0, 0], [1, BACKGROUND_IN], [1, DURATION]];
    const tracks = [
      fade(parts.background, ...backgroundIn),
      ...parts.bands.flatMap((band, index) => stretch(band, PIECE_BOX, from.shape.bands[index], to.shape.bands[index])),
      ...parts.corners.flatMap((corner, index) => move(corner, from.shape.corners[index], to.shape.corners[index])),
      ...(parts.tail ? move(parts.tail, from.tail, to.tail) : []),
      ...move(parts.clipStart, from.clipStart, to.clipStart),
      ...move(parts.clipEnd, from.clipEnd, to.clipEnd),
      ...move(parts.bubble, from.bubble, to.bubble),
      ...move(parts.field, from.field, to.field)
    ];

    // the field's text goes as the bubble's comes; or, laid out alike, the field's flies all the way, and the
    // rest of the bubble comes with the background
    if(this.keepFieldText) {
      tracks.push(fade(this.bubbleCopy, ...backgroundIn));
    } else {
      tracks.push(
        fade(this.bubbleCopy, [0, 0], [1, TEXT_IN], [1, DURATION]),
        fade(this.fieldCopy, [1, 0], [0, TEXT_OUT], [0, DURATION])
      );
    }

    if(this.status) {
      const offset = (places: typeof from) => ({x: places.status.x - to.status.x, y: places.status.y - to.status.y});
      tracks.push(
        ...shift(this.status, offset(from), offset(to)),
        fade(this.status, [0, 0], [1, STATUS_IN], [1, DURATION])
      );
    }

    if(parts.panelReply) {
      tracks.push(
        ...move(parts.panelReply, from.panelReply, to.panelReply),
        fade(this.panelReply, [1, 0], [0, REPLY_OUT], [0, DURATION])
      );
    }

    if(from.bubbleReply) {
      tracks.push(
        ...shift(this.bubbleReply, from.bubbleReply, to.bubbleReply),
        fade(this.bubbleReply, [0, 0], [1, REPLY_IN], [1, DURATION])
      );
    }

    return tracks;
  }

  private getEmojiTracks() {
    const emoji = this.parts.emoji;
    const from = this.getSource(this.emojiFrom), to = this.end;
    // the field's text, as big as the emoji are against what they grew from, its middle on theirs
    const fieldAcross = (box: Box) => {
      return `translateX(${centerX(box) - centerX(this.emojiFrom)}px) scale(${boxWidth(box) / boxWidth(this.emojiFrom)})`;
    };
    const fieldUp = (box: Box) => `translateY(${centerY(box) - centerY(this.emojiFrom)}px)`;
    return [
      ...grow(emoji.parentElement, emoji, this.base, from, to),
      fade(emoji, [0, 0], [1, BACKGROUND_IN], [1, DURATION]),
      across(this.fieldCopy, fieldAcross(from), fieldAcross(to)),
      up(this.fieldCopy.parentElement, fieldUp(from), fieldUp(to)),
      fade(this.fieldCopy, [1, 0], [0, EMOJI_TEXT_OUT], [0, DURATION]),
      ...(this.panelReply ? [fade(this.panelReply, [1, 0], [0, REPLY_OUT], [0, DURATION])] : [])
    ];
  }
}

/**
 * A picture going from where it was to the message's: a sticker or a GIF from its cell, a round video from
 * its preview, the send button into the voice message's play button. A sticker or a GIF flies itself, as on
 * iOS: the message's own, held on the moment its cell showed, which the cell's picture gives way to as soon as
 * it shows it too, so that nothing of it is drawn anew on the way or when it is there. Anything else is a copy
 * that fades from over the message's own media at the end.
 */
class BoxFlight extends SendFlight {
  private box: HTMLElement;
  private layers: Layer[];
  private radii: string[];

  constructor(flights: SendFlights, private options: {
    matches: SendFlight['matches'],
    /** where the picture is drawn */
    from: Box,
    layers: Layer[],
    round?: boolean,
    findTarget: (bubble: HTMLElement) => FlightTarget,
    /** where its picture was as it was chosen: the message's own flies from there */
    moment?: Moment,
    /** what of the source is not seen while its copy stands in for it */
    sourceHidden?: HTMLElement[]
  }) {
    super(flights, options.matches);
    this.sourceHidden.push(...(options.sourceHidden || []));
    this.landFade = LAND_FADE;
    this.heightAcross = true;
    this.startFrame = options.moment?.frame;
    this.layers = [...options.layers];
    this.box = createPictureBox(this.layers.map((layer) => layer.element), options.round);
    this.root.append(this.box);
  }

  protected place() {
    layOut(this.box, fromOrigin(this.options.from, this.origin));
  }

  protected prepare(bubble: HTMLElement) {
    const found = this.options.findTarget(bubble);
    if(!isVisible(found?.target)) {
      return;
    }

    this.target = found.target;
    if(this.options.moment) {
      this.flyOwn(found.target, bubble, found.lateIn);
    } else {
      this.hidden.push(...found.hidden);
      this.lateIn.push(...(found.lateIn || []));
    }

    found.layers?.forEach((layer) => this.layers.push(layer));
    // it flies in with the corners it lands with
    if(!this.options.round) {
      const style = getComputedStyle(found.target);
      this.radii = [style.borderStartStartRadius, style.borderStartEndRadius, style.borderEndStartRadius, style.borderEndEndRadius];
    }

    return found.target.getBoundingClientRect();
  }

  protected build() {
    const {box} = this;
    for(const layer of this.layers) {
      if(!layer.element.parentElement) {
        layer.element.classList.add(styles.fill);
        box.append(layer.element);
      }
    }

    if(this.radii) {
      [box.style.borderStartStartRadius, box.style.borderStartEndRadius, box.style.borderEndStartRadius, box.style.borderEndEndRadius] = this.radii;
    }

    // laid out as the message's media, and stretched to wherever it is on the way
    const wrapper = createPart(styles.part);
    wrapper.append(box);
    layOut(box, fromOrigin(snapBox(this.base), this.origin));
    this.root.append(wrapper);

    // the cell's picture gives way to the message's own once that shows its moment, and it lands after that
    const own = this.takeOwn(box);
    if(own) {
      this.landingReady = false;
      showMoment(own, this.options.moment).then(() => Promise.all(this.options.layers.map(({element}) => {
        return element.animate([{opacity: 1}, {opacity: 0}], {duration: SNAPSHOT_OUT, fill: 'forwards'}).finished;
      }))).catch(noop).finally(() => {
        this.landingReady = true;
      });
    }
  }

  protected getTracks() {
    return [
      ...grow(this.box.parentElement, this.box, this.base, this.getSource(this.options.from), this.end),
      ...this.layers.filter((layer) => layer.opacity).map(({element, opacity}): Track => ({
        element,
        keyframes: [{opacity: opacity(0)}, {opacity: opacity(1)}],
        easing: EASING_Y
      }))
    ];
  }

  // the picture of its source, which gave way to the message's own on the way: they show the same moment
  protected cover() {
    for(const {element} of this.options.layers) {
      element.getAnimations().forEach((animation) => animation.cancel());
    }
  }
}

// the media the copy flies into is not seen; the rest of the message (its time, a reply) comes late, as on iOS
const findMediaTarget = (selector: string) => (bubble: HTMLElement): FlightTarget => {
  const target = bubble.querySelector<HTMLElement>(selector);
  const wrapper = bubble.querySelector<HTMLElement>('.bubble-content-wrapper');
  return target && {
    target,
    hidden: [target],
    lateIn: wrapper && wrapper !== target ? [wrapper] : []
  };
};

export default class SendFlights {
  public origin: Point = {x: 0, y: 0};
  private overlay: HTMLElement;
  // let go and not claimed yet, the oldest first
  private holding: SendFlight[] = [];
  // copies on screen: held, flying or fading
  private shown: Set<SendFlight> = new Set();

  constructor(public host: SendFlightsHost) {}

  public canCapture() {
    const container = this.host.container();
    return liteMode.isAvailable('motion') &&
      !!container?.isConnected &&
      container.ownerDocument.visibilityState === 'visible' &&
      this.host.canFly();
  }

  /** the composer's text as it is about to be cleared, when it goes as one message */
  public captureText(options: {field: HTMLElement, input: HTMLElement, reply?: HTMLElement}) {
    this.capture(() => isVisible(options.input) && new TextFlight(this, options));
  }

  /** a sticker or a GIF from where it was chosen: the message's own flies, from the moment it showed there */
  public captureDocument({target, document}: {target: HTMLElement, document: MyDocument}) {
    this.capture(() => {
      const snapshot = isVisible(target) && snapshotMedia(target);
      return snapshot && this.isOverChat(snapshot.rect) && new BoxFlight(this, {
        matches: (message) => getMessageDocument(message)?.id === document.id,
        from: snapshot.picture,
        layers: [{element: snapshot.canvas}],
        findTarget: findMediaTarget('.attachment'),
        moment: snapshot.moment
      });
    });
  }

  /** the round video's preview, as its recording stops to be sent */
  public captureRound({circle, video}: {circle: HTMLElement, video: HTMLVideoElement}) {
    this.capture(() => {
      const snapshot = isVisible(circle) && snapshotMedia(video);
      if(!snapshot) {
        return;
      }

      snapshot.canvas.style.objectFit = 'cover';
      return new BoxFlight(this, {
        matches: (message) => isRoundDocument(getMessageDocument(message)),
        from: toBox(circle.getBoundingClientRect()),
        layers: [{element: snapshot.canvas}],
        round: true,
        findTarget: findMediaTarget('.media-round'),
        // the preview fades where it was as the panel closes, while its copy flies
        sourceHidden: [circle]
      });
    });
  }

  /** the send button, as a voice message is sent from it: its circle becomes the play button */
  public captureVoice({button}: {button: HTMLElement}) {
    this.capture(() => isVisible(button) && new BoxFlight(this, {
      matches: (message) => isVoiceDocument(getMessageDocument(message)),
      from: toBox(button.getBoundingClientRect()),
      layers: [{element: copyControl(button), opacity: (pY) => 1 - pY}],
      round: true,
      findTarget: (bubble) => {
        const target = bubble.querySelector<HTMLElement>('.audio-toggle');
        return target && {
          target,
          hidden: [target],
          layers: [{element: copyControl(target), opacity: (pY) => pY}]
        };
      }
    }));
  }

  // a copy that cannot be made is no reason for its message not to go: a capture never throws
  private capture(build: () => SendFlight | false | void) {
    if(!this.canCapture()) {
      return;
    }

    let flight: SendFlight;
    try {
      flight = build() || undefined;
      flight?.hold();
    } catch(err) {
      console.error('send flight', err);
      flight?.abort();
    }
  }

  /** a message of this chat has just been sent from here: the oldest copy it matches is its own */
  public claim(message: Message) {
    if(message?._ !== 'message' || !message.pFlags.is_outgoing || !this.holding.length) {
      return;
    }

    const index = this.holding.findIndex((flight) => flight.matches(message));
    const flight = index === -1 ? undefined : this.holding.splice(index, 1)[0];
    if(flight) {
      flight.message = message;
      flight.claimedMid = message.mid;
    }

    return flight;
  }

  // the flight is its message's: by the id the server gave it, or by the one it was claimed under, which what was
  // being drawn of it then still goes by
  private isOf(flight: SendFlight, mid: number, peerId?: PeerId) {
    return !!flight.message &&
      (flight.message.mid === mid || flight.claimedMid === mid) &&
      (peerId === undefined || flight.message.peerId === peerId);
  }

  /**
   * A message sent has been given its id by the server, maybe before its bubble is drawn: the flight it claimed
   * goes by that message from now on
   */
  public rekey(tempMessage: {mid?: number, peerId?: PeerId}, message: Message) {
    if(message?._ !== 'message') {
      return;
    }

    for(const flight of this.shown) {
      if(this.isOf(flight, tempMessage.mid, tempMessage.peerId)) {
        flight.message = message;
      }
    }
  }

  /** the flight of a message being drawn: claimed by it, and not gone to it yet */
  public getFlight(message: {mid?: number, peerId?: PeerId}) {
    for(const flight of this.shown) {
      if(this.isOf(flight, message.mid, message.peerId) && !flight.launched) {
        return flight;
      }
    }
  }

  /**
   * When what flies into this bubble is over (landed, or let go), or nothing when nothing does: till then what is
   * in the bubble may be away in the flight, or stood in for
   */
  public whenLanded(bubble: HTMLElement) {
    const mid = +bubble.dataset.mid;
    for(const flight of this.shown) {
      if(!flight.done && (flight.bubble ? flight.bubble === bubble : this.isOf(flight, mid))) {
        return flight.landed;
      }
    }
  }

  /** A new bubble can move older ones without resizing any observed box (a short, bottom-aligned list). */
  public followOthers(launched: SendFlight) {
    const updates = Array.from(this.shown)
    .filter((flight) => flight !== launched && flight.launched && !flight.done)
    .map((flight) => flight.measureFollow(true));
    updates.forEach((update) => update?.());
  }

  /** every copy goes at once: the chat it is drawn over changes, or moves to another window */
  public abortAll() {
    for(const flight of [...this.shown]) {
      flight.cancel();
    }
  }

  public mount(flight: SendFlight) {
    this.holding.push(flight);
    this.shown.add(flight);
    // read before the copy is put in, while nothing is to be laid out
    const overlay = this.getOverlay();
    this.updateOrigin();
    overlay.append(flight.root);
  }

  public forget(flight: SendFlight) {
    const index = this.holding.indexOf(flight);
    if(index !== -1) {
      this.holding.splice(index, 1);
    }

    if(!flight.root.isConnected) {
      this.shown.delete(flight);
    }
  }

  /** where the copies are placed from: the overlay's corner */
  public updateOrigin() {
    this.origin = this.readOrigin();
  }

  /** where the overlay's corner is now: it moves with the chat (a resize, a sidebar) */
  public readOrigin(): Point {
    const rect = this.overlay.getBoundingClientRect();
    return {x: rect.left, y: rect.top};
  }

  private isOverChat(rect: Box) {
    const container = this.host.container().getBoundingClientRect();
    const x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
    return x >= container.left && x <= container.right && y >= container.top && y <= container.bottom;
  }

  // put in the chat once and kept there, empty when nothing flies: putting it in lays the whole chat out again
  private getOverlay() {
    let {overlay} = this;
    if(!overlay) {
      overlay = this.overlay = createPart(styles.overlay);
      overlay.setAttribute('aria-hidden', 'true');
      overlay.inert = true;
    }

    const container = this.host.container();
    if(overlay.parentElement !== container) {
      container.append(overlay);
    }

    return overlay;
  }
}
