// The wallet card in 3D — a port of WalletCardView from the iOS demo. The card
// tilts under the finger (and with the gyroscope, where there is one), lifts
// with a shadow while it is pulled, and the metal catches a highlight by the
// tilt. In place of the gram icon there is a live gem: it is turned by the
// finger, grows under it, and the metal under it refracts.
//
// Expected DOM (the classes are the design's, the module only needs the elements):
//
//   <div class="card">                        root: gestures; height set here
//     <div class="card-fold">                 fold: the scroll's fold, set by the screen (cardScroll.ts)
//       <div class="card-shadow"></div>       shadow: lift shadow
//       <canvas class="card-bg"></canvas>     background: WebGL face + edge, wider by CardBackground.padding
//       <div class="card-face">               face: CSS matrix3d of the card
//         <div class="card-design">           design: 336×205 design units, scaled here
//           <div class="card-balance">        balance: squats when the balance changes
//             <span class="card-gem-slot"></span>
//             <span class="card-amount">
//               <span data-run="amount"></span><span data-run="fraction"></span><span data-run="currency">GRAM</span>
//             </span>
//           </div>
//           <div class="card-fiat"></div>     fiat
//           …name, address…
//           <div class="card-gem-clip"><canvas class="card-gem"></canvas></div>   gem
//
// The constructor throws when WebGL2 is unavailable: the caller then shows the
// flat card of the design. The integrating screen owns the frame loop and calls
// `frame(clock.now())` while the card is visible (and `resetClock()` while the
// page is hidden). With reduced animations nothing on it moves by itself or
// under the pointer: it is drawn again only when what it shows changes.
//
// Right to left the card's text stands mirrored (`setMirrored`), and the gem
// and the QR chip go with it; the metal, its light and the gem's facets are a
// picture and are not mirrored, nor is anything the pointer does to them.

import {ca, clamp, clamp01, CAMatrix, smoothstep01, Vec2, Vec3, Vec4} from '@components/wallet/visual/math';
import {clock} from '@components/wallet/visual/clock';
import {cardChipX, cardGemCenter, DESIGN} from '@components/wallet/visual/card/layout';
import {CardBackground, CardLens} from '@components/wallet/visual/card/background';
import {GemView, GemLens, Appearance} from '@components/wallet/visual/gem/stage';
import {gemAssets, gemHull} from '@components/wallet/visual/gem/geometry';
import {offsetIn, pixelRatio} from '@components/wallet/visual/dom';
import ListenerSetter from '@helpers/listenerSetter';
import {bindActiveWindowListener, getAppWindow} from '@helpers/appWindow';
import liteMode from '@helpers/liteMode';
import bigInt, {BigInteger} from 'big-integer';

const MAX_PITCH = 0.20;
const MAX_YAW = 0.30;
const GYRO_GAIN = 0.9;
/** how far a mouse turns the card: at the card's edge 0.7 of this share of the finger's turn, at most all of it */
const HOVER_GAIN = 0.6;
const HIGHLIGHT_IDLE_GAIN = 1.75;
const MAX_LIFT_SHADOW = 0.16;
/** The gem on the card turns by itself, slowly (iOS WalletCardComponent) */
export const GEM_BASE_SPIN = 2 * Math.PI / 26;
/** A press on the gem shorter and shorter than this is a tap: it spins the gem (iOS: 0.25 s, 10 pt) */
const TAP_TIME = 0.25;
const TAP_TRAVEL = 10;
/** The scroll shadow under the folding card: iOS 0.12 sin²(πf) */
const SCROLL_SHADOW = 0.12;

const idleTilt = (time: number): Vec2 => [0.013 * Math.sin(time * 0.50), 0.022 * Math.sin(time * 0.37 + 1.6)];

/** iOS Safari's DeviceOrientationEvent, which asks for permission. */
type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>
};

export interface WalletCardElements {
  root: HTMLElement,
  fold: HTMLElement,
  shadow: HTMLElement,
  background: HTMLCanvasElement,
  face: HTMLElement,
  design: HTMLElement,
  gem: HTMLCanvasElement,
  balance: HTMLElement,
  /** The balance runs in order — integer, fraction, currency — drawn again into the gem's lens. */
  amount: HTMLElement,
  fraction: HTMLElement,
  currency: HTMLElement,
  fiat: HTMLElement
}

/** The count runs in nanos, exactly: every digit it shows is one the balance passed through. */
interface BalanceCount {
  from: BigInteger,
  to: BigInteger,
  start: number
}

