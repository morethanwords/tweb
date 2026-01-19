import {Ref, Show, createResource, splitProps} from 'solid-js';
import createMiddleware from '@helpers/solid/createMiddleware';
import {Middleware} from '@helpers/middleware';

export type MediaComponentProps = {
  class?: string,
  ref?: Ref<HTMLDivElement>,
  onClick?: (e: MouseEvent) => void
};

export function MediaTsx<T, R>(props: T & {
  onResult?: (result: R) => void;
  loader: (options: T & {middleware: Middleware, container: HTMLElement}) => Promise<R>;
  itemKey: keyof T;
} & MediaComponentProps) {
  const [local, others] = splitProps(props, ['class', 'ref', 'onResult', 'loader', 'itemKey', 'onClick']);
  let ref: HTMLDivElement;
  const ret = (
    <div
      class={local.class}
      ref={(_ref) => {
        ref = _ref;
        (local.ref as any)?.(ref);
      }}
      onClick={local.onClick}
    ></div>
  );

  const [result] = createResource(() => (others as any)[local.itemKey], (item) => {
    const middleware = createMiddleware().get();
    return local.loader({
      ...others as any,
      item,
      middleware,
      container: ref
    }).then(async(result: R) => {
      if(!middleware()) {
        return;
      }

      local.onResult?.(result);
      return result;
    });
  });

  return (
    <Show when={result.latest}>
      {ret}
    </Show>
  );
}
