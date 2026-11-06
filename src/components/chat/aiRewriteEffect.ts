import liteMode from '@helpers/liteMode';
import fadeOutFromCurrent from '@helpers/dom/fadeOutFromCurrent';
import removeWithAnimations from '@helpers/dom/removeWithAnimations';
import pickKeys from '@helpers/object/pickKeys';
import {CROSS_FADE_KEYFRAMES} from '@helpers/dom/crossfadeContent';
import styles from '@components/chat/aiRewriteEffect.module.scss';
import AiRewriteGlow, {type GlowTiming} from '@components/chat/aiRewriteGlow';

/**
 * The composer while the AI editor rewrites what is about to be sent, after Telegram for iOS's: a halo comes up round
 * the field, and sheens of light run through its glass and its letters along the line, from where it starts. When the
 * new text comes, the old one goes out of focus upwards and fades, and the new one comes in word after word, each out
 * of focus and out of place, a stray glyph for each of its letters at first and lit, settling into its own glyphs in
 * the text's color. Then the light goes out, gently, as the message goes.
 *
 * Nothing of it is laid out or drawn again on the way: the text is drawn once over the field's own (which hides while
 * new words come in) and only moved, faded and blurred, and a sheen lights the letters through a window that moves
 * one way while the letters in it move back. At the reduced level the halo only fades and the text crossfades; with
 * animations off the text is just replaced.
 */

// * a sheen, in pixels of the field: its front, the light ahead of it, and the wake it leaves
const AHEAD = 50;
const WAKE = 220;
// * the sheens set off one after another, each crossing the field in `CROSSING` of every `PERIOD`, with a lean
const PERIOD = 1900;
const CROSSING = 1300;
const PASSES = [{delay: 0, strength: 1}, {delay: 950, strength: .6}];
const LEAN = 10;
// * the first is on its way already when the light comes up
const LEAD_IN = 300;
const TIMING: GlowTiming = {period: PERIOD, crossing: CROSSING, ahead: AHEAD, wake: WAKE, lean: LEAN, sheens: PASSES};

const HALO_IN = 150;
const STOP_OUT = 200;
const LIGHT_OUT = 600;
// * the light goes out after the text has settled, by when the message is on its way
const LIGHT_TAIL = 200;

// * the new text: all its words within `WORDS_IN`, each settling in `WORD_FOCUS` and drawn over the field's own for
// * `WORD_HANDOVER` more; how many pieces it is drawn in at most (words, then runs of a line)
const WORDS_IN = 700;
const WORD_FOCUS = 140;
const WORD_HANDOVER = 100;
const WORD_COOL = 100;
const WORD_STRAY = 98;
const MAX_WORDS = 48;
const DISSOLVE = 280;
const CROSSFADE = 200;

type TextPiece = {
  text: string,
  left: number,
  top: number,
  width: number,
  height: number,
  style: TextStyle
};

// * what of a piece's computed style draws its glyphs, taken as it is measured: a node replaced since has none
const TEXT_STYLE = [
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant', 'fontFeatureSettings',
  'fontVariationSettings', 'letterSpacing', 'wordSpacing', 'textTransform', 'direction'
] as const;
type TextStyle = Pick<CSSStyleDeclaration, typeof TEXT_STYLE[number]>;

function takeTextStyle(element: Element): TextStyle {
  return pickKeys(getComputedStyle(element), TEXT_STYLE);
}

type Stage = 'idle' | 'waiting' | 'revealing' | 'done';

const ANIMATION: KeyframeAnimationOptions = {fill: 'both'};

// * how lit a point is `distance` ahead of a front (negative: in its wake)
function intensity(distance: number) {
  if(distance >= 0) return Math.exp(-distance * distance / (2 * 11 * 11));
  return .6 * Math.exp(distance / 55) + .4 * Math.exp(-distance * distance / (2 * 7 * 7));
}

