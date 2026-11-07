import liteMode from '@helpers/liteMode';
import {nodeFrame} from '@helpers/schedulers';
import {onAppWindowChange} from '@helpers/appWindow';

/**
 * The field's tile and its canvas, in px: the canvas is centred on the surface and covers it at any shift. A field
 * drawn anew every frame gives `draw` instead, which takes the shift (not wrapped: its lattice does not repeat) and the
 * idle clock, and `setPlaying`, told whether its frames are read: its sources play only while they are.
 */
export type FieldLayout =
  {surfaceWidth: number, surfaceHeight: number, canvasWidth: number, canvasHeight: number, periodWidth: number, periodHeight: number} |
  {draw: (x: number, y: number, time: number) => void, setPlaying: (playing: boolean) => void};

/** The canvas that covers a surface shifted by up to a period either way (it must not show an edge) */
export function fieldCanvasSize(width: number, height: number, periodWidth: number, periodHeight: number) {
  return {width: Math.ceil(width + periodWidth), height: Math.ceil(height + periodHeight)};
}

// Android's `QrShareView`: the field drifts 6.2 px/s up and to the left with a wandering heading, follows a drag 1:1 and
// glides on after a release (tau 0.35 s, 2600 px/s at most). The idle motion stops under the finger (over 0.07 s) and
// returns 0.25 s after it (over 0.45 s). It does not turn: Android works a turn out and never applies it, iOS has none.
const DRIFT_SPEED = 6.2, DRIFT_ANGLE = Math.atan2(-5.5, -3.5);
const GLIDE_TAU = 0.35, GLIDE_END = GLIDE_TAU * 8, MAX_FLING = 2600;
const SLOP = 8;
const VELOCITY_WINDOW = 100;
const wrap = (value: number, period: number) => value - Math.round(value / period) * period;

/**
 * Moves the field: a drift and a drag, by one `transform` of a painted tile, or by a redraw of a field drawn live, every
 * frame, as Android does. One rAF loop runs while there is a pattern, the tab is visible and the animations
 * are full; it stops itself otherwise, and `update`, a press or the tab coming back start it again.
 */
