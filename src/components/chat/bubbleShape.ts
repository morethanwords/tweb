/*
 * A bubble's background that changes its size on the compositor, and the ways its parts go there: what the
 * animation of a sent message (`sendFlights`) and of a message changed in place (`bubbleTransitions`) are
 * made of.
 *
 * The background is made of bands and corners that only move and stretch, so that its corners stay round; its
 * tail is a copy that goes with its corner. Every part moves across in a wrapper and up in itself, each on its
 * own curve, from where it starts to where it ends: two keyframes, handed to the compositor.
 */

import {getAppWindow} from '@helpers/appWindow';
import styles from '@components/chat/bubbleShape.module.scss';

export type Box = {left: number, top: number, right: number, bottom: number};
export type Point = {x: number, y: number};
export type Radii = {topLeft: number, topRight: number, bottomRight: number, bottomLeft: number};
/** an animation of a part: its keyframes over the whole way, and the curve between them */
/** a way of an element; `add`: on top of a way it is already going (the list keeping up with a growing message) */
export type Track = {element: HTMLElement, keyframes: Keyframe[], easing: string, composite?: CompositeOperation};
/** a part that moves across in a wrapper, and up in itself */
export type Axes = {across: HTMLElement, part: HTMLElement};
/** how a way goes: its curve across and its curve up, and how long it lasts */
export type Curves = {x: string, y: string, duration: number};
/** how a bubble's background is drawn */
export type BubbleBackground = {color: string, shadow: string, radii: Radii};
/** where a bubble's tail stands, from the bottom corner of its side */
export type TailOffset = {end: boolean, x: number, y: number};
/** the pieces a bubble's background is drawn with */
export type ShapeParts = {background: HTMLElement, bands: Axes[], corners: Axes[], tail?: Axes};
/** where the pieces of a background are, from what holds them */
export type ShapePlaces = {shape: {bands: Box[], corners: Point[]}, tail?: Point};

// the curves a bubble's parts go on: across fast and up slower, iOS's (and up is Android's change of a list item),
// which bends a way that goes both
export const CURVE_X = [.23, 1, .32, 1] as const;
export const CURVE_Y = [.1992, .0106, .2792, .9103] as const;
export const EASING_X = `cubic-bezier(${CURVE_X.join(', ')})`;
export const EASING_Y = `cubic-bezier(${CURVE_Y.join(', ')})`;

export const toBox = (rect: DOMRect | Box): Box => ({left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom});
export const boxWidth = (box: Box) => box.right - box.left;
export const boxHeight = (box: Box) => box.bottom - box.top;
export const centerX = (box: Box) => (box.left + box.right) / 2;
export const centerY = (box: Box) => (box.top + box.bottom) / 2;

// a box, empty rather than turned inside out
export const makeBox = (left: number, top: number, right: number, bottom: number): Box => ({
  left,
  top,
  right: Math.max(left, right),
  bottom: Math.max(top, bottom)
});

export const moveBox = (box: Box, by: Box): Box => ({
  left: box.left + by.left,
  top: box.top + by.top,
  right: box.right + by.right,
  bottom: box.bottom + by.bottom
});

// a box from a corner
export const fromOrigin = (box: Box, {x, y}: Point) => makeBox(box.left - x, box.top - y, box.right - x, box.bottom - y);

// where the page draws a box, a picture, a background: on whole device pixels (of the window the chat is in). A
// copy lands where its original is drawn, not a fraction of a pixel off it
export const snap = (value: number) => {
  const {devicePixelRatio} = getAppWindow();
  return Math.round(value * devicePixelRatio) / devicePixelRatio;
};
export const snapBox = (box: Box): Box => ({left: snap(box.left), top: snap(box.top), right: snap(box.right), bottom: snap(box.bottom)});

export function isVisible(element: Element) {
  return !!element?.isConnected && element.getClientRects().length > 0;
}

export function createPart(className: string = styles.part) {
  const element = document.createElement('div');
  element.classList.add(className);
  return element;
}

export function createAxes(part: HTMLElement): Axes {
  const wrapper = createPart(styles.part);
  wrapper.append(part);
  return {across: wrapper, part};
}

