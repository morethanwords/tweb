import liteMode from '@helpers/liteMode';
import {CROSS_FADE_KEYFRAMES} from '@helpers/dom/crossfadeContent';
import {linearEasing, spring} from '@components/wallet/visual/motion';
import styles from '@components/chat/aiSendSparkles.module.scss';

/**
 * The AI editor's sparkles round the send button's glyph while the chat rewrites what it sends ("Always use in this
 * chat"), after Telegram for iOS's: one over the tip of the plane's wing, one past its tail, and a small one under the
 * wing that winks now and then. At rest they breathe slowly, one after the other, glowing as they swell; while a
 * message is rewritten they flare faster and brighter, in turn. They come in out of nothing with a little turn, and go
 * shrinking.
 *
 * They are drawn in the glyph, measured by it: they go with it as the button changes it, and turn right to left with
 * it. Only transforms and opacity move. At the reduced level they come and go by fading and rest still, but for their
 * flares while a message is rewritten, which say it is busy; with animations off they just stand there.
 */

// * where a sparkle's center is in the glyph's em, from its start and from its top, and how far its points reach
type Sparkle = {x: number, y: number, radius: number};

// * as they stand round the plane on iOS, its glyph a plane of the same outline: there it is 20 points wide, from the
// * tip of its wing to its nose, and the sparkles are 3.3, 2.4 and 1.6 points; here the plane spans the em's width and
// * stands from 0.08 to 0.91 of it. Round a clock, whose arrow is where the wing's tip is, they stand the other way
const SPARKLES: Sparkle[] = [
  {x: .08, y: .05, radius: .165},
  {x: 1.03, y: .9, radius: .12},
  {x: .02, y: .64, radius: .08}
];
const WINK = 2;

// * a breath's length at rest, and a flare's while a message is rewritten
const REST = 3200;
const ACTIVE = 1300;

// * each comes a moment after the one before, on a spring of stiffness 380 and damping 15 (one of mass 1 settles in
// * about 0.9 s), turning a quarter as it does
const APPEAR_STAGGER = 80;
const APPEAR = 900;
const APPEAR_EASING = linearEasing((t) => spring(t * APPEAR / 1000, 7.5, 18), 40);
const TURN = 450;
const APPEAR_FADE = 180;
const DISAPPEAR_FADE = 200;
const DISAPPEAR = 240;
const REDUCED_FADE = 150;

// * a sparkle's loop: where each step is, and its size, opacity and glow there (the glow as a share of its full)
type Track = {offsets: number[], scale: number[], opacity: number[], glow: number[]};
// * at rest: a slow dip and a soft swell past the size; the wink only in the second half of every other breath of the
// * large one
const REST_MAIN: Track = {offsets: [0, .35, .55, .75, 1], scale: [1, .72, 1.1, 1, 1], opacity: [1, .55, 1, 1, 1], glow: [0, 0, 1, 0, 0]};
const REST_WINK: Track = {offsets: [0, .5, .6, .72, 1], scale: [0, 0, 1, 0, 0], opacity: [0, 0, .9, 0, 0], glow: [0, 0, 1, 0, 0]};
const ACTIVE_MAIN: Track = {offsets: [0, .4, .62, 1], scale: [1, .55, 1.22, 1], opacity: [1, .4, 1, 1], glow: [0, 0, 1, 0]};
const ACTIVE_WINK: Track = {offsets: [0, .25, .42, .62, 1], scale: [0, 0, 1, 0, 0], opacity: [0, 0, 1, 0, 0], glow: [0, 0, 1, 0, 0]};
// * how far into its loop each sparkle starts, as a share of it: the large ones half a loop apart
const LOOP_OFFSETS = [0, .5, .23];

const SVG_NS = 'http://www.w3.org/2000/svg';

