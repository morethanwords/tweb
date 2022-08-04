import {logger} from '../lib/logger';
import dT from './dT';

export function recordPromise<T extends Promise<any>>(promise: T, description: string, log?: ReturnType<typeof logger> | Console) {
  const perf = performance.now();
  (log || console).warn(dT(), 'start', description);
  promise.then(() => {
    (log || console).warn(dT(), 'end', description, performance.now() - perf);
  });
  return promise;
}

export function recordPromiseBound(log: ReturnType<typeof logger> | Console) {
  return (...args: [Parameters<typeof recordPromise>[0], Parameters<typeof recordPromise>[1]]) => {
    return recordPromise(...args, log);
  };
}
