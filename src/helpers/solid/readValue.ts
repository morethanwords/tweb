import type {Accessor} from 'solid-js';

export type ValueOrGetter<T> = T | Accessor<T>;

export default function readValue<T>(value: ValueOrGetter<T>) {
  return typeof(value) === 'function' ? (value as any)() : value;
}
