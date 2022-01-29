import {Awaited} from '../types';

export default function callbackify<T extends Awaited<any>, R extends any>(smth: T, callback: (result: Awaited<T>) => R): PromiseLike<R> | R {
  if(smth instanceof Promise) {
    return smth.then(callback);
  } else {
    return callback(smth as any);
  }
}
