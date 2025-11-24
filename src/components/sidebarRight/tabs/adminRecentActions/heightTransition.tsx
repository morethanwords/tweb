import {ParentProps} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {animate} from '../../../../helpers/animation';


const transitionTime = 200;

export const HeightTransition = (props: ParentProps) => {
  return (
    <Transition
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
