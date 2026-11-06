import Icon from '@components/icon';
import liteMode from '@helpers/liteMode';
import fadeOutFromCurrent from '@helpers/dom/fadeOutFromCurrent';
import removeWithAnimations from '@helpers/dom/removeWithAnimations';
import {CROSS_FADE_KEYFRAMES} from '@helpers/dom/crossfadeContent';
import styles from '@components/chat/aiSendFlight.module.scss';

/**
 * The send button while what it sends is rewritten first, after Telegram for iOS's: the paper plane is in flight, the
 * way Telegram's plane logo flies (a fine shake, a slow drift and sway, speed streaks rushing past it inside the
 * button), a little smaller so it keeps clear of the button's edge; a comet of light with a fading tail runs round
 * just inside that edge, and the rim glows and breathes. When the message goes, the light dies down and the plane
 * dashes off through the button's edge with it; when it does not, the plane settles back where it rests.
 *
 * It covers the button's own glyph and sparkles in the button's color, drawing the very same glyph in the same place,
 * and moves only by transforms and opacity. Only at the full animation level: it is all motion.
 */

// * the plane logo's numbers: a 512-unit canvas played at 60 fps, its plane 270 units wide
const LOOP = 54 / 60 * 1000;
const FRAMES = 54;
const PLANE_UNITS = 270;
const FLIGHT_SCALE = .78;
const LAP = 1250;
const BREATH = 1400;
const EASE = 'cubic-bezier(.31, 0, .69, 1)';

// * the streaks, folded into one loop: from and to on the canvas, shown between frames
const STREAKS: [number, number, number, number, number, number][] = [
  [306, 219.75, 156, 433.75, 6, 24],
  [295, 115.75, 61, 251.75, 7, 24],
  [425.5, 256.75, 330, 420.75, 16, 34],
  [274, 94.75, 98, 197.75, 20, 37],
  [342, 179.75, 91, 347.75, 19, 37],
  [421, 171.75, 206, 447.75, 26, 45],
  [307, 75.75, 80, 166.75, 34, 52],
  [443, 285.75, 354, 427.25, 39, 57],
  [331, 123.75, 59, 254.75, 47, 64],
  [419, 205.75, 231, 452.75, 53, 70]
];

// * a streak: a thin crescent from its head back along the flight, in canvas units around its head
const STREAK_PATH = 'M15.662 84.004C-36.93 102.54 -90.5 140.75 -90.5 140.75C-90.5 140.75 -33.102 121.843 15.662 84.004Z';
const STREAK_BOX = {left: -92, top: 82, width: 110, height: 61};

type Stage = 'idle' | 'flying' | 'gone';

export default class AiSendFlight {
  private stage: Stage = 'idle';
  private glyph: HTMLElement;
  private element: HTMLElement;
  private cover: HTMLElement;
  private aura: HTMLElement;
  // * the comet's orbit, its head and tail turning round
  private ring: HTMLElement;
  private streaks: HTMLElement;
  private departure: HTMLElement;
  private shake: HTMLElement;
  private plane: HTMLElement;

  constructor(private button: HTMLElement) {}

