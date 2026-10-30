/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {easeOutCubicApply} from '@helpers/easing/easeOutCubic';
import {getAppWindow} from '@helpers/appWindow';
import {requestWalletFrame} from '@components/wallet/frameLoop';

/**
 * The stars a transfer card throws when it settles: the desktop client's StarBurst with its card descriptor. Two
 * fans of four-pointed stars leave the diamond to the sides, fly out on an ease-out, fall a little, twinkle by
 * stretching, and fade. Angles are in degrees with y down; reach, fall and size are in card widths, the start in
 * diamond sizes.
 */

const STAR_PATH = 'm14.079 21.23-8.3538-2.2799c-0.52464-0.14318-0.83388-0.68456-0.69069-1.2092 0.091766-0.33624 0.35445-0.59893 0.69069-0.69069l8.3538-2.2799c0.33624-0.091766 0.59893-0.35445 0.69069-0.69069l2.2799-8.3538c0.14318-0.52464 0.68456-0.83388 1.2092-0.69069 0.33624 0.091766 0.59893 0.35445 0.69069 0.69069l2.2799 8.3538c0.091766 0.33624 0.35445 0.59893 0.69069 0.69069l8.3538 2.2799c0.52464 0.14318 0.83388 0.68456 0.69069 1.2092-0.091766 0.33624-0.35445 0.59893-0.69069 0.69069l-8.3538 2.2799c-0.33624 0.091766-0.59893 0.35445-0.69069 0.69069l-2.2799 8.3538c-0.14318 0.52464-0.68456 0.83388-1.2092 0.69069-0.33624-0.091766-0.59893-0.35445-0.69069-0.69069l-2.2799-8.3538c-0.091766-0.33624-0.35445-0.59893-0.69069-0.69069z';
const STAR_VIEWBOX = 36;

const DELAY = 90;
const SPREAD = 250;
const LIFE_MIN = 850;
const LIFE_MAX = 1100;
export const BURST_DURATION = DELAY + SPREAD + LIFE_MAX;
const STARS_PER_SIDE = 48;
const APPEAR_TILL = .2;
const FADE_AFTER = .8;
const DEFORMATION = .1;

type Range = [number, number];
const ANGLE: Range = [-40, 12];
const REACH: Range = [.25, .65];
const FALL: Range = [.2, .4];
const START_X: Range = [.35, .65];
const START_Y: Range = [-.25, .2];
const SIZE: Range = [.01, .034];
const ALPHA: Range = [.4, .7];
const TWINKLE: Range = [.1, 1.9];

type Star = {
  birth: number,
  life: number,
  side: number,
  angle: number,
  reach: number,
  fall: number,
  startX: number,
  startY: number,
  size: number,
  alpha: number,
  sinFactor: number
};

let starPath: Path2D;

const between = ([from, till]: Range) => from + Math.random() * (till - from);

function makeStars() {
  const stars: Star[] = [];
  for(const side of [-1, 1]) {
    for(let i = 0; i < STARS_PER_SIDE; ++i) {
      stars.push({
        birth: DELAY + Math.random() * SPREAD,
        life: between([LIFE_MIN, LIFE_MAX]),
        side,
        angle: between(ANGLE),
        reach: between(REACH),
        fall: between(FALL),
        startX: side * between(START_X),
        startY: between(START_Y),
        size: between(SIZE),
        alpha: between(ALPHA),
        sinFactor: between(TWINKLE) * (Math.random() < .5 ? -1 : 1)
      });
    }
  }

  return stars;
}

/**
 * Plays one burst on a canvas laid over the card and resolves when the last star is gone
 */
export function playWalletCardBurst(options: {
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  /** the diamond's centre */
  originX: number,
  originY: number,
  /** the diamond's size */
  emitter: number
}) {
  const {canvas, width, height, originX, originY, emitter} = options;
  // * the pixels and the frames of the window the app is in (the tab, or its Document PiP window)
  const dpr = getAppWindow().devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  starPath ??= new Path2D(STAR_PATH);
  const stars = makeStars();
  const extent = width;
  // * timed by this realm's clock, not by the frame's: a Document PiP window's frames count from its own opening
  const started = performance.now();

  return new Promise<void>((resolve) => {
    const frame = () => {
      const elapsed = performance.now() - started;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if(elapsed >= BURST_DURATION || !canvas.isConnected) {
        resolve();
        return;
      }

      ctx.fillStyle = '#fff';
      for(const star of stars) {
        const age = elapsed - star.birth;
        if(age < 0 || age >= star.life) {
          continue;
        }

        const progress = age / star.life;
        const appear = Math.min(1, progress / APPEAR_TILL);
        const fade = 1 - Math.max(0, Math.min(1, (progress - FADE_AFTER) / (1 - FADE_AFTER)));
        const travel = easeOutCubicApply(progress, 1);
        const radians = star.angle * Math.PI / 180;
        const x = originX + star.startX * emitter + star.side * Math.cos(radians) * star.reach * extent * travel;
        const y = originY + star.startY * emitter + Math.sin(radians) * star.reach * extent * travel +
          star.fall * extent * progress * progress;
        const deformH = 1 + DEFORMATION * Math.sin(star.sinFactor * progress * 2 * Math.PI);
        const side = star.size * extent * appear;
        const w = side * fade / deformH;
        const h = side * deformH;
        if(w <= 0 || h <= 0) {
          continue;
        }

        ctx.globalAlpha = star.alpha * appear * fade;
        ctx.setTransform(
          dpr * w / STAR_VIEWBOX, 0,
          0, dpr * h / STAR_VIEWBOX,
          dpr * (x - w / 2), dpr * (y - h / 2)
        );
        ctx.fill(starPath);
      }

      requestWalletFrame(frame);
    };

    requestWalletFrame(frame);
  });
}
