/*
 * The status of an outgoing message — clock, check, two checks, error — drawn in the tgico glyphs'
 * own 19×14 box (assets/icons/sending.svg, 1check.svg, 2checks.svg, sendingerror_filled.svg: same
 * points, same 1.3 and 1.2 widths). One status gives way to the next as a dissolve about their common
 * centre — the clock's, which is the check's and the error disk's too: the old icon shrinks towards
 * half its size and fades while the new one grows from half its size, a touch past 1 and back, and
 * shows, so something stands there all the way through. Read moves the check 3 units left, to where the
 * `checks` glyph has its first check, and the second one comes beside it. An icon put where no status
 * was comes in the same way, alone. A status asked for while a change plays follows once it is over,
 * from where it ended — cut short, the icon would jump to where it was going — so the clock of a message
 * confirmed at once is still seen to come and go. While a message is being sent the clock's hands go
 * round, the minute hand once in 1.5 s and the hour hand in 4.5 s, as in Telegram for Android
 * (MsgClockDrawable).
 *
 * What it costs: at rest, what the glyph cost — the span with the glyph in it. The glyph keeps the box
 * the font gives the icon everywhere it is used, but is not painted; the icon is the span's ::before
 * (and the clock's minute hand its ::after), masked with an image of its drawing, one per layer, built
 * once into a shared stylesheet. The hands turn with CSS animations, every clock in the same phase. A
 * change is Web Animations of `scale`, `translate` and `opacity` of two spans with the same layers, the
 * old icon and the new one, laid over the span's box while it lasts, so no script runs while it plays.
 *
 * Animation levels: full as above; reduced crossfades and moves nothing (the hands still go: they say
 * the message is on its way, like a spinner); off swaps, hands still.
 */

import liteMode from '@helpers/liteMode';
import sequentialDom from '@helpers/sequentialDom';
import isInSight from '@helpers/dom/isInSight';
import Icon, {getIconContent} from '@components/icon';
import styles from '@components/sendingStatusIcon.module.scss';

export type SendingStatusIconState = 'sending' | 'sent' | 'read' | 'error';

const GLYPHS: {[state in SendingStatusIconState]: Icon} = {
  sending: 'sending',
  sent: 'check',
  read: 'checks',
  error: 'sendingerror_filled'
};
const STATES = Object.keys(GLYPHS) as SendingStatusIconState[];
// global, for the stylesheet built here: a state's drawing, and the second check of read alone
const stateClass = (state: SendingStatusIconState) => 'sending-status-is-' + state;
const SECOND_CHECK_CLASS = 'sending-status-is-second';

/* ── the drawings, in the glyph box ── */

type Point = [number, number];
// every check has the same angles: its joint and the lengths of its short and long arms
type Check = {j: Point, ls: number, ll: number};

const SHORT_ARM = -135, LONG_ARM = -48.814;
const READ_SHIFT = -3;
const CHECK: Check = {j: [8, 11], ls: 4.243, ll: 10.63};
const FIRST_OF_TWO: Check = {...CHECK, j: [CHECK.j[0] + READ_SHIFT, CHECK.j[1]]};
const SECOND_OF_TWO: Check = {j: [10, 11], ls: 1.414, ll: 10.63};
const CLOCK_CENTER: Point = [10, 7];
const RING_R = 6, RING_W = 1.2;
// the hands at rest, as the glyph has them: the minute one up, the hour one to the lower right
const MINUTE_HAND = 'M10 7V3.5', HOUR_HAND = 'M10 7L12 9';
// a disk r 6.6 with the bar of "!" and its dot cut out, filled even-odd
const ERROR_DISK = 'M3.4 7a6.6 6.6 0 1 0 13.2 0a6.6 6.6 0 1 0-13.2 0' +
  'M9.35 3.5a.65 .65 0 0 1 1.3 0V7.5a.65 .65 0 0 1-1.3 0Z' +
  'M9.25 10a.75 .75 0 1 0 1.5 0a.75 .75 0 1 0-1.5 0';
