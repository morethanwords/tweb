// Renderer core (security-critical, invariants 3 and 6). One instance per
// widget, created by `createRenderer(env)`: inside the sandboxed srcdoc iframe
// (renderer.ts, the only script that ever executes there) `env` is that frame's
// document; the ShadowDomRenderer prototype (src/host/shadow-renderer.ts) runs
// the same core in the chat page itself, on a shadow root.
//
// It applies already-validated RenderOps to the real DOM using DOM APIs only
// (never innerHTML), answers layout queries, forwards user events and cancels
// every navigation.
//
// DOM clobbering: widget markup may contain elements whose id/name shadow
// properties of `document` and of <form> elements (e.g. <input name="setAttribute">).
// Therefore every DOM method/accessor used below is captured from its prototype
// and invoked explicitly ("primordials"); nothing is looked up on `document` or
// on a widget element after start-up.

import { EVENT_TYPES, type CanvasCmd, type HostToRenderer, type Query, type RenderOp, type RendererToHost, type WidgetEvent } from '../shared/protocol';
import { PROFILE_UA_STYLESHEET } from '../shared/profile-tables';
import { THEME_VARIABLES, contentSafeAreaVariables, themeVariables } from '../shared/sdk-policy';
import { GestureArbiter, claimOf, type GestureClaim, type GestureVerdict, type PointerKind } from '../shared/gesture-policy';
import { PaintCounter, animationPaint, boxPaint, boxShadowBlurred, boxShadowWithoutBlur, hidesSubtree, type BoxPaint, type PaintKeyframe, type PaintVerdict } from '../shared/paint-policy';
import { LAYOUT_LEVELS, layoutBudget, mayAllGrid, mayAnimate, mayDisplayGrid, widenSelector } from '../shared/layout-policy';
import { AnimationState, applyAnims, cssAnimationList, isCSSAnimation, isCSSTransition } from './web-animations';
import { TOUCH_ACTION_CLAIM, engineTouchAction } from './touch-action';

/** Where the core renders: a whole document (iframe, native WebViews) or a shadow root inside the host page. */
export interface RendererEnv {
  /** Element factory. */
  doc: Document;
  /** Listener target and `elementFromPoint`: the document or the shadow root. */
  root: Document | ShadowRoot;
  /** The widget's <html>, <head>, <body>: the document's own, or three elements the shadow renderer created. Read at `init()` (a document's body does not exist while its <head> script runs). */
  roots(): { html: HTMLElement; head: HTMLElement; body: HTMLElement };
  /**
   * Origin of the widget's coordinate space in the root's viewport, or null when they coincide (a document). tweb:
   * `scale` is a uniform transform on the host page around the widget (an animation scaling the chat); the widget's
   * coordinates stay the untransformed ones, as inside a frame.
   */
  origin(): { x: number; y: number; scale?: number } | null;
  viewport(): { innerWidth: number; innerHeight: number; dpr: number };
  /** Height of the laid-out widget, used to auto-size the bubble. */
  docHeight(): number;
  matchMedia(query: string): boolean;
  /** Fires when the widget's viewport changes size; returns the unsubscribe. */
  onViewportResize(cb: () => void): () => void;
  /** Fires when the OS colour scheme changes under the renderer (the host re-asserts its theme); returns the unsubscribe. */
  onColorSchemeChange(cb: () => void): () => void;
  /**
   * tweb: the widget is laid out with the host's page, so a batch of ops does not measure the widget at once (a
   * forced layout of the page every frame of an animation): the size observers report it before the frame paints, and
   * the host asks with `flushSize()` when it needs the size in the same task (a widget's first one).
   */
  deferSize?: boolean;
  /**
   * The element that stands for the canvas when the widget's <html> is not a document root (the shadow renderer's
   * host): the core paints on it what CSS paints on a document's canvas, the root's background or else the body's
   * (root background propagation). A document has a canvas of its own: undefined.
   */
  canvas?: HTMLElement;
  /**
   * A frame inside a page (the web's IframeRenderer, whose element carries the theme's scheme): give the frame's root the
   * same scheme, or the frame gets an opaque canvas in the root's scheme over the bubble behind the transparent renderer.
   * Not in a WebView: a dark root there paints a dark canvas of its own.
   */
  frameColorScheme?(scheme: 'light' | 'dark'): void;
  /**
   * tweb: the client's own emoji (its images, not the platform's font, as in its messages): a text split into its plain
   * parts and the emoji the client draws itself, each with its image's URL; undefined when it has none of them. Only
   * where the core runs in the client's page (the shadow renderer): a frame has no client to ask. `max`: the most parts
   * the renderer takes for this text now (its budget, createRenderer's EMOJI_PARTS) — a text of more can come back
   * undefined as soon as that is known, whatever it holds after: it keeps the platform's glyphs.
   */
  emoji?(text: string, max: number): EmojiRun[] | undefined;
}
/** tweb: a part of a text (RendererEnv.emoji): plain, or an emoji the client draws with its image. */
export type EmojiRun = string | { emoji: string; src: string };
export type Send = (msg: RendererToHost, transfer: Transferable[]) => void;
export interface RendererCore {
  /** Starts listening and reporting; `send` carries renderer → host messages. */
  init(send: Send): void;
  onMessage(msg: HostToRenderer): void;
  /** Reports the size now (a forced layout); see `RendererEnv.deferSize`. */
  flushSize(): void;
  /**
   * tweb: the widget's DOM moved — into another window (Document Picture-in-Picture takes the whole client there):
   * frames and the size observers follow it, since a hidden window's deliver nothing; or anywhere: its style sheets,
   * parsed again, get their widened touch-action back.
   */
  rebind(): void;
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

type AnyFn = (...a: any[]) => any;
const uncurry = <F extends AnyFn>(f: F) => (self: unknown, ...args: Parameters<F>): ReturnType<F> => f.apply(self, args);
const getter = (proto: object, name: string): ((self: unknown) => any) => {
  const g = Object.getOwnPropertyDescriptor(proto, name)!.get!;
  return (self) => g.call(self);
};
const setter = (proto: object, name: string): ((self: unknown, v: any) => void) => {
  const s = Object.getOwnPropertyDescriptor(proto, name)!.set!;
  return (self, v) => s.call(self, v);
};

const createElement = uncurry(Document.prototype.createElement);
const createElementNS = uncurry(Document.prototype.createElementNS);
const createTextNode = uncurry(Document.prototype.createTextNode);
const setAttribute = uncurry(Element.prototype.setAttribute);
const getAttribute = uncurry(Element.prototype.getAttribute);
const removeAttribute = uncurry(Element.prototype.removeAttribute);
const closest = uncurry(Element.prototype.closest);
const getBoundingClientRect = uncurry(Element.prototype.getBoundingClientRect);
const getClientRects = uncurry(Element.prototype.getClientRects);
const insertBefore = uncurry(Node.prototype.insertBefore);
const removeChild = uncurry(Node.prototype.removeChild);
const parentNodeOf = getter(Node.prototype, 'parentNode');
const firstChildOf = getter(Node.prototype, 'firstChild');
const nextSiblingOf = getter(Node.prototype, 'nextSibling');
const localNameOf = getter(Element.prototype, 'localName');
const setTextContent = setter(Node.prototype, 'textContent');
const textContentOf = getter(Node.prototype, 'textContent');
const setCharData = setter(CharacterData.prototype, 'data');
const htmlStyleOf = getter(HTMLElement.prototype, 'style');
const svgStyleOf = getter(SVGElement.prototype, 'style');
const styleOf = (el: Element): CSSStyleDeclaration => (el instanceof SVGElement ? svgStyleOf(el) : htmlStyleOf(el));
const sheetOf = getter(HTMLStyleElement.prototype, 'sheet');
const isConnectedOf = getter(Node.prototype, 'isConnected');
const matches = uncurry(Element.prototype.matches);
const getAnimationsOf = uncurry(Element.prototype.getAnimations);

/** Defense in depth: the validator never emits these, but the renderer refuses them regardless. */
const FORBIDDEN_TAGS = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'meta', 'base', 'portal', 'noscript', 'set', 'template', 'audio', 'video', 'source', 'track',
  // Outside the profile (form controls, dialogs): the validator drops or replaces them.
  'input', 'select', 'option', 'optgroup', 'textarea', 'datalist', 'fieldset', 'progress', 'meter', 'form', 'dialog']);
const FORBIDDEN_ATTRS = new Set(['srcdoc', 'srcset', 'action', 'formaction', 'ping', 'background', 'nonce', 'target', 'http-equiv']);

const scrollTopSet = setter(Element.prototype, 'scrollTop');
const scrollLeftSet = setter(Element.prototype, 'scrollLeft');

const rectJson = (r: DOMRect, o: { x: number; y: number; scale?: number } | null) => {
  const dx = o?.x ?? 0, dy = o?.y ?? 0, s = o?.scale ?? 1;
  if (s !== 1) {
    const x = (r.x - dx) / s, y = (r.y - dy) / s, width = r.width / s, height = r.height / s;
    return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height };
  }
  return { x: r.x - dx, y: r.y - dy, width: r.width, height: r.height, top: r.top - dy, left: r.left - dx, right: r.right - dx, bottom: r.bottom - dy };
};
const matrixJson = (m: DOMMatrix | null) => (m ? { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f } : null);

const ALWAYS_FORWARD = new Set(['click', 'load', 'error', 'toggle']);
const THROTTLED = new Set(['pointermove', 'mousemove']);
/** What the widget can get: the profile's events (no keyboard, focus, touch, wheel or scroll; dblclick and contextmenu only the renderer's own). */
const ALL_EVENTS = [...EVENT_TYPES];
/** The engine's double click and context menu: never forwarded, the arbiter decides (gesture-policy.ts) and the renderer sends its own. */
const ENGINE_GESTURES = new Set(['dblclick', 'contextmenu']);
/** Compatibility mouse events: they carry no pointerId, so they follow the press the bubble took. */
const MOUSE_COMPAT = new Set(['mousedown', 'mouseup', 'mousemove', 'click']);
const ENTER_LEAVE = ['pointerenter', 'pointerleave', 'mouseenter', 'mouseleave'];
/** Rule 5 of the heavy-box count (paint-policy.ts): a CSS animation or transition from its start event to its end or cancel. */
const PAINT_ANIMATION_EVENTS = ['animationstart', 'animationend', 'animationcancel', 'transitionstart', 'transitionend', 'transitioncancel'];
/** What moves :hover / :active (and a details element's `open`) without an op. */
const PAINT_INPUT_EVENTS = ['pointerover', 'pointerout', 'pointerdown', 'pointerup', 'pointercancel', 'toggle'];
const noop = () => {};
/**
 * Input that belongs to the chat, never to the widget (D4, docs/profile-v1.md):
 * keys and editing are swallowed (no Enter or Space activation), the platform's
 * context menu is cancelled (the bubble's own menu wins), a mouse press neither
 * moves the focus into the widget nor starts a text selection unless it lands on
 * text the widget made selectable (`user-select: text`, D18), and the focus
 * never stays in it.
 */
const SWALLOWED = ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'contextmenu', 'mousedown', 'focusin', 'submit', 'selectstart'];

function decodeBase64(b64: string): Uint8ClampedArray<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}

// tweb: the client's emoji images (RendererEnv.emoji) a canvas draws, loaded once for every renderer of the page
const emojiImages = new Map<string, HTMLImageElement>();

/** The emoji's image if it is loaded; it starts loading otherwise. */
function emojiImage(src: string) {
  let image = emojiImages.get(src);
  if (!image) {
    image = new Image();
    image.src = src;
    emojiImages.set(src, image);
  }
  return image.complete && image.naturalWidth ? image : undefined;
}

