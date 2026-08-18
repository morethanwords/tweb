/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * Text highlighting for arbitrary rendered DOM — search matches in bubbles and chat-list rows,
 * the quoted part of a replied-to message, …
 *
 * The matched text is described by live `Range`s over the container's text nodes, so entities,
 * custom emoji, spoilers, code blocks and translations stay untouched and a match that wraps
 * over several lines is still a single range. Two ways to paint them:
 *
 * - default: the CSS Custom Highlight API — ranges registered under a global `Highlight`
 *   (`CSS.highlights`) and styled by `::highlight(<name>)` rules (see
 *   `scss/partials/_textHighlight.scss`). Nothing is inserted into the DOM, but browsers paint
 *   only glyph-high boxes, which leaves gaps between wrapped lines;
 * - `lineBoxes`: an absolutely positioned overlay inside the container with one box per line,
 *   stretched to the full line height — a contiguous block like a text selection. Needs a
 *   positioned container that paints its background below its text.
 *
 * A highlight re-finds its text whenever the container mutates (translation swap, re-render …)
 * or is re-laid out, and is dropped automatically once its container has left the document for
 * good, so callers that cannot easily track the lifetime of their element do not have to.
 */

import IS_TEXT_HIGHLIGHT_SUPPORTED from '@environment/textHighlightSupport';
import {animateValue} from '@helpers/animateValue';
import liteMode from '@helpers/liteMode';
import throttleWithRaf from '@helpers/schedulers/throttleWithRaf';
import escapeRegExp from '@helpers/string/escapeRegExp';

export type TextHighlightMatch = {
  /** server-search-like: case-insensitive, every query word matched at a word start */
  type: 'search',
  query: string
} | {
  /** exact text (a reply quote), the occurrence closest to `offset` wins */
  type: 'quote',
  text: string,
  offset?: number
};

export type TextHighlightOptions = {
  container: HTMLElement,
  match: TextHighlightMatch,
  /** selector of subtrees to leave alone (message time, reactions, …) */
  skip?: string,
  /** re-find the text when the container mutates (default: `true`) */
  observe?: boolean,
  /**
   * Paint full line boxes through a DOM overlay prepended to `container` instead of the
   * glyph-high `::highlight()` boxes. The container must be positioned (the overlay is
   * `position: absolute` at `z-index: -1`, i.e. below the text and above the background of the
   * nearest stacking context) — true for a bubble's `.message`.
   */
  lineBoxes?: boolean,
  /**
   * `lineBoxes` only — appear the way iOS does it: the whole text of the container is selected
   * first, holds a moment, then the selection narrows down to the match. Skipped when
   * animations are off.
   */
  animateIn?: boolean
};

/** a painted line box, relative to the overlay's origin */
export type TextLineBox = {
  left: number,
  top: number,
  width: number,
  height: number
};

export interface TextHighlight {
  /** whether the last (re)application found anything to paint */
  readonly found: boolean;
  /** fade the highlight out and dispose it afterwards */
  fadeOut(duration?: number): void;
  dispose(): void;
}

export type TextSpan = [start: number, end: number];

type TextSegment = {
  node: Node,
  start: number,
  end: number,
  /** an element standing for its text (emoji image, custom emoji): ranges snap around it */
  atomic: boolean
};

const HIGHLIGHT_NAMES: {[type in TextHighlightMatch['type']]: string} = {
  search: 'tg-search',
  quote: 'tg-quote'
};

// a quote must win over a search match painted in the same message
const HIGHLIGHT_PRIORITIES: {[type in TextHighlightMatch['type']]: number} = {
  search: 1,
  quote: 2
};

/** inherited by `::highlight()` / read by the overlay from the container, animated by `fadeOut` */
const OPACITY_PROPERTY = '--text-highlight-opacity';
const FADE_DURATION = 400;