// * a sparkle of the AI glyph: a four-pointed star with concave sides and softened points, the points a unit from its
// * center; they are softened by a round stroke of its own color
function createSparkleShape(className: string) {
  const stroke = .24;
  const tip = 1 - stroke / 2;
  const control = tip * .38;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-1 -1 2 2');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  const points = [[0, -tip], [tip, 0], [0, tip], [-tip, 0]];
  let d = `M${points[0].join(' ')}`;
  points.forEach(([x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    // * from a point to the next one, drawn in towards the center
    d += `C${x * control / tip} ${y * control / tip} ${nextX * control / tip} ${nextY * control / tip} ${nextX} ${nextY}`;
  });
  path.setAttribute('d', d + 'Z');
  path.setAttribute('stroke-width', '' + stroke);
  svg.append(path);
  return svg;
}

// * how light a color is, 0 to 1
function getLightness(color: string) {
  const [r, g, b] = (color.match(/[\d.]+/g) || ['0', '0', '0']).map(Number);
  const scale = color.startsWith('color(') ? 1 : 255;
  return (.299 * r + .587 * g + .114 * b) / scale;
}

export default class AiSendSparkles {
  public readonly element: HTMLElement;
  private holders: HTMLElement[];
  private bodies: HTMLElement[];
  private glows: SVGElement[];
  private shown = false;
  private active = false;
  private loops: Animation[] = [];
  private transitions: Animation[] = [];
  private transition = 0;

  /** `glyph` is the button's icon they are round, `flipped` when they stand round it the other way */
  constructor(glyph: HTMLElement, flipped?: boolean) {
    this.element = document.createElement('span');
    this.element.className = styles.sparkles;
    this.element.hidden = true;
    this.holders = [];
    this.bodies = [];
    this.glows = [];
    SPARKLES.forEach(({x, y, radius}, index) => {
      // * the holder comes and goes; the sparkle breathes in it, with its glow under it
      const holder = document.createElement('span');
      holder.className = styles.holder;
      holder.style.setProperty('--x', '' + (flipped ? 1 - x : x));
      holder.style.setProperty('--y', '' + y);
      holder.style.setProperty('--radius', '' + radius);
      const body = document.createElement('span');
      body.className = styles.body;
      // * the wink shows only through its loop
      if(index === WINK) body.style.opacity = '0';
      const glow = createSparkleShape(styles.glow);
      body.append(glow, createSparkleShape(styles.shape));
      holder.append(body);
      this.element.append(holder);
      this.holders.push(holder);
      this.bodies.push(body);
      this.glows.push(glow);
    });
    glyph.append(this.element);
  }

  /** they come, or go */
  public setShown(shown: boolean) {
    if(this.shown === shown) return;
    this.shown = shown;
    const transition = ++this.transition;
    this.transitions.forEach((animation) => animation.cancel());
    this.transitions = [];
    const level = liteMode.getAnimationLevel();

    if(shown) {
      this.element.hidden = false;
      if(level > 1) {
        this.holders.forEach((holder, index) => {
          const timing: KeyframeAnimationOptions = {delay: index * APPEAR_STAGGER, fill: 'backwards'};
          this.transitions.push(
            holder.animate([{scale: .01}, {scale: 1}], {...timing, duration: APPEAR, easing: APPEAR_EASING}),
            holder.animate([{rotate: '-90deg'}, {rotate: '0deg'}], {...timing, duration: TURN, easing: 'ease-out'}),
            holder.animate(CROSS_FADE_KEYFRAMES, {...timing, duration: APPEAR_FADE})
          );
        });
      } else if(level) {
        this.transitions.push(this.element.animate(CROSS_FADE_KEYFRAMES, REDUCED_FADE));
      }

      this.startLoop();
      return;
    }

    if(level > 1) {
      for(const holder of this.holders) {
        this.transitions.push(
          holder.animate([{opacity: 1}, {opacity: 0}], {duration: DISAPPEAR_FADE, fill: 'forwards'}),
          holder.animate([{scale: 1}, {scale: .01}], {duration: DISAPPEAR, fill: 'forwards'})
        );
      }
    } else if(level) {
      this.transitions.push(this.element.animate([{opacity: 1}, {opacity: 0}], {duration: REDUCED_FADE, fill: 'forwards'}));
    }

    Promise.all(this.transitions.map((animation) => animation.finished.catch(() => {}))).then(() => {
      if(transition !== this.transition) return;
      this.element.hidden = true;
      this.transitions.forEach((animation) => animation.cancel());
      this.transitions = [];
      this.stopLoop();
    });
  }

  /** the animation level changed: the loops it allows run, and those it does not stop */
  public updateLevel() {
    if(this.shown) this.startLoop();
  }

  /** faster, brighter flares while a message is rewritten */
  public setActive(active: boolean) {
    if(this.active === active) return;
    this.active = active;
    if(this.shown) this.startLoop();
  }

  private stopLoop() {
    this.loops.forEach((animation) => animation.cancel());
    this.loops = [];
  }

  private startLoop() {
    this.stopLoop();
    const level = liteMode.getAnimationLevel();
    if(!level || (level < 2 && !this.active)) return;

    // * a light sparkle shines as it flares; a dark one only softens at its edges
    const glow = (.25 + .6 * getLightness(getComputedStyle(this.element).color)) * (this.active ? 1 : .6);
    const duration = this.active ? ACTIVE : REST;
    const main = this.active ? ACTIVE_MAIN : REST_MAIN;
    const wink = this.active ? ACTIVE_WINK : REST_WINK;
    this.bodies.forEach((body, index) => {
      const track = index === WINK ? wink : main;
      const timing: KeyframeAnimationOptions = {duration, iterations: Infinity, delay: -LOOP_OFFSETS[index] * duration};
      this.loops.push(
        body.animate(track.offsets.map((offset, step) => ({
          offset,
          scale: track.scale[step],
          opacity: track.opacity[step],
          easing: 'ease-in-out'
        })), timing),
        this.glows[index].animate(track.offsets.map((offset, step) => ({
          offset,
          opacity: track.glow[step] * glow,
          easing: 'ease-in-out'
        })), timing)
      );
    });
  }
}
