import {JSX} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {AnimationList} from '@helpers/solid/animationList';
import {getTransition} from '@config/transitions';
import classNames from '@helpers/string/classNames';

type AnimationType = 'cross-fade' | 'grow-width' | 'grow-height';

const growKeyframes = (property: 'width' | 'height', size: number): Keyframe[] => {
  return [
    {[property]: 0, opacity: 0},
    // {width: clientWidth / 2 + 'px', opacity: .25},
    {[property]: size + 'px', opacity: 1}
  ];
};

const ANIMATIONS: {[key in AnimationType]: Keyframe[] | ((element: Element) => Keyframe[])} = {
  'cross-fade': [{opacity: 0}, {opacity: 1}],
  'grow-width': (element) => growKeyframes('width', element.clientWidth),
  'grow-height': (element) => growKeyframes('height', element.clientHeight)
};

export function SimpleAnimation(props: Pick<
  Parameters<typeof AnimationList>[0], 'children' | 'keyframes' | 'mode' | 'appear'
> & {
  noItemClass?: boolean,
  itemClass?: string
}) {
  return (
    <AnimationList
      animationOptions={{duration: 200, easing: getTransition('standard').easing}}
      keyframes={props.keyframes}
      mode={props.mode || 'replacement'}
      itemClass={classNames(!props.noItemClass && 'animated-item', props.itemClass)}
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
  appear?: boolean,
  noItemClass?: boolean,
  itemClass?: string
}) {
  return (
    <Dynamic
      component={SimpleAnimation}
      keyframes={ANIMATIONS[props.type]}
      mode={props.mode}
      appear={props.appear}
      noItemClass={props.noItemClass}
      itemClass={props.itemClass}
    >
      {props.children}
    </Dynamic>
  );
}