// * the sheen's light across its window, as a mask: from deep in its wake to just ahead of its front, which goes along
// * the line (mirrored right to left)
function sheenMask(rtl: boolean) {
  const distances = [-220, -160, -110, -75, -50, -30, -15, -7, 0, 5, 11, 18, 26, 35, 50];
  const stops = distances.map((distance) => {
    const at = (distance + WAKE) / (AHEAD + WAKE) * 100;
    return `rgba(0, 0, 0, ${(intensity(distance) * .88).toFixed(3)}) ${at.toFixed(2)}%`;
  });
  return `linear-gradient(${rtl ? 270 - LEAN : 90 + LEAN}deg, ${stops.join(', ')})`;
}

// * mostly at an even speed, a little eased at both ends
function crossingKeyframes(width: number, offset: number, rtl: boolean, inverse?: boolean): Keyframe[] {
  const from = -AHEAD - 20, to = width + WAKE;
  const crossing = CROSSING / PERIOD;
  const at = (progress: number) => {
    const eased = progress * .55 + progress * progress * (3 - 2 * progress) * .45;
    const front = from + (to - from) * eased;
    // * the window's left edge, from the field's (`offset` is where what it moves in starts)
    const x = (rtl ? width - front - AHEAD : front - WAKE) - offset;
    return `translateX(${(inverse ? -x : x).toFixed(1)}px)`;
  };
  // * as finely as the shader that lights the glass on the same clock draws it
  const keyframes: Keyframe[] = Array.from({length: 25}, (_, index) => index / 24).map((progress) => ({transform: at(progress), offset: progress * crossing}));
  keyframes.push({transform: at(0), offset: Math.min(.9999, crossing + .0001)}, {transform: at(0), offset: 1});
  return keyframes;
}

const STRAY_SETS = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
  'αβγδεζηθικλμνξοπρστυφχψω',
  'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
  'אבגדהוזחטיכלמנסעפצקרשת',
  'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
  '0123456789'
];

// * a letter of the same script in place of each one, the rest as it is
function strayText(text: string) {
  let stray = '';
  for(const char of text) {
    const set = STRAY_SETS.find((set) => set.includes(char));
    stray += set ? set[Math.floor(Math.random() * set.length)] : char;
  }
  return stray;
}

// * the field's text as it is laid out now, in pieces drawn where its glyphs are (in `root`, as it is scrolled): by
// * word, or by the run of a line, and only what can be seen of it
function measureText(input: HTMLElement, root: HTMLElement, byWord: boolean) {
  const rootRect = root.getBoundingClientRect();
  const origin = {left: rootRect.left - root.scrollLeft, top: rootRect.top - root.scrollTop};
  const view = input.getBoundingClientRect();
  const pieces: (TextPiece & {node: Text, start: number, end: number})[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
  const styleOf = new Map<Element, TextStyle>();
  for(let node = walker.nextNode() as Text; node; node = walker.nextNode() as Text) {
    const parent = node.parentElement;
    if(!parent) continue;
    let style = styleOf.get(parent);
    if(!style) styleOf.set(parent, style = takeTextStyle(parent));
    for(const {0: word, index} of node.data.matchAll(/\S+/g)) {
      range.setStart(node, index);
      range.setEnd(node, index + word.length);
      const rects = range.getClientRects();
      // * a word broken over lines: by its letters, each line's
      const parts = rects.length > 1 ? splitByLines(node, index, word.length, range) : [{start: index, end: index + word.length, rect: rects[0]}];
      for(const {start, end, rect} of parts) {
        if(!rect || rect.bottom <= view.top || rect.top >= view.bottom || !rect.width) continue;
        pieces.push({
          text: node.data.slice(start, end),
          left: rect.left - origin.left,
          top: rect.top - origin.top,
          width: rect.width,
          height: rect.height,
          style,
          node,
          start,
          end
        });
      }
    }
  }

  if(byWord && pieces.length <= MAX_WORDS) return pieces;

  // * the words of a line in one piece, as long as they are of one text node
  const runs: typeof pieces = [];
  for(const piece of pieces) {
    const last = runs[runs.length - 1];
    if(last && last.node === piece.node && Math.abs(last.top - piece.top) < 1) {
      const right = Math.max(last.left + last.width, piece.left + piece.width);
      last.left = Math.min(last.left, piece.left);
      last.width = right - last.left;
      last.end = piece.end;
      last.text = piece.node.data.slice(last.start, last.end);
    } else {
      runs.push({...piece});
    }
  }
  return runs;
}

function splitByLines(node: Text, index: number, length: number, range: Range) {
  const parts: {start: number, end: number, rect: DOMRect}[] = [];
  for(let i = index; i < index + length; ++i) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const rect = range.getBoundingClientRect();
    const last = parts[parts.length - 1];
    if(last && Math.abs(last.rect.top - rect.top) < 1) {
      last.end = i + 1;
      last.rect = new DOMRect(Math.min(last.rect.left, rect.left), last.rect.top, Math.max(last.rect.right, rect.right) - Math.min(last.rect.left, rect.left), last.rect.height);
    } else {
      parts.push({start: i, end: i + 1, rect});
    }
  }
  return parts;
}

