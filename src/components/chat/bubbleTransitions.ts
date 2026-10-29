/*
 * A message changed where it stands — edited, reacted to, or rendered anew in its place — changes on the compositor,
 * as Telegram for Android and iOS change a message (ChatListItemAnimator's change of an item with ChatMessageCell's
 * TransitionParams and ReactionsLayoutInBubble's buttons; ChatMessageTextBubbleContentNode's crossfade):
 *
 * - its background goes from its old size to its new one, its corners staying round, its tail with its corner;
 * - what it shows goes with the side it stands by: its name, quote and text with the top of the line's start,
 *   its time with the bottom of the line's end, what stands beside it with its corner there; text that changed
 *   gives way to the new, the old fading as the new comes;
 * - what it shows anew comes where it stands (a quote, its reactions), and what it no longer shows goes from where
 *   it was, cut by the background as it shrinks; a reaction grows as it comes and shrinks as it goes, the way the
 *   others make room for it or take its place;
 * - "edited" comes where it stands in the time; a time that reads otherwise gives way to the new one;
 * - the messages it moves go there instead of jumping: taller, it pushes the ones above up, as the list keeps
 *   its end where it is.
 *
 * A message rendered anew (a reply it got or lost) is a new bubble: what it shows is matched with what the old one
 * showed by what it is (`getRole`) — its quote with its quote, its text with its text, a reaction with the same one.
 *
 * Measured once before the change and once after, both where the list already reads its layout around a batch
 * of changes (`ChatBubbles.flushBubbleModifications`, with its scroll saver, and the commit of the bubbles rendered
 * anew); everything is laid out at its end once, and only moved, stretched and faded from where it was, by the
 * compositor, on the curves the animation of a sent message goes on. Nothing of it stays: what a change needs is
 * made for it and gone when it ends, and a message that does not change costs nothing.
 *
 * Only with full animations ("motion"); at the reduced level what changed gives way, comes and goes where it stands,
 * and nothing moves; with none, the message just changes.
 */

import liteMode from '@helpers/liteMode';
import {markEmojiLayoutMoving} from '@lib/customEmoji/layoutWatch';
import getViewportSlice from '@helpers/dom/getViewportSlice';
import copyElement, {CopyPairs, keepStyle, paintPlayerFrame} from '@components/chat/copyElement';
import drawMediaToCanvas from '@helpers/canvas/drawMediaToCanvas';
import type CustomEmojiElement from '@lib/customEmoji/element';
import {settleSendingStatusIconCopy} from '@components/sendingStatusIcon';
import {getOutgoingMessageGradientColorAt, markOutgoingMessageGradientHeld, measureOutgoingMessageGradientHold, readOutgoingMessageGradient} from '@helpers/outgoingMessageGradient';
import type ReactionElement from '@components/chat/reaction';
import {
  animateTracks,
  Axes,
  BubbleBackground,
  bubbleShapeStyles,
  Box,
  boxHeight,
  boxWidth,
  centerX,
  centerY,
  copyTail,
  createAxes,
  createPart,
  createShapeParts,
  createTracks,
  EASING_X,
  EASING_Y,
  fromOrigin,
  getBubbleBackground,
  getRadii,
  getShapePlaces,
  getShapeTracks,
  getTailOffset,
  isVisible,
  Point,
  snapBox,
  startOnNextFrame,
  TailOffset,
  toBox,
  Track,
  Tracks
} from '@components/chat/bubbleShape';
import styles from '@components/chat/bubbleTransitions.module.scss';

// as long as Android changes a message (ChatListItemAnimator.DEFAULT_DURATION)
const DURATION = 250;
// the old text is gone within this much of the way, the new one shows within this much, as on iOS
const TEXT_OUT = 120;
const TEXT_IN = 150;
// a background that grows has the old text go with it till it is grown most of the way, and gives way to the new
// one then: laid out as big as it is at the end, the new text would stand out of the background as it grows
const GROWN_AT = 100;
const GROWN_SWAP = 100;
// at the reduced level only fades, quicker: they have no way for the eye to follow
const REDUCED_DURATION = 180;
// how small a reaction comes from and goes to (ReactionsLayoutInBubble's ANIMATION_TYPE_IN)
const REACTION_SCALE = .5;

const motionTracks = createTracks({x: EASING_X, y: EASING_Y, duration: DURATION});
const reducedTracks = createTracks({x: EASING_X, y: EASING_Y, duration: REDUCED_DURATION});

/** which corner of its box a part goes with */
type Anchor = {right: boolean, bottom: boolean};

/** what changes in a bubble: its text may (an edit), or only what is around it (its reactions, views, a pin) */
export type BubbleChange = 'edit' | 'meta';

type PartCapture = {
  element: HTMLElement,
  // what it is in its bubble: what stands for it in a bubble rendered anew
  role: string,
  anchor: Anchor,
  from: Point,
  // where it was, to show it there once it is gone
  box: Box,
  // the part it is in
  parent?: PartCapture,
  // a picture of it as it was, for a part that can be gone: a reaction, or any of a bubble to be rendered anew; what
  // in it stands for what (what is in it may stay: it goes by itself then)
  copy?: HTMLElement,
  copies?: CopyPairs,
  // how it looks (`getLook`): what stands for it in a bubble rendered anew may look otherwise
  look: string,
  // a reaction's count as it read and how many it was, a picture of it and where it stood from the reaction's start and
  // top
  counter?: {text: string, count: number, copy: HTMLElement, offset: Point},
  // not shown, though laid out (a control that shows on hover): nothing of it goes or gives way
  unseen: boolean
};

type OwnBackground = {element: HTMLElement, box: Box, anchor: Anchor};

type BubbleCapture = {
  bubble: HTMLElement,
  content: HTMLElement,
  // the bubble rendered in its place, which the change is shown in
  replacement?: HTMLElement,
  box: Box,
  // whether its background shows: a bubble of a big emoji has none
  filled: boolean,
  background?: BubbleBackground,
  tail?: {offset: TailOffset, element: HTMLElement},
  // a picture of the whole of a bubble to be rendered anew: for one of another kind, which gives way to it as a whole;
  // where its content stood (`.bubble-content-wrapper`), and what kind it is (`getKind`)
  ghost?: {copy: HTMLElement, box: Box, wrapper: Box, kind: string},
  parts: PartCapture[],
  // what has a background of its own in it: a reply's quote, a quote or code in the text, a reaction
  backgrounds: OwnBackground[],
  // its text, if it was to be read: a picture of the message with nothing but its text in it (not the file it is the
  // caption of), how wide it was laid out, what it read
  text?: {
    anchor: Anchor,
    signature: string,
    copy: HTMLElement,
    width: number
  },
  // whether it had a text at all
  hadText: boolean,
  time?: {
    from: Point,
    copy: HTMLElement,
    text: string,
    edited: boolean,
    // how it is drawn: in the line, or over a picture (a big emoji's)
    look: string
  }
};

const pointOf = (rect: DOMRect | Box, {right, bottom}: Anchor): Point => ({
  x: right ? rect.right : rect.left,
  y: bottom ? rect.bottom : rect.top
});

const isMoved = ({x, y}: Point) => Math.abs(x) >= .5 || Math.abs(y) >= .5;
const add = (a: Point, b: Point): Point => ({x: a.x + b.x, y: a.y + b.y});
const subtract = (a: Point, b: Point): Point => ({x: a.x - b.x, y: a.y - b.y});

const createLayer = () => {
  const layer = document.createElement('div');
  layer.classList.add(styles.layer);
  return layer;
};

// where a part stands at the end: across in its wrapper, up in itself
function place({across, part}: Axes, {x, y}: Point) {
  across.style.transform = `translateX(${x}px)`;
  part.style.transform = `translateY(${y}px)`;
}

/**
 * What cuts what is put in it by a background as that changes: two boxes as big as the list (or the background, if it
 * is bigger) that only move, one cutting what is before the background's top left corner, the other what is after its
 * bottom right one. `from` and `to` are the background's boxes, and the points `at` gives a place to are, from the
 * corner of what holds them
 */
