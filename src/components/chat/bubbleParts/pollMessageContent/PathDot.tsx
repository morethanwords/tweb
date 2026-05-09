import {Component, mergeProps, onCleanup, onMount} from 'solid-js';

export interface PathDotProps {
  /** Rectangle width (inner path width, excluding stroke) */
  width?: number;
  /** Rectangle height */
  height?: number;
  /** Corner radius */
  radius?: number;
  /** Dot color */
  dotColor?: string;
  /** Dot thickness (stroke width of the moving dash) */
  dotThickness?: number;
  /** Length of the elongated dot, as a percentage of the total path (0–100) */
  dotLength?: number;
  /** Animation duration in seconds */
  duration?: number;
  /** Reverse direction */
  reverse?: boolean;
  /** Padding around the rectangle so strokes don't get clipped */
  padding?: number;
  /** Optional className for the root <svg> */
  class?: string;
  /** Called once when the animation completes (not called if cancelled) */
  onAnimationEnd?: () => void;
}

const PathDot: Component<PathDotProps> = (rawProps) => {
  const props = mergeProps(
    {
      width: 160,
      height: 100,
      radius: 20,
      dotColor: '#3b82f6',
      dotThickness: 6,
      dotLength: 8,
      duration: 2,
      reverse: false,
      padding: 8
    },
    rawProps,
  );

  // Clamp radius so it never exceeds half of the smaller side.
  const r = () => Math.min(props.radius, props.width / 2, props.height / 2);
  const w = () => props.width;
  const h = () => props.height;
  const pad = () => props.padding + props.dotThickness / 2;

  // Open L-shaped path:
  //   start: top-left, inset DOWN by R so we don't sit inside the corner curve
  //   → straight down
  //   → rounded bottom-left corner
  //   → straight right
  //   end: bottom-right, inset LEFT by R
  const d = () => {
    const x = pad();
    const y = pad();
    const W = w();
    const H = h();
    const R = r();
    return [
      `M ${x} ${y + R}`,
      `L ${x} ${y + H - R}`,
      `A ${R} ${R} 0 0 0 ${x + R} ${y + H}`,
      `L ${x + W - R} ${y + H}`
    ].join(' ');
  };

  const svgWidth = () => w() + pad() * 2;
  const svgHeight = () => h() + pad() * 2;

  // pathLength normalized to 100 → dotLength is a % of perimeter.
  const dashArray = () => `${props.dotLength} ${100 - props.dotLength}`;

  let dotPathRef: SVGPathElement | undefined;
  let animation: Animation | undefined;

  onMount(() => {
    if(!dotPathRef) return;

    // Open path: animate the dash from sitting at the start to sitting at the end
    // (i.e. shift by 100 - dotLength), so the dot stays fully visible the whole way.
    const travel = 100 - props.dotLength * 2;
    const from = props.reverse ? `${-travel}` : '0';
    const to = props.reverse ? '0' : `${-travel}`;

    animation = dotPathRef.animate(
      [{strokeDashoffset: from}, {strokeDashoffset: to}],
      {
        duration: props.duration * 1000,
        easing: 'linear',
        fill: 'forwards',
        iterations: 1
      }
    );

    animation.finished
    .then(() => props.onAnimationEnd?.())
    .catch(() => {
      // Animation was cancelled — ignore.
    });
  });

  onCleanup(() => {
    animation?.cancel();
  });

  return (
    <svg
      class={props.class}
      width={svgWidth()}
      height={svgHeight()}
      viewBox={`0 0 ${svgWidth()} ${svgHeight()}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Travelling dot */}
      <path
        ref={dotPathRef}
        d={d()}
        fill="none"
        stroke={props.dotColor}
        stroke-width={props.dotThickness}
        stroke-linecap="round"
        pathLength="100"
        stroke-dasharray={dashArray()}
        stroke-dashoffset={props.reverse ? `${-(100 - props.dotLength)}` : '0'}
      />
    </svg>
  );
};

export default PathDot;
