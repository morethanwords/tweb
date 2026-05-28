import {StandaloneSignal} from '@components/mediaEditor/types';
import {ProgressCircleSVG} from '@components/progressCircleSVG';

export default function RenderProgressCircle(props: {creationProgress: StandaloneSignal<number>}) {
  const [progress] = props.creationProgress.signal;

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
          'z-index': 2
        }
      }}
    >
      <ProgressCircleSVG progress={progress()} strokeThickness={1 / 10} withText stroke='white' />
    </div>
  );
}