export function createRenderer(env: RendererEnv): RendererCore {
const doc = env.doc;
const root = env.root;
// `DocumentOrShadowRoot` members are separate functions on each prototype: the document's copy throws "Illegal invocation" on a shadow root.
const elementFromPoint = root instanceof Document ? uncurry(Document.prototype.elementFromPoint) : uncurry(ShadowRoot.prototype.elementFromPoint);
let send: Send = () => {};
const post = (msg: RendererToHost, transfer: Transferable[] = []) => send(msg, transfer);
const violation = (detail: string) => post({ type: 'violation', detail });

let HTML: HTMLElement;
let HEAD: HTMLElement;
let BODY: HTMLElement;

const nodes = new Map<number, Node>();
const ids = new WeakMap<Node, number>();
const animations = new AnimationState();

function register(id: number, node: Node) {
  nodes.set(id, node);
  ids.set(node, id);
}

// tweb: a text with the client's emoji (env.emoji) shows inside an element of the client's, `<tw-text>`, one inline box
// (so a flex or grid container still lays it out as one item): the widget's text node with the plain part before the
// first emoji, then a text node per plain part and a `<tw-emoji>` per emoji. The ops still name the widget's node; where
// they put it, the wrapper goes. The elements' styles are the renderer's (CLIENT_TEXT_CSS), out of the widget's reach,
// but its selectors see the wrapper: counted among its siblings (`:last-child`, `a + b`), it can match otherwise than a
// text node does on a client that draws emoji with its text. Not where an element would break the content (a <style>, a
// <textarea>, an SVG's text) nor in a node out of the tree: there the node holds the whole text.
const wrapped = new WeakMap<Text, { data: string; lead: string; wrapper: HTMLElement; parts: Node[]; extra: number; active: boolean }>();
const TEXT_ONLY = new Set(['style', 'title', 'textarea', 'option', 'script']);
// What the client's elements take of the widget's styles: what its text would, nothing more — every property inherited
// or initial (`all: unset`, and direction and unicode-bidi, which `all` leaves out), no ::before or ::after. A rule of the
// widget's that matched them (`p * {opacity: .5}`) gave them boxes a native client has not, heavy ones the paint count
// never saw: it counts the widget's elements. Nor are they targets, as text is none (`pointer-events: none`; a drag
// still selects across them): a press on an emoji is its element's, with the offsets the browser gives there, where
// the helper's own came with its element's id (idOf). Important in a layer, these beat every declaration of the
// widget's (its CSS has no layers, profile 1; it puts no inline style on them), and one rule for every element costs
// no style attribute apiece. The emoji's box as the conformance references draw it (tdesktop's, calibrated on Apple Color
// Emoji): 1em square, its middle .35em above the baseline; the character stays inside for a copy, pushed out of the box.
const CLIENT_TEXT_CSS = '@layer tw-text{tw-text,tw-emoji{all:unset!important;direction:inherit!important;unicode-bidi:normal!important;' +
  'pointer-events:none!important}' +
  'tw-text{display:inline!important}' +
  'tw-emoji{display:inline-block!important;width:1em!important;height:1em!important;vertical-align:-.15em!important;' +
  'line-height:1!important;text-indent:100%!important;white-space:nowrap!important;overflow:hidden!important;' +
  'color:transparent!important;text-shadow:none!important;background-position:center!important;' +
  'background-size:contain!important;background-repeat:no-repeat!important}' +
  'tw-text::before,tw-text::after,tw-emoji::before,tw-emoji::after{content:none!important}' +
  'tw-emoji::first-letter,tw-emoji::first-line{all:unset!important}}';

// tweb: what the client's emoji cost the page. A text shown in n parts (a node, or a draw on a canvas, each) is n - 1
// more than the one op or command the validator counts and models for it, all made on the page's thread where the CPU
// limits do not reach ('©' × 5000 was 5000 elements for one op). A widget's texts stand in at most EMOJI_PARTS such
// parts in its DOM at once, and it makes at most EMOJI_PARTS_PER_SECOND of them (EMOJI_PARTS at once) in its DOM and on
// its canvases together: a text past either keeps the platform's glyphs, whole.
const EMOJI_PARTS = 1024;
const EMOJI_PARTS_PER_SECOND = 2048;
/** The extra parts the widget's texts stand in now, and those it may make now. */
let emojiParts = 0;
let emojiTokens = EMOJI_PARTS;
let emojiTokensAt = 0;

/**
 * `text` in its parts (env.emoji) if they fit the budget; `held`: the parts of the node's text it replaces (none for a
 * canvas's, which stays nowhere). The caller makes them, and pays with `spendEmoji`.
 */
function emojiRuns(text: string, held?: number): EmojiRun[] | undefined {
  if (!text || !env.emoji) return;
  const now = performance.now();
  emojiTokens = Math.min(EMOJI_PARTS, emojiTokens + (now - emojiTokensAt) * EMOJI_PARTS_PER_SECOND / 1000);
  emojiTokensAt = now;
  const room = Math.floor(held === undefined ? emojiTokens : Math.min(emojiTokens, EMOJI_PARTS - emojiParts + held));
  const runs = env.emoji(text, room + 1);
  return runs && runs.length - 1 <= room ? runs : undefined;
}

function spendEmoji(runs: EmojiRun[]) {
  emojiTokens -= runs.length - 1;
}

const isText = (node: Node): node is Text => node.nodeType === 3;
const takesEmoji = (parent: Node | null): parent is Element => !!parent && parent.nodeType === 1 &&
  (parent as Element).namespaceURI === 'http://www.w3.org/1999/xhtml' && !TEXT_ONLY.has(localNameOf(parent as Element));

/** What stands for a widget's node in its parent: the wrapper of a text shown with the client's emoji, else the node. */
function outerOf(node: Node): Node {
  const entry = isText(node) ? wrapped.get(node) : undefined;
  return entry?.active ? entry.wrapper : node;
}

/** Takes `t` out of its wrapper, back to where the wrapper stood. */
function unwrap(t: Text, wrapper: HTMLElement) {
  const parent = parentNodeOf(wrapper);
  if (parent) {
    insertBefore(parent, t, wrapper);
    removeChild(parent, wrapper);
  } else removeChild(wrapper, t);
}

/** Shows `t`'s text as its parent takes it: wrapped with the client's emoji, or whole in the node. */
function placeText(t: Text) {
  const entry = wrapped.get(t);
  if (!entry) return;
  const { wrapper } = entry;
  const parent = entry.active ? parentNodeOf(wrapper) : parentNodeOf(t);
  if (!takesEmoji(parent)) {
    if (entry.active) unwrap(t, wrapper);
    entry.active = false;
    setCharData(t, entry.data);
    return;
  }
  if (!entry.active) {
    insertBefore(parent, wrapper, t);
    insertBefore(wrapper, t, firstChildOf(wrapper));
    entry.active = true;
  }
  setCharData(t, entry.lead);
}

function showText(t: Text, data: string) {
  let entry = wrapped.get(t);
  const runs = emojiRuns(data, entry?.extra ?? 0);
  if (!runs) {
    if (entry) {
      if (entry.active) unwrap(t, entry.wrapper);
      emojiParts -= entry.extra;
      wrapped.delete(t);
    }
    setCharData(t, data);
    return;
  }
  spendEmoji(runs);
  if (!entry) {
    const wrapper = createElement(doc, 'tw-text') as HTMLElement;
    wrapped.set(t, entry = { data, lead: '', wrapper, parts: [], extra: 0, active: false });
  }
  for (const part of entry.parts) removeChild(entry.wrapper, part);
  emojiParts += runs.length - 1 - entry.extra;
  entry.extra = runs.length - 1;
  // the leading plain part stays in `t`, the rest become nodes after it
  entry.data = data;
  entry.lead = typeof runs[0] === 'string' ? runs[0] : '';
  entry.parts = (entry.lead ? runs.slice(1) : runs).map((run) => {
    if (typeof run === 'string') return createTextNode(doc, run);
    const el = createElement(doc, 'tw-emoji') as HTMLElement;
    el.style.cssText = `background-image:url("${run.src.replace(/["\\\n]/g, '')}")!important`;
    setTextContent(el, run.emoji);
    // a canvas drawing it later finds the image loaded
    emojiImage(run.src);
    return el;
  });
  for (const part of entry.parts) insertBefore(entry.wrapper, part, null);
  placeText(t);
}

function forget(node: Node) {
  const id = ids.get(node);
  if (id !== undefined) {
    nodes.delete(id);
    ids.delete(node);
    canvases.delete(id);
    if (node instanceof Element) {
      resizeObserver.unobserve(node); observed.delete(node);
      // tweb: nor is its own play state held (while hidden), nor its boxes waiting to be counted
      heldPlayStates.delete(node); paintDirty.delete(node); paintDirtySelf.delete(node);
      // tweb: nor what may make it a grid (the layout budget)
      inlineGrid.delete(node);
      for (const aid of animatedGrid.get(node) ?? []) gridAnimations.delete(aid);
      animatedGrid.delete(node);
    }
    if (node instanceof HTMLCanvasElement) { canvasPixelsTotal -= canvasPixels.get(node) ?? 0; canvasPixels.delete(node); }
    // tweb: its text's parts leave the emoji budget (emojiRuns)
    const entry = isText(node) ? wrapped.get(node) : undefined;
    if (entry) { emojiParts -= entry.extra; wrapped.delete(node as Text); }
    // tweb: what the sheet overrode counts again (refreshSheets no longer sees it to notice it went)
    if (node instanceof HTMLStyleElement && widgetStyles.delete(node)) { paintSheetsDirty = layoutSheetsDirty = true; paintEverything(); }
  }
  for (let c = firstChildOf(node); c; c = nextSiblingOf(c)) forget(c);
}

// ───────────────────────── canvas sizes ─────────────────────────

/**
 * A canvas's bitmap is the page's memory, as large as the widget makes it (four canvases of 16384² grew a browser by
 * ~16 GB): a widget's canvases hold at most this many pixels together (64 MB as RGBA; a canvas over a whole bubble at
 * 3× is ~2.5 M). A size past it is not applied: the canvas keeps the one it had, a new one is 0 × 0.
 */
const CANVAS_PIXELS_MAX = 4096 * 4096;
const canvasPixels = new Map<HTMLCanvasElement, number>();
let canvasPixelsTotal = 0;

/** Charges `el` the size `w` × `h` if the widget's canvases can hold it together; false, and nothing charged, if not. */
function fitCanvas(el: HTMLCanvasElement, w: number, h: number): boolean {
  const others = canvasPixelsTotal - (canvasPixels.get(el) ?? 0);
  if (!(others + w * h <= CANVAS_PIXELS_MAX)) {
    violation(`canvas ${w}×${h}: a widget's canvases hold at most ${CANVAS_PIXELS_MAX} pixels together`);
    return false;
  }
  canvasPixels.set(el, w * h);
  canvasPixelsTotal = others + w * h;
  return true;
}

/** Whether `el` may take `value` (null: none) as its `name`: anything but a canvas's width or height may. */
function canvasSizeFits(el: Element, name: string, value: string | null): boolean {
  if (!(el instanceof HTMLCanvasElement) || (name !== 'width' && name !== 'height')) return true;
  // HTML's rules for non-negative integers; a value they refuse, or none, is the default
  const parsed = /^[\t\n\f\r ]*\+?(\d+)/.exec(value ?? '');
  const n = parsed ? Number(parsed[1]) : name === 'width' ? 300 : 150;
  return fitCanvas(el, name === 'width' ? n : el.width, name === 'height' ? n : el.height);
}

function idOf(node: Node | null): number {
  for (let n = node; n; n = parentNodeOf(n)) {
    const id = ids.get(n);
    if (id !== undefined) return id;
  }
  return 0;
}

// ───────────────────────── ops ─────────────────────────

function applyAttr(el: Element, name: string, value: string) {
  const lower = name.toLowerCase();
  if (lower.startsWith('on') || FORBIDDEN_ATTRS.has(lower)) return violation(`attribute ${name}`);
  // Assigning canvas width/height clears the bitmap even if unchanged; the
  // canvas command stream ('r') is authoritative for resets.
  if (el instanceof HTMLCanvasElement && (lower === 'width' || lower === 'height') && getAttribute(el, lower) === value) return;
  if (!canvasSizeFits(el, lower, value)) return;
  setAttribute(el, name, value);
  if (lower === 'style') widenTouchAction(styleOf(el));
}

// ───────────────────────── touch-action: the engine always pans vertically (touch-action.ts) ─────────────────────────

/** One declaration block: the engine gets the widened `touch-action`, the claim keeps the widget's own (same priority). */
function widenTouchAction(style: CSSStyleDeclaration) {
  const value = style.getPropertyValue('touch-action');
  if (!value) return;
  const priority = style.getPropertyPriority('touch-action');
  style.setProperty(TOUCH_ACTION_CLAIM, value, priority);
  const engine = engineTouchAction(value);
  if (engine !== value) style.setProperty('touch-action', engine, priority);
}

/**
 * The element's own touch-action as the widget declared it: the claim property when the engine's value is that
 * value widened (the element declares it), else the engine's (`auto`: the claim property inherited from an ancestor).
 */
function ownTouchAction(cs: CSSStyleDeclaration): string {
  const own = cs.getPropertyValue(TOUCH_ACTION_CLAIM).trim();
  const words = (v: string) => v.trim().toLowerCase().split(/\s+/).sort().join(' ');
  return own && words(cs.touchAction) === words(engineTouchAction(own)) ? own : cs.touchAction;
}

/**
 * Every rule of a `<style>` element's sheet (none until it is connected), nested rules included. tweb: `fresh`, only
 * the rules that do not carry the claim yet — a sheet parsed again from its text has lost what was widened.
 */
function widenSheet(el: Node, fresh = false) {
  if (!(el instanceof HTMLStyleElement)) return;
  // tweb: most widgets declare no touch-action at all, and a walk costs a CSSOM wrapper per rule; a declaration that
  // passed the sanitizer is spelled out (an escaped name is not in the profile's list of properties)
  if (!/touch-action/i.test(el.textContent ?? '')) return;
  const sheet = sheetOf(el) as CSSStyleSheet | null;
  if (!sheet) return;
  const walk = (rules: CSSRuleList) => {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i] as CSSRule & { style?: CSSStyleDeclaration; cssRules?: CSSRuleList };
      if (r.style && !(fresh && r.style.getPropertyValue(TOUCH_ACTION_CLAIM))) widenTouchAction(r.style);
      if (r.cssRules) walk(r.cssRules);
    }
  };
  walk(sheet.cssRules);
}

function applyOp(op: RenderOp) {
  switch (op.op) {
    case 'el': {
      const tag = op.tag.toLowerCase();
      if (FORBIDDEN_TAGS.has(tag)) return violation(`element <${op.tag}>`);
      let el: Element;
      if (op.adopt) canvasDirty = true;
      if (op.adopt === 'html') el = HTML;
      else if (op.adopt === 'head') el = HEAD;
      else if (op.adopt === 'body') el = BODY;
      else el = op.ns === 'svg' ? createElementNS(doc, SVG_NS, op.tag) : createElement(doc, op.tag);
      // A script's image loads before it is inserted (new Image()), where the root's listeners do not see it.
      if (tag === 'img' && !op.adopt) for (const type of ['load', 'error']) el.addEventListener(type, onDetachedImage);
      register(op.id, el);
      // a canvas is born 300 × 150
      if (el instanceof HTMLCanvasElement && !fitCanvas(el, 300, 150)) { el.width = 0; el.height = 0; }
      for (const [name, value] of op.attrs) applyAttr(el, name, value);
      // tweb: an own important play state, while hidden (holdPlayState)
      if (hostHidden) holdPlayState(el);
      return;
    }
    case 'text': {
      // tweb: the client's emoji (showText)
      const t = createTextNode(doc, '');
      register(op.id, t);
      return showText(t, op.data);
    }
    case 'comment':
      return;
  }
  const node = nodes.get(op.id);
  if (!node) return;
  // What can change the root's or the body's background: their own attributes and styles, any stylesheet.
  if (node === HTML || node === BODY || op.op === 'css' || ((op.op === 'ins' || op.op === 'rm') && node instanceof HTMLStyleElement)) canvasDirty = true;
  switch (op.op) {
    case 'attr': {
      // tweb: the element's own play state is the widget's new one, held while hidden (holdPlayState)
      const held = hostHidden && op.name.toLowerCase() === 'style';
      if (held) releasePlayState(node as Element);
      applyAttr(node as Element, op.name, op.value);
      if (node === HTML && op.name.toLowerCase() === 'style') applyThemeVariables();
      if (held) holdPlayState(node as Element);
      return;
    }
    case 'rattr': {
      if (!canvasSizeFits(node as Element, op.name.toLowerCase(), null)) return;
      const held = hostHidden && op.name.toLowerCase() === 'style';
      if (held) releasePlayState(node as Element);
      removeAttribute(node as Element, op.name);
      if (node === HTML && op.name.toLowerCase() === 'style') applyThemeVariables();
      if (held) holdPlayState(node as Element);
      return;
    }
    case 'data':
      return isText(node) ? showText(node, op.data) : setCharData(node, op.data);
    case 'ins': {
      if (node === HTML || node === HEAD || node === BODY) return;
      // tweb: a text shown with the client's emoji moves with its wrapper (outerOf)
      const outer = outerOf(node);
      if (op.parent === 0) {
        const p = parentNodeOf(outer);
        if (p) removeChild(p, outer);
        return;
      }
      const parent = nodes.get(op.parent);
      if (!parent) return;
      const before = op.before === null ? undefined : nodes.get(op.before);
      const ref = before ? outerOf(before) : null;
      insertBefore(parent, outer, ref && parentNodeOf(ref) === parent ? ref : null);
      if (isText(node)) placeText(node);
      // A <style> gets its sheet once connected.
      widenSheet(node);
      return;
    }
    case 'rm': {
      if (node === HTML || node === HEAD || node === BODY) return;
      const outer = outerOf(node);
      const p = parentNodeOf(outer);
      if (p) removeChild(p, outer);
      forget(node);
      return;
    }
    case 'style': {
      // The host's theme variables on the root are not the widget's to change (it can shadow them on its own elements).
      if (node === HTML && THEME_VARIABLES.includes(op.name)) return;
      const style = styleOf(node as Element);
      // tweb: the element's own play state is the widget's new one, held while hidden (holdPlayState)
      const held = hostHidden && PLAY_STATE_STYLE.test(op.name);
      if (held) releasePlayState(node as Element);
      if (op.name === 'touch-action') style.removeProperty(TOUCH_ACTION_CLAIM);
      if (op.value === '') style.removeProperty(op.name);
      else style.setProperty(op.name, op.value, op.important ? 'important' : '');
      if (op.name === 'touch-action') widenTouchAction(style);
      if (held) holdPlayState(node as Element);
      return;
    }
    case 'css':
      // Sanitized stylesheet text for a <style> element.
      if (localNameOf(node) === 'style') { setTextContent(node, op.text); widenSheet(node); }
      return;
    case 'prop':
      return applyProp(node as any, op.name, op.value);
    case 'call':
      return applyCall(node as any, op.method, op.args);
    case 'canvas':
      if (node instanceof HTMLCanvasElement) replay(op.id, node, op.cmds);
      return;
  }
}

function applyProp(el: Element, name: string, value: string | number | boolean) {
  switch (name) {
    case 'scrollTop':
      return scrollTopSet(el, value);
    case 'scrollLeft':
      return scrollLeftSet(el, value);
  }
}

