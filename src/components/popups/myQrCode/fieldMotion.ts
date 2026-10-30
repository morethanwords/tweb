import liteMode from '@helpers/liteMode';

/** The field's tile and its canvas, in px: the canvas is centred on the surface and covers it at any turn and shift */
export type FieldLayout = {surfaceWidth: number, surfaceHeight: number, canvasWidth: number, canvasHeight: number, periodWidth: number, periodHeight: number, draw?: (angle: number, x: number, y: number) => void};

/** The canvas that covers a surface turned to any angle and shifted by up to a period (it must not show an edge) */
export function fieldCanvasSize(width: number, height: number, periodWidth: number, periodHeight: number) {
  const diagonal = Math.hypot(width, height);
  return {width: Math.ceil(diagonal + periodWidth), height: Math.ceil(diagonal + periodHeight)};
}

// Android's `QrShareView`: the field turns 0.763 deg/s, drifts 6.2 px/s up and to the left with a wandering heading,
// follows a drag 1:1 and glides on after a release (tau 0.35 s, 2600 px/s at most). The idle motion stops under the
// finger (over 0.07 s) and returns 0.25 s after it (over 0.45 s).
// The idle speed is tenth of those numbers: side by side with the phone, they looked ten times too fast.
const IDLE_SPEED = 0.1;
const ROTATION = -0.763 * IDLE_SPEED;
const DRIFT_SPEED = 6.2 * IDLE_SPEED, DRIFT_ANGLE = Math.atan2(-5.5, -3.5);
const GLIDE_TAU = 0.35, GLIDE_END = GLIDE_TAU * 8, MAX_FLING = 2600;
const SLOP = 8;
const LIVE_FRAME = 32;
const VELOCITY_WINDOW = 100;
const wrap = (value: number, period: number) => value - Math.round(value / period) * period;

/**
 * Moves the field's element: a turn, a drift and a drag, all by one `transform`, never a redraw. One rAF loop runs
 * while there is a pattern, the tab is visible and the animations are full; it stops itself otherwise, and `update`,
 * a press or the tab coming back start it again.
 */
export default function attachFieldMotion(surface: HTMLElement, mover: HTMLElement, canStart: (target: HTMLElement) => boolean) {
  let layout: FieldLayout | undefined;
  let frame = 0, last = 0, lastDraw = 0;
  // the offset in the screen's frame: the drift, and the pan (the finger and the glide)
  let driftX = 0, driftY = 0, panX = 0, panY = 0;
  let idleTime = 0, idleK = 1, resumeAt = 0, clock = 0;
  let pointerId = -1, startX = 0, startY = 0, baseX = 0, baseY = 0, moved = false;
  let samples: {x: number, y: number, t: number}[] = [];
  let gliding = false, glideStart = 0, glideFromX = 0, glideFromY = 0, glideVX = 0, glideVY = 0;

  const canMove = () => !!layout && !document.hidden && liteMode.isAvailable('motion');

  const apply = () => {
    if(!layout) {
      mover.style.transform = '';
      return;
    }

    const angle = ROTATION * idleTime;
    const rad = angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const offsetX = driftX + panX, offsetY = driftY + panY;
    // the offset is in the screen's frame; the tile wraps in the field's own
    const x = wrap(offsetX * cos + offsetY * sin, layout.periodWidth);
    const y = wrap(-offsetX * sin + offsetY * cos, layout.periodHeight);
    if(layout.draw) {
      mover.style.transform = '';
      layout.draw(angle, x, y);
      return;
    }

    mover.style.transform = `translate(${layout.surfaceWidth / 2}px, ${layout.surfaceHeight / 2}px) rotate(${angle}deg) translate(${x - layout.canvasWidth / 2}px, ${y - layout.canvasHeight / 2}px)`;
  };

  const step = (now: number) => {
    frame = 0;
    if(!canMove()) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    clock += dt;

    if(pointerId !== -1 || gliding) resumeAt = clock + 0.25;
    const target = clock < resumeAt ? 0 : 1;
    idleK += (target - idleK) * (1 - Math.exp(-dt / (target < idleK ? 0.07 : 0.45)));
    const idleDt = dt * idleK;
    idleTime += idleDt;
    const heading = DRIFT_ANGLE + 1.2 * Math.sin(0.025 * idleTime) + 0.6 * Math.sin(0.016 * idleTime + 1);
    driftX += Math.cos(heading) * DRIFT_SPEED * idleDt;
    driftY += Math.sin(heading) * DRIFT_SPEED * idleDt;

    if(gliding) {
      const t = (now - glideStart) / 1000;
      const f = GLIDE_TAU * (1 - Math.exp(-t / GLIDE_TAU));
      panX = glideFromX + glideVX * f;
      panY = glideFromY + glideVY * f;
      if(t > GLIDE_END) gliding = false;
    }

    // a live field is a redraw: 30 a second is enough for the emoji's own frames while nothing follows the finger
    if(!layout.draw || pointerId !== -1 || gliding || now - lastDraw >= LIVE_FRAME) {
      lastDraw = now;
      apply();
    }

    frame = requestAnimationFrame(step);
  };

  const start = () => {
    if(frame || !canMove()) return;
    last = 0;
    frame = requestAnimationFrame(step);
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  /** The release velocity over the last moments, capped */
  const velocity = () => {
    const now = performance.now();
    const recent = samples.filter((sample) => now - sample.t <= VELOCITY_WINDOW);
    if(recent.length < 2) return {x: 0, y: 0};
    const first = recent[0], end = recent[recent.length - 1];
    const dt = (end.t - first.t) / 1000;
    if(dt <= 0) return {x: 0, y: 0};
    let x = (end.x - first.x) / dt, y = (end.y - first.y) / dt;
    const speed = Math.hypot(x, y);
    if(speed > MAX_FLING) {
      x *= MAX_FLING / speed;
      y *= MAX_FLING / speed;
    }

    return {x, y};
  };

  const onDown = (event: PointerEvent) => {
    if(pointerId !== -1 || !event.isPrimary || event.button > 0) return;
    if(!canMove() || !canStart(event.target as HTMLElement)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    baseX = panX;
    baseY = panY;
    moved = false;
    gliding = false; // catches a glide where it is
    samples = [{x: startX, y: startY, t: performance.now()}];
  };

  const onMove = (event: PointerEvent) => {
    if(event.pointerId !== pointerId) return;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    if(!moved) {
      if(Math.hypot(dx, dy) <= SLOP) return;
      moved = true;
      surface.setPointerCapture(pointerId);
    }

    panX = baseX + dx;
    panY = baseY + dy;
    samples.push({x: event.clientX, y: event.clientY, t: performance.now()});
    if(samples.length > 20) samples.shift();
  };

  const onUp = (event: PointerEvent) => {
    if(event.pointerId !== pointerId) return;
    pointerId = -1;
    if(!moved || event.type !== 'pointerup') return;
    const {x, y} = velocity();
    if(!x && !y) return;
    glideFromX = panX;
    glideFromY = panY;
    glideVX = x;
    glideVY = y;
    glideStart = performance.now();
    gliding = true;
  };

  const onVisibility = () => document.hidden ? stop() : start();

  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onUp);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    /** A new canvas, or `undefined` for a theme without a pattern: no pattern, no loop */
    update(next?: FieldLayout) {
      layout = next;
      if(!layout) stop();
      apply();
      start();
    },

    destroy() {
      stop();
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onUp);
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
