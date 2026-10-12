import {animate} from '@helpers/animation';
import {keyframesAtLevel} from '@helpers/reducedKeyframes';
import {createComputed, createSignal, ParentProps} from 'solid-js';
import {Transition} from 'solid-transition-group';


type HeightTransitionProps = {
  onRunningAnimations?: (value: number) => void;
  onAfterEnter?: () => void;
  scale?: boolean;
};

const transitionTime = 240;

// * reduced animations grow and fade it all the same - only the scale goes
const animateAtLevel = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
  const played = keyframesAtLevel(keyframes);
  return el.animate(played || [], {...options, duration: played ? transitionTime : 0});
};

export const HeightTransition = (props: ParentProps<HeightTransitionProps>) => {
  const [runningAnimations, setRunningAnimations] = createSignal(0);

  const increase = () => setRunningAnimations(prev => prev + 1);
  const decrease = () => setRunningAnimations(prev => prev - 1);

  createComputed(() => {
    if(!props.onRunningAnimations) return;
    props.onRunningAnimations(runningAnimations());
  });

  return (
    <Transition
      onBeforeEnter={increase}
      onAfterEnter={() => {
        decrease();
        props.onAfterEnter?.();
      }}
      onBeforeExit={increase}
      onAfterExit={decrease}

      onEnter={async(_el, done) => {
        const el = _el as HTMLElement;
        el.style.height = '0px';
        el.style.opacity = '0';

        animate(() => {
          const targetHeight = el.scrollHeight;
          animateAtLevel(el, [
            {height: '0px', opacity: 0, ...(props.scale && {transform: 'scale(0.95)', transformOrigin: '75% center'})},
            {height: `${targetHeight}px`, opacity: 1, ...(props.scale && {transform: 'scale(1)'})}
          ], {
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
          animateAtLevel(el, [
            {height: `${el.scrollHeight}px`, opacity: 1},
            {height: '0px', opacity: 0}
          ], {
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