function createClip(holder: HTMLElement, list: Point, from: Box, to: Box, tracks: Track[], ways?: Tracks) {
  const size: Point = {
    x: Math.ceil(Math.max(list.x, boxWidth(from), boxWidth(to))),
    y: Math.ceil(Math.max(list.y, boxHeight(from), boxHeight(to)))
  };
  const getCorners = (box: Box) => {
    const start = {x: box.left, y: box.top};
    return {start, end: subtract({x: box.right - size.x, y: box.bottom - size.y}, start)};
  };
  const corners = [getCorners(from), getCorners(to)];
  const [clipStart, clipEnd] = [0, 1].map(() => {
    const clip = createPart(bubbleShapeStyles.clip);
    clip.style.width = `${size.x}px`;
    clip.style.height = `${size.y}px`;
    return createAxes(clip);
  });
  clipStart.part.append(clipEnd.across);
  holder.append(clipStart.across);
  ([[clipStart, 'start'], [clipEnd, 'end']] as const).forEach(([axes, corner]) => {
    place(axes, corners[1][corner]);
    if(ways && isMoved(subtract(corners[0][corner], corners[1][corner]))) {
      tracks.push(...ways.move(axes, corners[0][corner], corners[1][corner]));
    }
  });

  return {
    // what is cut is put in here
    over: clipEnd.part,
    // where a point is in there: from the corner the second box cuts at, as it is at the start or at the end
    at: (point: Point, end: boolean) => {
      const {start, end: offset} = corners[+end];
      return subtract(point, add(start, offset));
    }
  };
}

// the content box of a bubble: what its background is drawn on
const getContent = (bubble: HTMLElement) => {
  return bubble.querySelector<HTMLElement>(':scope > .bubble-content-wrapper > .bubble-content');
};

/**
 * What a part goes with: what is laid out in the flow, with the top of its line's start; what is put at a side
 * of the bubble (its buttons, a badge), with the corner it is put at
 */
function getAnchor(element: HTMLElement, contentRect: DOMRect): Anchor {
  const style = getComputedStyle(element);
  if(style.position !== 'absolute') {
    return {right: isRightToLeft(element, style), bottom: false};
  }

  const rect = element.getBoundingClientRect();
  return {right: centerX(rect) > centerX(contentRect), bottom: centerY(rect) > centerY(contentRect)};
}

/**
 * Which way a part's lines run. A text of its own direction (`dir="auto"`, a message) runs the way its letters do,
 * which its style does not say: it keeps the direction of the interface, and its paragraphs run their own way
 */
function isRightToLeft(element: HTMLElement, style = getComputedStyle(element)) {
  if(element.hasAttribute('dir')) try {
    return element.matches(':dir(rtl)');
  } catch{}

  return style.direction === 'rtl';
}

// the time stands at the bottom of its line's end (`inset-inline-end`)
function getTimeAnchor(time: HTMLElement): Anchor {
  return {right: getComputedStyle(time).direction !== 'rtl', bottom: true};
}

// what draws a background of its own in a bubble: a quote, a reaction, a tag's body (its point is a picture at its end)
const OWN_BACKGROUNDS = '.quote-like, reaction-element.reaction-block, reaction-element.reaction-tag > .reaction-tag-background';

const isReactions = (element: Element) => element.localName === 'reactions-element';
const isReaction = (element: Element) => element.localName === 'reaction-element';
// a part that can go, or be made anew, as only what is around a message changes: its reactions, its reply's quote once
// what it quotes comes (`MessageRender.setReply`), a voice message's text
const isSwapped = (element: Element) => isReactions(element) ||
  isReaction(element) ||
  element.classList.contains('reply') ||
  element.classList.contains('audio-transcribed-text');

