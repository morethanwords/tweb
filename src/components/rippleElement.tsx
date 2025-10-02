import {createRenderEffect, createSignal, onCleanup, Ref, splitProps, ValidComponent} from 'solid-js';
import {Dynamic, DynamicProps} from 'solid-js/web';
import ripple from './ripple';
import classNames from '../helpers/string/classNames';
ripple; // keep

export default function RippleElement<T extends ValidComponent>(props: DynamicProps<T> & {noRipple?: boolean, rippleSquare?: boolean}) {
  const [, rest] = splitProps(props, ['noRipple', 'rippleSquare']);
  const [rippleElement, setRippleElement] = createSignal<HTMLElement>();
  return (
    <Dynamic
      {...rest as typeof props}
      ref={(ref: any) => {
        createRenderEffect(() => {
          if(!props.noRipple) {
            const ret = ripple(ref, undefined, 'no');
            setRippleElement(ret.element);
            onCleanup(() => {
              ret.dispose();
              setRippleElement();
            });
          }
        });

        (props.ref as Ref<any>)?.(ref);
      }}
      class={classNames(
        props.class,
        !props.noRipple && 'rp',
        !props.noRipple && props.rippleSquare && 'rp-square',
        ...Object.entries(props.classList || {}).map(([key, value]) => value ? key : undefined)
      )}
    >
      {rippleElement()}
      {props.children}
    </Dynamic>
  );
}