export function layOut(element: HTMLElement, box: Box) {
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${boxWidth(box)}px`;
  element.style.height = `${boxHeight(box)}px`;
}

/**
 * The ways of parts on one pair of curves: across on its curve, in a part's wrapper, and up on its own, in the part
 * itself. Parts in parts, each on these curves, add up their ways exactly.
 */
export function createTracks({x, y, duration}: Curves) {
  const across = (element: HTMLElement, from: string, to: string): Track => {
    return {element, keyframes: [{transform: from}, {transform: to}], easing: x};
  };

  const up = (element: HTMLElement, from: string, to: string): Track => {
    return {element, keyframes: [{transform: from}, {transform: to}], easing: y};
  };

  return {
    across,
    up,
    // an element that cannot be wrapped without changing how it is laid out, going from one offset to another:
    // across by its own `translate`, up by its `transform`, each on its curve
    shift: (element: HTMLElement, from: Point, to: Point): Track[] => [
      {element, keyframes: [{translate: `${from.x}px 0px`}, {translate: `${to.x}px 0px`}], easing: x},
      up(element, `translateY(${from.y}px)`, `translateY(${to.y}px)`)
    ],
    // a part going from one point to another, across and up
    move: ({across: wrapper, part}: Axes, from: Point, to: Point): Track[] => [
      across(wrapper, `translateX(${from.x}px)`, `translateX(${to.x}px)`),
      up(part, `translateY(${from.y}px)`, `translateY(${to.y}px)`)
    ],
    // a part laid out as `base` (from the corner of what it is in) going from one box to another: moved and
    // stretched from its top left corner
    stretch: ({across: wrapper, part}: Axes, base: Box, from: Box, to: Box): Track[] => {
      const alongX = (box: Box) => `translateX(${box.left - base.left}px) scaleX(${boxWidth(box) / boxWidth(base)})`;
      const alongY = (box: Box) => `translateY(${box.top - base.top}px) scaleY(${boxHeight(box) / boxHeight(base)})`;
      return [across(wrapper, alongX(from), alongX(to)), up(part, alongY(from), alongY(to))];
    },
    // something coming or going where it stands: from one size to another about its middle
    scale: (element: HTMLElement, from: number, to: number): Track => ({
      element,
      keyframes: [{scale: `${from}`}, {scale: `${to}`}],
      easing: x
    }),
    // a fade in time: its opacity at moments of the way, straight between them
    fade: (element: HTMLElement, ...stops: [opacity: number, at: number][]): Track => ({
      element,
      keyframes: stops.map(([opacity, at]) => ({opacity, offset: at / duration})),
      easing: 'linear'
    })
  };
}

export type Tracks = ReturnType<typeof createTracks>;

/**
 * Hands the ways to the compositor. They start with the next frame: that frame shows where they start, whenever
 * the page gets to draw it, and they are timed from then — a way waiting for the compositor to start it would
 * wait again each time it is planned anew.
 */
export function animateTracks(tracks: Track[], duration: number) {
  const animations = tracks.map(({element, keyframes, easing, composite}) => {
    return element.animate(keyframes, {duration, easing, fill: 'forwards', composite});
  });
  startOnNextFrame(animations);
  return animations;
}

export function startOnNextFrame(animations: Animation[]) {
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

/** an element's corners as they are drawn: CSS makes them all smaller together when two are more than a side */
export function getRadii(style: CSSStyleDeclaration, rect: DOMRect): Radii {
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
export function toDropShadow(boxShadow: string) {
  return boxShadow.split(/,(?![^(]*\))/).map((shadow) => {
    const color = shadow.match(/[a-z-]+\([^)]*\)|#[\da-f]+/i)?.[0];
    const lengths = color && shadow.replace(color, '').match(/-?[\d.]+px/g);
    return lengths?.length >= 2 && !shadow.includes('inset') ?
      `drop-shadow(${lengths[0]} ${lengths[1]} ${(parseFloat(lengths[2]) || 0) / 2}px ${color})` :
      '';
  }).join(' ');
}

/** how a bubble's content box draws its background */
export function getBubbleBackground(style: CSSStyleDeclaration, rect: DOMRect): BubbleBackground {
  return {color: style.backgroundColor, shadow: toDropShadow(style.boxShadow), radii: getRadii(style, rect)};
}

// the quarter of a circle in each corner, in the order `getShape` has them
export const CORNERS: {radius: keyof Radii, corner: 'TopLeft' | 'TopRight' | 'BottomRight' | 'BottomLeft'}[] = [
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
export function getShape(box: Box, radii: Radii): ShapePlaces['shape'] {
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

/**
 * The pieces of a bubble's background, in its colour and with its shadow, and its tail over them, as the
 * bubble's is: drawn in it, after its background
 */
export function createShapeParts(background: BubbleBackground, tail?: HTMLElement): ShapeParts {
  const root = createPart(styles.part);
  const shape = createPart(styles.part);
  shape.style.color = background.color;
  shape.style.filter = background.shadow;
  const bands = Array.from({length: 4}, () => {
    const band = createPart(styles.piece);
    band.style.width = band.style.height = `${PIECE_SIZE}px`;
    return createAxes(band);
  });
  // every corner, a square one too (of no size): it may round on the way
  const corners = CORNERS.map(() => createAxes(createPart(styles.piece)));
  setShapeRadii(corners, background.radii);
  shape.append(...[...bands, ...corners].map(({across}) => across));
  const tailAxes = tail && createAxes(tail);
  root.append(...[shape, tailAxes?.across].filter(Boolean));
  return {background: root, bands, corners, tail: tailAxes};
}

export function setShapeRadii(corners: Axes[], radii: Radii) {
  corners.forEach(({part}, index) => {
    const {radius, corner} = CORNERS[index];
    part.style.width = part.style.height = `${radii[radius]}px`;
    part.style[`border${corner}Radius`] = '100%';
  });
}

/**
 * Where the pieces of a background stand when it is this box on the page, from the corner of what holds them
 * (`origin`, on the page too). The tail on whole pixels, as the bubble's is drawn
 */
export function getShapePlaces(page: Box, origin: Point, radii: Radii, tailOffset?: TailOffset): ShapePlaces & {box: Box} {
  const box = fromOrigin(page, origin);
  return {
    box,
    shape: getShape(box, radii),
    tail: tailOffset && {
      x: snap((tailOffset.end ? page.right : page.left) + tailOffset.x) - origin.x,
      y: snap(page.bottom + tailOffset.y) - origin.y
    }
  };
}

/** the ways of a background's pieces from where they stand to where they go */
export function getShapeTracks(tracks: Tracks, parts: ShapeParts, from: ShapePlaces, to: ShapePlaces): Track[] {
  return [
    ...parts.bands.flatMap((band, index) => tracks.stretch(band, PIECE_BOX, from.shape.bands[index], to.shape.bands[index])),
    ...parts.corners.flatMap((corner, index) => tracks.move(corner, from.shape.corners[index], to.shape.corners[index])),
    ...(parts.tail && from.tail && to.tail ? tracks.move(parts.tail, from.tail, to.tail) : [])
  ];
}

function getTail(content: HTMLElement) {
  const tail = content.querySelector<SVGElement>('.bubble-tail');
  return isVisible(tail) ? tail : undefined;
}

function getOffset(tailRect: DOMRect, contentRect: DOMRect): TailOffset {
  const end = tailRect.left + tailRect.width / 2 > contentRect.left + contentRect.width / 2;
  return {
    end,
    x: tailRect.left - (end ? contentRect.right : contentRect.left),
    y: tailRect.top - contentRect.bottom
  };
}

/** where a bubble's tail stands, if it has one shown */
export function getTailOffset(content: HTMLElement, contentRect: DOMRect) {
  const tail = getTail(content);
  return tail && getOffset(tail.getBoundingClientRect(), contentRect);
}

// a bubble's tail goes with its background's corner, reflected as it is
export function copyTail(content: HTMLElement, contentRect: DOMRect): {offset: TailOffset, element: HTMLElement} {
  const tail = getTail(content);
  if(!tail) {
    return;
  }

  const tailRect = tail.getBoundingClientRect();
  const tailStyle = getComputedStyle(tail);
  const offset = getOffset(tailRect, contentRect);

  const matrix = new DOMMatrix(tailStyle.transform === 'none' ? undefined : tailStyle.transform);
  matrix.e = matrix.f = 0;
  const tailCopy = tail.cloneNode(true) as SVGElement;
  tailCopy.removeAttribute('class');
  tailCopy.style.cssText = `display: block; width: 100%; height: 100%; fill: ${tailStyle.fill}; transform: ${matrix}`;
  const element = createPart(styles.tail);
  element.style.width = `${tailRect.width}px`;
  element.style.height = `${tailRect.height}px`;
  element.append(tailCopy);
  return {offset, element};
}

export {styles as bubbleShapeStyles};