// * a piece drawn in the very glyphs the field has for it, in its color unless the class gives another
function drawPiece(piece: TextPiece, text: string, className: string, ownColor?: boolean) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  const {color, ...style} = piece.style;
  Object.assign(element.style, style, {
    left: piece.left + 'px',
    top: piece.top + 'px',
    width: piece.width + 'px',
    height: piece.height + 'px',
    lineHeight: piece.height + 'px'
  });
  if(ownColor) element.style.color = color;
  return element;
}

export default class AiRewriteEffect {
  private stage: Stage = 'idle';
  private level: number;
  private rtl: boolean;
  private halo: HTMLElement;
  private glass: HTMLElement;
  private glow: AiRewriteGlow;
  private text: HTMLElement;
  private old: HTMLElement;
  private words: HTMLElement;
  private inputFade: Animation;
  private finishReveal: () => void;

  private field: HTMLElement;
  private root: HTMLElement;
  private textBox: HTMLElement;
  private input: HTMLElement;

  /**
   * `field` is the composer's capsule, with the halo round it and the light through its glass, under all it holds (a
   * reply's or a link's plate included); `root` what the text is drawn over in (it clips it as the field does);
   * `textBox` what the field's text stands in, moved and clipped in it as the field changes height (the new words are
   * drawn there, to stay on its glyphs as the field grows round them); `input` the field itself
   */
  constructor(options: {field: HTMLElement, root: HTMLElement, textBox: HTMLElement, input: HTMLElement}) {
    this.field = options.field;
    this.root = options.root;
    this.textBox = options.textBox;
    this.input = options.input;
  }

  /** the light comes up and runs until the new text comes or it is stopped */
  public start() {
    this.level = liteMode.getAnimationLevel();
    if(!this.level || this.stage !== 'idle') return;
    this.stage = 'waiting';
    this.rtl = getComputedStyle(this.input).direction === 'rtl';

    // * the sheens are decorative motion: only at the full level; the reduced one has the halo alone
    if(this.level < 2) {
      this.showHalo();
      return;
    }

    const fieldRect = this.field.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    const mask = sheenMask(this.rtl);
    const rootOffset = rootRect.left - fieldRect.left;

    this.text = document.createElement('div');
    this.text.className = styles.text;
    // * copies of the field's text, drawn: the field itself is what is read
    this.text.setAttribute('aria-hidden', 'true');
    this.old = document.createElement('div');
    this.old.className = styles.layer;
    this.text.append(this.old);

    const pieces = measureText(this.input, this.root, false);
    let clock: Animation;
    const bands = PASSES.map(({delay, strength}) => {
      const timing: KeyframeAnimationOptions = {duration: PERIOD, iterations: Infinity, delay: delay - LEAD_IN};
      // * the letters, lit through a window that crosses the field while they move back in it
      const letterBand = this.makeBand(mask, strength);
      const letters = document.createElement('div');
      letters.className = styles.letters;
      letters.append(...pieces.map((piece) => drawPiece(piece, piece.text, styles.piece)));
      letterBand.append(letters);
      this.old.append(letterBand);
      const crossing = this.animate(letterBand, crossingKeyframes(fieldRect.width, rootOffset, this.rtl), timing);
      clock ??= crossing;
      this.animate(letters, crossingKeyframes(fieldRect.width, rootOffset, this.rtl, true), timing);
      return {timing, strength};
    });
    this.root.append(this.text);

    // * the glass and round it: drawn by the shader on the letters' clock (the first sheen's local time, from where
    // * the light set off), or else by plain sheens and a halo
    try {
      this.glow = new AiRewriteGlow(this.field, TIMING, () => (clock.currentTime as number ?? 0) + LEAD_IN, this.rtl);
      this.halo = this.glow.exterior;
      this.glass = this.glow.interior;
      this.animate(this.halo, CROSS_FADE_KEYFRAMES, HALO_IN);
      this.animate(this.glass, CROSS_FADE_KEYFRAMES, HALO_IN);
    } catch{
      this.showHalo();
      this.glass = document.createElement('div');
      this.glass.className = styles.glass;
      for(const {timing, strength} of bands) {
        const glassBand = this.makeBand(mask, strength);
        this.glass.append(glassBand);
        this.animate(glassBand, crossingKeyframes(fieldRect.width, 0, this.rtl), timing);
      }
      this.field.prepend(this.glass);
    }
    toggleLight(this.field, true);
  }

