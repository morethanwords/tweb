import {type Accessor, createEffect, onCleanup} from 'solid-js';

export type ScrollAxis = 'horizontal' | 'vertical';

export interface UseEdgeAutoScrollArgs {
  /** The scrollable container element. */
  container: Accessor<HTMLElement | null | undefined>;
  /**
   * Distance (px) from the container edge where the activation zone *ends*
   * (i.e. how far into the container the trigger reaches). Must be > outer.
   */
  innerThreshold: Accessor<number>;
  /**
   * Distance (px) from the container edge where the activation zone *starts*.
   * Use 0 to make the zone start exactly at the edge, or a negative value to
   * also activate when the cursor is slightly outside the container.
   */
  outerThreshold: Accessor<number>;
  /** Which axis to scroll along. */
  axis: Accessor<ScrollAxis>;
  /**
   * The fastest (steady-state) delay (ms) between item-by-item scroll steps.
   * The loop ramps *down* to this value over time (see `startInterval` and
   * `rampFactor`).
   */
  interval: Accessor<number>;
  /**
   * Optional: the initial (slowest) delay (ms) for the first steps after the
   * cursor enters the zone. The interval shrinks toward `interval` on each
   * step. Defaults to `interval` (i.e. no ramp).
   */
  startInterval?: Accessor<number>;
  /**
   * Optional: multiplier applied to the current interval after each step to
   * ramp it down toward `interval`. Should be in (0, 1). Defaults to 0.8.
   */
  rampFactor?: Accessor<number>;
  /**
   * Optional: dwell time (ms) the cursor must stay in the zone before the
   * first scroll fires. Prevents accidental triggers from quick mouse flicks.
   * Defaults to 0 (fire immediately).
   */
  startDelay?: Accessor<number>;
  /**
   * Optional: the target to listen for pointer movement on. Defaults to
   * `window`, which allows the activation zone to extend slightly *outside*
   * the container (via a negative `outerThreshold`). Pass the container itself
   * if you only ever want to react while the cursor is over it.
   */
  listenTo?: Accessor<Window | HTMLElement | null | undefined>;
  /** Optional: disable the behavior reactively. Defaults to enabled. */
  enabled?: Accessor<boolean>;
  /** Optional: smooth scrolling. Defaults to true. */
  smooth?: Accessor<boolean>;
  /** Optional: padding for the scrolled item against the edge of the container. */
  padding?: Accessor<number>;
}

