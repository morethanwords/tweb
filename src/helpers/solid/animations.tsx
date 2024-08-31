import {JSX} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {AnimationList} from './animationList';

type AnimationType = 'cross-fade' | 'grow-width';

const ANIMATIONS: {[key in AnimationType]: Keyframe[] | ((element: Element) => Keyframe[])} = {
  'cross-fade': [{opacity: 0}, {opacity: 1}],
  'grow-width': (element) => {
    const {clientWidth} = element;
    return [
      {width: 0, opacity: 0},
      // {width: clientWidth / 2 + 'px', opacity: .25},
      {width: clientWidth + 'px', opacity: 1}
    ];
  }
};

export function SimpleAnimation(props: Pick<Parameters<typeof AnimationList>[0], 'children' | 'keyframes' | 'mode' | 'appear'>) {
  return (
    <AnimationList
      animationOptions={{duration: 200, easing: 'cubic-bezier(.4, .0, .2, 1)'}}
      keyframes={props.keyframes}
      mode={props.mode || 'replacement'}
      itemClassName="animated-item"
      appear={props.appear}
    >
      {props.children}
    </AnimationList>
  );
}

// const MAP = {
//   'cross-fade': ReplacementAnimation
// };

export default function Animated(props: {
  children: JSX.Element,
  type: AnimationType,
  mode?: Parameters<typeof AnimationList>[0]['mode'],
  appear?: boolean
}) {
  return (
    <Dynamic
      component={SimpleAnimation}
      keyframes={ANIMATIONS[props.type]}
      mode={props.mode}
      appear={props.appear}
    >
      {props.children}
    </Dynamic>
  );
}
