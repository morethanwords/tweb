/*
 * The outgoing bubbles' gradient (`@helpers/outgoingMessageGradient`) drawn for a whole chat at once: one piece of it,
 * fixed to the chat's frame as a bubble's is, under the list (`.bubbles-gradient`), cut out by the shapes of the
 * outgoing bubbles in it and of their tails (a `clip-path` of them all). A bubble's own piece is a layer of the
 * compositor's, what of the bubble is drawn over it is one more and a tail's cut a pass of the GPU's: a chat of a
 * gradient layerized, committed and drew two or three of them for every bubble in sight on every frame of a scroll.
 * This is one for them all, and draws a bubble scrolled into sight as it comes, which the main thread did for a piece
 * of its own.
 *
 * A bubble is cut out where it is laid out and as it is painted there, so one that is not is left out and shows a
 * piece of its own (`is-gradient-joined` marks those cut out): one moved by a transform (whose piece is laid out where
 * it moves to, `holdOutgoingMessageGradient`), faded, hidden (a flight's), whose gradient gives way to a morph, under an
 * animation, or with what lies under its piece painted (its row's highlight or selection, a document's). The shapes
 * are read once a layout that may have changed them is done, before it is painted (a `ResizeObserver`'s turn): after a
 * resize of the list, of a day of it or of a bubble cut out, a bubble coming or going, a class or a style of one changed
 * (a move starting or ending), the theme. Nothing is read while the chat scrolls.
 */

import {getAppWindow, onAppWindowChange} from '@helpers/appWindow';
import {hasOutgoingMessageGradient, subscribeOutgoingMessageGradient} from '@helpers/outgoingMessageGradient';
import {getRadii, Radii} from '@components/chat/bubbleShape';

const JOINED_CLASS = 'is-gradient-joined';
// * the elements a bubble comes or goes in, and those whose class or style may move a bubble, fade it or paint under
// * its piece: a change of anything else in the list that matters changes a size too
const CONTAINER_CLASSES = ['bubbles-inner', 'bubbles-date-group', 'bubbles-group'];
const PART_CLASSES = ['bubble', 'bubble-content-wrapper', 'bubble-content', 'bubble-gradient', 'bubble-tail', 'document-container'];
// * of a bubble or what it is in: its piece laid out where it moves to (a swipe, a move aside, a ladder's zoom), or its
// * row painted under it (a highlight, the selection, the context menu's target, each as it fades out too)
const OWN_CLASSES = ['is-gesturing-reply', 'is-gradient-held', 'zoom-fade', 'can-zoom-fade', 'is-highlighted', 'is-selected', 'is-active', 'is-active-backwards'];
const OWN_SELECTOR = OWN_CLASSES.map((name) => '.' + name).join(', ');
// * a part of a bubble that paints under its piece, a document's selection in an album of them
const OWN_PART_SELECTOR = '.document-container:is(.is-highlighted, .is-selected, .is-active, .is-active-backwards)';

const round = (value: number) => Math.round(value * 100) / 100;

// * an SVG path (a tail's shape, as the stylesheet cuts it) moved by `x`, `y`: what of its commands is absolute. And
// * the way it goes round, by the area of the points its commands end at: 1 the way of the clock on the page, -1 the
// * other (a right-to-left tail is the mirror of a left-to-right one)
const PATH_TOKENS = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;
// * how many numbers each command takes at a time
const PATH_ARGUMENTS: {[command: string]: number} = {m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0};
export function movePath(path: string, x: number, y: number) {
  const out: string[] = [];
  const points: [number, number][] = [];
  let command = '', index = 0, first = true;
  let [atX, atY] = [0, 0], [startX, startY] = [0, 0];
  const args: number[] = [];
  for(const [, letter, number] of path.matchAll(PATH_TOKENS)) {
    if(letter) {
      // * a path's first move is where it starts, relative or not
      if(command) first = false;
      command = letter;
      index = 0;
      out.push(letter);
      if(letter === 'z' || letter === 'Z') [atX, atY] = [startX, startY];
      continue;
    }

    let value = +number;
    const lower = command.toLowerCase();
    const count = PATH_ARGUMENTS[lower];
    const at = index % count;
    const absolute = command !== lower || (lower === 'm' && first && index < 2);
    args[at] = value;
    if(absolute) {
      if(lower === 'h') value += x;
      else if(lower === 'v') value += y;
      else if(lower === 'a') {
        if(at === 5) value += x;
        else if(at === 6) value += y;
      } else value += at % 2 ? y : x;
    }

    out.push((/[\d.]$/.test(out[out.length - 1] || '') ? ' ' : '') + round(value));
    ++index;

    // * where it is once the command's numbers are there (unmoved: the way round is the same anywhere)
    if(at === count - 1) {
      const relative = !absolute;
      if(lower === 'h') atX = relative ? atX + args[0] : args[0];
      else if(lower === 'v') atY = relative ? atY + args[0] : args[0];
      else {
        const [endX, endY] = [args[count - 2], args[count - 1]];
        [atX, atY] = relative ? [atX + endX, atY + endY] : [endX, endY];
      }

      if(lower === 'm' && index === 2) [startX, startY] = [atX, atY];
      points.push([atX, atY]);
    }
  }

  let area = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  });

  return {path: out.join(''), way: area < 0 ? -1 : 1};
}

