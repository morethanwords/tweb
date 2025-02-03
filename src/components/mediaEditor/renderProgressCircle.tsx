import {MediaEditorContextValue} from './context';

export default function RenderProgressCircle(props: {context: MediaEditorContextValue}) {
  const [progress] = props.context.gifCreationProgress;
  // const [progress, setProgress] = createSignal(0); // Progress signal from 0 to 100

  const radius = 52;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset = () => circumference - progress() * circumference;

  // createEffect(() => {
  //   const interval = setInterval(() => {
  //     setProgress((prev) => (prev < 100 ? prev + Math.floor(Math.random() * 10) : 0));
  //   }, 120);
  //   return () => clearInterval(interval);
  // });

  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: '64px',
        ...{
          'background-color': 'rgba(0, 0, 0, .25)',
          'border-radius': '64px',
          'max-width': '80%',
          'max-height': '80%',
          'aspect-ratio': '1 / 1',
          'z-index': 4
        }
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="white"
          stroke-width={strokeWidth + ''}
          stroke-dasharray={circumference + ''}
          stroke-dashoffset={strokeDashoffset()}
          stroke-linecap="round"
          style={{
            // 'transition': 'stroke-dashoffset 0.12s',
            'transform': 'rotate(-90deg)',
            'transform-origin': '50% 50%'
          }}
        />

        <text
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
          {(progress() * 100).toFixed(0)}%
        </text>
      </svg>
    </div>
  );
}
