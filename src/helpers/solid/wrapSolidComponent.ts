import {createRoot, JSX} from 'solid-js';
import {Middleware} from '@helpers/middleware';

export function unwrapSolidElement(element: JSX.Element): JSX.Element {
  while(typeof(element) === 'function') {
    element = (element as () => JSX.Element)();
  }

  return element;
}

export function wrapSolidComponent(component: () => JSX.Element, middleware: Middleware): HTMLElement {
  let dispose!: VoidFunction;
  const el = createRoot((dispose_) => {
    dispose = dispose_;
    return unwrapSolidElement(component());
  });

  middleware.onClean(dispose);

  return el as HTMLElement;
}

export function mountSolidComponent(
  component: (middleware: Middleware) => JSX.Element,
  parentMiddleware: Middleware
): {element: HTMLElement, dispose: VoidFunction, middleware: Middleware} {
  const middlewareHelper = parentMiddleware.create();
  const middleware = middlewareHelper.get();
  let disposed = false;
  const dispose = () => {
    if(disposed) {
      return;
    }

    disposed = true;
    middlewareHelper.destroy();
  };

  try {
    return {
      element: wrapSolidComponent(() => component(middleware), middleware),
      dispose,
      middleware
    };
  } catch(err) {
    dispose();
    throw err;
  }
}