  private showHalo() {
    this.halo = document.createElement('div');
    this.halo.className = styles.halo;
    this.field.append(this.halo);
    this.animate(this.halo, CROSS_FADE_KEYFRAMES, HALO_IN);
  }

  /**
   * The new text comes: `replace` puts it into the field. Resolves once it has settled there (at once when stopped
   * meanwhile), with whether `replace` did; the light goes out a moment later by itself.
   */
  public async reveal(replace: () => boolean) {
    if(this.stage !== 'waiting' || this.level < 1) {
      this.stage = 'done';
      return replace();
    }

    this.stage = 'revealing';
    const {input, root} = this;
    const before = this.level > 1 ? measureText(input, root, false) : undefined;
    if(!replace()) {
      this.stop();
      return false;
    }

    let duration: number;
    if(this.level > 1) {
      // * the old text goes out of focus upwards and fades, lit as it was
      this.old.prepend(...before.map((piece) => drawPiece(piece, piece.text, styles.piece, true)));
      this.animate(this.old, [
        {opacity: 1, transform: 'none', filter: 'blur(0)'},
        {opacity: 0, transform: 'translateY(-6px)', filter: 'blur(6px)'}
      ], {duration: DISSOLVE, easing: 'ease-in-out'});

      duration = this.revealWords();
    } else {
      // * reduced: the new text fades in where it stands
      this.inputFade = this.animate(input, CROSS_FADE_KEYFRAMES, CROSSFADE);
      duration = CROSSFADE;
    }

    // * the light goes out as the message goes, gone a moment after
    const lightOut = Math.min(LIGHT_OUT, duration + LIGHT_TAIL);
    this.later(() => this.fadeLight(lightOut), duration + LIGHT_TAIL - lightOut);

    await new Promise<void>((resolve) => {
      this.finishReveal = resolve;
      this.later(resolve, duration);
    });
    this.finishReveal = undefined;
    this.handOver();
    if(this.stage === 'revealing') this.stage = 'done';
    return true;
  }

  /** all goes at once: the text shows as it is, the light goes out quickly */
  public stop() {
    if(this.stage === 'idle' || this.stage === 'done') return;
    const wasRevealing = this.stage === 'revealing';
    this.stage = 'done';
    if(wasRevealing) {
      this.finishReveal?.();
      this.handOver();
    }
    this.fadeLight(STOP_OUT);
  }

  private makeBand(mask: string, strength: number) {
    const band = document.createElement('div');
    band.className = styles.band;
    band.style.width = AHEAD + WAKE + 'px';
    band.style.maskImage = band.style.webkitMaskImage = mask;
    band.style.opacity = '' + strength;
    return band;
  }