const MINUTE_PERIOD = 1500, HOUR_PERIOD = 4500;

const RAD = Math.PI / 180;
const round = (x: number) => Math.round(x * 1000) / 1000;

function checkPath({j: [x, y], ls, ll}: Check) {
  return `M${round(x + ls * Math.cos(SHORT_ARM * RAD))} ${round(y + ls * Math.sin(SHORT_ARM * RAD))}` +
    `L${round(x)} ${round(y)}` +
    `L${round(x + ll * Math.cos(LONG_ARM * RAD))} ${round(y + ll * Math.sin(LONG_ARM * RAD))}`;
}

// each layer as an svg of the glyph's 1em box with the 19×14 drawing centred in it
const svg = (content: string) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2.5 19 19" fill="none" ' +
  `stroke="#000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
const path = (d: string) => `<path d="${d}"/>`;
const DRAWINGS = {
  // the clock is two layers, so the hands can turn: the ring with the hour hand, and the minute hand
  clock: svg(`<circle cx="${CLOCK_CENTER[0]}" cy="${CLOCK_CENTER[1]}" r="${RING_R}" stroke-width="${RING_W}"/>` + path(HOUR_HAND)),
  minute: svg(path(MINUTE_HAND)),
  sent: svg(path(checkPath(CHECK))),
  read: svg(path(checkPath(FIRST_OF_TWO)) + path(checkPath(SECOND_OF_TWO))),
  second: svg(path(checkPath(SECOND_OF_TWO))),
  error: svg(`<path d="${ERROR_DISK}" fill="#000" stroke="none" fill-rule="evenodd"/>`)
};

// Every clock's hands are where they would be had they gone round since the page started, as iOS
// keeps its clocks in step: a clock that comes, or one that goes as a layer of a change, shows its
// hands where the last one left them without anything being read back. The animations start when the
// state class lands, a frame at most from now.
const HOUR_PHASE = '--sending-status-hour', MINUTE_PHASE = '--sending-status-minute';
function setHandsPhase(element: HTMLElement, clock: boolean) {
  if(!clock) {
    if(!element.style.length) {
      return;
    }

    element.style.removeProperty(HOUR_PHASE);
    element.style.removeProperty(MINUTE_PHASE);
    return;
  }

  const now = performance.now();
  element.style.setProperty(HOUR_PHASE, -round(now % HOUR_PERIOD) + 'ms');
  element.style.setProperty(MINUTE_PHASE, -round(now % MINUTE_PERIOD) + 'ms');
}

let style: HTMLStyleElement;
function ensureStyle() {
  if(style?.isConnected) {
    return;
  }

  const image = (markup: string) => {
    const url = `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
    return `-webkit-mask-image:${url};mask-image:${url}`;
  };

  const icon = (name: string) => `.${styles.host}.${name}`;
  const clock = icon(stateClass('sending'));
  style = document.createElement('style');
  style.textContent = [
    `${clock}::before{${image(DRAWINGS.clock)}}`,
    `${clock}::after{content:"";${image(DRAWINGS.minute)}}`,
    `${icon(stateClass('sent'))}::before{${image(DRAWINGS.sent)}}`,
    `${icon(stateClass('read'))}::before{${image(DRAWINGS.read)}}`,
    `${icon(stateClass('error'))}::before{${image(DRAWINGS.error)}}`,
    `${icon(SECOND_CHECK_CLASS)}::before{${image(DRAWINGS.second)}}`,
    // the hands turn from the reduced animation level up, every clock in the same phase (setHandsPhase)
    `body.animation-level-1 ${clock}::before{animation:${styles.turn} ${HOUR_PERIOD}ms linear var(${HOUR_PHASE},0ms) infinite}`,
    `body.animation-level-1 ${clock}::after{animation:${styles.turn} ${MINUTE_PERIOD}ms linear var(${MINUTE_PHASE},0ms) infinite}`
  ].join('\n');
  document.head.append(style);
}

/* ── changes ── */