export default function attachFieldMotion(surface: HTMLElement, mover: HTMLElement, canStart: (target: HTMLElement) => boolean) {
  let layout: FieldLayout | undefined;
  // the next frame's call-off, while one is on its way
  let frame: () => void, last = 0;
  // the field's shift: the drift, and the pan (the finger and the glide)
  let driftX = 0, driftY = 0, panX = 0, panY = 0;
  let idleTime = 0, idleK = 1, resumeAt = 0, clock = 0;
  let pointerId = -1, startX = 0, startY = 0, baseX = 0, baseY = 0, moved = false;
  let samples: {x: number, y: number, t: number}[] = [];
  let gliding = false, glideStart = 0, glideFromX = 0, glideFromY = 0, glideVX = 0, glideVY = 0;

  // the surface's own window and its clock: the popup may stand in a Document PiP window, whose frames come while the
  // tab is in the background, and whose times count from its own start. It follows the app when it moves between them
  let view: Window = surface.ownerDocument.defaultView || window;
  const canMove = () => !!layout && !view.document.hidden && liteMode.isAvailable('motion');

  const apply = () => {
    if(!layout) {
      mover.style.transform = '';
      return;
    }

    const x = driftX + panX, y = driftY + panY;
    if('draw' in layout) {
      mover.style.transform = '';
      layout.draw(x, y, idleTime);
      return;
    }

    // the tile wraps by its period
    mover.style.transform = `translate(${(layout.surfaceWidth - layout.canvasWidth) / 2 + wrap(x, layout.periodWidth)}px, ${(layout.surfaceHeight - layout.canvasHeight) / 2 + wrap(y, layout.periodHeight)}px)`;
  };

  const step = (now: number) => {
    frame = undefined;
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

    apply();
    frame = nodeFrame(surface, step);
  };

  const start = () => {
    if(frame || !canMove()) return;
    last = 0;
    frame = nodeFrame(surface, step);
  };

  const stop = () => {
    frame?.();
    frame = undefined;
  };

  /**
   * The velocity over the last moments before `now`, capped. The times are the events' own: a busy frame delays their
   * handlers, and a release handled late would find the moves before it too old
   */
  const velocity = (now: number) => {
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

  // the press is followed over the whole window, as its events come in, before anything under it may stop them: a
  // pointer flung off the surface before the drag has begun (and with it the capture) keeps moving the field
  const listen = (on: boolean) => {
    for(const [type, listener] of [['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp]] as const) {
      if(on) view.addEventListener(type, listener, true);
      else view.removeEventListener(type, listener, true);
    }

    if(on) view.addEventListener('blur', drop);
    else view.removeEventListener('blur', drop);
  };

  // a press whose release the window may never hear (it lost the focus, and the button was let go elsewhere): it ends
  // where it stands, with no glide; so does one a new press finds still on record
  const drop = () => {
    if(pointerId === -1) return;
    pointerId = -1;
    listen(false);
  };

  const onDown = (event: PointerEvent) => {
    if(!event.isPrimary || event.button > 0) return;
    drop();
    if(!canMove() || !canStart(event.target as HTMLElement)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    baseX = panX;
    baseY = panY;
    moved = false;
    gliding = false; // catches a glide where it is
    samples = [{x: startX, y: startY, t: event.timeStamp}];
    listen(true);
  };

  const onMove = (event: PointerEvent) => {
    if(event.pointerId !== pointerId) return;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    if(!moved) {
      if(Math.hypot(dx, dy) <= SLOP) return;
      moved = true;
      surface.setPointerCapture(pointerId);
    }

    track(event);
  };

  // where the pointer is, and when it was there
  const track = (event: PointerEvent) => {
    panX = baseX + event.clientX - startX;
    panY = baseY + event.clientY - startY;
    samples.push({x: event.clientX, y: event.clientY, t: event.timeStamp});
    if(samples.length > 20) samples.shift();
  };

  const onUp = (event: PointerEvent) => {
    if(event.pointerId !== pointerId) return;
    drop();
    if(!moved || event.type !== 'pointerup') return;
    // let go on the way: the field goes where it was let go, and that last stretch counts for the fling
    track(event);
    const {x, y} = velocity(event.timeStamp);
    if(!x && !y) return;
    glideFromX = panX;
    glideFromY = panY;
    glideVX = x;
    glideVY = y;
    glideStart = view.performance.now();
    gliding = true;
  };

  // a field drawn live plays its sources while the loop may run, so a hidden tab or the motion gone stops them too
  const syncPlaying = () => {
    if(layout && 'setPlaying' in layout) layout.setPlaying(canMove());
  };

  const onVisibility = () => {
    view.document.hidden ? stop() : start();
    syncPlaying();
  };

  /** The field drawn again where it stands, and moving if it may */
  const refresh = () => {
    apply();
    start();
    syncPlaying();
  };

  surface.addEventListener('pointerdown', onDown);
  view.document.addEventListener('visibilitychange', onVisibility);

  // the app goes into a Document PiP window or back: the window is told before the screen moves there, so a press and a
  // glide end where they stand, and the loop starts again in the new window once the screen stands in it
  const offWindowChange = onAppWindowChange((next) => {
    drop();
    gliding = false;
    stop();
    view.document.removeEventListener('visibilitychange', onVisibility);
    view = next;
    view.document.addEventListener('visibilitychange', onVisibility);
    queueMicrotask(() => {
      last = 0;
      refresh();
    });
  });

  return {
    /** A new canvas, or `undefined` for a theme without a pattern: no pattern, no loop */
    update(next?: FieldLayout) {
      layout = next;
      if(!layout) stop();
      refresh();
    },

    refresh,

    destroy() {
      stop();
      drop();
      surface.removeEventListener('pointerdown', onDown);
      view.document.removeEventListener('visibilitychange', onVisibility);
      offWindowChange();
    }
  };
}