// how a part looks: what it is made as, how big it is (a reply in the bubble, or beside a big emoji) and what it shows
// (a quote of a message edited since reads otherwise, a picture may be another one of the same size)
const getLook = (element: HTMLElement) => {
  const {width, height} = element.getBoundingClientRect();
  const pictures = Array.from(element.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video'))
  .map((media) => media.getAttribute('src') ?? (media as HTMLVideoElement).poster);
  return `${element.className} ${Math.round(width)}x${Math.round(height)} ${element.textContent} ${pictures.join(' ')}`;
};

/**
 * A colour as an opaque one and how much of it shows: what is drawn in pieces that meet is drawn opaque, and shown
 * as one, or where they meet it would show more
 */
function splitAlpha(color: string) {
  const match = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  return match ?
    {color: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, alpha: +match[4]} :
    {color, alpha: color === 'transparent' ? 0 : 1};
}

/**
 * What a bubble shows, as its classes say: a text, a photo, a file, a link's preview... A bubble rendered anew as one
 * of another kind has little of the old one's parts where they were (a file stands in its text), and shows as a whole
 */
const KINDS = ['photo', 'video', 'round', 'sticker', 'emoji-big', 'document-message', 'has-webpage', 'is-album', 'poll-message', 'contact-message'];
const getKind = (bubble: HTMLElement) => KINDS.filter((kind) => bubble.classList.contains(kind)).join(' ');

// a background that shows: a bubble of a big emoji has none
const isFilled = (background: BubbleBackground) => !!background && splitAlpha(background.color).alpha > 0;

/**
 * The parts of a bubble that move each by itself: what its content box holds, its reactions and a voice message's
 * text in its text, what stands beside it or under it, and each of its reactions. Its time is not one: it is made anew
 * as it changes
 */
function getParts(content: HTMLElement) {
  const elements: HTMLElement[] = [];
  const add = (element: Element) => {
    // the time stands by itself over a big emoji: it goes by itself all the same; the outgoing bubbles' gradient is
    // the background's, and gives way to the shape with it (`.morphing`)
    if(element instanceof HTMLElement && isVisible(element) && !element.classList.contains('time') && !isGradient(element)) {
      elements.push(element);
    }
  };

  const wrapper = content.parentElement;
  Array.from(content.children).forEach(add);
  content.querySelectorAll('.message reactions-element, .audio-transcribed-text').forEach(add);
  Array.from(wrapper.children).forEach((element) => element !== content && add(element));
  wrapper.querySelectorAll('reactions-element > reaction-element').forEach(add);
  return elements;
}

const isGradient = (element: Element) => element.classList.contains('bubble-gradient');

// the part an element is in: the nearest of those holding it, the last of them as the parts go from the outside in
function getHolder<T>(parts: T[], elementOf: (part: T) => HTMLElement, element: HTMLElement) {
  for(let index = parts.length - 1; index >= 0; --index) {
    const holder = elementOf(parts[index]);
    if(holder !== element && holder.contains(element)) {
      return parts[index];
    }
  }
}

/**
 * What a part is in its bubble, the same in a bubble rendered anew in its place: what it is made as (its tag and
 * first class), and for a reaction which one
 */
function getRole(element: HTMLElement) {
  const reaction = isReaction(element) && (element as ReactionElement).reactionCount?.reaction;
  return element.localName + '.' + (element.classList[0] ?? '') + (reaction ? ' ' + JSON.stringify(reaction) : '');
}

// a picture of what a pseudo-element draws (a glyph of the icon font), laid out as it is
function copyPseudo(element: HTMLElement, pseudo: '::before' | '::after') {
  const style = getComputedStyle(element, pseudo);
  const copy = document.createElement('span');
  // the computed `content` is a CSS string: in quotes, a character maybe escaped
  copy.textContent = style.content
  .replace(/^["']|["']$/g, '')
  .replace(/\\([0-9a-f]{1,6}) ?/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
  for(const property of [
    'font-family', 'font-size', 'font-weight', 'line-height', 'color', 'top', 'left', 'right', 'width', 'height',
    'background-color', 'background-image', 'background-size', 'background-position', 'border-radius', 'z-index'
  ]) {
    copy.style.setProperty(property, style.getPropertyValue(property));
  }

  return copy;
}

// a picture of what was there: nothing in it is read out, reached by Tab or clicked
function makeCopy(element: HTMLElement, classNames: string[], pairs?: CopyPairs) {
  const copy = copyElement(element, pairs);
  copy.classList.add(...classNames);
  copy.inert = true;
  return copy;
}

/**
 * The custom emoji of what is copied put on its copy (`copies`), as they are drawn: a canvas next to them draws them
 * (the row's of reactions, the text's; by a worker, mostly), which a copy does not take along, so they would go blank
 */
function copyCustomEmoji(element: HTMLElement, copies: CopyPairs) {
  element.querySelectorAll<CustomEmojiElement>('custom-emoji-element').forEach((emoji) => {
    const copy = copies.get(emoji) as HTMLElement;
    const player = emoji.player;
    if(!copy || !player) {
      return;
    }

    const picture = player instanceof HTMLVideoElement ? drawMediaToCanvas(player) : document.createElement('canvas');
    if(!picture) {
      return;
    }

    if(!(player instanceof HTMLVideoElement)) {
      paintPlayerFrame(player, picture, player.curFrame);
    }

    // over the room the emoji keeps in its line (`::before`), out of the line itself
    const {width, height} = emoji.getBoundingClientRect();
    picture.classList.add(styles.emoji);
    picture.style.width = `${width}px`;
    picture.style.height = `${height}px`;
    copy.style.position = 'relative';
    copy.append(picture);

    // what the canvas drew of it, copied too where a copy of the canvas has its pixels (no worker draws it), would stay
    // where the picture goes
    const renderer = emoji.renderer && copies.get(emoji.renderer) as HTMLElement;
    if(renderer) renderer.style.visibility = 'hidden';
  });
}

// a reaction's count: what it reads, and where it stands from the reaction's start and top
function captureCounter(element: HTMLElement, box: Box, anchor: Anchor): PartCapture['counter'] {
  const counter = element.querySelector<HTMLElement>(':scope > .reaction-counter');
  if(!counter || !isVisible(counter)) {
    return;
  }

  const rect = counter.getBoundingClientRect();
  return {
    text: counter.textContent,
    count: (element as ReactionElement).reactionCount?.count,
    copy: makeCopy(counter, [styles.counterCopy]),
    offset: {x: anchor.right ? box.right - rect.right : rect.left - box.left, y: rect.top - box.top}
  };
}

// the text of a message as it is drawn, but for the revision it was drawn from
function getTextSignature(host: HTMLElement) {
  return host.innerHTML.replace(/ data-source-revision="\d+"/g, '');
}

// what shows a message's text (`host`; not its time, nor its reactions, nor the file it is the caption of): boxes that
// can fade
function getTextLayers(host: HTMLElement): HTMLElement[] {
  const layers: HTMLElement[] = [];
  const collect = (element: Element) => {
    if(!(element instanceof HTMLElement) || element.matches('.time, .clearfix, reactions-element')) {
      return;
    }

    if(getComputedStyle(element).display === 'contents') {
      Array.from(element.children).forEach(collect);
    } else {
      layers.push(element);
    }
  };
  collect(host);
  return layers;
}

const getTextHost = (message: HTMLElement) => message?.querySelector<HTMLElement>('[data-message-text-source]');

// what a time reads, but for "edited"
function getTimeText(time: HTMLElement) {
  let text = '';
  const walker = document.createTreeWalker(time, NodeFilter.SHOW_TEXT);
  for(let node = walker.nextNode(); node; node = walker.nextNode()) {
    if(!node.parentElement.closest('.time-edited')) {
      text += node.textContent;
    }
  }

  // and a pin, which its glyph draws: no text of its own
  return text + (time.querySelector('.time-pinned') ? ' pinned' : '');
}

// a chat that another one is open over is laid out still, but not seen
function isSeen(container: HTMLElement) {
  const chat = container.closest('.chat');
  return !chat || chat.classList.contains('active');
}

/**
 * @param replacing it is to be rendered anew: any of its parts can be gone, and has a picture taken
 * @param textOf its text may change: a picture of it is taken
 */
function captureBubble(
  bubble: HTMLElement,
  content: HTMLElement,
  rect: DOMRect,
  motion: boolean,
  replacing: boolean,
  textOf: boolean
): BubbleCapture {
  const style = getComputedStyle(content);
  const capture: BubbleCapture = {
    bubble,
    content,
    box: toBox(rect),
    filled: isFilled(getBubbleBackground(style, rect)),
    parts: [],
    backgrounds: [],
    hadText: false
  };
  if(replacing) {
    // laid out as it was: out of its group, the most a message is wide there (`min(100%, 480px)`) is not what it gets
    const pairs: CopyPairs = new Map();
    const copy = makeCopy(bubble, [styles.ghost], pairs);
    keepStyle(content.parentElement, pairs.get(content.parentElement) as HTMLElement, ['width', 'max-width']);
    copyCustomEmoji(content.parentElement, pairs);
    capture.ghost = {
      copy,
      box: toBox(bubble.getBoundingClientRect()),
      wrapper: toBox(content.parentElement.getBoundingClientRect()),
      kind: getKind(bubble)
    };
  }

  if(motion) {
    // a box that cuts what it holds (media) cannot be drawn bigger or smaller than it is
    if(style.overflow === 'visible') {
      capture.background = getBubbleBackground(style, rect);
      // a bubble of a gradient is seen (nearly) all of its colour where it stands, not of its own under it
      const gradient = readOutgoingMessageGradient(content);
      if(gradient) {
        capture.background.color = getOutgoingMessageGradientColorAt(gradient, rect);
      }
      capture.tail = copyTail(content, rect);
    }

    content.parentElement.querySelectorAll<HTMLElement>(OWN_BACKGROUNDS).forEach((element) => {
      if(isVisible(element)) {
        capture.backgrounds.push({
          element,
          box: toBox(element.getBoundingClientRect()),
          anchor: {right: isRightToLeft(element), bottom: false}
        });
      }
    });
  }

  for(const element of getParts(content)) {
    const anchor = getAnchor(element, rect);
    const box = toBox(element.getBoundingClientRect());
    const copies: CopyPairs = new Map();
    const copy = replacing || isSwapped(element) ? makeCopy(element, [styles.copy], copies) : undefined;
    if(copy) {
      copyCustomEmoji(element, copies);
    }

    capture.parts.push({
      element,
      role: getRole(element),
      anchor,
      from: pointOf(box, anchor),
      box,
      parent: getHolder(capture.parts, (part) => part.element, element),
      copy,
      copies,
      look: replacing || isSwapped(element) ? getLook(element) : undefined,
      counter: isReaction(element) ? captureCounter(element, box, anchor) : undefined,
      unseen: getComputedStyle(element).opacity === '0'
    });
  }

  const message = content.querySelector<HTMLElement>('.message');
  const host = getTextHost(message);
  capture.hadText = !!host && isVisible(message);
  if((textOf || replacing) && capture.hadText) {
    const pairs: CopyPairs = new Map();
    const copy = makeCopy(message, [styles.copy, styles.textCopy], pairs);
    copyCustomEmoji(host, pairs);
    // nothing of it but its text: what is beside it in the message (the file it is the caption of) stays where it is,
    // and keeps its room
    for(let element = pairs.get(host); element && element !== copy; element = element.parentElement) {
      for(const sibling of Array.from(element.parentElement.children)) {
        // (but for what hides its spoilers, a part of how it looks)
        if(sibling !== element && !sibling.classList.contains('message-spoiler-overlay')) {
          (sibling as HTMLElement).style.visibility = 'hidden';
        }
      }
    }

    capture.text = {
      anchor: {right: isRightToLeft(message), bottom: false},
      signature: getTextSignature(host),
      copy,
      width: message.getBoundingClientRect().width
    };
  }

  const time = content.querySelector<HTMLElement>('.time-inner');
  if(isVisible(time)) {
    const copy = makeCopy(time, [styles.timeCopy]);
    copy.querySelectorAll<HTMLElement>('.time-sending-status').forEach(settleSendingStatusIconCopy);
    capture.time = {
      from: pointOf(time.getBoundingClientRect(), getTimeAnchor(time)),
      copy,
      text: getTimeText(time),
      edited: !!time.querySelector('.time-edited'),
      look: time.parentElement.className
    };
  }

  return capture;
}

// where the other messages and the groups' avatars stand, around what can be seen, before a change moves them
function captureNeighbours(container: HTMLElement, containerRect: DOMRect, captures: BubbleCapture[]) {
  const {visible} = getViewportSlice({
    overflowElement: container,
    overflowRect: containerRect,
    selector: '.bubble, .bubbles-group-avatar',
    extraSize: containerRect.height / 2
  });

  const tops = new Map<HTMLElement, number>();
  for(const {element, rect} of visible) {
    if(!captures.some(({bubble}) => bubble.contains(element))) {
      tops.set(element, rect.top);
    }
  }

  return tops;
}

export class BubbleTransition {
  // what cuts the old text is at least as big as the list
  private clipSize: Point;
  // what is put in the page, once everything the change needs is read from it: a read after a write would have it
  // laid out again, once for every bubble and reaction
  private writes: VoidFunction[];
  // what plays it
  private animations: Animation[];

  constructor(
    private captures: BubbleCapture[],
    private neighbours: Map<HTMLElement, number>,
    private container: HTMLElement,
    private motion: boolean
  ) {}

  /** The bubble `source` was is rendered anew as `bubble`: the change is shown in that one */
  public replace(source: HTMLElement, bubble: HTMLElement) {
    const capture = this.captures.find((capture) => capture.bubble === source);
    if(capture) capture.replacement = bubble;
  }

  /**
   * To call once the change is made and the list is where it keeps itself: from where it was to there. Says when
   * it is over: the next change of the list goes from there
   */
  public play(): Promise<void> | undefined {
    const {width, height} = this.container.getBoundingClientRect();
    this.clipSize = {x: width, y: height};
    const tracks: Track[] = [];
    const cleanups: VoidFunction[] = [];
    this.writes = [];
    for(const capture of this.captures) {
      const {bubble, replacement} = capture;
      const content = replacement ? getContent(replacement) : capture.content;
      // made anew rather than changed, and not shown as such: nothing to go from
      if(!content?.isConnected || (!replacement && getContent(bubble) !== content)) {
        continue;
      }

      // nor does one that cannot be shown keep the others from being shown: what it left goes with them
      try {
        this.playBubble(capture, content, tracks, cleanups);
      } catch{}
    }

    if(this.motion) {
      this.playNeighbours(tracks, cleanups);
    }

    this.writes.forEach((write) => write());
    this.writes = undefined;

    if(!tracks.length) {
      cleanups.forEach((cleanup) => cleanup());
      return;
    }

    // a way that goes nowhere (a background that only grows across does not move up) is where it ends: no
    // animation for the compositor to run and the page to restyle every frame
    const moving = tracks.filter(({element, keyframes}) => {
      const last = keyframes[keyframes.length - 1];
      const still = keyframes.every((keyframe) => keyframe.transform === last.transform &&
        keyframe.translate === last.translate &&
        keyframe.scale === last.scale &&
        keyframe.opacity === last.opacity);
      // where it is anyway (a part of the message that only moves across) is left as it is
      if(still && !/^(translate[XY]\(0px\)|0px 0px)$/.test((last.transform ?? last.translate) as string)) {
        if(last.transform !== undefined) element.style.transform = last.transform as string;
        if(last.translate !== undefined) element.style.translate = last.translate as string;
      }

      return !still;
    });
    if(!moving.length) {
      cleanups.forEach((cleanup) => cleanup());
      return;
    }

    const animations = this.animations = animateTracks(moving, this.duration);
    // it is over when its animations are, or long after they should have been (played slower too: the sandbox's
    // speed): one whose clock stopped (a window gone) would hold every change after it
    const slowest = Math.min(1, ...animations.map((animation) => animation.playbackRate || 1));
    const timeout = window.setTimeout(() => this.finish(), this.duration / slowest * 20 + 1000);
    const promise = Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      window.clearTimeout(timeout);
      animations.forEach((animation) => animation.cancel());
      cleanups.forEach((cleanup) => cleanup());
    });
    // custom emoji are drawn over their reactions by a canvas of the row: it follows them as they move (where nothing
    // moves, what is put in and taken out of the page tells it already)
    if(this.motion) {
      markEmojiLayoutMoving(promise);
    }

    return promise;
  }

  /** Over at once, where it ends: what it made goes */
  public finish() {
    this.animations?.forEach((animation) => animation.cancel());
  }

  private playBubble(capture: BubbleCapture, content: HTMLElement, tracks: Track[], cleanups: VoidFunction[]) {
    const ways = this.motion ? motionTracks : reducedTracks;
    const wrapper = content.parentElement;
    const rect = content.getBoundingClientRect();
    const origin: Point = {x: rect.left, y: rect.top};

    if(capture.ghost && capture.ghost.kind !== getKind(capture.replacement)) {
      this.playKindChange(capture, content, rect, origin, tracks, cleanups);
      return;
    }

    // what each part is now: itself, or what stands for it in a bubble rendered anew; none, gone. What is left
    // unclaimed came
    const current = getParts(content);
    const came = new Set(current);
    const now = new Map<PartCapture, HTMLElement>();
    // what is made anew (all of a bubble rendered anew, a reply's quote) stands for what it is
    const madeAnew = new Set<PartCapture>();
    const claim = (part: PartCapture, element: HTMLElement) => {
      now.set(part, element);
      came.delete(element);
    };
    if(!capture.replacement) for(const part of capture.parts) {
      if(came.has(part.element)) claim(part, part.element);
    }

    for(const part of capture.parts) {
      const element = !now.has(part) && current.find((element) => came.has(element) && getRole(element) === part.role);
      if(element) {
        claim(part, element);
        madeAnew.add(part);
      }
    }

    // how far each part has come, from where it stood to where it stands; it is moved by what holds it too
    const moves = new Map<PartCapture, Point>();
    now.forEach((element, part) => {
      moves.set(part, subtract(part.from, pointOf(element.getBoundingClientRect(), part.anchor)));
    });

    const deltas = new Map<HTMLElement, Point>();
    if(this.motion) {
      now.forEach((element, part) => deltas.set(element, moves.get(part)));
    }

    const time = content.querySelector<HTMLElement>('.time-inner');
    if(this.motion && capture.time && isVisible(time)) {
      const to = pointOf(time.getBoundingClientRect(), getTimeAnchor(time));
      deltas.set(time, subtract(capture.time.from, to));
    }

    // its own way, but for the way of what holds it
    const getOwn = (element: HTMLElement) => {
      const delta = deltas.get(element);
      for(let parent = element.parentElement; parent && parent !== wrapper; parent = parent.parentElement) {
        const held = deltas.get(parent);
        if(held) {
          return subtract(delta, held);
        }
      }

      return delta;
    };

    const shift = (element: HTMLElement, own: Point) => this.shift(ways, element, own, tracks);

    deltas.forEach((_, element) => shift(element, getOwn(element)));

    // what stands out of the content box (its reactions under a picture) and comes from where it is now (a caption) is
    // drawn over it on the way, not under its background
    now.forEach((element) => {
      const delta = deltas.get(element);
      if(element.parentElement === wrapper && delta && isMoved(delta) && getComputedStyle(element).position !== 'static') {
        this.writes.push(() => element.classList.add(styles.over));
        cleanups.push(() => element.classList.remove(styles.over));
      }
    });

    // the background's box where it was and where it is, from the content box's corner; nothing moves at the
    // reduced level, and it is where it is
    const boxTo = fromOrigin(snapBox(toBox(rect)), origin);
    const boxFrom = this.motion ? fromOrigin(snapBox(capture.box), origin) : boxTo;

    // what needs the room the background is growing to (the new text, the new time, "edited") comes once it has
    // grown most of the way, and what it replaces goes then; what fits comes at once
    const grows = boxTo.right - boxTo.left > boxFrom.right - boxFrom.left + .5 ||
      boxTo.bottom - boxTo.top > boxFrom.bottom - boxFrom.top + .5;
    const [outFrom, outTo, inFrom, inTo] = grows ?
      [GROWN_AT, GROWN_AT + GROWN_SWAP, GROWN_AT - 10, GROWN_AT - 10 + GROWN_SWAP] :
      [0, TEXT_OUT, 0, Math.min(TEXT_IN, this.duration)];
    const fadeOut = (element: HTMLElement) => ways.fade(element, [1, 0], [1, outFrom], [0, outTo], [0, this.duration]);
    const fadeIn = (element: HTMLElement) => ways.fade(element, [0, 0], [0, inFrom], [1, inTo], [1, this.duration]);
    // what comes where the bubble was (buttons under it), or makes it bigger (a caption, a voice message's text), comes
    // once the bubble has made most of the room for it: laid out as big as it ends, it would stand out of it till then
    const late = (element: HTMLElement) => ways.fade(element, [0, 0], [0, this.duration * .5], [1, this.duration]);

    // what was there and is not, shown as it was: over the parts, cut by the background as it changes
    let clip: ReturnType<typeof createClip>, free: HTMLElement;
    // moved by what holds it, as what it shows may grow or shrink about its middle, which a move of its own would
    // grow and shrink with; uncut, it is put from the content box's corner
    const addCopy = (copy: HTMLElement, start: Point, end: Point, cut = true) => {
      const holder = createPart();
      holder.append(copy);
      const axes = createAxes(holder);
      let [from, to] = [start, end];
      if(!cut) {
        if(!free) {
          const layer = free = createLayer();
          this.writes.push(() => content.append(layer));
          cleanups.push(() => layer.remove());
        }

        free.append(axes.across);
      } else {
        if(!clip) {
          const layer = createLayer();
          this.writes.push(() => content.append(layer));
          cleanups.push(() => layer.remove());
          clip = createClip(layer, this.clipSize, boxFrom, boxTo, tracks, this.motion ? ways : undefined);
        }

        clip.over.append(axes.across);
        [from, to] = [clip.at(start, false), clip.at(end, true)];
      }

      place(axes, to);
      if(this.motion && isMoved(subtract(from, to))) {
        tracks.push(...ways.move(axes, from, to));
      }
    };

    // a reaction comes growing and goes shrinking where it stands, the others making room for it
    const scale = (element: HTMLElement, from: number, to: number) => {
      if(this.motion) {
        tracks.push(ways.scale(element, from, to));
      }
    };

    // the text that changed (or is gone, a file's caption), and a text where there was none
    const text = capture.text;
    const message = content.querySelector<HTMLElement>('.message');
    const host = isVisible(message) ? getTextHost(message) : undefined;
    const textChanged = !!(text && message && (!host || getTextSignature(host) !== text.signature));
    const messagePart = capture.parts.find((part) => part.element.classList.contains('message'));
    const textCame = !capture.hadText && !!host && !!messagePart && now.get(messagePart) === message;

    // reactions go each by itself, shrinking where it stands as it fades, uncut by the background
    // (ReactionsLayoutInBubble's outButtons)
    const fadeAway = (element: HTMLElement) => ways.fade(element, [1, 0], [0, this.duration * .7], [0, this.duration]);
    const showGoing = (part: PartCapture, way: Point, cut: boolean) => {
      const start = subtract({x: part.box.left, y: part.box.top}, origin);
      const end = subtract(start, way);
      part.copy.style.width = `${boxWidth(part.box)}px`;
      part.copy.style.height = `${boxHeight(part.box)}px`;
      addCopy(part.copy, this.motion ? start : end, end, cut);
    };

    capture.parts.forEach((part) => {
      // in a part that is gone too, it goes with that one's picture
      if(now.has(part) || !part.copy || part.unseen || (part.parent && !now.has(part.parent))) {
        return;
      }

      // what of it stays (its reactions, in a caption that is gone) goes by itself, not in its picture
      now.forEach((_, other) => {
        if(other !== part && part.element.contains(other.element)) {
          (part.copies.get(other.element) as HTMLElement).style.opacity = '0';
        }
      });

      // it goes with the part it is in, or with its corner of the bubble; a row of reactions, at the bubble's bottom,
      // with that: the text above takes its place as the bubble closes over it
      const row = isReactions(part.element);
      const anchor: Anchor = row ? {right: part.anchor.right, bottom: true} : part.anchor;
      const way = part.parent && !row ?
        moves.get(part.parent) :
        subtract(pointOf(capture.box, anchor), pointOf(rect, anchor));
      // what stood out of the background (its buttons under it) is not cut by it
      const reactions = row || isReaction(part.element);
      showGoing(part, way, !reactions && capture.content.contains(part.element));
      tracks.push(reactions ? fadeAway(part.copy) : fadeOut(part.copy));
      // (a copy of a reaction is an element of no kind, found by its class: `copyElement`)
      (row ? Array.from(part.copy.querySelectorAll<HTMLElement>('.reaction')) : reactions ? [part.copy] : [])
      .forEach((element) => scale(element, 1, REACTION_SCALE));
    });

    // in a bubble rendered anew, what stands for a part may look otherwise (a reply beside a big emoji, not in a
    // bubble, a picture with its corners round or not): the old one gives way to it as they go, uncut, over it, the new
    // one there at once (the text gives way by itself, below; reactions only move: they look as they did)
    const crossfaded = new Set<PartCapture>();
    now.forEach((element, part) => {
      if(
        !madeAnew.has(part) ||
        !part.copy ||
        part.unseen ||
        element.classList.contains('message') ||
        isReactions(element) ||
        isReaction(element) ||
        getLook(element) === part.look ||
        (part.parent && crossfaded.has(part.parent))
      ) {
        return;
      }

      crossfaded.add(part);
      showGoing(part, moves.get(part), false);
      tracks.push(ways.fade(part.copy, [1, 0], [0, this.duration * .6], [0, this.duration]));
      // what the old one covers needs no fade: both showing a part of the way, the two would show less than one. A
      // bigger one comes once the bubble has made most of the room for it, as a block that comes does; one with a
      // background of its own (a quote, stretched below) has what it shows come, not its background
      const {width, height} = element.getBoundingClientRect();
      if(width > boxWidth(part.box) + .5 || height > boxHeight(part.box) + .5) {
        const shows = this.motion && element.matches(OWN_BACKGROUNDS) ?
          Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement) :
          [element];
        tracks.push(...shows.map(late));
      }
    });

    came.forEach((element) => {
      // a row of reactions has nothing to show by itself: its reactions come each by itself; what is in a part that
      // came, comes with it
      const parent = getHolder(current, (other) => other, element);
      if(isReactions(element) || (parent && came.has(parent) && !isReactions(parent))) {
        return;
      }

      // a caption fades by its text: what of it stays (its reactions) goes by itself
      const inside = content.contains(element);
      if(isReaction(element)) {
        tracks.push(inside ? fadeIn(element) : late(element));
        scale(element, REACTION_SCALE, 1);
      } else if(element.classList.contains('message')) {
        tracks.push(...getTextLayers(getTextHost(element) ?? element).map(grows ? late : fadeIn));
      } else {
        tracks.push(grows || !inside ? late(element) : fadeIn(element));
      }
    });

    // a voice message's text that changed (it comes in pieces) gives way to the new one as a message's text does
    now.forEach((element, part) => {
      if(
        !madeAnew.has(part) &&
        part.copy &&
        element.classList.contains('audio-transcribed-text') &&
        element.textContent !== part.copy.textContent
      ) {
        showGoing(part, moves.get(part), true);
        tracks.push(fadeOut(part.copy), grows ? late(element) : fadeIn(element));
      }
    });

    if(textChanged) {
      // the old text stands where the new one does and goes with it
      const {copy, width} = text;
      copy.style.width = `${width}px`;
      const to = pointOf(message.getBoundingClientRect(), text.anchor);
      const end = {x: (text.anchor.right ? to.x - width : to.x) - origin.x, y: to.y - origin.y};
      const delta = deltas.get(message);
      addCopy(copy, delta ? add(end, delta) : end, end);
      tracks.push(fadeOut(copy), ...(host ? getTextLayers(host).map(fadeIn) : []));
    } else if(textCame) {
      // a file that got a caption: the caption comes as a block that makes the bubble bigger does
      tracks.push(...getTextLayers(host).map(grows ? late : fadeIn));
    }

    // what has a background of its own in it goes from its old size to its new one as the bubble does, rather than
    // standing out of it as big as it ends (one made anew too: what it shows gives way over it); a quote of a text that
    // changed gives way with the text
    if(this.motion) for(const background of capture.backgrounds) {
      let element = background.element;
      if(!wrapper.contains(element)) {
        element = now.get(capture.parts.find((part) => part.element === element));
      }

      if(element && isVisible(element) && !(textChanged && host?.contains(element))) {
        this.stretchBackground(background, element, tracks, cleanups, shift);
      }
    }

    // a reaction's count that changed, as the reaction stretches: its digits that changed roll to the new ones, up as
    // it grows and down as it drops (the Android and iOS apps' counters); at the reduced level it gives way to the new
    // one where it stands
    now.forEach((element, part) => {
      const counter = part.counter;
      const next = counter && element.querySelector<HTMLElement>(':scope > .reaction-counter');
      if(!counter || next?.textContent === counter.text) {
        return;
      }

      const {copy, offset} = counter;
      const side = part.anchor.right ? 'right' : 'left';
      copy.style[side] = `${offset.x}px`;
      copy.style.top = `${offset.y}px`;
      this.writes.push(() => element.append(copy));
      cleanups.push(() => copy.remove());
      const count = (element as ReactionElement).reactionCount?.count;
      // a count with a name of its own (a tag's), or that is not a number written as one (`formatNumber`), gives way as
      // a whole
      const isNumber = (text: string) => /^[\d.]+[KMBT]?$/.test(text);
      if(
        !this.motion ||
        !next ||
        count === counter.count ||
        !isNumber(next.textContent) ||
        !isNumber(counter.text)
      ) {
        tracks.push(ways.fade(copy, [1, 0], [0, TEXT_OUT], [0, this.duration]));
        if(next) tracks.push(ways.fade(next, [0, 0], [1, Math.min(TEXT_IN, this.duration)], [1, this.duration]));
        return;
      }

      this.rollCounter(element, next, copy, side, count > counter.count, tracks, cleanups);
    });

    if(capture.time && isVisible(time)) {
      const edited = time.querySelector<HTMLElement>('.time-edited');
      // over a big emoji it is drawn otherwise
      const looksTheSame = !capture.replacement || time.parentElement.className === capture.time.look;
      if(getTimeText(time) === capture.time.text && looksTheSame) {
        if(edited && !capture.time.edited) {
          tracks.push(fadeIn(edited));
        }
      } else {
        // it reads otherwise ("edited at"), or looks otherwise: the old one gives way where the new one stands, and
        // goes with it
        const {copy} = capture.time;
        const parent = time.parentElement;
        this.writes.push(() => parent.append(copy));
        cleanups.push(() => copy.remove());
        if(deltas.has(time)) {
          shift(copy, getOwn(time));
        }

        tracks.push(fadeOut(copy), fadeIn(time));
      }
    }

    this.playBackground(capture, content, rect, origin, tracks, cleanups);
  }

  /**
   * What stands where it ends going there from `own` away, across by its `translate` and up by its `transform`, each
   * on its curve: a transform of its own (a button turned round) goes on under the way, and an axis it does not go along
   * is left alone
   */
  private shift(ways: Tracks, element: HTMLElement, own: Point, tracks: Track[]) {
    if(Math.abs(own.x) >= .5) {
      tracks.push({element, keyframes: [{translate: `${own.x}px 0px`}, {translate: '0px 0px'}], easing: EASING_X});
    }

    if(Math.abs(own.y) >= .5) {
      const transform = getComputedStyle(element).transform;
      const base = transform && transform !== 'none' ? ' ' + transform : '';
      tracks.push(ways.up(element, `translateY(${own.y}px)${base}`, `translateY(0px)${base}`));
    }
  }

  /**
   * A count rolling from what it read (`copy`, put where it stood) to what it reads (`next`, of the reaction `element`):
   * both as pictures, a letter at a time, each cut by its line - what reads the same where it stands stays, what does
   * not goes out of its line and the new one comes in, `up` or down
   */
  private rollCounter(
    element: HTMLElement,
    next: HTMLElement,
    copy: HTMLElement,
    side: 'left' | 'right',
    up: boolean,
    tracks: Track[],
    cleanups: VoidFunction[]
  ) {
    const rect = element.getBoundingClientRect();
    const nextRect = next.getBoundingClientRect();
    const nextCopy = makeCopy(next, [styles.counterCopy]);
    nextCopy.style[side] = `${side === 'right' ? rect.right - nextRect.right : nextRect.left - rect.left}px`;
    nextCopy.style.top = `${nextRect.top - rect.top}px`;
    this.writes.push(() => element.append(nextCopy));
    cleanups.push(() => nextCopy.remove());

    const split = (picture: HTMLElement) => {
      const letters = Array.from(picture.textContent).map((letter) => {
        const span = document.createElement('span');
        span.textContent = letter;
        return span;
      });
      picture.replaceChildren(...letters);
      picture.classList.add(styles.counterRoll);
      // a number reads left to right: letters each in a box of their own have no direction of their own to keep it
      picture.dir = 'ltr';
      return letters;
    };

    const [from, to] = [split(copy), split(nextCopy)];
    const height = nextRect.height;
    const ways = motionTracks;
    for(let index = 0; index < Math.max(from.length, to.length); ++index) {
      const [was, is] = [from[index], to[index]];
      // the same letter where it stood, in a count as long: it stays (the new picture shows it)
      if(was && is && was.textContent === is.textContent && from.length === to.length) {
        was.style.visibility = 'hidden';
        continue;
      }

      if(was) tracks.push(
        ways.up(was, 'translateY(0px)', `translateY(${up ? -height : height}px)`),
        ways.fade(was, [1, 0], [0, this.duration * .6], [0, this.duration])
      );
      if(is) tracks.push(
        ways.up(is, `translateY(${up ? height : -height}px)`, 'translateY(0px)'),
        ways.fade(is, [0, 0], [1, this.duration * .6], [1, this.duration])
      );
    }

    // the count itself shows once the picture of it is gone (a way that changes nothing would be no way at all)
    tracks.push(ways.fade(next, [0, 0], [0, this.duration - 1], [1, this.duration]));
  }

  /**
   * A bubble that becomes one of another kind (a big emoji, which has no background, and back; a text that gets a
   * photo, a photo that becomes a file): the old one gives way to the new one as a whole, both going with the corner
   * a bubble stands by — its bottom, at the side of who sent it — and the background changes its size, coming or
   * going when one of them has none
   */
  private playKindChange(
    capture: BubbleCapture,
    content: HTMLElement,
    rect: DOMRect,
    origin: Point,
    tracks: Track[],
    cleanups: VoidFunction[]
  ) {
    const ways = this.motion ? motionTracks : reducedTracks;
    const anchor: Anchor = {right: capture.bubble.classList.contains('is-out') !== isRightToLeft(content), bottom: true};
    const way = this.motion ? subtract(pointOf(capture.box, anchor), pointOf(rect, anchor)) : {x: 0, y: 0};
    const shows = [
      ...Array.from(content.children),
      ...Array.from(content.parentElement.children).filter((element) => element !== content)
    ].filter((element): element is HTMLElement => element instanceof HTMLElement && isVisible(element) && !isGradient(element));

    // the old one is put in the list, not in the new one: a rule through the new one's kind (`.emoji-big ...`) would lay
    // it out as that one is; from the corner of the list's content, where its layer stands — read once more, as a
    // change of kind is rare
    const {copy, box} = capture.ghost;
    copy.style.width = `${boxWidth(box)}px`;
    copy.style.height = `${boxHeight(box)}px`;
    const holder = createPart();
    holder.append(copy);
    const axes = createAxes(holder);
    const layer = createLayer();
    layer.append(axes.across);
    const container = this.container;
    const inList = getComputedStyle(container).position !== 'static';
    place(axes, {x: 0, y: 0});
    (inList ? container : content).append(layer);
    cleanups.push(() => layer.remove());
    // its content stands where it stood: out of its group, the room the group keeps at its side (for an avatar) is
    // not kept in it
    const layerRect = layer.getBoundingClientRect();
    const wrapperRect = copy.querySelector('.bubble-content-wrapper')?.getBoundingClientRect() ?? layerRect;
    const start = subtract(
      {x: capture.ghost.wrapper.left, y: capture.ghost.wrapper.top},
      {x: wrapperRect.left, y: wrapperRect.top}
    );
    const end = subtract(start, way);
    // cut by the background as it changes, as an old text is: shrinking, it stood out of it over the messages about it;
    // at the reduced level nothing moves, and it is cut where the background is
    const layerOrigin = {x: layerRect.left, y: layerRect.top};
    const boxTo = fromOrigin(snapBox(toBox(rect)), layerOrigin);
    const clip = createClip(
      layer,
      this.clipSize,
      this.motion ? fromOrigin(snapBox(capture.box), layerOrigin) : boxTo,
      boxTo,
      tracks,
      this.motion ? ways : undefined
    );
    clip.over.append(axes.across);
    const [from, to] = [clip.at(start, false), clip.at(end, true)];
    place(axes, to);
    if(isMoved(subtract(from, to))) {
      tracks.push(...ways.move(axes, from, to));
    }

    // what is bigger than the old one comes in the second half of the way, as the background has grown most of it and
    // the messages about it have made room: laid out as big as it ends, it stands out of the background till then
    const duration = this.duration;
    const grows = this.motion && (rect.width > boxWidth(capture.box) + .5 || rect.height > boxHeight(capture.box) + .5);
    const [comes, came] = grows ? [duration * .5, duration] : [0, duration * .6];
    tracks.push(ways.fade(copy, [1, 0], [0, duration * .6], [0, duration]));
    for(const element of shows) {
      this.shift(ways, element, way, tracks);

      // as much as it shows (a button shown on hover, none of it)
      const opacity = +getComputedStyle(element).opacity;
      if(opacity) {
        tracks.push(ways.fade(element, [0, 0], [0, comes], [opacity, came], [opacity, duration]));
      }
    }

    this.playBackground(capture, content, rect, origin, tracks, cleanups);
  }

  // the background, from its old box to its new one; a bubble that has none (a big emoji's) has it come or go
  private playBackground(
    capture: BubbleCapture,
    content: HTMLElement,
    rect: DOMRect,
    origin: Point,
    tracks: Track[],
    cleanups: VoidFunction[]
  ) {
    const ways = this.motion ? motionTracks : reducedTracks;
    const style = getComputedStyle(content);
    if(this.motion && capture.background && style.overflow === 'visible') {
      const toBackground = getBubbleBackground(style, rect);
      const [fromFilled, toFilled] = [isFilled(capture.background), isFilled(toBackground)];
      const background = fromFilled ? capture.background : toBackground;
      const radii = toFilled ? toBackground.radii : capture.background.radii;
      const tailOffset = getTailOffset(content, rect);
      // a tail it got or lost comes or goes at once, with the bubble's own — with the background, when that does
      const tail = tailOffset ?
        capture.tail ?? (fromFilled ? undefined : copyTail(content, rect)) :
        (toFilled ? undefined : capture.tail);
      const from = getShapePlaces(snapBox(capture.box), origin, radii, tail?.offset);
      const to = getShapePlaces(snapBox(toBox(rect)), origin, radii, tail && (tailOffset ?? tail.offset));
      const isResized = from.shape.bands.some((band, index) => {
        const other = to.shape.bands[index];
        return band.left !== other.left || band.top !== other.top || band.right !== other.right || band.bottom !== other.bottom;
      });
      const fades = fromFilled !== toFilled;
      if((fromFilled || toFilled) && (isResized || fades)) {
        // a bubble of a gradient is (nearly) all of its colour where it ends up: the shape is of that, over its piece
        // of the gradient, which gives way (`.morphing`); one that has no background any more keeps the colour it was
        const gradient = readOutgoingMessageGradient(content);
        const color = gradient ? getOutgoingMessageGradientColorAt(gradient, toBox(rect)) : background.color;
        const parts = createShapeParts({...background, color, radii}, tail?.element);
        const under = createLayer();
        under.classList.add(styles.under);
        under.append(parts.background);
        this.writes.push(() => {
          content.prepend(under);
          content.classList.add(styles.morphing);
        });
        cleanups.push(() => {
          under.remove();
          content.classList.remove(styles.morphing);
        });
        tracks.push(...getShapeTracks(ways, parts, from, to));
        if(fades) {
          tracks.push(fromFilled ?
            ways.fade(parts.background, [1, 0], [0, this.duration]) :
            ways.fade(parts.background, [0, 0], [1, this.duration * .6], [1, this.duration]));
        }
      }
    }
  }

  /**
   * A background of its own (a quote's, a reaction's) drawn by pieces from its old box to its new one, as the
   * bubble's is, its own given way: of its colour, opaque, shown as much as the colour shows. What stands at a quote's
   * end (the peer's pattern) goes with it
   */
  private stretchBackground(
    quote: OwnBackground,
    element: HTMLElement,
    tracks: Track[],
    cleanups: VoidFunction[],
    shift: (element: HTMLElement, own: Point) => void
  ) {
    const rect = element.getBoundingClientRect();
    const to = toBox(rect);
    if(Math.abs(boxWidth(to) - boxWidth(quote.box)) < .5 && Math.abs(boxHeight(to) - boxHeight(quote.box)) < .5) {
      return;
    }

    // a reaction chosen is drawn in its colour by what is over it (`::before`)
    const reaction = isReaction(element);
    const style = getComputedStyle(element);
    const chosen = reaction && element.classList.contains('is-chosen') && element.classList.contains('forwards');
    const {color, alpha} = splitAlpha(chosen ? getComputedStyle(element, '::before').backgroundColor : style.backgroundColor);
    if(!alpha) {
      return;
    }

    const morphing = reaction ? styles.reactionMorphing : styles.quoteMorphing;

    // it goes with its start, as it moves: its old box laid against where that is now
    const [oldStart, newStart] = [pointOf(quote.box, quote.anchor), pointOf(to, quote.anchor)];
    const by = subtract(newStart, oldStart);
    const from = {left: quote.box.left + by.x, top: quote.box.top + by.y, right: quote.box.right + by.x, bottom: quote.box.bottom + by.y};
    const origin: Point = {x: to.left, y: to.top};
    const radii = getRadii(style, rect);
    const parts = createShapeParts({color, shadow: 'none', radii});
    parts.background.style.opacity = '' + alpha;
    const layer = createLayer();
    layer.classList.add(styles.under);
    layer.append(parts.background);
    this.writes.push(() => {
      element.prepend(layer);
      element.classList.add(morphing);
    });
    cleanups.push(() => {
      layer.remove();
      element.classList.remove(morphing);
    });
    tracks.push(...getShapeTracks(
      motionTracks,
      parts,
      getShapePlaces(snapBox(from), origin, radii),
      getShapePlaces(snapBox(to), origin, radii)
    ));

    const end: Anchor = {right: !quote.anchor.right, bottom: false};
    const endWay = subtract(subtract(pointOf(quote.box, end), oldStart), subtract(pointOf(to, end), newStart));
    element.querySelectorAll<HTMLElement>(':scope > .quote-like-pattern').forEach((pattern) => shift(pattern, endWay));
    // a tag's point and dot stand at its end
    if(element.classList.contains('reaction-tag-background')) {
      element.parentElement.querySelectorAll<HTMLElement>(':scope > .reaction-tag-svg, :scope > .reaction-tag-dot')
      .forEach((end) => shift(end, endWay));
    }

    // a quote's border (its `::before`, as tall as it is) gives way to a picture of it, as tall as its background
    if(element.classList.contains('quote-like-border') && Math.abs(boxHeight(to) - boxHeight(from)) >= .5) {
      const border = copyPseudo(element, '::before');
      border.classList.add(styles.border);
      this.writes.push(() => {
        element.append(border);
        element.classList.add(styles.borderGoing);
      });
      cleanups.push(() => {
        border.remove();
        element.classList.remove(styles.borderGoing);
      });
      tracks.push(motionTracks.up(border, `scaleY(${boxHeight(from) / boxHeight(to)})`, 'scaleY(1)'));
    }

    // and so does a quote's mark, which its `::after` draws: a picture of it goes, the mark itself waits
    if(element.classList.contains('quote-like-icon')) {
      const mark = copyPseudo(element, '::after');
      mark.classList.add(styles.mark);
      this.writes.push(() => {
        element.append(mark);
        element.classList.add(styles.markGoing);
      });
      cleanups.push(() => {
        mark.remove();
        element.classList.remove(styles.markGoing);
      });
      shift(mark, endWay);
    }
  }

  // the other messages a change moved go there from where they were: only what can be seen, before or after
  private playNeighbours(tracks: Track[], cleanups: VoidFunction[]) {
    const containerRect = this.container.getBoundingClientRect();
    const isSeen = (top: number, bottom: number) => bottom > containerRect.top && top < containerRect.bottom;
    const moved: HTMLElement[] = [];
    this.neighbours.forEach((top, element) => {
      if(!element.isConnected) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const y = top - rect.top;
      if(Math.abs(y) < .5 || (!isSeen(rect.top, rect.bottom) && !isSeen(top, top + rect.height))) {
        return;
      }

      // on top of where the list keeping up with a growing message has it go (`followGrowth`), both read with that
      tracks.push({
        element,
        keyframes: [{translate: `0px ${y}px`}, {translate: '0px 0px'}],
        easing: EASING_Y,
        composite: 'add'
      });
      moved.push(element);
    });

    // the move takes the pieces of an outgoing bubble's gradient in (`holdOutgoingMessageGradient`)
    const hold = measureOutgoingMessageGradientHold(moved);
    if(hold) {
      this.writes.push(() => {
        hold();
        cleanups.push(markOutgoingMessageGradientHeld(moved));
      });
    }
  }

  private get duration() {
    return this.motion ? DURATION : REDUCED_DURATION;
  }
}

// where a bubble that grows by itself stood in the list's content (not on the screen: the list scrolls under it) and how
// tall it was, when it was last followed (`followGrowth`)
const followed = new WeakMap<HTMLElement, {top: number, height: number}>();
// and the ways it has things go, while they go
const following: Set<Animation> = new Set();

// how far a running way has an element from where it stands (`translate`, which the ways below add up)
function getTranslateY(element: HTMLElement) {
  const [, y] = getComputedStyle(element).translate.split(' ');
  return parseFloat(y) || 0;
}

/**
 * Where a message that is to grow by itself (a streamed answer) stands as it is laid out first: its first growth is
 * followed from there (`followGrowth`)
 */
export function noteGrowth(
  container: HTMLElement,
  bubble: HTMLElement,
  containerRect = container.getBoundingClientRect(),
  rect = bubble.getBoundingClientRect()
) {
  const top = rect.top - containerRect.top - getTranslateY(bubble) + container.scrollTop;
  followed.set(bubble, {top, height: rect.height});
}

/**
 * The list keeps up with a message that grows at its end (a streamed answer, a line at a time), which pushes what is
 * above it up (the list keeps its end where it is shorter than the screen) or goes on under the edge: with `follow`, the
 * list goes to its end at once. With full animations what that moved goes up from where it stood, as the list goes when
 * a message comes, on top of a way still being gone - line after line. What stays where it is (a date held at the top)
 * stays.
 */
export function followGrowth(container: HTMLElement, bubble: HTMLElement, follow: boolean) {
  const scrollToEnd = () => {
    const before = container.scrollTop;
    if(follow) container.scrollTop = container.scrollHeight;
    return container.scrollTop - before;
  };

  if(
    !liteMode.isAvailable('motion') ||
    container.ownerDocument.visibilityState === 'hidden' ||
    !bubble.isConnected ||
    !isSeen(container)
  ) {
    // what it grew by unseen is never shown going: the next growth goes from where it is then
    followed.delete(bubble);
    scrollToEnd();
    return;
  }

  // where it stands in the content now, and how far it went up there by the room it took since it was followed
  const containerRect = container.getBoundingClientRect();
  const rect = bubble.getBoundingClientRect();
  const last = followed.get(bubble);
  noteGrowth(container, bubble, containerRect, rect);
  const top = followed.get(bubble).top;
  const grown = last ? rect.height - last.height : 0;
  const pushed = grown > 0 ? Math.max(0, Math.min(last.top - top, grown)) : 0;
  // nothing moves (it laid out as it was, or grew where the list does not go after it): nothing to read about the rest
  if(pushed < .5 && (!follow || container.scrollHeight - container.clientHeight - container.scrollTop < .5)) {
    return;
  }

  const visible = getViewportSlice({
    overflowElement: container,
    overflowRect: containerRect,
    selector: '.bubble, .bubbles-group-avatar'
  }).visible;
  const scrolled = scrollToEnd();
  if(!scrolled && pushed < .5) {
    return;
  }

  // how far each went, all read before any way starts: a way started restyles what the next read would wait for
  const ways = visible.map(({element, rect: was}) => {
    // the list scrolled under it (not under a date held at its top), and what is above the message was pushed up
    let moved = scrolled ? was.top - element.getBoundingClientRect().top : 0;
    if(pushed && (element === bubble || was.bottom <= rect.top + .5) && !element.classList.contains('is-sticky')) {
      moved += pushed;
    }

    return {element, moved};
  });

  const going = ways.filter(({moved}) => Math.abs(moved) >= .5);
  // the move takes the pieces of an outgoing bubble's gradient in (`holdOutgoingMessageGradient`)
  const hold = measureOutgoingMessageGradientHold(going.map(({element}) => element));
  hold?.();
  const animations = going.map(({element, moved}) => element.animate(
    [{translate: `0px ${moved}px`}, {translate: '0px 0px'}],
    {duration: DURATION, easing: EASING_Y, composite: 'add'}
  ));
  if(hold) {
    const release = markOutgoingMessageGradientHeld(going.map(({element}) => element));
    Promise.allSettled(animations.map((animation) => animation.finished)).then(release);
  }

  startOnNextFrame(animations);
  // custom emoji are drawn by canvases over what moves
  markEmojiLayoutMoving(Promise.allSettled(animations.map((animation) => animation.finished)));
  animations.forEach((animation) => {
    following.add(animation);
    const done = () => following.delete(animation);
    animation.finished.then(done, done);
  });
}

/** The ways of keeping up with growth over at once (the chat goes to another window, whose clock it does not run on) */
export function finishGrowth() {
  following.forEach((animation) => animation.cancel());
  following.clear();
}

/**
 * Before a batch of changes to bubbles: what those of them that can be seen look like, and where what is around
 * them stands. Undefined when there is nothing to show: no animations, a hidden chat, nothing on the screen.
 *
 * @param busy a bubble something else animates (a message still flying in): it just changes
 * @param replacing the bubbles are to be rendered anew (`BubbleTransition.replace`)
 * @param textOf whether a bubble's text may change (`BubbleChange`): none, it may
 */
export default function captureBubbleTransition({bubbles, container, busy, replacing = false, textOf}: {
  bubbles: Iterable<HTMLElement>,
  container: HTMLElement,
  busy?: (bubble: HTMLElement) => boolean,
  replacing?: boolean,
  textOf?: (bubble: HTMLElement) => boolean
}) {
  // a bubble changed this way is no longer followed as it grows (`followGrowth`): the batch keeps the view in place
  bubbles = Array.from(bubbles);
  for(const bubble of bubbles) {
    followed.delete(bubble);
  }

  if(!liteMode.isAvailable('animations') || container.ownerDocument.visibilityState === 'hidden' || !isSeen(container)) {
    return;
  }

  const containerRect = container.getBoundingClientRect();
  if(!containerRect.height) {
    return;
  }

  const motion = liteMode.isAvailable('motion');
  const captures: BubbleCapture[] = [];
  for(const bubble of bubbles) {
    const content = bubble.isConnected && !busy?.(bubble) ? getContent(bubble) : undefined;
    if(!content) {
      continue;
    }

    const rect = content.getBoundingClientRect();
    // off the screen: it just changes
    if(rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) {
      continue;
    }

    // a change is shown at best: one that cannot be read (a picture that cannot be taken) is just made
    try {
      captures.push(captureBubble(bubble, content, rect, motion, replacing, textOf?.(bubble) ?? true));
    } catch{}
  }

  if(!captures.length) {
    return;
  }

  const neighbours = motion ? captureNeighbours(container, containerRect, captures) : new Map<HTMLElement, number>();
  return new BubbleTransition(captures, neighbours, container, motion);
}