  // * the field hides behind its new words, each coming in after the one before
  private revealWords() {
    const {input, textBox} = this;
    const words = measureText(input, textBox, true);
    // * only its letters (the copies stand for them): a photo, a custom emoji or a quote's bar stays where it is. The
    // * editor's own classes are its own: it is changed by its style
    input.style.setProperty('-webkit-text-fill-color', 'transparent');
    const layer = this.words = document.createElement('div');
    layer.className = styles.layer;
    layer.setAttribute('aria-hidden', 'true');
    textBox.append(layer);

    const stagger = WORDS_IN / Math.max(1, words.length);
    const length = WORD_FOCUS + WORD_HANDOVER;
    words.forEach((piece, index) => {
      const word = drawPiece(piece, '', styles.word);
      const stray = drawPiece(piece, strayText(piece.text), styles.wordGlow);
      const glow = drawPiece(piece, piece.text, styles.wordGlow);
      const settled = drawPiece(piece, piece.text, styles.wordSettled, true);
      for(const element of [stray, glow, settled]) element.style.left = element.style.top = '0';
      word.append(stray, glow, settled);
      layer.append(word);

      const delay = index * stagger;
      // * out of focus and out of place to sharp and settled
      this.animate(word, [{opacity: 0}, {opacity: 1, offset: 100 / length}, {opacity: 1}], {duration: length, delay});
      this.animate(word, [
        {transform: 'translateY(3px) scale(.96)'},
        {transform: 'none'}
      ], {duration: WORD_FOCUS, delay, easing: 'cubic-bezier(.2, .9, .3, 1)'});
      this.animate(word, [
        {filter: 'blur(7px)'},
        {filter: 'blur(3px)', offset: .7, easing: 'ease-out'},
        {filter: 'blur(0)'}
      ], {duration: WORD_FOCUS, delay, easing: 'ease-out'});
      // * stray glyphs, then its own, lit, then in the text's color
      const resolved = WORD_STRAY / length, focus = WORD_FOCUS / length, cool = (WORD_FOCUS - WORD_COOL) / length;
      this.animate(stray, [{opacity: 1}, {opacity: 1, offset: resolved}, {opacity: 0, offset: resolved}, {opacity: 0}], {duration: length, delay});
      this.animate(glow, [{opacity: 0}, {opacity: 0, offset: resolved}, {opacity: 1, offset: resolved}, {opacity: 1, offset: focus}, {opacity: 0, offset: focus}, {opacity: 0}], {duration: length, delay});
      this.animate(settled, [{opacity: 0}, {opacity: 0, offset: cool}, {opacity: 1, offset: focus}, {opacity: 1}], {duration: length, delay});
    });

    return Math.max(0, words.length - 1) * stagger + length;
  }

  // * the field's own text takes over, drawn on the very pixels its copy was
  private handOver() {
    this.input.style.removeProperty('-webkit-text-fill-color');
    this.inputFade?.cancel();
    this.inputFade = undefined;
    for(const element of [this.text, this.words]) {
      if(element) removeWithAnimations(element);
    }
    this.text = this.old = this.words = undefined;
  }

  // * the halo and the glass go out; so do the lit letters while there is no new text yet, which gives way itself
  private fadeLight(duration: number) {
    const withText = this.stage !== 'revealing';
    const elements = [this.halo, this.glass, withText ? this.text : undefined].filter(Boolean);
    const {glow, glass, field} = this;
    this.halo = this.glass = this.glow = undefined;
    if(withText) this.text = this.old = undefined;
    Promise.all(elements.map((element) => {
      // * gone with what it plays: the sheens run on forever, and what holds its last frame would come back if left
      return fadeOutFromCurrent(element, duration).finished.catch(() => {}).then(() => removeWithAnimations(element));
    })).then(() => {
      glow?.destroy();
      if(glass) toggleLight(field, false);
    });
  }

  private animate(element: HTMLElement, keyframes: Keyframe[], options: number | KeyframeAnimationOptions) {
    return element.animate(keyframes, {...ANIMATION, ...(typeof(options) === 'number' ? {duration: options} : options)});
  }

  private later(callback: () => void, delay: number) {
    window.setTimeout(callback, Math.max(0, delay));
  }
}

// * the field's rows have its background as well, over its glass: they let the light through while there is any (a
// * light going out may still be there as the next one comes)
const lightsIn = new WeakMap<HTMLElement, number>();
function toggleLight(field: HTMLElement, on: boolean) {
  const count = (lightsIn.get(field) ?? 0) + (on ? 1 : -1);
  lightsIn.set(field, count);
  field.classList.toggle(styles.lit, count > 0);
}