const OVERLAY_CLASS = 'text-highlight-overlay';
const OVERLAY_BOX_CLASS = 'text-highlight-overlay-box';
/** `animateIn` overlay states: the intro is on / the whole-text selection is still transparent / narrowing */
const OVERLAY_INTRO_CLASS = 'is-intro';
const OVERLAY_APPEARING_CLASS = 'is-appearing';
const OVERLAY_NARROWING_CLASS = 'is-narrowing';
/** hairline gaps between consecutive line boxes (rounding, mixed inline heights) get closed */
const LINE_BOX_SNAP = 3;
/** `animateIn`: the whole-text selection fades in (must match the transition in scss) … */
const NARROW_APPEAR = 200;
/** … stays for this long … */
const NARROW_HOLD = 300;
/** … then narrows down to the match over this long (must match the transition in scss) */
const NARROW_DURATION = 400;

/** icons are text glyphs in a private-use range — never part of the searchable text */
const DEFAULT_SKIP = `.tgico, .${OVERLAY_CLASS}`;

const WORD_CHARACTER = '\\p{L}\\p{N}\\p{M}';
const WORD_START = `(?<![${WORD_CHARACTER}])`;

/** collects the visible text of `root` together with the DOM positions it came from */
export function extractText(root: HTMLElement, skip = DEFAULT_SKIP) {
  const segments: TextSegment[] = [];
  let text = '';

  const push = (node: Node, value: string, atomic: boolean) => {
    if(!value) {
      return;
    }

    segments.push({node, start: text.length, end: text.length + value.length, atomic});
    text += value;
  };

  const visit = (node: Node) => {
    if(node.nodeType === Node.TEXT_NODE) {
      push(node, (node as Text).data, false);
      return;
    }

    if(node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    if(element.matches(skip)) {
      return;
    }

    // * emoji images and custom emoji carry their text as `alt` / `data-sticker-emoji`
    // * (same convention as `getRichElementValue`)
    const alt = element.dataset.stickerEmoji || (element as HTMLImageElement).alt;
    if(alt) {
      push(element, alt, true);
      return;
    }

    for(let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  };

  visit(root);
  return {text, segments};
}

function execAll(regExp: RegExp, text: string) {
  const spans: TextSpan[] = [];
  let match: RegExpExecArray;
  while((match = regExp.exec(text)) !== null) {
    if(!match[0].length) { // * safety against zero-length loops
      ++regExp.lastIndex;
      continue;
    }

    spans.push([match.index, match.index + match[0].length]);
  }

  return spans;
}

function mergeSpans(spans: TextSpan[]) {
  spans.sort((a, b) => a[0] - b[0]);
  const merged: TextSpan[] = [];
  for(const span of spans) {
    const last = merged[merged.length - 1];
    if(last && span[0] < last[1]) {
      last[1] = Math.max(last[1], span[1]);
    } else {
      merged.push([span[0], span[1]]);
    }
  }

  return merged;
}

/**
 * What the server search matched: the whole query as a phrase, otherwise every query word as
 * a word prefix (extended to the end of the word it starts, so "hel" lights up "hello"). Falls
 * back to shorter prefixes of a word — down to half of it — the way tdesktop does.
 */
export function findSearchSpans(text: string, query: string): TextSpan[] {
  query = query.trim();
  if(!query || !text) {
    return [];
  }

  const phrase = execAll(new RegExp(`${WORD_START}${escapeRegExp(query)}(?![${WORD_CHARACTER}])`, 'giu'), text);
  if(phrase.length) {
    return mergeSpans(phrase);
  }

  const spans: TextSpan[] = [];
  const words = query.split(new RegExp(`[^${WORD_CHARACTER}]+`, 'u')).filter(Boolean);
  for(const word of words) {
    const minLength = Math.ceil(word.length / 2);
    for(let length = word.length; length >= minLength; --length) {
      const prefix = escapeRegExp(word.slice(0, length));
      const found = execAll(new RegExp(`${WORD_START}${prefix}[${WORD_CHARACTER}]*`, 'giu'), text);
      if(found.length) {
        spans.push(...found);
        break;
      }
    }
  }

  return mergeSpans(spans);
}

function findNearest(text: string, needle: string, hint: number): TextSpan | undefined {
  hint = Math.max(0, Math.min(hint, text.length));
  const after = text.indexOf(needle, hint);
  const before = text.lastIndexOf(needle, hint);
  if(after === -1 && before === -1) {
    return;
  }

  const start = after === -1 ? before :
    before === -1 ? after :
      (hint - before <= after - hint ? before : after);
  return [start, start + needle.length];
}

/**
 * The quote is a verbatim slice of the message text, `offset` is where it started there. The
 * rendered text may differ slightly (dropped line breaks around block quotes, media captions
 * preceded by a file name …), hence the nearest occurrence to the offset and a
 * whitespace-insensitive retry.
 */
export function findQuoteSpan(text: string, quote: string, offset = 0): TextSpan | undefined {
  if(!quote || !text) {
    return;
  }

  const exact = findNearest(text, quote, offset);
  if(exact) {
    return exact;
  }

  const needle = quote.replace(/\s+/g, '');
  if(!needle) {
    return;
  }

  // * strip all whitespace, remembering where every kept character came from
  const map: number[] = [];
  let stripped = '';
  let strippedHint = 0;
  for(let i = 0; i < text.length; ++i) {
    if(i === offset) {
      strippedHint = stripped.length;
    }

    if(!/\s/.test(text[i])) {
      map.push(i);
      stripped += text[i];
    }
  }

  if(offset >= text.length) {
    strippedHint = stripped.length;
  }

  const found = findNearest(stripped, needle, strippedHint);
  return found && [map[found[0]], map[found[1] - 1] + 1];
}

export function findSpans(text: string, match: TextHighlightMatch): TextSpan[] {
  if(match.type === 'search') {
    return findSearchSpans(text, match.query);
  }

  const span = findQuoteSpan(text, match.text, match.offset);
  return span ? [span] : [];
}

/** turns text spans into DOM ranges over the container's text */
export function computeRanges(container: HTMLElement, match: TextHighlightMatch, skip?: string) {
  const {text, segments} = extractText(container, skip ? `${DEFAULT_SKIP}, ${skip}` : DEFAULT_SKIP);
  const ranges: Range[] = [];
  if(!segments.length) {
    return ranges;
  }

  let index = 0;
  for(const [start, end] of findSpans(text, match)) {
    while(index < segments.length && segments[index].end <= start) {
      ++index;
    }

    const startSegment = segments[index];
    if(!startSegment) {
      break;
    }

    let endIndex = index;
    while(segments[endIndex].end < end && endIndex + 1 < segments.length) {
      ++endIndex;
    }

    const endSegment = segments[endIndex];
    const range = new Range();
    if(startSegment.atomic) range.setStartBefore(startSegment.node);
    else range.setStart(startSegment.node, start - startSegment.start);
    if(endSegment.atomic) range.setEndAfter(endSegment.node);
    else range.setEnd(endSegment.node, Math.min(end, endSegment.end) - endSegment.start);
    ranges.push(range);
  }

  return ranges;
}

/**
 * Turns the ranges' fragment rects into per-line boxes stretched to the line height (glyph rects
 * are only font-high; the missing half-leading is added on both sides), unioned along a line
 * and expressed relative to `origin`.
 */
export function computeLineBoxes(ranges: Range[], origin: DOMRect, lineHeight: number): TextLineBox[] {
  type Edges = {left: number, right: number, top: number, bottom: number};
  const fragments: Edges[] = [];
  for(const range of ranges) {
    for(const rect of range.getClientRects()) {
      if(!rect.width || !rect.height) { // * empty lines and collapsed points
        continue;
      }

      const extra = Math.max(0, lineHeight - rect.height) / 2;
      fragments.push({left: rect.left, right: rect.right, top: rect.top - extra, bottom: rect.bottom + extra});
    }
  }

  fragments.sort((a, b) => (a.top - b.top) || (a.left - b.left));

  // * same line = vertical overlap of at least half of the smaller one; on a line, fragments that
  // * touch or overlap horizontally merge into one box (separate matches stay separate)
  const boxes: Edges[] = [];
  for(const fragment of fragments) {
    const last = boxes[boxes.length - 1];
    if(last) {
      const overlap = Math.min(last.bottom, fragment.bottom) - Math.max(last.top, fragment.top);
      const sameLine = overlap >= Math.min(last.bottom - last.top, fragment.bottom - fragment.top) / 2;
      if(sameLine && fragment.left <= last.right + 1 && fragment.right >= last.left - 1) {
        last.left = Math.min(last.left, fragment.left);
        last.right = Math.max(last.right, fragment.right);
        last.top = Math.min(last.top, fragment.top);
        last.bottom = Math.max(last.bottom, fragment.bottom);
        continue;
      }
    }

    boxes.push({...fragment});
  }

  for(let i = 1; i < boxes.length; ++i) {
    const previous = boxes[i - 1], box = boxes[i];
    const gap = box.top - previous.bottom;
    if(gap > 0 && gap < LINE_BOX_SNAP) {
      const middle = (previous.bottom + box.top) / 2;
      previous.bottom = box.top = middle;
    }
  }

  return boxes.map((box) => ({
    left: box.left - origin.left,
    top: box.top - origin.top,
    width: box.right - box.left,
    height: box.bottom - box.top
  }));
}

/** a range over all the searchable text of the container (skipped subtrees excluded at the ends) */
export function computeFullRange(container: HTMLElement, skip?: string) {
  const {segments} = extractText(container, skip ? `${DEFAULT_SKIP}, ${skip}` : DEFAULT_SKIP);
  if(!segments.length) {
    return;
  }

  const first = segments[0], last = segments[segments.length - 1];
  const range = new Range();
  if(first.atomic) range.setStartBefore(first.node);
  else range.setStart(first.node, 0);
  if(last.atomic) range.setEndAfter(last.node);
  else range.setEnd(last.node, last.end - last.start);
  return range;
}

/**
 * Where every "whole text" line box goes when the selection narrows down to the match: onto the
 * first match box of its line, or collapsed onto the nearest edge of the match; match boxes that
 * no line box lands on (`extra`) fade in on their own.
 */
export function computeNarrowing(full: TextLineBox[], targets: TextLineBox[]) {
  const ends: TextLineBox[] = [];
  const claimed = new Set<TextLineBox>();
  const first = targets[0];
  for(const box of full) {
    const bottom = box.top + box.height;
    const onLine = targets.find((target) => {
      const overlap = Math.min(bottom, target.top + target.height) - Math.max(box.top, target.top);
      return overlap >= Math.min(box.height, target.height) / 2;
    });

    if(onLine) {
      claimed.add(onLine);
      ends.push(onLine);
      continue;
    }

    // * collapse onto the bottom edge of the last match above, or the top edge of the first one
    const above = [...targets].reverse().find((target) => target.top < box.top);
    const anchor = above || first;
    const edge = above ? above.top + above.height : first.top;
    ends.push({left: anchor.left, top: edge, width: anchor.width, height: 0});
  }

  return {ends, extra: targets.filter((target) => !claimed.has(target))};
}

function getRegistryHighlight(type: TextHighlightMatch['type']) {
  const name = HIGHLIGHT_NAMES[type];
  let highlight = CSS.highlights.get(name);
  if(!highlight) {
    highlight = new Highlight();
    highlight.priority = HIGHLIGHT_PRIORITIES[type];
    CSS.highlights.set(name, highlight);
  }

  return highlight;
}

// * every live highlight, so the ones whose container silently left the document (a cleared
// * search list, an ejected bubble) can be released without a hook at each call site
const instances = new Set<TextHighlighter>();
const SWEEP_INTERVAL = 30e3;
// * a container may be detached only briefly (virtual lists reattach rows) — give it time
const DETACHED_GRACE = 10e3;
let sweepTimeout: number;

function scheduleSweep() {
  if(sweepTimeout || !instances.size) {
    return;
  }

  sweepTimeout = window.setTimeout(() => {
    sweepTimeout = undefined;
    const now = Date.now();
    for(const instance of instances) {
      if(instance.container.isConnected) {
        instance.detachedAt = undefined;
      } else if(!instance.detachedAt) {
        instance.detachedAt = now;
      } else if(now - instance.detachedAt >= DETACHED_GRACE) {
        instance.dispose();
      }
    }

    scheduleSweep();
  }, SWEEP_INTERVAL);
}

class TextHighlighter implements TextHighlight {
  public found = false;
  public detachedAt: number;
  public readonly container: HTMLElement;

  /** `::highlight()` mode: the registry entry the ranges are added to */
  private readonly highlight: Highlight;
  /** `lineBoxes` mode: the overlay the boxes are painted into */
  private overlay: HTMLElement;
  private ranges: Range[] = [];
  private mutationObserver: MutationObserver;
  private resizeObserver: ResizeObserver;
  private cancelFade: () => void;
  /** `animateIn`: still to be played by the first paint */
  private introPending: boolean;
  private introTimeout: number;
  private disposed = false;

  constructor(private readonly options: TextHighlightOptions) {
    this.container = options.container;
    if(options.lineBoxes) {
      this.overlay = document.createElement('span');
      this.overlay.className = OVERLAY_CLASS;
      this.overlay.setAttribute('aria-hidden', 'true');
      this.container.prepend(this.overlay);
      this.introPending = !!options.animateIn && liteMode.isAvailable('animations');
    } else {
      this.highlight = getRegistryHighlight(options.match.type);
    }

    this.apply();

    const reapply = throttleWithRaf(() => this.apply());
    if(options.observe !== false) {
      this.mutationObserver = new MutationObserver((records) => {
        // * painting the overlay mutates the container too — do not chase our own changes
        if(records.some((record) => !this.isOwnMutation(record))) {
          reapply();
        }
      });
      this.mutationObserver.observe(this.container, {childList: true, characterData: true, subtree: true});
    }

    if(this.overlay) {
      // * boxes are geometry — a narrower container wraps the lines differently. The initial
      // * notification (and any that does not change the size) must not repaint: it would cut
      // * the `animateIn` intro short.
      let lastSize: string;
      this.resizeObserver = new ResizeObserver(([entry]) => {
        const size = `${entry.contentRect.width}x${entry.contentRect.height}`;
        if(lastSize !== undefined && lastSize !== size) {
          reapply();
        }

        lastSize = size;
      });
      this.resizeObserver.observe(this.container);
    }

    instances.add(this);
    scheduleSweep();
  }

  private isOwnMutation(record: MutationRecord) {
    const {overlay} = this;
    if(!overlay) {
      return false;
    }

    if(record.target === overlay || overlay.contains(record.target)) {
      return true;
    }

    return record.type === 'childList' &&
      [...record.addedNodes, ...record.removedNodes].every((node) => node === overlay);
  }

  private clearRanges() {
    if(this.highlight) {
      for(const range of this.ranges) {
        this.highlight.delete(range);
      }
    }

    this.ranges = [];
    this.found = false;
  }

  private apply() {
    if(this.disposed) {
      return;
    }

    this.clearRanges();
    this.clearIntro();
    const {container, match, skip} = this.options;
    this.ranges = computeRanges(container, match, skip);
    this.found = this.ranges.length > 0;

    if(!this.overlay) {
      for(const range of this.ranges) {
        this.highlight.add(range);
      }

      return;
    }

    const boxes = this.computeLineBoxes(this.ranges);
    if(this.introPending) {
      this.introPending = false;
      const fullRange = boxes.length && computeFullRange(container, skip);
      const full = fullRange ? this.computeLineBoxes([fullRange]) : [];
      if(full.length) {
        this.narrowIn(full, boxes);
        return;
      }
    }

    this.paintLineBoxes(boxes);
  }

  private computeLineBoxes(ranges: Range[]) {
    const lineHeight = parseFloat(getComputedStyle(this.container).lineHeight) || 0;
    return computeLineBoxes(ranges, this.overlay.getBoundingClientRect(), lineHeight);
  }

  private createLineBox(box: TextLineBox) {
    const element = document.createElement('span');
    element.className = OVERLAY_BOX_CLASS;
    element.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`;
    return element;
  }

  private paintLineBoxes(boxes: TextLineBox[]) {
    this.overlay.replaceChildren(...boxes.map((box) => this.createLineBox(box)));
  }

  /**
   * The whole text is selected (fading in), holds a moment, then every line box slides / scales
   * onto the match (transforms only, so nothing is laid out again); the plain match boxes take
   * over once the transition is through.
   */
  private narrowIn(full: TextLineBox[], targets: TextLineBox[]) {
    const {overlay} = this;
    const elements = full.map((box) => this.createLineBox(box));
    // * the transparent start state is committed while nothing transitions yet — otherwise the
    // * jump to it would itself animate and the fade-in would reverse from ~1
    overlay.classList.add(OVERLAY_APPEARING_CLASS);
    overlay.replaceChildren(...elements);
    void overlay.offsetWidth;
    overlay.classList.add(OVERLAY_INTRO_CLASS);
    overlay.classList.remove(OVERLAY_APPEARING_CLASS);

    this.introTimeout = window.setTimeout(() => {
      const {ends, extra} = computeNarrowing(full, targets);
      const extraElements = extra.map((box) => {
        const element = this.createLineBox(box);
        element.style.opacity = '0';
        return element;
      });
      overlay.append(...extraElements);
      void overlay.offsetWidth; // * commit the start state before transitioning
      overlay.classList.add(OVERLAY_NARROWING_CLASS);

      elements.forEach((element, i) => {
        const from = full[i], to = ends[i];
        element.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) ` +
          `scale(${to.width / from.width}, ${to.height / from.height})`;
      });
      extraElements.forEach((element) => element.style.opacity = '');

      this.introTimeout = window.setTimeout(() => {
        this.introTimeout = undefined;
        overlay.classList.remove(OVERLAY_INTRO_CLASS, OVERLAY_NARROWING_CLASS);
        this.paintLineBoxes(targets);
      }, NARROW_DURATION);
    }, NARROW_APPEAR + NARROW_HOLD);
  }

  private clearIntro() {
    if(this.introTimeout) {
      clearTimeout(this.introTimeout);
      this.introTimeout = undefined;
    }

    this.overlay?.classList.remove(OVERLAY_INTRO_CLASS, OVERLAY_APPEARING_CLASS, OVERLAY_NARROWING_CLASS);
  }

  private stopObserving() {
    this.mutationObserver?.disconnect();
    this.mutationObserver = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  public fadeOut(duration = FADE_DURATION) {
    if(this.disposed || this.cancelFade) {
      return;
    }

    if(!liteMode.isAvailable('animations')) {
      this.dispose();
      return;
    }

    // * the text is going away, no point in following its container anymore
    this.stopObserving();

    this.cancelFade = animateValue(1, 0, duration, (value) => {
      this.container.style.setProperty(OPACITY_PROPERTY, '' + value);
    }, {onEnd: () => this.dispose()});
  }

  public dispose() {
    if(this.disposed) {
      return;
    }

    this.disposed = true;
    this.clearRanges();
    this.clearIntro();
    this.stopObserving();
    this.cancelFade?.();
    this.cancelFade = undefined;
    this.container.style.removeProperty(OPACITY_PROPERTY);
    this.overlay?.remove();
    this.overlay = undefined;
    instances.delete(this);
  }
}

const NOOP_HIGHLIGHT: TextHighlight = {
  found: false,
  fadeOut: () => {},
  dispose: () => {}
};

/**
 * Highlights `match` inside `container`. Returns a handle: call `dispose()` (or `fadeOut()`)
 * once the highlight should go; forgetting it is not fatal — a highlight whose container has
 * been removed from the document is collected on its own.
 */
export default function highlightText(options: TextHighlightOptions): TextHighlight {
  if(!options.lineBoxes && !IS_TEXT_HIGHLIGHT_SUPPORTED) {
    return NOOP_HIGHLIGHT;
  }

  return new TextHighlighter(options);
}