/** An amount in nanos as the card's two runs: `1,720` and `.58`. */
export type WalletCardBalanceFormatter = (nanos: string) => {whole: string, fraction: string};

export class WalletCard {
  public root: HTMLElement;
  public bgCanvas: HTMLCanvasElement;
  public face: HTMLElement;
  public fold: HTMLElement;
  public design: HTMLElement;
  public shadow: HTMLElement;
  public gemCanvas: HTMLCanvasElement;
  public balanceRow: HTMLElement;
  public background: CardBackground;
  public gem: GemView;
  /** The card's bottom edge on screen (with the rim), from its top: the header knows the card went under it. */
  public projectedBottom: number;
  /**
   * The card's own transform (tilt, fit) about its centre, as drawn in the last frame: the balance leaving the
   * card for the header starts from it.
   */
  public cardMatrix: CAMatrix;
  /** The last press began on the gem: it turned the gem, it was no press on the card. */
  public pressedGem: boolean;
  public width: number;
  public height: number;
  public lastTime: number;

  private runs: HTMLElement[];
  private amountRun: HTMLElement;
  private fractionRun: HTMLElement;
  private fiat: HTMLElement;
  private outline: Vec3[];
  private gyro: Vec2;
  /** Nod, turn from the finger. */
  private pan: Vec2;
  /** Nod, turn from where a mouse points. */
  private hover: Vec2;
  private gemRoll: number;
  private lastGemYaw: number;
  private gemRate: number;
  private panTilt: number;
  private isPanning: boolean;
  private card: Vec2;
  private depth: Vec2;
  private idle: Vec2;
  private highlight: Vec2;
  private scale: number;
  private targetScale: number;
  private elapsed: number;
  private fitScale: number;
  private gemScale: number;
  /** Screen points per design unit. */
  private s: number;
  private pixelRatio: number;
  private textCanvas: HTMLCanvasElement;
  private fiatFormatter: (nanos: string) => string;
  private balanceFormatter: WalletCardBalanceFormatter;
  private shownBalance: BigInteger;
  /** where the balance is, or where the running count goes */
  private balance: BigInteger;
  private count: BalanceCount;
  /** The scroll's fold, 0 — the card in place, 1 — folded away (iOS cardTransitionFraction). */
  private collapse: number;
  /** How far the fold pitched the card back, of its full π/3. */
  private scrollPitch: number;
  /** The QR chip fades and blurs with the card's details as the card folds. */
  private chip: Vec2;
  /** While the balance flies off the card, its gem is drawn there too. */
  private gemMirror: CanvasRenderingContext2D;
  private baseAttitude: Vec2;
  private onOrientation: (e: DeviceOrientationEvent) => void;
  private gyroAsked: boolean;
  private listenerSetter: ListenerSetter;
  private destroyed = false;
  /** right to left: the gem and the QR chip stand at the mirrored places */
  private mirrored = false;
  /** with reduced animations, what the last still frame showed: the next one is drawn only when it changes */
  private stillFrame: string;

  /** Throws when WebGL2 is unavailable. */
  constructor(elements: WalletCardElements) {
    const root = this.root = elements.root;
    this.bgCanvas = elements.background;
    this.face = elements.face;
    this.fold = elements.fold;
    this.design = elements.design;
    this.shadow = elements.shadow;
    this.gemCanvas = elements.gem;
    this.balanceRow = elements.balance;
    this.amountRun = elements.amount;
    this.fractionRun = elements.fraction;
    this.runs = [elements.amount, elements.fraction, elements.currency];
    this.fiat = elements.fiat;

    this.background = new CardBackground(this.bgCanvas);
    // A white gem on the blue card: it turns slowly by itself and glints; under the finger it spins and grows.
    try {
      this.gem = new GemView(this.gemCanvas, {
        appearance: Appearance.white, widthPoints: DESIGN.gemWidth, rotationSpeed: GEM_BASE_SPIN,
        dragGrow: 2.6, growDamping: 0.62, releaseDecay: 1.1
      });
    } catch(error) {
      this.background.destroy();
      throw error;
    }
    this.outline = gemAssets().outline;

    // Motion state — as on iOS.
    this.gyro = [0, 0];
    this.pan = [0, 0];
    this.hover = [0, 0];
    this.gemRoll = 0;
    this.lastGemYaw = null;
    this.gemRate = 0;
    this.panTilt = 0;
    this.isPanning = false;
    this.card = [0, 0];
    this.depth = [0, 0];
    const idle = idleTilt(0);
    this.idle = idle;
    this.highlight = [idle[0], idle[1]];
    this.scale = 1;
    this.targetScale = 1;
    this.elapsed = 0;
    this.lastTime = null;
    this.fitScale = 1;
    this.gemScale = 1;
    this.width = 0;
    this.height = 0;
    this.collapse = 0;
    this.scrollPitch = 0;
    this.chip = [1, 0];
    this.cardMatrix = ca.identity();
    this.pressedGem = false;

    this.listenerSetter = new ListenerSetter();
    this.placeGem();
    this.bindGestures();
    this.bindMotion();
    this.observeSize();
  }

