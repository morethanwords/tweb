import {createEffect, createSignal, ParentProps} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {animate} from '@helpers/animation';
import liteMode from '@helpers/liteMode';


type HeightTransitionProps = {
  onRunningAnimations?: (value: number) => void;
  scale?: boolean;
};

const transitionTime = 240;

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
        el.style.height = '0px';
        el.style.opacity = '0';

        animate(() => {
          const targetHeight = el.scrollHeight;
          el.animate([
            {height: '0px', opacity: 0, ...(props.scale && {transform: 'scale(0.95)', transformOrigin: '75% center'})},
            {height: `${targetHeight}px`, opacity: 1, ...(props.scale && {transform: 'scale(1)'})}
          ], {
            duration: liteMode.isAvailable('animations') ? transitionTime : 0,
            easing: 'ease-in-out'
          }).finished
          .then(() => {
            el.style.removeProperty('height');
            el.style.removeProperty('opacity');

            done();
          });
        });
      }}

      onExit={async(el, done) => {
        animate(() => {
          el.animate([
            {height: `${el.scrollHeight}px`, opacity: 1},
            {height: '0px', opacity: 0}
          ], {
            duration: liteMode.isAvailable('animations') ? transitionTime : 0,
            fill: 'forwards',
            easing: 'ease-in-out'
          }).finished.then(done);
        });
      }}
    >
      {props.children}
    </Transition>
  );
};
