import {createRenderEffect, createSignal, onCleanup, Ref, splitProps, ValidComponent} from 'solid-js';
import {DynamicProps} from 'solid-js/web';
import ripple from '@components/ripple';
import classNames from '@helpers/string/classNames';
import Passthrough from '@helpers/solid/passthrough';
ripple; // keep

export default function RippleElement<T extends ValidComponent>(props: DynamicProps<T> & {
  noRipple?: boolean,
  rippleSquare?: boolean
}) {
  const [local, rest] = splitProps(props, ['noRipple', 'rippleSquare', 'component']);
  const [rippleElement, setRippleElement] = createSignal<HTMLElement>();
  const el = document.createElement(local.component as string || 'div');

  createRenderEffect(() => {
    if(!local.noRipple) {
      const ret = ripple(el, undefined, 'no');
      setRippleElement(ret.element);
      onCleanup(() => {
        ret.dispose();
        setRippleElement();
      });
    }
  });

  (props.ref as Ref<any>)?.(el);

  return (
    <Passthrough
      element={el}
      {...rest as any}
      class={classNames(
        props.class,
        !local.noRipple && 'rp',
        !local.noRipple && local.rippleSquare && 'rp-square',
        ...Object.entries(props.classList || {}).map(([key, value]) => value ? key : undefined)
      )}
    >
      {rippleElement()}
      {props.children}
    </Passthrough>
  );
}