export function useEdgeAutoScroll(args: UseEdgeAutoScrollArgs): void {
  const {
    container,
    innerThreshold,
    outerThreshold,
    axis,
    interval,
    startInterval = interval,
    rampFactor = () => 0.8,
    startDelay = () => 0,
    listenTo = () => window,
    enabled = () => true,
    smooth = () => true,
    padding = () => 0
  } = args;

  createEffect(() => {
    const el = container();
    if(!el || !enabled()) return;

    // Track the latest pointer position so the interval loop can read it.
    let pointerX = 0;
    let pointerY = 0;
    let pointerKnown = false;

    // The direction we're currently auto-scrolling in (null = stopped).
    let activeDirection: -1 | 1 | null = null;
    // Recursive-setTimeout handle for the ramping scroll loop.
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    // One-shot dwell timer before the first scroll.
    let armTimer: ReturnType<typeof setTimeout> | null = null;
    // The current (ramping) delay between steps.
    let currentInterval = 0;

    const isHorizontal = () => axis() === 'horizontal';

    /**
     * Given a direction (-1 = toward start, +1 = toward end), find the first
     * child whose edge is not yet fully in view and bring its leading edge
     * close to the container edge (not centered).
     */
    const scrollNearestChild = (direction: -1 | 1) => {
      const rect = el.getBoundingClientRect();
      const children = Array.from(el.children);
      if(children.length === 0) return;

      const horizontal = isHorizontal();
      const containerStart = horizontal ? rect.left : rect.top;
      const containerEnd = horizontal ? rect.right : rect.bottom;

      // A small tolerance so we don't keep re-targeting an already-visible edge.
      const epsilon = 1;

      let target: HTMLElement | null = null;

      if(direction > 0) {
        // Scrolling toward the end: find the first child whose end edge is
        // past (or clipped by) the container's end edge.
        for(const child of children) {
          if(!(child instanceof HTMLElement)) continue;
          const cr = child.getBoundingClientRect();
          const childEnd = horizontal ? cr.right : cr.bottom;
          if(childEnd > containerEnd + epsilon) {
            target = child;
            break;
          }
        }
      } else {
        // Scrolling toward the start: find the last child whose start edge is
        // before the container's start edge.
        for(let i = children.length - 1; i >= 0; i--) {
          const child = children[i];
          if(!(child instanceof HTMLElement)) continue;
          const cr = child.getBoundingClientRect();
          const childStart = horizontal ? cr.left : cr.top;
          if(childStart < containerStart - epsilon) {
            target = child;
            break;
          }
        }
      }

      if(!target) return;

      const cr = target.getBoundingClientRect();
      let delta: number;

      if(direction > 0) {
        // Align child's end edge with container's end edge.
        const childEnd = horizontal ? cr.right : cr.bottom;
        delta = childEnd - containerEnd + padding();
      } else {
        // Align child's start edge with container's start edge.
        const childStart = horizontal ? cr.left : cr.top;
        delta = childStart - containerStart - padding();
      }

      const behavior: ScrollBehavior = smooth() ? 'smooth' : 'auto';
      if(horizontal) {
        el.scrollBy({left: delta, behavior});
      } else {
        el.scrollBy({top: delta, behavior});
      }
    };

    const canScroll = (direction: -1 | 1): boolean => {
      const horizontal = isHorizontal();
      const scrollPos = horizontal ? el.scrollLeft : el.scrollTop;
      const maxScroll = horizontal ?
        el.scrollWidth - el.clientWidth :
        el.scrollHeight - el.clientHeight;
      if(direction < 0) return scrollPos > 0;
      return scrollPos < maxScroll - 1;
    };

    /** Returns the direction the cursor's current position activates, if any. */
    const resolveDirection = (): -1 | 1 | null => {
      if(!pointerKnown) return null;

      const rect = el.getBoundingClientRect();
      const horizontal = isHorizontal();

      const pos = horizontal ? pointerX : pointerY;
      const start = horizontal ? rect.left : rect.top;
      const end = horizontal ? rect.right : rect.bottom;

      // Cross-axis guard: the cursor must be aligned with the container on the
      // *other* axis, otherwise a cursor far away on the page (but sharing the
      // active-axis coordinate) would falsely trigger scrolling.
      const crossPos = horizontal ? pointerY : pointerX;
      const crossStart = horizontal ? rect.top : rect.left;
      const crossEnd = horizontal ? rect.bottom : rect.right;
      if(crossPos < crossStart || crossPos > crossEnd) return null;

      const inner = innerThreshold();
      const outer = outerThreshold();

      // Distance from the cursor to each edge (positive = inside container).
      const distFromStart = pos - start;
      const distFromEnd = end - pos;

      // Activation zone is [outer, inner] measured from each edge.
      if(distFromStart >= -outer && distFromStart <= inner) return -1;
      if(distFromEnd >= -outer && distFromEnd <= inner) return 1;
      return null;
    };

    const stop = () => {
      activeDirection = null;
      if(armTimer != null) {
        clearTimeout(armTimer);
        armTimer = null;
      }
      if(timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    /**
     * One scroll step, then schedules the next one with a shrinking delay so
     * the loop accelerates over time. Stops if we can no longer scroll.
     */
    const tick = () => {
      timeoutId = null;
      if(activeDirection == null) return;
      if(!canScroll(activeDirection)) {
        stop();
        return;
      }

      scrollNearestChild(activeDirection);

      // Ramp the interval down toward the fast steady-state value.
      const min = interval();
      const factor = rampFactor();
      currentInterval = Math.max(min, currentInterval * factor);
      timeoutId = setTimeout(tick, currentInterval);
    };

    /** Begins the ramping loop (called after the optional dwell delay). */
    const begin = () => {
      armTimer = null;
      if(activeDirection == null) return;
      currentInterval = Math.max(interval(), startInterval());
      tick();
    };

    /**
     * Start (or redirect) the auto-scroll loop. After an optional `startDelay`
     * dwell, scrolls item-by-item, ramping from `startInterval` down to
     * `interval`, until the cursor leaves the zone or scrolling bottoms out.
     */
    const start = (direction: -1 | 1) => {
      if(activeDirection === direction) return;
      stop();

      if(!canScroll(direction)) return;

      activeDirection = direction;

      const delay = startDelay();
      if(delay > 0) {
        armTimer = setTimeout(begin, delay);
      } else {
        begin();
      }
    };

    const evaluate = () => {
      const direction = resolveDirection();
      if(direction == null) {
        stop();
      } else {
        start(direction);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      pointerKnown = true;
      evaluate();
    };

    const target = listenTo();
    if(!target) return;

    target.addEventListener('pointermove', onPointerMove as EventListener);

    onCleanup(() => {
      target.removeEventListener('pointermove', onPointerMove as EventListener);
      stop();
    });
  });
}
