import type { AnimRecord } from '../shared/protocol';

/**
 * One per renderer instance: the shadow-DOM renderer puts many widgets in one
 * page, and a widget must neither see nor drive another widget's animations.
 */
export class AnimationState {
  readonly scripted = new Map<number, Animation>();
  readonly cssIds = new WeakMap<Animation, number>();
  readonly cssById = new Map<number, WeakRef<Animation>>();
  cssSeq = 0;
  /** tweb: where the engine last put a running scripted animation on this page's clock (held or gone: none). */
  readonly startTimes = new Map<number, number>();
}

/**
 * tweb: a CSS transition, or a CSS animation, by what it has rather than by `instanceof`: once the widget's element is in
 * another window (Document Picture-in-Picture) the ones its styles start can be of that window's realm (Firefox).
 */
export const isCSSTransition = (a: Animation): a is CSSTransition => 'transitionProperty' in a;
export const isCSSAnimation = (a: Animation): a is CSSAnimation => 'animationName' in a;

/** Keyframe members; a CSS property of the same name never overrides them (validator.ts KEYFRAME_MEMBERS). */
const KEYFRAME_MEMBERS = new Set(['offset', 'easing', 'composite', 'computedOffset']);

export function cssAnimationList(state: AnimationState, el: Element, subtree: boolean, idOf: (n: Node | null) => number): unknown[] {
  const { cssIds, cssById } = state;
  const out: unknown[] = [];
  const index = new Map<number, number>();
  for (const a of el.getAnimations({ subtree })) {
    const isAnimation = isCSSAnimation(a);
    const isTransition = isCSSTransition(a);
    if ((!isAnimation && !isTransition) || a.currentTime === null) continue;
    let origin = cssIds.get(a);
    if (origin === undefined) {
      origin = ++state.cssSeq;
      cssIds.set(a, origin);
      cssById.set(origin, new WeakRef(a));
    }
    const target = (a.effect as KeyframeEffect | null)?.target ?? null;
    const id = target ? idOf(target) : 0;
    if (!id) continue;
    const t = a.effect!.getTiming();
    const n = index.get(id) ?? 0;
    index.set(id, n + 1);
    out.push({
      kind: isAnimation ? 'animation' : 'transition', id, name: isAnimation ? (a as CSSAnimation).animationName : (a as CSSTransition).transitionProperty, index: n, origin,
      currentTime: a.currentTime, playbackRate: a.playbackRate, paused: a.playState === 'paused',
      duration: typeof t.duration === 'number' ? t.duration : 0, delay: t.delay, iterations: t.iterations === Infinity ? null : t.iterations,
      direction: t.direction, fill: t.fill, easing: t.easing,
    });
  }
  return out;
}

const camel = (n: string) => (n.startsWith('--') ? n : n === 'float' ? 'cssFloat' : n.replace(/^-(webkit|moz|ms)-/, '$1-').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));

/**
 * tweb: this window's clock in the timeline of `el`'s document — another window's (Document Picture-in-Picture) counts
 * from its own time origin.
 */
function timelineShift(el: Node | undefined): number {
  const view = el?.ownerDocument?.defaultView;
  return view && view !== window ? performance.timeOrigin - view.performance.timeOrigin : 0;
}

export function applyAnims(state: AnimationState, now: number, anims: AnimRecord[], nodeById: (id: number) => Node | undefined): void {
  const { scripted, cssById } = state;
  const offset = performance.now() - Number(now);
  for (const r of anims) {
    if ('css' in r) {
      const a = cssById.get(r.css.origin)?.deref();
      if (!a || (a.effect as KeyframeEffect | null)?.target !== nodeById(r.target)) continue;
      try {
        if (r.cancelled) a.cancel();
        else {
          a.playbackRate = r.playbackRate;
          if (r.holdTime !== null) {
            a.pause();
            a.currentTime = r.holdTime;
          } else a.startTime = (r.startTime as number) + offset + timelineShift(nodeById(r.target));
        }
      } catch {}
      continue;
    }
    const old = scripted.get(r.aid);
    state.startTimes.delete(r.aid);
    if ('remove' in r) {
      if (old) { old.cancel(); scripted.delete(r.aid); }
      continue;
    }
    const el = nodeById(r.target);
    if (!(el instanceof Element)) {
      if (old) { old.cancel(); scripted.delete(r.aid); }
      continue;
    }
    const frames = r.keyframes.map((k) => {
      const o: Record<string, unknown> = {};
      for (const name of Object.keys(k.values)) {
        const key = camel(name);
        if (!KEYFRAME_MEMBERS.has(key)) o[key] = k.values[name];
      }
      o.offset = k.offset;
      o.easing = k.easing;
      if (k.composite) o.composite = k.composite;
      return o as Keyframe;
    });
    const t = r.timing;
    const timing: OptionalEffectTiming = { duration: t.duration, delay: t.delay, endDelay: t.endDelay, iterations: t.iterations === null ? Infinity : t.iterations, iterationStart: t.iterationStart, direction: t.direction, fill: t.fill, easing: t.easing };
    let a = old;
    try {
      const effect = a?.effect as KeyframeEffect | undefined;
      if (!a || !effect || effect.target !== el) {
        if (a) a.cancel();
        // tweb: in the timeline of the document the element is in (rebind() moves it with the element)
        a = new Animation(new KeyframeEffect(el, frames, { composite: r.composite, iterationComposite: r.iterationComposite, ...timing } as KeyframeEffectOptions), el.ownerDocument.timeline);
        scripted.set(r.aid, a);
      } else {
        effect.setKeyframes(frames);
        effect.updateTiming(timing);
        effect.composite = r.composite;
        if ('iterationComposite' in effect) (effect as any).iterationComposite = r.iterationComposite;
      }
      a.playbackRate = r.playbackRate;
      if (r.holdTime !== null) {
        a.pause();
        a.currentTime = r.holdTime;
      } else {
        a.startTime = (r.startTime as number) + offset + timelineShift(el);
        state.startTimes.set(r.aid, a.startTime);
      }
    } catch {
      // A failed update must not leave the previous (possibly infinite) animation running unaccounted.
      try { a?.cancel(); } catch {}
      scripted.delete(r.aid);
    }
  }
}