/** The profile's element methods (no focus, selection, dialogs, popovers or scrollIntoView: docs/profile-v1.md). */
const METHOD_IMPL: Record<string, (el: any, a: any[]) => void> = {
  scrollTo: (el, a) => Element.prototype.scrollTo.call(el, a[0], a[1]),
  scrollBy: (el, a) => Element.prototype.scrollBy.call(el, a[0], a[1]),
  setPointerCapture: (el, a) => {
    // Only a pointer whose press began on the widget (`ownPointers`): the shim's check runs in the VM, which the widget
    // can lie to, and on the Shadow DOM renderer a pointer pressed on the chat would be taken from the control under it.
    if (!ownPointers.has(a[0])) return;
    try { Element.prototype.setPointerCapture.call(el, a[0]); } catch {}
  },
  releasePointerCapture: (el, a) => {
    try { Element.prototype.releasePointerCapture.call(el, a[0]); } catch {}
  },
  observeResize: (el) => { observed.add(el); resizeObserver.observe(el); },
  unobserveResize: (el) => { observed.delete(el); resizeObserver.unobserve(el); },
};

function applyCall(el: Element, method: string, args: unknown[]) {
  const impl = Object.prototype.hasOwnProperty.call(METHOD_IMPL, method) ? METHOD_IMPL[method] : null;
  if (impl) impl(el, args);
}

// ───────────────────────── canvas replay ─────────────────────────

interface CanvasState {
  ctx: CanvasRenderingContext2D;
  objects: Map<number, CanvasGradient | CanvasPattern | null>;
  paths: Map<number, Path2D>;
}
const canvases = new Map<number, CanvasState>();

function canvasState(id: number, el: HTMLCanvasElement): CanvasState | null {
  let st = canvases.get(id);
  if (!st) {
    const ctx = HTMLCanvasElement.prototype.getContext.call(el, '2d') as CanvasRenderingContext2D | null;
    if (!ctx) return null;
    st = { ctx, objects: new Map(), paths: new Map() };
    canvases.set(id, st);
  }
  return st;
}

function resolveArg(st: CanvasState, a: any): any {
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    if ('g' in a) return st.objects.get(a.g) ?? undefined;
    if ('p' in a) return st.paths.get(a.p) ?? undefined;
    if ('n' in a) return nodes.get(a.n);
    if ('b64' in a) {
      try { return new ImageData(decodeBase64(a.b64), a.w, a.h); } catch { return undefined; }
    }
  }
  return a;
}

// tweb: canvas text with the client's emoji (env.emoji): each drawn as its image, 1em square, in the advance the
// platform's glyph has — what `measureText` says, the platform's, holds for the drawing, whatever is drawn. One whose
// image is not loaded yet takes the platform's glyph. A text whose parts a right-to-left direction would reorder is the
// platform's to draw, emoji and all, and so is one drawn where its parts, each composited on its own, would not make
// the one draw of the whole (`drawsInParts`). The parts stand where the whole text puts them, in the widget's own space,
// so a gradient or a pattern fills them as it would the whole.
const RTL_TEXT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u200F\u202B\u202E\u2067\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
const fontSizeOf = (font: string) => parseFloat(/([\d.]+)px/.exec(font)?.[1] ?? '10');
/**
 * Parts side by side composite as their whole only over what is there and with no shadow (one part's would fall on
 * another) or filter (one part's blur would): another composite operation, a shadow or a filter are outside profile 1,
 * which the validator drops, but the split must not rest on that. A filter Safari lacks reads undefined.
 */
const drawsInParts = (ctx: CanvasRenderingContext2D) => ctx.globalCompositeOperation === 'source-over' &&
  (ctx.filter ?? 'none') === 'none' && !((ctx.shadowBlur || ctx.shadowOffsetX || ctx.shadowOffsetY) && !/, 0\)$/.test(ctx.shadowColor));

/**
 * Where the alphabetic baseline of text drawn at `y` lies, whatever the text's baseline: from where a glyph's top is
 * under each (`actualBoundingBoxAscent`, which every engine has — Firefox gives no `alphabeticBaseline` without its
 * extended text metrics). NaN where it cannot be told.
 */
function alphabeticY(ctx: CanvasRenderingContext2D, y: number): number {
  const baseline = ctx.textBaseline;
  if (baseline === 'alphabetic') return y;
  const under = ctx.measureText('H').actualBoundingBoxAscent;
  ctx.textBaseline = 'alphabetic';
  const alphabetic = ctx.measureText('H').actualBoundingBoxAscent;
  ctx.textBaseline = baseline;
  return y - under + alphabetic;
}

function drawEmojiText(ctx: CanvasRenderingContext2D, method: 'fillText' | 'strokeText', args: any[]) {
  const [text, x, y, maxWidth] = args as [string, number, number, number | undefined];
  const runs = RTL_TEXT.test(String(text)) ? undefined : emojiRuns(String(text));
  if (!runs || !drawsInParts(ctx)) return false;
  // an emoji at either end goes to the other side right to left
  if (ctx.direction === 'rtl' || (ctx.direction === 'inherit' && getComputedStyle(ctx.canvas).direction === 'rtl')) return false;
  const size = fontSizeOf(ctx.font);
  // the alphabetic baseline whatever the text's baseline: the emoji's box hangs from it (unknown: the platform's glyphs)
  const top = alphabeticY(ctx, y) - .35 * size - size / 2;
  if (!Number.isFinite(top)) return false;
  spendEmoji(runs);
  const widths = runs.map((run) => ctx.measureText(typeof run === 'string' ? run : run.emoji).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = maxWidth !== undefined && total > maxWidth ? Math.max(maxWidth, 0) / total : 1;
  const align = ctx.textAlign;
  let at = x - (align === 'center' ? total * scale / 2 : align === 'right' || align === 'end' ? total * scale : 0);
  ctx.save();
  ctx.textAlign = 'left';
  // a glyph is smoothed whatever the widget asks of its images
  ctx.imageSmoothingEnabled = true;
  runs.forEach((run, i) => {
    const width = widths[i] * scale;
    const image = typeof run === 'string' ? undefined : emojiImage(run.src);
    if (image) ctx.drawImage(image, at + (width - size * scale) / 2, top, size * scale, size);
    // squeezed as the whole text is into maxWidth
    else if (scale !== 1) ctx[method](typeof run === 'string' ? run : run.emoji, at, y, width);
    else ctx[method](typeof run === 'string' ? run : run.emoji, at, y);
    at += width;
  });
  ctx.restore();
  return true;
}

function replay(id: number, el: HTMLCanvasElement, cmds: CanvasCmd[]) {
  const st = canvasState(id, el);
  if (!st) return;
  const ctx = st.ctx as any;
  for (const cmd of cmds) {
    try {
      const [kind, name, ...rest] = cmd as [string, any, ...any[]];
      switch (kind) {
        case 'c': {
          const args = rest.map((a) => resolveArg(st, a));
          if (args.includes(undefined)) break;
          // tweb: a text with the client's emoji draws them as their images
          if ((name === 'fillText' || name === 'strokeText') && drawEmojiText(ctx, name, args)) break;
          ctx[name](...args);
          break;
        }
        case 's':
          ctx[name] = resolveArg(st, rest[0]);
          break;
        case 'r':
          // a size past the widget's canvas pixels still clears the bitmap
          if (!fitCanvas(el, name, rest[0])) { el.width = el.width; break; }
          el.width = name;
          el.height = rest[0];
          break;
        case 'g': {
          const [type, ...args] = rest;
          let obj: CanvasGradient | CanvasPattern | null = null;
          if (type === 'linear') obj = ctx.createLinearGradient(...args);
          else if (type === 'radial') obj = ctx.createRadialGradient(...args);
          else if (type === 'conic') obj = ctx.createConicGradient(...args);
          else if (type === 'pattern') {
            const src = resolveArg(st, args[0]);
            if (src) obj = ctx.createPattern(src, args[1] ?? 'repeat');
          }
          st.objects.set(name, obj);
          break;
        }
        case 'gs':
          (st.objects.get(name) as CanvasGradient | undefined)?.addColorStop(rest[0], rest[1]);
          break;
        case 'pn':
          st.paths.set(name, typeof rest[0] === 'string' ? new Path2D(rest[0]) : new Path2D());
          break;
        case 'pc': {
          const path = st.paths.get(name) as any;
          const [method, ...args] = rest;
          if (path) path[method](...args.map((a: any) => resolveArg(st, a)));
          break;
        }
      }
    } catch {
      // A failing draw call (bad argument) must not abort the rest of the frame.
    }
  }
}

// ───────────────────────── queries ─────────────────────────

let scratch: CanvasRenderingContext2D | null = null;

function answer(q: Query): { result: unknown; binary?: ArrayBuffer } {
  const el = 'id' in q ? (nodes.get(q.id) as any) : null;
  if ('id' in q && !(el instanceof Element)) return { result: { error: 'no such element' } };
  switch (q.q) {
    case 'rect':
      return { result: rectJson(getBoundingClientRect(el), env.origin()) };
    case 'rects': {
      const o = env.origin();
      return { result: Array.from(getClientRects(el), (r) => rectJson(r, o)) };
    }
    case 'box': {
      const g = (name: string) => getter(Element.prototype, name)(el);
      const html = el instanceof HTMLElement;
      const h = (name: string) => (html ? getter(HTMLElement.prototype, name)(el) : 0);
      return {
        result: {
          offsetWidth: h('offsetWidth'), offsetHeight: h('offsetHeight'), offsetTop: h('offsetTop'), offsetLeft: h('offsetLeft'),
          offsetParent: html ? idOf(h('offsetParent')) : 0,
          clientWidth: g('clientWidth'), clientHeight: g('clientHeight'), clientTop: g('clientTop'), clientLeft: g('clientLeft'),
          scrollWidth: g('scrollWidth'), scrollHeight: g('scrollHeight'), scrollTop: g('scrollTop'), scrollLeft: g('scrollLeft'),
        },
      };
    }
    case 'cs': {
      const cs = getComputedStyle(el, q.pseudo ?? null);
      // The widget sees its own touch-action, not the engine's widened one.
      const touchAction = () => ownTouchAction(cs);
      if (q.prop) return { result: q.prop === 'touch-action' ? touchAction() : cs.getPropertyValue(q.prop) };
      const out: Record<string, string> = {};
      for (let i = 0; i < cs.length; i++) if (cs[i] !== TOUCH_ACTION_CLAIM) out[cs[i]] = cs.getPropertyValue(cs[i]);
      out['touch-action'] = touchAction();
      return { result: out };
    }
    case 'svg': {
      try {
        const args = q.args ?? [];
        switch (q.method) {
          case 'getBBox': {
            const b = (el as SVGGraphicsElement).getBBox();
            return { result: { x: b.x, y: b.y, width: b.width, height: b.height } };
          }
          case 'getCTM':
            return { result: matrixJson((el as any)[q.method]()) };
          case 'getScreenCTM': {
            const m = matrixJson((el as SVGGraphicsElement).getScreenCTM());
            const o = env.origin();
            if (m && o) {
              const s = o.scale ?? 1;
              m.e = (m.e - o.x) / s; m.f = (m.f - o.y) / s;
              if (s !== 1) { m.a /= s; m.b /= s; m.c /= s; m.d /= s; }
            }
            return { result: m };
          }
          case 'getPointAtLength': {
            const p = (el as SVGGeometryElement).getPointAtLength(args[0] ?? 0);
            return { result: { x: p.x, y: p.y } };
          }
          case 'getComputedTextLength': case 'getTotalLength': case 'getNumberOfChars':
            return { result: (el as any)[q.method]() };
          case 'getSubStringLength':
            return { result: (el as SVGTextContentElement).getSubStringLength(args[0] ?? 0, args[1] ?? 0) };
        }
      } catch (e) {
        return { result: { error: String(e) } };
      }
      return { result: { error: 'unsupported' } };
    }
    case 'measureText': {
      scratch ??= HTMLCanvasElement.prototype.getContext.call(createElement(doc, 'canvas'), '2d') as CanvasRenderingContext2D;
      scratch.font = '10px sans-serif';
      scratch.font = q.font;
      const m = scratch.measureText(q.text);
      return {
        result: {
          width: m.width, actualBoundingBoxLeft: m.actualBoundingBoxLeft, actualBoundingBoxRight: m.actualBoundingBoxRight,
          actualBoundingBoxAscent: m.actualBoundingBoxAscent, actualBoundingBoxDescent: m.actualBoundingBoxDescent,
          fontBoundingBoxAscent: m.fontBoundingBoxAscent, fontBoundingBoxDescent: m.fontBoundingBoxDescent,
        },
      };
    }
    case 'imageData': {
      const st = canvasState(q.id, el);
      if (!st) return { result: { error: 'no context' } };
      const data = st.ctx.getImageData(q.x, q.y, q.w, q.h);
      const buf = data.data.buffer.slice(0);
      return { result: { width: data.width, height: data.height }, binary: buf };
    }
    case 'canvasCall': {
      const st = canvasState(q.id, el);
      if (!st) return { result: { error: 'no context' } };
      const args = (q.args ?? []).map((a) => resolveArg(st, a));
      try {
        switch (q.method) {
          case 'isPointInPath': case 'isPointInStroke':
            return { result: (st.ctx as any)[q.method](...args) };
          case 'getTransform':
            return { result: matrixJson(st.ctx.getTransform()) };
          case 'getLineDash':
            return { result: st.ctx.getLineDash() };
          case 'toDataURL':
            return { result: HTMLCanvasElement.prototype.toDataURL.call(el, ...(args as [string?, number?])) };
        }
      } catch (e) {
        return { result: { error: String(e) } };
      }
      return { result: { error: 'unsupported' } };
    }
    case 'elementFromPoint': {
      const o = env.origin();
      const s = o?.scale ?? 1;
      return { result: idOf(elementFromPoint(root, q.x * s + (o?.x ?? 0), q.y * s + (o?.y ?? 0))) };
    }
    case 'validity': {
      const v = (el as HTMLInputElement).validity;
      if (!v) return { result: { valid: true, message: '' } };
      const out: Record<string, unknown> = { message: (el as HTMLInputElement).validationMessage };
      for (const k of ['valid', 'valueMissing', 'typeMismatch', 'patternMismatch', 'tooLong', 'tooShort', 'rangeUnderflow', 'rangeOverflow', 'stepMismatch', 'badInput', 'customError'] as const) out[k] = v[k];
      return { result: out };
    }
    case 'matchMedia':
      return { result: { matches: env.matchMedia(q.query) } };
    case 'viewport':
      return { result: env.viewport() };
    case 'anims':
      return { result: { list: cssAnimationList(animations, el, q.subtree === true, idOf) } };
  }
}

// ───────────────────────── events ─────────────────────────

let interest = new Set<string>();
/**
 * tweb: animation and transition events no listener asked for yet, kept a moment. A widget's task that asks a layout
 * question sends its DOM before it ends, so an animation can start (and a short one end) before the listeners the
 * same task adds come as `listen`; a browser would still deliver them (it sends animation events with the next
 * frame). What `listen` then asks for of these goes to the widget — of those that came once the task that sends it
 * had begun (`listen`'s `since`; each is kept with when it came, on the clock every thread shares): one that came
 * before (an animation that ended before a later task listened) a browser had delivered to no one.
 */
const ANIMATION_EVENTS = new Set(['animationstart', 'animationiteration', 'animationend', 'animationcancel', 'transitionrun', 'transitionstart', 'transitionend', 'transitioncancel']);
const EARLY_EVENTS_MS = 1000;
const EARLY_EVENTS_MAX = 64;
let earlyEvents: { ev: WidgetEvent; at: number }[] = [];
/** The clock every thread shares (the glue's in a worker, a frame's or another window's): `listen`'s `since`. */
const sharedNow = () => performance.timeOrigin + performance.now();
/** "Learned preventDefault": keys reported by the sandbox for which the default is cancelled synchronously. */
let preventKeys = new Set<string>();
const pendingMoves = new Map<string, WidgetEvent>();
let moveFrame = 0;
/** Pending `requestFrame` from the host (one at a time: the shim coalesces its callbacks into one request). */
let frameReq = 0;
/** Set by the `frozen` op: the runtime is gone, the last render stays as a static snapshot. */
let frozen = false;

/**
 * tweb: the last position of each pointer, for a move whose browser says it moved nothing (WebKit's synthetic ones,
 * which have no screen position either): its screen coordinates, and its client ones. A touch contact's goes when the
 * contact ends, and what follows its end (its out, its leave, its click) keeps none: each contact has an id of its own,
 * and a widget's every tap stayed. At most POSITIONS_KEPT pointers, the one heard from longest ago going first (a pen
 * may get a new id each time it comes near).
 */
const lastPosition = new Map<string, [number, number, number, number]>();
const POSITIONS_KEPT = 16;
const TOUCH_GONE = new Set(['pointerup', 'pointercancel', 'pointerout', 'pointerleave', 'lostpointercapture', 'click', 'auxclick']);

/**
 * tweb: an event's kind by what it carries rather than by `instanceof`: one of a Document Picture-in-Picture window,
 * where the widget's element can move, is of that window's realm.
 */
const isMouseEvent = (e: Event): e is MouseEvent => 'clientX' in e;
const isPointerEvent = (e: Event): e is PointerEvent => 'pointerId' in e;

function serialize(e: Event, targetId: number): WidgetEvent {
  const ev: WidgetEvent = { type: e.type, targetId };
  const t = e.target as any;
  if (isMouseEvent(e)) {
    // tweb: here only — it reads the layout (a renderer on a shadow root), and an animation event a widget does not
    // listen for, kept a moment (earlyEvents), is serialized every iteration
    const o = env.origin();
    ev.clientX = e.clientX; ev.clientY = e.clientY; ev.offsetX = e.offsetX; ev.offsetY = e.offsetY;
    ev.pageX = e.pageX; ev.pageY = e.pageY; ev.movementX = e.movementX; ev.movementY = e.movementY;
    const pointer = isPointerEvent(e) ? 'p' + e.pointerId : 'm';
    const last = lastPosition.get(pointer);
    if (last && !e.movementX && !e.movementY && e.type.endsWith('move')) {
      const screen = e.screenX !== last[0] || e.screenY !== last[1];
      ev.movementX = screen ? e.screenX - last[0] : e.clientX - last[2];
      ev.movementY = screen ? e.screenY - last[1] : e.clientY - last[3];
    }
    lastPosition.delete(pointer);
    if (!(isPointerEvent(e) && e.pointerType === 'touch' && TOUCH_GONE.has(e.type))) {
      lastPosition.set(pointer, [e.screenX, e.screenY, e.clientX, e.clientY]);
      if (lastPosition.size > POSITIONS_KEPT) lastPosition.delete(lastPosition.keys().next().value!);
    }
    // Shadow root in the chat page: client coordinates relative to the widget, and its "page" never scrolls.
    if (o) {
      const s = o.scale ?? 1;
      ev.clientX = (ev.clientX - o.x) / s; ev.clientY = (ev.clientY - o.y) / s; ev.pageX = ev.clientX; ev.pageY = ev.clientY;
      if (s !== 1) { ev.movementX /= s; ev.movementY /= s; }
    }
    ev.button = e.button; ev.buttons = e.buttons; ev.detail = e.detail;
    if (e.relatedTarget) ev.relatedId = idOf(e.relatedTarget as Node);
  }
  if (isPointerEvent(e)) {
    ev.pointerId = e.pointerId; ev.pointerType = e.pointerType; ev.isPrimary = e.isPrimary; ev.pressure = e.pressure;
  }
  if (isMouseEvent(e)) {
    const m = e as MouseEvent;
    ev.modifiers = (m.altKey ? 1 : 0) | (m.ctrlKey ? 2 : 0) | (m.metaKey ? 4 : 0) | (m.shiftKey ? 8 : 0);
  }
  if (t instanceof HTMLImageElement && e.type === 'load') { ev.naturalWidth = t.naturalWidth; ev.naturalHeight = t.naturalHeight; }
  // tweb: what an animation or a transition event says (anim.events); the names are the widget's own
  if ('animationName' in e) { const a = e as AnimationEvent; ev.animationName = a.animationName; ev.elapsedTime = a.elapsedTime; ev.pseudoElement = a.pseudoElement; }
  if ('propertyName' in e) { const tr = e as TransitionEvent; ev.propertyName = tr.propertyName; ev.elapsedTime = tr.elapsedTime; ev.pseudoElement = tr.pseudoElement; }
  if (t instanceof HTMLDetailsElement && e.type === 'toggle') ev.open = t.open;
  return ev;
}

/**
 * What of the press that starts on `el` the widget claims (gesture-policy.ts
 * `claimOf`, docs/sdk-v1.md §5.5): from the `touch-action` the widget gave `el`
 * and its ancestors (`none` claims horizontal drags and holds, a value without a
 * horizontal pan claims horizontal drags; vertical drags are never claimed) and
 * a pointerdown / touchstart the sandbox has learned to prevent on this target
 * (horizontal drags). The host tells the client (`onGestureClaim`).
 */
function gestureClaim(el: Element | null, targetId: number): GestureClaim {
  const values: string[] = [];
  // Up to the widget's <html> itself: touch-action on an ancestor covers its descendants, as in CSS. The widget's own
  // values (TOUCH_ACTION_CLAIM inherits, so an element repeats its nearest declaring ancestor's: the same claim).
  for (let n: Element | null = el ?? HTML; n; n = n === HTML ? null : (parentNodeOf(n) as Element | null)) {
    if (!(n instanceof Element)) break;
    const cs = getComputedStyle(n);
    values.push(cs.getPropertyValue(TOUCH_ACTION_CLAIM).trim() || cs.touchAction);
  }
  return claimOf(values, preventKeys.has(`${targetId}:pointerdown`) || preventKeys.has(`${targetId}:touchstart`));
}

// ───────────────────────── presses: the widget or the bubble (gesture-policy.ts) ─────────────────────────

const arbiter = new GestureArbiter();
/** `arbitrate` from the host: null while the client's own recognizers take the bubble's presses (the native WebViews). */
let bubbleMode: { touch: boolean; rtl: boolean } | null = null;
let rtl = false;
/** The primary pointer the arbiter follows, and its last event as the widget saw it (the base of what the renderer sends for it). */
let pressPointer = -1;
let pressEv: WidgetEvent | null = null;
let holdTimer = 0;
/** A pointer the bubble took: nothing more of it reaches the widget. */
let takenPointer = -1;
/** After a taken press's pointerup: its compatibility mouseup / click are not the widget's either. */
let dropClick = false;
/** A double tap the widget won: its `dblclick` follows the second tap's click. */
let pendingDblclick: WidgetEvent | null = null;
/** Reproducing a phone (`touch`), a mouse press is a finger's for the widget too: `pointerType` 'touch', also on its click. */
let pressAsTouch = false;
let clickAsTouch = false;

/** tweb: from the event as the widget sees it, whose coordinates are already the widget's (no second origin() read). */
function pressPoint(ev: WidgetEvent): { x: number; y: number } {
  const cx = ev.clientX ?? 0, cy = ev.clientY ?? 0;
  return { x: rtl ? HTML.clientWidth - cx : cx, y: cy };
}

function clearHold() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
}