// ms; read is the second check coming and the shift
const DURATION = 260, READ_DURATION = 220;
// past the end by a few hundredths and back
const OVERSHOOT = 'cubic-bezier(.3, 1.3, .6, 1)';
// the cubic ease-out, 1 - (1 - t)³
const EASE_OUT = 'cubic-bezier(.33333, 1, .66667, 1)';
// smoothstep, 3t² - 2t³, exactly: a fade that starts and ends at rest
const SMOOTH = 'cubic-bezier(.33333, 0, .66667, 1)';
// with sending → read the second check waits until the first is half in
const READ_AFTER = DURATION * .5;

type Level = 1 | 2;

// The animations are of elements only: one of a pseudo-element costs a style recalculation of the whole
// document each, so a hundred icons read at once took a hundred of them.

// One animation per icon: each property keeps to the keyframes that name it, with the easing of the
// keyframe its stretch starts at. A property the last keyframe leaves out goes back to its own value
// by the end, so the last one names them all.

// the old icon shrinks towards half its size and fades, gone halfway; it stays gone until the change ends
function goAway(target: Element, level: Level, duration = DURATION) {
  if(level === 1) {
    return target.animate({opacity: [1, 0]}, {duration: 150, easing: 'ease-in', fill: 'forwards'});
  }

  return target.animate([
    {scale: 1, opacity: 1, easing: EASE_OUT},
    {opacity: 1, offset: .05, easing: SMOOTH},
    {opacity: 0, offset: .5},
    {scale: .5, offset: .6},
    {scale: .5, opacity: 0}
  ], {duration, fill: 'forwards'});
}

// the new one grows from half its size, a touch past 1 and back, and shows by halfway
function come(target: Element, level: Level, duration = DURATION, delay = 0) {
  if(level === 1) {
    return target.animate({opacity: [0, 1]}, {duration: 200, easing: 'ease-out', fill: 'backwards'});
  }

  return target.animate([
    {scale: .5, opacity: 0, easing: OVERSHOOT},
    {opacity: 0, offset: .05, easing: SMOOTH},
    {opacity: 1, offset: .5},
    {scale: 1, opacity: 1}
  ], {duration, delay, fill: 'backwards'});
}

// the first check's way to where the `checks` glyph has it, and back
function shift(target: Element, back: boolean, delay = 0) {
  const shifted = `${round(READ_SHIFT / 19)}em 0`;
  return target.animate({translate: back ? [shifted, '0 0'] : ['0 0', shifted]}, {
    duration: READ_DURATION,
    delay,
    easing: EASE_OUT,
    fill: 'forwards'
  });
}

function setState(host: HTMLElement, from: SendingStatusIconState, to: SendingStatusIconState) {
  host.classList.replace(stateClass(from), stateClass(to));
  setHandsPhase(host, to === 'sending');
}

// an icon of the change, over the span's box: `drawing` is a state's, or the second check alone
function createLayer(host: HTMLElement, drawing: SendingStatusIconState | typeof SECOND_CHECK_CLASS) {
  const layer = document.createElement('span');
  const second = drawing === SECOND_CHECK_CLASS;
  layer.className = `${styles.host} ${styles.layer} ${second ? `${SECOND_CHECK_CLASS} ${styles.second}` : stateClass(drawing)}`;
  setHandsPhase(layer, drawing === 'sending');
  host.append(layer);
  return layer;
}

type Change = {
  to: SendingStatusIconState,
  // the status last asked for while this one plays
  next?: SendingStatusIconState,
  // `follow`: the next status comes as a change of its own; otherwise it is simply there
  end: (follow?: boolean) => void
};
const changes: WeakMap<HTMLElement, Change> = new WeakMap();

