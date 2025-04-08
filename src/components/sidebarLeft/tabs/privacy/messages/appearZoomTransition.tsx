import {ParentComponent} from 'solid-js';
import {Transition} from 'solid-transition-group';


const animateEl = (backwards = false) => async(el: Element, done: () => void) => {
  const keyframes = ['scale(0)', 'scale(1)'];
  if(backwards) keyframes.reverse();

  await el.animate(
    {transform: keyframes},
    {duration: 80}
  ).finished;

  done();
};

const AppearZoomTransition: ParentComponent = (props) => {
  return (
    <Transition
      onEnter={animateEl()}
      onExit={animateEl(true)}
    >
      {props.children}
    </Transition>
  );
};

export default AppearZoomTransition;