function scheduleHold() {
  clearHold();
  const at = arbiter.holdDeadline();
  if (at === null) return;
  // The arbiter's clock is the events' timeStamp, which shares performance.now()'s origin (tweb: the window's the widget
  // is in, a Document PiP window has its own).
  holdTimer = setTimeout(() => {
    holdTimer = 0;
    if (frozen) return;
    const v = arbiter.tick(Math.max(win.performance.now(), at));
    if (v && pressEv) settle(v, pressEv);
  }, Math.max(0, at - win.performance.now()) + 1) as unknown as number;
}

/**
 * Feeds a primary pointer's down / move / up / cancel to the arbiter (posting the claim at pointerdown) and answers
 * its verdict, or null for an event the arbiter does not follow.
 */
function track(e: PointerEvent, targetEl: Element | null, targetId: number, ev: WidgetEvent): GestureVerdict | null {
  const type = e.type;
  if (type === 'pointerdown') {
    if (!e.isPrimary) return null;
    dropClick = false;
    pendingDblclick = null;
    const claim = gestureClaim(targetEl, targetId);
    post({ type: 'gesture', wants: claim.y, x: claim.x, y: claim.y, hold: claim.hold });
    // Reproducing a phone, the mouse's primary button is a finger; its secondary button stays the menu click.
    const kind: PointerKind = bubbleMode?.touch && e.button !== 2 ? 'touch' : e.pointerType === 'mouse' ? 'mouse' : e.pointerType === 'pen' ? 'pen' : 'touch';
    pressAsTouch = clickAsTouch = kind === 'touch' && e.pointerType === 'mouse';
    if (pressAsTouch) ev.pointerType = 'touch';
    const p = pressPoint(ev);
    pressPointer = e.pointerId;
    pressEv = ev;
    const v = arbiter.down(e.timeStamp, p.x, p.y, claim, kind, e.button);
    scheduleHold();
    return v;
  }
  if (e.pointerId !== pressPointer) return null;
  const p = pressPoint(ev);
  if (pressAsTouch) ev.pointerType = 'touch';
  pressEv = ev;
  if (type === 'pointermove') return arbiter.move(e.timeStamp, p.x, p.y);
  clearHold();
  pressPointer = -1;
  pressAsTouch = false;
  if (type === 'pointerup') return arbiter.up(e.timeStamp, p.x, p.y);
  arbiter.cancel();
  return null;
}

/**
 * Acts on a verdict once the event that produced it has gone to the widget: the widget's own `contextmenu` / `dblclick`
 * for a hold / double tap it claims, and with the renderer playing the bubble, the end of a press the bubble takes.
 */
function settle(v: GestureVerdict, base: WidgetEvent) {
  if (v.event === 'contextmenu') forward({ ...base, type: 'contextmenu' }, true);
  else if (v.event === 'dblclick') pendingDblclick = { ...base, type: 'dblclick', detail: 2 };
  if (!v.cancel || !bubbleMode || base.pointerId === undefined) return;
  forward({ ...base, type: 'pointercancel', button: -1, buttons: 0 }, true);
  takenPointer = base.pointerId;
  ownPointers.delete(base.pointerId);
  clearHold();
  pressPointer = -1;
  pressAsTouch = clickAsTouch = false;
  arbiter.cancel();
  post({ type: 'bubble', action: v.action ?? 'menu', gesture: v.gesture, x: base.clientX ?? 0, y: base.clientY ?? 0, edge: v.edge === true });
}

/** Queues or posts one event for the widget, if it listens for that type (`ALWAYS_FORWARD` aside). */
function forward(ev: WidgetEvent, trusted: boolean) {
  if (!ALWAYS_FORWARD.has(ev.type) && !interest.has(ev.type)) return;
  if (THROTTLED.has(ev.type)) {
    // tweb: one move a frame, carrying the movement of the ones it replaces (as a browser's coalesced event does)
    const key = ev.type + ':' + (ev.pointerId ?? 0);
    const replaced = pendingMoves.get(key);
    if (replaced) {
      ev.movementX = (ev.movementX ?? 0) + (replaced.movementX ?? 0);
      ev.movementY = (ev.movementY ?? 0) + (replaced.movementY ?? 0);
    }
    pendingMoves.set(key, ev);
    if (!moveFrame) moveFrame = win.requestAnimationFrame(flushMoves);
    return;
  }
  // Keep ordering: a queued move must not arrive after the up/click that followed it.
  if (pendingMoves.size) {
    for (const m of pendingMoves.values()) post({ type: 'event', ev: m, trusted: false });
    pendingMoves.clear();
  }
  post({ type: 'event', ev, trusted });
}

function onDetachedImage(e: Event) {
  if (!root.contains(e.currentTarget as Node)) onEvent(e);
}

function onEvent(e: Event) {
  const type = e.type;
  const target = e.target instanceof Node ? e.target : null;
  const targetEl = target instanceof Element ? target : null;

  // Unconditional navigation cancelling. Nothing the validator emits can
  // navigate, but the renderer does not rely on that. A `#fragment` link does
  // not scroll either: the widget does not scroll, and on the Shadow DOM
  // renderer the page that would scroll is the chat.
  if (type === 'click' && targetEl && closest(targetEl, 'a, area')) e.preventDefault();
  // A click without a pointer press (detail 0: Enter or Space on a focused button, assistive technology) is not input the widget gets.
  if (type === 'click' && (e as MouseEvent).detail === 0 && e.isTrusted) {
    e.preventDefault();
    return;
  }

  // A frozen widget still cancels navigation (above) but forwards nothing: there is no runtime to deliver to.
  if (frozen) return;
  // Only events dispatched to (or through) widget nodes are of interest.
  const targetId = target === root || target === null ? ids.get(HTML) ?? 0 : idOf(target);
  if (!targetId) return;
  if (preventKeys.size && e.cancelable && preventKeys.has(`${targetId}:${type}`)) e.preventDefault();
  if (ENGINE_GESTURES.has(type)) return;
  let verdict: GestureVerdict | null = null;
  let ev: WidgetEvent | null = null;
  if (isPointerEvent(e) && (type === 'pointerdown' || type === 'pointermove' || type === 'pointerup' || type === 'pointercancel')) {
    // The end of a press for the host's haptic gate (the start is the claim at pointerdown), listened to or not.
    if ((type === 'pointerup' || type === 'pointercancel') && e.isPrimary && e.isTrusted) post({ type: 'release' });
    // tweb: a new press of that pointer ends the one the bubble took, which a release outside the widget did not
    if (e.pointerId === takenPointer && type !== 'pointerdown') {
      // The bubble's press: nothing more of it, and not the click its release would make.
      if (type === 'pointerup' || type === 'pointercancel') { takenPointer = -1; dropClick = type === 'pointerup'; }
      return;
    }
    if (type === 'pointerdown' && e.pointerId === takenPointer) takenPointer = -1;
    // tweb: a pointer the arbiter does not follow (a hover, another finger) that the widget does not listen for is not
    // serialized at all: serialize() reads the layout
    if ((type === 'pointerdown' ? !e.isPrimary : e.pointerId !== pressPointer) && !interest.has(type)) return;
    ev = serialize(e, targetId);
    verdict = track(e, targetEl, targetId, ev);
    // The bubble takes it at the release (a double tap's second tap): the widget gets pointercancel instead of pointerup.
    if (verdict?.cancel && bubbleMode && type === 'pointerup') {
      settle(verdict, ev);
      takenPointer = -1;
      dropClick = true;
      return;
    }
    // A finger makes a click only for a tap: reproducing a phone with a mouse, a drag or a hold ends without one.
    if (type === 'pointerup' && bubbleMode?.touch && verdict && (verdict.gesture === 'drag-x' || verdict.gesture === 'drag-y' || verdict.gesture === 'hold')) dropClick = true;
  } else if (MOUSE_COMPAT.has(type) && (takenPointer !== -1 || (dropClick && type !== 'mousemove'))) return;
  // A press begun off the widget and let go over it (on the Shadow DOM renderer, a drag from the chat) is no press of
  // the widget's: its release reaches it, but is no gesture. A release is that of the pointer whose buttons changed last.
  // A finger's or a pen's press may still become the chat's scroll, which ends it in pointercancel: its pointerdown is
  // no gesture either, its release is (HTML's activation-triggering input events), and neither is a mouse event of a
  // finger or a pen still down: the mousedown a pen's contact makes at once, its barrel button pressed or let go with the
  // tip down (a mouse pressed while a finger is held makes its own). The type is the input's own: a mouse playing a
  // finger (`pressAsTouch`) scrolls nothing.
  const mayScroll = type === 'pointerdown' ? isPointerEvent(e) && isFingerOrPen(e) : (type === 'mousedown' || type === 'mouseup') && changedFingerDown;
  const trusted = e.isTrusted && !mayScroll && (changedOwn || (type !== 'pointerup' && type !== 'mouseup'));
  if (ev) forward(ev, trusted);
  else if (ALWAYS_FORWARD.has(type) || interest.has(type)) {
    const out = serialize(e, targetId);
    if (type === 'click' && clickAsTouch && out.pointerType === 'mouse') { out.pointerType = 'touch'; clickAsTouch = false; }
    forward(out, trusted);
  } else if (ANIMATION_EVENTS.has(type)) {
    // tweb: full, what is past the moment goes, and then the oldest: a full buffer that waited for a `listen` dropped a
    // later task's events
    const now = sharedNow();
    if (earlyEvents.length >= EARLY_EVENTS_MAX) earlyEvents = earlyEvents.filter((kept) => now - kept.at < EARLY_EVENTS_MS);
    if (earlyEvents.length >= EARLY_EVENTS_MAX) earlyEvents.shift();
    earlyEvents.push({ ev: serialize(e, targetId), at: now });
  }
  if (verdict && ev) settle(verdict, ev);
  if (type === 'click' && pendingDblclick) {
    const dbl = pendingDblclick;
    pendingDblclick = null;
    forward({ ...serialize(e, targetId), type: 'dblclick', detail: 2, pointerId: dbl.pointerId, pointerType: dbl.pointerType }, e.isTrusted);
  }
}