  // MARK: Layout

  private observeSize() {
    const apply = () => {
      if(this.destroyed) return;
      const width = this.root.clientWidth;
      if(!width) return;
      this.width = width;
      this.height = width * DESIGN.height / DESIGN.width;
      this.s = width / DESIGN.width;
      this.root.style.height = `${this.height}px`;
      this.root.style.setProperty('--fold-camera', `${650 * width / 361}px`);
      this.design.style.transform = `scale(${this.s})`;
      this.shadow.style.borderRadius = `${DESIGN.radius * this.s}px`;
      const pr = pixelRatio();
      this.pixelRatio = pr;
      this.background.setSize(this.width, this.height, pr);
      const pad = CardBackground.padding;
      Object.assign(this.bgCanvas.style, {left: `${-pad}px`, top: `${-pad}px`,
        width: `${this.width + pad * 2}px`, height: `${this.height + pad * 2}px`});
      // The gem canvas is in design units, with as many pixels as it has on
      // screen after the card's scale.
      this.gem.setSize(DESIGN.gemCanvas, pr * this.s);
      this.gem.dragScale = DESIGN.gemCanvas * this.s;
      this.drawBalanceText();
    };
    const resizeObserver = new ResizeObserver(apply);
    resizeObserver.observe(this.root);
    this.listenerSetter.addCleanup(() => resizeObserver.disconnect());
    apply();
    getAppWindow().document.fonts?.ready.then(() => {
      if(!this.destroyed) this.drawBalanceText();
    });
  }

  private placeGem() {
    const size = DESIGN.gemCanvas, [x, y] = this.gemCenter();
    Object.assign(this.gemCanvas.style, {width: `${size}px`, height: `${size}px`,
      left: `${x - size / 2}px`, top: `${y - size / 2}px`});
  }

  /** the gem's middle at rest, design units */
  public gemCenter(): Vec2 {
    return cardGemCenter(this.mirrored);
  }

  /** Right to left: the gem and the QR chip move to the places the mirrored text leaves them */
  public setMirrored(mirrored: boolean) {
    if(this.mirrored === mirrored) return;
    this.mirrored = mirrored;
    this.placeGem();
    this.stillFrame = undefined;
    // * the glyphs' copy for the grown gem is read from where the text stands now
    if(!this.destroyed) this.drawBalanceText();
  }

