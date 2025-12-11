import {Ref, Show, createResource, splitProps} from 'solid-js';
import wrapPhoto from './photo';
import createMiddleware from '../../helpers/solid/createMiddleware';
import pause from '../../helpers/schedulers/pause';

export function PhotoTsx(props: Parameters<typeof wrapPhoto>[0] & {
  class?: string;
  ref?: Ref<HTMLElement>;
  onResult?: (result: Awaited<ReturnType<typeof wrapPhoto>>) => void;
}) {
  const [local, others] = splitProps(props, ['class', 'ref', 'onResult']);
  let ref: HTMLDivElement;
  const ret = (
    <div
      {...local}
      ref={(_ref) => {
        ref = _ref;
        (local.ref as any)?.(ref);
      }}
    ></div>
  );

  const [result] = createResource(() => others.photo, (photo) => {
    const middleware = createMiddleware().get();
    return wrapPhoto({
      ...others,
      photo,
      middleware,
      container: ref
    }).then(async(result) => {
      if(!middleware()) {
        return;
      }

      props.onResult?.(result);
      // await pause(1500);
      return result;
    });
  });

  return (
    <Show when={result.latest}>
      {ret}
    </Show>
  );
}