// ───────────────────────── size reporting ─────────────────────────

let lastSize = '';
let lastViewport = '';
function reportSize() {
  // tweb: the size is a layout (the layout budget is counted before)
  checkLayout();
  const viewport = env.viewport();
  const msg: RendererToHost = { type: 'size', width: HTML.clientWidth, height: env.docHeight(), ...viewport };
  const key = JSON.stringify(msg);
  if (key !== lastSize) {
    lastSize = key;
    post(msg);
  }
  // @media, @container and viewport units follow the bubble's size: every box is counted again
  const vp = viewport.innerWidth + 'x' + viewport.innerHeight;
  if (vp !== lastViewport) { lastViewport = vp; paintEverything(); }
  if (paintPending && isConnectedOf(HTML)) { paintPending = false; schedulePaint(); }
}

function flushMoves() {
  moveFrame = 0;
  for (const m of pendingMoves.values()) post({ type: 'event', ev: m, trusted: false });
  pendingMoves.clear();
}

/**
 * tweb: off screen the engine gets no frames and its timers slow down, but CSS and Web Animations would go on in the
 * page (an iframe off screen is throttled by the browser, a shadow root is not). While the host keeps the widget
 * hidden, CSS animations are held by their own property (a pause() call would take them from the widget's CSS for
 * good), from the first cascade layer, which outranks any important declaration of the widget's sheets — an element's
 * own important one outranks every layer, so that one is held in the element's style (`holdPlayState`); transitions,
 * which have no such property, and the engine's scripted animations are paused. Shown again, transitions still paused
 * go on, scripted animations go back to where the engine's timeline has them, unless the engine held, moved or dropped
 * them meanwhile (`AnimationState.startTimes`), and the elements' own play states are the widget's again.
 */
let hostHidden = false;
let hiddenStyle: HTMLElement | null = null;
/** tweb: the elements whose own important `animation-play-state` is held paused while hidden, with the widget's declaration. */
const heldPlayStates = new Map<Element, { value: string; priority: string }>();
/**
 * Holds `el`'s own important play state paused, if it has one: call it where the value there is the widget's. tweb: an
 * important `all` sets one too, whose longhands Chromium reports with no priority (`all: initial !important` and an
 * animation ran on while hidden).
 */
function holdPlayState(el: Element) {
  heldPlayStates.delete(el);
  const style = styleOf(el);
  const important = style.getPropertyPriority('animation-play-state') === 'important' ||
    (style.getPropertyPriority('all') === 'important' && style.getPropertyValue('animation-play-state') !== '');
  if (!important) return;
  // as the declaration itself says (Chromium: no priority for one an important `all` set), given back as it was
  heldPlayStates.set(el, { value: style.getPropertyValue('animation-play-state'), priority: style.getPropertyPriority('animation-play-state') });
  style.setProperty('animation-play-state', 'paused', 'important');
  ownStyleWritten(el);
}
/**
 * tweb: gives `el` back its own play state, held by the renderer. Before an op of the widget's that may change it, too
 * (and `holdPlayState` after): the op acts on what the widget set, and a value the browser refuses (`all: bogus`, a
 * play state it does not know) leaves the widget's — taken again from the style, the renderer's own `paused` had been
 * kept for good.
 */
function releasePlayState(el: Element) {
  const held = heldPlayStates.get(el);
  if (!held) return;
  heldPlayStates.delete(el);
  styleOf(el).setProperty('animation-play-state', held.value, held.priority);
  ownStyleWritten(el);
}
/** Whether a style op of `name` may change an element's own play state (holdPlayState). */
const PLAY_STATE_STYLE = /^((-webkit-)?animation(-play-state)?|all)$/i;
/**
 * tweb: the renderer wrote `el`'s style attribute itself, outside any op of the widget's: a selector of the widget's on
 * the attribute (`[style*=…]`) may match it, or what it reaches, otherwise now — counted as the widget's own write is.
 */
function ownStyleWritten(el: Element) {
  if (paintSheets.styleAttr) paintChanged(el, true);
}
/** Ids of the scripted animations the host paused. */
const hostPaused = new Set<number>();
const pausedTransitions = new Set<Animation>();
/**
 * tweb: the CSS animations and transitions the widget's own call played while hidden (`anim`: `play()`, a seek, a
 * rate), held paused by the host with where the engine put their start: shown, they go on from there. One the widget
 * paused itself is its own, and stays paused.
 */
const heldCss = new Map<Animation, number>();
/** Holds `a`, which the widget's call has just played while hidden, paused till the widget is shown. */
function holdCssForHost(a: Animation) {
  for (const [kept] of heldCss) if (kept.playState === 'idle') heldCss.delete(kept);
  const start = a.startTime;
  if (a.playState !== 'running' || typeof start !== 'number') return;
  try { a.pause(); } catch { return; }
  heldCss.set(a, start);
}
function pauseTransitions() {
  // tweb: one the widget's styles replaced or cancelled meanwhile (its element gone too) is idle: not kept
  for (const a of pausedTransitions) if (a.playState === 'idle') pausedTransitions.delete(a);
  for (const a of animationsOf()) {
    if (!isCSSTransition(a) || a.playState !== 'running') continue;
    try { a.pause(); } catch { continue; }
    pausedTransitions.add(a);
  }
}
const animationsOf = (): Animation[] => {
  try {
    return (root as Document & { getAnimations?: () => Animation[] }).getAnimations?.() ?? [];
  } catch {
    return [];
  }
};
function pauseForHost() {
  // tweb: one the engine removed (or whose update failed) meanwhile is gone: a widget hidden for long that kept starting
  // and cancelling them kept every id
  for (const aid of hostPaused) if (!animations.scripted.has(aid)) hostPaused.delete(aid);
  for (const [aid, a] of animations.scripted) {
    if (a.playState !== 'running') continue;
    try { a.pause(); } catch { continue; }
    hostPaused.add(aid);
  }
}
function setHostHidden(hidden: boolean) {
  if (hidden === hostHidden) return;
  hostHidden = hidden;
  if (hidden) {
    hiddenStyle = createElement(doc, 'style');
    // declared before every other layer: important declarations in the first layer win over all later ones and
    // over unlayered ones (an inline important style still wins)
    setTextContent(hiddenStyle, '@layer tw-hidden{*,*::before,*::after{animation-play-state:paused!important}}');
    insertBefore(HEAD, hiddenStyle, firstChildOf(HEAD));
    for (const node of nodes.values()) if (node instanceof Element) holdPlayState(node);
    pauseForHost();
    pauseTransitions();
    return;
  }
  for (const el of [...heldPlayStates.keys()]) releasePlayState(el);
  // the widget may have emptied its <head> meanwhile
  if (hiddenStyle) { try { removeChild(HEAD, hiddenStyle); } catch {} hiddenStyle = null; }
  if (!frozen) {
    for (const aid of hostPaused) {
      const a = animations.scripted.get(aid), start = animations.startTimes.get(aid);
      if (a && start !== undefined && a.playState === 'paused') { try { a.startTime = start; } catch {} }
    }
    // one the widget's styles replaced or cancelled meanwhile is idle, not paused
    for (const a of pausedTransitions) if (a.playState === 'paused') { try { a.play(); } catch {} }
    for (const [a, start] of heldCss) if (a.playState === 'paused') { try { a.startTime = start; } catch {} }
  }
  hostPaused.clear();
  pausedTransitions.clear();
  heldCss.clear();
  // the scripted animations it resumed count again
  schedulePaint();
}

/** tweb: the window frames are asked of and observers made in, the one the widget's DOM is in (`rebind`). */
let win: Window = window;
function onFrame(time: number) {
  frameReq = 0;
  // on this realm's clock, which the engine's `now` reads
  post({ type: 'frame', time: time + win.performance.timeOrigin - performance.timeOrigin });
}

function onResizeEntries(entries: ResizeObserverEntry[]) {
  const out: { id: number; width: number; height: number }[] = [];
  for (const entry of entries) {
    const id = ids.get(entry.target);
    if (id !== undefined) out.push({ id, width: entry.contentRect.width, height: entry.contentRect.height });
  }
  if (out.length) post({ type: 'resize', entries: out });
}
/** The elements the widget observes the size of, so that a new observer can take them over. */
const observed = new Set<Element>();
let resizeObserver: ResizeObserver = new ResizeObserver(onResizeEntries);

// ───────────────────────── heavy boxes (paint-policy.ts, docs/decisions.md "Heavy boxes") ─────────────────────────
//
// Before a frame is drawn the renderer knows how many of the widget's boxes are heavy (a blurred shadow, a filter, a
// backdrop-filter, opacity below 1, or an animation of one of them): past 16 (2 with backdrop-filter) it draws the
// widget without those effects and reports `limit`; the host stops it. The count is kept incrementally: an applied
// batch, a pointer that moves :hover / :active and an animation event mark the boxes they can reach, and one count per
// frame (requestAnimationFrame, before the frame is drawn) recomputes those boxes from their computed values; a
// stylesheet, the theme, the safe area and the viewport recompute every box. Under `compat` nothing is counted.

/** Counted unless the host says `compat` (fail closed: before the host's `policy`, and for any other value). */
let paintOn = true;
/** `policy.paintReports` (tooling): post the counts whenever they change. */
let paintReports = false;
let lastPaintReport = '';
const paint = new PaintCounter<number>();
/** Elements whose computed values, and their subtrees', may have changed since the last count. */
const paintDirty = new Set<Element>();
/** Elements whose own values may have changed (the chain a press goes through, when only the UA layer's `button:active` can match). */
const paintDirtySelf = new Set<Element>();
/** Every box is recomputed at the next count (a stylesheet, the theme, the safe area, the viewport; the first count). */
let paintAll = true;
let paintFrame = 0;
/** Changes wait for a count while the tree is off the page (a Shadow DOM renderer built before it is attached). */
let paintPending = false;
/** Past a limit: the widget is drawn without effects, takes no more ops, and waits for the host's `frozen`. */
let paintStopped = false;
/** What the widget's stylesheets use: how far a change reaches beyond the element and its subtree; `styleAttr`: a selector on the style attribute. */
let paintSheets = { siblings: false, structural: false, hover: false, active: false, styleAttr: false };
/**
 * Inline properties that can change whether a box is heavy, on the element or below it (a custom property can feed
 * `opacity: var(--x)`; prefixed aliases match too); any other inline property (transform, left, background, …)
 * cannot, unless a selector reads the style attribute. Animations and transitions it starts are rule 5, their events.
 */
const PAINT_STYLE_PROPS = /^--|opacity|filter|box-shadow|^display$|^all$/i;
/** The same in a whole style attribute (a declaration of one of them; an escape may spell one). */
const PAINT_STYLE_TEXT = /--|\\|(?:opacity|filter|box-shadow|display|all)\s*:/i;
/** Elements whose inline style may declare one of them (an over-estimate: set by an op that wrote one, cleared when the attribute is replaced). */
const inlineHeavy = new WeakSet<Element>();
/** The elements a `::before` / `::after` rule may match (its selectors without the pseudo-element): only theirs are computed. */
let pseudoSelector = '';
let paintSheetsDirty = true;
const widgetStyles = new Set<HTMLStyleElement>();
const styleConnected = new WeakMap<HTMLStyleElement, boolean>();
/** The renderer's Web Animations counted under rule 5: animation id → the box key. */
const scriptedCounted = new Map<number, number>();
let scriptedPaint = new WeakMap<Animation, BoxPaint | null>();
const scriptedListened = new WeakSet<Animation>();
/** Box keys: the element, its ::before, its ::after. */
const BEFORE = 1, AFTER = 2;
const backdropOf = (cs: CSSStyleDeclaration) => cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter');

function schedulePaint() {
  if (paintFrame || !paintOn || paintStopped || frozen) return;
  paintFrame = win.requestAnimationFrame(countPaint);
}

/** `el` (and everything under it) may have changed; with a sibling combinator or a structural pseudo-class in the widget's sheets, its siblings too. */
function paintChanged(el: Node | null | undefined, siblings = false) {
  if (!paintOn || paintStopped || !(el instanceof Element)) return;
  const parent = siblings && (paintSheets.siblings || paintSheets.structural) ? parentNodeOf(el) : null;
  paintDirty.add(parent instanceof Element && ids.has(parent) ? parent : el);
  schedulePaint();
}

function paintEverything() {
  if (!paintOn || paintStopped) return;
  paintAll = true;
  schedulePaint();
}

/**
 * tweb: what stood for a text among its siblings before a `data` op: one the op wraps or unwraps (the client's emoji,
 * `outerOf`) adds an element there or takes one away.
 */
let dataOuter: Node | null = null;

/** Before an op: a node about to leave its place (rm, or ins of a node already in the tree) takes its boxes with it. */
function paintBefore(op: RenderOp) {
  if (op.op === 'data') {
    const node = nodes.get(op.id);
    dataOuter = node ? outerOf(node) : null;
    return;
  }
  if (op.op !== 'rm' && op.op !== 'ins') return;
  const node = nodes.get(op.id);
  if (!node || node === HTML || node === HEAD || node === BODY) return;
  // tweb: a text shown with the client's emoji stands in its wrapper
  const parent = parentNodeOf(outerOf(node));
  if (!parent) return;
  if (node instanceof Element) clearBoxes(node);
  // its old siblings may match differently (`+`, `~`, :nth-child(), :last-child, :empty)
  if (paintSheets.siblings || paintSheets.structural) paintChanged(parent);
}

/** After an op: what it can have changed (the subtree of an element whose attribute or style changed, an inserted subtree). */
function paintAfter(op: RenderOp) {
  switch (op.op) {
    case 'el': {
      const el = nodes.get(op.id);
      if (el instanceof HTMLStyleElement) widgetStyles.add(el);
      if (el instanceof Element) for (const [name, value] of op.attrs) if (name.toLowerCase() === 'style' && PAINT_STYLE_TEXT.test(value)) inlineHeavy.add(el);
      if (op.adopt) paintChanged(el);
      return;
    }
    case 'style': {
      if (!paintSheets.styleAttr && !PAINT_STYLE_PROPS.test(op.name)) return;
      const el = nodes.get(op.id);
      if (el instanceof Element) inlineHeavy.add(el);
      paintChanged(el, true);
      return;
    }
    case 'attr': case 'rattr': {
      const el = nodes.get(op.id);
      if (!(el instanceof Element)) return;
      if (el instanceof HTMLStyleElement) { paintSheetsDirty = true; paintEverything(); return; }
      // a style attribute that neither had nor has a declaration of a heavy property changes no box (as a style op)
      if (op.name.toLowerCase() === 'style') {
        const had = inlineHeavy.has(el), has = op.op === 'attr' && PAINT_STYLE_TEXT.test(op.value);
        if (has) inlineHeavy.add(el);
        else inlineHeavy.delete(el);
        if (!had && !has && !paintSheets.styleAttr) return;
      }
      paintChanged(el, true);
      return;
    }
    case 'ins': {
      if (op.parent === 0) return;
      const node = nodes.get(op.id);
      if (node instanceof Element) paintChanged(node, true);
      // a text: :empty; tweb: one shown with the client's emoji stands among its siblings as an element (`+`, `~`)
      else if (node && (paintSheets.structural || (paintSheets.siblings && outerOf(node) !== node))) paintChanged(parentNodeOf(outerOf(node)), true);
      return;
    }
    case 'data': {
      // :empty; tweb: a text the op wrapped or unwrapped (dataOuter) added or took an element among its siblings
      const node = nodes.get(op.id);
      const outer = node ? outerOf(node) : null;
      if (outer && (paintSheets.structural || (paintSheets.siblings && outer !== dataOuter))) paintChanged(parentNodeOf(outer), true);
      return;
    }
    case 'css':
      paintSheetsDirty = true;
      paintEverything();
      return;
  }
}

