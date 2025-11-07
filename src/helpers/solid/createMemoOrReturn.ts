import {Accessor, createMemo} from 'solid-js';

export type ValueOrGetter<T> = T | Accessor<T>;

export default function createMemoOrReturn<
  T extends ValueOrGetter<any>,
  R,
  V = T extends Accessor<infer V> ? V : T
>(
  valueOrGetter: T,
  callback: (value: V) => R
): T extends Accessor<any> ? Accessor<R> : R {
  return typeof(valueOrGetter) === 'function' ?
    // @ts-ignore
    createMemo(() => callback((valueOrGetter as Accessor<T>)())) :
    // @ts-ignore
    callback(valueOrGetter);
}
