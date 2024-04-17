import {getMiddleware} from '../middleware';
import {onCleanup} from 'solid-js';

export default function createMiddleware() {
  const middleware = getMiddleware();
  onCleanup(() => middleware.destroy());
  return middleware;
}