/** The widget's stylesheets, read again when one changed or was connected or removed: what a change reaches, and which elements may have pseudo-element boxes. */
function refreshSheets() {
  let changed = paintSheetsDirty;
  for (const el of widgetStyles) {
    const on = isConnectedOf(el) as boolean;
    if (styleConnected.get(el) !== on) { styleConnected.set(el, on); changed = true; }
  }
  if (!changed) return;
  paintSheetsDirty = false;
  paintAll = true;
  const flags = { siblings: false, structural: false, hover: false, active: false, styleAttr: false };
  const pseudo: string[] = [];
  const inspect = (selector: string) => {
    const bare = selector.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/\[[^\]]*\]/g, '[]');
    if (/[+~]/.test(bare.replace(/:nth-[a-z-]+\([^)]*\)/gi, ''))) flags.siblings = true;
    if (/:(nth-|first-child|last-child|only-child|first-of-type|last-of-type|only-of-type|empty)/i.test(bare)) flags.structural = true;
    if (/:hover/i.test(bare)) flags.hover = true;
    // tweb: a shadow root's stylesheets have `:active` as `[data-tw-active]` (css-sanitizer.ts)
    if (/:active/i.test(bare) || /\[\s*data-tw-active\b/i.test(selector)) flags.active = true;
    if (/\[\s*style\b/i.test(selector)) flags.styleAttr = true;
    if (!/::?(before|after)\b/i.test(bare)) return;
    // the selectors of the list that name a pseudo-element, without it: a superset of the elements it can match
    let depth = 0, from = 0;
    const parts: string[] = [];
    for (let i = 0; i <= selector.length; i++) {
      const c = selector[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if ((c === ',' && depth === 0) || c === undefined) { parts.push(selector.slice(from, i)); from = i + 1; }
    }
    for (const part of parts) {
      if (!/::?(before|after)\b/i.test(part)) continue;
      pseudo.push(part.replace(/(^|[\s>+~(,])::?(before|after)\b/gi, '$1*').replace(/::?(before|after)\b/gi, '').trim() || '*');
    }
  };
  const walk = (rules: CSSRuleList) => {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i] as CSSRule & { selectorText?: string; cssRules?: CSSRuleList };
      if (typeof r.selectorText === 'string') inspect(r.selectorText);
      if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const el of widgetStyles) {
    const sheet = sheetOf(el) as CSSStyleSheet | null;
    if (sheet) try { walk(sheet.cssRules); } catch {}
  }
  paintSheets = flags;
  pseudoSelector = pseudo.join(',');
  if (pseudoSelector) try { matches(HTML, pseudoSelector); } catch { pseudoSelector = '*'; }
}

/** The boxes of `el` and of everything under it are gone (display: none, removed, moved away). */
function clearBoxes(el: Element) {
  const id = ids.get(el);
  if (id !== undefined) { paint.removeBox(id * 4); paint.removeBox(id * 4 + BEFORE); paint.removeBox(id * 4 + AFTER); }
  for (let c = firstChildOf(el); c; c = nextSiblingOf(c)) if (c instanceof Element) clearBoxes(c);
}

/** A `<button>` that is disabled or held down: its opacity is the button's own dimming, not a heavy effect (paint-policy.ts). */
function buttonState(el: Element): 'disabled' | 'pressed' | undefined {
  if (!(el instanceof HTMLButtonElement)) return undefined;
  if (getAttribute(el, 'disabled') !== null) return 'disabled';
  // tweb: in a shadow root the UA layer dims a pressed button by the renderer's marker (Firefox drops :active); the
  // press itself is the renderer's own record, since a widget can write that attribute too
  return (root instanceof ShadowRoot ? pressed.includes(el) : matches(el, ':active')) ? 'pressed' : undefined;
}

/** What a box adds, from its computed values; `el` for an element's own box (a pseudo-element's has none). */
function stylePaint(cs: CSSStyleDeclaration, display: string, pseudo: boolean, el?: Element): BoxPaint | null {
  return boxPaint({ display, content: pseudo ? cs.content : undefined, boxShadow: cs.boxShadow, filter: cs.filter, backdropFilter: backdropOf(cs), opacity: cs.opacity, button: el ? buttonState(el) : undefined }, pseudo);
}

function pseudoPaint(el: Element, key: number, which: '::before' | '::after') {
  const cs = getComputedStyle(el, which);
  paint.setBox(key, stylePaint(cs, cs.display, true));
}

/** Recomputes the boxes of `el` and of its subtree (`hidden`: an ancestor is display: none). */
function scanBoxes(el: Element, hidden: boolean) {
  const id = ids.get(el);
  // the renderer's own elements (the stopped badge) are no boxes of the widget's
  if (id === undefined) return;
  if (hidden) return clearBoxes(el);
  const cs = getComputedStyle(el);
  const display = cs.display;
  if (hidesSubtree(display)) return clearBoxes(el);
  const key = id * 4;
  paint.setBox(key, stylePaint(cs, display, false, el));
  if (pseudoSelector && matches(el, pseudoSelector)) {
    pseudoPaint(el, key + BEFORE, '::before');
    pseudoPaint(el, key + AFTER, '::after');
  } else {
    paint.setBox(key + BEFORE, null);
    paint.setBox(key + AFTER, null);
  }
  for (let c = firstChildOf(el); c; c = nextSiblingOf(c)) if (c instanceof Element) scanBoxes(c, false);
}

/** Whether `n` or an element above it (up to the widget's root) is display: none; remembered for one count. */
function hiddenAt(n: Node | null, memo: Map<Node, boolean>): boolean {
  if (!(n instanceof Element)) return false;
  let v = memo.get(n);
  if (v !== undefined) return v;
  v = hidesSubtree(getComputedStyle(n).display) || (n !== HTML && hiddenAt(parentNodeOf(n), memo));
  memo.set(n, v);
  return v;
}

function coveredByDirty(el: Element): boolean {
  for (let p = el === HTML ? null : parentNodeOf(el); p instanceof Element; p = p === HTML ? null : parentNodeOf(p)) if (paintDirty.has(p)) return true;
  return false;
}

/** Rule 5 for the renderer's own Web Animations (the shim's `webAnimations`): counted while `running`. */
function syncScriptedPaint() {
  for (const [aid, key] of scriptedCounted) {
    if (animations.scripted.has(aid)) continue;
    paint.endAnimation(key, 'w:' + aid);
    scriptedCounted.delete(aid);
  }
  for (const [aid, a] of animations.scripted) {
    if (!scriptedListened.has(a)) {
      scriptedListened.add(a);
      a.addEventListener('finish', schedulePaint);
      a.addEventListener('cancel', schedulePaint);
    }
    const name = 'w:' + aid;
    let key = -1;
    let p: BoxPaint | null | undefined = null;
    let fresh = false;
    const effect = a.effect as KeyframeEffect | null;
    const id = a.playState === 'running' && effect?.target ? ids.get(effect.target) : undefined;
    if (id !== undefined) {
      p = scriptedPaint.get(a);
      if (p === undefined) {
        let frames: ComputedKeyframe[] = [];
        try { frames = effect!.getKeyframes(); } catch {}
        p = animationPaint(frames as unknown as PaintKeyframe[]);
        scriptedPaint.set(a, p);
        fresh = true;
      }
      if (p) key = id * 4;
    }
    const was = scriptedCounted.get(aid);
    if (was !== undefined && (was !== key || !paint.animating(was, name))) {
      paint.endAnimation(was, name);
      scriptedCounted.delete(aid);
      const target = nodes.get(Math.floor(was / 4));
      if (target instanceof Element) { paintDirtySelf.add(target); schedulePaint(); }
    }
    // tweb: keyframes read again (an `anim` update) count as they are now, an opacity fade turned backdrop-filter too
    if (p && fresh && was === key && paint.animating(key, name)) { paint.endAnimation(key, name); paint.startAnimation(key, name, p); }
    if (p && key >= 0 && !paint.animating(key, name)) { paint.startAnimation(key, name, p); scriptedCounted.set(aid, key); }
  }
}

function countPaint() {
  paintFrame = 0;
  if (!paintOn || paintStopped || frozen || !HTML || !ids.has(HTML)) return;
  // no computed values off the page: counted once the tree is laid out (reportSize)
  if (!isConnectedOf(HTML)) { paintPending = true; return; }
  refreshSheets();
  if (paintAll) {
    paintAll = false;
    paintDirty.clear();
    paintDirtySelf.clear();
    scanBoxes(HTML, false);
  } else {
    const memo = new Map<Node, boolean>();
    for (const el of paintDirty) {
      if (!ids.has(el) || !isConnectedOf(el) || coveredByDirty(el)) continue;
      scanBoxes(el, el !== HTML && hiddenAt(parentNodeOf(el), memo));
    }
    for (const el of paintDirtySelf) {
      const id = ids.get(el);
      if (id === undefined || paintDirty.has(el) || !isConnectedOf(el) || coveredByDirty(el) || hiddenAt(el, memo)) continue;
      const cs = getComputedStyle(el);
      paint.setBox(id * 4, stylePaint(cs, cs.display, false, el));
      if (pseudoSelector && matches(el, pseudoSelector)) {
        pseudoPaint(el, id * 4 + BEFORE, '::before');
        pseudoPaint(el, id * 4 + AFTER, '::after');
      }
    }
    paintDirty.clear();
    paintDirtySelf.clear();
  }
  if (animations.scripted.size || scriptedCounted.size) syncScriptedPaint();
  if (paintReports) {
    const key = paint.heavy + ':' + paint.backdrop;
    if (key !== lastPaintReport) { lastPaintReport = key; post({ type: 'paint', heavy: paint.heavy, backdrop: paint.backdrop }); }
  }
  const verdict = paint.check();
  if (verdict) stopPaint(verdict);
}

/** A CSS animation or transition starts or ends: rule 5 (from its start event until its end or cancel event). */
function onPaintAnimation(e: Event) {
  if (!paintOn || paintStopped || frozen) return;
  const el = e.target;
  const id = el instanceof Element ? ids.get(el) : undefined;
  if (id === undefined) return;
  const ev = e as AnimationEvent & TransitionEvent;
  const pseudo = ev.pseudoElement || '';
  const slot = pseudo === '' ? 0 : pseudo === '::before' ? BEFORE : pseudo === '::after' ? AFTER : -1;
  if (slot < 0) return;
  const key = id * 4 + slot;
  const transition = e.type.startsWith('transition');
  const name = transition ? 't:' + ev.propertyName : 'a:' + ev.animationName;
  if (e.type === 'animationstart' || e.type === 'transitionstart') {
    const p = cssAnimationPaint(el as Element, transition, transition ? ev.propertyName : ev.animationName, pseudo);
    if (!p) return;
    paint.startAnimation(key, name, p);
  } else {
    if (!paint.animating(key, name)) return;
    paint.endAnimation(key, name);
    // its values were last read while the animation applied: read them again
    paintDirtySelf.add(el as Element);
  }
  schedulePaint();
}

/**
 * What the CSS animation `name` (or the transition of property `name`) running on `el` or its pseudo-element adds,
 * from its keyframes (a transition's: its two ends). A transition the engine no longer lists counts by its property
 * alone (its values unknown); an animation it no longer lists has ended (its end event follows).
 */
function cssAnimationPaint(el: Element, transition: boolean, name: string, pseudo: string): BoxPaint | null {
  // tweb: of any realm (isCSSTransition)
  for (const a of getAnimationsOf(el, pseudo ? { subtree: true } : undefined) as Animation[]) {
    if (transition ? !isCSSTransition(a) || a.transitionProperty !== name : !isCSSAnimation(a) || a.animationName !== name) continue;
    const effect = a.effect as KeyframeEffect | null;
    if (!effect || effect.target !== el || (effect.pseudoElement ?? '') !== pseudo) continue;
    try { return animationPaint(effect.getKeyframes() as unknown as PaintKeyframe[]); } catch { break; }
  }
  return transition ? animationPaint([{ offset: 0, [name]: null }, { offset: 1, [name]: null }]) : null;
}

/** :hover and :active move with the pointer, without ops: the elements whose state changed (and their subtrees) are counted again. */
function onPaintInput(e: Event) {
  if (!paintOn || paintStopped || frozen) return;
  const type = e.type;
  if (type === 'toggle') return paintChanged(e.target as Node, true);
  if (type === 'pointerover' || type === 'pointerout') {
    if (!paintSheets.hover) return;
    // the target's chain and the related target's, without their common part
    const a = chainOf(e.target), b = chainOf((e as PointerEvent).relatedTarget);
    const inA = new Set(a), inB = new Set(b);
    for (const el of a) if (!inB.has(el)) paintChanged(el, true);
    for (const el of b) if (!inA.has(el)) paintChanged(el, true);
    return;
  }
  pressChanged(chainOf(e.target));
}

/**
 * A press began or ended on `els` (tweb: and with it the shadow root's `[data-tw-active]`): :active on them; with no
 * :active rule of the widget's only the UA layer's `button:active` can match, which changes the element itself.
 */
function pressChanged(els: Element[]) {
  if (!paintOn || paintStopped || frozen) return;
  for (const el of els) {
    if (paintSheets.active) paintChanged(el, true);
    else { paintDirtySelf.add(el); schedulePaint(); }
  }
}

/** The widget's elements from `t` up to its root. */
function chainOf(t: EventTarget | null): Element[] {
  const out: Element[] = [];
  for (let n: Node | null = t instanceof Element ? t : null; n instanceof Element; n = n === HTML ? null : parentNodeOf(n)) if (ids.has(n)) out.push(n);
  return out;
}

/**
 * Past a limit (paint-policy.ts): the frame is drawn without the effects that cost (blurred shadows, filters,
 * backdrop-filter, opacity), animations stop where they are, and the host hears it (`limit`) and stops the widget;
 * until its `frozen` the renderer takes no more ops. Trusted renderer content only.
 */
function stopPaint(v: PaintVerdict) {
  paintStopped = true;
  if (paintFrame) { win.cancelAnimationFrame(paintFrame); paintFrame = 0; }
  drawWithoutEffects();
  post({ type: 'limit', code: v.code, count: v.count });
}

/**
 * A layer declared before every other one: its !important declarations beat every declaration of the widget's
 * stylesheets, layered or not, and the animations. Pseudo-elements lose their shadows; elements keep their shadows
 * without blur (set inline below, as are what their inline styles would otherwise keep). A disabled button keeps its
 * dimming: it is no heavy effect.
 */
const NO_EFFECTS_CSS = '@layer tw-no-effects{*,::before,::after{filter:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;transition:none!important}' +
  ':not(button[disabled]),::before,::after{opacity:1!important}::before,::after{box-shadow:none!important}}';

function drawWithoutEffects() {
  // Transitions would beat any declaration: they end; animations (CSS and the renderer's Web Animations) pause.
  try {
    for (const a of getAnimationsOf(HTML, { subtree: true }) as Animation[]) {
      try { if (isCSSTransition(a)) a.cancel(); else a.pause(); } catch {}
    }
  } catch {}
  // Read before the layer goes in: a box that was fully transparent stays invisible (hidden) rather than turning opaque.
  const fixes: [CSSStyleDeclaration, string, string][] = [];
  const visit = (el: Element) => {
    if (!ids.has(el)) return;
    const cs = getComputedStyle(el);
    if (hidesSubtree(cs.display)) return;
    const style = styleOf(el);
    if (parseFloat(cs.opacity) === 0) fixes.push([style, 'visibility', 'hidden']);
    if (boxShadowBlurred(cs.boxShadow)) fixes.push([style, 'box-shadow', boxShadowWithoutBlur(cs.boxShadow)]);
    // the element's own declarations would beat the layer: they go
    for (const prop of ['filter', 'backdrop-filter', '-webkit-backdrop-filter', 'opacity']) {
      if (style.getPropertyValue(prop) && !(prop === 'opacity' && buttonState(el) === 'disabled')) fixes.push([style, prop, '']);
    }
    for (let c = firstChildOf(el); c; c = nextSiblingOf(c)) if (c instanceof Element) visit(c);
  };
  visit(HTML);
  const sheet = createElement(doc, 'style');
  setTextContent(sheet, NO_EFFECTS_CSS);
  insertBefore(HEAD, sheet, firstChildOf(HEAD));
  for (const [style, prop, value] of fixes) {
    if (value) style.setProperty(prop, value, 'important');
    else style.removeProperty(prop);
  }
  // tweb: the widget's selectors see the sheet the renderer put in (the layout budget)
  checkLayout(true);
}

// ───────────────────────── tweb: the layout budget (layout-policy.ts, UPSTREAM.md item 14) ─────────────────────────
//
// The page lays the widget out in a task nothing interrupts, and WebKit lays a grid that is a grid's item out again for
// each pass its parent makes, two a level (20 nested grids: 3.2 s). Before anything can lay it out — a batch's end, a
// scroll or a canvas's text inside one, a query, the size — the renderer counts the boxes that layout makes afresh,
// every node once for each pass of the elements above it that may be grids, and past the budget a native renderer keeps
// it takes away the grids from the level where the rest fits (display: none) and stops the widget (`limit`). What may be
// a grid comes from declarations, matched by selector: a computed value is a layout of its own here. Counted again
// after an op that can change it, and after the renderer's own changes to the DOM; a widget without anything that may
// be a grid costs a read of its sheets when they change.

/** Past the budget: the widget's grids from some level on are gone, and it takes no more ops. */
let layoutStopped = false;
/** An op changed what may be a grid, or where (counted before the next layout). */
let layoutDirty = false;
/** A stylesheet of the widget's changed, came or went: the rules are read again. */
let layoutSheetsDirty = true;
/** The rules that may make a grid, their selectors widened to what they may match (layout-policy.ts) and joined. */
let gridSelector = '';
/** One of the widget's @keyframes may set a grid's display: what runs an animation may be a grid. */
let gridKeyframes = false;
/** Elements whose own declarations (the style attribute) may make them grids. */
const inlineGrid = new Set<Element>();
/** A script's animations whose keyframes may set a grid's display, by id: their targets, and the ids by target. */
const gridAnimations = new Map<number, Element>();
const animatedGrid = new Map<Element, Set<number>>();
/** What each <style> of the widget's holds that may make a grid, read from its text (kept while the text is the same). */
const gridRules = new WeakMap<HTMLStyleElement, { text: string; grids: string[]; animated: string[]; keyframes: boolean }>();

const mayGrid = (el: Element) => inlineGrid.has(el) || animatedGrid.has(el) || (gridSelector !== '' && matches(el, gridSelector));

/** Whether `el`'s own declarations may make it a grid; noted for the count. */
function noteInlineGrid(el: Element) {
  const style = styleOf(el);
  if (mayDisplayGrid(style.getPropertyValue('display')) || mayAllGrid(style.getPropertyValue('all')) ||
    (gridKeyframes && mayAnimate(style.getPropertyValue('animation-name'), style.getPropertyValue('animation')))) inlineGrid.add(el);
  else inlineGrid.delete(el);
}

/** The script's animation `aid` now may make `el` a grid (null: makes nothing one, or is gone). */
function noteGridAnimation(aid: number, el: Element | null) {
  const was = gridAnimations.get(aid);
  if (was === el || (!was && !el)) return;
  if (was) {
    const aids = animatedGrid.get(was);
    aids?.delete(aid);
    if (!aids?.size) animatedGrid.delete(was);
    gridAnimations.delete(aid);
  }
  if (el) {
    gridAnimations.set(aid, el);
    let aids = animatedGrid.get(el);
    if (!aids) animatedGrid.set(el, aids = new Set());
    aids.add(aid);
  }
  layoutDirty = true;
}

/** After an op: what it can have changed of what may be a grid, or of where it is. */
function layoutAfter(op: RenderOp) {
  switch (op.op) {
    case 'el': {
      const el = nodes.get(op.id);
      if (!(el instanceof Element)) return;
      if (el instanceof HTMLStyleElement) { widgetStyles.add(el); layoutSheetsDirty = true; }
      if (op.attrs.some(([name]) => name.toLowerCase() === 'style')) noteInlineGrid(el);
      if (op.adopt) layoutDirty = true;
      return;
    }
    // a node comes or goes, and what a structural selector matches with it; a text's too, which `:empty` reads and the
    // client's emoji wrap in an element or unwrap (`+`, `~`)
    case 'ins': case 'rm': case 'data':
      layoutDirty = true;
      return;
    case 'attr': case 'rattr': {
      const el = nodes.get(op.id);
      if (!(el instanceof Element)) return;
      if (op.name.toLowerCase() === 'style') noteInlineGrid(el);
      layoutDirty = true;
      return;
    }
    case 'style': {
      const el = nodes.get(op.id);
      if (!(el instanceof Element) || !/^(?:display|all|animation(?:-name)?)$/i.test(op.name)) return;
      noteInlineGrid(el);
      layoutDirty = true;
      return;
    }
    case 'css':
      layoutSheetsDirty = layoutDirty = true;
      return;
  }
}

/**
 * What a <style> holds that may make a grid. Read from its text, parsed as a sheet of its own: a <style> out of the
 * document has no sheet, and a widget built before its renderer is in the page (or moved, `rebind`) would count none
 * of its rules and be laid out once attached with nothing to count it again. One the widget made but never put in
 * counts too, which only over-counts.
 */
function sheetGrids(el: HTMLStyleElement) {
  const text = textContentOf(el) as string ?? '';
  const known = gridRules.get(el);
  if (known && known.text === text) return known;
  const info = { text, grids: [] as string[], animated: [] as string[], keyframes: false };
  const walk = (rules: CSSRuleList) => {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i] as CSSRule & { selectorText?: string; keyText?: string; style?: CSSStyleDeclaration; cssRules?: CSSRuleList };
      if (r.style) {
        const grid = mayDisplayGrid(r.style.getPropertyValue('display')) || mayAllGrid(r.style.getPropertyValue('all'));
        if (typeof r.selectorText === 'string') {
          if (grid) info.grids.push(r.selectorText);
          else if (mayAnimate(r.style.getPropertyValue('animation-name'), r.style.getPropertyValue('animation'))) info.animated.push(r.selectorText);
        } else if (grid && typeof r.keyText === 'string') info.keyframes = true;
      }
      // rules inside @media, @container, @supports count whatever their condition: it changes without an op
      if (r.cssRules) walk(r.cssRules);
    }
  };
  let rules: CSSRuleList | null = null;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    rules = sheet.cssRules;
  } catch {
    try { rules = (sheetOf(el) as CSSStyleSheet | null)?.cssRules ?? null; } catch {}
  }
  if (!rules) {
    // a browser without constructed sheets, and the <style> out of the document: anything may be a grid, read again next time
    if (text.trim()) info.grids.push('*');
    return info;
  }
  try { walk(rules); } catch { info.grids.push('*'); }
  gridRules.set(el, info);
  return info;
}

