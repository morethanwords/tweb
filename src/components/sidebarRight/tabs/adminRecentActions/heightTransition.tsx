import {createEffect, createSignal, ParentProps} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {animate} from '../../../../helpers/animation';


type HeightTransitionProps = {
  onRunningAnimations?: (value: number) => void;
};

const transitionTime = 320;

export const HeightTransition = (props: ParentProps<HeightTransitionProps>) => {
  const [runningAnimations, setRunningAnimations] = createSignal(0);

  const increase = () => setRunningAnimations(prev => prev + 1);
  const decrease = () => setRunningAnimations(prev => prev - 1);

  createEffect(() => {
    if(!props.onRunningAnimations) return;
    props.onRunningAnimations(runningAnimations());
  });

  return (
    <Transition
      onBeforeEnter={increase}
      onAfterEnter={decrease}
      onBeforeExit={increase}
      onAfterExit={decrease}

      onEnter={async(_el, done) => {
        const el = _el as HTMLElement;
        const targetHeight = el.scrollHeight;
        animate(() => {
          el.animate([
            {height: '0px', opacity: 0},
            {height: `${targetHeight}px`, opacity: 1}
          ], {
            duration: transitionTime,
            easing: 'ease-in-out'
          }).finished.then(done);
        });
      }}

      onExit={async(el, done) => {
        el.animate([
          {height: `${el.scrollHeight}px`, opacity: 1},
          {height: '0px', opacity: 0}
        ], {
          duration: transitionTime,
          fill: 'forwards',
          easing: 'ease-in-out'
        }).finished.then(done);
      }}
    >
      {props.children}
    </Transition>
  );
};
