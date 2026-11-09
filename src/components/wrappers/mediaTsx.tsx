import {JSX, Ref, Show, createMemo, createResource, splitProps} from 'solid-js';
import createMiddleware from '@helpers/solid/createMiddleware';
import {attachClassName} from '@helpers/solid/classname';
import {Middleware, MiddlewareHelper} from '@helpers/middleware';

export type MediaComponentProps = {
  class?: string,
  ref?: Ref<HTMLDivElement>,
  onClick?: (e: MouseEvent) => void,
  // what stands in the media's place until it is there
  fallback?: JSX.Element
};

export function MediaTsx<T, R>(props: T & {
  onResult?: (result: R) => void;
  loader: (options: T & {middleware: Middleware, container: HTMLElement}) => Promise<R>;
  itemKey: keyof T;
} & MediaComponentProps) {
  const [local, others] = splitProps(props, ['class', 'ref', 'onResult', 'loader', 'itemKey', 'onClick', 'fallback']);
  let ref: HTMLDivElement;
  const ret = (
    <div
      ref={(_ref) => {
        ref = _ref;
        (local.ref as any)?.(ref);
      }}
      onClick={local.onClick}
    ></div>
  );
  // * the wrapper puts classes of its own on the container (`media-container-fitted` and the like), which decide the
  // * media's fit: the caller's classes are added and taken away by themselves, never by writing the whole attribute,
  // * which a re-render of what holds the media (an edited rich message) would otherwise do
  attachClassName(ref, () => local.class);

  // * a photo or a document comes again as another object of the same one when what holds it is rebuilt (a page of a
  // * sent rich message): it is not drawn again
  const item = createMemo(() => (others as any)[local.itemKey], undefined, {
    equals: (a, b) => a === b || (!!a && !!b && (a._ === 'photo' || a._ === 'document') && a._ === b._ && a.id === b.id)
  });
  const componentMiddleware = createMiddleware().get();
  let loadMiddlewareHelper: MiddlewareHelper;
  const [result] = createResource(item, (item) => {
    // * a wrapper draws into the container: another item replaces what the one before drew there
    loadMiddlewareHelper?.destroy();
    loadMiddlewareHelper = componentMiddleware.create();
    const middleware = loadMiddlewareHelper.get();
    ref.replaceChildren();
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
    <Show when={result.latest} fallback={local.fallback}>
      {ret}
    </Show>
  );
}