/** The widget's stylesheets read again: the rules that may make a grid, and whether an animation may. */
function readGridSheets() {
  layoutSheetsDirty = false;
  const grids: string[] = [];
  const animated: string[] = [];
  let keyframes = false;
  for (const el of widgetStyles) {
    const info = sheetGrids(el);
    grids.push(...info.grids);
    animated.push(...info.animated);
    keyframes ||= info.keyframes;
  }
  if (keyframes !== gridKeyframes) {
    gridKeyframes = keyframes;
    for (const node of nodes.values()) if (node instanceof Element && getAttribute(node, 'style') !== null) noteInlineGrid(node);
  }
  gridSelector = (keyframes ? grids.concat(animated) : grids).map((selector) => {
    const wide = widenSelector(selector);
    // one this cannot parse may match anything
    try { matches(HTML, wide); return wide; } catch { return '*'; }
  }).join(',');
}

/**
 * Before anything lays the widget out: the boxes the layout makes afresh, and past the budget the stop. `always`:
 * counted whatever was counted before, the widget stopped too — after the renderer changed the DOM itself (the stopped
 * badge, the sheet without effects), which the widget's selectors see as they see its own changes.
 */
function checkLayout(always = false) {
  if (!HTML || (!always && (!layoutDirty || layoutStopped))) return;
  layoutDirty = false;
  if (layoutSheetsDirty) readGridSheets();
  // nothing may be a grid: every node is laid out once, which no budget the node cap allows is short of
  if (!gridSelector && !inlineGrid.size && !animatedGrid.size) return;
  // the nodes by how many elements that may be grids are above them (the widget's own nodes; the renderer's are not
  // counted, what is in them is)
  const levels: number[] = [];
  let count = 0;
  const visit = (node: Node, level: number) => {
    const own = ids.has(node);
    if (own) { count++; levels[level] = (levels[level] ?? 0) + 1; }
    if (!(node instanceof Element)) return;
    const below = own && level < LAYOUT_LEVELS - 1 && mayGrid(node) ? level + 1 : level;
    for (let c = firstChildOf(node); c; c = nextSiblingOf(c)) visit(c, below);
  };
  visit(HTML, 0);
  const budget = layoutBudget(count);
  let boxes = 0, keep = 0;
  for (let level = 0; level < levels.length; level++) {
    boxes += (levels[level] ?? 0) * 2 ** level;
    if (boxes > budget) break;
    keep = level;
  }
  if (boxes <= budget) return;
  // every element that may be a grid with `keep` such ones above it goes, and what is under it: what stays is laid out
  // within the budget (trusted renderer content only)
  const cut = (el: Element, level: number) => {
    const grid = ids.has(el) && mayGrid(el);
    if (grid && level >= keep) return styleOf(el).setProperty('display', 'none', 'important');
    for (let c = firstChildOf(el); c; c = nextSiblingOf(c)) if (c instanceof Element) cut(c, grid ? level + 1 : level);
  };
  cut(HTML, 0);
  // the host hears it once and stops the widget
  if (layoutStopped) return;
  layoutStopped = true;
  post({ type: 'limit', code: 'layout-limit', count: Math.min(boxes, Number.MAX_SAFE_INTEGER) });
}

// ───────────────────────── wiring ─────────────────────────

function onMessage(msg: HostToRenderer) {
  switch (msg.type) {
    case 'ops':
      if (paintStopped || layoutStopped) break;
      for (const op of msg.ops) {
        // tweb: a scroll and a canvas's text read the layout (the layout budget is counted before)
        if (op.op === 'prop' || op.op === 'call' || op.op === 'canvas') checkLayout();
        if (layoutStopped) break;
        try { if (paintOn) paintBefore(op); applyOp(op); } catch (e) { violation('op failed: ' + String(e)); }
        if (paintOn) try { paintAfter(op); } catch {}
        try { layoutAfter(op); } catch { layoutDirty = layoutSheetsDirty = true; }
      }
      checkLayout();
      scheduleCanvas();
      if (!env.deferSize) reportSize();
      // a task of the hidden widget (its timers go on, slowly) may have started a transition
      if (hostHidden) pauseTransitions();
      break;
    case 'query': {
      let res: { result: unknown; binary?: ArrayBuffer };
      checkLayout();
      try { res = answer(msg.query); } catch (e) { res = { result: { error: String(e) } }; }
      post({ type: 'result', qid: msg.qid, result: res.result, binary: res.binary }, res.binary ? [res.binary] : []);
      break;
    }
    case 'listen': {
      interest = new Set(msg.types);
      const now = sharedNow();
      // since the task that listens began (not said: nothing)
      const since = msg.since ?? Infinity;
      const early = earlyEvents.filter((e) => now - e.at < EARLY_EVENTS_MS);
      earlyEvents = early.filter(({ ev }) => !interest.has(ev.type));
      for (const e of early) if (interest.has(e.ev.type) && e.at >= since) post({ type: 'event', ev: e.ev, trusted: true });
      break;
    }
    case 'preventDefault':
      preventKeys = new Set(msg.keys);
      break;
    case 'anim': {
      if (paintStopped || layoutStopped) break;
      // tweb: a CSS animation or transition the widget's own call reaches is the widget's to play or pause, not the
      // host's (pausedTransitions); while the host keeps the widget hidden, one it plays is held all the same (heldCss)
      const reached: Animation[] = [];
      for (const r of msg.anims) {
        if (!('css' in r)) continue;
        const a = animations.cssById.get(r.css.origin)?.deref();
        if (!a) continue;
        pausedTransitions.delete(a);
        heldCss.delete(a);
        if (hostHidden && !r.cancelled) reached.push(a);
      }
      try { applyAnims(animations, msg.now, msg.anims, (id) => nodes.get(id)); } catch (e) { violation('anim failed: ' + String(e)); }
      // tweb: a script's keyframes may set a display (the layout budget), counted before the animation is laid out; one
      // removed, or given other keyframes, may not any more
      for (const r of msg.anims) {
        if ('remove' in r) noteGridAnimation(r.aid, null);
        else if ('keyframes' in r) {
          const target = nodes.get(r.target);
          const grid = r.keyframes.some((f) => mayDisplayGrid(f.values.display ?? '') || mayAllGrid(f.values.all ?? ''));
          noteGridAnimation(r.aid, grid && target instanceof Element ? target : null);
        }
      }
      checkLayout();
      // the engine started or moved some while the host keeps the widget hidden
      if (hostHidden) {
        pauseForHost();
        for (const a of reached) holdCssForHost(a);
      }
      // rule 5 for the renderer's Web Animations: their keyframes may have changed, and whether they run
      scriptedPaint = new WeakMap();
      schedulePaint();
      break;
    }
    case 'requestFrame':
      if (frozen || paintStopped || frameReq) break;
      frameReq = win.requestAnimationFrame(onFrame);
      break;
    case 'frozen':
      freeze(String(msg.reason), !!msg.fatal);
      break;
    case 'visibility':
      setHostHidden(!msg.visible);
      break;
    case 'arbitrate':
      rtl = msg.rtl === true;
      bubbleMode = msg.bubble === true ? { touch: msg.touch === true, rtl } : null;
      break;
    case 'theme':
      themeVars = themeVariables(msg.theme);
      applyThemeVariables();
      env.frameColorScheme?.(themeVars['--tg-color-scheme'] === 'dark' ? 'dark' : 'light');
      canvasDirty = true;
      scheduleCanvas();
      paintEverything();
      break;
    case 'safeArea':
      // The UA layer's body padding follows the band; the size observers report the new height.
      safeAreaVars = contentSafeAreaVariables(msg.inset);
      applyThemeVariables();
      paintEverything();
      break;
    case 'policy': {
      // compat counts nothing (the stress kit's measuring runs); anything else is strict
      const on = msg.policy !== 'compat';
      paintReports = msg.paintReports === true;
      lastPaintReport = '';
      if (on && !paintOn) paintAll = true;
      paintOn = on;
      if (!on && paintFrame) { win.cancelAnimationFrame(paintFrame); paintFrame = 0; }
      schedulePaint();
      break;
    }
  }
}