// `from`: none for an icon put where no status was; `colourBefore`: to or from an error, the colour the
// icon had, which the old drawing keeps as it goes
function change(host: HTMLElement, from: SendingStatusIconState | undefined, to: SendingStatusIconState, level: Level, colourBefore: string) {
  // the span's own layers wait out of sight, already of the new state; both icons are layers meanwhile
  host.classList.add(styles.moving);
  let layers: HTMLElement[], animations: Animation[];
  if(level === 2 && from === 'sent' && to === 'read') {
    // the check moves over, the second one comes beside it (the reduced level moves nothing)
    const [check, second] = layers = [createLayer(host, 'sent'), createLayer(host, SECOND_CHECK_CLASS)];
    animations = [shift(check, false), come(second, level, READ_DURATION)];
  } else if(level === 2 && from === 'sending' && to === 'read') {
    // the clock gives way to the check, which moves over once half in as the second one comes
    const [clock, check, second] = layers = [createLayer(host, 'sending'), createLayer(host, 'sent'), createLayer(host, SECOND_CHECK_CLASS)];
    animations = [goAway(clock, level), come(check, level), shift(check, false, READ_AFTER), come(second, level, READ_DURATION, READ_AFTER)];
  } else if(level === 2 && from === 'read' && to === 'sent') {
    const [check, second] = layers = [createLayer(host, 'sent'), createLayer(host, SECOND_CHECK_CLASS)];
    animations = [shift(check, true), goAway(second, level, READ_DURATION)];
  } else if(!from) {
    const coming = createLayer(host, to);
    layers = [coming];
    animations = [come(coming, level)];
  } else {
    const [going, coming] = layers = [createLayer(host, from), createLayer(host, to)];
    if(colourBefore) {
      going.style.color = colourBefore;
    }

    animations = [goAway(going, level), come(coming, level)];
  }

  const record: Change = {
    to,
    end: (follow) => {
      if(changes.get(host) !== record) {
        return;
      }

      changes.delete(host);
      host.classList.remove(styles.moving);
      layers.forEach((layer) => layer.remove());
      animations.forEach((animation) => animation.cancel());
      if(record.next) {
        // the status asked for meanwhile comes from here, before the frame is drawn - or, cut short,
        // is simply there, and only lets go of the colour held for it
        requestChange(host, to, record.next, follow ? liteMode.getAnimationLevel() : 0);
      }
    }
  };

  changes.set(host, record);
  // finishing resolves before the frame is drawn, so the span's own layers take over in the same frame
  Promise.all(animations.map((animation) => animation.finished)).then(() => record.end(true), () => {});
}

/* ── changes asked for in one task start together ── */

// The colour of an error is the place's own: a bubble or a row switches it with a class, before the
// icon is told. What comes takes the new colour; what goes keeps the old one (mixed, red and green would
// pass a muddy olive), and that is read through a held transition (`hold`): it is put on when the
// change is asked for, before anything has the styles worked out, so they keep the old colour as the
// computed one, and it is let go of once read. Everything asked for in a task is read in one go, then
// written in one go - a style recalculation for the lot, not one per icon - before the frame is drawn.
// level 0: asked again in the task without animation - the change only lets go of its hold
type Pending = {from: SendingStatusIconState | undefined, to: SendingStatusIconState, level: Level | 0};
const pending: Map<HTMLElement, Pending> = new Map();

// a tab that is not shown draws nothing
function getShownLevel(host: HTMLElement) {
  return host.isConnected && host.ownerDocument.visibilityState !== 'hidden' ? liteMode.getAnimationLevel() : 0;
}

function startPending() {
  const batch = [...pending];
  pending.clear();

  // reads: the colours held, then their transitions
  const held = batch.map(([host]) => host.classList.contains(styles.hold));
  const colours = batch.map(([host], i) => held[i] && host.isConnected ? getComputedStyle(host).color : undefined);
  const holds = batch.map(([host], i) => held[i] && typeof(CSSTransition) !== 'undefined' ? host.getAnimations().filter((animation) => {
    return animation instanceof CSSTransition && animation.transitionProperty === 'color';
  }) : []);

  // writes
  const started: HTMLElement[] = [];
  batch.forEach(([host, {from, to, level}], i) => {
    holds[i].forEach((transition) => transition.finish());
    host.classList.remove(styles.hold);
    if(level && from !== to && getShownLevel(host)) {
      change(host, from, to, level, colours[i]);
      started.push(host);
    }
  });

  settleUnseen(started);
}