export type OutgoingGradientShape = {
  left: number,
  top: number,
  width: number,
  height: number,
  // * as the bubble's corners are drawn: made smaller together where they do not fit
  radii: Radii,
  tail?: {left: number, top: number, path: string}
};

// * the shapes cut out together: a bubble's drawn the way round its tail goes, so that where they meet is in (and
// * bubbles do not meet)
export function makeOutgoingGradientPath(shapes: OutgoingGradientShape[]) {
  return shapes.map(({left: x, top: y, width: w, height: h, radii: {topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl}, tail}) => {
    const moved = tail && movePath(tail.path, tail.left, tail.top);
    const arc = (r: number, toX: number, toY: number, way: number) => `A${r} ${r} 0 0 ${way > 0 ? 1 : 0} ${round(toX)} ${round(toY)}`;
    const start = `M${round(x + tl)} ${round(y)}`;
    const rect = moved?.way < 0 ?
      `${start}${arc(tl, x, y + tl, -1)}V${round(y + h - bl)}${arc(bl, x + bl, y + h, -1)}H${round(x + w - br)}` +
        `${arc(br, x + w, y + h - br, -1)}V${round(y + tr)}${arc(tr, x + w - tr, y, -1)}Z` :
      `${start}H${round(x + w - tr)}${arc(tr, x + w, y + tr, 1)}V${round(y + h - br)}${arc(br, x + w - br, y + h, 1)}` +
        `H${round(x + bl)}${arc(bl, x, y + h - bl, 1)}V${round(y + tl)}${arc(tl, x + tl, y, 1)}Z`;
    return moved ? rect + moved.path : rect;
  }).join('');
}

const hasClass = (element: Element, classes: string[]) => classes.some((name) => element.classList?.contains(name));
// * the classes one of the two lists has and the other has not
const changedClasses = (was: string, is: string) => {
  const [before, after] = [was, is].map((className) => new Set((className || '').split(/\s+/).filter(Boolean)));
  return [...before, ...after].filter((name) => before.has(name) !== after.has(name));
};

export default class OutgoingGradientUnion {
  private element: HTMLDivElement;
  // * what is resized to have the shapes read after the next layout, which a change of a class or a style does not
  // * resize anything for
  private sentinel: HTMLDivElement;
  private inner: HTMLElement;
  private resizeObserver: ResizeObserver;
  private mutationObserver: MutationObserver;
  private sized = new Set<Element>();
  private joined = new Set<HTMLElement>();
  private waited = new WeakSet<Animation>();
  private path = '';
  private requested = false;
  private flip = false;
  private unsubscribes: VoidFunction[];

  constructor() {
    const element = this.element = document.createElement('div');
    element.classList.add('bubbles-gradient', 'is-empty');
    element.setAttribute('aria-hidden', 'true');
    const sentinel = this.sentinel = document.createElement('div');
    sentinel.classList.add('bubbles-gradient-sentinel');
    element.append(sentinel);
    this.unsubscribes = [
      subscribeOutgoingMessageGradient(this.request),
      // * observers of the window the chat is in, which a Picture-in-Picture one takes it to
      onAppWindowChange(this.connect)
    ];
  }

  /** the list it draws for: put under it, and nothing cut out of one before it */
  public setInner(inner: HTMLElement) {
    this.unjoin();
    this.inner = inner;
    inner.prepend(this.element);
    this.connect();
  }

  public destroy() {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.unjoin();
    this.element.remove();
    this.inner = undefined;
  }

