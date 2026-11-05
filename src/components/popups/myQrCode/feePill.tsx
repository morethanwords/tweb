import {Accessor, createEffect, createMemo, createSignal, Match, on, onCleanup, onMount, Show, Switch} from 'solid-js';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import I18n, {i18n} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import liteMode from '@helpers/liteMode';
import {nodeFrame} from '@helpers/schedulers';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import {IconTsx} from '@components/iconTsx';
import createFeeCode, {FREE_SECONDS} from './feeCode';
import {formatCountdown} from './link';
import {burnAdopt, burnCut, burnFront, burnLiquid, burnParticles, burnRestart, BurnState, isPouring, REFILL} from './pillBurn';
import styles from './feePill.module.scss';

type FeeCode = ReturnType<typeof createFeeCode>;

/**
 * The time left to a temporary code: a text node of its own, the only thing that changes each second. An element, not a
 * component, as an argument of `i18n` takes nodes, and a component may come back as something else (a hot one does).
 */
function time(left: () => number | undefined) {
  return (<span class={styles.time} dir="ltr">{formatCountdown(left() ?? 0)}</span>) as HTMLElement;
}

/** The time left to a contact link, where the fee pill would stand (no fee): information only, no tap */
export function ExpiryPill(props: {left: () => number | undefined, top: number, away?: boolean}) {
  return (
    <div class={classNames(styles.place, props.away && styles.away)} style={{top: props.top + 'px'}}>
      <span class={styles.pill}>
        {props.left() === undefined ? i18n('QRCode.CreatingLink') : i18n('QRCode.NoPaid.ExpiresIn', [time(props.left)])}
      </span>
    </div>
  );
}

/**
 * The fee as the pill says it: the app's star, a little apart from the number, in this order in either direction (an
 * amount with its sign). An element, as an argument of `i18n`
 */
function price(stars: () => number) {
  return (
    <span dir="ltr">
      <IconTsx icon="star" class={styles.priceStar} />
      {numberThousandSplitterForStars(stars())}
    </span>
  ) as HTMLElement;
}

/** The pill's menu row: a title, and under it a line saying what it does */
function menuRow(title: () => ReturnType<typeof i18n>, info: () => ReturnType<typeof i18n>) {
  const element = document.createElement('span');
  createEffect(() => {
    const subtitle = document.createElement('span');
    subtitle.className = styles.subtitle;
    subtitle.append(info());
    element.replaceChildren(title(), subtitle);
  });
  return element;
}

/** What the free pill says: the time left on the timer, or that there is none */
function freeLabel(fee: FeeCode) {
  return (
    <span class={styles.label}>
      <Switch>
        <Match when={fee.mode() === 'temporary'}>
          {i18n('QRCode.NoPaid.Free')} · {i18n('QRCode.NoPaid.ExpiresIn', [time(fee.left)])}
        </Match>
        <Match when={true}>
          {i18n('QRCode.NoPaid.Free')} · {i18n('QRCode.NoPaid.NoTimeLimit')}
        </Match>
      </Switch>
    </span>
  );
}

// `QrShareView`: the white fill sweeps in over 340 ms, then burns down with the minute
const FILL_SWEEP_MS = 340;
// how far round the pill the sparks fly (`QrStudioCodePillView.particleMargin`)
const SPARKS_MARGIN_X = 90, SPARKS_MARGIN_Y = 76;
// a spark is drawn out along its flight by its speed, up to this much (`QrShareView.drawSparks`)
const SPARK_STRETCH = 1.8, SPARK_STRETCH_SPEED = 220;
const GLOW_SIZE = 32;

