// tweb: the layout budget (UPSTREAM.md, item 14). A widget's DOM is laid out by the page it is in (a shadow root, or a
// frame on the page's thread), in one task nothing interrupts, and WebKit lays out a grid that is an item of a grid
// again for each pass its parent makes, two a level: 20 nested grids took it 3.2 s on a development VM, and the 30 of
// corpus/attacks/render-nested-grid never end, nor the page with them. The renderer counts, before anything lays the
// widget out, the boxes that layout makes afresh, every node once for each pass of the elements above it that may be
// grids — Σ 2^(those) — and stops the widget past the budget a native renderer keeps (twidget: 100,000 boxes laid out
// afresh, and 50 more per element). What may be a grid is read from the widget's declarations and matched by selector,
// never from a computed value: in a shadow root whose host is a size container a computed value is a layout in WebKit
// (and in Chromium once a rule depends on the container), the very one this has to come before.

/** The boxes one layout of a widget may make afresh: as many as a native renderer lays out (twidget's bound). */
export const LAYOUT_BOXES = 100_000;
/** And so many more for each of its nodes. */
export const LAYOUT_BOXES_PER_NODE = 50;
export const layoutBudget = (nodes: number) => LAYOUT_BOXES + LAYOUT_BOXES_PER_NODE * nodes;

/** The levels a count tells apart: a node below more grids than that is past any budget anyway (2^64 boxes). */
export const LAYOUT_LEVELS = 64;

/**
 * Whether a declared `display` may compute to a grid container. A value the declaration takes from elsewhere may be one:
 * a substitution (`var()`, `attr()`, `env()`; the sanitizer checks only what it sees) or a keyword that takes the
 * parent's or a lower layer's value.
 */
export function mayDisplayGrid(value: string): boolean {
  return /grid|\b(?:var|attr|env)\(|^\s*(?:inherit|revert-layer)\s*$/i.test(value);
}

/** Whether a declared `all` may bring a grid's display with it. */
export function mayAllGrid(value: string): boolean {
  return /\b(?:var|attr|env)\(|^\s*(?:inherit|revert-layer)\s*$/i.test(value);
}

/**
 * Whether declared animations may run anything (one of the @keyframes may set a display): an `animation-name` that is
 * not `none`, or an `animation` shorthand with a substitution in it, whose longhands CSSOM gives as empty strings
 * until the substitution is made.
 */
export function mayAnimate(name: string, shorthand: string): boolean {
  return !/^\s*(?:none\s*(?:,\s*none\s*)*)?$/i.test(name) || /\b(?:var|attr|env)\(/i.test(shorthand);
}

/**
 * Pseudo-classes that only the widget's DOM decides, which changes by ops alone: kept (the renderer counts again after
 * them). Not `:lang()` nor `:dir()`: an element without its own takes the page's, which the client changes as it runs.
 */
const STATIC_PSEUDO = new Set(['root', 'scope', 'empty', 'first-child', 'last-child', 'only-child', 'first-of-type',
  'last-of-type', 'only-of-type', 'nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type', 'defined', 'not']);
/** Pseudo-classes whose argument is a selector list matched as it is: widened inside. */
const LIST_PSEUDO = new Set(['is', 'where', 'has', 'matches', 'any', '-webkit-any', '-moz-any']);
/** Pseudo-elements in their legacy one-colon spelling. */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
/**
 * Attributes that change without an op: the renderer's own (the theme's variables and a held play state in `style`,
 * `data-tw-active` while pressed, `data-tw-frozen`) and a `<details>`' `open`, which a click toggles.
 */
const DYNAMIC_ATTRIBUTE = /^\[\s*(?:[\w*-]*\|)?(?:style|open|data-tw-[\w-]*)\s*(?:[~|^$*]?=|\])/i;

const IDENT_CHAR = /[\w-]/;

/** The end of the quoted string that starts at `from`. */
function stringEnd(s: string, from: number): number {
  const quote = s[from];
  let i = from + 1;
  while (i < s.length && s[i] !== quote) i += s[i] === '\\' ? 2 : 1;
  return Math.min(i + 1, s.length);
}

/** The end of the bracketed or parenthesized part that opens at `from`, strings and escapes inside skipped. */
function groupEnd(s: string, from: number): number {
  const open = s[from], close = open === '[' ? ']' : ')';
  let depth = 0;
  for (let i = from; i < s.length;) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '"' || c === "'") { i = stringEnd(s, i); continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i + 1;
    i++;
  }
  return s.length;
}

function widen(s: string): { out: string; dynamic: boolean } {
  let out = '';
  let dynamic = false;
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '\\') { out += s.slice(i, i + 2); i += 2; continue; }
    if (c === '"' || c === "'") { const end = stringEnd(s, i); out += s.slice(i, end); i = end; continue; }
    if (c === '[') {
      const end = groupEnd(s, i);
      const attribute = s.slice(i, end);
      if (DYNAMIC_ATTRIBUTE.test(attribute)) { out += ':is(*)'; dynamic = true; } else out += attribute;
      i = end;
      continue;
    }
    if (c !== ':') { out += c; i++; continue; }
    const element = s[i + 1] === ':';
    let j = i + (element ? 2 : 1);
    while (j < s.length && (IDENT_CHAR.test(s[j]) || s[j] === '\\')) j += s[j] === '\\' ? 2 : 1;
    const name = s.slice(i + (element ? 2 : 1), j).toLowerCase();
    let argument: string | null = null;
    if (s[j] === '(') {
      const end = groupEnd(s, j);
      argument = s.slice(j + 1, end - 1);
      j = end;
    }
    if (element || LEGACY_PSEUDO_ELEMENTS.has(name)) {
      // a pseudo-element's box is its element's child: the element stands in for it
      out += ':is(*)';
    } else if (LIST_PSEUDO.has(name) && argument !== null) {
      const inner = widen(argument);
      out += ':' + name + '(' + inner.out + ')';
      dynamic ||= inner.dynamic;
    } else if (STATIC_PSEUDO.has(name) && (argument === null || !widen(argument).dynamic)) {
      out += s.slice(i, j);
    } else {
      // a state the DOM does not hold (:hover, :active, :focus, :checked, :open …), or one inside a negation or an
      // argument: whatever it is now, it may be the other way before the next count
      out += ':is(*)';
      dynamic = true;
    }
    i = j;
  }
  return { out, dynamic };
}

/**
 * `selector` (a list) widened to every element it may match before the DOM changes by an op: a state of the user's or
 * an attribute the renderer or the browser writes counts as held both ways, a negation or a pseudo-class whose argument
 * names one as matching, and a pseudo-element as its element.
 */
export function widenSelector(selector: string): string {
  return widen(selector).out;
}
