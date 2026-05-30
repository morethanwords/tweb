import {createRoot, createSignal, JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';

// The circular SVG progress ring used by round video notes (wrappers/video.ts)
// and the video-note recording preview. Markup/classes are kept identical to
// the original so existing CSS and the global resize handler in video.ts keep
// working on whatever produced the element.
//
// `progress` is 0..1 (0 = empty ring, 1 = full). The ring is rotated -90° so it
// fills clockwise from 12 o'clock.

export interface ProgressRingProps {
  size: number;
  strokeWidth?: number;
  stroke?: string;
  strokeOpacity?: number;
  progress: number;
  class?: string;
  // Refs fire synchronously while the component body runs, so callers that need
  // the real DOM nodes immediately (e.g. the imperative createProgressRing
  // below, or wrappers/video.ts) get them here — calling the component as a
  // function returns the HMR wrapper, NOT the <svg>, so don't rely on its return.
  ref?: (svg: SVGSVGElement) => void;
  circleRef?: (circle: SVGCircleElement) => void;
}

export const DEFAULT_STROKE_WIDTH = 3.5;

// Shared radius formula so this component and the imperative resize path in
// wrappers/video.ts compute the same value (the strokeWidth*2 inset is the
// original constant: at the default 3.5 it equals halfSize - 7).
export function getProgressRingRadius(size: number, strokeWidth: number = DEFAULT_STROKE_WIDTH) {
  return size / 2 - strokeWidth * 2;
}

export default function ProgressRing(props: ProgressRingProps): JSX.Element {
  const strokeWidth = () => props.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  const radius = () => getProgressRingRadius(props.size, strokeWidth());
  const circumference = () => 2 * Math.PI * radius();
  const dashoffset = () => circumference() * (1 - Math.max(0, Math.min(1, props.progress || 0)));

  return (
    <svg
      ref={props.ref}
      class={classNames('progress-ring', props.class)}
      width={props.size}
      height={props.size}
      style={{transform: 'rotate(-90deg)'}}
    >
      <circle
        ref={props.circleRef}
        class="progress-ring__circle"
        stroke={props.stroke ?? 'white'}
        stroke-opacity={props.strokeOpacity ?? 0.3}
        stroke-width={strokeWidth()}
        cx={props.size / 2}
        cy={props.size / 2}
        r={radius()}
        fill="transparent"
        style={{
          'stroke-dasharray': `${circumference()} ${circumference()}`,
          'stroke-dashoffset': '' + dashoffset()
        }}
      />
    </svg>
  );
}

export interface ProgressRingHandle {
  element: SVGSVGElement;
  circle: SVGCircleElement;
  setProgress: (progress: number) => void;
  destroy: () => void;
}

// Imperative wrapper for non-Solid / class-based call sites. Owns its own
// reactive root; call destroy() to dispose (e.g. from middleware.onDestroy).
// Callers that prefer to drive the ring imperatively (video.ts updates
// stroke-dashoffset itself every frame) can ignore setProgress and just mutate
// the `.progress-ring__circle` inside `element` — the component sets progress
// only when setProgress is called, so it won't fight imperative writes.
export function createProgressRing(opts: Omit<ProgressRingProps, 'progress' | 'ref' | 'circleRef'> & {progress?: number}): ProgressRingHandle {
  return createRoot((dispose) => {
    const [progress, setProgress] = createSignal(opts.progress ?? 0);
    // Capture the real DOM nodes via refs — they're set synchronously while the
    // component body runs. The component's RETURN value is the HMR wrapper (not
    // the <svg>), so we can't use it as the element.
    let element: SVGSVGElement;
    let circle: SVGCircleElement;
    ProgressRing({
      get size() {
        return opts.size;
      },
      strokeWidth: opts.strokeWidth,
      stroke: opts.stroke,
      strokeOpacity: opts.strokeOpacity,
      class: opts.class,
      get progress() {
        return progress();
      },
      ref: (svg) => element = svg,
      circleRef: (c) => circle = c
    });

    return {element, circle, setProgress, destroy: dispose};
  });
}