// ───────────────────────── theme and safe-area variables (docs/sdk-v1.md §2.3, §2.4, §2.17, §3.4) ─────────────────────────

let themeVars: Record<string, string> = {};
/** The client's chrome over the widget (docs/sdk-v1.md §2.17): always set, 0 until the host says otherwise. */
let safeAreaVars: Record<string, string> = contentSafeAreaVariables(null);

/** The host's variables, inline and important on the widget's root: no widget stylesheet or root style op overrides them. */
function applyThemeVariables() {
  if (!HTML) return;
  const style = styleOf(HTML);
  for (const name of THEME_VARIABLES) {
    const v = themeVars[name] ?? safeAreaVars[name];
    if (v === undefined) style.removeProperty(name);
    else style.setProperty(name, v, 'important');
  }
}

// ───────────────────────── the canvas of a widget that is not a document (shadow renderer) ─────────────────────────

let canvasDirty = true;
/** What the canvas was given last (`CANVAS_PROPS` order). */
let canvasValues: string[] = [];
/** Painted on the canvas element; `background-attachment` stays `scroll` (fixed would follow the chat page's viewport). */
const CANVAS_PROPS = ['background-color', 'background-image', 'background-position', 'background-size', 'background-repeat', 'background-origin', 'background-clip'];
const transparentColor = (c: string) => c === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(c);

/**
 * CSS paints a document's canvas with the root element's background, or with the body's when the root has none
 * (and a body background then reaches the whole bubble, its margins included). A shadow root has no canvas, so the
 * core does it on `env.canvas` after every change that can move either background. Widget content only: the values
 * are the widget's own computed, validated ones; the bubble's own colour is behind the renderer, never painted here.
 */
function syncCanvas() {
  const canvas = env.canvas;
  if (!canvas || !canvasDirty || !HTML || !BODY) return;
  canvasDirty = false;
  const root = getComputedStyle(HTML);
  const src = root.backgroundImage !== 'none' || !transparentColor(root.backgroundColor) ? root : getComputedStyle(BODY);
  // tweb: every value read before the first write — a computed style read after a write of the host's style is a style
  // recalculation of the page apiece — and nothing written that is already there
  const values = CANVAS_PROPS.map((p) => src.getPropertyValue(p));
  if (values.every((v, i) => v === canvasValues[i])) return;
  canvasValues = values;
  const style = styleOf(canvas);
  CANVAS_PROPS.forEach((p, i) => style.setProperty(p, values[i]));
}

let canvasFrame = 0;
/**
 * tweb (`deferSize`): the canvas follows once a frame, before it paints, and when the host takes the size (`flushSize`)
 * — a sync reads computed styles, and after every batch of a widget being built that was a style recalculation of the
 * whole page apiece.
 */
function scheduleCanvas() {
  if (!env.deferSize) return syncCanvas();
  if (canvasFrame || !canvasDirty || !env.canvas) return;
  canvasFrame = win.requestAnimationFrame(() => {
    canvasFrame = 0;
    syncCanvas();
  });
}

/** The size now, and the canvas with it (the layout is done by then, so reading the backgrounds costs nothing more). */
function flushSize() {
  reportSize();
  syncCanvas();
}

/** Whether a press on `t` may start a text selection: the nearest `user-select` that is not `auto`, from the target up to the root, where the UA layer says none (D18). */
function selectable(t: EventTarget | null): boolean {
  let el: Element | null = t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
  while (el) {
    const cs = getComputedStyle(el);
    const v = cs.userSelect || (cs as unknown as { webkitUserSelect?: string }).webkitUserSelect;
    if (v && v !== 'auto') return v !== 'none';
    if (el === HTML) return false;
    el = el.parentElement;
  }
  return false;
}

// ───────────────────────── frozen state (last render as fallback) ─────────────────────────

/**
 * The host reports that the widget's runtime died (fatal) or was stopped. The
 * DOM stays exactly as it was (the shim flushes ops only at the end of a task,
 * so a kill mid-task leaves the previous consistent state), events and frames
 * stop, and a small badge — a renderer element, never part of the widget's
 * node table — tells the user. Both the stylesheet and the badge are trusted
 * renderer content; nothing here comes from the widget.
 */
function freeze(reason: string, fatal: boolean) {
  if (frozen) return;
  frozen = true;
  if (frameReq) { win.cancelAnimationFrame(frameReq); frameReq = 0; }
  if (moveFrame) { win.cancelAnimationFrame(moveFrame); moveFrame = 0; }
  pendingMoves.clear();
  // tweb: CSS animations and transitions run on without the engine; a frozen widget is a still picture
  for (const a of animationsOf()) { try { a.pause(); } catch {} }
  hostPaused.clear();
  pausedTransitions.clear();
  heldCss.clear();
  setAttribute(HTML, 'data-tw-frozen', fatal ? 'fatal' : 'paused');
  const style = createElement(doc, 'style');
  setTextContent(style, '[data-tw-frozen]{pointer-events:none}[data-tw-frozen=fatal]{filter:grayscale(.3)}' +
    '[data-tw-badge]{position:fixed;right:6px;bottom:6px;z-index:2147483647;font:11px/1.3 system-ui,sans-serif;color:#fff;background:rgba(60,60,60,.75);padding:2px 7px;border-radius:9px;pointer-events:none;user-select:none}');
  insertBefore(HEAD, style, null);
  // tweb: a host that only parks the widget (no reason) keeps the picture without a badge
  if (reason) {
    const badge = createElement(doc, 'div');
    setAttribute(badge, 'data-tw-badge', fatal ? 'fatal' : 'paused');
    setTextContent(badge, reason);
    insertBefore(BODY, badge, null);
  }
  // tweb: the widget's selectors see what the renderer put in as they see their own changes (the layout budget)
  checkLayout(true);
}

let sizeObservers: ResizeObserver[] = [];
let offViewport: (() => void) | null = null;

/** Input the chat keeps (SWALLOWED): never forwarded to the widget, and without its default action inside it. */
function swallow(e: Event) {
  if (e.type === 'mousedown' || e.type === 'selectstart') {
    // No focus move and no selection from a press, unless it lands on text the widget made selectable (user-select: text,
    // D18); the press itself still reaches the widget (pointerdown, mousedown, :active).
    if (e.cancelable && !selectable(e.target)) e.preventDefault();
    return;
  }
  if (e.type === 'focusin') {
    const t = e.target;
    if (t instanceof HTMLElement || t instanceof SVGElement) (t instanceof SVGElement ? SVGElement.prototype.blur : HTMLElement.prototype.blur).call(t);
    return;
  }
  // Default actions only: on the Shadow DOM renderer the chat page's own handlers (its message menu) still see the event.
  if (e.cancelable) e.preventDefault();
}

/**
 * tweb: the press held on the widget, as `[data-tw-active]` on the pressed element and its ancestors — what `:active`
 * becomes in a shadow root's stylesheets (css-sanitizer.ts): Firefox applies no `:active` after the mousedown that
 * `swallow` cancels.
 */
let pressed: Element[] = [];
/**
 * tweb: the pointers whose trusted press began on the widget, until they are let go — the only ones it may capture — and
 * whether the pointer whose buttons changed last was one of them: pressed, let go (the window hears a release before the
 * root does) or chorded (a button pressed or let go while another is held: a pointermove and its mouse event, no
 * pointerdown or pointerup). A compatibility mouse event follows its pointer's change at once.
 */
const ownPointers = new Set<number>();
let changedOwn = false;
/** Of those, the fingers' and pens' still down (a press of theirs is no gesture before its release), and whether the pointer whose buttons changed last is one. */
const fingersDown = new Set<number>();
let changedFingerDown = false;
const isFingerOrPen = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen';
function press(e: Event) {
  if (e.isTrusted) {
    const id = (e as PointerEvent).pointerId;
    ownPointers.add(id);
    if (isFingerOrPen(e as PointerEvent)) fingersDown.add(id);
    changedOwn = true;
    changedFingerDown = fingersDown.has(id);
  }
  if ((e as PointerEvent).button !== 0) return;
  release();
  for (let n = e.target instanceof Element ? e.target : null; n; n = parentNodeOf(n) as Element | null) {
    if (!(n instanceof Element)) break;
    n.setAttribute('data-tw-active', '');
    pressed.push(n);
    if (n === HTML) break;
  }
  pressChanged(pressed);
}
function release() {
  const was = pressed;
  for (const n of was) n.removeAttribute('data-tw-active');
  pressed = [];
  // tweb: wherever the press ends (the window hears one let go outside the widget, where the root's paint listeners do not)
  pressChanged(was);
}
function buttonsChanged(e: Event) {
  if (!e.isTrusted || (e as PointerEvent).button === -1) return;
  const id = (e as PointerEvent).pointerId;
  changedOwn = ownPointers.has(id);
  changedFingerDown = fingersDown.has(id);
}
/** A pointer let go anywhere in the window (a press ends wherever its pointer is let go). */
function letGo(e: Event) {
  const id = (e as PointerEvent).pointerId;
  changedOwn = ownPointers.delete(id);
  fingersDown.delete(id);
  changedFingerDown = false;
  release();
}

function init(s: Send) {
  send = s;
  ({ html: HTML, head: HEAD, body: BODY } = env.roots());
  // The renderer's own stylesheet (trusted, from the profile): the root and text defaults, text not selectable unless the
  // widget says user-select: text, the client-styled <button>.
  const ua = createElement(doc, 'style');
  setTextContent(ua, (root instanceof ShadowRoot ? PROFILE_UA_STYLESHEET.replace(/:active/g, '[data-tw-active]') : PROFILE_UA_STYLESHEET) +
    // tweb: the client's emoji elements (showText)
    (env.emoji ? CLIENT_TEXT_CSS : ''));
  insertBefore(HEAD, ua, firstChildOf(HEAD));
  root.addEventListener('pointerdown', press, true);
  root.addEventListener('pointermove', buttonsChanged, true);
  for (const type of SWALLOWED) root.addEventListener(type, swallow, { capture: true, passive: false });
  for (const type of ALL_EVENTS) root.addEventListener(type, onEvent, { capture: true, passive: false });
  // Chromium dispatches enter/leave events only to nodes that listen for them or have an ancestor element with a
  // capturing listener; a shadow root is no element, so without this the widget never gets pointerenter / mouseenter.
  if (root instanceof ShadowRoot) for (const type of ENTER_LEAVE) root.host.addEventListener(type, noop, true);
  for (const type of ['auxclick', 'dragstart', 'dblclick']) root.addEventListener(type, (e) => e.preventDefault(), true);
  for (const type of PAINT_ANIMATION_EVENTS) root.addEventListener(type, onPaintAnimation, true);
  for (const type of PAINT_INPUT_EVENTS) root.addEventListener(type, onPaintInput, true);
  win = HTML.ownerDocument.defaultView ?? window;
  // a press ends wherever the pointer is let go
  win.addEventListener('pointerup', letGo, true);
  win.addEventListener('pointercancel', letGo, true);
  observeOwnSize();
  reportSize();
}

/** The observers of the widget's own size, the viewport and the colour scheme, made in `win`. */
function observeOwnSize() {
  const RO = (win as Window & { ResizeObserver: typeof ResizeObserver }).ResizeObserver;
  sizeObservers = [new RO(reportSize), new RO(reportSize)];
  sizeObservers[0].observe(HTML);
  sizeObservers[1].observe(BODY);
  const offResize = env.onViewportResize(reportSize);
  const offScheme = env.onColorSchemeChange(() => post({ type: 'media' }));
  offViewport = () => { offResize(); offScheme(); };
}

function rebind() {
  // tweb: a <style> whose host moved in the DOM (the client places the widget, Document Picture-in-Picture takes the
  // client) is parsed again from its text, without the touch-action it was given
  for (const el of root.querySelectorAll('style')) widenSheet(el, true);
  const next = HTML?.ownerDocument.defaultView;
  if (!next || next === win) return;
  const prev = win;
  win = next;
  prev.removeEventListener('pointerup', letGo, true);
  prev.removeEventListener('pointercancel', letGo, true);
  win.addEventListener('pointerup', letGo, true);
  win.addEventListener('pointercancel', letGo, true);
  // a frame asked of a hidden window never comes, and the engine asks for one only once
  if (frameReq) { prev.cancelAnimationFrame(frameReq); frameReq = win.requestAnimationFrame(onFrame); }
  if (moveFrame) { prev.cancelAnimationFrame(moveFrame); moveFrame = win.requestAnimationFrame(flushMoves); }
  if (canvasFrame) { prev.cancelAnimationFrame(canvasFrame); canvasFrame = 0; scheduleCanvas(); }
  if (paintFrame) { prev.cancelAnimationFrame(paintFrame); paintFrame = 0; schedulePaint(); }
  // the scripted animations go on in the new document's timeline, where they were (a hidden window's stands still)
  const toNext = prev.performance.timeOrigin - win.performance.timeOrigin;
  for (const [aid, a] of animations.scripted) {
    const timeline = ((a.effect as KeyframeEffect | null)?.target as Element | null | undefined)?.ownerDocument.timeline;
    if (!timeline || a.timeline === timeline) continue;
    const time = a.currentTime, running = a.playState === 'running';
    try {
      a.timeline = timeline;
      if (running && time !== null) a.currentTime = time;
    } catch {}
    const start = animations.startTimes.get(aid);
    if (start === undefined) continue;
    // one the host paused while hidden starts, once shown, where the engine's clock has it: the moment it was given, in
    // the new timeline's terms (each counts from its window's time origin)
    animations.startTimes.set(aid, typeof a.startTime === 'number' ? a.startTime : start + toNext);
  }
  resizeObserver.disconnect();
  resizeObserver = new (win as Window & { ResizeObserver: typeof ResizeObserver }).ResizeObserver(onResizeEntries);
  for (const el of observed) resizeObserver.observe(el);
  for (const o of sizeObservers) o.disconnect();
  offViewport?.();
  observeOwnSize();
  reportSize();
}

function destroy() {
  for (const type of ALL_EVENTS) root.removeEventListener(type, onEvent, { capture: true });
  for (const type of SWALLOWED) root.removeEventListener(type, swallow, { capture: true });
  root.removeEventListener('pointerdown', press, true);
  root.removeEventListener('pointermove', buttonsChanged, true);
  win?.removeEventListener('pointerup', letGo, true);
  win?.removeEventListener('pointercancel', letGo, true);
  release();
  ownPointers.clear();
  fingersDown.clear();
  if (root instanceof ShadowRoot) for (const type of ENTER_LEAVE) root.host.removeEventListener(type, noop, true);
  for (const type of PAINT_ANIMATION_EVENTS) root.removeEventListener(type, onPaintAnimation, true);
  for (const type of PAINT_INPUT_EVENTS) root.removeEventListener(type, onPaintInput, true);
  if (paintFrame) { win.cancelAnimationFrame(paintFrame); paintFrame = 0; }
  for (const o of sizeObservers) o.disconnect();
  sizeObservers = [];
  offViewport?.();
  offViewport = null;
  resizeObserver.disconnect();
  observed.clear();
  if (frameReq) { win.cancelAnimationFrame(frameReq); frameReq = 0; }
  if (moveFrame) { win.cancelAnimationFrame(moveFrame); moveFrame = 0; }
  if (canvasFrame) { win.cancelAnimationFrame(canvasFrame); canvasFrame = 0; }
  clearHold();
  send = () => {};
}

return { init, onMessage, flushSize, rebind, destroy };
}