  private connect = () => {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.sized.clear();
    if(!this.inner) return;

    const win = getAppWindow() as Window & typeof globalThis;
    this.resizeObserver = new win.ResizeObserver(this.onResize);
    this.mutationObserver = new win.MutationObserver(this.onMutations);
    this.resizeObserver.observe(this.sentinel);
    this.observeSize(this.inner);
    this.mutationObserver.observe(this.inner, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true});
    // * the direction a bubble stands on, which moves it with nothing resized
    this.mutationObserver.observe(win.document.documentElement, {attributes: true, attributeFilter: ['dir']});
    this.request();
  };

  private observeSize(element: Element) {
    if(this.sized.has(element)) return;
    this.sized.add(element);
    this.resizeObserver.observe(element);
  }

  private onMutations = (records: MutationRecord[]) => {
    if(records.some(this.matters)) {
      this.request();
    }
  };

  private matters = ({type, target, attributeName, oldValue, addedNodes, removedNodes}: MutationRecord) => {
    if(target === this.element || target === this.sentinel) return false;
    if(type === 'attributes') {
      const element = target as Element;
      if(element === element.ownerDocument.documentElement) return true;
      const changed = attributeName === 'class' ? changedClasses(oldValue, element.getAttribute('class')) : undefined;
      if(hasClass(element, PART_CLASSES)) {
        // * of an outgoing bubble: one of another moves none of them with nothing resized (a date held at the top of
        // * the list marks itself as it scrolls)
        if(!element.closest('.bubble')?.classList.contains('is-out') && !changed?.includes('is-out')) return false;
        // * a class may hide it or give way to a move (one of a module's own), but its own mark of the bubbles it cuts
        // * out is no change of theirs
        return !changed || changed.some((name) => name !== JOINED_CLASS);
      }

      // * of what bubbles are in, only the classes of the moves and the rows (a list scrolled marks it)
      return hasClass(element, CONTAINER_CLASSES) && (!changed || changed.some((name) => OWN_CLASSES.includes(name)));
    }

    // * its own coming back under the list is no change of the list's
    return hasClass(target as Element, CONTAINER_CLASSES) &&
      [...addedNodes, ...removedNodes].some((node) => node !== this.element);
  };

  /** the shapes are read after the next layout */
  private request = () => {
    const {inner, element} = this;
    if(!inner) return;
    // * a list cleared takes it out
    if(element.parentElement !== inner) {
      inner.prepend(element);
    }

    if(this.requested) return;
    this.requested = true;
    this.sentinel.style.width = (this.flip = !this.flip) ? '1px' : '0px';
  };

  private onResize = () => {
    this.requested = false;
    this.update();
  };

  private unjoin() {
    this.joined.forEach((bubble) => bubble.classList.remove(JOINED_CLASS));
    this.joined.clear();
  }

  private update() {
    const {inner, element} = this;
    // * a list not shown: its shapes are read when it is, which resizes it
    if(!inner?.isConnected || !element.offsetParent) return;

    const joined = new Set<HTMLElement>();
    const shapes: OutgoingGradientShape[] = [];
    if(hasOutgoingMessageGradient(element)) {
      const box = element.getBoundingClientRect();
      // * the shapes are in its own pixels, which a transform of the chat's (a zoom of a column) scales on the page
      const scale = box.width / parseFloat(getComputedStyle(element).width) || 1;
      const unscale = Math.abs(scale - 1) < 1e-3 ? 1 : 1 / scale;
      // * what bubbles share (a group, a day) is looked at once
      const shared = new Map<HTMLElement, boolean>();
      for(const bubble of inner.querySelectorAll<HTMLElement>('.bubble.is-out:not(.just-media)')) {
        const shape = this.getShape(bubble, box, unscale, shared);
        if(shape) {
          shapes.push(shape);
          joined.add(bubble);
        }
      }
    }

    const left: HTMLElement[] = [];
    for(const bubble of this.joined) {
      if(!joined.has(bubble)) {
        bubble.classList.remove(JOINED_CLASS);
        left.push(bubble);
      }
    }

    this.keepMove(left);

    for(const bubble of joined) {
      if(!this.joined.has(bubble)) {
        bubble.classList.add(JOINED_CLASS);
      }
    }

    this.joined = joined;

    // * what moves a shape with nothing of it resized is watched too: each part of the list (a day), whose height any
    // * message in it changes, as the list's own may not change (a short one stands at its bottom). A shape's size is
    // * watched for as long as it is cut out
    const parts = new Set<Element>(inner.children);
    parts.delete(element);
    for(const sized of this.sized) {
      if(sized !== inner && !parts.has(sized) && !(sized.parentElement && joined.has(sized.closest('.bubble')))) {
        this.sized.delete(sized);
        this.resizeObserver.unobserve(sized);
      }
    }

    parts.forEach((part) => this.observeSize(part));
    joined.forEach((bubble) => this.observeSize(this.getContent(bubble)));

    const path = makeOutgoingGradientPath(shapes);
    if(path !== this.path) {
      this.path = path;
      element.style.clipPath = path ? `path("${path}")` : '';
      element.classList.toggle('is-empty', !path);
    }
  }

  private getContent(bubble: HTMLElement) {
    return bubble.querySelector<HTMLElement>(':scope > .bubble-content-wrapper > .bubble-content.has-gradient');
  }

  // * the bubble's shape where it is laid out, if it is drawn there as it is
  private getShape(bubble: HTMLElement, box: DOMRect, unscale: number, shared: Map<HTMLElement, boolean>): OutgoingGradientShape {
    const {inner} = this;
    const content = this.getContent(bubble);
    const piece = content?.querySelector<HTMLElement>(':scope > .bubble-gradient');
    const own = content?.closest(OWN_SELECTOR);
    // * a copy of a bubble in one (what a change is drawn with) is not one of the list's
    if(!piece || (own && inner.contains(own)) || content.querySelector(OWN_PART_SELECTOR) || bubble.parentElement.closest('.bubble')) {
      return;
    }

    // * a morph's: the gradient gives way to the shape that changes
    if(getComputedStyle(piece).visibility === 'hidden') {
      return;
    }

    // * hidden, or painting a background of its own: its piece was drawn over that, the cut out one would be under it
    const style = getComputedStyle(content);
    if(style.visibility === 'hidden' || style.backgroundImage !== 'none' || !/^rgba\(.*, 0\)$|^transparent$/.test(style.backgroundColor)) {
      return;
    }

    for(let element: HTMLElement = content; element && element !== inner; element = element.parentElement) {
      const isShared = element !== content && !element.classList.contains('bubble-content-wrapper') && element !== bubble;
      const known = isShared ? shared.get(element) : undefined;
      if(known === false) return;
      if(known) continue;

      // * moved, faded or under an animation: its piece goes with it, the cut out one would stay. Once an animation is
      // * over it is cut out again
      const animations = element.getAnimations();
      animations.forEach(this.waitFor);
      const elementStyle = element === content ? style : getComputedStyle(element);
      const drawn = !animations.length && elementStyle.transform === 'none' && +elementStyle.opacity === 1;
      if(isShared) shared.set(element, drawn);
      if(!drawn) return;
    }

    const rect = content.getBoundingClientRect();
    const [width, height] = [rect.width * unscale, rect.height * unscale];
    const shape: OutgoingGradientShape = {
      left: (rect.left - box.left) * unscale,
      top: (rect.top - box.top) * unscale,
      width,
      height,
      radii: getRadii(style, {width, height})
    };

    const tail = content.querySelector<HTMLElement>(':scope > .bubble-tail');
    const tailStyle = tail && getComputedStyle(tail);
    if(tailStyle && tailStyle.display !== 'none') {
      const path = tailStyle.clipPath.match(/^path\("([^"]+)"\)$/)?.[1];
      // * a tail is cut by the stylesheet's shape and not moved by a transform (`.bubble.is-out .bubble-tail`)
      if(!path || tailStyle.transform !== 'none') {
        return;
      }

      const tailRect = tail.getBoundingClientRect();
      shape.tail = {left: (tailRect.left - box.left) * unscale, top: (tailRect.top - box.top) * unscale, path};
    }

    return shape;
  }

  // * bubbles left out while the gradient moves on to its next phase (`advanceOutgoingMessageGradient`): their own pieces
  // * of the next one come up with the chat's, from where it is by now, and not at once at its end, as a transition does
  // * not run for what comes into being
  private keepMove(bubbles: HTMLElement[]) {
    // * a pseudo-element's are its subtree's
    const move = bubbles.length && this.element.getAnimations({subtree: true}).find((animation) => {
      return animation.playState === 'running' && (animation.effect as KeyframeEffect)?.pseudoElement === '::after';
    });
    if(!move) return;
    const effect = move.effect as KeyframeEffect;
    for(const bubble of bubbles) {
      bubble.querySelectorAll(':scope > .bubble-content-wrapper > .bubble-content > :is(.bubble-gradient, .bubble-tail)').forEach((piece) => {
        const animation = piece.animate(effect.getKeyframes(), {...effect.getTiming(), pseudoElement: '::after'});
        animation.currentTime = move.currentTime;
      });
    }
  }

  private waitFor = (animation: Animation) => {
    if(this.waited.has(animation)) return;
    this.waited.add(animation);
    animation.finished.then(this.request, this.request);
  };
}
