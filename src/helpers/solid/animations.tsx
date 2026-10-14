import {Accessor, For, JSX, Show} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {AnimationList} from '@helpers/solid/animationList';
import {CROSS_FADE_KEYFRAMES, getAnimatedOptions} from '@helpers/dom/crossfadeContent';
import classNames from '@helpers/string/classNames';

type AnimationType = 'cross-fade' | 'grow-width' | 'grow-height';

export const growKeyframes = (property: 'width' | 'height', size: number): Keyframe[] => {
  return [
    {[property]: 0, opacity: 0},
    // {width: clientWidth / 2 + 'px', opacity: .25},
    {[property]: size + 'px', opacity: 1}
  ];
};

const ANIMATIONS: {[key in AnimationType]: Keyframe[] | ((element: Element) => Keyframe[])} = {
  'cross-fade': CROSS_FADE_KEYFRAMES,
  'grow-width': (element) => growKeyframes('width', element.clientWidth),
  'grow-height': (element) => growKeyframes('height', element.clientHeight)
};

export function SimpleAnimation(props: Pick<
  Parameters<typeof AnimationList>[0], 'children' | 'keyframes' | 'mode' | 'appear' | 'onAfterExit'
> & {
  noItemClass?: boolean,
  itemClass?: string
}) {
  return (
    <AnimationList
      animationOptions={getAnimatedOptions()}
      keyframes={props.keyframes}
      mode={props.mode || 'replacement'}
      itemClass={classNames(!props.noItemClass && 'animated-item', props.itemClass)}
      appear={props.appear}
      onAfterExit={props.onAfterExit}
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
  itemClass?: string,
  onAfterExit?: Parameters<typeof AnimationList>[0]['onAfterExit']
}) {
  return (
    <Dynamic
      component={SimpleAnimation}
      keyframes={ANIMATIONS[props.type]}
      mode={props.mode}
      appear={props.appear}
      noItemClass={props.noItemClass}
      itemClass={props.itemClass}
      onAfterExit={props.onAfterExit}
    >
      {props.children}
    </Dynamic>
  );
}

// `overflow: hidden` makes the wrapper a block formatting context so any
// negative margins on the child are contained — `wrapper.clientHeight` then
// equals the full layout space, which is what `grow-height` animates from
// `0` to.
export function GrowHeightReveal(props: {
  when: Parameters<typeof Show>[0]['when'],
  // Pass `appear={false}` when the wrapper might already be revealed on first
  // mount (e.g. settings tab opening with the gate already satisfied) — skips
  // the enter animation on initial paint, later toggles still animate.
  appear?: boolean,
  // Class applied to the internal `overflow:hidden` wrapper. Use when the revealed content
  // needs the wrapper itself to extend past the parent (e.g. negative-margin section-edge
  // strips — the wrapper's overflow:hidden would otherwise clip the extension).
  class?: string,
  children: JSX.Element
}) {
  return (
    <Animated type="grow-height" noItemClass mode="add-remove" appear={props.appear ?? true}>
      <Show when={props.when}>
        <div class={props.class} style={{overflow: 'hidden'}}>
          {props.children}
        </div>
      </Show>
    </Animated>
  );
}

// The list counterpart of GrowHeightReveal: an item added to `each` grows in and a
// removed one shrinks out, each in its own `overflow: hidden` wrapper for the same
// reason as above. Items already there on mount appear without animating.
export function GrowHeightList<T>(props: {
  each: readonly T[],
  children: (item: T, index: Accessor<number>) => JSX.Element
}) {
  return (
    <Animated type="grow-height" noItemClass mode="add-remove" appear={false}>
      <For each={props.each}>{(item, index) => (
        <div style={{overflow: 'hidden'}}>
          {props.children(item, index)}
        </div>
      )}</For>
    </Animated>
  );
}