  /** The amount's glyphs on the gem canvas — for their copy through the grown gem. */
  public drawBalanceText() {
    const size = DESIGN.gemCanvas;
    const scale = (this.pixelRatio || 2) * (this.s || 1);
    const c = this.textCanvas || (this.textCanvas = document.createElement('canvas'));
    c.width = Math.round(size * scale);
    c.height = Math.round(size * scale);
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, size, size);
    const [gx, gy] = this.gemCenter(), ox = gx - size / 2, oy = gy - size / 2;
    // All runs share one baseline — the integer part's: an inline element's
    // offsetTop is the top of its text, not of the line.
    let baseline: number = null;
    for(const span of this.runs) {
      const style = getComputedStyle(span);
      g.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      g.fillStyle = style.color;
      g.textBaseline = 'alphabetic';
      const m = g.measureText(span.textContent);
      const {x, y} = offsetIn(span, this.design);
      if(baseline === null) baseline = y + m.fontBoundingBoxAscent;
      g.fillText(span.textContent, x - ox, baseline - oy);
    }
    this.gem.setText(c);
  }

  /**
   * A new balance, in nanos: the digits count towards it with a slowdown, and
   * the balance row squats briefly — so it reads that the amount has left.
   * The same balance again changes nothing.
   */
  public setBalance(nanos: string) {
    const value = bigInt(nanos);
    if(this.balance?.equals(value)) return;
    this.balance = value;
    if(this.shownBalance === undefined) {
      this.shownBalance = value;
      this.showBalance(value);
      return;
    }
    // * with reduced animations the digits change in place: no count, no squat
    if(!liteMode.isAvailable('motion')) {
      this.count = {from: value, to: value, start: 0};
      this.endCount();
      return;
    }
    this.count = {from: this.shownBalance, to: value, start: clock.now()};
  }

  /** The running count jumps to its end */
  private endCount() {
    const c = this.count;
    if(!c) return;
    this.count = null;
    this.shownBalance = c.to;
    this.showBalance(c.to);
    this.balanceRow.style.transform = '';
    this.drawBalanceText();
  }

  /**
   * The fiat line in the chosen currency, from the shown balance in nanos (it counts with the balance). Setting
   * it redraws the line at once.
   */
  public setFiatFormatter(formatter: (nanos: string) => string) {
    this.fiatFormatter = formatter;
    if(this.shownBalance !== undefined) this.showBalance(this.shownBalance);
  }

  /**
   * How the balance is written: its integer part and its two-digit fraction with the separator, the way the rest
   * of the app writes amounts. Setting it redraws the balance at once.
   */
  public setBalanceFormatter(formatter: WalletCardBalanceFormatter) {
    this.balanceFormatter = formatter;
    if(this.shownBalance === undefined) return;
    this.showBalance(this.shownBalance);
    // * the gem's copy of the glyphs follows, unless a count is running: it redraws them when it ends
    if(!this.count) this.drawBalanceText();
  }

  private showBalance(v: BigInteger) {
    const nanos = v.toString();
    if(this.balanceFormatter) {
      const {whole, fraction} = this.balanceFormatter(nanos);
      // The fraction is always two digits and smaller than the integer part, as on the iOS card. The space before
      // the ticker is its margin: right to left a space here would stand between the digits and the gem.
      this.amountRun.textContent = whole;
      this.fractionRun.textContent = fraction;
    }

    this.fiat.textContent = this.fiatFormatter?.(nanos) ?? '';
  }

  private stepBalance(now: number) {
    const c = this.count;
    if(!c) return;
    const t = Math.min(1, (now - c.start) / 1.0);
    const eased = Math.round((1 - Math.pow(1 - t, 3)) * 1e6);
    const v = t >= 1 ? c.to : c.from.add(c.to.subtract(c.from).multiply(eased).divide(1e6));
    this.shownBalance = v;
    this.showBalance(v);
    // The squat: the row shrinks a little and comes back.
    const dip = t >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, t / 0.55)) * (1 - t) * 0.06;
    this.balanceRow.style.transform = dip ? `scale(${1 - dip})` : '';
    if(t >= 1) {
      this.count = null;
      this.drawBalanceText();
    }
  }

  // MARK: Gestures

  /**
   * The touch point in design units — by the untilted layout: at rest the
   * card stands straight, and the tilt is small.
   */
  private designPoint(e: PointerEvent): Vec2 {
    const r = this.root.getBoundingClientRect();
    return [(e.clientX - r.left) / this.s, (e.clientY - r.top) / this.s];
  }

  /** The gem answers the finger only on the card at rest: folding, the balance leaves it (iOS). */
  private gemHit(p: Vec2): boolean {
    if(this.collapse > 0) return false;
    const [gx, gy] = this.gemCenter(), cx = gx + this.nudge(), cy = gy + 0.71;
    return Math.hypot(p[0] - cx, p[1] - cy) <= DESIGN.gemHitRadius;
  }

  private bindGestures() {
    const el = this.root;
    const listen = this.listenerSetter.add(el);
    let mode: 'gem' | 'card' = null, start: Vec2 = null, last: Vec2 = null, samples: Vec2[] = [], startTime = 0;
    listen('pointermove', (e) => {
      if(mode) return;
      el.style.cursor = liteMode.isAvailable('motion') && this.gemHit(this.designPoint(e)) ? 'grab' : '';
    });
    listen('pointerdown', (e) => {
      if(mode || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // * with reduced animations the card holds still under the finger, and the gem does not turn: a press is a
      // * press on the card
      if(!liteMode.isAvailable('motion')) {
        this.pressedGem = false;
        return;
      }
      this.requestGyro();
      try {
        el.setPointerCapture(e.pointerId);
      } catch{}
      const now = clock.now();
      start = [e.clientX, e.clientY];
      last = [e.clientX, e.clientY];
      samples = [[now, e.clientX]];
      startTime = now;
      this.pressedGem = this.gemHit(this.designPoint(e));
      if(this.pressedGem) {
        mode = 'gem';
        el.style.cursor = 'grabbing';
        this.gem.beginDrag(now);
      } else {
        mode = 'card';
        this.isPanning = true;
        this.targetScale = 1.01;
      }
      e.preventDefault();
    });
    listen('pointermove', (e) => {
      if(!mode) return;
      const now = clock.now();
      if(mode === 'gem') {
        this.gem.drag(e.clientX - last[0], e.clientY - last[1], now);
        samples.push([now, e.clientX]);
        while(samples.length > 2 && now - samples[0][0] > 0.08) samples.shift();
      } else {
        const travel = 240 * Math.max(this.width / 361, 0.01);
        this.pan[1] = clamp((e.clientX - start[0]) / travel * MAX_YAW, MAX_YAW);
        this.pan[0] = clamp(-(e.clientY - start[1]) / travel * MAX_PITCH, MAX_PITCH);
      }
      last = [e.clientX, e.clientY];
    });
    const end = (e: PointerEvent) => {
      if(!mode) return;
      const now = clock.now();
      if(mode === 'gem') {
        const first = samples[0];
        const velocity = first && now - first[0] > 0.005 ? (e.clientX - first[1]) / (now - first[0]) : 0;
        // * a tap spins the gem towards the tapped side (iOS: not under reduced motion)
        const isTap = e.type !== 'pointercancel' && now - startTime < TAP_TIME &&
          Math.hypot(e.clientX - start[0], e.clientY - start[1]) < TAP_TRAVEL;
        const gemX = this.gemCenter()[0] + this.nudge();
        const tapDirection = isTap && liteMode.isAvailable('motion') ? (this.designPoint(e)[0] < gemX ? -1 : 1) : undefined;
        this.gem.endDrag(velocity, now, e.type === 'pointercancel', tapDirection);
        el.style.cursor = 'grab';
      } else {
        this.isPanning = false;
        this.targetScale = 1;
      }
      mode = null;
    };
    listen('pointerup', end);
    listen('pointercancel', end);

    // A mouse turns the card towards wherever it points in the window, with no press — the way the light of
    // a transfer card in a chat follows the cursor, and the way a tilted phone turns it. The window is the one the
    // app is in: a Document PiP one while it is popped out.
    const listenWindow = <K extends keyof WindowEventMap>(type: K, listener: (e: WindowEventMap[K]) => void, options?: AddEventListenerOptions) => {
      this.listenerSetter.addCleanup(bindActiveWindowListener((win) => win, type, listener, options));
    };
    listenWindow('pointermove', (e) => {
      if(mode || e.pointerType === 'touch') return;
      if(!liteMode.isAvailable('motion')) {
        this.hover = [0, 0];
        return;
      }

      const r = this.root.getBoundingClientRect();
      if(!r.width) return;
      const x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
      this.hover = [-HOVER_GAIN * MAX_PITCH * y / Math.hypot(1, y), HOVER_GAIN * MAX_YAW * x / Math.hypot(1, x)];
    }, {passive: true});
    // * gone from the window: the card straightens
    this.listenerSetter.addCleanup(bindActiveWindowListener((win) => win.document.documentElement, 'pointerleave', () => this.hover = [0, 0]));
    listenWindow('blur', () => this.hover = [0, 0]);
  }

  // MARK: Gyroscope

  private bindMotion() {
    this.baseAttitude = null;
    this.onOrientation = (e) => {
      if(e.beta == null || e.gamma == null) return;
      const beta = e.beta * Math.PI / 180, gamma = e.gamma * Math.PI / 180;
      if(!this.baseAttitude) {
        this.baseAttitude = [beta, gamma];
        return;
      }
      this.gyro[0] = clamp(-(beta - this.baseAttitude[0]) * GYRO_GAIN, MAX_PITCH * 0.85);
      this.gyro[1] = clamp((gamma - this.baseAttitude[1]) * GYRO_GAIN, MAX_YAW * 0.8);
    };
    if(typeof DeviceOrientationEvent !== 'undefined' &&
      !(DeviceOrientationEvent as DeviceOrientationEventWithPermission).requestPermission) {
      this.listenDeviceOrientation();
    }
    this.listenerSetter.addCleanup(bindActiveWindowListener((win) => win.document, 'visibilitychange', () => {
      this.baseAttitude = null;
      this.gyro = [0, 0];
      this.resetClock();
    }));
  }

  /** the gyroscope of the window the app is in */
  private listenDeviceOrientation() {
    this.listenerSetter.addCleanup(bindActiveWindowListener((win) => win, 'deviceorientation', this.onOrientation));
  }

  /** iOS Safari asks for the gyroscope permission — only on a touch. */
  private requestGyro() {
    if(this.gyroAsked || typeof DeviceOrientationEvent === 'undefined') return;
    const orientation = DeviceOrientationEvent as DeviceOrientationEventWithPermission;
    if(!orientation.requestPermission) return;
    this.gyroAsked = true;
    orientation.requestPermission().then((state) => {
      if(state === 'granted' && !this.destroyed) this.listenDeviceOrientation();
    }).catch((): void => {});
  }

  // MARK: Frame

  /** No dt jump on the next frame — for a page that was hidden. */
  public resetClock() {
    this.lastTime = null;
    this.gem.resetClock();
  }

  /**
   * Shift of the gem away from the card's edge while it has grown: at the edge
   * it would otherwise run into the card's rounding. Rightwards, leftwards
   * right to left, where the gem stands by the right edge.
   */
  private nudge(): number {
    const half = DESIGN.gemWidth * this.gem.pose.grow / 2 * 1.1 * this.gemScale;
    const shift = Math.max(0, half + 14 * DESIGN.width / 361 - DESIGN.gemCenter[0]);
    return this.mirrored ? -shift : shift;
  }

  public frame(now: number) {
    if(this.destroyed || !this.width) return;
    if(!liteMode.isAvailable('motion')) {
      this.frameStill(now);
      return;
    }

    this.stillFrame = undefined;
    const dt = Math.min(Math.max(this.lastTime === null ? 0 : now - this.lastTime, 0), 1 / 30);
    this.lastTime = now;
    this.elapsed += dt;
    this.stepBalance(now);

    if(!this.isPanning) {
      const decay = Math.exp(-dt * 4.0);
      this.pan[0] *= decay;
      this.pan[1] *= decay;
    }
    this.idle = idleTilt(this.elapsed);

    // The gem is spun — the card turns after it ever so slightly.
    const yaw = this.gem.pose.yaw;
    if(this.lastGemYaw !== null && dt > 0) {
      let d = yaw - this.lastGemYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.gemRate += (d / dt - this.gemRate) * Math.min(1, dt * 3);
    }
    this.lastGemYaw = yaw;
    const extra = this.gemRate - GEM_BASE_SPIN * (this.gemRate >= 0 ? 1 : -1);
    const rollTarget = clamp(0.006 * (Math.abs(this.gemRate) > GEM_BASE_SPIN * 1.5 ? extra : 0), MAX_YAW * 0.18);
    this.gemRoll += (rollTarget - this.gemRoll) * (1 - Math.exp(-dt * 2.5));
    const panTarget = Math.min(1, Math.hypot(this.pan[0] / MAX_PITCH, this.pan[1] / MAX_YAW));
    this.panTilt += (panTarget - this.panTilt) * (1 - Math.exp(-dt * 8));

    const [hp, hr] = this.hover, pp = this.pan[0] + hp, pr = this.pan[1] + hr;
    const [gp, gr] = this.gyro, [ix, iy] = this.idle;
    const cardTarget = [clamp(pp, MAX_PITCH), clamp(pr + this.gemRoll, MAX_YAW)];
    const depthTarget = [clamp(gp + pp, MAX_PITCH + 0.03), clamp(gr + pr + this.gemRoll, MAX_YAW + 0.03)];
    const highlightTarget = [clamp(gp + pp + ix, MAX_PITCH + 0.03), clamp(gr + pr + this.gemRoll + iy, MAX_YAW + 0.03)];
    const k = 1 - Math.exp(-dt * 8);
    for(let i = 0; i < 2; i++) {
      this.card[i] += (cardTarget[i] - this.card[i]) * k;
      this.depth[i] += (depthTarget[i] - this.depth[i]) * k;
      this.highlight[i] += (highlightTarget[i] - this.highlight[i]) * k;
    }
    this.scale += (this.targetScale - this.scale) * (1 - Math.exp(-dt * 12));

    this.render(now);
  }

  /**
   * Reduced animations: the card at rest — no sway, no light running over it, no tilt after the pointer or the
   * gyroscope, no star twinkling, the gem not turning — drawn again only when what it shows changes: its size, the
   * fold, the chip, the side its text stands on.
   */
  private frameStill(now: number) {
    const key = [this.width, this.pixelRatio, this.collapse, this.scrollPitch, this.chip[0], this.chip[1], this.mirrored].join();
    if(key === this.stillFrame) return;
    this.stillFrame = key;
    this.endCount();
    this.lastTime = null;
    this.pan = [0, 0];
    this.hover = [0, 0];
    this.card = [0, 0];
    this.depth = [0, 0];
    this.idle = idleTilt(this.elapsed);
    this.highlight = [this.idle[0], this.idle[1]];
    this.scale = this.targetScale = 1;
    this.panTilt = this.gemRoll = this.gemRate = 0;
    // * the gem's own clock stands too
    this.gem.resetClock();
    this.render(now);
  }

  private perspective(pitch: number, scale: number): CAMatrix {
    // Camera and shifts are in points of the 361-wide iOS card: a card of
    // another size has the same perspective.
    const k = this.width / 361;
    let t = ca.identity();
    t[11] = -1 / (650 * k);
    // Tilts in place: only gives a little to the side.
    t = ca.translate(t, -this.card[1] * 3 * k, this.card[0] * 2.5 * k);
    t = ca.scale(t, scale, scale);
    t = ca.rotate(t, pitch, 1, 0, 0);
    t = ca.rotate(t, this.card[1], 0, 1, 0);
    t = ca.rotate(t, this.card[1] * 0.05, 0, 0, 1);
    return t;
  }

  private project(x: number, y: number, t: CAMatrix, z = 0): Vec3 {
    const ax = this.width / 2, ay = this.height / 2;
    const px = x - ax, py = y - ay;
    const tx = px * t[0] + py * t[4] + z * t[8] + t[12];
    const ty = px * t[1] + py * t[5] + z * t[9] + t[13];
    let tw = px * t[3] + py * t[7] + z * t[11] + t[15];
    if(Math.abs(tw) < 0.0001) tw = 0.0001;
    return [ax + tx / tw, ay + ty / tw, tw];
  }

  /**
   * Shift of the back against the face on screen — the thickness along the
   * tilt. The back is not an honest perspective but the same face shifted as
   * in an axonometry: with the camera at 650 points the perspective almost
   * hides the edge.
   */
  private edgeShift(pitch: number, yaw: number): Vec2 {
    const depth = -DESIGN.thickness * this.s * this.scale;
    let r = ca.rotate(ca.identity(), pitch, 1, 0, 0);
    r = ca.rotate(r, yaw, 0, 1, 0);
    return [depth * r[8], depth * r[9]];
  }

  private quad(t: CAMatrix, shift: Vec2): Vec4[] {
    const pad = CardBackground.padding;
    const W = this.width + pad * 2, H = this.height + pad * 2;
    const clip = (x: number, y: number): Vec4 => {
      const p = this.project(x, y, t);
      const nx = ((p[0] + shift[0] + pad) / W) * 2 - 1;
      const ny = 1 - ((p[1] + shift[1] + pad) / H) * 2;
      return [nx * p[2], ny * p[2], 0, p[2]];
    };
    const w = this.width, h = this.height;
    return [clip(0, h), clip(w, h), clip(0, 0), clip(w, 0)];
  }

  /**
   * The history is scrolled (iOS WalletScreen): `fraction` 0 — the card is in place, 1 — folded away under the
   * header; `pitch` — how far the fold leaned it back, of its full π/3 (none without movement). The fold itself
   * is the screen's transform of `fold`; from here come the light on the metal, the gem and the shadow.
   */
  public setScroll(fraction: number, pitch: number) {
    this.collapse = clamp01(fraction);
    this.scrollPitch = clamp01(pitch);
  }

  /** The QR chip fades and blurs with the name and the address: its alpha, its blur in design points. */
  public setChip(alpha: number, blur: number) {
    this.chip = [alpha, blur];
  }

  /** A canvas the gem's frames are copied to — the gem of the balance flying to the header — or none. */
  public setGemMirror(canvas: HTMLCanvasElement) {
    this.gemMirror = canvas?.getContext('2d');
    if(canvas) {
      canvas.width = this.gemCanvas.width;
      canvas.height = this.gemCanvas.height;
    }
  }

  private render(now: number) {
    // The fold belongs to the screen's transform of .card-fold, by the scroll. Here is only the finger tilt;
    // from the fold — the light on the metal, the gem leaving the card's tilt and the shadow.
    const fold = this.collapse;
    const finger = clamp(this.card[0], MAX_PITCH);
    const pitch = finger;
    const scale = this.scale;
    const yaw = this.card[1];
    let t = this.perspective(pitch, scale);

    // A turned card does not leave its padding: the near edge grows in
    // perspective — the whole card shrinks slightly.
    this.fitScale = 1;
    const slab = this.edgeShift(pitch, yaw);
    const ax = this.width / 2;
    let reach = 0;
    for(const [x, y] of [[0, 0], [this.width, 0], [0, this.height], [this.width, this.height]]) {
      const p = this.project(x, y, t)[0];
      reach = Math.max(reach, Math.abs(p - ax), Math.abs(p + slab[0] - ax));
    }
    if(reach > ax) {
      this.fitScale = ax / reach;
      t = ca.concat(t, ca.scaling(this.fitScale, this.fitScale, 1));
    }
    this.cardMatrix = t;
    // The card's bottom edge on screen (with the rim) — the header learns
    // from it that the card went under it completely.
    this.projectedBottom = Math.max(...[[0, this.height], [this.width, this.height]]
    .map(([x, y]) => this.project(x, y, t)[1])) + Math.max(0, slab[1] * this.fitScale);

    // The card is tilted by the finger — the gem grows a little, as if it leaned towards the eye.
    const tilt = this.panTilt;
    this.gemScale = 1 + 0.16 * tilt * tilt * (3 - 2 * tilt);
    const nudge = this.nudge();
    this.gemCanvas.style.transform = `translate(${nudge}px, 0) scale(${this.gemScale})`;

    const css = ca.css(t);
    this.face.style.transform = css;
    this.shadow.style.transform = css;
    // The lift's shadow, or the fold's: it swells while the card folds and goes as it leaves (iOS).
    const lift = Math.max(0, Math.min(1, (this.scale - 1) / 0.02));
    const wave = Math.sin(Math.PI * fold);
    this.shadow.style.opacity = String(Math.max(MAX_LIFT_SHADOW * smoothstep01(lift), SCROLL_SHADOW * wave * wave));

    // The gem nods with the card: its tilt is the gem's tilt and turn. Folding, the balance leaves the card for
    // the header, and the gem stops following the card (iOS: no tilt once the scroll transform is not identity).
    const follow = 1 - Math.min(1, fold * 8);
    this.gem.style.tilt = -finger * 1.1 * follow;

    this.gem.style.lean = yaw * 1.1 * follow;

    const lens = this.lens(nudge);
    const shift: Vec2 = [slab[0] * this.fitScale, slab[1] * this.fitScale];
    const extraIdle = HIGHLIGHT_IDLE_GAIN - 1;
    // Leaning back, the metal catches another light — the highlight travels over the card (iOS: up to the
    // card's largest tilt, by two thirds of the fold's pitch).
    const scrollHighlight = smoothstep01(Math.min(1, this.scrollPitch / 0.64)) * MAX_PITCH;
    this.background.render({
      time: this.elapsed,
      highlightTilt: [clamp(this.highlight[0] + scrollHighlight, MAX_PITCH + 0.03) + this.idle[0] * extraIdle,
        this.highlight[1] + this.idle[1] * extraIdle],
      surfaceTilt: [clamp(this.depth[0], MAX_PITCH + 0.03), this.depth[1]],
      slab: {front: this.quad(t, [0, 0]), back: this.quad(t, shift)},
      lens: lens && lens.card,
      chip: this.chip,
      chipX: cardChipX(this.mirrored)
    });
    this.gem.setLens(lens && lens.gem);
    this.gem.render(now);
    if(this.gemMirror) {
      const mirror = this.gemMirror.canvas;
      if(mirror.width !== this.gemCanvas.width || mirror.height !== this.gemCanvas.height) {
        mirror.width = this.gemCanvas.width;
        mirror.height = this.gemCanvas.height;
      }

      this.gemMirror.clearRect(0, 0, mirror.width, mirror.height);
      this.gemMirror.drawImage(this.gemCanvas, 0, 0);
    }
  }

  /**
   * The lens under the grown gem: the silhouette for the metal (in card
   * units) and for the copy of the amount on the gem canvas.
   */
  private lens(nudge: number): {card: CardLens, gem: GemLens} {
    const pose = this.gem.pose;
    const strength = (pose.grow - 1) / (this.gem.style.dragGrow - 1);
    if(strength <= 0.002) return null;
    let hull = gemHull(this.outline, pose.yaw, pose.pitch, DESIGN.gemWidth * pose.grow / 2 * 0.96);
    if(hull.length > 48) hull = hull.filter((_, i) => i % Math.ceil(hull.length / 48) === 0);
    const z = this.gemScale;
    const [gx, gy] = this.gemCenter();
    const center: Vec2 = [gx + nudge, gy];
    const half = DESIGN.gemCanvas / 2;
    return {
      card: {center, hull: hull.map((p): Vec2 => [center[0] + p[0] * z, center[1] + p[1] * z]), strength, spin: pose.yaw},
      gem: {center: [half, half], hull: hull.map((p): Vec2 => [half + p[0], half + p[1]]), strength, spin: pose.yaw,
        textScale: z, textShift: nudge}
    };
  }

  /** Removes the listeners and the observer, and releases both WebGL contexts. */
  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    this.listenerSetter.removeAll();
    this.count = null;
    this.gem.destroy();
    this.background.destroy();
  }
}
