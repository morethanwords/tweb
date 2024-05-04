import {JSX} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {AnimationList} from './animationList';

export function CrossFadeAnimation(props: {
  children: JSX.Element
}) {
  return (
    <AnimationList
      animationOptions={{duration: 200, easing: 'ease-in-out'}}
      keyframes={[{opacity: 0}, {opacity: 1}]}
      animateOnlyReplacement
      itemClassName="animated-item"
    >
      {props.children}
    </AnimationList>
  );
}

const MAP = {
  'cross-fade': CrossFadeAnimation
};

export default function Animated(props: {
  children: JSX.Element,
  type: keyof typeof MAP
}) {
  return (
    <Dynamic component={MAP[props.type]}>{props.children}</Dynamic>
  );
}