/** A soft round glow in the colour, full at its middle and gone at its rim, that a halo is drawn of at its size */
function glowSprite(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GLOW_SIZE;
  const ctx = canvas.getContext('2d');
  const r = GLOW_SIZE / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  for(const [offset, alpha] of [[0, 1], [0.25, 0.55], [0.6, 0.15], [1, 0]]) {
    gradient.addColorStop(offset, `rgba(0, 0, 0, ${alpha})`);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  return canvas;
}

/**
 * The pill of a free code: a white fill under the words in the code's ink pours in from the inline start, and on the
 * timer burns back toward it as the minute runs out; what it has left is glass again. With the motion on, as iOS has it
 * (`pillBurn.ts`): the front is a meniscus as it pours and ragged as it burns, glowing, giving off dust and sparks; else
 * one straight front, second by second, as on Android.
 */
function FreePill(props: {fee: FeeCode, ref: (button: HTMLButtonElement) => void, away: Accessor<boolean>, foreground: Accessor<string>}) {
  const {fee} = props;
  // the motion switched off on the way (the settings, the system's reduce motion) leaves the straight fill
  const live = createMemo(() => liteMode.isAvailable('motion'));
  const [swept, setSwept] = createSignal(live() || !liteMode.isAvailable('animations'));
  const [burning, setBurning] = createSignal(swept());
  onMount(() => {
    if(swept()) return;
    const cancel = nodeFrame(button, () => setSwept(true));
    const timer = window.setTimeout(() => setBurning(true), FILL_SWEEP_MS);
    onCleanup(() => {
      cancel();
      clearTimeout(timer);
    });
  });

  const fraction = () => !swept() ? 0 : fee.mode() === 'temporary' ? (fee.left() ?? FREE_SECONDS) / FREE_SECONDS : 1;

  let button: HTMLButtonElement, fill: HTMLSpanElement, sparks: HTMLCanvasElement;
  // the burn is made anew only when the motion comes and goes: what the code does on the way, it follows itself
  onMount(() => createEffect(on(live, (isLive) => {
    if(isLive) burnLive({fee, button, fill, sparks, away: props.away, foreground: props.foreground});
  })));

  return (
    <>
      {/* the toggle's class is in the markup: the menu opens only from a trigger that has it, and Solid sets the class after the ref */}
      <button
        ref={(element) => {
          button = element;
          props.ref(element);
        }}
        class={classNames(styles.pill, styles.freePill, 'btn-menu-toggle')}
        type="button"
      >
        {freeLabel(fee)}
        <span
          ref={fill}
          class={classNames(styles.fill, burning() && styles.fillBurning)}
          // with the motion on, its shape is the script's, every frame
          style={live() ? {transition: 'none'} : {'--fill': fraction()}}
          aria-hidden="true"
        >
          {freeLabel(fee)}
        </span>
      </button>
      <Show when={live()}>
        <canvas ref={sparks} class={styles.sparks} aria-hidden="true" />
      </Show>
    </>
  );
}

/**
 * The fill's shape and the sparks, every frame while the fill pours or burns and the pill is in sight (`pillBurn.ts`);
 * its owner's end puts the straight fill back
 */
function burnLive({fee, button, fill, sparks, away, foreground}: {
  fee: FeeCode,
  button: HTMLButtonElement,
  fill: HTMLSpanElement,
  sparks: HTMLCanvasElement,
  /** A panel hides the pill: nothing is drawn till it is back, the minute running on */
  away: Accessor<boolean>,
  /** The words' colour on the glass, which the sparks take: white over a dark backdrop, which their glow brightens */
  foreground: Accessor<string>
}) {
  const ctx = sparks.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const now = () => performance.now() / 1000;
  // the minute's end on this clock: the code's, or a whole one from now while it is on its way
  const deadline = (time: number) => {
    if(fee.mode() !== 'temporary') return Infinity;
    const expires = fee.expires();
    return expires === undefined ? time + FREE_SECONDS : time + (expires * 1000 - Date.now()) / 1000;
  };

  // the fill pours in from nothing; but a minute well on its way (the motion back on in its middle, the screen opened
  // again) has it stand where its time has got to
  const time = now(), end = deadline(time);
  let state: BurnState = fee.expires() !== undefined && end - time < FREE_SECONDS - REFILL ?
    {issuedAt: end - FREE_SECONDS, pourFrom: 0, lifetime: FREE_SECONDS} :
    burnRestart(undefined, time, end);
  let width = 0, height = 0, lastTick = -1;
  // the next frame's call-off, while one is on its way
  let frame: () => void;
  let glow: {color: string, canvas: HTMLCanvasElement};

  const observer = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0];
    width = box ? box.inlineSize : button.offsetWidth;
    height = box ? box.blockSize : button.offsetHeight;
    sparks.width = Math.round((width + 2 * SPARKS_MARGIN_X) * dpr);
    sparks.height = Math.round((height + 2 * SPARKS_MARGIN_Y) * dpr);
    lastTick = -1;
    start();
  });
  observer.observe(button);

  const draw = () => {
    frame = undefined;
    if(!width || away()) return;
    const time = now(), rtl = I18n.getIsRTL();
    const pouring = isPouring(state, time);
    // the front moves every frame as it pours, and 20 times a second as it burns
    const tick = pouring ? time : Math.floor(time * 20) / 20;
    if(tick !== lastTick) {
      lastTick = tick;
      const cut = burnCut(burnFront(state, width, tick), width, height, tick, burnLiquid(state, tick));
      fill.style.clipPath = cut === true ? 'none' : !cut ? 'inset(0 100% 0 0)' :
        `polygon(${cut.map(([x, y]) => `${(rtl ? width - x : x).toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, sparks.width, sparks.height);
    const particles = burnParticles(state, width, height, time);
    if(particles.length) {
      // in the pill's box, the inline start on the left
      ctx.setTransform(rtl ? -dpr : dpr, 0, 0, dpr, (SPARKS_MARGIN_X + (rtl ? width : 0)) * dpr, SPARKS_MARGIN_Y * dpr);
      const color = foreground();
      if(glow?.color !== color) glow = {color, canvas: glowSprite(color)};
      // the glow under them: each its own, fading out to its rim, and on a dark backdrop added to what is under it, so
      // that it gathers where they crowd (one flat shape for them all, as iOS fills it, reads as bubbles here)
      ctx.globalCompositeOperation = color.toLowerCase() === '#ffffff' ? 'lighter' : 'source-over';
      for(const particle of particles) {
        if(!particle.halo) continue;
        ctx.globalAlpha = Math.min(1, particle.alpha * 2);
        ctx.drawImage(glow.canvas, particle.x - particle.radius, particle.y - particle.radius, 2 * particle.radius, 2 * particle.radius);
      }

      // and the sparks, drawn out a little along their flight, as Android draws them
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
      for(const particle of particles) {
        if(particle.halo) continue;
        const stretch = Math.min(SPARK_STRETCH, 1 + Math.hypot(particle.vx, particle.vy) / SPARK_STRETCH_SPEED);
        ctx.globalAlpha = particle.alpha;
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, particle.radius * stretch, particle.radius, Math.atan2(particle.vy, particle.vx), 0, 2 * Math.PI);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    // the timer's fill runs until the fee is back; one with no timer, until it has poured in
    if(state.lifetime !== Infinity || pouring) frame = nodeFrame(sparks, draw);
  };

  function start() {
    if(!frame) frame = nodeFrame(sparks, draw);
  }

  // the pill back in sight: the fill stands where its minute has got to
  createEffect(on(away, (isAway) => isAway || start(), {defer: true}));

  // a minute begun anew, the code of the asked one come, or the timer off: the fill pours again from where it stands
  createEffect(on(() => [fee.mode(), fee.expires()] as const, ([mode]) => {
    const time = now();
    state = mode === 'temporary' && state.lifetime !== Infinity ? burnAdopt(state, time, deadline(time)) : burnRestart(state, time, deadline(time));
    start();
  }, {defer: true}));

  onCleanup(() => {
    frame?.();
    observer.disconnect();
    fill.style.clipPath = '';
  });
}

/**
 * The pill under the card that removes the message fee. While the fee stands it is one tap away from a temporary free
 * code; once there is a code, a tap opens the menu that resets it, changes its timer or brings the fee back.
 */
export function FeePill(props: {
  fee: FeeCode,
  top: number,
  /** The words' colour on the glass */
  foreground: Accessor<string>,
  /** A panel stands where it is */
  away?: boolean
}) {
  const {fee} = props;
  // the free pill is a menu toggle; it is made when the pill turns from the fee one
  const attachMenu = (freeButton: HTMLButtonElement) => {
    const timerRow = menuRow(
      () => fee.mode() === 'temporary' ? i18n('QRCode.NoPaid.Menu.DisableTimer') : i18n('QRCode.NoPaid.Menu.EnableTimer'),
      () => fee.mode() === 'temporary' ? i18n('QRCode.NoPaid.Menu.DisableTimerInfo') : i18n('QRCode.NoPaid.Menu.EnableTimerInfo')
    );

    const buttons: ButtonMenuItemOptionsVerifiable[] = [{
      icon: 'rotate_right',
      text: 'QRCode.NoPaid.Menu.Reset',
      onClick: () => fee.resetCode()
    }, {
      icon: 'schedule',
      textElement: timerRow,
      multiline: true,
      verify: () => fee.canDisableTimer(),
      onClick: () => fee.toggleTimer()
    }, {
      icon: 'star',
      text: 'QRCode.NoPaid.Menu.RestoreFee',
      onClick: () => fee.restoreFee()
    }];

    ButtonMenuToggle({
      container: freeButton,
      direction: 'top-left',
      // over the pill, in its middle
      floatingDirection: 'top-center',
      buttons
    });
  };

  return (
    <div class={classNames(styles.place, props.away && styles.away)} style={{top: props.top + 'px'}}>
      <Show
        when={fee.mode() !== 'fee'}
        fallback={
          <button
            class={styles.pill}
            type="button"
            onClick={() => fee.removeFee()}
          >
            {i18n('QRCode.NoPaid.RemoveStarsFee', [price(fee.fee)])}
          </button>
        }
      >
        <FreePill fee={fee} ref={attachMenu} away={() => !!props.away} foreground={props.foreground} />
      </Show>
    </div>
  );
}
