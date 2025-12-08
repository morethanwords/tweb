import createMiddleware from '../../helpers/solid/createMiddleware';
import wrapVideo from './video';
import {Ref, splitProps} from 'solid-js';

export default function VideoTsx(props: Omit<Parameters<typeof wrapVideo>[0], 'middleware'> & {
  class?: string
  ref?: Ref<HTMLElement>,
  onResult?: (result: Awaited<ReturnType<typeof wrapVideo>>) => void
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

  const middlewareHelper = createMiddleware();
  const middleware = middlewareHelper.get();
  wrapVideo({
    ...others,
    container: ref,
    middleware
  }).then((result) => {
    if(!middleware()) {
      return;
    }

    local.onResult?.(result);
  });

  return ret;
}
