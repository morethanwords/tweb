import clamp from '@helpers/number/clamp';
import {createMemo, JSX, Show} from 'solid-js';
import {Dynamic} from 'solid-js/web';


type Props = {
  class?: string;
  progress: number;
  stroke: string;
  /**
   * From 0 to 1
   */
  strokeThickness: number;
  withText?: boolean;
  animate?: boolean;
};

const diameter = 120;
const halfDiameter = diameter / 2;

export const ProgressCircleSVG = (props: Props) => {
  const strokeWidth = createMemo(() => clamp(props.strokeThickness, 0, 1) * halfDiameter);

  const radius = createMemo(() => halfDiameter - strokeWidth() - 2);
  const circumference = createMemo(() => 2 * Math.PI * radius());

  const strokeDashoffset = () => circumference() - props.progress * circumference();
  const transition = () => props.animate ? 'stroke-dashoffset linear 0.2s' : undefined;

  return (
    <svg class={props.class} width="100%" height="100%" viewBox={`0 0 ${diameter} ${diameter}`}>
      <circle
        cx="60"
        cy="60"
        r={radius()}
        fill="none"
        stroke={props.stroke}
        stroke-width={strokeWidth() + ''}
        stroke-dasharray={circumference() + ''}
        stroke-dashoffset={strokeDashoffset()}
        stroke-linecap="round"
        style={{
          'transition': transition(),
          'transform': 'rotate(-90deg)',
          'transform-origin': '50% 50%'
        }}
      />
      <Show when={props.withText}>
        {/* Without using Dynamic, there is a weird parser error */}
        <Dynamic
          component='text'
          x="50%"
          y="50%"
          dy=".3em"
          text-anchor="middle"
          style={{
            'font-size': '30px',
            'font-weight': 'bolder',
            'fill': 'white'
          }}
        >
          {(props.progress * 100).toFixed(0)}%
        </Dynamic>
      </Show>
    </svg>
  );
};