// what is out of sight ends at once, as soon as the next frame can tell (reads, then writes)
function settleUnseen(hosts: HTMLElement[]) {
  if(!hosts.length) {
    return;
  }

  const records = hosts.map((host) => changes.get(host));
  let seen: boolean[];
  sequentialDom.measure(() => {
    seen = hosts.map((host, i) => changes.get(host) === records[i] && isInSight(host));
  });

  sequentialDom.mutate(() => {
    hosts.forEach((host, i) => !seen[i] && records[i].end());
  });
}

// the place changes the colour before it tells the icon, so this has to come before anything is read
function holdColour(host: HTMLElement, from: SendingStatusIconState, to: SendingStatusIconState) {
  if(from === 'error' || to === 'error') {
    host.classList.add(styles.hold);
  }
}

function requestChange(host: HTMLElement, from: SendingStatusIconState | undefined, to: SendingStatusIconState, level: Level | 0) {
  const earlier = pending.get(host);
  if(!pending.size) {
    queueMicrotask(startPending);
  }

  // asked twice in a task: from where the first started to where the last goes
  pending.set(host, {from: earlier ? earlier.from : from, to, level});
  if(level) {
    holdColour(host, from, to);
  }
}

/* ── api ── */

function getRestingState(host: HTMLElement) {
  return STATES.find((state) => host.classList.contains(stateClass(state)));
}

export default function SendingStatusIcon(state: SendingStatusIconState, ...classes: string[]) {
  ensureStyle();
  const host = Icon(GLYPHS[state], styles.host, stateClass(state), ...classes);
  setHandsPhase(host, state === 'sending');
  return host;
}

/**
 * Moves an icon made by SendingStatusIcon to a new state. `animated` is whether the change may be
 * shown at all (a copy kept hidden, or a list built in a batch, passes false). False if the element
 * is not such an icon.
 */
export function setSendingStatusIconState(host: HTMLElement, state: SendingStatusIconState, animated = true) {
  const current = getRestingState(host);
  if(!current) {
    return false;
  }

  // told the state it already has (a bubble does so whenever its time is drawn again): what is under
  // way goes on
  if(current === state) {
    return true;
  }

  // the state is the span's at once; the glyph only holds the box, it follows the state so the box is
  // the one that icon would have
  setState(host, current, state);
  host.firstChild.nodeValue = getIconContent(GLYPHS[state]);
  const level = animated ? getShownLevel(host) : 0;
  const running = changes.get(host);
  if(level && running) {
    // what is under way plays to its end, and this follows from there; the colour stays as it is till then
    running.next = state;
    holdColour(host, current, state);
  } else if(level) {
    requestChange(host, current, state, level);
  } else {
    // not shown: what is under way ends where it was going, and the icon is simply in its new state
    running?.end();
    if(pending.has(host)) {
      pending.get(host).level = 0;
    }
  }

  return true;
}

/**
 * Lets an icon made by SendingStatusIcon, just put where no status was shown, come in the way a status
 * follows another.
 */
export function showSendingStatusIcon(host: HTMLElement) {
  const state = getRestingState(host);
  const level = state ? getShownLevel(host) : 0;
  if(level && !changes.has(host) && !pending.has(host)) {
    requestChange(host, undefined, state, level);
  }
}

export function getSendingStatusIconState(host: HTMLElement) {
  return getRestingState(host);
}

// the still drawing of a state, for the test that pins it to the glyph
export function getSendingStatusIconDrawing(state: SendingStatusIconState) {
  return {
    clock: state === 'sending' ? {ring: {cx: CLOCK_CENTER[0], cy: CLOCK_CENTER[1], r: RING_R}, minute: MINUTE_HAND, hour: HOUR_HAND} : undefined,
    first: state === 'sent' ? checkPath(CHECK) : state === 'read' ? checkPath(FIRST_OF_TWO) : undefined,
    second: state === 'read' ? checkPath(SECOND_OF_TWO) : undefined,
    disk: state === 'error' ? ERROR_DISK : undefined
  };
}
