import {onCleanup} from 'solid-js';
import createMiddleware from './createMiddleware';

export default function createSolidMiddleware() {
  const middleware = createMiddleware();

  onCleanup(() => {
    middleware.destroy();
  });

  return middleware.get();
}