  /** the plane takes off, and the comet starts round the edge */
  public start() {
    this.glyph = this.button.querySelector('.btn-send-icon-send');
    // * only the plane flies: a scheduled send's clock stays as it is
    if(this.stage !== 'idle' || !liteMode.isAvailable('motion') || !this.button.classList.contains('send') || !this.glyph) {
      return;
    }

    this.stage = 'flying';
    const button = this.button.getBoundingClientRect();
    const glyph = this.glyph.getBoundingClientRect();
    const glyphStyle = getComputedStyle(this.glyph);
    const fontSize = parseFloat(glyphStyle.fontSize);
    const scale = fontSize / PLANE_UNITS;
    // * the flight goes along the line, as the plane points
    const reflect = getComputedStyle(this.button).direction === 'rtl' ? -1 : 1;
    const center = {x: glyph.left - button.left + glyph.width / 2, y: glyph.top - button.top + glyph.height / 2};

    this.element = document.createElement('div');
    this.element.className = styles.flight;

    // * the speed streaks rush past behind it, down and back
    this.streaks = document.createElement('div');
    this.streaks.className = styles.layer;
    const streakMask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${STREAK_BOX.left} ${STREAK_BOX.top} ${STREAK_BOX.width} ${STREAK_BOX.height}"><path d="${STREAK_PATH}"/></svg>`)}")`;
    for(const [fromX, fromY, toX, toY, start, end] of STREAKS) {
      const streak = document.createElement('div');
      streak.className = styles.streak;
      Object.assign(streak.style, {
        left: center.x + STREAK_BOX.left * scale * reflect + (reflect < 0 ? -STREAK_BOX.width * scale : 0) + 'px',
        top: center.y + STREAK_BOX.top * scale + 'px',
        width: STREAK_BOX.width * scale + 'px',
        height: STREAK_BOX.height * scale + 'px',
        maskImage: streakMask,
        webkitMaskImage: streakMask,
        scale: reflect < 0 ? '-1 1' : ''
      } as Partial<CSSStyleDeclaration>);
      const at = (x: number, y: number) => `${((x - 256) * scale * reflect).toFixed(2)}px ${((y - 256) * scale).toFixed(2)}px`;
      const from = start / FRAMES, to = end / FRAMES;
      streak.animate([
        {translate: at(fromX, fromY), offset: 0},
        {translate: at(fromX, fromY), offset: Math.min(1, from)},
        {translate: at(toX, toY), offset: Math.min(1, to)},
        {translate: at(toX, toY), offset: 1}
      ], {duration: LOOP, iterations: Infinity});
      streak.animate([
        {opacity: 0, offset: 0},
        {opacity: 0, offset: Math.min(1, from)},
        {opacity: .45, offset: Math.min(1, to, (start + 3) / FRAMES)},
        {opacity: .45, offset: Math.min(1, Math.max(from, (end - 2) / FRAMES))},
        {opacity: 0, offset: Math.min(1, to)},
        {opacity: 0, offset: 1}
      ], {duration: LOOP, iterations: Infinity});
      this.streaks.append(streak);
    }
    this.streaks.animate(CROSS_FADE_KEYFRAMES, 300);

    // * the plane: its size and shake outside, its drift and sway inside, each loop of its own
    this.departure = document.createElement('div');
    this.departure.className = styles.layer;
    this.shake = document.createElement('div');
    this.shake.className = styles.shake;
    Object.assign(this.shake.style, {left: center.x + 'px', top: center.y + 'px'});
    this.plane = Icon('logo', styles.plane, 'icon-mirror');
    Object.assign(this.plane.style, {
      left: -glyph.width / 2 + 'px',
      top: -glyph.height / 2 + 'px',
      width: glyph.width + 'px',
      height: glyph.height + 'px',
      fontSize: glyphStyle.fontSize,
      lineHeight: glyphStyle.lineHeight
    });
    this.shake.append(this.plane);
    this.departure.append(this.shake);

    // * take-off: it ducks, then settles smaller, in flight
    this.shake.animate([{scale: 1}, {scale: .66, offset: .3}, {scale: FLIGHT_SCALE + .05, offset: .7}, {scale: FLIGHT_SCALE}], {duration: 500, easing: 'ease-in-out', fill: 'forwards'});
    const shakeBy = {x: 3.56 * scale * reflect, y: 3.25 * scale};
    this.shake.animate([20, 24, 28, 33, 38, 42, 47, 51, 55, 60, 64, 69, 73].map((frame, index) => ({
      translate: index % 2 ? `${shakeBy.x}px ${shakeBy.y}px` : `${-shakeBy.x}px ${-shakeBy.y}px`,
      offset: (frame - 20) / 53,
      easing: 'ease-in-out'
    })), {duration: LOOP, iterations: Infinity});
    const driftScale = scale * 1.3;
    this.plane.animate([[-1, -22.5], [21, -2.2], [-3, 5.5], [-1, -22.5]].map(([x, y], index) => ({
      translate: `${(x * driftScale * reflect).toFixed(2)}px ${((y + 22.5) * driftScale).toFixed(2)}px`,
      offset: [0, 22 / 53, 33 / 53, 1][index],
      easing: EASE
    })), {duration: LOOP, iterations: Infinity});
    this.plane.animate([
      {rotate: `${-4 * reflect}deg`, easing: EASE},
      {rotate: `${4 * reflect}deg`, offset: 25 / 51, easing: EASE},
      {rotate: `${-4 * reflect}deg`}
    ], {duration: LOOP, iterations: Infinity});

    // * the comet: a bright head with a fading tail, at an even speed round the edge
    this.ring = document.createElement('div');
    this.ring.className = styles.orbit;
    if(reflect < 0) this.ring.classList.add(styles.reflected);
    const tail = document.createElement('div');
    tail.className = styles.tail;
    const head = document.createElement('div');
    head.className = styles.head;
    this.ring.append(tail, head);
    this.ring.animate([{rotate: '0deg'}, {rotate: `${360 * reflect}deg`}], {duration: LAP, iterations: Infinity});
    this.ring.animate(CROSS_FADE_KEYFRAMES, 300);

    // * over the button's own glyph and sparkles, in its color
    this.cover = document.createElement('div');
    this.cover.className = styles.layer;
    this.cover.style.backgroundColor = getComputedStyle(this.button).backgroundColor;

    this.element.append(this.cover, this.streaks, this.departure, this.ring);
    this.button.append(this.element);

    // * the rim glows and breathes, round the button: outside what it clips
    this.aura = document.createElement('div');
    this.aura.className = styles.aura;
    Object.assign(this.aura.style, {
      left: this.button.offsetLeft + 'px',
      top: this.button.offsetTop + 'px',
      width: button.width + 'px',
      height: button.height + 'px'
    });
    this.button.before(this.aura);
    this.aura.animate([{opacity: .25}, {opacity: .85}, {opacity: .25}], {duration: BREATH, iterations: Infinity, easing: 'ease-in-out'});
  }

  /** the message goes: the light dies down and the plane dashes off through the edge, up along its nose */
  public depart() {
    if(this.stage !== 'flying') return;
    this.stage = 'gone';
    const {aura} = this;
    fadeOutFromCurrent(this.ring, 300);
    fadeOutFromCurrent(aura, 300);
    fadeOutFromCurrent(this.streaks, 150);
    const reflect = getComputedStyle(this.button).direction === 'rtl' ? -1 : 1;
    this.departure.animate([{translate: '0 0'}, {translate: `${24 * reflect}px -24px`}], {duration: 160, easing: 'ease-in', fill: 'forwards'});
    // * what the button turns into as the field empties (the microphone) comes in through it at once
    const uncover = new MutationObserver(() => {
      if(this.button.classList.contains('send')) return;
      uncover.disconnect();
      fadeOutFromCurrent(this.cover, 150);
    });
    uncover.observe(this.button, {attributes: true, attributeFilter: ['class']});
    // * by then the button shows what it holds next; if it still sends (the message could not go), the plane comes
    // * back into it softly
    window.setTimeout(() => {
      uncover.disconnect();
      aura.remove();
      this.land();
      if(this.button.classList.contains('send')) {
        this.glyph.animate([{opacity: 0, scale: .6}, {opacity: 1, scale: 1}], {duration: 250, easing: 'ease-out'});
      }
    }, 350);
  }

  /** stops without sending: the light fades and the plane settles back where it rests */
  public cancel() {
    if(this.stage !== 'flying') return;
    this.stage = 'gone';
    const {shake, plane, aura} = this;
    fadeOutFromCurrent(this.ring, 250);
    fadeOutFromCurrent(this.streaks, 250);
    fadeOutFromCurrent(aura, 250);
    // * from wherever the loops have it
    const shakeStyle = getComputedStyle(shake), planeStyle = getComputedStyle(plane);
    const from = {scale: shakeStyle.scale, shake: shakeStyle.translate, drift: planeStyle.translate, sway: planeStyle.rotate};
    shake.getAnimations().forEach((animation) => animation.cancel());
    plane.getAnimations().forEach((animation) => animation.cancel());
    const options: KeyframeAnimationOptions = {duration: 300, easing: 'ease-out', fill: 'forwards'};
    shake.animate([{scale: from.scale, translate: from.shake}, {scale: '1', translate: '0 0'}], options);
    // * the button's sparkles come back as it settles, under the copy now on the glyph's very pixels
    this.cover.animate([{opacity: 1}, {opacity: 1, offset: .5}, {opacity: 0}], options);
    plane.animate([{translate: from.drift, rotate: from.sway}, {translate: '0 0', rotate: '0deg'}], options)
    .finished.catch(() => {}).then(() => {
      aura.remove();
      this.land();
    });
  }

  // * the button draws its own glyph again
  private land() {
    removeWithAnimations(this.element);
  }
}
